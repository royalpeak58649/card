import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createGame,
  startGame,
  applyAction,
  createCardInstance,
  createMatch,
  applyMatchAction,
  getCandidates,
} from '../engine/index.js';

function newGame(hp = 20) {
  const game = createGame({
    seed: 4242,
    players: [
      { id: 'a', name: 'A', maxHp: hp },
      { id: 'b', name: 'B', maxHp: hp },
    ],
  });
  startGame(game);
  const first = game.firstPlayerIndex;
  return { game, first, second: 1 - first };
}

/** 손패를 무기들로 바꾸고 공격단계에서 모두 낸 뒤 차례를 끝낸다. */
function attackAndEnd(game, p, weaponIds) {
  const player = game.players[p];
  player.drawPile.push(...player.hand);
  player.hand = weaponIds.map((id) => createCardInstance(game, id));
  while (game.phase !== 'attack') applyAction(game, p, { type: 'endPhase' });
  for (const card of [...player.hand]) applyAction(game, p, { type: 'playCard', uid: card.uid });
  applyAction(game, p, { type: 'endPhase' });
}

/** 아무것도 하지 않고 차례를 넘긴다. */
function pass(game, p) {
  while (game.activeIndex === p && game.phase !== 'gameOver') applyAction(game, p, { type: 'endPhase' });
}

test('a. 선공이 후공을 0 이하로 만들어도 경기가 끝나지 않고 후공 차례가 시작된다', () => {
  const { game, first, second } = newGame(5);
  attackAndEnd(game, first, ['assaultRifle']);
  assert.equal(game.players[second].hp, 0);
  assert.notEqual(game.phase, 'gameOver');
  assert.equal(game.activeIndex, second);
  assert.equal(game.phase, 'action');
});

test('b. 후공이 반격하지 못하면 후공 차례 끝에 선공 승리', () => {
  const { game, first, second } = newGame(5);
  attackAndEnd(game, first, ['assaultRifle']);
  pass(game, second);
  assert.equal(game.phase, 'gameOver');
  assert.equal(game.winner, first);
  assert.equal(game.draw, false);
});

test('c-1. 둘 다 0 이하면 체력이 높은 쪽 승리 (후공이 더 높음)', () => {
  const { game, first, second } = newGame(5);
  attackAndEnd(game, first, ['assaultRifle']); // 후공 0
  attackAndEnd(game, second, ['assaultRifle', 'assaultRifle']); // 선공 -5
  assert.equal(game.players[second].hp, 0);
  assert.equal(game.players[first].hp, -5);
  assert.equal(game.phase, 'gameOver');
  assert.equal(game.winner, second);
});

test('c-2. 둘 다 0 이하면 체력이 높은 쪽 승리 (선공이 더 높음)', () => {
  const { game, first, second } = newGame(5);
  attackAndEnd(game, first, ['assaultRifle', 'assaultRifle']); // 후공 -5
  attackAndEnd(game, second, ['assaultRifle', 'pistol']); // 선공 -1
  assert.equal(game.players[first].hp, -1);
  assert.equal(game.players[second].hp, -5);
  assert.equal(game.winner, first);
});

test('d. 둘 다 0 이하이고 체력이 같으면 무승부', () => {
  const { game, first, second } = newGame(5);
  attackAndEnd(game, first, ['assaultRifle', 'pistol']); // 후공 -1
  attackAndEnd(game, second, ['assaultRifle', 'pistol']); // 선공 -1
  assert.equal(game.phase, 'gameOver');
  assert.equal(game.winner, null);
  assert.equal(game.draw, true);
});

test('e. 후공이 선공을 0 이하로 만들면 그 차례 끝에 후공 승리', () => {
  const { game, first, second } = newGame(5);
  pass(game, first);
  attackAndEnd(game, second, ['assaultRifle']);
  assert.equal(game.phase, 'gameOver');
  assert.equal(game.winner, second);
});

test('f. 선공 차례 끝에는 판정하지 않는다', () => {
  const { game, first, second } = newGame(5);
  game.players[first].hp = -3;
  pass(game, first);
  assert.notEqual(game.phase, 'gameOver');
  assert.equal(game.activeIndex, second);
  pass(game, second);
  assert.equal(game.phase, 'gameOver');
  assert.equal(game.winner, second);
});

test('g. 체력은 음수로 유지된다', () => {
  const { game, first, second } = newGame(5);
  attackAndEnd(game, first, ['assaultRifle', 'assaultRifle', 'assaultRifle']);
  assert.equal(game.players[second].hp, -10);
});

test('h. 경기(match)로 진행해 무승부면 finished + draw', () => {
  const match = createMatch({ seed: 99, players: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }] });
  applyMatchAction(match, 0, { type: 'selectCharacter', characterId: 'hayun' });
  applyMatchAction(match, 1, { type: 'selectCharacter', characterId: 'hayun' });
  applyMatchAction(match, 0, { type: 'draft', cardIds: getCandidates('hayun').slice(0, 4) });
  applyMatchAction(match, 1, { type: 'draft', cardIds: getCandidates('hayun').slice(0, 4) });
  const game = match.game;
  const first = game.firstPlayerIndex;
  const second = 1 - first;
  game.players[0].hp = 1;
  game.players[1].hp = 1;
  for (const p of [first, second]) {
    const player = game.players[p];
    player.drawPile.push(...player.hand);
    player.hand = [createCardInstance(game, 'pistol'), createCardInstance(game, 'pistol')];
    while (game.phase !== 'attack') applyMatchAction(match, p, { type: 'game', action: { type: 'endPhase' } });
    for (const card of [...player.hand]) {
      applyMatchAction(match, p, { type: 'game', action: { type: 'playCard', uid: card.uid } });
    }
    applyMatchAction(match, p, { type: 'game', action: { type: 'endPhase' } });
  }
  assert.equal(match.stage, 'finished');
  assert.equal(match.draw, true);
  assert.equal(match.winner, null);
});
