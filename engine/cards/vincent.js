import { registerCards } from './registry.js';
import { registerFactions, registerCharacters } from '../characters.js';

// 빈센트 공화국: 빚(debt)으로 자원을 미리 당겨 쓰고 그 빚을 관리하는 진영.
// 빚이 1 이상이면 구매할 수 없고, 구매단계에 원으로 갚는다(payDebt).

/** @type {Record<string, import('./registry.js').CardDef>} */
export const VINCENT_CARDS = {
  vc_usury: {
    id: 'vc_usury',
    name: '고리대금',
    type: 'money',
    cost: 3,
    text: '+4원, 빚 +2',
    upgradedText: '+5원, 빚 +2',
    effects: [
      {
        op: 'gainCoins',
        n: 4
      },
      {
        op: 'gainDebt',
        n: 2
      }
    ],
    upgradedEffects: [
      {
        op: 'gainCoins',
        n: 5
      },
      {
        op: 'gainDebt',
        n: 2
      }
    ]
  },
  vc_creditLoan: {
    id: 'vc_creditLoan',
    name: '신용 대출',
    type: 'action',
    actionCost: 0,
    cost: 4,
    text: '+2 카드, 빚 +2',
    upgradedText: '+3 카드, 빚 +2',
    effects: [
      {
        op: 'draw',
        n: 2
      },
      {
        op: 'gainDebt',
        n: 2
      }
    ],
    upgradedEffects: [
      {
        op: 'draw',
        n: 3
      },
      {
        op: 'gainDebt',
        n: 2
      }
    ]
  },
  vc_bond: {
    id: 'vc_bond',
    name: '채권 발행',
    type: 'action',
    actionCost: 1,
    cost: 4,
    text: '거래소에서 구매가 5 이하 카드 1장을 얻는다, 빚 +3',
    upgradedText: '구매가 7 이하',
    effects: [
      {
        op: 'gainFromMarket',
        maxCost: 5,
        to: 'discard',
        debt: 3
      }
    ],
    upgradedEffects: [
      {
        op: 'gainFromMarket',
        maxCost: 7,
        to: 'discard',
        debt: 3
      }
    ]
  },
  vc_repayPlan: {
    id: 'vc_repayPlan',
    name: '상환 계획',
    type: 'money',
    cost: 4,
    text: '+2원, 빚 1을 없앤다',
    upgradedText: '+2원, 빚 2를 없앤다',
    effects: [
      {
        op: 'gainCoins',
        n: 2
      },
      {
        op: 'reduceDebt',
        n: 1
      }
    ],
    upgradedEffects: [
      {
        op: 'gainCoins',
        n: 2
      },
      {
        op: 'reduceDebt',
        n: 2
      }
    ]
  },
  vc_seizure: {
    id: 'vc_seizure',
    name: '강제 집행',
    type: 'weapon',
    cost: 5,
    text: '2 피해. 빚이 없다면 +2 피해',
    upgradedText: '3 피해. 빚이 없다면 +2 피해',
    effects: [
      {
        op: 'damage',
        n: 2
      },
      {
        op: 'if',
        cond: {
          stat: 'debt',
          eq: 0
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
          stat: 'debt',
          eq: 0
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
  vc_advance: {
    id: 'vc_advance',
    name: '선지급',
    type: 'action',
    actionCost: 0,
    cost: 3,
    text: '+2 카드, +1 행동력, 빚 +2',
    upgradedText: '+3 카드, +1 행동력, 빚 +2',
    effects: [
      {
        op: 'draw',
        n: 2
      },
      {
        op: 'gainActions',
        n: 1
      },
      {
        op: 'gainDebt',
        n: 2
      }
    ],
    upgradedEffects: [
      {
        op: 'draw',
        n: 3
      },
      {
        op: 'gainActions',
        n: 1
      },
      {
        op: 'gainDebt',
        n: 2
      }
    ]
  },
  vc_leverage: {
    id: 'vc_leverage',
    name: '레버리지',
    type: 'money',
    cost: 5,
    text: '+2원. 빚이 있다면 +2원 더',
    upgradedText: '+3원. 빚이 있다면 +2원 더',
    effects: [
      {
        op: 'gainCoins',
        n: 2
      },
      {
        op: 'if',
        cond: {
          stat: 'debt',
          gte: 1
        },
        then: [
          {
            op: 'gainCoins',
            n: 2
          }
        ]
      }
    ],
    upgradedEffects: [
      {
        op: 'gainCoins',
        n: 3
      },
      {
        op: 'if',
        cond: {
          stat: 'debt',
          gte: 1
        },
        then: [
          {
            op: 'gainCoins',
            n: 2
          }
        ]
      }
    ]
  },
  vc_futures: {
    id: 'vc_futures',
    name: '미래 자원',
    type: 'action',
    actionCost: 1,
    cost: 5,
    text: '거래소에서 구매가 6 이하 카드 1장을 손으로 얻는다, 빚 +3',
    upgradedText: '구매가 8 이하',
    effects: [
      {
        op: 'gainFromMarket',
        maxCost: 6,
        to: 'hand',
        debt: 3
      }
    ],
    upgradedEffects: [
      {
        op: 'gainFromMarket',
        maxCost: 8,
        to: 'hand',
        debt: 3
      }
    ]
  },
  vc_blameShift: {
    id: 'vc_blameShift',
    name: '책임 전가',
    type: 'action',
    actionCost: 1,
    cost: 4,
    text: '내 빚을 최대 3까지 상대에게 넘긴다',
    upgradedText: '최대 5',
    effects: [
      {
        op: 'transferDebt',
        max: 3
      }
    ],
    upgradedEffects: [
      {
        op: 'transferDebt',
        max: 5
      }
    ]
  },
  vc_bankruptcy: {
    id: 'vc_bankruptcy',
    name: '파산 신청',
    type: 'action',
    actionCost: 0,
    cost: 5,
    text: '내 빚을 모두 없앤다. 사용 후 제거된다',
    upgradedText: '내 빚을 모두 없앤다, +1 카드. 사용 후 제거된다',
    effects: [
      {
        op: 'clearDebt'
      },
      {
        op: 'trashSelfAtCleanup'
      }
    ],
    upgradedEffects: [
      {
        op: 'clearDebt'
      },
      {
        op: 'draw',
        n: 1
      },
      {
        op: 'trashSelfAtCleanup'
      }
    ]
  },
  vc_freeze: {
    id: 'vc_freeze',
    name: '채무 동결',
    type: 'money',
    cost: 4,
    text: '+2원. 이번 차례 빚이 있어도 구매할 수 있다',
    upgradedText: '+3원. 같은 효과',
    effects: [
      {
        op: 'gainCoins',
        n: 2
      },
      {
        op: 'addMod',
        key: 'ignoreDebt',
        n: 1
      }
    ],
    upgradedEffects: [
      {
        op: 'gainCoins',
        n: 3
      },
      {
        op: 'addMod',
        key: 'ignoreDebt',
        n: 1
      }
    ]
  },
  vc_interest: {
    id: 'vc_interest',
    name: '이자 계산',
    type: 'weapon',
    cost: 6,
    text: '1 피해. 내 빚 1당 +1 피해 (최대 +5)',
    upgradedText: '2 피해. 내 빚 1당 +1 피해 (최대 +6)',
    effects: [
      {
        op: 'damage',
        n: 1
      },
      {
        op: 'damagePerStat',
        stat: 'debt',
        per: 1,
        max: 5
      }
    ],
    upgradedEffects: [
      {
        op: 'damage',
        n: 2
      },
      {
        op: 'damagePerStat',
        stat: 'debt',
        per: 1,
        max: 6
      }
    ]
  },
  vc_balanceSheet: {
    id: 'vc_balanceSheet',
    name: '대차대조표',
    type: 'action',
    actionCost: 0,
    cost: 3,
    text: '내 빚 1당 +1원 (최대 4)',
    upgradedText: '최대 6',
    effects: [
      {
        op: 'gainCoinsPerStat',
        stat: 'debt',
        per: 1,
        max: 4
      }
    ],
    upgradedEffects: [
      {
        op: 'gainCoinsPerStat',
        stat: 'debt',
        per: 1,
        max: 6
      }
    ]
  },
  vc_debtRepay: {
    id: 'vc_debtRepay',
    name: '채무 상환',
    type: 'action',
    actionCost: 1,
    cost: 5,
    dealsDamage: true,
    text: '원 없이 빚을 최대 3 갚고, 갚은 빚 1당 +1 피해',
    upgradedText: '최대 5',
    effects: [
      {
        op: 'debtToDamage',
        max: 3,
        per: 1
      }
    ],
    upgradedEffects: [
      {
        op: 'debtToDamage',
        max: 5,
        per: 1
      }
    ]
  },
};

export const VINCENT_FACTIONS = {
  vincent: {
    id: 'vincent',
    name: '빈센트 공화국',
    cardIds: [
      'vc_usury',
      'vc_creditLoan',
      'vc_bond',
      'vc_repayPlan',
      'vc_seizure'
    ],
    characterIds: [
      'lime',
      'sol',
      'argus'
    ]
  },
};

export const VINCENT_CHARACTERS = {
  lime: {
    id: 'lime',
    name: '라임',
    factionId: 'vincent',
    maxHp: 52,
    cardIds: [
      'vc_advance',
      'vc_leverage',
      'vc_futures'
    ],
    ability: {
      extraDrawIfDebt: 1
    },
    abilityText: '빚이 있으면 차례 끝에 1장 더 뽑는다 (6장)'
  },
  sol: {
    id: 'sol',
    name: '솔',
    factionId: 'vincent',
    maxHp: 54,
    cardIds: [
      'vc_blameShift',
      'vc_bankruptcy',
      'vc_freeze'
    ],
    ability: {
      startTriggers: [
        {
          cond: {
            stat: 'debt',
            gte: 1
          },
          effects: [
            {
              op: 'reduceDebt',
              n: 1
            }
          ]
        }
      ]
    },
    abilityText: '내 차례 시작 시 빚이 있으면 빚 1을 없앤다'
  },
  argus: {
    id: 'argus',
    name: '아르거스',
    factionId: 'vincent',
    maxHp: 56,
    cardIds: [
      'vc_interest',
      'vc_balanceSheet',
      'vc_debtRepay'
    ],
    ability: {
      attackBonuses: [
        {
          perStat: {
            stat: 'debtHalf',
            per: 1
          },
          cap: 3
        }
      ]
    },
    abilityText: '공격할 때 내 빚 2당 +1 피해 (최대 +3)'
  },
};

registerCards(VINCENT_CARDS);
registerFactions(VINCENT_FACTIONS);
registerCharacters(VINCENT_CHARACTERS);
