import test from 'node:test';
import assert from 'node:assert/strict';

import { createGame, createCardInstance } from '../engine/state.js';
import { registerCards } from '../engine/cards/registry.js';
import { registerFactions, registerCharacters } from '../engine/characters.js';
import { startGame, applyAction } from '../engine/turn.js';

registerFactions({
  test_ec_faction: {
    id: 'test_ec_faction',
    name: '테스트 에코',
    cardIds: [],
    characterIds: ['test_ec_echo'],
  },
});

registerCharacters({
  test_ec_echo: {
    id: 'test_ec_echo',
    name: '에코',
    factionId: 'test_ec_faction',
    maxHp: 30,
    cardIds: [],
    ability: { doubleFirstCostlyAction: { minOwnTurn: 4 } },
    abilityText: '',
  },
});

registerCards({
  test_ec_coin: {
    id: 'test_ec_coin',
    name: '테스트 동전',
    type: 'action',
    actionCost: 0,
    cost: 1,
    effects: [{ op: 'gainCoins', n: 2 }],
  },
  test_ec_coin1: {
    id: 'test_ec_coin1',
    name: '테스트 동전 1',
    type: 'action',
    actionCost: 1,
    cost: 1,
    effects: [{ op: 'gainCoins', n: 2 }],
  },
  test_ec_mirror: {
    id: 'test_ec_mirror',
    name: '테스트 거울',
    type: 'action',
    actionCost: 0,
    cost: 1,
    effects: [{ op: 'repeatPrevAction' }],
  },
  test_ec_up: {
    id: 'test_ec_up',
    name: '테스트 강화',
    type: 'action',
    actionCost: 0,
    cost: 1,
    effects: [{ op: 'gainCoins', n: 1 }],
    upgradedEffects: [{ op: 'gainCoins', n: 5 }],
  },
});

const PLAYERS = [
  { id: 'p0', name: '플레이어0', maxHp: 20 },
  { id: 'p1', name: '플레이어1', maxHp: 20 },
];

/** 시작된 게임과 선공/후공 인덱스 */
function startedGame(seed = 12345, characterIds = [null, null]) {
  const game = createGame({
    seed,
    players: PLAYERS.map((p, i) => ({ ...p, characterId: characterIds[i] })),
  });
  startGame(game);
  const first = game.activeIndex;
  return { game, first, second: 1 - first };
}

/** 선공에게 캐릭터를 붙인 게임. */
function startedGameWithFirst(characterId, seed = 12345) {
  const game = createGame({ seed, players: PLAYERS.map((p) => ({ ...p })) });
  game.players[game.firstPlayerIndex].characterId = characterId;
  startGame(game);
  const first = game.activeIndex;
  return { game, first, second: 1 - first };
}

/** 손패를 지정한 카드 id 목록으로 교체한다(나머지는 drawPile 로). */
function setHand(game, playerIndex, cardIds) {
  const player = game.players[playerIndex];
  player.drawPile.push(...player.hand);
  player.hand = cardIds.map((id) => createCardInstance(game, id));
  // 카드를 내면 손패 배열이 줄어드므로 복사본을 돌려준다.
  return [...player.hand];
}

/** 차례가 상대에게 넘어갈 때까지 endPhase 한다. */
function passTurn(game, playerIndex) {
  while (game.activeIndex === playerIndex && game.phase !== 'gameOver') {
    applyAction(game, playerIndex, { type: 'endPhase' });
  }
}

test('repeatPrevAction: 동전 뒤 거울이면 2 + 2 = 4', () => {
  const { game, first } = startedGame();
  const [coin, mirror] = setHand(game, first, ['test_ec_coin', 'test_ec_mirror']);
  applyAction(game, first, { type: 'playCard', uid: coin.uid });
  assert.equal(game.players[first].coins, 2);
  applyAction(game, first, { type: 'playCard', uid: mirror.uid });
  assert.equal(game.players[first].coins, 4);
});

test('repeatPrevAction: 첫 행동카드가 거울이면 아무 일도 없다', () => {
  const { game, first } = startedGame();
  const [mirror] = setHand(game, first, ['test_ec_mirror']);
  assert.doesNotThrow(() => applyAction(game, first, { type: 'playCard', uid: mirror.uid }));
  assert.equal(game.players[first].coins, 0);
  assert.equal(game.turnState.prevAction, null);
  assert.deepEqual(game.turnState.lastAction, { cardId: 'test_ec_mirror', upgraded: false });
});

test('repeatPrevAction: 거울 뒤 거울은 무한 반복하지 않는다', () => {
  const { game, first } = startedGame();
  const [mirror1, mirror2] = setHand(game, first, ['test_ec_mirror', 'test_ec_mirror']);
  applyAction(game, first, { type: 'playCard', uid: mirror1.uid });
  assert.doesNotThrow(() => applyAction(game, first, { type: 'playCard', uid: mirror2.uid }));
  assert.equal(game.players[first].coins, 0);
  assert.deepEqual(game.turnState.prevAction, { cardId: 'test_ec_mirror', upgraded: false });
});

