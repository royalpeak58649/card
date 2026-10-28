// AI 의 카드 가치 표. 단위는 대략 "상대 체력 1 피해" 와 같은 무게.
// 기본값은 구매가에서 계산하고, tools/tune.js 가 캐릭터별로 조정한 값을 TUNED 에 덮어쓴다.
import { getCardDef } from './cards/registry.js';

/** 기본 공급 카드의 기본 가치(구매가로는 잘 안 맞는 것들) */
const BASE_VALUES = {
  stone: -1,
  pistol: -0.6,
  silver: 2.2,
  gold: 4.6,
  rifle: 3.6,
  assaultRifle: 6.2,
};

/**
 * 캐릭터별 조정값. { [characterId]: { [cardId]: value } }
 * tools/tune.js 가 이 객체 리터럴을 다시 써서 갱신한다.
 */
// TUNED-START (tools/tune.js 가 이 사이를 다시 쓴다)
export const TUNED = {};
// TUNED-END

/**
 * 카드의 기본 가치.
 * @param {string} cardId
 * @returns {number}
 */
export function defaultValue(cardId) {
  if (Object.prototype.hasOwnProperty.call(BASE_VALUES, cardId)) return BASE_VALUES[cardId];
  const def = getCardDef(cardId);
  // 행동카드는 행동력이 있어야 쓸 수 있어 같은 구매가의 재화·무기보다 덜 쳐 준다.
  return def.cost * (def.type === 'action' ? 0.6 : 0.8);
}

/**
 * 그 캐릭터에게 그 카드가 얼마나 가치 있는가.
 * @param {string|null} characterId
 * @param {string} cardId
 * @param {Record<string, Record<string, number>>} [overrides] 조정 도구가 실험용으로 넘기는 값
 * @returns {number}
 */
export function cardValue(characterId, cardId, overrides) {
  const table = (overrides ?? TUNED)[characterId ?? ''] ?? {};
  if (Object.prototype.hasOwnProperty.call(table, cardId)) return table[cardId];
  return defaultValue(cardId);
}
