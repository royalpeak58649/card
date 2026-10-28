import { registerCards } from './registry.js';
import { registerFactions, registerCharacters } from '../characters.js';

/** @type {Record<string, import('./registry.js').CardDef>} */
export const LIGAND_CARDS = {
  // 진영 카드
  lg_offering: {
    id: 'lg_offering',
    name: '별빛 헌금',
    type: 'money',
    cost: 4,
    text: '+1원, 별 +1',
    upgradedText: '+2원, 별 +1',
    effects: [
      { op: 'gainCoins', n: 1 },
      { op: 'gainStars', n: 1 },
    ],
    upgradedEffects: [
      { op: 'gainCoins', n: 2 },
      { op: 'gainStars', n: 1 },
    ],
  },
  lg_ritual: {
    id: 'lg_ritual',
    name: '성좌 의식',
    type: 'action',
    actionCost: 0,
    cost: 3,
    text: '별 +1. 이번 차례 별을 쓴 적 있다면 +1 카드',
    upgradedText: '별 +1, +1 카드',
    effects: [
      { op: 'gainStars', n: 1 },
      { op: 'if', cond: { stat: 'starsSpent', gte: 1 }, then: [{ op: 'draw', n: 1 }] },
    ],
    upgradedEffects: [
      { op: 'gainStars', n: 1 },
      { op: 'draw', n: 1 },
    ],
  },
  lg_blessing: {
    id: 'lg_blessing',
    name: '별의 축복',
    type: 'action',
    actionCost: 1,
    cost: 4,
    text: '손패 1장을 별 없이 일시 강화한다',
    upgradedText: '손패 2장을 별 없이 일시 강화한다',
    effects: [{ op: 'freeUpgrade', n: 1 }],
    upgradedEffects: [{ op: 'freeUpgrade', n: 2 }],
  },
  lg_meteor: {
    id: 'lg_meteor',
    name: '유성 낙하',
    type: 'weapon',
    cost: 5,
    dealsDamage: true,
    text: '2 피해. 별 1개를 써서 +3 피해 할 수 있다',
    upgradedText: '3 피해. 별 1개를 써서 +3 피해 할 수 있다',
    effects: [
      { op: 'damage', n: 2 },
      { op: 'payStars', n: 1, then: [{ op: 'damage', n: 3 }] },
    ],
    upgradedEffects: [
      { op: 'damage', n: 3 },
      { op: 'payStars', n: 1, then: [{ op: 'damage', n: 3 }] },
    ],
  },
  lg_observatory: {
    id: 'lg_observatory',
    name: '왕실 천문대',
    type: 'action',
    actionCost: 1,
    cost: 5,
    text: '+2 카드. 이번 차례 쓴 별 1개당 +1원 (최대 3)',
    upgradedText: '+2 카드. 이번 차례 쓴 별 1개당 +1원 (최대 5)',
    effects: [
      { op: 'draw', n: 2 },
      { op: 'gainCoinsPerStat', stat: 'starsSpent', per: 1, max: 3 },
    ],
    upgradedEffects: [
      { op: 'draw', n: 2 },
      { op: 'gainCoinsPerStat', stat: 'starsSpent', per: 1, max: 5 },
    ],
  },

  // 캐릭터 jace
  lg_hone: {
    id: 'lg_hone',
    name: '연마',
    type: 'action',
    actionCost: 0,
    cost: 3,
    text: '손패 1장을 별 없이 일시 강화, +1 카드, +1 행동력',
    upgradedText: '손패 1장을 별 없이 일시 강화, +2 카드, +1 행동력',
    effects: [
      {
        op: 'freeUpgrade',
        n: 1
      },
      {
        op: 'draw',
        n: 1
      },
      {
        op: 'gainActions',
        n: 1
      }
    ],
    upgradedEffects: [
      {
        op: 'freeUpgrade',
        n: 1
      },
      {
        op: 'draw',
        n: 2
      },
      {
        op: 'gainActions',
        n: 1
      }
    ]
  },
  lg_masterSword: {
    id: 'lg_masterSword',
    name: '장인의 검',
    type: 'weapon',
    cost: 6,
    dealsDamage: true,
    text: '2 피해. 내 덱의 영구 강화 카드 1장당 +1 피해 (최대 +4)',
    upgradedText: '3 피해. 내 덱의 영구 강화 카드 1장당 +1 피해 (최대 +6)',
    effects: [
      { op: 'damage', n: 2 },
      { op: 'addAttackBonus', perStat: { stat: 'upgradedOwned', per: 1 }, cap: 4 },
    ],
    upgradedEffects: [
      { op: 'damage', n: 3 },
      { op: 'addAttackBonus', perStat: { stat: 'upgradedOwned', per: 1 }, cap: 6 },
    ],
  },
  lg_collection: {
    id: 'lg_collection',
    name: '명품 컬렉션',
    type: 'money',
    cost: 5,
    text: '+2원. 이번 차례 낸 강화된 카드 1장당 +1원 (최대 3)',
    upgradedText: '+2원. 이번 차례 낸 강화된 카드 1장당 +1원 (최대 5)',
    effects: [
      { op: 'gainCoins', n: 2 },
      { op: 'gainCoinsPerStat', stat: 'upgradedPlayed', per: 1, max: 3 },
    ],
    upgradedEffects: [
      { op: 'gainCoins', n: 2 },
      { op: 'gainCoinsPerStat', stat: 'upgradedPlayed', per: 1, max: 5 },
    ],
  },

  // 캐릭터 elena
  lg_starburst: {
    id: 'lg_starburst',
    name: '성광 폭발',
    type: 'action',
    actionCost: 1,
    cost: 4,
    dealsDamage: true,
    text: '이번 차례 쓴 별 1개당 +2 피해 (공격 끝에 계산, 최대 +8)',
    upgradedText: '이번 차례 쓴 별 1개당 +2 피해 (공격 끝에 계산, 최대 +12)',
    effects: [{ op: 'addAttackBonus', perStat: { stat: 'starsSpent', per: 2 }, cap: 8 }],
    upgradedEffects: [{ op: 'addAttackBonus', perStat: { stat: 'starsSpent', per: 2 }, cap: 12 }],
  },
  lg_pact: {
    id: 'lg_pact',
    name: '별의 계약',
    type: 'action',
    actionCost: 0,
    cost: 3,
    text: '별 1개를 쓸 수 있다. 그렇게 했다면 +2 카드, +2 행동력',
    upgradedText: '별 1개를 쓸 수 있다. 그렇게 했다면 +3 카드, +2 행동력',
    effects: [
      {
        op: 'payStars',
        n: 1,
        then: [
          {
            op: 'draw',
            n: 2
          },
          {
            op: 'gainActions',
            n: 2
          }
        ]
      }
    ],
    upgradedEffects: [
      {
        op: 'payStars',
        n: 1,
        then: [
          {
            op: 'draw',
            n: 3
          },
          {
            op: 'gainActions',
            n: 2
          }
        ]
      }
    ]
  },
  lg_nebulaCoin: {
    id: 'lg_nebulaCoin',
    name: '성운 금화',
    type: 'money',
    cost: 4,
    text: '+1원. 이번 차례 쓴 별 1개당 +1원 (최대 4)',
    upgradedText: '+2원. 이번 차례 쓴 별 1개당 +1원 (최대 5)',
    effects: [
      { op: 'gainCoins', n: 1 },
      { op: 'gainCoinsPerStat', stat: 'starsSpent', per: 1, max: 4 },
    ],
    upgradedEffects: [
      { op: 'gainCoins', n: 2 },
      { op: 'gainCoinsPerStat', stat: 'starsSpent', per: 1, max: 5 },
    ],
  },
  lg_constellShield: {
    id: 'lg_constellShield',
    name: '별자리 방패',
    type: 'action',
    actionCost: 0,
    cost: 4,
    text: '지금 가진 별 1개당 방어 +1 (최대 5)',
    upgradedText: '최대 7',
    effects: [
      {
        op: 'addDefense',
        perStat: {
          stat: 'stars',
          per: 1
        },
        max: 5
      }
    ],
    upgradedEffects: [
      {
        op: 'addDefense',
        perStat: {
          stat: 'stars',
          per: 1
        },
        max: 7
      }
    ]
  },
  lg_starWeight: {
    id: 'lg_starWeight',
    name: '별의 무게',
    type: 'weapon',
    cost: 6,
    text: '지금 가진 별 1개당 1 피해 (최대 6, 별은 쓰지 않음)',
    upgradedText: '같은 효과 +2 피해',
    effects: [
      {
        op: 'damagePerStat',
        stat: 'stars',
        per: 1,
        max: 6
      }
    ],
    upgradedEffects: [
      {
        op: 'damagePerStat',
        stat: 'stars',
        per: 1,
        max: 6,
        plus: 2
      }
    ]
  },
  lg_galaxyVault: {
    id: 'lg_galaxyVault',
    name: '은하 저장고',
    type: 'action',
    actionCost: 1,
    cost: 5,
    text: '별 +2, +1 카드',
    upgradedText: '별 +2, +2 카드',
    effects: [
      {
        op: 'gainStars',
        n: 2
      },
      {
        op: 'draw',
        n: 1
      }
    ],
    upgradedEffects: [
      {
        op: 'gainStars',
        n: 2
      },
      {
        op: 'draw',
        n: 2
      }
    ]
  },
};

