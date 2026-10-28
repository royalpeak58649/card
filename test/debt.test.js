import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createGame,
  createCardInstance,
  addMarketPile,
  startGame,
  applyAction,
  registerCards,
  registerFactions,
  registerCharacters,
  getCardDef,
} from '../engine/index.js';
import { getStat } from '../engine/conditions.js';

registerFactions({
  test_db_faction: {
    id: 'test_db_faction',
    name: '테스트 빚 공화국',
    cardIds: [],
    characterIds: ['test_db_lime'],
  },
});

registerCharacters({
  test_db_lime: {
    id: 'test_db_lime',
    name: '라임',
    factionId: 'test_db_faction',
    maxHp: 30,
    cardIds: [],
    ability: { extraDrawIfDebt: 1 },
    abilityText: '차례 끝에 빚이 있으면 카드를 1장 더 뽑습니다.',
  },
});

registerCards({
  test_db_loan: {
    id: 'test_db_loan',
    name: '대출',
    type: 'money',
    cost: 3,
    effects: [
      { op: 'gainCoins', n: 4 },
      { op: 'gainDebt', n: 2 },
    ],
  },
  test_db_borrow: {
    id: 'test_db_borrow',
    name: '차입',
    type: 'action',
    cost: 2,
    actionCost: 0,
    effects: [{ op: 'gainDebt', n: 3 }],
  },
  test_db_reduce: {
    id: 'test_db_reduce',
    name: '상환',
    type: 'action',
    cost: 2,
    actionCost: 0,
    effects: [{ op: 'reduceDebt', n: 2 }],
  },
  test_db_clear: {
    id: 'test_db_clear',
    name: '청산',
    type: 'action',
    cost: 2,
    actionCost: 0,
    effects: [{ op: 'clearDebt' }],
  },
  test_db_transfer: {
    id: 'test_db_transfer',
    name: '전가',
    type: 'action',
    cost: 2,
    actionCost: 0,
    effects: [{ op: 'transferDebt', max: 3 }],
  },
  test_db_toDmg: {
    id: 'test_db_toDmg',
    name: '빚의 일격',
    type: 'action',
    cost: 2,
    actionCost: 0,
    effects: [{ op: 'debtToDamage', max: 3 }],
  },
  test_db_bond: {
    id: 'test_db_bond',
    name: '채권',
    type: 'action',
    cost: 2,
    actionCost: 0,
    effects: [{ op: 'gainFromMarket', filter: 'weapon', maxCost: 5, to: 'discard', debt: 3 }],
  },
  test_db_freeze: {
    id: 'test_db_freeze',
    name: '동결',
    type: 'action',
    cost: 2,
    actionCost: 0,
    effects: [{ op: 'addMod', key: 'ignoreDebt', n: 1 }],
  },
  test_db_ifDebt: {
    id: 'test_db_ifDebt',
    name: '빚의 대가',
    type: 'action',
    cost: 2,
    actionCost: 0,
    effects: [{ op: 'if', cond: { stat: 'debt', gte: 1 }, then: [{ op: 'gainCoins', n: 5 }] }],
  },
});

const PILE_IDS = [
  'test_db_loan',
  'test_db_borrow',
  'test_db_reduce',
  'test_db_clear',
  'test_db_transfer',
  'test_db_toDmg',
  'test_db_bond',
  'test_db_freeze',
  'test_db_ifDebt',
];

/**
 * 시작된 게임과 선공/후공 인덱스. characters 는 [선공, 후공] 캐릭터.
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
  for (const cardId of PILE_IDS) addMarketPile(game, cardId);
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

/** 구매단계로 넘긴다. */
function toBuy(game, playerIndex) {
  applyAction(game, playerIndex, { type: 'endPhase' });
}

test('createGame 후 두 플레이어의 빚은 0', () => {
  const { game } = startedGame();
  assert.equal(game.players[0].debt, 0);
  assert.equal(game.players[1].debt, 0);
});

test('대출: +4원, 빚 2. 빚이 있으면 구매 불가', () => {
  const { game, first } = startedGame();
  const [loan] = setHand(game, first, ['test_db_loan']);
  toBuy(game, first);
  applyAction(game, first, { type: 'playCard', uid: loan.uid });
  assert.equal(game.players[first].coins, 4);
  assert.equal(game.players[first].debt, 2);

  const before = JSON.stringify(game);
  assert.throws(
    () => applyAction(game, first, { type: 'buy', cardId: 'stone' }),
    /빚을 다 갚기 전에는 구매할 수 없습니다/,
  );
  assert.equal(JSON.stringify(game), before);
});

