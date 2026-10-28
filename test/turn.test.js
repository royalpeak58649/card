import test from 'node:test';
import assert from 'node:assert/strict';

import { createGame, createCardInstance, getPurchasePrice } from '../engine/state.js';
import { registerCards } from '../engine/cards/registry.js';
import { registerOp, runEffects } from '../engine/effects.js';
import { startGame, applyAction } from '../engine/turn.js';

registerCards({
  test_draw2: {
    id: 'test_draw2',
    name: '테스트 드로우2',
    type: 'action',
    cost: 2,
    actionCost: 1,
    effects: [{ op: 'draw', n: 2 }],
  },
  test_free: {
    id: 'test_free',
    name: '테스트 프리',
    type: 'action',
    cost: 1,
    actionCost: 0,
    effects: [
      { op: 'gainActions', n: 1 },
      { op: 'gainCoins', n: 1 },
    ],
  },
});

const PLAYERS = [
  { id: 'p0', name: '플레이어0', maxHp: 20 },
  { id: 'p1', name: '플레이어1', maxHp: 20 },
];

function newGame(seed = 12345) {
  return createGame({ seed, players: PLAYERS.map((p) => ({ ...p })) });
}

/** 시작된 게임과 선공/후공 인덱스 */
function startedGame(seed = 12345) {
  const game = newGame(seed);
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

/** 선공이 3번 endPhase 해서 후공 차례로 넘긴다. */
function passTurn(game, playerIndex) {
  applyAction(game, playerIndex, { type: 'endPhase' });
  applyAction(game, playerIndex, { type: 'endPhase' });
  applyAction(game, playerIndex, { type: 'endPhase' });
}

test('startGame 후 첫 차례 상태', () => {
  const { game, first } = startedGame();
  assert.equal(game.phase, 'action');
  assert.equal(game.turn, 1);
  assert.equal(game.activeIndex, first);
  const player = game.players[first];
  assert.equal(player.stars, 0);
  assert.equal(player.actions, 1);
  assert.equal(player.buys, 1);
  assert.equal(player.coins, 0);
  assert.deepEqual(game.turnState, {
    attackDamage: 0,
    moneyPlayed: 0,
    weaponsPlayed: 0,
    actionsPlayed: 0,
    bought: [],
    starsSpent: 0,
    tempUpgrades: 0,
    damageDealt: 0,
  });
});

test('setup 이 아니면 startGame 은 Error', () => {
  const { game } = startedGame();
  assert.throws(() => startGame(game), Error);
});

test('차례를 넘기면 후공 차례가 되고 별을 1 얻는다', () => {
  const { game, first, second } = startedGame();
  passTurn(game, first);
  assert.equal(game.turn, 2);
  assert.equal(game.activeIndex, second);
  assert.equal(game.phase, 'action');
  assert.equal(game.players[second].stars, 1);
  assert.equal(game.players[second].actions, 1);
  assert.equal(game.players[second].buys, 1);
  assert.equal(game.players[second].coins, 0);
  assert.equal(game.players[first].hand.length, 5);
  assert.equal(game.players[first].inPlay.length, 0);
});

test('별은 5를 넘지 않는다', () => {
  const { game, first, second } = startedGame();
  game.players[first].stars = 5;
  passTurn(game, first);
  assert.equal(game.players[second].stars, 1);
  passTurn(game, second);
  assert.equal(game.players[first].stars, 5);
  passTurn(game, first);
  assert.equal(game.players[second].stars, 2);
});

test('단계에 맞지 않는 카드는 Error', () => {
  const { game, first } = startedGame();
  const [stone] = setHand(game, first, ['stone']);
  assert.throws(() => applyAction(game, first, { type: 'playCard', uid: stone.uid }), Error);
  assert.equal(game.players[first].hand.length, 1);

  applyAction(game, first, { type: 'endPhase' }); // buy
  const [action] = setHand(game, first, ['test_free']);
  assert.throws(() => applyAction(game, first, { type: 'playCard', uid: action.uid }), Error);

  applyAction(game, first, { type: 'endPhase' }); // attack
  const [stone2] = setHand(game, first, ['stone']);
  assert.throws(() => applyAction(game, first, { type: 'playCard', uid: stone2.uid }), Error);
});

test('행동카드는 행동력을 쓰고, 부족하면 Error', () => {
  const { game, first } = startedGame();
  const player = game.players[first];
  const [draw2, free] = setHand(game, first, ['test_draw2', 'test_free']);
  const handBefore = player.hand.length;

  applyAction(game, first, { type: 'playCard', uid: draw2.uid });
  assert.equal(player.actions, 0);
  assert.equal(player.hand.length, handBefore - 1 + 2);
  assert.equal(player.inPlay.length, 1);
  assert.equal(game.turnState.actionsPlayed, 1);

  const draw2b = createCardInstance(game, 'test_draw2');
  player.hand.push(draw2b);
  assert.throws(() => applyAction(game, first, { type: 'playCard', uid: draw2b.uid }), Error);
  assert.equal(game.players[first].actions, 0);

  applyAction(game, first, { type: 'playCard', uid: free.uid });
  assert.equal(game.players[first].actions, 1);
  assert.equal(game.players[first].coins, 1);
  assert.equal(game.turnState.actionsPlayed, 2);
});

test('구매 규칙', () => {
  const { game, first } = startedGame();
  const player = game.players[first];
  setHand(game, first, ['stone', 'stone', 'stone', 'stone', 'stone']);
  applyAction(game, first, { type: 'endPhase' }); // buy
  applyAction(game, first, { type: 'playAllMoney' });
  assert.equal(player.coins, 5);
  assert.equal(game.turnState.moneyPlayed, 5);

  const before = JSON.parse(JSON.stringify(game));
  assert.throws(() => applyAction(game, first, { type: 'buy', cardId: 'rifle' }), Error);
  assert.equal(game.players[first].coins, before.players[first].coins);
  assert.equal(game.players[first].buys, before.players[first].buys);
  assert.deepEqual(game.market, before.market);

  // 금괴를 넣어 원을 맞춘다
  const gold = createCardInstance(game, 'gold');
  game.players[first].hand.push(gold);
  applyAction(game, first, { type: 'playCard', uid: gold.uid });
  assert.equal(game.players[first].coins, 8);

  applyAction(game, first, { type: 'buy', cardId: 'rifle' });
  assert.equal(game.players[first].coins, 8 - getPurchasePrice(game, 'rifle'));
  assert.equal(game.players[first].buys, 0);
  assert.equal(game.market.rifle.bought, 1);
  assert.equal(game.market.rifle.count, 11);
  assert.equal(game.players[first].discard.length, 1);
  assert.equal(game.players[first].discard[0].cardId, 'rifle');
  assert.deepEqual(game.turnState.bought, ['rifle']);

  assert.throws(() => applyAction(game, first, { type: 'buy', cardId: 'stone' }), Error);
});

test('구매는 구매단계에만', () => {
  const { game, first } = startedGame();
  assert.throws(() => applyAction(game, first, { type: 'buy', cardId: 'stone' }), Error);
});

test('할증: rifle.bought 2 이면 5원', () => {
  const { game, first } = startedGame();
  game.market.rifle.bought = 2;
  assert.equal(getPurchasePrice(game, 'rifle'), 5);
  const player = game.players[first];
  setHand(game, first, ['gold', 'gold']);
  applyAction(game, first, { type: 'endPhase' });
  applyAction(game, first, { type: 'playAllMoney' });
  assert.equal(player.coins, 6);
  applyAction(game, first, { type: 'buy', cardId: 'rifle' });
  assert.equal(player.coins, 1);
  assert.equal(game.market.rifle.bought, 3);
});

test('공격: 피해는 공격단계 종료 시 한 번에 적용된다', () => {
  const { game, first, second } = startedGame();
  const player = game.players[first];
  setHand(game, first, ['pistol', 'pistol', 'pistol', 'assaultRifle']);
  applyAction(game, first, { type: 'endPhase' }); // buy
  applyAction(game, first, { type: 'endPhase' }); // attack
  for (const card of [...player.hand]) {
    applyAction(game, first, { type: 'playCard', uid: card.uid });
  }
  assert.equal(game.turnState.attackDamage, 8);
  assert.equal(game.turnState.weaponsPlayed, 4);
  assert.equal(game.players[second].hp, 20);

  applyAction(game, first, { type: 'endPhase' });
  assert.equal(game.players[second].hp, 12);
  assert.equal(game.turn, 2);
  assert.equal(game.activeIndex, second);
  assert.equal(game.turnState.attackDamage, 0);
  assert.equal(game.turnState.damageDealt, 0);
});

test('상대 hp 가 0 이하가 되면 게임 종료', () => {
  const { game, first, second } = startedGame();
  game.players[second].hp = 3;
  setHand(game, first, ['pistol', 'pistol', 'pistol']);
  applyAction(game, first, { type: 'endPhase' });
  applyAction(game, first, { type: 'endPhase' });
  for (const card of [...game.players[first].hand]) {
    applyAction(game, first, { type: 'playCard', uid: card.uid });
  }
  applyAction(game, first, { type: 'endPhase' });
  assert.equal(game.winner, first);
  assert.equal(game.phase, 'gameOver');
  assert.ok(game.players[second].hp <= 0);
  assert.throws(() => applyAction(game, first, { type: 'endPhase' }), Error);
  assert.throws(() => applyAction(game, second, { type: 'endPhase' }), Error);
});

test('차례가 아닌 플레이어의 조작은 Error', () => {
  const { game, first, second } = startedGame();
  assert.throws(() => applyAction(game, second, { type: 'endPhase' }), Error);
  assert.equal(game.phase, 'action');
  assert.equal(game.activeIndex, first);
});

test('setup 단계에서는 조작할 수 없다', () => {
  const game = newGame();
  assert.throws(() => applyAction(game, game.activeIndex, { type: 'endPhase' }), Error);
});

test('모르는 action type 은 Error', () => {
  const { game, first } = startedGame();
  assert.throws(() => applyAction(game, first, { type: '없는조작' }), Error);
});

test('모르는 op 는 Error', () => {
  const { game, first } = startedGame();
  assert.throws(
    () => runEffects(game, { playerIndex: first, card: null }, [{ op: '없는효과', n: 1 }]),
    /알 수 없는 효과/,
  );
});

test('registerOp 중복 등록은 Error', () => {
  assert.throws(() => registerOp('gainCoins', () => {}), Error);
});

test('여러 조작 뒤에도 JSON 직렬화 가능', () => {
  const { game, first } = startedGame();
  setHand(game, first, ['stone', 'stone', 'test_free', 'pistol', 'gold']);
  applyAction(game, first, { type: 'playCard', uid: game.players[first].hand[2].uid });
  applyAction(game, first, { type: 'endPhase' });
  applyAction(game, first, { type: 'playAllMoney' });
  applyAction(game, first, { type: 'buy', cardId: 'stone' });
  applyAction(game, first, { type: 'endPhase' });
  applyAction(game, first, { type: 'playCard', uid: game.players[first].hand[0].uid });
  applyAction(game, first, { type: 'endPhase' });
  assert.deepStrictEqual(JSON.parse(JSON.stringify(game)), game);
});
