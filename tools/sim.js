// AI 끼리 대전시켜 밸런스를 확인하는 시뮬레이터.
// 사용법: node tools/sim.js --games 500 --seed 1
import {
  createGame,
  startGame,
  applyAction,
  addMarketPile,
  getCardDef,
  getFaction,
  getCharacter,
  NEUTRAL_CARD_IDS,
} from '../engine/index.js';
import { chooseAiAction } from '../engine/ai.js';

/** 캐릭터 후보 */
const CHARACTER_IDS = ['hayun', 'kangjin'];
/** 한 플레이어가 시장에 넣는 진영 카드 종류 수 */
const FACTION_PICKS = 4;
/** 한 플레이어가 시장에 넣는 중립 카드 종류 수 */
const NEUTRAL_PICKS = 2;
/** 이 차례 수를 넘으면 무승부 */
const MAX_TURNS = 200;
/** 이 조작 수를 넘으면 무승부 */
const MAX_ACTIONS = 10000;

/**
 * mulberry32 시드 난수기를 만든다.
 * @param {number} seed
 * @returns {() => number} [0, 1) 실수
 */
function mulberry32(seed) {
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
function randInt(rand, n) {
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
function sample(rand, arr, n) {
  const pool = arr.slice();
  const picked = [];
  while (picked.length < n && pool.length > 0) {
    picked.push(pool.splice(randInt(rand, pool.length), 1)[0]);
  }
  return picked;
}

/**
 * 명령줄 인자를 읽는다.
 * @param {string[]} argv
 * @returns {{ games: number, seed: number }}
 */
function parseArgs(argv) {
  let games = 500;
  let seed = 1;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--games' && argv[i + 1] !== undefined) {
      games = Number(argv[++i]);
    } else if (arg === '--seed' && argv[i + 1] !== undefined) {
      seed = Number(argv[++i]);
    }
  }
  if (!Number.isFinite(games) || games < 1) games = 500;
  if (!Number.isFinite(seed)) seed = 1;
  return { games: Math.floor(games), seed: Math.floor(seed) };
}

/**
 * 한 판을 끝까지 둔다.
 * @param {number} seed
 * @returns {{
 *   winner: number|null, turns: number, actions: number,
 *   firstPlayerIndex: number, characterIds: string[],
 *   stocked: string[][], finalDecks: string[][]
 * }}
 */
export function playGame(seed) {
  const rand = mulberry32(seed);
  const characterIds = [
    CHARACTER_IDS[randInt(rand, CHARACTER_IDS.length)],
    CHARACTER_IDS[randInt(rand, CHARACTER_IDS.length)],
  ];

  const game = createGame({
    seed,
    players: [
      { id: 'a', name: 'A', characterId: characterIds[0] },
      { id: 'b', name: 'B', characterId: characterIds[1] },
    ],
  });

  /** @type {string[][]} */
  const stocked = [[], []];
  for (let p = 0; p < 2; p++) {
    const character = getCharacter(characterIds[p]);
    const factionCards = getFaction(character.factionId).cardIds;
    const candidates = [...factionCards, ...character.cardIds];
    const picks = [
      ...sample(rand, candidates, FACTION_PICKS),
      ...sample(rand, NEUTRAL_CARD_IDS, NEUTRAL_PICKS),
    ];
    for (const cardId of picks) {
      if (Object.prototype.hasOwnProperty.call(game.market, cardId)) continue;
      addMarketPile(game, cardId);
      stocked[p].push(cardId);
    }
  }

  startGame(game);

  let actions = 0;
  while (game.phase !== 'gameOver' && game.turn <= MAX_TURNS && actions < MAX_ACTIONS) {
    const playerIndex = game.pending ? game.pending.playerIndex : game.activeIndex;
    const action = chooseAiAction(game, playerIndex);
    if (!action) break;
    applyAction(game, playerIndex, action);
    actions++;
  }

  const finalDecks = game.players.map((player) =>
    [...player.drawPile, ...player.hand, ...player.discard, ...player.inPlay].map((c) => c.cardId),
  );

  return {
    winner: game.phase === 'gameOver' ? game.winner : null,
    turns: game.turn,
    actions,
    firstPlayerIndex: game.firstPlayerIndex,
    characterIds,
    stocked,
    finalDecks,
  };
}