test('payDebt: 원으로 갚고, 다 갚으면 구매 가능', () => {
  const { game, first } = startedGame();
  const [loan] = setHand(game, first, ['test_db_loan']);
  toBuy(game, first);
  applyAction(game, first, { type: 'playCard', uid: loan.uid });
  assert.equal(game.players[first].coins, 4);
  assert.equal(game.players[first].debt, 2);

  applyAction(game, first, { type: 'payDebt' });
  assert.equal(game.players[first].coins, 2);
  assert.equal(game.players[first].debt, 0);
  const logEntry = game.log[game.log.length - 1];
  assert.equal(logEntry.type, 'payDebt');
  assert.equal(logEntry.amount, 2); // 실제로 갚은 양

  // 이제 구매할 수 있다.
  applyAction(game, first, { type: 'buy', cardId: 'stone' });
  assert.equal(game.players[first].discard.length, 1);

  // amount 를 주면 그만큼만 갚는다.
  game.players[first].coins = 4;
  game.players[first].debt = 3;
  applyAction(game, first, { type: 'payDebt', amount: 1 });
  assert.equal(game.players[first].coins, 3);
  assert.equal(game.players[first].debt, 2);
  assert.equal(game.log[game.log.length - 1].amount, 1);
});

test('payDebt: 행동단계·빚 0·원 0·amount 1 미만은 Error', () => {
  const { game, first } = startedGame();
  game.players[first].coins = 3;
  game.players[first].debt = 2;
  assert.throws(() => applyAction(game, first, { type: 'payDebt' }), Error);

  toBuy(game, first);
  game.players[first].debt = 0;
  assert.throws(() => applyAction(game, first, { type: 'payDebt' }), Error);

  game.players[first].debt = 2;
  game.players[first].coins = 0;
  assert.throws(() => applyAction(game, first, { type: 'payDebt' }), Error);

  game.players[first].coins = 3;
  assert.throws(() => applyAction(game, first, { type: 'payDebt', amount: 0 }), Error);
  assert.equal(game.players[first].debt, 2);
  assert.equal(game.players[first].coins, 3);
});

test('reduceDebt / clearDebt', () => {
  const { game, first } = startedGame();
  game.players[first].debt = 5;
  const [reduce] = setHand(game, first, ['test_db_reduce']);
  applyAction(game, first, { type: 'playCard', uid: reduce.uid });
  assert.equal(game.players[first].debt, 3);

  const [clear] = setHand(game, first, ['test_db_clear']);
  applyAction(game, first, { type: 'playCard', uid: clear.uid });
  assert.equal(game.players[first].debt, 0);

  // 빚보다 많이 줄여도 0 아래로 내려가지 않는다.
  game.players[first].debt = 1;
  const [reduce2] = setHand(game, first, ['test_db_reduce']);
  applyAction(game, first, { type: 'playCard', uid: reduce2.uid });
  assert.equal(game.players[first].debt, 0);
});

test('transferDebt: max 까지만 상대에게 넘긴다', () => {
  const { game, first, second } = startedGame();
  game.players[first].debt = 5;
  const [transfer] = setHand(game, first, ['test_db_transfer']);
  applyAction(game, first, { type: 'playCard', uid: transfer.uid });
  assert.equal(game.players[first].debt, 2);
  assert.equal(game.players[second].debt, 3);

  game.players[first].debt = 1;
  const [transfer2] = setHand(game, first, ['test_db_transfer']);
  applyAction(game, first, { type: 'playCard', uid: transfer2.uid });
  assert.equal(game.players[first].debt, 0);
  assert.equal(game.players[second].debt, 4);
});

test('debtToDamage: 빚을 갚아 공격 피해로 바꾼다', () => {
  const { game, first, second } = startedGame();
  game.players[first].debt = 5;
  const [toDmg] = setHand(game, first, ['test_db_toDmg']);
  applyAction(game, first, { type: 'playCard', uid: toDmg.uid });
  assert.equal(game.players[first].debt, 2);
  assert.equal(game.turnState.attackDamage, 3);

  const hpBefore = game.players[second].hp;
  passTurn(game, first);
  assert.equal(game.players[second].hp, hpBefore - 3);
});

