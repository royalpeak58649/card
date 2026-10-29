import { registerCards } from './registry.js';
import { registerFactions, registerCharacters } from '../characters.js';

// 모험 모드 '은빛 야수 소탕 작전' 의 적 진영. 플레이어가 고를 수 없다(enemy: true).
// 보스는 거래소에서 사지 않고(noBuy) 정해진 덱으로 시작해 매 차례 야수 카드를 1장씩 얻는다.
// 출혈: 출혈 상태에서 피해를 입으면 +1 추가 피해(행동카드 피해가 섞이면 +2) 후 사라진다. 중첩되지 않는다.

/** @type {Record<string, import('./registry.js').CardDef>} */
export const SILVERBEAST_CARDS = {
  sb_fang: {
    id: 'sb_fang',
    name: '송곳니',
    type: 'weapon',
    cost: 2,
    text: '1 피해. 상대가 출혈 상태면 +1 피해',
    upgradedText: '2 피해. 상대가 출혈 상태면 +1 피해',
    effects: [
      {
        op: 'damage',
        n: 1
      },
      {
        op: 'if',
        cond: {
          stat: 'oppBleed',
          gte: 1
        },
        then: [
          {
            op: 'damage',
            n: 1
          }
        ]
      }
    ],
    upgradedEffects: [
      {
        op: 'damage',
        n: 2
      },
      {
        op: 'if',
        cond: {
          stat: 'oppBleed',
          gte: 1
        },
        then: [
          {
            op: 'damage',
            n: 1
          }
        ]
      }
    ]
  },
  sb_claw: {
    id: 'sb_claw',
    name: '은빛 발톱',
    type: 'weapon',
    cost: 4,
    text: '2 피해. 피해를 줬다면 상대에게 출혈',
    upgradedText: '3 피해. 피해를 줬다면 상대에게 출혈',
    effects: [
      {
        op: 'damage',
        n: 2
      },
      {
        op: 'applyBleed',
        timing: 'afterAttack'
      }
    ],
    upgradedEffects: [
      {
        op: 'damage',
        n: 3
      },
      {
        op: 'applyBleed',
        timing: 'afterAttack'
      }
    ]
  },
  sb_rend: {
    id: 'sb_rend',
    name: '찢어발기기',
    type: 'action',
    actionCost: 0,
    cost: 4,
    dealsDamage: true,
    text: '1 피해, 상대에게 출혈',
    upgradedText: '2 피해, 상대에게 출혈',
    effects: [
      {
        op: 'damage',
        n: 1
      },
      {
        op: 'applyBleed'
      }
    ],
    upgradedEffects: [
      {
        op: 'damage',
        n: 2
      },
      {
        op: 'applyBleed'
      }
    ]
  },
  sb_scent: {
    id: 'sb_scent',
    name: '피 냄새',
    type: 'action',
    actionCost: 0,
    cost: 3,
    text: '+1 카드. 상대가 출혈 상태면 +1 행동력',
    upgradedText: '+2 카드. 상대가 출혈 상태면 +1 행동력',
    effects: [
      {
        op: 'draw',
        n: 1
      },
      {
        op: 'if',
        cond: {
          stat: 'oppBleed',
          gte: 1
        },
        then: [
          {
            op: 'gainActions',
            n: 1
          }
        ]
      }
    ],
    upgradedEffects: [
      {
        op: 'draw',
        n: 2
      },
      {
        op: 'if',
        cond: {
          stat: 'oppBleed',
          gte: 1
        },
        then: [
          {
            op: 'gainActions',
            n: 1
          }
        ]
      }
    ]
  },
  sb_howl: {
    id: 'sb_howl',
    name: '포효',
    type: 'action',
    actionCost: 0,
    cost: 3,
    text: '+2 행동력',
    upgradedText: '+2 행동력, +1 카드',
    effects: [
      {
        op: 'gainActions',
        n: 2
      }
    ],
    upgradedEffects: [
      {
        op: 'gainActions',
        n: 2
      },
      {
        op: 'draw',
        n: 1
      }
    ]
  },
  sb_pack: {
    id: 'sb_pack',
    name: '무리 사냥',
    type: 'action',
    actionCost: 1,
    cost: 5,
    dealsDamage: true,
    text: '이번 차례 낸 무기카드 1장당 +1 피해 (최대 3)',
    upgradedText: '최대 5',
    effects: [
      {
        op: 'addAttackBonus',
        perWeapon: 1,
        cap: 3
      }
    ],
    upgradedEffects: [
      {
        op: 'addAttackBonus',
        perWeapon: 1,
        cap: 5
      }
    ]
  },
  sb_mane: {
    id: 'sb_mane',
    name: '은빛 갈기',
    type: 'action',
    actionCost: 0,
    cost: 3,
    text: '방어 +2',
    upgradedText: '방어 +3, +1 카드',
    effects: [
      {
        op: 'addDefense',
        n: 2
      }
    ],
    upgradedEffects: [
      {
        op: 'addDefense',
        n: 3
      },
      {
        op: 'draw',
        n: 1
      }
    ]
  },
  sb_regen: {
    id: 'sb_regen',
    name: '은빛 재생',
    type: 'action',
    actionCost: 1,
    cost: 4,
    text: '체력 3 회복',
    upgradedText: '체력 5 회복',
    effects: [
      {
        op: 'heal',
        n: 3
      }
    ],
    upgradedEffects: [
      {
        op: 'heal',
        n: 5
      }
    ]
  },
  sb_maul: {
    id: 'sb_maul',
    name: '우두머리의 일격',
    type: 'weapon',
    cost: 8,
    text: '4 피해',
    upgradedText: '5 피해. 피해를 줬다면 상대에게 출혈',
    effects: [
      {
        op: 'damage',
        n: 4
      }
    ],
    upgradedEffects: [
      {
        op: 'damage',
        n: 5
      },
      {
        op: 'applyBleed',
        timing: 'afterAttack'
      }
    ]
  },
  sb_frenzy: {
    id: 'sb_frenzy',
    name: '핏빛 광란',
    type: 'action',
    actionCost: 1,
    cost: 6,
    dealsDamage: true,
    text: '2 피해, 상대에게 출혈, +1 행동력',
    upgradedText: '3 피해, 상대에게 출혈, +1 행동력',
    effects: [
      {
        op: 'damage',
        n: 2
      },
      {
        op: 'applyBleed'
      },
      {
        op: 'gainActions',
        n: 1
      }
    ],
    upgradedEffects: [
      {
        op: 'damage',
        n: 3
      },
      {
        op: 'applyBleed'
      },
      {
        op: 'gainActions',
        n: 1
      }
    ]
  },
  sb_wound: {
    id: 'sb_wound',
    name: '상처 벌리기',
    type: 'action',
    actionCost: 0,
    cost: 5,
    dealsDamage: true,
    text: '상대가 출혈 상태면 3 피해, 아니면 1 피해',
    upgradedText: '상대가 출혈 상태면 4 피해, 아니면 2 피해',
    effects: [
      {
        op: 'if',
        cond: {
          stat: 'oppBleed',
          gte: 1
        },
        then: [
          {
            op: 'damage',
            n: 3
          }
        ],
        else: [
          {
            op: 'damage',
            n: 1
          }
        ]
      }
    ],
    upgradedEffects: [
      {
        op: 'if',
        cond: {
          stat: 'oppBleed',
          gte: 1
        },
        then: [
          {
            op: 'damage',
            n: 4
          }
        ],
        else: [
          {
            op: 'damage',
            n: 2
          }
        ]
      }
    ]
  },
};

