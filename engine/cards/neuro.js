import { registerCards } from './registry.js';
import { registerFactions, registerCharacters } from '../characters.js';

/** @type {Record<string, import('./registry.js').CardDef>} */
export const NEURO_CARDS = {
  // 진영 카드
  nu_synapse: {
    id: 'nu_synapse',
    name: '시냅스 점화',
    type: 'action',
    actionCost: 0,
    cost: 2,
    text: '+1 행동력, +1 카드',
    upgradedText: '+2 행동력, +1 카드',
    effects: [
      { op: 'gainActions', n: 1 },
      { op: 'draw', n: 1 },
    ],
    upgradedEffects: [
      { op: 'gainActions', n: 2 },
      { op: 'draw', n: 1 },
    ],
  },
  nu_sync: {
    id: 'nu_sync',
    name: '신경망 동기화',
    type: 'action',
    actionCost: 1,
    cost: 4,
    text: '+2 카드. 이번 차례 행동카드를 3장 이상 냈다면 +1 행동력',
    upgradedText: '+2 카드. 이번 차례 행동카드를 3장 이상 냈다면 +2 행동력',
    effects: [
      { op: 'draw', n: 2 },
      { op: 'if', cond: { stat: 'actionsPlayed', gte: 3 }, then: [{ op: 'gainActions', n: 1 }] },
    ],
    upgradedEffects: [
      { op: 'draw', n: 2 },
      { op: 'if', cond: { stat: 'actionsPlayed', gte: 3 }, then: [{ op: 'gainActions', n: 2 }] },
    ],
  },
  nu_overload: {
    id: 'nu_overload',
    name: '과부하',
    type: 'action',
    actionCost: 0,
    cost: 3,
    text: '이번 차례 낸 행동카드 1장당 +1원 (최대 4)',
    upgradedText: '이번 차례 낸 행동카드 1장당 +1원 (최대 6)',
    effects: [{ op: 'gainCoinsPerStat', stat: 'actionsPlayed', per: 1, max: 4 }],
    upgradedEffects: [{ op: 'gainCoinsPerStat', stat: 'actionsPlayed', per: 1, max: 6 }],
  },
  nu_recursion: {
    id: 'nu_recursion',
    name: '재귀 호출',
    type: 'action',
    actionCost: 1,
    cost: 4,
    text: '+1 행동력. 버린 더미의 행동카드 1장을 손으로 가져온다',
    upgradedText: '+1 행동력. 버린 더미의 행동카드 2장을 손으로 가져온다',
    effects: [
      { op: 'gainActions', n: 1 },
      { op: 'retrieveFromDiscard', n: 1, filter: 'action', to: 'hand', min: 1 },
    ],
    upgradedEffects: [
      { op: 'gainActions', n: 1 },
      { op: 'retrieveFromDiscard', n: 2, filter: 'action', to: 'hand', min: 1 },
    ],
  },
  nu_emp: {
    id: 'nu_emp',
    name: '전자기 펄스',
    type: 'action',
    actionCost: 1,
    cost: 5,
    dealsDamage: true,
    text: '2 피해. 이번 차례 행동카드를 4장 이상 냈다면 +2 피해',
    upgradedText: '3 피해. 이번 차례 행동카드를 4장 이상 냈다면 +2 피해',
    effects: [
      { op: 'damage', n: 2 },
      { op: 'if', cond: { stat: 'actionsPlayed', gte: 4 }, then: [{ op: 'damage', n: 2 }] },
    ],
    upgradedEffects: [
      { op: 'damage', n: 3 },
      { op: 'if', cond: { stat: 'actionsPlayed', gte: 4 }, then: [{ op: 'damage', n: 2 }] },
    ],
  },

  // 캐릭터 jin
  nu_barrage: {
    id: 'nu_barrage',
    name: '난사 프로토콜',
    type: 'action',
    actionCost: 1,
    cost: 4,
    text: '+3 행동력',
    upgradedText: '+3 행동력, +1 카드',
    effects: [{ op: 'gainActions', n: 3 }],
    upgradedEffects: [
      { op: 'gainActions', n: 3 },
      { op: 'draw', n: 1 },
    ],
  },
  nu_runaway: {
    id: 'nu_runaway',
    name: '폭주 연산',
    type: 'action',
    actionCost: 0,
    cost: 3,
    text: '+1 행동력. 이번 차례 행동카드를 4장 이상 냈다면 +2 카드',
    upgradedText: '+1 행동력. 이번 차례 행동카드를 3장 이상 냈다면 +2 카드',
    effects: [
      { op: 'gainActions', n: 1 },
      { op: 'if', cond: { stat: 'actionsPlayed', gte: 4 }, then: [{ op: 'draw', n: 2 }] },
    ],
    upgradedEffects: [
      { op: 'gainActions', n: 1 },
      { op: 'if', cond: { stat: 'actionsPlayed', gte: 3 }, then: [{ op: 'draw', n: 2 }] },
    ],
  },
  nu_chain: {
    id: 'nu_chain',
    name: '연쇄 반응',
    type: 'action',
    actionCost: 0,
    cost: 6,
    text: '차례 끝에 이번 차례 낸 행동카드가 3장 이상이면 별 +1, 6장 이상이면 별 +1 더',
    upgradedText: '차례 끝에 이번 차례 낸 행동카드가 2장 이상이면 별 +1, 5장 이상이면 별 +1 더',
    effects: [
      {
        op: 'addEndTrigger',
        cond: { stat: 'actionsPlayed', gte: 3 },
        effects: [{ op: 'gainStars', n: 1 }],
      },
      {
        op: 'addEndTrigger',
        cond: { stat: 'actionsPlayed', gte: 6 },
        effects: [{ op: 'gainStars', n: 1 }],
      },
    ],
    upgradedEffects: [
      {
        op: 'addEndTrigger',
        cond: { stat: 'actionsPlayed', gte: 2 },
        effects: [{ op: 'gainStars', n: 1 }],
      },
      {
        op: 'addEndTrigger',
        cond: { stat: 'actionsPlayed', gte: 5 },
        effects: [{ op: 'gainStars', n: 1 }],
      },
    ],
  },

  // 캐릭터 gemini
  nu_thought: {
    id: 'nu_thought',
    name: '사고 전파',
    type: 'action',
    actionCost: 1,
    cost: 3,
    dealsDamage: true,
    text: '1 피해, +1 행동력',
    upgradedText: '2 피해, +1 행동력',
    effects: [
      { op: 'damage', n: 1 },
      { op: 'gainActions', n: 1 },
    ],
    upgradedEffects: [
      { op: 'damage', n: 2 },
      { op: 'gainActions', n: 1 },
    ],
  },
  nu_brainwave: {
    id: 'nu_brainwave',
    name: '뇌파 공격',
    type: 'action',
    actionCost: 1,
    cost: 5,
    dealsDamage: true,
    text: '3 피해',
    upgradedText: '4 피해, +1 카드',
    effects: [{ op: 'damage', n: 3 }],
    upgradedEffects: [
      { op: 'damage', n: 4 },
      { op: 'draw', n: 1 },
    ],
  },
  nu_resonance: {
    id: 'nu_resonance',
    name: '공명',
    type: 'action',
    actionCost: 0,
    cost: 6,
    dealsDamage: true,
    text: '이번 차례 낸 행동카드 1장당 +1 피해 (최대 +4)',
    upgradedText: '이번 차례 낸 행동카드 1장당 +1 피해 (최대 +6)',
    effects: [{ op: 'addAttackBonus', perAction: 1, cap: 4 }],
    upgradedEffects: [{ op: 'addAttackBonus', perAction: 1, cap: 6 }],
  },
  nu_mirror: {
    id: 'nu_mirror',
    name: '미러 프로토콜',
    type: 'action',
    actionCost: 1,
    cost: 5,
    text: '이번 차례 직전에 낸 행동카드의 효과를 한 번 더 발동한다',
    upgradedText: '같은 효과, +1 행동력',
    effects: [
      {
        op: 'repeatPrevAction'
      }
    ],
    upgradedEffects: [
      {
        op: 'repeatPrevAction'
      },
      {
        op: 'gainActions',
        n: 1
      }
    ]
  },
  nu_loopback: {
    id: 'nu_loopback',
    name: '루프백',
    type: 'action',
    actionCost: 0,
    cost: 3,
    text: '+1 행동력. 버린 더미의 행동카드 1장을 뽑을 덱 맨 위에 둔다',
    upgradedText: '+1 행동력. 그 카드를 손으로 가져온다',
    effects: [
      {
        op: 'gainActions',
        n: 1
      },
      {
        op: 'retrieveFromDiscard',
        n: 1,
        filter: 'action',
        to: 'deckTop',
        min: 1
      }
    ],
    upgradedEffects: [
      {
        op: 'gainActions',
        n: 1
      },
      {
        op: 'retrieveFromDiscard',
        n: 1,
        filter: 'action',
        to: 'hand',
        min: 1
      }
    ]
  },
  nu_reverb: {
    id: 'nu_reverb',
    name: '잔향',
    type: 'money',
    cost: 4,
    text: '+1원. 이번 차례 같은 이름의 행동카드를 2장 이상 냈다면 +3원',
    upgradedText: '+2원. 같은 조건 +3원',
    effects: [
      {
        op: 'gainCoins',
        n: 1
      },
      {
        op: 'if',
        cond: {
          stat: 'maxSameAction',
          gte: 2
        },
        then: [
          {
            op: 'gainCoins',
            n: 3
          }
        ]
      }
    ],
    upgradedEffects: [
      {
        op: 'gainCoins',
        n: 2
      },
      {
        op: 'if',
        cond: {
          stat: 'maxSameAction',
          gte: 2
        },
        then: [
          {
            op: 'gainCoins',
            n: 3
          }
        ]
      }
    ]
  },
};

