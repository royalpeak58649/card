import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createGame,
  createCardInstance,
  addMarketPile,
  startGame,
  applyAction,
  getFaction,
  getCharacter,
  getCardDef,
} from '../engine/index.js';

/** 시장에 필요한 neuro 카드를 추가한다. */
const NEURO_PILE_IDS = [
  'nu_synapse',
  'nu_sync',
  'nu_overload',
  'nu_recursion',
  'nu_emp',
  'nu_barrage',
  'nu_runaway',
  'nu_chain',
  'nu_thought',
  'nu_brainwave',
  'nu_resonance',
];

/**
 * 시작된 게임과 선공/후공 인덱스.
 * characters 는 [선공 캐릭터, 후공 캐릭터] 로 지정한다(선공은 seed 로 정해진다).
 */
function startedGame(seed = 12345, characters = [null, null]) {
  const probe = createGame({ seed, players: [{ id: 'a', name: 'a', maxHp: 1 }, { id: 'b', name: 'b', maxHp: 1 }] });
  const firstIndex = probe.firstPlayerIndex;
  const game = createGame({
    seed,
    players: [0, 1].map((i) => ({
      id: 'p' + i,
      name: '플레이어' + i,
      maxHp: 20,
      characterId: characters[i === firstIndex ? 0 : 1] ?? null,
    })),
  });
  for (const cardId of NEURO_PILE_IDS) addMarketPile(game, cardId);
  startGame(game);
  const first = game.activeIndex;
  return { game, first, second: 1 - first };
}

/** 손패를 지정한 카드 id 목록으로 교체한다(나머지는 drawPile 로). */
function setHand(game, playerIndex, cardIds) {
  const player = game.players[playerIndex];
  player.drawPile.push(...player.hand);
  player.hand = cardIds.map((id) => createCardInstance(game, id));
  return player.hand;
}

/** 버린 더미를 지정한 카드 id 목록으로 교체한다. */
function setDiscard(game, playerIndex, cardIds) {
  const player = game.players[playerIndex];
  player.discard = cardIds.map((id) => createCardInstance(game, id));
  return player.discard;
}

/** 손패에 카드를 한 장 더 넣는다. */
function addToHand(game, playerIndex, cardId) {
  const card = createCardInstance(game, cardId);
  game.players[playerIndex].hand.push(card);
  return card;
}

/** 차례가 상대에게 넘어갈 때까지 endPhase 한다. */
function passTurn(game, playerIndex) {
  while (game.activeIndex === playerIndex && game.phase !== 'gameOver') {
    applyAction(game, playerIndex, { type: 'endPhase' });
  }
}

/** 손패의 카드를 모두 낸다. */
function playAll(game, playerIndex) {
  for (const card of [...game.players[playerIndex].hand]) {
    applyAction(game, playerIndex, { type: 'playCard', uid: card.uid });
  }
}

/** 공격단계를 끝내고 피해를 적용한다. */
function resolveAttackNow(game, playerIndex) {
  applyAction(game, playerIndex, { type: 'endPhase' }); // buy
  applyAction(game, playerIndex, { type: 'endPhase' }); // attack
  applyAction(game, playerIndex, { type: 'endPhase' }); // 공격 해결
}

test('진영 neuro: 카드 5장, 캐릭터 2명, 11장 모두 정의와 문구가 있다', () => {
  const faction = getFaction('neuro');
  assert.equal(faction.name, '뉴로 연합');
  assert.equal(faction.cardIds.length, 5);
  assert.deepEqual(faction.characterIds, ['jin', 'gemini', 'echo']);

  const jin = getCharacter('jin');
  assert.equal(jin.factionId, 'neuro');
  assert.equal(jin.maxHp, 54);
  assert.equal(jin.cardIds.length, 3);
  const gemini = getCharacter('gemini');
  assert.equal(gemini.factionId, 'neuro');
  assert.equal(gemini.maxHp, 50);
  assert.equal(gemini.cardIds.length, 3);

  const allIds = [...faction.cardIds, ...jin.cardIds, ...gemini.cardIds];
  assert.equal(allIds.length, 11);
  assert.equal(new Set(allIds).size, 11);
  for (const id of allIds) {
    assert.ok(id.startsWith('nu_'), id);
    const def = getCardDef(id);
    assert.equal(def.id, id);
    assert.equal(def.type, 'action');
    assert.equal(typeof def.text, 'string');
    assert.equal(typeof def.upgradedText, 'string');
    assert.ok(def.upgradedEffects, id);
  }
});