export const SILVERBEAST_FACTIONS = {
  silverbeast: {
    id: 'silverbeast',
    name: '은빛 야수',
    enemy: true,
    cardIds: [],
    characterIds: [
      'sb_pup',
      'sb_wolfpack',
      'sb_stalker',
      'sb_bear',
      'sb_king'
    ]
  },
};

/** 스테이지 1~5 보스 */
export const SILVERBEAST_BOSSES = {
  sb_pup: {
    id: 'sb_pup',
    name: '어린 은빛늑대',
    factionId: 'silverbeast',
    enemy: true,
    maxHp: 24,
    cardIds: [],
    startDeck: ['pistol', 'pistol', 'pistol', 'pistol', 'stone', 'stone', 'stone', 'stone', 'sb_fang', 'sb_fang'],
    ability: {
      noBuy: true,
      startTriggers: [
        {
          effects: [
            {
              op: 'gainRandomCard',
              pool: ['sb_fang'],
              n: 1,
              to: 'discard'
            }
          ]
        }
      ]
    },
    abilityText: '매 차례 시작 시 카드 1장을 얻는다.'
  },
  sb_wolfpack: {
    id: 'sb_wolfpack',
    name: '은빛 늑대 무리',
    factionId: 'silverbeast',
    enemy: true,
    maxHp: 30,
    cardIds: [],
    startDeck: ['pistol', 'pistol', 'pistol', 'stone', 'stone', 'stone', 'stone', 'stone', 'sb_fang', 'sb_fang'],
    ability: {
      noBuy: true,
      startTriggers: [
        {
          effects: [
            {
              op: 'gainRandomCard',
              pool: ['sb_fang', 'sb_claw', 'stone', 'stone'],
              n: 1,
              to: 'discard'
            }
          ]
        }
      ]
    },
    abilityText: '매 차례 시작 시 카드 1장을 얻는다 (야수 카드 50%, 아니면 돌).'
  },
  sb_stalker: {
    id: 'sb_stalker',
    name: '은빛 추적자',
    factionId: 'silverbeast',
    enemy: true,
    maxHp: 38,
    cardIds: [],
    startDeck: ['pistol', 'pistol', 'pistol', 'stone', 'stone', 'stone', 'stone', 'stone', 'sb_fang', 'sb_fang'],
    ability: {
      noBuy: true,
      startTriggers: [
        {
          effects: [
            {
              op: 'gainRandomCard',
              pool: ['sb_fang', 'sb_claw', 'sb_scent', 'sb_rend', 'stone', 'stone', 'stone', 'stone'],
              n: 1,
              to: 'discard'
            }
          ]
        }
      ],
      attackBonuses: [
        {
          flat: 1,
          cond: {
            stat: 'oppBleed',
            gte: 1
          }
        }
      ]
    },
    abilityText: '매 차례 시작 시 카드 1장을 얻는다 (야수 카드 50%, 아니면 돌). 출혈 상태인 상대를 공격하면 +1 피해.'
  },
  sb_bear: {
    id: 'sb_bear',
    name: '은빛 갑주곰',
    factionId: 'silverbeast',
    enemy: true,
    maxHp: 46,
    cardIds: [],
    startDeck: ['pistol', 'pistol', 'pistol', 'stone', 'stone', 'stone', 'stone', 'stone', 'stone', 'sb_fang', 'sb_mane'],
    ability: {
      noBuy: true,
      startTriggers: [
        {
          effects: [
            {
              op: 'gainRandomCard',
              pool: ['sb_claw', 'sb_maul', 'sb_mane', 'sb_fang', 'sb_regen', 'stone', 'stone', 'stone', 'stone', 'stone', 'stone', 'stone', 'stone', 'stone', 'stone', 'stone', 'stone', 'stone'],
              n: 1,
              to: 'discard'
            }
          ]
        }
      ],
      endTriggers: [
        {
          effects: [
            {
              op: 'addDefense',
              n: 1
            }
          ]
        }
      ]
    },
    abilityText: '매 차례 시작 시 카드 1장을 얻는다 (야수 카드 28%, 아니면 돌). 차례가 끝날 때 방어 +1.'
  },
  sb_king: {
    id: 'sb_king',
    name: '은빛 야수왕',
    factionId: 'silverbeast',
    enemy: true,
    maxHp: 56,
    cardIds: [],
    startDeck: ['pistol', 'pistol', 'pistol', 'pistol', 'stone', 'stone', 'stone', 'stone', 'stone', 'sb_fang', 'sb_claw'],
    ability: {
      noBuy: true,
      startTriggers: [
        {
          effects: [
            {
              op: 'gainRandomCard',
              pool: ['sb_claw', 'sb_rend', 'sb_maul', 'sb_wound', 'sb_frenzy', 'stone', 'stone', 'stone', 'stone', 'stone', 'stone', 'stone', 'stone', 'stone', 'stone', 'stone', 'stone', 'stone', 'stone', 'stone', 'stone', 'stone', 'stone', 'stone', 'stone', 'stone', 'stone'],
              n: 1,
              to: 'discard'
            }
          ]
        }
      ],
      attackBonuses: [
        {
          flat: 1,
          cond: {
            stat: 'oppBleed',
            gte: 1
          }
        }
      ]
    },
    abilityText: '매 차례 시작 시 카드 1장을 얻는다 (야수 카드 19%, 아니면 돌). 출혈 상태인 상대를 공격하면 +1 피해.'
  },
};

registerCards(SILVERBEAST_CARDS);
registerFactions(SILVERBEAST_FACTIONS);
registerCharacters(SILVERBEAST_BOSSES);
