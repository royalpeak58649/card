import { registerCards } from './registry.js';
import { registerFactions, registerCharacters } from '../characters.js';

/** @type {Record<string, import('./registry.js').CardDef>} */
export const SECTION8_CARDS = {
  // 진영 카드
  s8_supplyOrder: {
    id: 's8_supplyOrder',
    name: '보급 지령',
    type: 'action',
    actionCost: 0,
    cost: 2,
    text: '+1 카드, +1원',
    upgradedText: '+1 카드, +1 행동력, +1원',
    effects: [
      { op: 'draw', n: 1 },
      { op: 'gainCoins', n: 1 },
    ],
    upgradedEffects: [
      { op: 'draw', n: 1 },
      { op: 'gainActions', n: 1 },
      { op: 'gainCoins', n: 1 },
    ],
  },
  s8_logistics: {
    id: 's8_logistics',
    name: '군수 전환',
    type: 'action',
    actionCost: 1,
    cost: 4,
    text: '손에서 재화카드 1장을 제거할 수 있다. 그렇게 했다면 그 카드보다 구매가가 3 높은 한도 내의 무기카드 1장을 거래소에서 손으로 얻는다',
    upgradedText: '제거 대신 버려도 된다. 한도 +4',
    effects: [{ op: 'exchangeForWeapon', plus: 3, allowDiscard: false }],
    upgradedEffects: [{ op: 'exchangeForWeapon', plus: 4, allowDiscard: true }],
  },
  s8_opFunds: {
    id: 's8_opFunds',
    name: '작전 자금',
    type: 'money',
    cost: 5,
    text: '+2원. 이번 차례 무기카드를 구매하면 +1원을 돌려받는다',
    upgradedText: '+3원, +1 구매, 이번 차례 무기카드를 구매하면 +1원을 돌려받는다',
    effects: [
      { op: 'gainCoins', n: 2 },
      { op: 'addMod', key: 'weaponBuyRefund', n: 1 },
    ],
    upgradedEffects: [
      { op: 'gainCoins', n: 3 },
      { op: 'gainBuys', n: 1 },
      { op: 'addMod', key: 'weaponBuyRefund', n: 1 },
    ],
  },
  s8_maintenance: {
    id: 's8_maintenance',
    name: '정비 교대',
    type: 'action',
    actionCost: 0,
    cost: 3,
    text: '버린 더미의 무기카드 1장을 뽑을 덱 맨 위에 둔다',
    upgradedText: '버린 더미의 무기카드 1장을 손으로 가져온다',
    effects: [{ op: 'retrieveFromDiscard', n: 1, filter: 'weapon', to: 'deckTop', min: 1 }],
    upgradedEffects: [{ op: 'retrieveFromDiscard', n: 1, filter: 'weapon', to: 'hand', min: 1 }],
  },
  s8_serviceSmg: {
    id: 's8_serviceSmg',
    name: '제식 기관단총',
    type: 'weapon',
    cost: 5,
    text: '2 피해. 이번 차례 재화카드를 3장 이상 냈다면 +2 피해',
    upgradedText: '3 피해. 이번 차례 재화카드를 3장 이상 냈다면 +2 피해',
    effects: [
      { op: 'damage', n: 2 },
      { op: 'if', cond: { stat: 'moneyPlayed', gte: 3 }, then: [{ op: 'damage', n: 2 }] },
    ],
    upgradedEffects: [
      { op: 'damage', n: 3 },
      { op: 'if', cond: { stat: 'moneyPlayed', gte: 3 }, then: [{ op: 'damage', n: 2 }] },
    ],
  },

  // 캐릭터 hayun
  s8_emergencyProc: {
    id: 's8_emergencyProc',
    name: '긴급 조달',
    type: 'action',
    actionCost: 1,
    cost: 3,
    text: '거래소에서 구매가 5 이하 무기카드 1장을 얻어 뽑을 덱 맨 위에 둔다',
    upgradedText: '거래소에서 구매가 8 이하 무기카드 1장을 얻어 뽑을 덱 맨 위에 둔다',
    effects: [{ op: 'gainFromMarket', filter: 'weapon', maxCost: 5, to: 'deckTop' }],
    upgradedEffects: [{ op: 'gainFromMarket', filter: 'weapon', maxCost: 8, to: 'deckTop' }],
  },
  s8_budget: {
    id: 's8_budget',
    name: '예산 집행',
    type: 'money',
    cost: 4,
    text: '+2원. 손에 무기카드가 없다면 +1 카드',
    upgradedText: '+3원, +1 카드',
    effects: [
      { op: 'gainCoins', n: 2 },
      { op: 'if', cond: { handHasNoType: 'weapon' }, then: [{ op: 'draw', n: 1 }] },
    ],
    upgradedEffects: [
      { op: 'gainCoins', n: 3 },
      { op: 'draw', n: 1 },
    ],
  },
  s8_depot: {
    id: 's8_depot',
    name: '보급 창고',
    type: 'action',
    actionCost: 0,
    cost: 6,
    text: '+1 구매. 이번 차례 무기카드를 2장 이상 구매했다면 차례 끝에 별 +1',
    upgradedText: '+2 구매. 이번 차례 무기카드를 2장 이상 구매했다면 차례 끝에 별 +1',
    effects: [
      { op: 'gainBuys', n: 1 },
      {
        op: 'addEndTrigger',
        cond: { stat: 'boughtWeapons', gte: 2 },
        effects: [{ op: 'gainStars', n: 1 }],
      },
    ],
    upgradedEffects: [
      { op: 'gainBuys', n: 2 },
      {
        op: 'addEndTrigger',
        cond: { stat: 'boughtWeapons', gte: 2 },
        effects: [{ op: 'gainStars', n: 1 }],
      },
    ],
  },

  // 캐릭터 kangjin
  s8_breakthrough: {
    id: 's8_breakthrough',
    name: '돌파 명령',
    type: 'action',
    actionCost: 1,
    cost: 3,
    text: '+1 카드. 이번 공격단계에 무기카드 1장당 +1 피해 (최대 +3)',
    upgradedText: '+1 카드. 이번 공격단계에 무기카드 1장당 +1 피해',
    effects: [
      { op: 'draw', n: 1 },
      { op: 'addAttackBonus', perWeapon: 1, cap: 3 },
    ],
    upgradedEffects: [
      { op: 'draw', n: 1 },
      { op: 'addAttackBonus', perWeapon: 1 },
    ],
  },
  s8_loot: {
    id: 's8_loot',
    name: '전리품 회수',
    type: 'action',
    actionCost: 0,
    cost: 4,
    text: '이번 차례 상대에게 8 이상 피해를 줬다면 차례 끝에 금괴 1장을 얻는다',
    upgradedText: '이번 차례 상대에게 5 이상 피해를 줬다면 차례 끝에 금괴 1장을 얻는다',
    effects: [
      {
        op: 'addEndTrigger',
        cond: { stat: 'damageDealt', gte: 8 },
        effects: [{ op: 'gainCard', cardId: 'gold', to: 'discard' }],
      },
    ],
    upgradedEffects: [
      {
        op: 'addEndTrigger',
        cond: { stat: 'damageDealt', gte: 5 },
        effects: [{ op: 'gainCard', cardId: 'gold', to: 'discard' }],
      },
    ],
  },
  s8_heavyMg: {
    id: 's8_heavyMg',
    name: '중기관총',
    type: 'weapon',
    cost: 7,
    text: '1 피해. 이번 차례 낸 무기카드 1장당 +1 피해',
    upgradedText: '2 피해. 이번 차례 낸 무기카드 1장당 +1 피해',
    effects: [
      { op: 'damage', n: 1 },
      { op: 'addAttackBonus', perWeapon: 1 },
    ],
    upgradedEffects: [
      { op: 'damage', n: 2 },
      { op: 'addAttackBonus', perWeapon: 1 },
    ],
  },
  s8_trench: {
    id: 's8_trench',
    name: '참호 구축',
    type: 'action',
    actionCost: 0,
    cost: 3,
    text: '방어 +3',
    upgradedText: '방어 +5, +1 카드',
    effects: [
      {
        op: 'addDefense',
        n: 3
      }
    ],
    upgradedEffects: [
      {
        op: 'addDefense',
        n: 5
      },
      {
        op: 'draw',
        n: 1
      }
    ]
  },
  s8_suppress: {
    id: 's8_suppress',
    name: '제압 사격',
    type: 'weapon',
    cost: 5,
    text: '2 피해. 이번 차례 방어를 얻었다면 +2 피해',
    upgradedText: '3 피해. 이번 차례 방어를 얻었다면 +2 피해',
    effects: [
      {
        op: 'damage',
        n: 2
      },
      {
        op: 'if',
        cond: {
          stat: 'defenseGained',
          gte: 1
        },
        then: [
          {
            op: 'damage',
            n: 2
          }
        ]
      }
    ],
    upgradedEffects: [
      {
        op: 'damage',
        n: 3
      },
      {
        op: 'if',
        cond: {
          stat: 'defenseGained',
          gte: 1
        },
        then: [
          {
            op: 'damage',
            n: 2
          }
        ]
      }
    ]
  },
  s8_cutSupply: {
    id: 's8_cutSupply',
    name: '보급선 차단',
    type: 'action',
    actionCost: 1,
    cost: 5,
    text: '상대의 뽑을 덱 맨 위 2장을 버리게 한다. +1원',
    upgradedText: '3장, +1원',
    effects: [
      {
        op: 'opponentMillTop',
        n: 2
      },
      {
        op: 'gainCoins',
        n: 1
      }
    ],
    upgradedEffects: [
      {
        op: 'opponentMillTop',
        n: 3
      },
      {
        op: 'gainCoins',
        n: 1
      }
    ]
  },
};