/** @type {Record<string, import('../characters.js').FactionDef>} */
export const LIGAND_FACTIONS = {
  ligand: {
    id: 'ligand',
    name: '리간드 왕국',
    cardIds: ['lg_offering', 'lg_ritual', 'lg_blessing', 'lg_meteor', 'lg_observatory'],
    characterIds: ['jace', 'elena', 'astra'],
  },
};

/** @type {Record<string, import('../characters.js').CharacterDef>} */
export const LIGAND_CHARACTERS = {
  jace: {
    id: 'jace',
    name: '제이스',
    factionId: 'ligand',
    maxHp: 55,
    cardIds: ['lg_hone', 'lg_masterSword', 'lg_collection'],
    ability: { permUpgradeCost: 3 },
    abilityText: '영구 강화 비용이 별 3개',
  },
  elena: {
    id: 'elena',
    name: '엘레나',
    factionId: 'ligand',
    maxHp: 54,
    cardIds: ['lg_starburst', 'lg_pact', 'lg_nebulaCoin'],
    ability: {
      endTriggers: [
        { cond: { stat: 'starsSpent', gte: 3 }, effects: [{ op: 'gainStars', n: 1 }] },
      ],
    },
    abilityText: '이번 차례 별을 3개 이상 썼다면 차례 끝에 별 +1',
  },
  astra: {
    id: 'astra',
    name: '별지기 아스트라',
    factionId: 'ligand',
    maxHp: 54,
    cardIds: [
      'lg_constellShield',
      'lg_starWeight',
      'lg_galaxyVault'
    ],
    ability: {
      maxStars: 7,
      startTriggers: [
        {
          cond: {
            stat: 'stars',
            gte: 5
          },
          effects: [
            {
              op: 'gainCoins',
              n: 1
            }
          ]
        }
      ]
    },
    abilityText: '별 최대치가 7. 차례 시작 시 별이 5개 이상이면 +1원'
  },
};

registerCards(LIGAND_CARDS);
registerFactions(LIGAND_FACTIONS);
registerCharacters(LIGAND_CHARACTERS);