test('repeatPrevAction: 강화된 카드의 강화 효과를 다시 쓴다', () => {
  const { game, first } = startedGame();
  const [up, mirror] = setHand(game, first, ['test_ec_up', 'test_ec_mirror']);
  up.upgraded = true;
  applyAction(game, first, { type: 'playCard', uid: up.uid });
  assert.equal(game.players[first].coins, 5);
  assert.deepEqual(game.turnState.lastAction, { cardId: 'test_ec_up', upgraded: true });
  applyAction(game, first, { type: 'playCard', uid: mirror.uid });
  assert.equal(game.players[first].coins, 10);
});

test('doubleFirstCostlyAction: 4번째 차례부터 그 차례 첫 ⚡1 행동카드만 두 번 실행', () => {
  const { game, first } = startedGameWithFirst('test_ec_echo');

  // 1~3번째 차례: 두 배 아님
  for (let turn = 1; turn <= 3; turn++) {
    assert.equal(game.players[first].turnsTaken, turn);
    const [coin1] = setHand(game, first, ['test_ec_coin1']);
    applyAction(game, first, { type: 'playCard', uid: coin1.uid });
    assert.equal(game.players[first].coins, 2);
    assert.equal(game.turnState.echoUsed, false);
    passTurn(game, first);
    passTurn(game, 1 - first);
    // 실패한 조작 뒤에는 상태가 통째로 복원되므로 플레이어를 다시 읽는다.
    assert.equal(game.players[first].turnsTaken, turn + 1);
  }

  // 4번째 차례: 첫 ⚡1 은 +4, 두 번째 ⚡1 은 +2
  assert.equal(game.players[first].turnsTaken, 4);
  const [coin1a, coin1b] = setHand(game, first, ['test_ec_coin1', 'test_ec_coin1']);
  applyAction(game, first, { type: 'playCard', uid: coin1a.uid });
  assert.equal(game.players[first].coins, 4);
  assert.equal(game.turnState.echoUsed, true);
  game.players[first].actions = 1; // 두 번째 ⚡1 카드를 낼 행동력
  applyAction(game, first, { type: 'playCard', uid: coin1b.uid });
  assert.equal(game.players[first].coins, 6);
  passTurn(game, first);
    passTurn(game, 1 - first);

  // 5번째 차례: ⚡0 카드는 두 배가 아니고 echoUsed 도 쓰지 않는다
  assert.equal(game.players[first].turnsTaken, 5);
  const [coin0, coin1c] = setHand(game, first, ['test_ec_coin', 'test_ec_coin1']);
  applyAction(game, first, { type: 'playCard', uid: coin0.uid });
  assert.equal(game.players[first].coins, 2);
  assert.equal(game.turnState.echoUsed, false);
  applyAction(game, first, { type: 'playCard', uid: coin1c.uid });
  assert.equal(game.players[first].coins, 6);
  assert.equal(game.turnState.echoUsed, true);
});

test('doubleFirstCostlyAction: 4번째 차례 첫 ⚡1 카드가 두 번 실행된다', () => {
  const { game, first } = startedGameWithFirst('test_ec_echo');
  for (let turn = 1; turn <= 3; turn++) {
    passTurn(game, first);
    passTurn(game, 1 - first);
  }
  assert.equal(game.players[first].turnsTaken, 4);
  const [coin1] = setHand(game, first, ['test_ec_coin1']);
  applyAction(game, first, { type: 'playCard', uid: coin1.uid });
  assert.equal(game.players[first].coins, 4);
  assert.equal(game.turnState.echoUsed, true);
});

test('doubleFirstCostlyAction: 캐릭터가 없으면 4번째 차례에도 두 배 아님', () => {
  const { game, first } = startedGame();
  for (let turn = 1; turn <= 3; turn++) {
    passTurn(game, first);
    passTurn(game, 1 - first);
  }
  assert.equal(game.players[first].turnsTaken, 4);
  const [coin1] = setHand(game, first, ['test_ec_coin1']);
  applyAction(game, first, { type: 'playCard', uid: coin1.uid });
  assert.equal(game.players[first].coins, 2);
  assert.equal(game.turnState.echoUsed, false);
});

test('상태는 JSON 왕복해도 같다', () => {
  const { game, first } = startedGameWithFirst('test_ec_echo');
  const [coin, mirror] = setHand(game, first, ['test_ec_coin', 'test_ec_mirror']);
  applyAction(game, first, { type: 'playCard', uid: coin.uid });
  applyAction(game, first, { type: 'playCard', uid: mirror.uid });
  const copy = JSON.parse(JSON.stringify(game));
  assert.deepEqual(copy, game);
  assert.deepEqual(JSON.parse(JSON.stringify(game.turnState)), game.turnState);
});
