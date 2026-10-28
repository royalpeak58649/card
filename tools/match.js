// 한 판을 끝까지 두는 공용 함수. 시뮬레이터(tools/sim.js)와 조정 도구(tools/tune.js)가 같이 쓴다.
import {
  createGame,
  startGame,
  applyAction,
  addMarketPile,
  getFaction,
  getCharacter,
  allCharacterIds,
  NEUTRAL_CARD_IDS,
} from '../engine/index.js';
import { chooseAiAction } from '../engine/ai.js';
import { chooseSmartAction } from '../engine/aiSmart.js';

/** 캐릭터 후보 */
export const CHARACTER_IDS = allCharacterIds();
/** 한 플레이어가 시장에 넣는 진영 카드 종류 수 */
export const FACTION_PICKS = 4;
/** 한 플레이어가 시장에 넣는 중립 카드 종류 수 */
export const NEUTRAL_PICKS = 2;
/** 이 차례 수를 넘으면 무승부 */
export const MAX_TURNS = 200;
/** 이 조작 수를 넘으면 무승부 */
export const MAX_ACTIONS = 10000;

/**
 * mulberry32 시드 난수기를 만든다.
 * @param {number} seed
 * @returns {() => number} [0, 1) 실수
 */
export function mulberry32(seed) {
  let state = seed >>> 0;
  return function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 0 이상 n 미만의 정수.
 * @param {() => number} rand
 * @param {number} n
 * @returns {number}
 */
export function randInt(rand, n) {
  return Math.floor(rand() * n);
}

/**
 * 배열에서 중복 없이 n 개를 뽑는다(원본은 바꾸지 않는다).
 * @template T
 * @param {() => number} rand
 * @param {T[]} arr
 * @param {number} n
 * @returns {T[]}
 */
export function sample(rand, arr, n) {
  const pool = arr.slice();
  const picked = [];
  while (picked.length < n && pool.length > 0) {
    picked.push(pool.splice(randInt(rand, pool.length), 1)[0]);
  }
  return picked;
}

/**
 * 한 판을 끝까지 둔다. 같은 인자면 결과가 항상 같다.
 * @param {{
 *   seed: number,
 *   characterIds: [string, string],
 *   ai?: [string, string],
 *   values?: [Record<string, Record<string, number>>|undefined, Record<string, Record<string, number>>|undefined],
 *   picks?: { cardIds: [string[], string[]], neutralIds: string[] },
 * }} opts
 * @returns {{
 *   winner: number|null, draw: boolean, turns: number, actions: number,
 *   firstPlayerIndex: number, characterIds: string[],
 *   marketIds: string[][], factionIds: string[][], deckIds: string[][]
 * }}
 */
export function playMatch({ seed, characterIds, ai = ['smart', 'smart'], values = [undefined, undefined], picks }) {
  const rand = mulberry32(seed);
  const game = createGame({
    seed,
    players: [
      { id: 'a', name: 'A', characterId: characterIds[0] },
      { id: 'b', name: 'B', characterId: characterIds[1] },
    ],
  });

  /** @type {string[][]} 각 플레이어가 시장에 넣은 카드(진영 4종 + 중립 2종) */
  const marketIds = [[], []];
  /** @type {string[][]} 각 플레이어가 시장에 넣은 진영 카드만 */
  const factionIds = [[], []];
  if (picks) {
    for (let p = 0; p < 2; p++) {
      for (const cardId of picks.cardIds[p]) {
        if (Object.prototype.hasOwnProperty.call(game.market, cardId)) continue;
        addMarketPile(game, cardId);
        marketIds[p].push(cardId);
        factionIds[p].push(cardId);
      }
      for (const cardId of picks.neutralIds) {
        if (Object.prototype.hasOwnProperty.call(game.market, cardId)) continue;
        addMarketPile(game, cardId);
        marketIds[p].push(cardId);
      }
    }
  } else {
    for (let p = 0; p < 2; p++) {
      const character = getCharacter(characterIds[p]);
      const factionCards = getFaction(character.factionId).cardIds;
      const candidates = [...factionCards, ...character.cardIds];
      for (const cardId of sample(rand, candidates, FACTION_PICKS)) {
        if (Object.prototype.hasOwnProperty.call(game.market, cardId)) continue;
        addMarketPile(game, cardId);
        marketIds[p].push(cardId);
        factionIds[p].push(cardId);
      }
      for (const cardId of sample(rand, NEUTRAL_CARD_IDS, NEUTRAL_PICKS)) {
        if (Object.prototype.hasOwnProperty.call(game.market, cardId)) continue;
        addMarketPile(game, cardId);
        marketIds[p].push(cardId);
      }
    }
  }

  startGame(game);

  let actions = 0;
  while (game.phase !== 'gameOver' && game.turn <= MAX_TURNS && actions < MAX_ACTIONS) {
    const playerIndex = game.pending ? game.pending.playerIndex : game.activeIndex;
    const action =
      ai[playerIndex] === 'basic'
        ? chooseAiAction(game, playerIndex)
        : chooseSmartAction(game, playerIndex, { values: values[playerIndex] });
    if (!action) break;
    applyAction(game, playerIndex, action);
    actions++;
  }

  const deckIds = game.players.map((player) =>
    [...player.hand, ...player.drawPile, ...player.discard, ...player.inPlay].map((c) => c.cardId),
  );

  return {
    winner: game.phase === 'gameOver' ? game.winner : null,
    draw: game.phase === 'gameOver' && game.draw === true,
    turns: game.turn,
    actions,
    firstPlayerIndex: game.firstPlayerIndex,
    characterIds: [...characterIds],
    marketIds,
    factionIds,
    deckIds,
  };
}
