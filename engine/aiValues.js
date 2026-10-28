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
    "nu_synapse": 1.47,
    "nu_sync": 3.12,
    "nu_overload": 0.72,
    "nu_recursion": -0.18,
    "nu_emp": 4.17,
    "nu_barrage": 1.47,
    "nu_runaway": 0.42,
    "nu_chain": 3.27,
    "silver": 0,
    "gold": 2.54,
    "rifle": 2.47,
    "assaultRifle": 6.99
  },
  "gemini": {
    "nu_synapse": -0.09,
    "nu_sync": 3.23,
    "nu_overload": 0.24,
    "nu_recursion": 2.13,
    "nu_emp": 4.53,
    "nu_thought": 3.26,
    "nu_brainwave": 1.64,
    "nu_resonance": 4.82,
    "silver": 2.3,
    "gold": 4.26,
    "rifle": 3.76,
    "assaultRifle": 7.56
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
    "lg_offering": 4.06,
    "lg_ritual": 0.29,
    "lg_blessing": 2.43,
    "lg_meteor": 5.71,
    "lg_observatory": 2.68,
    "lg_hone": -0.28,
    "lg_masterSword": 6.63,
    "lg_collection": 2.15,
    "silver": 3.23,
    "gold": 4.92,
    "rifle": 4.3,
    "assaultRifle": 3.72
  },
  "elena": {
    "lg_offering": 1.1,
    "lg_ritual": 0.87,
    "lg_blessing": 1.86,
    "lg_meteor": 6.32,
    "lg_observatory": 3.94,
    "lg_starburst": 5.5,
    "lg_pact": -0.82,
    "lg_nebulaCoin": 4.71,
    "silver": 2.54,
    "gold": 4.43,
    "rifle": 4.63,
    "assaultRifle": 8.21
  },
  "astra": {
    "lg_offering": 3.71,
    "lg_ritual": 1.09,
    "lg_blessing": 2.06,
    "lg_meteor": 4.94,
    "lg_observatory": 3.02,
    "lg_constellShield": 1.14,
    "lg_starWeight": 6.02,
    "lg_galaxyVault": 2.11,
    "silver": 3.18,
    "gold": 4.42,
    "rifle": 4.15,
    "assaultRifle": 4.73
  },
  "lime": {
    "vc_usury": 3.5,
    "vc_creditLoan": 2.12,
    "vc_bond": 1.27,
    "vc_repayPlan": 0.41,
    "vc_seizure": 4.49,
    "vc_advance": 1.19,
    "vc_leverage": 3.47,
    "vc_futures": 5.39,
    "silver": 0.34,
    "gold": 2.69,
    "rifle": 2.57,
    "assaultRifle": 7.48
  },
  "sol": {
    "vc_usury": 2.26,
    "vc_creditLoan": 3.46,
    "vc_bond": 2.51,
    "vc_repayPlan": 1.82,
    "vc_seizure": 5.65,
    "vc_blameShift": 1.81,
    "vc_bankruptcy": 2.06,
    "vc_freeze": 3.58,
    "silver": 1.3,
    "gold": 3.08,
    "rifle": 1.91,
    "assaultRifle": 7.63
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
