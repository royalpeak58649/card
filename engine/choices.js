import { runEffects } from './effects.js';

/** @typedef {import('./state.js').GameState} GameState */
/** @typedef {{ playerIndex: number, cardUid: string }} EffectContext */
/** @typedef {{
 *  playerIndex: number, kind: string, prompt: string, options: string[],
 *  min: number, max: number, data: Record<string, any>,
 *  ctx: EffectContext, rest: import('./effects.js').Effect[]
 * }} PendingChoice */
/** @typedef {(game: GameState, pending: PendingChoice, selection: string[]) => void} ChoiceFn */

/** @type {Record<string, ChoiceFn>} */
const handlers = {};

/**
 * 선택 해결 함수를 등록한다. 같은 kind 가 이미 있으면 Error.
 * @param {string} kind
 * @param {ChoiceFn} fn
 * @returns {void}
 */
export function registerChoice(kind, fn) {
  if (Object.prototype.hasOwnProperty.call(handlers, kind)) {
    throw new Error(`이미 등록된 선택: ${kind}`);
  }
  handlers[kind] = fn;
}

/**
 * 플레이어 선택을 요청한다. options 가 비어 있으면 아무 것도 하지 않는다.
 * @param {GameState} game
 * @param {EffectContext} ctx
 * @param {{ kind: string, prompt: string, options: string[], min?: number,
 *   max?: number, data?: Record<string, any>, playerIndex?: number }} spec
 * @returns {void}
 */
export function requestChoice(game, ctx, spec) {
  const options = Array.isArray(spec.options) ? spec.options.slice() : [];
  if (options.length === 0) return;
  const min = Math.min(spec.min ?? 0, options.length);
  const max = Math.min(spec.max ?? options.length, options.length);
  game.pending = {
    playerIndex: spec.playerIndex ?? ctx.playerIndex,
    kind: spec.kind,
    prompt: spec.prompt,
    options,
    min,
    max,
    data: spec.data ?? {},
    ctx,
    rest: [],
  };
}

/**
 * 대기 중인 선택을 해결한다.
 * @param {GameState} game
 * @param {number} playerIndex
 * @param {string[]} selection
 * @returns {void}
 */
export function resolveChoice(game, playerIndex, selection) {
  const pending = game.pending;
  if (!pending) throw new Error('대기 중인 선택이 없습니다');
  if (playerIndex !== pending.playerIndex) throw new Error('선택할 차례가 아닙니다');
  if (!Array.isArray(selection)) throw new Error('선택은 배열이어야 합니다');
  if (selection.length < pending.min || selection.length > pending.max) {
    throw new Error(`선택 개수가 맞지 않습니다: ${selection.length}`);
  }
  const seen = new Set();
  for (const item of selection) {
    if (!pending.options.includes(item)) throw new Error(`선택할 수 없는 항목: ${item}`);
    if (seen.has(item)) throw new Error(`중복된 선택: ${item}`);
    seen.add(item);
  }

  const handler = handlers[pending.kind];
  if (!handler) throw new Error(`알 수 없는 선택: ${pending.kind}`);

  // 여기서부터 상태 변경
  game.pending = null;
  handler(game, pending, selection);

  if (game.pending) {
    // 해결 함수가 새 선택을 만들었다(연쇄 선택).
    game.pending.rest = game.pending.rest.concat(pending.rest);
  } else {
    runEffects(game, pending.ctx, pending.rest);
  }
}
