import { getCardDef } from './cards/registry.js';

/** @typedef {import('./state.js').GameState} GameState */
/** @typedef {{ playerIndex: number, cardUid: string }} EffectContext */
/** @typedef {Record<string, any>} Cond */

/** turnState 에서 바로 읽을 수 있는 stat 이름 */
const STAT_KEYS = [
  'moneyPlayed',
  'weaponsPlayed',
  'actionsPlayed',
  'starsSpent',
  'damageDealt',
];

/** 손패 종류 검사에 쓸 수 있는 종류 */
const HAND_TYPES = ['money', 'weapon', 'action'];

/**
 * stat 값을 읽는다. 'boughtWeapons' 는 turnState.bought 중 무기 카드 수.
 * @param {GameState} game
 * @param {string} stat
 * @returns {number}
 */
function readStat(game, stat) {
  const turnState = game.turnState ?? {};
  if (stat === 'boughtWeapons') {
    return (turnState.bought ?? []).filter((cardId) => getCardDef(cardId).type === 'weapon').length;
  }
  if (!STAT_KEYS.includes(stat)) throw new Error(`알 수 없는 조건 stat: ${stat}`);
  return turnState[stat] ?? 0;
}

/**
 * 조건을 평가한다. 조건은 전부 순수 데이터다.
 * @param {GameState} game
 * @param {EffectContext} ctx
 * @param {Cond} cond
 * @returns {boolean}
 */
export function evalCond(game, ctx, cond) {
  if (!cond || typeof cond !== 'object' || Array.isArray(cond)) {
    throw new Error(`잘못된 조건: ${JSON.stringify(cond)}`);
  }

  if (Object.prototype.hasOwnProperty.call(cond, 'not')) {
    return !evalCond(game, ctx, cond.not);
  }
  if (Object.prototype.hasOwnProperty.call(cond, 'all')) {
    if (!Array.isArray(cond.all)) throw new Error('all 조건은 배열이어야 합니다');
    return cond.all.every((c) => evalCond(game, ctx, c));
  }
  if (Object.prototype.hasOwnProperty.call(cond, 'any')) {
    if (!Array.isArray(cond.any)) throw new Error('any 조건은 배열이어야 합니다');
    return cond.any.some((c) => evalCond(game, ctx, c));
  }
  if (Object.prototype.hasOwnProperty.call(cond, 'handHasNoType')) {
    const type = cond.handHasNoType;
    if (!HAND_TYPES.includes(type)) throw new Error(`알 수 없는 카드 종류: ${type}`);
    const hand = game.players[ctx.playerIndex].hand;
    return !hand.some((c) => getCardDef(c.cardId).type === type);
  }
  if (Object.prototype.hasOwnProperty.call(cond, 'opponentHpAtMostHalf')) {
    const opponent = game.players[1 - ctx.playerIndex];
    return opponent.hp * 2 <= opponent.maxHp;
  }
  if (Object.prototype.hasOwnProperty.call(cond, 'stat')) {
    const value = readStat(game, cond.stat);
    if (cond.gte !== undefined && !(value >= cond.gte)) return false;
    if (cond.lte !== undefined && !(value <= cond.lte)) return false;
    if (cond.eq !== undefined && !(value === cond.eq)) return false;
    return true;
  }

  throw new Error(`알 수 없는 조건: ${JSON.stringify(cond)}`);
}