test('gainFromMarket + debt: 얻은 카드는 discard 로, 빚 +3, bought 는 그대로', () => {
  const { game, first } = startedGame();
  const [bond] = setHand(game, first, ['test_db_bond']);
  const boughtBefore = game.market.pistol.bought;
  const countBefore = game.market.pistol.count;
  applyAction(game, first, { type: 'playCard', uid: bond.uid });
  assert.ok(game.pending);
  assert.ok(game.pending.options.includes('pistol'));
  applyAction(game, first, { type: 'choose', selection: ['pistol'] });
  assert.equal(game.pending, null);
  assert.equal(game.players[first].debt, 3);
  assert.equal(game.players[first].discard.length, 1);
  assert.equal(game.players[first].discard[0].cardId, 'pistol');
  assert.equal(game.market.pistol.bought, boughtBefore);
  assert.equal(game.market.pistol.count, countBefore - 1);
});

test('gainFromMarket + debt: 고를 카드가 없으면 빚도 없다', () => {
  const { game, first } = startedGame();
  for (const cardId of Object.keys(game.market)) {
    if (getCardDef(cardId).type === 'weapon') game.market[cardId].count = 0;
  }
  const [bond] = setHand(game, first, ['test_db_bond']);
  applyAction(game, first, { type: 'playCard', uid: bond.uid });
  assert.equal(game.pending, null);
  assert.equal(game.players[first].debt, 0);
});

test('ignoreDebt: 그 차례에는 구매 가능, 다음 차례엔 다시 불가', () => {
  const { game, first } = startedGame();
  game.players[first].debt = 2;
  game.players[first].coins = 5;
  const [freeze] = setHand(game, first, ['test_db_freeze']);
  applyAction(game, first, { type: 'playCard', uid: freeze.uid });
  toBuy(game, first);
  applyAction(game, first, { type: 'buy', cardId: 'stone' });
  assert.equal(game.players[first].discard.length, 1);

  passTurn(game, first);
  passTurn(game, 1 - first);
  assert.equal(game.activeIndex, first);
  assert.equal(game.players[first].debt, 2);
  game.players[first].coins = 5;
  toBuy(game, first);
  assert.throws(
    () => applyAction(game, first, { type: 'buy', cardId: 'stone' }),
    /빚을 다 갚기 전에는 구매할 수 없습니다/,
  );
});

test('if stat debt: 빚이 있으면 +5원, 없으면 0원', () => {
  const { game, first } = startedGame();
  game.players[first].debt = 1;
  const [ifDebt] = setHand(game, first, ['test_db_ifDebt']);
  applyAction(game, first, { type: 'playCard', uid: ifDebt.uid });
  assert.equal(game.players[first].coins, 5);

  const { game: game2, first: first2 } = startedGame();
  const [ifDebt2] = setHand(game2, first2, ['test_db_ifDebt']);
  applyAction(game2, first2, { type: 'playCard', uid: ifDebt2.uid });
  assert.equal(game2.players[first2].coins, 0);
});

test('getStat debt / debtHalf', () => {
  const { game, first } = startedGame();
  game.players[first].debt = 5;
  assert.equal(getStat(game, first, 'debt'), 5);
  assert.equal(getStat(game, first, 'debtHalf'), 2);
});

test('라임: 빚이 있으면 차례 끝에 6장, 없으면 5장', () => {
  const { game, first } = startedGame(12345, ['test_db_lime', null]);
  assert.equal(game.players[first].characterId, 'test_db_lime');
  game.players[first].debt = 1;
  passTurn(game, first);
  assert.equal(game.players[first].hand.length, 6);

  const { game: game2, first: first2 } = startedGame(12345, ['test_db_lime', null]);
  passTurn(game2, first2);
  assert.equal(game2.players[first2].hand.length, 5);
});

test('캐릭터가 없으면 빚이 있어도 5장', () => {
  const { game, first } = startedGame();
  game.players[first].debt = 3;
  passTurn(game, first);
  assert.equal(game.players[first].hand.length, 5);
});

test('빚 상태는 JSON 왕복이 가능하다', () => {
  const { game, first } = startedGame(999, ['test_db_lime', null]);
  game.players[first].debt = 4;
  const [loan] = setHand(game, first, ['test_db_loan']);
  toBuy(game, first);
  applyAction(game, first, { type: 'playCard', uid: loan.uid });
  applyAction(game, first, { type: 'payDebt', amount: 1 });
  const round = JSON.parse(JSON.stringify(game));
  assert.deepEqual(round, game);
});