test('시냅스 점화: +1 행동력, +1 카드 / 강화판은 +2 행동력', () => {
  const { game, first } = startedGame();
  const player = game.players[first];
  const [card] = setHand(game, first, ['nu_synapse']);
  applyAction(game, first, { type: 'playCard', uid: card.uid });
  assert.equal(player.actions, 2);
  assert.equal(player.hand.length, 1);

  const { game: g2, first: f2 } = startedGame();
  const p2 = g2.players[f2];
  const [up] = setHand(g2, f2, ['nu_synapse']);
  up.upgraded = true;
  applyAction(g2, f2, { type: 'playCard', uid: up.uid });
  assert.equal(p2.actions, 3);
  assert.equal(p2.hand.length, 1);
});

test('신경망 동기화: 3번째 행동카드로 내면 +1 행동력, 첫 번째로 내면 없음', () => {
  const { game, first } = startedGame();
  const player = game.players[first];
  setHand(game, first, ['nu_synapse', 'nu_synapse', 'nu_sync']);
  playAll(game, first);
  assert.equal(game.turnState.actionsPlayed, 3);
  // 1 + 1 + 1 - 1(비용) + 1(조건) = 3
  assert.equal(player.actions, 3);

  const { game: g2, first: f2 } = startedGame();
  const p2 = g2.players[f2];
  const [sync] = setHand(g2, f2, ['nu_sync']);
  applyAction(g2, f2, { type: 'playCard', uid: sync.uid });
  assert.equal(g2.turnState.actionsPlayed, 1);
  assert.equal(p2.actions, 0);
});

test('과부하: 행동카드 수만큼 원, 최대 4 / 강화판 최대 6', () => {
  const { game, first } = startedGame();
  const player = game.players[first];
  setHand(game, first, ['nu_synapse', 'nu_synapse', 'nu_synapse', 'nu_overload']);
  playAll(game, first);
  assert.equal(game.turnState.actionsPlayed, 4);
  assert.equal(player.coins, 4);

  const { game: g2, first: f2 } = startedGame();
  const p2 = g2.players[f2];
  setHand(g2, f2, ['nu_synapse', 'nu_synapse', 'nu_synapse', 'nu_synapse', 'nu_synapse']);
  playAll(g2, f2);
  const overload = addToHand(g2, f2, 'nu_overload');
  applyAction(g2, f2, { type: 'playCard', uid: overload.uid });
  assert.equal(g2.turnState.actionsPlayed, 6);
  assert.equal(p2.coins, 4);

  const { game: g3, first: f3 } = startedGame();
  const p3 = g3.players[f3];
  setHand(g3, f3, ['nu_synapse', 'nu_synapse', 'nu_synapse', 'nu_synapse', 'nu_synapse']);
  playAll(g3, f3);
  const up = addToHand(g3, f3, 'nu_overload');
  up.upgraded = true;
  applyAction(g3, f3, { type: 'playCard', uid: up.uid });
  assert.equal(g3.turnState.actionsPlayed, 6);
  assert.equal(p3.coins, 6);
});

test('재귀 호출: 버린 더미의 행동카드만 선택지, 고르면 손으로', () => {
  const { game, first } = startedGame();
  const player = game.players[first];
  const [card] = setHand(game, first, ['nu_recursion']);
  const discard = setDiscard(game, first, ['nu_synapse', 'pistol']);
  const actionCard = discard.find((c) => c.cardId === 'nu_synapse');

  applyAction(game, first, { type: 'playCard', uid: card.uid });
  assert.equal(player.actions, 1);
  assert.ok(game.pending);
  assert.deepEqual(game.pending.options, [actionCard.uid]);

  applyAction(game, first, { type: 'choose', selection: [actionCard.uid] });
  assert.equal(game.pending, null);
  assert.ok(player.hand.some((c) => c.uid === actionCard.uid));
  assert.ok(!player.discard.some((c) => c.uid === actionCard.uid));
});

test('전자기 펄스: 4번째 행동카드로 내면 4 피해, 첫 번째면 2 피해', () => {
  const { game, first, second } = startedGame();
  setHand(game, first, ['nu_synapse', 'nu_synapse', 'nu_synapse', 'nu_emp']);
  playAll(game, first);
  assert.equal(game.turnState.actionsPlayed, 4);
  resolveAttackNow(game, first);
  assert.equal(game.players[second].hp, 20 - 4);

  const { game: g2, first: f2, second: s2 } = startedGame();
  const [emp] = setHand(g2, f2, ['nu_emp']);
  applyAction(g2, f2, { type: 'playCard', uid: emp.uid });
  assert.equal(g2.turnState.actionsPlayed, 1);
  resolveAttackNow(g2, f2);
  assert.equal(g2.players[s2].hp, 20 - 2);
});

