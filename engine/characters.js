/** @typedef {import('./conditions.js').Cond} Cond */
/** @typedef {{ flat?: number, perWeapon?: number, cap?: number, cond?: Cond }} AttackBonus */
/** @typedef {{
 *  id: string, name: string, cardIds: string[], characterIds: string[]
 * }} FactionDef */
/** @typedef {{
 *  id: string, name: string, factionId: string, maxHp: number, cardIds: string[],
 *  ability: { firstWeaponDiscount?: number, attackBonuses?: AttackBonus[] },
 *  abilityText: string
 * }} CharacterDef */

/** @type {Record<string, FactionDef>} */
const factions = {};
/** @type {Record<string, CharacterDef>} */
const characters = {};

/**
 * 진영 정의를 등록한다. 같은 id 가 이미 있으면 Error.
 * @param {Record<string, FactionDef>} defs
 * @returns {void}
 */
export function registerFactions(defs) {
  for (const id of Object.keys(defs)) {
    if (Object.prototype.hasOwnProperty.call(factions, id)) {
      throw new Error(`이미 등록된 진영: ${id}`);
    }
  }
  for (const id of Object.keys(defs)) {
    factions[id] = defs[id];
  }
}

/**
 * @param {string} id
 * @returns {FactionDef}
 */
export function getFaction(id) {
  if (!Object.prototype.hasOwnProperty.call(factions, id)) {
    throw new Error(`알 수 없는 진영: ${id}`);
  }
  return factions[id];
}

/**
 * 캐릭터 정의를 등록한다. 같은 id 가 이미 있으면 Error.
 * @param {Record<string, CharacterDef>} defs
 * @returns {void}
 */
export function registerCharacters(defs) {
  for (const id of Object.keys(defs)) {
    if (Object.prototype.hasOwnProperty.call(characters, id)) {
      throw new Error(`이미 등록된 캐릭터: ${id}`);
    }
  }
  for (const id of Object.keys(defs)) {
    characters[id] = defs[id];
  }
}

/**
 * @param {string} id
 * @returns {CharacterDef}
 */
export function getCharacter(id) {
  if (!Object.prototype.hasOwnProperty.call(characters, id)) {
    throw new Error(`알 수 없는 캐릭터: ${id}`);
  }
  return characters[id];
}
