import test from 'node:test';
import assert from 'node:assert/strict';

import { createGame, createCardInstance } from '../engine/state.js';
import { registerCards } from '../engine/cards/registry.js';
import { registerFactions, registerCharacters } from '../engine/characters.js';
import { getStat } from '../engine/conditions.js';
import { startGame, applyAction } from '../engine/turn.js';

registerFactions({
  test_st2_faction: {
    id: 'test_st2_faction',
    name: '테스트 별2',
    cardIds: [],
    characterIds: ['test_st2_jace', 'test_st2_elena'],
  },
});

registerCharacters({
  test_st2_jace: {
    id: 'test_st2_jace',
    name: '제이스',
    factionId: 'test_st2_faction',
    maxHp: 30,
    cardIds: [],
    ability: { permUpgradeCost: 3 },
    abilityText: '',
  },
  test_st2_elena: {
    id: 'test_st2_elena',
    name: '엘레나',
    factionId: 'test_st2_faction',
    maxHp: 30,
    cardIds: [],
    ability: {
      endTriggers: [
        { cond: { stat: 'starsSpent', gte: 3 }, effects: [{ op: 'gainStars', n: 1 }] },
      ],
    },
    abilityText: '',
  },
});

registerCards({
  test_st2_up: {
    id: 'test_st2_up',
    name: '테스트 강화 대상',
    type: 'action',
    actionCost: 0,
    cost: 1,
    effects: [{ op: 'gainCoins', n: 1 }],
    upgradedEffects: [{ op: 'gainCoins', n: 3 }],
  },
  test_st2_bless: {
    id: 'test_st2_bless',
    name: '테스트 축복',
    type: 'action',
    actionCost: 0,
    cost: 1,
    effects: [{ op: 'freeUpgrade', n: 1 }],
  },
  test_st2_meteor: {
    id: 'test_st2_meteor',
    name: '테스트 유성',
    type: 'weapon',
    cost: 1,
    effects: [
      { op: 'damage', n: 2 },
      { op: 'payStars', n: 1, then: [{ op: 'damage', n: 3 }] },
    ],
  },
  test_st2_burst: {
    id: 'test_st2_burst',
    name: '테스트 폭발',
    type: 'action',
    actionCost: 0,
    cost: 1,
    effects: [{ op: 'addAttackBonus', perStat: { stat: 'starsSpent', per: 2 }, cap: 8 }],
  },
  test_st2_coin: {
    id: 'test_st2_coin',
    name: '테스트 동전',
    type: 'money',
    cost: 1,
    effects: [{ op: 'gainCoinsPerStat', stat: 'upgradedPlayed', per: 1, max: 3 }],
  },
  test_st2_sword: {
    id: 'test_st2_sword',
    name: '테스트 검',
    type: 'weapon',
    cost: 1,
    effects: [
      { op: 'damage', n: 2 },
      { op: 'addAttackBonus', perStat: { stat: 'upgradedOwned', per: 1 }, cap: 4 },
    ],
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

/** 공격단계까지 넘긴다. */
function toAttack(game, playerIndex) {
  applyAction(game, playerIndex, { type: 'endPhase' }); // buy
  applyAction(game, playerIndex, { type: 'endPhase' }); // attack
}

test('getStat: stars / upgradedOwned / 모르는 stat', () => {
  const { game, first } = startedGame();
  const player = game.players[first];
  player.stars = 3;
  assert.equal(getStat(game, first, 'stars'), 3);
  assert.equal(getStat(game, first, 'starsSpent'), 0);

  const perm1 = addToHand(game, first, 'test_st2_up');
  const perm2 = addToHand(game, first, 'test_st2_up');
  perm1.upgraded = true;
  perm2.upgraded = true;
  const temp = addToHand(game, first, 'test_st2_up');
  temp.upgraded = true;
  temp.tempUpgraded = true;
  assert.equal(getStat(game, first, 'upgradedOwned'), 2);

  assert.throws(() => getStat(game, first, '없는stat'), Error);
});

test('freeUpgrade: 별을 쓰지 않고 강화하고 차례 끝에 풀린다', () => {
  const { game, first } = startedGame();
  const player = game.players[first];
  player.stars = 2;
  const [bless, up] = setHand(game, first, ['test_st2_bless', 'test_st2_up']);

  applyAction(game, first, { type: 'playCard', uid: bless.uid });
  assert.ok(game.pending);
  assert.equal(game.pending.kind, 'freeUpgrade');
  assert.deepEqual(game.pending.options, [up.uid]);
  applyAction(game, first, { type: 'choose', selection: [up.uid] });

  assert.equal(up.upgraded, true);
  assert.equal(up.tempUpgraded, true);
  assert.equal(player.stars, 2);
  assert.equal(game.turnState.starsSpent, 0);
  assert.equal(game.turnState.tempUpgrades, 0);

  applyAction(game, first, { type: 'playCard', uid: up.uid });
  assert.equal(player.coins, 3);

  passTurn(game, first);
  const all = [...player.hand, ...player.drawPile, ...player.discard, ...player.inPlay];
  const found = all.find((c) => c.uid === up.uid);
  assert.equal(found.upgraded, false);
  assert.equal(Object.prototype.hasOwnProperty.call(found, 'tempUpgraded'), false);
});

test('payStars: pay 면 별을 쓰고 후속 효과, skip 이면 아무 일 없음', () => {
  const { game, first, second } = startedGame();
  const player = game.players[first];
  player.stars = 2;
  const [meteor] = setHand(game, first, ['test_st2_meteor']);
  toAttack(game, first);
  applyAction(game, first, { type: 'playCard', uid: meteor.uid });
  assert.ok(game.pending);
  assert.equal(game.pending.kind, 'payStars');
  assert.equal(game.pending.prompt, '별 1개를 쓸까요?');
  assert.deepEqual(game.pending.options, ['pay', 'skip']);
  applyAction(game, first, { type: 'choose', selection: ['pay'] });
  assert.equal(player.stars, 1);
  assert.equal(game.turnState.starsSpent, 1);
  applyAction(game, first, { type: 'endPhase' }); // 공격 해결
  assert.equal(game.players[second].hp, 20 - 5);

  // skip
  const { game: game2, first: first2, second: second2 } = startedGame();
  const player2 = game2.players[first2];
  player2.stars = 2;
  const [meteor2] = setHand(game2, first2, ['test_st2_meteor']);
  toAttack(game2, first2);
  applyAction(game2, first2, { type: 'playCard', uid: meteor2.uid });
  applyAction(game2, first2, { type: 'choose', selection: ['skip'] });
  assert.equal(player2.stars, 2);
  assert.equal(game2.turnState.starsSpent, 0);
  applyAction(game2, first2, { type: 'endPhase' });
  assert.equal(game2.players[second2].hp, 20 - 2);

  // 별이 없으면 선택 없이 2 피해
  const { game: game3, first: first3, second: second3 } = startedGame();
  const player3 = game3.players[first3];
  player3.stars = 0;
  const [meteor3] = setHand(game3, first3, ['test_st2_meteor']);
  toAttack(game3, first3);
  applyAction(game3, first3, { type: 'playCard', uid: meteor3.uid });
  assert.equal(game3.pending, null);
  applyAction(game3, first3, { type: 'endPhase' });
  assert.equal(game3.players[second3].hp, 20 - 2);
  assert.equal(player3.stars, 0);
});

test('addAttackBonus perStat: starsSpent 만큼 공격이 세진다', () => {
  const { game, first, second } = startedGame();
  const player = game.players[first];
  player.stars = 5;
  const [burst, up1, up2] = setHand(game, first, ['test_st2_burst', 'test_st2_up', 'test_st2_up']);
  applyAction(game, first, { type: 'upgrade', uid: up1.uid, mode: 'temp' });
  applyAction(game, first, { type: 'upgrade', uid: up2.uid, mode: 'temp' });
  assert.equal(game.turnState.starsSpent, 2);
  applyAction(game, first, { type: 'playCard', uid: burst.uid });
  toAttack(game, first);
  // 공격단계 전에 별을 더 써도 포함된다
  const [up3] = setHand(game, first, ['test_st2_up']);
  applyAction(game, first, { type: 'upgrade', uid: up3.uid, mode: 'temp' });
  assert.equal(game.turnState.starsSpent, 3);
  applyAction(game, first, { type: 'endPhase' }); // 공격 해결
  // perStat 2 × 3 = 6
  assert.equal(game.players[second].hp, 20 - 6);
});

test('upgradedPlayed: 강화된 카드를 낸 수만큼 재화를 얻는다', () => {
  const { game, first } = startedGame();
  const player = game.players[first];
  player.stars = 5;
  const [up1, up2] = setHand(game, first, ['test_st2_up', 'test_st2_up']);
  applyAction(game, first, { type: 'upgrade', uid: up1.uid, mode: 'temp' });
  applyAction(game, first, { type: 'upgrade', uid: up2.uid, mode: 'temp' });
  applyAction(game, first, { type: 'playCard', uid: up1.uid });
  applyAction(game, first, { type: 'playCard', uid: up2.uid });
  assert.equal(game.turnState.upgradedPlayed, 2);

  const [coin] = setHand(game, first, ['test_st2_coin']);
  applyAction(game, first, { type: 'endPhase' }); // buy
  applyAction(game, first, { type: 'playCard', uid: coin.uid });
  // 강화 카드 2장 + 방금 낸 동전(강화 아님) → 2
  assert.equal(game.turnState.upgradedPlayed, 2);
  assert.equal(player.coins, 3 + 3 + 2);
});

test('addAttackBonus perStat upgradedOwned: 영구 강화 카드 수만큼 세진다', () => {
  const { game, first, second } = startedGame();
  const player = game.players[first];
  for (let i = 0; i < 3; i++) {
    const card = createCardInstance(game, 'test_st2_up');
    card.upgraded = true;
    player.discard.push(card);
  }
  const [sword] = setHand(game, first, ['test_st2_sword']);
  toAttack(game, first);
  applyAction(game, first, { type: 'playCard', uid: sword.uid });
  applyAction(game, first, { type: 'endPhase' }); // 공격 해결
  // 2 + 3 = 5
  assert.equal(game.players[second].hp, 20 - 5);
});

test('permUpgradeCost: 제이스는 별 3개로 영구 강화', () => {
  const { game, first } = startedGame(12345, ['test_st2_jace', null]);
  const player = game.players[first];
  player.stars = 3;
  const [card] = setHand(game, first, ['test_st2_up']);
  applyAction(game, first, { type: 'upgrade', uid: card.uid, mode: 'perm' });
  assert.equal(player.stars, 0);
  assert.equal(card.upgraded, true);
  assert.equal(card.tempUpgraded, undefined);

  // 캐릭터가 없으면 기본 4
  const { game: game2, first: first2 } = startedGame();
  const player2 = game2.players[first2];
  player2.stars = 3;
  const [card2] = setHand(game2, first2, ['test_st2_up']);
  assert.throws(
    () => applyAction(game2, first2, { type: 'upgrade', uid: card2.uid, mode: 'perm' }),
    Error,
  );
  assert.equal(player2.stars, 3);
  assert.equal(card2.upgraded, false);
});

test('endTriggers: 별 3개를 쓴 차례 끝에 별 +1', () => {
  const { game, first } = startedGame(12345, ['test_st2_elena', null]);
  const player = game.players[first];
  player.stars = 5;
  const cards = setHand(game, first, ['test_st2_up', 'test_st2_up', 'test_st2_up']);
  for (const card of cards) {
    applyAction(game, first, { type: 'upgrade', uid: card.uid, mode: 'temp' });
  }
  assert.equal(game.turnState.starsSpent, 3);
  assert.equal(player.stars, 2);
  passTurn(game, first);
  assert.equal(player.stars, 3);

  // 별 2개만 쓰면 그대로
  const { game: game2, first: first2 } = startedGame(12345, ['test_st2_elena', null]);
  const player2 = game2.players[first2];
  player2.stars = 5;
  const cards2 = setHand(game2, first2, ['test_st2_up', 'test_st2_up']);
  for (const card of cards2) {
    applyAction(game2, first2, { type: 'upgrade', uid: card.uid, mode: 'temp' });
  }
  assert.equal(game2.turnState.starsSpent, 2);
  passTurn(game2, first2);
  assert.equal(player2.stars, 3);
});

test('별 관련 상태는 JSON 왕복이 같다', () => {
  const { game, first } = startedGame(12345, ['test_st2_jace', 'test_st2_elena']);
  const player = game.players[first];
  player.stars = 5;
  const [bless, up, meteor] = setHand(game, first, [
    'test_st2_bless',
    'test_st2_up',
    'test_st2_meteor',
  ]);
  applyAction(game, first, { type: 'playCard', uid: bless.uid });
  applyAction(game, first, { type: 'choose', selection: [up.uid] });
  applyAction(game, first, { type: 'playCard', uid: up.uid });
  toAttack(game, first);
  applyAction(game, first, { type: 'playCard', uid: meteor.uid });
  applyAction(game, first, { type: 'choose', selection: ['pay'] });
  applyAction(game, first, { type: 'endPhase' });

  assert.deepEqual(JSON.parse(JSON.stringify(game)), game);
});
