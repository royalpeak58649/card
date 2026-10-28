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

/** 시장에 필요한 ligand 카드를 추가한다. */
const LIGAND_PILE_IDS = [
  'lg_offering',
  'lg_ritual',
  'lg_blessing',
  'lg_meteor',
  'lg_observatory',
  'lg_hone',
  'lg_masterSword',
  'lg_collection',
  'lg_starburst',
  'lg_pact',
  'lg_nebulaCoin',
];

/**
 * 시작된 게임과 선공/후공 인덱스.
 * characters 는 [선공 캐릭터, 후공 캐릭터] 로 지정한다(선공은 seed 로 정해진다).
 */
function startedGame(seed = 12345, characters = [null, null]) {
  const probe = createGame({
    seed,
    players: [{ id: 'a', name: 'a', maxHp: 1 }, { id: 'b', name: 'b', maxHp: 1 }],
  });
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
  for (const cardId of LIGAND_PILE_IDS) addMarketPile(game, cardId);
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

/** 차례가 상대에게 넘어갈 때까지 endPhase 한다. */
function passTurn(game, playerIndex) {
  while (game.activeIndex === playerIndex && game.phase !== 'gameOver') {
    applyAction(game, playerIndex, { type: 'endPhase' });
  }
}

/** 공격단계까지 넘긴다. */
function toAttack(game, playerIndex) {
  applyAction(game, playerIndex, { type: 'endPhase' }); // buy
  applyAction(game, playerIndex, { type: 'endPhase' }); // attack
}

test('진영 ligand: 카드 5장, 캐릭터 jace(55)·elena(52), 11장 모두 정의와 문구가 있다', () => {
  const faction = getFaction('ligand');
  assert.equal(faction.name, '리간드 왕국');
  assert.equal(faction.cardIds.length, 5);
  assert.deepEqual(faction.characterIds, ['jace', 'elena']);

  const jace = getCharacter('jace');
  assert.equal(jace.factionId, 'ligand');
  assert.equal(jace.maxHp, 55);
  assert.equal(jace.cardIds.length, 3);
  const elena = getCharacter('elena');
  assert.equal(elena.factionId, 'ligand');
  assert.equal(elena.maxHp, 52);
  assert.equal(elena.cardIds.length, 3);

  const allIds = [...faction.cardIds, ...jace.cardIds, ...elena.cardIds];
  assert.equal(allIds.length, 11);
  assert.equal(new Set(allIds).size, 11);
  for (const id of allIds) {
    assert.ok(id.startsWith('lg_'), id);
    const def = getCardDef(id);
    assert.equal(def.id, id);
    assert.equal(typeof def.text, 'string');
    assert.equal(typeof def.upgradedText, 'string');
    assert.ok(def.upgradedEffects, id);
  }
});

test('별빛 헌금: +1원, 별 +1', () => {
  const { game, first } = startedGame();
  const player = game.players[first];
  const [card] = setHand(game, first, ['lg_offering']);
  applyAction(game, first, { type: 'endPhase' }); // buy
  applyAction(game, first, { type: 'playCard', uid: card.uid });
  assert.equal(player.coins, 1);
  assert.equal(player.stars, 1);
});

test('성좌 의식: 별을 안 쓴 차례엔 카드를 뽑지 않고, 별을 쓴 뒤엔 +1 카드', () => {
  const { game, first } = startedGame();
  const player = game.players[first];
  const [ritual] = setHand(game, first, ['lg_ritual']);
  applyAction(game, first, { type: 'playCard', uid: ritual.uid });
  assert.equal(player.stars, 1);
  assert.equal(player.hand.length, 0);

  // 일시 강화로 별 1개를 쓴 뒤에는 +1 카드
  const { game: game2, first: first2 } = startedGame();
  const player2 = game2.players[first2];
  player2.stars = 1;
  const [ritual2, target] = setHand(game2, first2, ['lg_ritual', 'lg_offering']);
  applyAction(game2, first2, { type: 'upgrade', uid: target.uid, mode: 'temp' });
  assert.equal(game2.turnState.starsSpent, 1);
  const handBefore = player2.hand.length;
  applyAction(game2, first2, { type: 'playCard', uid: ritual2.uid });
  // 1장 내고 1장 뽑아 손패는 그대로
  assert.equal(player2.hand.length, handBefore);
});

test('별의 축복: 기본 카드는 고를 수 없고, 고른 카드만 일시 강화된다', () => {
  const { game, first } = startedGame();
  const player = game.players[first];
  player.stars = 2;
  const [bless, target, stone] = setHand(game, first, ['lg_blessing', 'lg_offering', 'stone']);
  applyAction(game, first, { type: 'playCard', uid: bless.uid });
  assert.ok(game.pending);
  assert.equal(game.pending.kind, 'freeUpgrade');
  assert.deepEqual(game.pending.options, [target.uid]);
  assert.equal(game.pending.options.includes(stone.uid), false);
  applyAction(game, first, { type: 'choose', selection: [target.uid] });
  assert.equal(target.upgraded, true);
  assert.equal(target.tempUpgraded, true);
  assert.equal(player.stars, 2);
  assert.equal(game.turnState.starsSpent, 0);
});

test('유성 낙하: pay 면 5 피해, skip 이면 2 피해', () => {
  const { game, first, second } = startedGame();
  const player = game.players[first];
  player.stars = 1;
  const [meteor] = setHand(game, first, ['lg_meteor']);
  toAttack(game, first);
  applyAction(game, first, { type: 'playCard', uid: meteor.uid });
  assert.ok(game.pending);
  assert.equal(game.pending.kind, 'payStars');
  applyAction(game, first, { type: 'choose', selection: ['pay'] });
  assert.equal(player.stars, 0);
  applyAction(game, first, { type: 'endPhase' }); // 공격 해결
  assert.equal(game.players[second].hp, 20 - 5);

  const { game: game2, first: first2, second: second2 } = startedGame();
  game2.players[first2].stars = 1;
  const [meteor2] = setHand(game2, first2, ['lg_meteor']);
  toAttack(game2, first2);
  applyAction(game2, first2, { type: 'playCard', uid: meteor2.uid });
  applyAction(game2, first2, { type: 'choose', selection: ['skip'] });
  applyAction(game2, first2, { type: 'endPhase' }); // 공격 해결
  assert.equal(game2.players[second2].hp, 20 - 2);
});

test('왕실 천문대: 별 2개를 쓴 차례에 +2원, +2 카드', () => {
  const { game, first } = startedGame();
  const player = game.players[first];
  player.stars = 2;
  const [obs, up1, up2] = setHand(game, first, ['lg_observatory', 'lg_offering', 'lg_offering']);
  applyAction(game, first, { type: 'upgrade', uid: up1.uid, mode: 'temp' });
  applyAction(game, first, { type: 'upgrade', uid: up2.uid, mode: 'temp' });
  assert.equal(game.turnState.starsSpent, 2);
  const handBefore = player.hand.length;
  applyAction(game, first, { type: 'playCard', uid: obs.uid });
  assert.equal(player.coins, 2);
  // 1장 내고 2장 뽑아 손패는 +1
  assert.equal(player.hand.length, handBefore + 1);
});

test('제이스: 별 3개로 영구 강화, 장인의 검은 영구 강화 카드 수만큼 세진다', () => {
  const { game, first, second } = startedGame(12345, ['jace', null]);
  const player = game.players[first];
  player.stars = 3;
  const [card] = setHand(game, first, ['lg_offering']);
  applyAction(game, first, { type: 'upgrade', uid: card.uid, mode: 'perm' });
  assert.equal(player.stars, 0);
  assert.equal(card.upgraded, true);
  assert.equal(card.tempUpgraded, undefined);

  // 영구 강화 카드 2장 보유 → 2 + 2 = 4 피해
  const { game: game2, first: first2, second: second2 } = startedGame(12345, ['jace', null]);
  const player2 = game2.players[first2];
  for (let i = 0; i < 2; i++) {
    const perm = createCardInstance(game2, 'lg_offering');
    perm.upgraded = true;
    player2.discard.push(perm);
  }
  const [sword] = setHand(game2, first2, ['lg_masterSword']);
  toAttack(game2, first2);
  applyAction(game2, first2, { type: 'playCard', uid: sword.uid });
  applyAction(game2, first2, { type: 'endPhase' }); // 공격 해결
  assert.equal(game2.players[second2].hp, 20 - 4);
  assert.equal(game.players[second].hp, 20);
});

test('명품 컬렉션: 강화된 카드 2장을 낸 뒤 +4원', () => {
  const { game, first } = startedGame(12345, ['jace', null]);
  const player = game.players[first];
  player.stars = 2;
  const [up1, up2] = setHand(game, first, ['lg_offering', 'lg_offering']);
  applyAction(game, first, { type: 'upgrade', uid: up1.uid, mode: 'temp' });
  applyAction(game, first, { type: 'upgrade', uid: up2.uid, mode: 'temp' });
  applyAction(game, first, { type: 'endPhase' }); // buy
  applyAction(game, first, { type: 'playCard', uid: up1.uid });
  applyAction(game, first, { type: 'playCard', uid: up2.uid });
  assert.equal(game.turnState.upgradedPlayed, 2);
  const coinsBefore = player.coins;
  const [collection] = setHand(game, first, ['lg_collection']);
  applyAction(game, first, { type: 'playCard', uid: collection.uid });
  // +2원 + 강화 카드 2장 × 1원
  assert.equal(player.coins, coinsBefore + 4);
});

test('엘레나: 별 3개를 쓴 차례 끝 별 +1, 성광 폭발은 별 2개에 +4 피해', () => {
  const { game, first } = startedGame(12345, ['elena', null]);
  const player = game.players[first];
  player.stars = 5;
  const cards = setHand(game, first, ['lg_offering', 'lg_offering', 'lg_offering']);
  for (const card of cards) {
    applyAction(game, first, { type: 'upgrade', uid: card.uid, mode: 'temp' });
  }
  assert.equal(game.turnState.starsSpent, 3);
  assert.equal(player.stars, 2);
  passTurn(game, first);
  assert.equal(player.stars, 3);

  // 성광 폭발: 별 2개 → +4 피해
  const { game: game2, first: first2, second: second2 } = startedGame(12345, ['elena', null]);
  const player2 = game2.players[first2];
  player2.stars = 2;
  const [burst, up1, up2] = setHand(game2, first2, [
    'lg_starburst',
    'lg_offering',
    'lg_offering',
  ]);
  applyAction(game2, first2, { type: 'upgrade', uid: up1.uid, mode: 'temp' });
  applyAction(game2, first2, { type: 'upgrade', uid: up2.uid, mode: 'temp' });
  applyAction(game2, first2, { type: 'playCard', uid: burst.uid });
  toAttack(game2, first2);
  applyAction(game2, first2, { type: 'endPhase' }); // 공격 해결
  assert.equal(game2.players[second2].hp, 20 - 4);
});

test('별의 계약: pay 면 +2 카드 +1 행동력, 별 -1', () => {
  const { game, first } = startedGame(12345, ['elena', null]);
  const player = game.players[first];
  player.stars = 2;
  const [pact] = setHand(game, first, ['lg_pact']);
  applyAction(game, first, { type: 'playCard', uid: pact.uid });
  assert.ok(game.pending);
  assert.equal(game.pending.kind, 'payStars');
  applyAction(game, first, { type: 'choose', selection: ['pay'] });
  assert.equal(player.stars, 1);
  assert.equal(game.turnState.starsSpent, 1);
  assert.equal(player.hand.length, 2);
  assert.equal(player.actions, 2);
});

test('성운 금화: 별 3개를 쓴 뒤 +4원', () => {
  const { game, first } = startedGame(12345, ['elena', null]);
  const player = game.players[first];
  player.stars = 3;
  const cards = setHand(game, first, ['lg_offering', 'lg_offering', 'lg_offering']);
  for (const card of cards) {
    applyAction(game, first, { type: 'upgrade', uid: card.uid, mode: 'temp' });
  }
  assert.equal(game.turnState.starsSpent, 3);
  applyAction(game, first, { type: 'endPhase' }); // buy
  const [coin] = setHand(game, first, ['lg_nebulaCoin']);
  applyAction(game, first, { type: 'playCard', uid: coin.uid });
  // +1원 + 별 3개 × 1원
  assert.equal(player.coins, 4);
});
