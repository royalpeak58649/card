import test from 'node:test';
import assert from 'node:assert/strict';

import { createGame, createCardInstance } from '../engine/state.js';
import { registerCards } from '../engine/cards/registry.js';
import { startGame, applyAction } from '../engine/turn.js';

registerCards({
  test_ch_trash: {
    id: 'test_ch_trash',
    name: '테스트 제거',
    type: 'action',
    actionCost: 0,
    cost: 1,
    effects: [
      { op: 'trashFromHand', n: 1 },
      { op: 'gainCoins', n: 2 },
    ],
  },
  test_ch_retrieve: {
    id: 'test_ch_retrieve',
    name: '테스트 회수',
    type: 'action',
    actionCost: 0,
    cost: 1,
    effects: [{ op: 'retrieveFromDiscard', n: 1, filter: 'weapon', to: 'deckTop' }],
  },
  test_ch_retrieve_hand: {
    id: 'test_ch_retrieve_hand',
    name: '테스트 회수(손)',
    type: 'action',
    actionCost: 0,
    cost: 1,
    effects: [{ op: 'retrieveFromDiscard', n: 1, filter: 'weapon', to: 'hand' }],
  },
  test_ch_trash_discard: {
    id: 'test_ch_trash_discard',
    name: '테스트 버린더미 제거',
    type: 'action',
    actionCost: 0,
    cost: 1,
    effects: [{ op: 'trashFromDiscard', n: 2 }],
  },
  test_ch_gain: {
    id: 'test_ch_gain',
    name: '테스트 시장 획득',
    type: 'action',
    actionCost: 0,
    cost: 1,
    effects: [{ op: 'gainFromMarket', filter: 'weapon', maxCost: 5, to: 'hand' }],
  },
  test_ch_exchange: {
    id: 'test_ch_exchange',
    name: '테스트 군수 전환',
    type: 'action',
    actionCost: 0,
    cost: 1,
    effects: [{ op: 'exchangeForWeapon', plus: 3, allowDiscard: false }],
  },
  test_ch_exchange_discard: {
    id: 'test_ch_exchange_discard',
    name: '테스트 군수 전환(버리기)',
    type: 'action',
    actionCost: 0,
    cost: 1,
    effects: [{ op: 'exchangeForWeapon', plus: 4, allowDiscard: true }],
  },
  test_ch_exchange_then_coin: {
    id: 'test_ch_exchange_then_coin',
    name: '테스트 군수 전환+원',
    type: 'action',
    actionCost: 0,
    cost: 1,
    effects: [
      { op: 'exchangeForWeapon', plus: 3, allowDiscard: false },
      { op: 'gainCoins', n: 1 },
    ],
  },
});

const PLAYERS = [
  { id: 'p0', name: '플레이어0', maxHp: 20 },
  { id: 'p1', name: '플레이어1', maxHp: 20 },
];