/** @type {Record<string, import('../characters.js').FactionDef>} */
export const SECTION8_FACTIONS = {
  section8: {
    id: 'section8',
    name: 'Section 8',
    cardIds: ['s8_supplyOrder', 's8_logistics', 's8_opFunds', 's8_maintenance', 's8_serviceSmg'],
    characterIds: ['hayun', 'kangjin', 'doyun'],
  },
};

/** @type {Record<string, import('../characters.js').CharacterDef>} */
export const SECTION8_CHARACTERS = {
  hayun: {
    id: 'hayun',
    name: '보급관 하윤',
    factionId: 'section8',
    maxHp: 56,
    cardIds: ['s8_emergencyProc', 's8_budget', 's8_depot'],
    ability: {
      activeAbility: {
        maxUses: 2,
        minOwnTurn: 5,
        effects: [{ op: 'addMod', key: 'firstWeaponDiscount', n: 1 }],
        text: '이번 차례 처음으로 구매하는 무기카드의 구매가 -1',
      },
    },
    abilityText: '발동(내 5번째 차례부터, 경기 중 2번): 이번 차례 처음으로 구매하는 무기카드의 구매가 -1',
  },
  kangjin: {
    id: 'kangjin',
    name: '돌격대장 강진',
    factionId: 'section8',
    maxHp: 52,
    cardIds: ['s8_breakthrough', 's8_loot', 's8_heavyMg'],
    ability: { attackBonuses: [{ flat: 2, cond: { stat: 'weaponsPlayed', gte: 3 } }] },
    abilityText: '공격단계에 무기카드를 3장 이상 냈다면 +2 피해',
  },
  doyun: {
    id: 'doyun',
    name: '방어선 지휘관 도윤',
    factionId: 'section8',
    maxHp: 60,
    cardIds: [
      's8_trench',
      's8_suppress',
      's8_cutSupply'
    ],
    ability: {
      endTriggers: [
        {
          cond: {
            stat: 'weaponsPlayed',
            eq: 0,
          },
          effects: [
            {
              op: 'addDefense',
              n: 2
            }
          ]
        }
      ]
    },
    abilityText: '이번 차례 무기카드를 내지 않았다면, 차례가 끝날 때 방어 +2 (상대의 다음 공격 피해 -2)'
  },
};

registerCards(SECTION8_CARDS);
registerFactions(SECTION8_FACTIONS);
registerCharacters(SECTION8_CHARACTERS);
