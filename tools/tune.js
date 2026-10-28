// 캐릭터별 카드 가치를 SPSA 로 조정하는 도구.
// 사용법: node tools/tune.js --chars all --iters 12 --games 120 --seed 1 --workers 2 [--write]
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { allCharacterIds, getCharacter, getFaction } from '../engine/index.js';
import { cardValue, TUNED } from '../engine/aiValues.js';
import { playMatch, mulberry32 } from './match.js';

/** 조정 대상에 항상 넣는 기본 공급 카드 */
const BASIC_TARGETS = ['silver', 'gold', 'rifle', 'assaultRifle'];
/** 가치 하한 */
const MIN_VALUE = -2;
/** 가치 상한 */
const MAX_VALUE = 12;
/** 반복마다 seed 를 옮기는 폭 */
const SEED_STRIDE = 100000;

const HERE = path.dirname(fileURLToPath(import.meta.url));
const AI_VALUES_PATH = path.join(HERE, '..', 'engine', 'aiValues.js');

/**
 * 명령줄 인자를 읽는다.
 * @param {string[]} argv
 * @returns {{ chars: string, iters: number, games: number, seed: number, workers: number, write: boolean }}
 */
function parseArgs(argv) {
  let chars = 'all';
  let iters = 12;
  let games = 120;
  let seed = 1;
  let workers = os.availableParallelism();
  let write = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--chars' && argv[i + 1] !== undefined) chars = argv[++i];
    else if (arg === '--iters' && argv[i + 1] !== undefined) iters = Number(argv[++i]);
    else if (arg === '--games' && argv[i + 1] !== undefined) games = Number(argv[++i]);
    else if (arg === '--seed' && argv[i + 1] !== undefined) seed = Number(argv[++i]);
    else if (arg === '--workers' && argv[i + 1] !== undefined) workers = Number(argv[++i]);
    else if (arg === '--write') write = true;
  }
  if (!Number.isFinite(iters) || iters < 1) iters = 12;
  if (!Number.isFinite(games) || games < 1) games = 120;
  if (!Number.isFinite(seed)) seed = 1;
  if (!Number.isFinite(workers) || workers < 1) workers = 1;
  return {
    chars,
    iters: Math.floor(iters),
    games: Math.floor(games),
    seed: Math.floor(seed),
    workers: Math.floor(workers),
    write,
  };
}

/**
 * 조정할 카드 목록: 진영 카드 5 + 캐릭터 카드 3 + 기본 공급 4.
 * @param {string} characterId
 * @returns {string[]}
 */
export function targetCards(characterId) {
  const character = getCharacter(characterId);
  return [...getFaction(character.factionId).cardIds, ...character.cardIds, ...BASIC_TARGETS];
}

/**
 * 값을 -2 ~ 12 로 자른다.
 * @param {number} value
 * @returns {number}
 */
function clamp(value) {
  return Math.max(MIN_VALUE, Math.min(MAX_VALUE, value));
}

/**
 * 소수 둘째 자리로 반올림한다.
 * @param {number} value
 * @returns {number}
 */
function round2(value) {
  return Math.round(value * 100) / 100;
}

/**
 * 판 하나를 돌린다(워커 안에서도 쓴다).
 * @param {{ seed: number, characterId: string, opponentId: string, seat: number,
 *   values: Record<string, Record<string, number>> }} job
 * @returns {number|null} characterId 쪽이 이기면 1, 지면 0, 무승부면 0.5
 */
function runJob({ seed, characterId, opponentId, seat, values }) {
  const characterIds = seat === 0 ? [characterId, opponentId] : [opponentId, characterId];
  const result = playMatch({
    seed,
    characterIds,
    ai: ['smart', 'smart'],
    values: [values, values],
  });
  if (result.winner === null || result.draw === true) return 0.5;
  return result.winner === seat ? 1 : 0;
}

/**
 * 판들을 워커에 나눠 돌리고 승률을 낸다.
 * @param {{ seed: number, characterId: string, values: Record<string, Record<string, number>>,
 *   games: number, workers: number }} opts
 * @returns {Promise<number>} 승률(무승부 0.5)
 */
async function evaluate({ seed, characterId, values, games, workers }) {
  const opponents = allCharacterIds();
  /** @type {{ seed: number, characterId: string, opponentId: string, seat: number,
   *   values: Record<string, Record<string, number>> }[]} */
  const jobs = [];
  for (let i = 0; i < games; i++) {
    jobs.push({
      seed: seed + i,
      characterId,
      opponentId: opponents[i % opponents.length],
      seat: i % 2,
      values,
    });
  }

  const count = Math.min(workers, jobs.length);
  if (count <= 1) {
    let sum = 0;
    for (const job of jobs) sum += runJob(job);
    return sum / jobs.length;
  }

  /** @type {Promise<number[]>[]} */
  const chunks = [];
  for (let w = 0; w < count; w++) {
    const slice = jobs.filter((_, i) => i % count === w);
    chunks.push(
      new Promise((resolve, reject) => {
        const worker = new Worker(new URL(import.meta.url), { workerData: { jobs: slice } });
        worker.once('message', (message) => resolve(message));
        worker.once('error', reject);
        worker.once('exit', (code) => {
          if (code !== 0) reject(new Error(`워커 종료 코드 ${code}`));
        });
      }),
    );
  }

  let sum = 0;
  let n = 0;
  for (const scores of await Promise.all(chunks)) {
    for (const score of scores) {
      sum += score;
      n += 1;
    }
  }
  return n === 0 ? 0 : sum / n;
}

/**
 * engine/aiValues.js 의 TUNED 블록을 다시 쓴다.
 * @param {string} filePath
 * @param {Record<string, Record<string, number>>} tuned
 * @returns {void}
 */
