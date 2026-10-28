import test from 'node:test';
import assert from 'node:assert/strict';

import { createGame, createCardInstance, getPurchasePrice } from '../engine/state.js';
import { registerCards, getCardDef } from '../engine/cards/registry.js';
import { runEffects } from '../engine/effects.js';
import { evalCond } from '../engine/conditions.js';
import { startGame, applyAction } from '../engine/turn.js';

registerCards({
  test_cd_smg: {
    id: 'test_cd_smg',
    name: '테스트 기관단총',
    type: 'weapon',
    cost: 3,
    effects: [
      { op: 'damage', n: 2 },
      { op: 'if', cond: { stat: 'moneyPlayed', gte: 3 }, then: [{ op: 'damage', n: 2 }] },
    ],
  },
  test_cd_if_choice: {
    id: 'test_cd_if_choice',
    name: '테스트 조건 선택',
    type: 'action',
    actionCost: 0,
    cost: 1,
    effects: [
      {
        op: 'if',
        cond: { stat: 'actionsPlayed', gte: 0 },
        then: [{ op: 'trashFromHand', n: 1 }, { op: 'gainCoins', n: 2 }],
      },
    ],
  },
  test_cd_discount: {
    id: 'test_cd_discount',
    name: '테스트 할인',
    type: 'action',
    actionCost: 0,
    cost: 1,
    effects: [{ op: 'addMod', key: 'marketDiscount', n: 1 }],
  },
  test_cd_refund: {
    id: 'test_cd_refund',
    name: '테스트 환급',
    type: 'action',
    actionCost: 0,
    cost: 1,
    effects: [{ op: 'addMod', key: 'weaponBuyRefund', n: 1 }],
  },
  test_cd_bonus_per_weapon: {
    id: 'test_cd_bonus_per_weapon',
    name: '테스트 무기당 보너스',
    type: 'action',
    actionCost: 0,
    cost: 1,
    effects: [{ op: 'addAttackBonus', perWeapon: 1, cap: 3 }],
  },
  test_cd_bonus_per_weapon_nocap: {
    id: 'test_cd_bonus_per_weapon_nocap',
    name: '테스트 무기당 보너스(상한 없음)',
    type: 'action',
    actionCost: 0,
    cost: 1,
    effects: [{ op: 'addAttackBonus', perWeapon: 1 }],
  },
  test_cd_bonus_flat: {
    id: 'test_cd_bonus_flat',
    name: '테스트 고정 보너스',
    type: 'action',
    actionCost: 0,
    cost: 1,
    effects: [{ op: 'addAttackBonus', flat: 3, cond: { stat: 'weaponsPlayed', eq: 1 } }],
  },
  test_cd_defense: {
    id: 'test_cd_defense',
    name: '테스트 방어',
    type: 'action',
    actionCost: 0,
    cost: 1,
    effects: [{ op: 'addDefense', n: 3 }],
  },
  test_cd_end_trigger: {
    id: 'test_cd_end_trigger',
    name: '테스트 차례 끝 발동',
    type: 'action',
    actionCost: 0,
    cost: 1,
    effects: [
      {
        op: 'addEndTrigger',
        cond: { stat: 'damageDealt', gte: 3 },
        effects: [{ op: 'gainCard', cardId: 'gold', to: 'discard' }],
      },
    ],
  },
  test_cd_trash_self: {
    id: 'test_cd_trash_self',
    name: '테스트 정리 시 제거',
    type: 'action',
    actionCost: 0,
    cost: 1,
    effects: [{ op: 'trashSelfAtCleanup' }],
  },
  test_cd_heal: {
    id: 'test_cd_heal',
    name: '테스트 회복',
    type: 'action',
    actionCost: 0,
    cost: 1,
    effects: [{ op: 'heal', n: 5 }],
  },
  test_cd_mill: {
    id: 'test_cd_mill',
    name: '테스트 밀',
    type: 'action',
    actionCost: 0,
    cost: 1,
    effects: [{ op: 'opponentMillTop', n: 2 }],
  },
});

const PLAYERS = [
  { id: 'p0', name: '플레이어0', maxHp: 20 },
  { id: 'p1', name: '플레이어1', maxHp: 20 },
];

