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
  'tempUpgrades',
  'upgradedPlayed',
  'defenseGained',
];

/** 손패 종류 검사에 쓸 수 있는 종류 */
const HAND_TYPES = ['money', 'weapon', 'action'];

/**
 * 플레이어의 영구 강화 카드 수(일시 강화는 제외).
 * @param {GameState} game
 * @param {number} playerIndex
 * @returns {number}
 */
function countUpgradedOwned(game, playerIndex) {
  const player = game.players[playerIndex];
  if (!player) throw new Error(`알 수 없는 플레이어: ${playerIndex}`);
  const zones = [player.hand, player.drawPile, player.discard, player.inPlay];
  let count = 0;
  for (const zone of zones) {
    for (const card of zone ?? []) {
      if (card.upgraded === true && card.tempUpgraded !== true) count += 1;
    }
  }
  return count;
}

/**
 * cardId 목록에서 가장 많이 나온 cardId 의 개수(없으면 0).
 * @param {string[]} cardIds
 * @returns {number}
 */
function maxSameAction(cardIds) {
  /** @type {Record<string, number>} */
  const counts = {};
  let max = 0;
  for (const cardId of cardIds) {
    counts[cardId] = (counts[cardId] ?? 0) + 1;
    if (counts[cardId] > max) max = counts[cardId];
  }
  return max;
}

/**
 * stat 값을 읽는다. turnState 숫자 필드, 'boughtWeapons', 'stars', 'upgradedOwned',
 * 'maxSameAction', 'debt', 'debtHalf', 'bleed', 'oppBleed'.
 * @param {GameState} game
 * @param {number} playerIndex
 * @param {string} stat
 * @returns {number}
 */
export function getStat(game, playerIndex, stat) {
  const turnState = game.turnState ?? {};
  if (stat === 'boughtWeapons') {
    return (turnState.bought ?? []).filter((cardId) => getCardDef(cardId).type === 'weapon').length;
  }
  if (stat === 'stars') {
    const player = game.players[playerIndex];
    if (!player) throw new Error(`알 수 없는 플레이어: ${playerIndex}`);
    return player.stars ?? 0;
  }
  if (stat === 'upgradedOwned') {
    return countUpgradedOwned(game, playerIndex);
  }
  if (stat === 'maxSameAction') {
    return maxSameAction(turnState.playedActionIds ?? []);
  }
  if (stat === 'debt' || stat === 'debtHalf') {
    const player = game.players[playerIndex];
    if (!player) throw new Error(`알 수 없는 플레이어: ${playerIndex}`);
    const debt = player.debt ?? 0;
    return stat === 'debt' ? debt : Math.floor(debt / 2);
  }
  if (stat === 'bleed' || stat === 'oppBleed') {
    const index = stat === 'bleed' ? playerIndex : 1 - playerIndex;
    const player = game.players[index];
    if (!player) throw new Error(`알 수 없는 플레이어: ${index}`);
    return player.bleed === true ? 1 : 0;
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
    const value = getStat(game, ctx.playerIndex, cond.stat);
    if (cond.gte !== undefined && !(value >= cond.gte)) return false;
    if (cond.lte !== undefined && !(value <= cond.lte)) return false;
    if (cond.eq !== undefined && !(value === cond.eq)) return false;
    return true;
  }

  throw new Error(`알 수 없는 조건: ${JSON.stringify(cond)}`);
}