/** @type {Record<string, import('../characters.js').FactionDef>} */
export const NEURO_FACTIONS = {
  neuro: {
    id: 'neuro',
    name: '뉴로 연합',
    cardIds: ['nu_synapse', 'nu_sync', 'nu_overload', 'nu_recursion', 'nu_emp'],
    characterIds: ['jin', 'gemini', 'echo'],
  },
};

/** @type {Record<string, import('../characters.js').CharacterDef>} */
export const NEURO_CHARACTERS = {
  jin: {
    id: 'jin',
    name: '진',
    factionId: 'neuro',
    maxHp: 54,
    cardIds: ['nu_barrage', 'nu_runaway', 'nu_chain'],
    ability: { opponentActionStar: { threshold: 6, stars: 1 } },
    abilityText: '상대가 한 차례에 행동카드를 6장 이상 내면 별 +1 (한 차례에 한 번)',
  },
  gemini: {
    id: 'gemini',
    name: '제미니아노',
    factionId: 'neuro',
    maxHp: 50,
    cardIds: ['nu_thought', 'nu_brainwave', 'nu_resonance'],
    ability: {
      activeAbility: {
        oncePerGame: true,
        effects: [{ op: 'addMod', key: 'actionDamageBonus', n: 2 }],
        text: '이번 차례 동안 피해를 주는 행동카드가 +2 피해',
      },
    },
    abilityText: '경기 중 1번 발동: 이번 차례 동안 피해를 주는 행동카드가 +2 피해',
  },
  echo: {
    id: 'echo',
    name: '에코',
    factionId: 'neuro',
    maxHp: 52,
    cardIds: [
      'nu_mirror',
      'nu_loopback',
      'nu_reverb'
    ],
    ability: {
      doubleFirstCostlyAction: {
        minOwnTurn: 4
      }
    },
    abilityText: '내 4번째 차례부터, 매 차례 처음 내는 ⚡1 행동카드의 효과가 2번 발동'
  },
};

registerCards(NEURO_CARDS);
registerFactions(NEURO_FACTIONS);
registerCharacters(NEURO_CHARACTERS);