/** 시작된 게임과 선공 인덱스 */
function startedGame(seed = 12345) {
  const game = createGame({ seed, players: PLAYERS.map((p) => ({ ...p })) });
  startGame(game);
  return { game, first: game.activeIndex };
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

/** 손패에 카드를 추가한다. */
function addToHand(game, playerIndex, cardId) {
  const card = createCardInstance(game, cardId);
  game.players[playerIndex].hand.push(card);
  return card;
}

test('trashFromHand: 선택하면 제거되고 남은 효과가 이어진다', () => {
  const { game, first } = startedGame();
  const player = game.players[first];
  const [action] = setHand(game, first, ['test_ch_trash']);
  const stone = addToHand(game, first, 'stone');

  applyAction(game, first, { type: 'playCard', uid: action.uid });
  assert.ok(game.pending);
  assert.equal(game.pending.playerIndex, first);
  assert.deepEqual(game.pending.options, [stone.uid]);
  assert.equal(player.coins, 0);

  applyAction(game, first, { type: 'choose', selection: [stone.uid] });
  assert.equal(game.pending, null);
  assert.equal(game.trash.length, 1);
  assert.equal(game.trash[0].uid, stone.uid);
  assert.equal(player.coins, 2);
});

test('trashFromHand: 빈 선택도 허용된다(min 0)', () => {
  const { game, first } = startedGame();
  const player = game.players[first];
  const [action] = setHand(game, first, ['test_ch_trash']);
  addToHand(game, first, 'stone');

  applyAction(game, first, { type: 'playCard', uid: action.uid });
  applyAction(game, first, { type: 'choose', selection: [] });
  assert.equal(game.pending, null);
  assert.equal(game.trash.length, 0);
  assert.equal(player.coins, 2);
});

test('trashFromHand: 선택지가 없으면 pending 없이 진행된다', () => {
  const { game, first } = startedGame();
  const player = game.players[first];
  const [action] = setHand(game, first, ['test_ch_trash']);

  applyAction(game, first, { type: 'playCard', uid: action.uid });
  assert.equal(game.pending, null);
  assert.equal(player.coins, 2);
});

test('pending 중에는 choose 외 조작이 Error', () => {
  const { game, first } = startedGame();
  const [action] = setHand(game, first, ['test_ch_trash']);
  addToHand(game, first, 'stone');
  applyAction(game, first, { type: 'playCard', uid: action.uid });

  assert.throws(() => applyAction(game, first, { type: 'endPhase' }), /먼저 선택을 끝내야 합니다/);
  assert.throws(
    () => applyAction(game, first, { type: 'playCard', uid: game.players[first].hand[0].uid }),
    /먼저 선택을 끝내야 합니다/,
  );
  assert.throws(() => applyAction(game, first, { type: 'buy', cardId: 'stone' }), /먼저 선택을 끝내야 합니다/);
  assert.ok(game.pending);
});

test('잘못된 선택은 Error 이고 상태가 바뀌지 않는다', () => {
  const { game, first } = startedGame();
  const [action] = setHand(game, first, ['test_ch_trash']);
  const stone = addToHand(game, first, 'stone');
  applyAction(game, first, { type: 'playCard', uid: action.uid });

  const before = JSON.stringify(game);
  assert.throws(() => applyAction(game, first, { type: 'choose', selection: ['없는uid'] }), Error);
  assert.equal(JSON.stringify(game), before);
  assert.throws(() => applyAction(game, first, { type: 'choose', selection: [stone.uid, stone.uid] }), Error);
  assert.equal(JSON.stringify(game), before);
  assert.throws(() => applyAction(game, first, { type: 'choose', selection: [stone.uid, 'x'] }), Error);
  assert.equal(JSON.stringify(game), before);
  assert.ok(game.pending);
});

test('pending 이 없을 때 choose 는 Error', () => {
  const { game, first } = startedGame();
  assert.throws(() => applyAction(game, first, { type: 'choose', selection: [] }), Error);
});

test('retrieveFromDiscard: deckTop 은 drawPile 맨 위(끝)로 간다', () => {
  const { game, first } = startedGame();
  const player = game.players[first];
  const [action] = setHand(game, first, ['test_ch_retrieve']);
  const [pistol, stone] = setDiscard(game, first, ['pistol', 'stone']);

  applyAction(game, first, { type: 'playCard', uid: action.uid });
  assert.deepEqual(game.pending.options, [pistol.uid]);

  applyAction(game, first, { type: 'choose', selection: [pistol.uid] });
  assert.equal(game.pending, null);
  assert.equal(player.drawPile[player.drawPile.length - 1].uid, pistol.uid);
  assert.equal(player.discard.length, 1);
  assert.equal(player.discard[0].uid, stone.uid);
});

test('retrieveFromDiscard: to hand', () => {
  const { game, first } = startedGame();
  const player = game.players[first];
  const [action] = setHand(game, first, ['test_ch_retrieve_hand']);
  const [pistol] = setDiscard(game, first, ['pistol', 'stone']);

  applyAction(game, first, { type: 'playCard', uid: action.uid });
  applyAction(game, first, { type: 'choose', selection: [pistol.uid] });
  assert.equal(player.hand[player.hand.length - 1].uid, pistol.uid);
  assert.equal(player.discard.length, 1);
});

test('trashFromDiscard: 3장 중 2장 제거', () => {
  const { game, first } = startedGame();
  const player = game.players[first];
  const [action] = setHand(game, first, ['test_ch_trash_discard']);
  const [a, b, c] = setDiscard(game, first, ['stone', 'pistol', 'stone']);

  applyAction(game, first, { type: 'playCard', uid: action.uid });
  assert.equal(game.pending.max, 2);
  applyAction(game, first, { type: 'choose', selection: [a.uid, c.uid] });
  assert.equal(game.trash.length, 2);
  assert.deepEqual(game.trash.map((x) => x.uid), [a.uid, c.uid]);
  assert.equal(player.discard.length, 1);
  assert.equal(player.discard[0].uid, b.uid);
});

test('gainFromMarket: 기본 구매가 기준으로 고르고 bought 는 늘지 않는다', () => {
  const { game, first } = startedGame();
  const player = game.players[first];
  const [action] = setHand(game, first, ['test_ch_gain']);

  applyAction(game, first, { type: 'playCard', uid: action.uid });
  assert.ok(game.pending.options.includes('pistol'));
  assert.ok(game.pending.options.includes('rifle'));
  assert.equal(game.pending.options.includes('assaultRifle'), false);
  assert.equal(game.pending.min, 1);
  assert.equal(game.pending.max, 1);

  applyAction(game, first, { type: 'choose', selection: ['rifle'] });
  assert.equal(game.pending, null);
  assert.equal(player.hand[player.hand.length - 1].cardId, 'rifle');
  assert.equal(game.market.rifle.count, 11);
  assert.equal(game.market.rifle.bought, 0);
  assert.deepEqual(game.turnState.bought, []);
});

test('exchangeForWeapon: 재화카드를 제거하고 무기를 얻는다', () => {
  const { game, first } = startedGame();
  const player = game.players[first];
  const [action] = setHand(game, first, ['test_ch_exchange']);
  const silver = addToHand(game, first, 'silver');

  applyAction(game, first, { type: 'playCard', uid: action.uid });
  assert.deepEqual(game.pending.options, [silver.uid]);
  applyAction(game, first, { type: 'choose', selection: [silver.uid] });

  assert.equal(game.trash.length, 1);
  assert.equal(game.trash[0].uid, silver.uid);
  assert.ok(game.pending);
  assert.ok(game.pending.options.includes('rifle'));
  assert.equal(game.pending.options.includes('assaultRifle'), false);

  applyAction(game, first, { type: 'choose', selection: ['rifle'] });
  assert.equal(game.pending, null);
  assert.equal(player.hand[player.hand.length - 1].cardId, 'rifle');
  assert.equal(game.market.rifle.count, 11);
  assert.equal(game.market.rifle.bought, 0);
});

test('exchangeForWeapon: allowDiscard 면 버린 더미로 보낼 수 있다', () => {
  const { game, first } = startedGame();
  const player = game.players[first];
  const [action] = setHand(game, first, ['test_ch_exchange_discard']);
  const silver = addToHand(game, first, 'silver');

  applyAction(game, first, { type: 'playCard', uid: action.uid });
  applyAction(game, first, { type: 'choose', selection: [silver.uid] });
  assert.deepEqual(game.pending.options, ['trash', 'discard']);

  applyAction(game, first, { type: 'choose', selection: ['discard'] });
  assert.equal(player.discard.length, 1);
  assert.equal(player.discard[0].uid, silver.uid);
  assert.equal(game.trash.length, 0);
  assert.ok(game.pending.options.includes('rifle'));
  assert.equal(game.pending.options.includes('assaultRifle'), false);

  applyAction(game, first, { type: 'choose', selection: ['rifle'] });
  assert.equal(game.pending, null);
  assert.equal(player.hand[player.hand.length - 1].cardId, 'rifle');
});

test('연쇄 선택 도중 JSON 으로 저장했다가 이어서 진행할 수 있다', () => {
  const { game, first } = startedGame();
  const player = game.players[first];
  const [action] = setHand(game, first, ['test_ch_exchange']);
  const silver = addToHand(game, first, 'silver');

  applyAction(game, first, { type: 'playCard', uid: action.uid });
  applyAction(game, first, { type: 'choose', selection: [silver.uid] });

  const restored = JSON.parse(JSON.stringify(game));
  assert.deepEqual(restored, game);
  applyAction(restored, first, { type: 'choose', selection: ['rifle'] });

  assert.equal(restored.pending, null);
  assert.equal(restored.players[first].hand[restored.players[first].hand.length - 1].cardId, 'rifle');
  assert.equal(restored.trash.length, 1);
  assert.equal(restored.trash[0].uid, silver.uid);
  assert.equal(restored.market.rifle.count, 11);
  assert.equal(restored.players[first].hand.filter((c) => c.cardId === 'rifle').length, 1);
  assert.equal(player.hand.filter((c) => c.cardId === 'rifle').length, 0);
});

test('연쇄 선택 뒤에 남은 효과도 실행된다', () => {
  const { game, first } = startedGame();
  const player = game.players[first];
  const [action] = setHand(game, first, ['test_ch_exchange_then_coin']);
  const silver = addToHand(game, first, 'silver');

  applyAction(game, first, { type: 'playCard', uid: action.uid });
  applyAction(game, first, { type: 'choose', selection: [silver.uid] });
  assert.equal(player.coins, 0);
  applyAction(game, first, { type: 'choose', selection: ['rifle'] });
  assert.equal(game.pending, null);
  assert.equal(player.coins, 1);
});
