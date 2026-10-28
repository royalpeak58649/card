import test from 'node:test';
import assert from 'node:assert/strict';

import { createGame, createCardInstance } from '../engine/state.js';
import { registerCards } from '../engine/cards/registry.js';
import { registerFactions, registerCharacters } from '../engine/characters.js';
import { startGame, applyAction } from '../engine/turn.js';

registerFactions({
  test_ab_faction: {
    id: 'test_ab_faction',
    name: '테스트',
    cardIds: [],
    characterIds: ['test_ab_jin', 'test_ab_gemi'],
  },
});

registerCharacters({
  test_ab_jin: {
    id: 'test_ab_jin',
    name: '진',
    factionId: 'test_ab_faction',
    maxHp: 30,
    cardIds: [],
    ability: { opponentActionStar: { threshold: 6, stars: 1 } },
    abilityText: '',
  },
  test_ab_gemi: {
    id: 'test_ab_gemi',
    name: '제미니',
    factionId: 'test_ab_faction',
    maxHp: 30,
    cardIds: [],
    ability: {
      activeAbility: {
        oncePerGame: true,
        effects: [{ op: 'addMod', key: 'actionDamageBonus', n: 2 }],
        text: '',
      },
    },
    abilityText: '',
  },
});

registerCards({
  test_ab_free: {
    id: 'test_ab_free',
    name: '테스트 프리',
    type: 'action',
    actionCost: 0,
    cost: 1,
    effects: [{ op: 'gainActions', n: 1 }],
  },
  test_ab_hit: {
    id: 'test_ab_hit',
    name: '테스트 타격',
    type: 'action',
    actionCost: 0,
    cost: 1,
    dealsDamage: true,
    effects: [{ op: 'damage', n: 1 }],
  },
  test_ab_cond: {
    id: 'test_ab_cond',
    name: '테스트 조건',
    type: 'action',
    actionCost: 0,
    cost: 1,
    effects: [
      { op: 'if', cond: { stat: 'actionsPlayed', gte: 2 }, then: [{ op: 'gainCoins', n: 5 }] },
    ],
  },
  test_ab_overload: {
    id: 'test_ab_overload',
    name: '테스트 과부하',
    type: 'action',
    actionCost: 0,
    cost: 1,
    effects: [{ op: 'gainCoinsPerStat', stat: 'actionsPlayed', per: 1, max: 3 }],
  },
  test_ab_resonance: {
    id: 'test_ab_resonance',
    name: '테스트 공명',
    type: 'action',
    actionCost: 0,
    cost: 1,
    effects: [{ op: 'addAttackBonus', perAction: 1, cap: 4 }],
  },
  test_ab_resonance2: {
    id: 'test_ab_resonance2',
    name: '테스트 공명(상한 없음)',
    type: 'action',
    actionCost: 0,
    cost: 1,
    effects: [{ op: 'addAttackBonus', perAction: 1 }],
  },
});

const PLAYERS = [
  { id: 'p0', name: '플레이어0', maxHp: 20 },
  { id: 'p1', name: '플레이어1', maxHp: 20 },
];

/**
 * 시작된 게임과 선공/후공 인덱스.
 * characters 는 [선공 캐릭터, 후공 캐릭터] 로 지정한다(선공은 seed 로 정해진다).
 */