export function writeTuned(filePath, tuned) {
  const source = fs.readFileSync(filePath, 'utf8');
  const startMarker = '// TUNED-START';
  const endMarker = '// TUNED-END';
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker);
  if (start < 0 || end < 0 || end < start) {
    throw new Error('TUNED-START / TUNED-END 표시를 찾지 못했습니다');
  }
  const startLineEnd = source.indexOf('\n', start);
  if (startLineEnd < 0 || startLineEnd > end) {
    throw new Error('TUNED-START 줄을 찾지 못했습니다');
  }
  const body = `export const TUNED = ${JSON.stringify(roundTuned(tuned), null, 2)};\n`;
  const next = source.slice(0, startLineEnd + 1) + body + source.slice(end);
  fs.writeFileSync(filePath, next);
}

/**
 * 값을 소수 둘째 자리로 반올림한다(중첩 객체).
 * @param {Record<string, Record<string, number>>} tuned
 * @returns {Record<string, Record<string, number>>}
 */
export function roundTuned(tuned) {
  /** @type {Record<string, Record<string, number>>} */
  const out = {};
  for (const [characterId, table] of Object.entries(tuned)) {
    /** @type {Record<string, number>} */
    const row = {};
    for (const [cardId, value] of Object.entries(table)) row[cardId] = round2(value);
    out[characterId] = row;
  }
  return out;
}

/**
 * 한 캐릭터의 카드 가치를 SPSA 로 조정한다.
 * @param {string} characterId
 * @param {{ iters: number, games: number, seed: number, workers: number,
 *   tuned: Record<string, Record<string, number>> }} opts
 * @returns {Promise<{ start: number, final: number, accepted: boolean,
 *   values: Record<string, number> }>}
 */
async function tuneCharacter(characterId, { iters, games, seed, workers, tuned }) {
  const cards = targetCards(characterId);
  const startTheta = cards.map((cardId) => cardValue(characterId, cardId, tuned));
  let theta = startTheta.slice();

  /** θ 를 전체 조정값에 얹은 values */
  const valuesWith = (vector) => {
    /** @type {Record<string, number>} */
    const own = {};
    cards.forEach((cardId, i) => {
      own[cardId] = vector[i];
    });
    return { ...tuned, [characterId]: own };
  };

  const rand = mulberry32(seed + 7919);
  for (let k = 1; k <= iters; k++) {
    const a = 8 / Math.pow(k, 0.602);
    const c = 0.8 / Math.pow(k, 0.101);
    const delta = cards.map(() => (rand() < 0.5 ? -1 : 1));
    const plus = theta.map((v, i) => clamp(v + c * delta[i]));
    const minus = theta.map((v, i) => clamp(v - c * delta[i]));
    const roundSeed = seed + k * SEED_STRIDE;

    const fPlus = await evaluate({
      seed: roundSeed,
      characterId,
      values: valuesWith(plus),
      games,
      workers,
    });
    const fMinus = await evaluate({
      seed: roundSeed,
      characterId,
      values: valuesWith(minus),
      games,
      workers,
    });

    theta = theta.map((v, i) => {
      const g = (fPlus - fMinus) / (2 * c * delta[i]);
      return clamp(v + a * g);
    });

    console.log(
      `  k=${k} f+=${(fPlus * 100).toFixed(1)}% f-=${(fMinus * 100).toFixed(1)}%`,
    );
  }

  // 처음 값과 최종 값을 새 seed 로 비교한다.
  const compareSeed = seed + (iters + 1) * SEED_STRIDE;
  const startRate = await evaluate({
    seed: compareSeed,
    characterId,
    values: valuesWith(startTheta),
    games: games * 2,
    workers,
  });
  const finalRate = await evaluate({
    seed: compareSeed,
    characterId,
    values: valuesWith(theta),
    games: games * 2,
    workers,
  });

  const accepted = finalRate > startRate;
  /** @type {Record<string, number>} */
  const values = {};
  cards.forEach((cardId, i) => {
    values[cardId] = round2(accepted ? theta[i] : startTheta[i]);
  });
  return { start: startRate, final: finalRate, accepted, values };
}

/**
 * 조정을 실행한다.
 * @param {{ chars: string, iters: number, games: number, seed: number, workers: number, write: boolean }} opts
 * @returns {Promise<void>}
 */
export async function runTune(opts) {
  const all = allCharacterIds();
  const targets = opts.chars === 'all' ? all : opts.chars.split(',').map((s) => s.trim()).filter(Boolean);
  /** @type {Record<string, Record<string, number>>} */
  const tuned = {};
  for (const [characterId, table] of Object.entries(TUNED)) tuned[characterId] = { ...table };

  console.log(`조정 대상: ${targets.join(', ')} (반복 ${opts.iters}, 판 ${opts.games}, 워커 ${opts.workers}개)`);
  for (const characterId of targets) {
    const result = await tuneCharacter(characterId, { ...opts, tuned });
    if (result.accepted) tuned[characterId] = result.values;
    console.log(
      `${characterId}: 시작 ${(result.start * 100).toFixed(1)}% → 최종 ${(result.final * 100).toFixed(1)}% ` +
        `(${result.accepted ? '채택' : '기각'})`,
    );
  }

  if (opts.write) {
    writeTuned(AI_VALUES_PATH, tuned);
    console.log(`engine/aiValues.js 의 TUNED 를 갱신했습니다.`);
  }
}

if (!isMainThread && workerData && Array.isArray(workerData.jobs)) {
  parentPort.postMessage(workerData.jobs.map((job) => runJob(job)));
} else if (process.argv[1] && process.argv[1].endsWith('tune.js')) {
  await runTune(parseArgs(process.argv.slice(2)));
}
