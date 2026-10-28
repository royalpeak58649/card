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
export const TUNED = {
  "hayun": {
    "s8_supplyOrder": -0.54,
    "s8_logistics": 3.2,
    "s8_opFunds": 3.58,
    "s8_maintenance": 0.98,
    "s8_serviceSmg": 6,
    "s8_emergencyProc": 3.82,
    "s8_budget": 1.75,
    "s8_depot": 3.97,
    "silver": 2.25,
    "gold": 3.64,
    "rifle": 2.21,
    "assaultRifle": 8.13
  },
  "kangjin": {
    "s8_supplyOrder": 1.98,
    "s8_logistics": 4.29,
    "s8_opFunds": 2.78,
    "s8_maintenance": -0.82,
    "s8_serviceSmg": 6.08,
    "s8_breakthrough": 3.01,
    "s8_loot": 0.74,
    "s8_heavyMg": 7.68,
    "silver": -1.06,
    "gold": 1.16,
    "rifle": 2.53,
    "assaultRifle": 8.6
  },
  "doyun": {
    "s8_supplyOrder": -0.58,
    "s8_logistics": 3.18,
    "s8_opFunds": 3.49,
    "s8_maintenance": 1.08,
    "s8_serviceSmg": 5.72,
    "s8_trench": 3.25,
    "s8_suppress": 2.77,
    "s8_cutSupply": 3.07,
    "silver": 2.62,
    "gold": 3.39,
    "rifle": 2.49,
    "assaultRifle": 7.49
  },
  "jin": {
    "nu_synapse": 1.82,
    "nu_sync": 3.83,
    "nu_overload": 0.42,
    "nu_recursion": 0.89,
    "nu_emp": 4.46,
    "nu_barrage": 3.34,
    "nu_runaway": 3.1,
    "nu_chain": 5.07,
    "silver": 1.93,
    "gold": 3.64,
    "rifle": 2.77,
    "assaultRifle": 5.82
  },
  "gemini": {
    "nu_synapse": 0.82,
    "nu_sync": 3.82,
    "nu_overload": 0.91,
    "nu_recursion": 2.53,
    "nu_emp": 5.43,
    "nu_thought": 4,
    "nu_brainwave": 1.8,
    "nu_resonance": 2.2,
    "silver": 1.83,
    "gold": 3.83,
    "rifle": 4.31,
    "assaultRifle": 8
  },
  "echo": {
    "nu_synapse": 1.46,
    "nu_sync": 3.42,
    "nu_overload": 0.94,
    "nu_recursion": -1.92,
    "nu_emp": 5.67,
    "nu_mirror": 1.86,
    "nu_loopback": -0.79,
    "nu_reverb": 2.77,
    "silver": -1.72,
    "gold": 1.13,
    "rifle": 2.18,
    "assaultRifle": 8.15
  },
  "jace": {
    "lg_offering": 4.89,
    "lg_ritual": -0.69,
    "lg_blessing": 1.52,
    "lg_meteor": 6.79,
    "lg_observatory": 4.54,
    "lg_hone": 3.57,
    "lg_masterSword": 5.89,
    "lg_collection": 2.55,
    "silver": 2.08,
    "gold": 3.34,
    "rifle": 3.72,
    "assaultRifle": 3.69
  },
  "lime": {
    "vc_usury": 3.5,
    "vc_creditLoan": 2.12,
    "vc_bond": 1.27,
    "vc_repayPlan": 0.41,
    "vc_seizure": 4.49,
    "vc_leverage": 3.47,
    "vc_futures": 5.39,
    "silver": 0.34,
    "gold": 2.69,
    "rifle": 2.57,
    "assaultRifle": 7.48
  },
  "sol": {
    "vc_usury": 3.06,
    "vc_creditLoan": 3.68,
    "vc_bond": 3.68,
    "vc_repayPlan": 0.7,
    "vc_seizure": 6.42,
    "vc_blameShift": 1.91,
    "vc_bankruptcy": 2.57,
    "vc_freeze": 4.04,
    "silver": 2.01,
    "gold": 3.27,
    "rifle": 2.39,
    "assaultRifle": 7.59
  },
  "argus": {
    "vc_usury": 2.12,
    "vc_creditLoan": 3.35,
    "vc_bond": 2.41,
    "vc_repayPlan": 2.13,
    "vc_seizure": 5.03,
    "vc_interest": 5.64,
    "vc_balanceSheet": 1.45,
    "vc_debtRepay": 3.69,
    "silver": 2.11,
    "gold": 3.99,
    "rifle": 2.75,
    "assaultRifle": 7
  },
  "elena": {
    "lg_offering": 3.14,
    "lg_ritual": 1.71,
    "lg_blessing": 2.25,
    "lg_meteor": 5.8,
    "lg_observatory": 2.9,
    "lg_starburst": 4.04,
    "lg_pact": 0.74,
    "lg_nebulaCoin": 2.92,
    "silver": 2.43,
    "gold": 4.02,
    "rifle": 3.8,
    "assaultRifle": 5.78
  },
  "astra": {
    "lg_offering": 2.95,
    "lg_ritual": 1.31,
    "lg_blessing": 2.08,
    "lg_meteor": 5.2,
    "lg_observatory": 1.32,
    "lg_constellShield": 4.21,
    "lg_starWeight": 5.36,
    "lg_galaxyVault": 4.13,
    "silver": 3.27,
    "gold": 3.29,
    "rifle": 2.21,
    "assaultRifle": 6.67
  }
};
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