/**
 * 승률을 소수 둘째 자리 퍼센트 문자열로 만든다.
 * @param {number} wins
 * @param {number} games
 * @returns {string}
 */
function pct(wins, games) {
  if (games === 0) return '-';
  return `${((wins / games) * 100).toFixed(1)}%`;
}

/**
 * 시뮬레이션을 돌리고 결과를 출력한다.
 * @param {{ games: number, seed: number }} opts
 * @returns {void}
 */
export function runSim({ games, seed }) {
  let draws = 0;
  let totalTurns = 0;
  let firstWins = 0;
  let decided = 0;

  /** @type {Map<string, { games: number, wins: number }>} */
  const byCharacter = new Map();
  /** @type {Map<string, { stocked: number, stockedWins: number, held: number, heldWins: number }>} */
  const byCard = new Map();

  const cardEntry = (cardId) => {
    let entry = byCard.get(cardId);
    if (!entry) {
      entry = { stocked: 0, stockedWins: 0, held: 0, heldWins: 0 };
      byCard.set(cardId, entry);
    }
    return entry;
  };

  for (let i = 0; i < games; i++) {
    const result = playGame(seed + i);
    totalTurns += result.turns;

    for (let p = 0; p < 2; p++) {
      const characterId = result.characterIds[p];
      let entry = byCharacter.get(characterId);
      if (!entry) {
        entry = { games: 0, wins: 0 };
        byCharacter.set(characterId, entry);
      }
      entry.games += 1;
      if (result.winner === p) entry.wins += 1;
    }

    if (result.winner === null) {
      draws += 1;
    } else {
      decided += 1;
      if (result.winner === result.firstPlayerIndex) firstWins += 1;
    }

    for (let p = 0; p < 2; p++) {
      const won = result.winner === p;
      for (const cardId of result.stocked[p]) {
        const entry = cardEntry(cardId);
        entry.stocked += 1;
        if (won) entry.stockedWins += 1;
      }
      const deck = new Set(result.finalDecks[p]);
      for (const cardId of deck) {
        const entry = cardEntry(cardId);
        entry.held += 1;
        if (won) entry.heldWins += 1;
      }
    }
  }

  console.log(`총 판수: ${games} (seed ${seed})`);
  console.log(`무승부: ${draws}`);
  console.log(`평균 차례 수: ${(totalTurns / games).toFixed(1)}`);
  console.log(`선공 승률: ${pct(firstWins, decided)} (${firstWins}/${decided})`);

  console.log('캐릭터별 승률:');
  for (const [characterId, entry] of byCharacter) {
    const name = getCharacter(characterId).name;
    console.log(
      `  ${name}(${characterId}): ${pct(entry.wins, entry.games)} (등장 ${entry.games}, 승 ${entry.wins})`,
    );
  }

  const rows = [...byCard.entries()].map(([cardId, entry]) => ({
    cardId,
    name: getCardDef(cardId).name,
    ...entry,
    stockedRate: entry.stocked === 0 ? -1 : entry.stockedWins / entry.stocked,
    heldRate: entry.held === 0 ? -1 : entry.heldWins / entry.held,
  }));
  rows.sort((a, b) => b.stockedRate - a.stockedRate || b.heldRate - a.heldRate);

  console.log('카드별 승률(입고한 쪽 / 덱에 보유한 쪽):');
  for (const row of rows) {
    console.log(
      `  ${row.name}(${row.cardId}): 입고 ${pct(row.stockedWins, row.stocked)} (${row.stockedWins}/${row.stocked})` +
        `, 보유 ${pct(row.heldWins, row.held)} (${row.heldWins}/${row.held})`,
    );
  }
}

const isMain = process.argv[1] && process.argv[1].endsWith('sim.js');
if (isMain) {
  runSim(parseArgs(process.argv.slice(2)));
}
