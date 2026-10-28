/**
 * 시드 난수. 난수 상태는 game.rngState 에 32비트 정수로 저장된다.
 * (game 객체는 JSON 직렬화 가능해야 하므로 상태를 game 안에 둔다)
 */

/**
 * mulberry32 로 다음 난수를 뽑는다.
 * @param {{ rngState: number }} game
 * @returns {number} [0, 1) 실수
 */
export function nextRandom(game) {
  game.rngState = (game.rngState + 0x6d2b79f5) >>> 0;
  let t = game.rngState;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/**
 * 0 이상 n 미만의 정수.
 * @param {{ rngState: number }} game
 * @param {number} n
 * @returns {number}
 */
export function randomInt(game, n) {
  return Math.floor(nextRandom(game) * n);
}

/**
 * Fisher-Yates 셔플(제자리).
 * @template T
 * @param {{ rngState: number }} game
 * @param {T[]} arr
 * @returns {T[]} arr
 */
export function shuffleInPlace(game, arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randomInt(game, i + 1);
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}
