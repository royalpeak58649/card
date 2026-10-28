import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createGame,
  startGame,
  applyAction,
  addMarketPile,
  getFaction,
  getCharacter,
  NEUTRAL_CARD_IDS,
} from '../engine/index.js';
import { chooseAiAction } from '../engine/ai.js';

/** 이 차례 수를 넘으면 무승부 */
const MAX_TURNS = 200;
/** 이 조작 수를 넘으면 무승부 */
const MAX_ACTIONS = 10000;

/**
 * AI 끼리 한 판을 끝까지 둔다. 모든 조작은 applyAction 에서 Error 가 나면 안 된다.
 * @param {number} seed
 * @returns {{ winner: number|null, turns: number, actions: number }}
 */
function playAiGame(seed) {
  const game = createGame({
    seed,
    players: [
      { id: 'a', name: 'A', characterId: 'hayun' },
      { id: 'b', name: 'B', characterId: 'kangjin' },
    ],
  });
  const marketIds = [
    ...getFaction(getCharacter('hayun').factionId).cardIds,
    ...getCharacter('hayun').cardIds,
    ...getCharacter('kangjin').cardIds,
    ...NEUTRAL_CARD_IDS.slice(0, 4),
  ];
  for (const cardId of marketIds) {
    if (Object.prototype.hasOwnProperty.call(game.market, cardId)) continue;
    addMarketPile(game, cardId);
  }
  startGame(game);

  let actions = 0;
  while (game.phase !== 'gameOver' && game.turn <= MAX_TURNS && actions < MAX_ACTIONS) {
    const playerIndex = game.pending ? game.pending.playerIndex : game.activeIndex;
    const action = chooseAiAction(game, playerIndex);
    assert.ok(action, `조작을 고르지 못했습니다(seed ${seed}, turn ${game.turn})`);
    applyAction(game, playerIndex, action);
    actions++;
  }

  return {
    winner: game.phase === 'gameOver' ? game.winner : null,
    turns: game.turn,
    actions,
  };
}

test('AI 끼리 끝까지 두면 Error 없이 끝나고 대부분 승자가 난다', () => {
  const seeds = [1, 2, 3];
  let decided = 0;
  for (const seed of seeds) {
    const result = playAiGame(seed);
    assert.ok(result.turns <= MAX_TURNS, `차례 수 초과: ${result.turns}`);
    assert.ok(result.actions < MAX_ACTIONS, `조작 수 초과: ${result.actions}`);
    if (result.winner !== null) decided++;
  }
  assert.ok(decided >= 2, `승자가 난 판이 부족합니다: ${decided}/${seeds.length}`);
});

test('같은 seed 로 두 번 돌리면 결과가 같다', () => {
  for (const seed of [7, 11]) {
    const first = playAiGame(seed);
    const second = playAiGame(seed);
    assert.deepEqual(second, first);
  }
});

test('차례가 아니고 선택 대기 중도 아니면 null 을 돌려준다', () => {
  const game = createGame({
    seed: 5,
    players: [
      { id: 'a', name: 'A', characterId: 'hayun' },
      { id: 'b', name: 'B', characterId: 'kangjin' },
    ],
  });
  startGame(game);
  assert.equal(chooseAiAction(game, 1 - game.activeIndex), null);
  assert.ok(chooseAiAction(game, game.activeIndex));
});