test('난사 프로토콜: 행동력 +3 / 폭주 연산: 4번째로 내면 +2 카드', () => {
  const { game, first } = startedGame();
  const player = game.players[first];
  const [barrage] = setHand(game, first, ['nu_barrage']);
  applyAction(game, first, { type: 'playCard', uid: barrage.uid });
  assert.equal(player.actions, 3);

  const { game: g2, first: f2 } = startedGame();
  const p2 = g2.players[f2];
  setHand(g2, f2, ['nu_synapse', 'nu_synapse', 'nu_synapse', 'nu_runaway']);
  playAll(g2, f2);
  assert.equal(g2.turnState.actionsPlayed, 4);
  // 시냅스 점화 3장이 1장씩 뽑고(3) 폭주 연산이 +2 카드(조건 충족)
  assert.equal(p2.hand.length, 3 + 2);

  // 3번째로 내면 조건(4장 이상) 불충족
  const { game: g3, first: f3 } = startedGame();
  const p3 = g3.players[f3];
  setHand(g3, f3, ['nu_synapse', 'nu_synapse', 'nu_runaway']);
  playAll(g3, f3);
  assert.equal(g3.turnState.actionsPlayed, 3);
  // 시냅스 점화 2장이 뽑은 2장만 남고 폭주 연산의 +2 카드는 없음
  assert.equal(p3.hand.length, 2);
});

test('연쇄 반응: 행동카드 3장이면 별 +1, 6장이면 +2', () => {
  const { game, first } = startedGame();
  const player = game.players[first];
  player.stars = 0;
  setHand(game, first, ['nu_chain', 'nu_synapse', 'nu_synapse']);
  playAll(game, first);
  assert.equal(game.turnState.actionsPlayed, 3);
  passTurn(game, first);
  assert.equal(player.stars, 1);

  const { game: g2, first: f2 } = startedGame();
  const p2 = g2.players[f2];
  p2.stars = 0;
  setHand(g2, f2, ['nu_chain', 'nu_synapse', 'nu_synapse', 'nu_synapse', 'nu_synapse']);
  playAll(g2, f2);
  const sixth = addToHand(g2, f2, 'nu_synapse');
  applyAction(g2, f2, { type: 'playCard', uid: sixth.uid });
  assert.equal(g2.turnState.actionsPlayed, 6);
  passTurn(g2, f2);
  assert.equal(p2.stars, 2);
});

test('진 패시브: 상대가 6번째 행동카드를 내면 진 별 +1', () => {
  const { game, first, second } = startedGame(12345, [null, 'jin']);
  const jin = game.players[second];
  jin.stars = 0;
  setHand(game, first, ['nu_synapse', 'nu_synapse', 'nu_synapse', 'nu_synapse', 'nu_synapse']);
  playAll(game, first);
  assert.equal(game.turnState.actionsPlayed, 5);
  assert.equal(jin.stars, 0);

  const sixth = addToHand(game, first, 'nu_synapse');
  applyAction(game, first, { type: 'playCard', uid: sixth.uid });
  assert.equal(game.turnState.actionsPlayed, 6);
  assert.equal(jin.stars, 1);
});

test('제미니아노: 발동 뒤 피해 행동카드가 +2, 공명도 +2 를 받는다', () => {
  const { game, first, second } = startedGame(12345, ['gemini', null]);
  const gemi = game.players[first];
  applyAction(game, first, { type: 'activateAbility' });
  assert.equal(gemi.abilityUsed, true);

  const thought = addToHand(game, first, 'nu_thought');
  applyAction(game, first, { type: 'playCard', uid: thought.uid });
  // 1 + 2 = 3
  assert.equal(game.turnState.attackDamage, 3);

  const brainwave = addToHand(game, first, 'nu_brainwave');
  applyAction(game, first, { type: 'playCard', uid: brainwave.uid });
  // 3 + (3 + 2) = 8
  assert.equal(game.turnState.attackDamage, 8);

  const { game: g2, first: f2, second: s2 } = startedGame(12345, ['gemini', null]);
  applyAction(g2, f2, { type: 'activateAbility' });
  setHand(g2, f2, ['nu_thought', 'nu_brainwave', 'nu_resonance']);
  playAll(g2, f2);
  assert.equal(g2.turnState.actionsPlayed, 3);
  resolveAttackNow(g2, f2);
  // 사고 전파 1+2, 뇌파 공격 3+2, 공명 0+2 + perAction 1 × 3 = 3 → 3 + 5 + 5 = 13
  assert.equal(g2.players[s2].hp, 20 - 13);
});

test('사고 전파 + 뇌파 공격(발동 없이) → 4 피해', () => {
  const { game, first, second } = startedGame(12345, ['gemini', null]);
  setHand(game, first, ['nu_thought', 'nu_brainwave']);
  playAll(game, first);
  resolveAttackNow(game, first);
  assert.equal(game.players[second].hp, 20 - 4);
});
