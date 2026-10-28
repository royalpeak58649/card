import { drawCards } from './state.js';

/** @typedef {{ op: string, n?: number }} Effect */
/** @typedef {{ playerIndex: number, card: import('./state.js').CardInstance }} EffectContext */
/** @typedef {(game: import('./state.js').GameState, ctx: EffectContext, effect: Effect) => void} OpFn */

/** 별 최대치 */
export const MAX_STARS = 5;

/** @type {Record<string, OpFn>} */
const ops = {};

/**
 * 효과 op 를 등록한다. 같은 이름이 이미 있으면 Error.
 * @param {string} name
 * @param {OpFn} fn
 * @returns {void}
 */
export function registerOp(name, fn) {
  if (Object.prototype.hasOwnProperty.call(ops, name)) {
    throw new Error(`이미 등록된 효과: ${name}`);
  }
  ops[name] = fn;
}

/**
 * 효과 목록을 순서대로 실행한다.
 * @param {import('./state.js').GameState} game
 * @param {EffectContext} ctx
 * @param {Effect[]} effects
 * @returns {void}
 */
export function runEffects(game, ctx, effects) {
  if (!Array.isArray(effects)) return;
  for (const effect of effects) {
    const op = effect && effect.op;
    if (!Object.prototype.hasOwnProperty.call(ops, op)) {
      throw new Error(`알 수 없는 효과: ${op}`);
    }
    ops[op](game, ctx, effect);
  }
}

/**
 * @param {string} name
 * @returns {boolean}
 */
export function hasOp(name) {
  return Object.prototype.hasOwnProperty.call(ops, name);
}

registerOp('gainCoins', (game, ctx, effect) => {
  game.players[ctx.playerIndex].coins += effect.n ?? 0;
});

registerOp('damage', (game, ctx, effect) => {
  game.turnState.attackDamage += effect.n ?? 0;
});

registerOp('draw', (game, ctx, effect) => {
  drawCards(game, ctx.playerIndex, effect.n ?? 0);
});

registerOp('gainActions', (game, ctx, effect) => {
  game.players[ctx.playerIndex].actions += effect.n ?? 0;
});

registerOp('gainBuys', (game, ctx, effect) => {
  game.players[ctx.playerIndex].buys += effect.n ?? 0;
});

registerOp('gainStars', (game, ctx, effect) => {
  const player = game.players[ctx.playerIndex];
  player.stars = Math.min(MAX_STARS, player.stars + (effect.n ?? 0));
});