/** 시작된 게임과 선공/후공 인덱스 */
function startedGame(seed = 12345) {
  const game = createGame({ seed, players: PLAYERS.map((p) => ({ ...p })) });
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

/** 손패에 카드를 추가한다. */
function addToHand(game, playerIndex, cardId) {
  const card = createCardInstance(game, cardId);
  game.players[playerIndex].hand.push(card);
  return card;
}

/** 손패를 모두 낸다. */
function playAll(game, playerIndex) {
  for (const card of [...game.players[playerIndex].hand]) {
    applyAction(game, playerIndex, { type: 'playCard', uid: card.uid });
  }
}

/** 손패의 재화카드만 낸다. */
function playMoney(game, playerIndex) {
  for (const card of [...game.players[playerIndex].hand]) {
    if (getCardDef(card.cardId).type === 'money') {
      applyAction(game, playerIndex, { type: 'playCard', uid: card.uid });
    }
  }
}

/** 공격단계까지 넘긴다. */
function toAttack(game, playerIndex) {
  applyAction(game, playerIndex, { type: 'endPhase' }); // buy
  applyAction(game, playerIndex, { type: 'endPhase' }); // attack
}

test('evalCond: stat 비교', () => {
  const { game, first } = startedGame();
  const ctx = { playerIndex: first, cardUid: 'c0' };
  game.turnState.moneyPlayed = 3;
  assert.equal(evalCond(game, ctx, { stat: 'moneyPlayed', gte: 3 }), true);
  assert.equal(evalCond(game, ctx, { stat: 'moneyPlayed', gte: 4 }), false);
  assert.equal(evalCond(game, ctx, { stat: 'moneyPlayed', lte: 3 }), true);
  assert.equal(evalCond(game, ctx, { stat: 'moneyPlayed', lte: 2 }), false);
  assert.equal(evalCond(game, ctx, { stat: 'moneyPlayed', eq: 3 }), true);
  assert.equal(evalCond(game, ctx, { stat: 'moneyPlayed', eq: 2 }), false);
  assert.equal(evalCond(game, ctx, { stat: 'moneyPlayed', gte: 2, lte: 4 }), true);
  assert.equal(evalCond(game, ctx, { stat: 'moneyPlayed', gte: 2, lte: 2 }), false);
  assert.equal(evalCond(game, ctx, { stat: 'weaponsPlayed', eq: 0 }), true);
  assert.equal(evalCond(game, ctx, { stat: 'starsSpent', eq: 0 }), true);
  assert.equal(evalCond(game, ctx, { stat: 'damageDealt', eq: 0 }), true);
  assert.equal(evalCond(game, ctx, { stat: 'actionsPlayed', eq: 0 }), true);
});

test('evalCond: boughtWeapons 는 무기 구매 수', () => {
  const { game, first } = startedGame();
  const ctx = { playerIndex: first, cardUid: 'c0' };
  game.turnState.bought = ['rifle', 'stone', 'pistol'];
  assert.equal(evalCond(game, ctx, { stat: 'boughtWeapons', eq: 2 }), true);
  assert.equal(evalCond(game, ctx, { stat: 'boughtWeapons', gte: 3 }), false);
});

test('evalCond: handHasNoType', () => {
  const { game, first } = startedGame();
  const ctx = { playerIndex: first, cardUid: 'c0' };
  setHand(game, first, ['stone', 'pistol']);
  assert.equal(evalCond(game, ctx, { handHasNoType: 'action' }), true);
  assert.equal(evalCond(game, ctx, { handHasNoType: 'money' }), false);
  assert.equal(evalCond(game, ctx, { handHasNoType: 'weapon' }), false);
  setHand(game, first, []);
  assert.equal(evalCond(game, ctx, { handHasNoType: 'weapon' }), true);
});

test('evalCond: opponentHpAtMostHalf', () => {
  const { game, first, second } = startedGame();
  const ctx = { playerIndex: first, cardUid: 'c0' };
  game.players[second].hp = 11;
  assert.equal(evalCond(game, ctx, { opponentHpAtMostHalf: true }), false);
  game.players[second].hp = 10;
  assert.equal(evalCond(game, ctx, { opponentHpAtMostHalf: true }), true);
  game.players[second].hp = 3;
  assert.equal(evalCond(game, ctx, { opponentHpAtMostHalf: true }), true);
});

test('evalCond: not / all / any', () => {
  const { game, first } = startedGame();
  const ctx = { playerIndex: first, cardUid: 'c0' };
  game.turnState.moneyPlayed = 2;
  assert.equal(evalCond(game, ctx, { not: { stat: 'moneyPlayed', gte: 3 } }), true);
  assert.equal(evalCond(game, ctx, { not: { stat: 'moneyPlayed', gte: 2 } }), false);
  assert.equal(
    evalCond(game, ctx, { all: [{ stat: 'moneyPlayed', gte: 1 }, { stat: 'moneyPlayed', lte: 2 }] }),
    true,
  );
  assert.equal(
    evalCond(game, ctx, { all: [{ stat: 'moneyPlayed', gte: 1 }, { stat: 'moneyPlayed', lte: 1 }] }),
    false,
  );
  assert.equal(
    evalCond(game, ctx, { any: [{ stat: 'moneyPlayed', gte: 5 }, { stat: 'moneyPlayed', eq: 2 }] }),
    true,
  );
  assert.equal(
    evalCond(game, ctx, { any: [{ stat: 'moneyPlayed', gte: 5 }, { stat: 'moneyPlayed', eq: 3 }] }),
    false,
  );
});

test('evalCond: 모르는 형식은 Error', () => {
  const { game, first } = startedGame();
  const ctx = { playerIndex: first, cardUid: 'c0' };
  assert.throws(() => evalCond(game, ctx, { 모르는조건: 1 }), Error);
  assert.throws(() => evalCond(game, ctx, { stat: '없는stat', gte: 1 }), Error);
  assert.throws(() => evalCond(game, ctx, { handHasNoType: '없는종류' }), Error);
  assert.throws(() => evalCond(game, ctx, null), Error);
});

test('if: 재화 3장을 낸 차례엔 공격 4, 2장이면 2', () => {
  const { game, first, second } = startedGame();
  setHand(game, first, ['stone', 'stone', 'stone', 'test_cd_smg']);
  applyAction(game, first, { type: 'endPhase' }); // buy
  playMoney(game, first);
  assert.equal(game.turnState.moneyPlayed, 3);
  applyAction(game, first, { type: 'endPhase' }); // attack
  playAll(game, first);
  applyAction(game, first, { type: 'endPhase' }); // 공격 해결
  assert.equal(game.players[second].hp, 16);

  const { game: game2, first: first2, second: second2 } = startedGame();
  setHand(game2, first2, ['stone', 'stone', 'test_cd_smg']);
  applyAction(game2, first2, { type: 'endPhase' }); // buy
  playMoney(game2, first2);
  assert.equal(game2.turnState.moneyPlayed, 2);
  applyAction(game2, first2, { type: 'endPhase' }); // attack
  playAll(game2, first2);
  applyAction(game2, first2, { type: 'endPhase' });
  assert.equal(game2.players[second2].hp, 18);
});

test('if: then 안의 선택형 효과 뒤에도 이어서 실행된다', () => {
  const { game, first } = startedGame();
  const player = game.players[first];
  const [action] = setHand(game, first, ['test_cd_if_choice']);
  const stone = addToHand(game, first, 'stone');

  applyAction(game, first, { type: 'playCard', uid: action.uid });
  assert.ok(game.pending);
  assert.equal(game.pending.kind, 'trashFromHand');
  assert.deepEqual(game.pending.options, [stone.uid]);
  assert.equal(player.coins, 0);

  applyAction(game, first, { type: 'choose', selection: [stone.uid] });
  assert.equal(game.pending, null);
  assert.equal(game.trash.length, 1);
  assert.equal(game.trash[0].uid, stone.uid);
  assert.equal(player.coins, 2);
});

test('marketDiscount: 구매가에서 1 빼고 최소 0', () => {
  const { game, first } = startedGame();
  const [action] = setHand(game, first, ['test_cd_discount']);
  applyAction(game, first, { type: 'playCard', uid: action.uid });
  assert.equal(game.turnState.mods.marketDiscount, 1);

  assert.equal(getPurchasePrice(game, 'rifle', first), 5);
  assert.equal(getPurchasePrice(game, 'stone', first), 0);
  // playerIndex 를 주지 않으면 기존과 같다
  assert.equal(getPurchasePrice(game, 'rifle'), 6);

  // 실제 구매에도 적용된다
  const player = game.players[first];
  applyAction(game, first, { type: 'endPhase' }); // buy
  player.coins = 5;
  applyAction(game, first, { type: 'buy', cardId: 'rifle' });
  assert.equal(player.coins, 0);
});

test('weaponBuyRefund: 무기 구매 시 1원 환급, 한 번만', () => {
  const { game, first } = startedGame();
  const player = game.players[first];
  const [action] = setHand(game, first, ['test_cd_refund']);
  applyAction(game, first, { type: 'playCard', uid: action.uid });
  assert.equal(game.turnState.mods.weaponBuyRefund, 1);

  applyAction(game, first, { type: 'endPhase' }); // buy
  player.coins = 10;
  player.buys = 3;
  applyAction(game, first, { type: 'buy', cardId: 'pistol' });
  assert.equal(player.coins, 11);
  assert.equal(game.turnState.mods.weaponBuyRefund, 0);

  // 두 번째 무기 구매에는 환급이 없다
  applyAction(game, first, { type: 'buy', cardId: 'pistol' });
  assert.equal(player.coins, 11);

  // 재화 카드 구매에도 환급이 없다
  const { game: game2, first: first2 } = startedGame();
  const player2 = game2.players[first2];
  const [action2] = setHand(game2, first2, ['test_cd_refund']);
  applyAction(game2, first2, { type: 'playCard', uid: action2.uid });
  applyAction(game2, first2, { type: 'endPhase' }); // buy
  player2.coins = 5;
  applyAction(game2, first2, { type: 'buy', cardId: 'stone' });
  assert.equal(player2.coins, 5);
  assert.equal(game2.turnState.mods.weaponBuyRefund, 1);
});

test('addAttackBonus perWeapon 1 cap 3: 권총 4장이면 7 피해', () => {
  const { game, first, second } = startedGame();
  setHand(game, first, ['test_cd_bonus_per_weapon', 'pistol', 'pistol', 'pistol', 'pistol']);
  applyAction(game, first, { type: 'playCard', uid: game.players[first].hand[0].uid });
  applyAction(game, first, { type: 'endPhase' }); // buy
  applyAction(game, first, { type: 'endPhase' }); // attack
  playAll(game, first);
  assert.equal(game.turnState.weaponsPlayed, 4);
  applyAction(game, first, { type: 'endPhase' });
  assert.equal(game.players[second].hp, 20 - 7);
  assert.equal(game.turnState.damageDealt, 0); // 새 차례라 초기화

  const { game: game2, first: first2, second: second2 } = startedGame();
  setHand(game2, first2, ['test_cd_bonus_per_weapon_nocap', 'pistol', 'pistol', 'pistol', 'pistol']);
  applyAction(game2, first2, { type: 'playCard', uid: game2.players[first2].hand[0].uid });
  applyAction(game2, first2, { type: 'endPhase' });
  applyAction(game2, first2, { type: 'endPhase' });
  playAll(game2, first2);
  applyAction(game2, first2, { type: 'endPhase' });
  assert.equal(game2.players[second2].hp, 20 - 8);
});

test('addAttackBonus flat 3 cond weaponsPlayed eq 1', () => {
  const { game, first, second } = startedGame();
  setHand(game, first, ['test_cd_bonus_flat', 'pistol', 'pistol']);
  applyAction(game, first, { type: 'playCard', uid: game.players[first].hand[0].uid });
  applyAction(game, first, { type: 'endPhase' }); // buy
  applyAction(game, first, { type: 'endPhase' }); // attack
  playAll(game, first);
  assert.equal(game.turnState.weaponsPlayed, 2);
  applyAction(game, first, { type: 'endPhase' });
  assert.equal(game.players[second].hp, 18);

  const { game: game2, first: first2, second: second2 } = startedGame();
  setHand(game2, first2, ['test_cd_bonus_flat', 'pistol']);
  applyAction(game2, first2, { type: 'playCard', uid: game2.players[first2].hand[0].uid });
  applyAction(game2, first2, { type: 'endPhase' });
  applyAction(game2, first2, { type: 'endPhase' });
  playAll(game2, first2);
  assert.equal(game2.turnState.weaponsPlayed, 1);
  applyAction(game2, first2, { type: 'endPhase' });
  assert.equal(game2.players[second2].hp, 20 - 4);
});

test('addDefense: 방어만큼 피해를 줄이고 방어는 소모된다', () => {
  const { game, first, second } = startedGame();
  game.players[second].defense = 3;
  setHand(game, first, ['pistol', 'pistol']);
  toAttack(game, first);
  playAll(game, first);
  applyAction(game, first, { type: 'endPhase' });
  assert.equal(game.players[second].hp, 20);
  assert.equal(game.players[second].defense, 0);

  const { game: game2, first: first2, second: second2 } = startedGame();
  game2.players[second2].defense = 3;
  setHand(game2, first2, ['pistol', 'pistol', 'pistol', 'pistol', 'pistol']);
  toAttack(game2, first2);
  playAll(game2, first2);
  applyAction(game2, first2, { type: 'endPhase' });
  assert.equal(game2.players[second2].hp, 18);
  assert.equal(game2.players[second2].defense, 0);
});

test('addDefense op 는 자기 방어를 올린다', () => {
  const { game, first } = startedGame();
  const [action] = setHand(game, first, ['test_cd_defense']);
  applyAction(game, first, { type: 'playCard', uid: action.uid });
  assert.equal(game.players[first].defense, 3);
});

test('addEndTrigger: 3 피해를 준 차례 끝에 금괴를 얻는다', () => {
  const { game, first } = startedGame();
  const player = game.players[first];
  setHand(game, first, ['test_cd_end_trigger', 'pistol', 'pistol', 'pistol']);
  applyAction(game, first, { type: 'playCard', uid: player.hand[0].uid });
  toAttack(game, first);
  playAll(game, first);
  const goldBefore = game.market.gold.count;
  applyAction(game, first, { type: 'endPhase' });
  assert.equal(game.turnState.damageDealt, 0); // 새 차례
  assert.equal(game.market.gold.count, goldBefore - 1);
  assert.equal(player.discard.filter((c) => c.cardId === 'gold').length, 1);
  assert.deepEqual(game.turnState.bought, []);

  const { game: game2, first: first2 } = startedGame();
  const player2 = game2.players[first2];
  setHand(game2, first2, ['test_cd_end_trigger', 'pistol', 'pistol']);
  applyAction(game2, first2, { type: 'playCard', uid: player2.hand[0].uid });
  toAttack(game2, first2);
  playAll(game2, first2);
  const goldBefore2 = game2.market.gold.count;
  applyAction(game2, first2, { type: 'endPhase' });
  assert.equal(game2.market.gold.count, goldBefore2);
  assert.equal(player2.discard.filter((c) => c.cardId === 'gold').length, 0);
});

test('trashSelfAtCleanup: 차례가 끝나면 trash 로 간다', () => {
  const { game, first } = startedGame();
  const player = game.players[first];
  const [action] = setHand(game, first, ['test_cd_trash_self']);
  applyAction(game, first, { type: 'playCard', uid: action.uid });
  assert.deepEqual(game.turnState.trashAtCleanup, [action.uid]);
  applyAction(game, first, { type: 'endPhase' });
  applyAction(game, first, { type: 'endPhase' });
  applyAction(game, first, { type: 'endPhase' });
  assert.equal(game.trash.length, 1);
  assert.equal(game.trash[0].uid, action.uid);
  assert.equal(player.discard.some((c) => c.uid === action.uid), false);
  assert.equal(player.hand.some((c) => c.uid === action.uid), false);
});

test('heal 은 maxHp 를 넘지 않는다', () => {
  const { game, first } = startedGame();
  const player = game.players[first];
  player.hp = 18;
  const [action] = setHand(game, first, ['test_cd_heal']);
  applyAction(game, first, { type: 'playCard', uid: action.uid });
  assert.equal(player.hp, 20);
});

test('opponentMillTop: 상대 drawPile 맨 위 2장을 상대 discard 로', () => {
  const { game, first, second } = startedGame();
  const opponent = game.players[second];
  const top1 = opponent.drawPile[opponent.drawPile.length - 1];
  const top2 = opponent.drawPile[opponent.drawPile.length - 2];
  const drawBefore = opponent.drawPile.length;
  const discardBefore = opponent.discard.length;

  const [action] = setHand(game, first, ['test_cd_mill']);
  applyAction(game, first, { type: 'playCard', uid: action.uid });

  assert.equal(opponent.drawPile.length, drawBefore - 2);
  assert.equal(opponent.discard.length, discardBefore + 2);
  assert.deepEqual(opponent.discard.slice(-2).map((c) => c.uid), [top1.uid, top2.uid]);
});

test('opponentMillTop: drawPile 이 비면 discard 를 섞어 채운다', () => {
  const { game, first, second } = startedGame();
  const opponent = game.players[second];
  opponent.discard.push(...opponent.drawPile.splice(0, opponent.drawPile.length));
  assert.equal(opponent.drawPile.length, 0);
  const total = opponent.discard.length;

  const [action] = setHand(game, first, ['test_cd_mill']);
  applyAction(game, first, { type: 'playCard', uid: action.uid });
  assert.equal(opponent.discard.length, 2);
  assert.equal(opponent.drawPile.length, total - 2);
});

test('여러 효과를 쓴 뒤에도 JSON 왕복이 같다', () => {
  const { game, first } = startedGame();
  const player = game.players[first];
  setHand(game, first, [
    'test_cd_discount',
    'test_cd_refund',
    'test_cd_bonus_per_weapon',
    'test_cd_end_trigger',
    'test_cd_trash_self',
  ]);
  for (const card of [...player.hand]) {
    applyAction(game, first, { type: 'playCard', uid: card.uid });
  }
  applyAction(game, first, { type: 'endPhase' }); // buy
  player.coins = 10;
  applyAction(game, first, { type: 'buy', cardId: 'pistol' });
  applyAction(game, first, { type: 'endPhase' }); // attack
  const pistol = addToHand(game, first, 'pistol');
  applyAction(game, first, { type: 'playCard', uid: pistol.uid });
  applyAction(game, first, { type: 'endPhase' }); // 공격 해결 + 차례 끝

  assert.deepStrictEqual(JSON.parse(JSON.stringify(game)), game);
});

test('runEffects 로 직접 실행해도 조건·보정이 데이터로 남는다', () => {
  const { game, first } = startedGame();
  const ctx = { playerIndex: first, cardUid: 'c0' };
  runEffects(game, ctx, [
    { op: 'addMod', key: 'marketDiscount', n: 2 },
    { op: 'addAttackBonus', flat: 1, perWeapon: 2, cap: 5, cond: { stat: 'weaponsPlayed', gte: 1 } },
    { op: 'addEndTrigger', cond: { stat: 'damageDealt', gte: 1 }, effects: [{ op: 'heal', n: 1 }] },
    { op: 'trashSelfAtCleanup' },
    { op: 'if', cond: { stat: 'moneyPlayed', gte: 1 }, then: [{ op: 'gainCoins', n: 1 }], else: [{ op: 'gainCoins', n: 2 }] },
  ]);
  assert.equal(game.turnState.mods.marketDiscount, 2);
  assert.deepEqual(game.turnState.attackBonuses, [
    { flat: 1, perWeapon: 2, cap: 5, cond: { stat: 'weaponsPlayed', gte: 1 } },
  ]);
  assert.equal(game.turnState.endTriggers.length, 1);
  assert.deepEqual(game.turnState.endTriggers[0].ctx, ctx);
  assert.deepEqual(game.turnState.trashAtCleanup, ['c0']);
  assert.equal(game.players[first].coins, 2);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(game)), game);
});
