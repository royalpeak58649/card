import test from 'node:test';
import assert from 'node:assert/strict';

import { createGame, createCardInstance, drawCards, getPurchasePrice } from '../engine/state.js';
import { getCardDef } from '../engine/cards/registry.js';

const PLAYERS = [
  { id: 'p0', name: '플레이어0', maxHp: 20 },
  { id: 'p1', name: '플레이어1', maxHp: 20 },
];

function newGame(seed = 12345) {
  return createGame({ seed, players: PLAYERS.map((p) => ({ ...p })) });
}

test('같은 seed 면 같은 게임 상태', () => {
  const a = createGame({ seed: 777, players: PLAYERS.map((p) => ({ ...p })) });
  const b = createGame({ seed: 777, players: PLAYERS.map((p) => ({ ...p })) });
  assert.equal(JSON.stringify(a), JSON.stringify(b));
});

test('다른 seed 10개 중 적어도 하나는 손패 순서가 다르다', () => {
  const base = newGame(1).players[0].hand.map((c) => c.cardId).join(',');
  let differs = false;
  for (let seed = 2; seed <= 11; seed++) {
    const hand = newGame(seed).players[0].hand.map((c) => c.cardId).join(',');
    if (hand !== base) differs = true;
  }
  assert.ok(differs);
});

test('시작 덱 구성', () => {
  const game = newGame();
  for (const player of game.players) {
    assert.equal(player.hand.length, 5);
    assert.equal(player.drawPile.length, 5);
    assert.equal(player.discard.length, 0);
    const all = [...player.hand, ...player.drawPile, ...player.discard];
    assert.equal(all.length, 10);
    assert.equal(all.filter((c) => c.cardId === 'stone').length, 6);
    assert.equal(all.filter((c) => c.cardId === 'pistol').length, 4);
    assert.equal(player.hp, player.maxHp);
    assert.equal(player.stars, 0);
  }
});

test('모든 카드 인스턴스의 uid 가 서로 다르다', () => {
  const game = newGame();
  const uids = game.players.flatMap((p) => [...p.hand, ...p.drawPile, ...p.discard]).map((c) => c.uid);
  assert.equal(new Set(uids).size, uids.length);
});

test('시장 구성', () => {
  const game = newGame();
  const expected = {
    stone: 30,
    silver: 30,
    gold: 20,
    pistol: 30,
    rifle: 12,
    assaultRifle: 10,
  };
  assert.deepEqual(Object.keys(game.market).sort(), Object.keys(expected).sort());
  for (const [id, count] of Object.entries(expected)) {
    assert.equal(game.market[id].count, count);
    assert.equal(game.market[id].bought, 0);
  }
});

test('drawCards 는 discard 를 섞어 재활용한다', () => {
  const game = newGame();
  const player = game.players[0];
  // drawPile 을 비우고 discard 에 3장을 둔다
  player.discard.push(...player.drawPile.splice(0, player.drawPile.length));
  player.discard.push(...player.hand.splice(0, 3));
  player.hand.length = 2;
  player.discard.length = 3;
  assert.equal(player.drawPile.length, 0);
  assert.equal(player.discard.length, 3);

  const handBefore = player.hand.length;
  assert.equal(drawCards(game, 0, 2), 2);
  assert.equal(player.hand.length, handBefore + 2);
  assert.equal(player.drawPile.length, 1);
  assert.equal(player.discard.length, 0);

  assert.equal(drawCards(game, 0, 5), 1);
  assert.equal(player.hand.length, handBefore + 3);
  assert.equal(player.drawPile.length, 0);
  assert.equal(player.discard.length, 0);
});

test('getPurchasePrice', () => {
  const game = newGame();
  assert.equal(getPurchasePrice(game, 'stone'), 0);
  assert.equal(getPurchasePrice(game, 'pistol'), 0);

  assert.equal(getPurchasePrice(game, 'rifle'), 6);
  game.market.rifle.bought = 1;
  assert.equal(getPurchasePrice(game, 'rifle'), 6);
  game.market.rifle.bought = 2;
  assert.equal(getPurchasePrice(game, 'rifle'), 5);

  assert.equal(getPurchasePrice(game, 'assaultRifle'), 9);
  game.market.assaultRifle.bought = 1;
  assert.equal(getPurchasePrice(game, 'assaultRifle'), 9);
  game.market.assaultRifle.bought = 2;
  assert.equal(getPurchasePrice(game, 'assaultRifle'), 8);
});

test('게임 상태는 JSON 직렬화 가능', () => {
  const game = newGame();
  assert.deepStrictEqual(JSON.parse(JSON.stringify(game)), game);
});

test('플레이어 수가 2명이 아니면 Error', () => {
  assert.throws(() => createGame({ seed: 1, players: [PLAYERS[0]] }), Error);
  assert.throws(() => createGame({ seed: 1, players: [...PLAYERS, { id: 'p2', name: 'x', maxHp: 20 }] }), Error);
});

test('알 수 없는 카드는 Error', () => {
  assert.throws(() => getCardDef('없는카드'), Error);
});

test('createCardInstance 는 uid 를 증가시킨다', () => {
  const game = newGame();
  const before = game.nextUid;
  const card = createCardInstance(game, 'stone');
  assert.equal(card.uid, 'c' + before);
  assert.equal(card.cardId, 'stone');
  assert.equal(card.upgraded, false);
  assert.equal(game.nextUid, before + 1);
});
