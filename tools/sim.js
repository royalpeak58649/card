// AI 끼리 대전시켜 밸런스를 확인하는 시뮬레이터.
// 사용법: node tools/sim.js --games 500 --seed 1 [--ai smart|basic] [--workers N]
import os from 'node:os';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { getCardDef, getCharacter } from '../engine/index.js';
import { playMatch, mulberry32, randInt, CHARACTER_IDS } from './match.js';

/**
 * 명령줄 인자를 읽는다.
 * @param {string[]} argv
 * @returns {{ games: number, seed: number, ai: 'smart'|'basic', workers: number }}
 */
function parseArgs(argv) {
  let games = 500;
  let seed = 1;
  let ai = 'smart';
  let workers = os.availableParallelism();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--games' && argv[i + 1] !== undefined) {
      games = Number(argv[++i]);
    } else if (arg === '--seed' && argv[i + 1] !== undefined) {
      seed = Number(argv[++i]);
    } else if (arg === '--ai' && argv[i + 1] !== undefined) {
      ai = argv[++i];
    } else if (arg === '--workers' && argv[i + 1] !== undefined) {
      workers = Number(argv[++i]);
    }
  }
  if (!Number.isFinite(games) || games < 1) games = 500;
  if (!Number.isFinite(seed)) seed = 1;
  if (ai !== 'basic') ai = 'smart';
  if (!Number.isFinite(workers) || workers < 1) workers = 1;
  return { games: Math.floor(games), seed: Math.floor(seed), ai, workers: Math.floor(workers) };
}

/**
 * 판 하나를 돌린다. 판 i 의 seed 는 기본 seed + i 로 정해 워커 수와 무관하게 같은 결과가 나온다.
 * @param {number} seed
 * @param {'smart'|'basic'} ai
 * @returns {ReturnType<typeof playMatch>}
 */
function runOne(seed, ai) {
  const rand = mulberry32(seed);
  const characterIds = [
    CHARACTER_IDS[randInt(rand, CHARACTER_IDS.length)],
    CHARACTER_IDS[randInt(rand, CHARACTER_IDS.length)],
  ];
  return playMatch({ seed, characterIds, ai: [ai, ai] });
}

/**
 * 판들을 워커에 나눠 돌린다. 결과는 판 번호 순서대로 모인다.
 * @param {{ games: number, seed: number, ai: 'smart'|'basic', workers: number }} opts
 * @returns {Promise<ReturnType<typeof playMatch>[]>}
 */
async function runGames({ games, seed, ai, workers }) {
  const count = Math.min(workers, games);
  if (count <= 1) {
    const results = [];
    for (let i = 0; i < games; i++) results.push(runOne(seed + i, ai));
    return results;
  }

  /** @type {Promise<{ index: number, result: ReturnType<typeof playMatch> }[]>[]} */
  const jobs = [];
  for (let w = 0; w < count; w++) {
    const indices = [];
    for (let i = w; i < games; i += count) indices.push(i);
    jobs.push(
      new Promise((resolve, reject) => {
        const worker = new Worker(new URL(import.meta.url), {
          workerData: { indices, seed, ai },
        });
        worker.once('message', (message) => resolve(message));
        worker.once('error', reject);
        worker.once('exit', (code) => {
          if (code !== 0) reject(new Error(`워커 종료 코드 ${code}`));
        });
      }),
    );
  }

  const chunks = await Promise.all(jobs);
  /** @type {ReturnType<typeof playMatch>[]} */
  const results = new Array(games);
  for (const chunk of chunks) for (const { index, result } of chunk) results[index] = result;
  return results;
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
 * 판별 결과를 집계해 출력한다.
 * @param {ReturnType<typeof playMatch>[]} results
 * @param {{ games: number, seed: number, ai: 'smart'|'basic', workers: number }} opts
 * @returns {void}
 */
function report(results, { games, seed, ai, workers }) {
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

  for (const result of results) {
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

    if (result.winner === null || result.draw === true) {
      draws += 1;
    } else {
      decided += 1;
      if (result.winner === result.firstPlayerIndex) firstWins += 1;
    }

    for (let p = 0; p < 2; p++) {
      const won = result.winner === p;
      for (const cardId of result.factionIds[p]) {
        const entry = cardEntry(cardId);
        entry.stocked += 1;
        if (won) entry.stockedWins += 1;
      }
      const deck = new Set(result.deckIds[p]);
      for (const cardId of deck) {
        const entry = cardEntry(cardId);
        entry.held += 1;
        if (won) entry.heldWins += 1;
      }
    }
  }

  console.log(`AI: ${ai}, 워커 ${workers}개`);
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

/**
 * 시뮬레이션을 돌리고 결과를 출력한다.
 * @param {{ games: number, seed: number, ai?: 'smart'|'basic', workers?: number }} opts
 * @returns {Promise<void>}
 */
export async function runSim({ games, seed, ai = 'smart', workers = 1 }) {
  const results = await runGames({ games, seed, ai, workers });
  report(results, { games, seed, ai, workers });
}

if (!isMainThread && workerData && Array.isArray(workerData.indices)) {
  const { indices, seed, ai } = workerData;
  parentPort.postMessage(indices.map((index) => ({ index, result: runOne(seed + index, ai) })));
} else if (process.argv[1] && process.argv[1].endsWith('sim.js')) {
  await runSim(parseArgs(process.argv.slice(2)));
}
