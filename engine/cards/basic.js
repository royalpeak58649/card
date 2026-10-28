import { registerCards } from './registry.js';

/** @type {Record<string, import('./registry.js').CardDef>} */
export const BASIC_CARDS = {
  stone: {
    id: 'stone',
    name: '돌',
    type: 'money',
    cost: 0,
    basic: true,
    effects: [{ op: 'gainCoins', n: 1 }],
  },
  silver: {
    id: 'silver',
    name: '은괴',
    type: 'money',
    cost: 3,
    basic: true,
    effects: [{ op: 'gainCoins', n: 2 }],
  },
  gold: {
    id: 'gold',
    name: '금괴',
    type: 'money',
    cost: 6,
    basic: true,
    effects: [{ op: 'gainCoins', n: 3 }],
  },
  pistol: {
    id: 'pistol',
    name: '권총',
    type: 'weapon',
    cost: 0,
    basic: true,
    effects: [{ op: 'damage', n: 1 }],
  },
  rifle: {
    id: 'rifle',
    name: '소총',
    type: 'weapon',
    cost: 5,
    basic: true,
    surchargeFirst: 2,
    effects: [{ op: 'damage', n: 3 }],
  },
  assaultRifle: {
    id: 'assaultRifle',
    name: '돌격소총',
    type: 'weapon',
    cost: 8,
    basic: true,
    surchargeFirst: 2,
    effects: [{ op: 'damage', n: 5 }],
  },
};

/** 기본 공급 더미 수 */
export const BASIC_PILE_SIZES = {
  stone: 30,
  silver: 30,
  gold: 20,
  pistol: 30,
  rifle: 12,
  assaultRifle: 10,
};

registerCards(BASIC_CARDS);