function startedGame(seed = 12345, characters = [null, null]) {
  const probe = createGame({ seed, players: PLAYERS.map((p) => ({ ...p })) });
  const firstIndex = probe.firstPlayerIndex;
  const game = createGame({
    seed,
    players: PLAYERS.map((p, i) => ({
      ...p,
      characterId: characters[i === firstIndex ? 0 : 1] ?? null,
    })),
  });
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

/** 손패에 카드를 한 장 더 넣는다. */
function addToHand(game, playerIndex, cardId) {
  const card = createCardInstance(game, cardId);
  game.players[playerIndex].hand.push(card);
  return card;
}

/** 현재 플레이어가 3번 endPhase 해서 상대 차례로 넘긴다. */
function passTurn(game, playerIndex) {
  applyAction(game, playerIndex, { type: 'endPhase' });
  applyAction(game, playerIndex, { type: 'endPhase' });
  applyAction(game, playerIndex, { type: 'endPhase' });
}

/** 손패의 카드를 모두 낸다. */
function playAll(game, playerIndex) {
  for (const card of [...game.players[playerIndex].hand]) {
    applyAction(game, playerIndex, { type: 'playCard', uid: card.uid });
  }
}

test('행동카드 수는 효과 실행 전에 세어진다(조건 카드)', () => {
  const { game, first } = startedGame();
  const player = game.players[first];
  const [cond] = setHand(game, first, ['test_ab_cond']);

  // 첫 행동카드: actionsPlayed 가 1 이므로 조건 불충족
  applyAction(game, first, { type: 'playCard', uid: cond.uid });
  assert.equal(game.turnState.actionsPlayed, 1);
  assert.equal(player.coins, 0);

  // 두 번째 행동카드: 방금 낸 카드까지 세어 2 가 된다
  const second = addToHand(game, first, 'test_ab_cond');
  applyAction(game, first, { type: 'playCard', uid: second.uid });
  assert.equal(game.turnState.actionsPlayed, 2);
  assert.equal(player.coins, 5);
});

test('gainCoinsPerStat: 행동카드 수에 비례하고 max 로 제한된다', () => {
  const { game, first } = startedGame();
  const player = game.players[first];
  setHand(game, first, ['test_ab_free', 'test_ab_free', 'test_ab_overload']);
  playAll(game, first);
  assert.equal(game.turnState.actionsPlayed, 3);
  assert.equal(player.coins, 3);

  const { game: game2, first: first2 } = startedGame();
  const player2 = game2.players[first2];
  setHand(game2, first2, [
    'test_ab_free',
    'test_ab_free',
    'test_ab_free',
    'test_ab_free',
    'test_ab_overload',
  ]);
  playAll(game2, first2);
  assert.equal(game2.turnState.actionsPlayed, 5);
  assert.equal(player2.coins, 3);
});

test('addAttackBonus perAction: 행동카드 수만큼 공격이 세진다', () => {
  const { game, first, second } = startedGame();
  setHand(game, first, ['test_ab_resonance', 'test_ab_free', 'test_ab_free', 'test_ab_free', 'test_ab_free']);
  playAll(game, first);
  const sixth = addToHand(game, first, 'test_ab_free');
  applyAction(game, first, { type: 'playCard', uid: sixth.uid });
  assert.equal(game.turnState.actionsPlayed, 6);
  applyAction(game, first, { type: 'endPhase' }); // buy
  applyAction(game, first, { type: 'endPhase' }); // attack
  applyAction(game, first, { type: 'endPhase' }); // 공격 해결
  // perAction 1 × 행동카드 6장 = 6, 상한 4
  assert.equal(game.players[second].hp, 20 - 4);

  const { game: game2, first: first2, second: second2 } = startedGame();
  setHand(game2, first2, ['test_ab_resonance2', 'test_ab_free', 'test_ab_free', 'test_ab_free', 'test_ab_free']);
  playAll(game2, first2);
  const sixth2 = addToHand(game2, first2, 'test_ab_free');
  applyAction(game2, first2, { type: 'playCard', uid: sixth2.uid });
  assert.equal(game2.turnState.actionsPlayed, 6);
  applyAction(game2, first2, { type: 'endPhase' }); // buy
  applyAction(game2, first2, { type: 'endPhase' }); // attack
  applyAction(game2, first2, { type: 'endPhase' });
  // perAction 1 × 6 = 6 (상한 없음)
  assert.equal(game2.players[second2].hp, 20 - 6);
});

test('opponentActionStar: 상대가 6번째 행동카드를 내면 별 1, 한 차례 한 번', () => {
  const { game, first, second } = startedGame(12345, [null, 'test_ab_jin']);
  const jin = game.players[second];
  setHand(game, first, [
    'test_ab_free',
    'test_ab_free',
    'test_ab_free',
    'test_ab_free',
    'test_ab_free',
  ]);
  const cards = [...game.players[first].hand];
  for (const card of cards.slice(0, 5)) {
    applyAction(game, first, { type: 'playCard', uid: card.uid });
  }
  assert.equal(game.turnState.actionsPlayed, 5);
  assert.equal(jin.stars, 0);

  const sixth = addToHand(game, first, 'test_ab_free');
  applyAction(game, first, { type: 'playCard', uid: sixth.uid });
  assert.equal(game.turnState.actionsPlayed, 6);
  assert.equal(jin.stars, 1);
  assert.equal(game.turnState.opponentStarGiven, true);

  const seventh = addToHand(game, first, 'test_ab_free');
  applyAction(game, first, { type: 'playCard', uid: seventh.uid });
  assert.equal(game.turnState.actionsPlayed, 7);
  assert.equal(jin.stars, 1);
});

test('opponentActionStar: 진 자신이 6장을 내도 별을 얻지 않는다', () => {
  const { game, first, second } = startedGame(12345, ['test_ab_jin', null]);
  const jin = game.players[first];
  setHand(game, first, [
    'test_ab_free',
    'test_ab_free',
    'test_ab_free',
    'test_ab_free',
    'test_ab_free',
  ]);
  const cards = [...game.players[first].hand];
  for (const card of cards) {
    applyAction(game, first, { type: 'playCard', uid: card.uid });
  }
  const sixth = addToHand(game, first, 'test_ab_free');
  applyAction(game, first, { type: 'playCard', uid: sixth.uid });
  assert.equal(game.turnState.actionsPlayed, 6);
  assert.equal(jin.stars, 0);
  assert.equal(game.players[second].stars, 0);
  assert.equal(game.turnState.opponentStarGiven, false);
});

test('activeAbility: 발동 뒤 피해 행동카드가 +2, 한 게임에 한 번', () => {
  const { game, first, second } = startedGame(12345, ['test_ab_gemi', null]);
  const gemi = game.players[first];
  assert.equal(gemi.abilityUsed, false);

  // 발동 전에 낸 타격은 보너스가 없다
  const before = addToHand(game, first, 'test_ab_hit');
  applyAction(game, first, { type: 'playCard', uid: before.uid });
  assert.equal(game.turnState.attackDamage, 1);

  applyAction(game, first, { type: 'activateAbility' });
  assert.equal(gemi.abilityUsed, true);
  assert.equal(game.turnState.mods.actionDamageBonus, 2);

  const hit1 = addToHand(game, first, 'test_ab_hit');
  const hit2 = addToHand(game, first, 'test_ab_hit');
  applyAction(game, first, { type: 'playCard', uid: hit1.uid });
  applyAction(game, first, { type: 'playCard', uid: hit2.uid });
  // 1 + (1+2) + (1+2) = 7
  assert.equal(game.turnState.attackDamage, 7);

  applyAction(game, first, { type: 'endPhase' }); // buy
  applyAction(game, first, { type: 'endPhase' }); // attack
  applyAction(game, first, { type: 'endPhase' }); // 공격 해결
  assert.equal(game.players[second].hp, 20 - 7);

  // 다음 차례엔 보너스가 없다
  assert.equal(game.activeIndex, second);
  passTurn(game, second);
  assert.equal(game.activeIndex, first);
  assert.equal(game.turnState.mods.actionDamageBonus, 0);
  const hit3 = addToHand(game, first, 'test_ab_hit');
  applyAction(game, first, { type: 'playCard', uid: hit3.uid });
  assert.equal(game.turnState.attackDamage, 1);

  // 두 번째 발동은 Error
  assert.throws(() => applyAction(game, first, { type: 'activateAbility' }), Error);
});

test('activeAbility: 능력이 없거나 캐릭터가 없거나 상대 차례면 Error', () => {
  // 능력 없는 캐릭터(진)
  const { game, first } = startedGame(12345, ['test_ab_jin', null]);
  assert.throws(() => applyAction(game, first, { type: 'activateAbility' }), Error);
  assert.equal(game.players[first].abilityUsed, false);

  // 캐릭터 없음
  const { game: game2, first: first2 } = startedGame();
  assert.throws(() => applyAction(game2, first2, { type: 'activateAbility' }), Error);

  // 상대 차례
  const { game: game3, first: first3, second: second3 } = startedGame(12345, ['test_ab_gemi', null]);
  assert.throws(() => applyAction(game3, second3, { type: 'activateAbility' }), Error);
  assert.equal(game3.players[first3].abilityUsed, false);
});

test('능력·패시브를 쓴 뒤에도 JSON 왕복이 같다', () => {
  const { game, first } = startedGame(12345, ['test_ab_gemi', 'test_ab_jin']);
  setHand(game, first, ['test_ab_hit', 'test_ab_free', 'test_ab_overload', 'test_ab_cond', 'test_ab_resonance']);
  applyAction(game, first, { type: 'activateAbility' });
  playAll(game, first);
  applyAction(game, first, { type: 'endPhase' }); // buy
  applyAction(game, first, { type: 'endPhase' }); // attack
  applyAction(game, first, { type: 'endPhase' }); // 공격 해결 + 차례 끝
  assert.deepStrictEqual(JSON.parse(JSON.stringify(game)), game);
});
