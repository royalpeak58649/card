/** @typedef {{ op: string, n?: number }} Effect */
/** @typedef {{
 *  id: string, name: string,
 *  type: 'money'|'weapon'|'action',
 *  cost: number,             // 구매가(원)
 *  actionCost?: number,      // 행동카드만: 0 또는 1
 *  basic?: boolean,          // 기본 공급 카드(강화 불가)
 *  surchargeFirst?: number,  // 처음 구매되는 N장은 구매가 +1
 *  effects: Effect[],
 *  upgradedEffects?: Effect[]
 * }} CardDef */

/** @type {Record<string, CardDef>} */
const registry = {};

/**
 * 카드 정의를 등록한다. 같은 id 가 이미 있으면 Error.
 * @param {Record<string, CardDef>} defs
 * @returns {void}
 */
export function registerCards(defs) {
  for (const id of Object.keys(defs)) {
    if (Object.prototype.hasOwnProperty.call(registry, id)) {
      throw new Error(`이미 등록된 카드: ${id}`);
    }
  }
  for (const id of Object.keys(defs)) {
    registry[id] = defs[id];
  }
}

/**
 * @param {string} id
 * @returns {CardDef}
 */
export function getCardDef(id) {
  if (!Object.prototype.hasOwnProperty.call(registry, id)) {
    throw new Error(`알 수 없는 카드: ${id}`);
  }
  return registry[id];
}

/**
 * @returns {string[]}
 */
export function allCardIds() {
  return Object.keys(registry);
}
