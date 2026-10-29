import test from 'node:test';
import assert from 'node:assert/strict';

import { createGame, createCardInstance } from '../engine/state.js';
import { registerCards } from '../engine/cards/registry.js';
import {
  registerFactions,
  registerCharacters,
  allCharacterIds,
  allFactionIds,
} from '../engine/characters.js';
import { startGame, applyAction, canBuyCards } from '../engine/turn.js';

registerFactions({
  test_bl_beasts: {
    id: 'test_bl_beasts',
    name: '테스트 야수',
    cardIds: [],
    characterIds: ['test_bl_boss'],
    enemy: true,
  },
});

registerCharacters({
  test_bl_boss: {
    id: 'test_bl_boss',
    name: '테스트 보스',
    factionId: 'test_bl_beasts',
    maxHp: 30,
    cardIds: [],
    enemy: true,
    startDeck: [
      'pistol',
      'pistol',
      'pistol',
      'pistol',
      'pistol',
      'test_bl_claw',
      'test_bl_claw',
      'test_bl_claw',
      'test_bl_claw',
      'test_bl_claw',
    ],
    ability: {
      noBuy: true,
      startTriggers: [
        { effects: [{ op: 'gainRandomCard', pool: ['test_bl_claw'], n: 1, to: 'discard' }] },
      ],
    },
    abilityText: '',
  },
});

registerCards({
  test_bl_bleed: {
    id: 'test_bl_bleed',
    name: '테스트 출혈',
    type: 'action',
    actionCost: 0,
    cost: 1,
    effects: [{ op: 'applyBleed' }],
  },
  test_bl_slash: {
    id: 'test_bl_slash',
    name: '테스트 참격',
    type: 'action',
    actionCost: 0,
    cost: 1,
    dealsDamage: true,
    effects: [{ op: 'damage', n: 2 }],
  },
  test_bl_claw: {
    id: 'test_bl_claw',
    name: '테스트 발톱',
    type: 'weapon',
    cost: 1,
    effects: [{ op: 'damage', n: 2 }, { op: 'applyBleed', timing: 'afterAttack' }],
  },
  test_bl_ifBleed: {
    id: 'test_bl_ifBleed',
    name: '테스트 출혈 조건',
    type: 'action',
    actionCost: 0,
    cost: 1,
    effects: [{ op: 'if', cond: { stat: 'oppBleed', gte: 1 }, then: [{ op: 'gainCoins', n: 3 }] }],
  },
  test_bl_bonus: {
    id: 'test_bl_bonus',
    name: '테스트 공명',
    type: 'action',
    actionCost: 0,
    cost: 1,
    effects: [{ op: 'addAttackBonus', flat: 2 }],
  },
});

const PLAYERS = [
  { id: 'p0', name: '플레이어0', maxHp: 20 },
  { id: 'p1', name: '플레이어1', maxHp: 20 },
];

/**
 * 시작된 게임과 선공/후공 인덱스.
 * characters 는 [선공 캐릭터, 후공 캐릭터] 로 지정한다(선공은 seed 로 정해진다).
 */
function startedGame(seed = 12345, characters = [null, null]) {
  const probe = createGame({ seed, players: PLAYERS.map((p) => ({ ...p })) });
  const firstIndex = probe.firstPlayerIndex;
  const game = createGame({
    seed,
    players: PLAYERS.map((p, i) => ({
      ...p,
      characterId: characters[i === firstIndex ? 0 : 1] ?? null,
    })),
  });
  startGame(game);
  const first = game.activeIndex;
  return { game, first, second: 1 - first };
}

/** 손패를 지정한 카드 id 목록으로 교체한다(나머지는 drawPile 로). */
function setHand(game, playerIndex, cardIds) {
  const player = game.players[playerIndex];
  player.drawPile.push(...player.hand);
  player.hand = cardIds.map((id) => createCardInstance(game, id));
  return player.hand;
}

/** 손패에 카드를 한 장 더 넣는다. */
function addToHand(game, playerIndex, cardId) {
  const card = createCardInstance(game, cardId);
  game.players[playerIndex].hand.push(card);
  return card;
}

/** 손패의 카드를 모두 낸다(손패 복사본을 돈다). */
function playAll(game, playerIndex) {
  for (const card of [...game.players[playerIndex].hand]) {
    applyAction(game, playerIndex, { type: 'playCard', uid: card.uid });
  }
}

/** 행동단계 → 구매단계 → 공격단계까지 넘긴다. */
function toAttackPhase(game, playerIndex) {
  applyAction(game, playerIndex, { type: 'endPhase' }); // buy
  applyAction(game, playerIndex, { type: 'endPhase' }); // attack
}

/** 공격단계에서 손패의 무기를 모두 내고 공격을 해결한다. */
function attackWithHand(game, playerIndex) {
  playAll(game, playerIndex);
  applyAction(game, playerIndex, { type: 'endPhase' }); // 공격 해결 + 차례 끝
}

test('적 캐릭터·진영은 기본 목록에서 빠진다', () => {
  assert.ok(!allCharacterIds().includes('test_bl_boss'));
  assert.ok(allCharacterIds(true).includes('test_bl_boss'));
  assert.ok(!allFactionIds().includes('test_bl_beasts'));
  assert.ok(allFactionIds(true).includes('test_bl_beasts'));
});

test('startDeck 으로 시작 덱을 만들고 noBuy 면 구매할 수 없다', () => {
  const { game, first, second } = startedGame(12345, ['test_bl_boss', null]);
  const boss = game.players[first];
  // 시작 덱 10장 + 차례 시작 발동으로 버린 더미에 1장.
  const all = [...boss.drawPile, ...boss.hand, ...boss.discard];
  assert.equal(all.length, 11);
  assert.equal(all.filter((c) => c.cardId === 'test_bl_claw').length, 6);
  assert.equal(all.filter((c) => c.cardId === 'stone').length, 0);
  assert.equal(boss.discard.length, 1);
  assert.equal(boss.discard[0].cardId, 'test_bl_claw');

  assert.equal(canBuyCards(game, first), false);
  assert.equal(canBuyCards(game, second), true);

  applyAction(game, first, { type: 'endPhase' }); // buy
  game.players[first].coins = 10;
  assert.throws(() => applyAction(game, first, { type: 'buy', cardId: 'pistol' }), Error);
  assert.equal(game.players[first].coins, 10);
});

test('보스 차례가 시작되면 gainRandomCard 로 발톱이 버린 더미에 들어온다', () => {
  const { game, first, second } = startedGame(12345, ['test_bl_boss', null]);
  const before = game.players[first].discard.length;
  // 선공(보스) 차례를 넘겨 후공 차례로, 다시 보스 차례로 돌린다.
  applyAction(game, first, { type: 'endPhase' });
  applyAction(game, first, { type: 'endPhase' });
  applyAction(game, first, { type: 'endPhase' });
  applyAction(game, second, { type: 'endPhase' });
  applyAction(game, second, { type: 'endPhase' });
  applyAction(game, second, { type: 'endPhase' });
  assert.equal(game.activeIndex, first);
  const discard = game.players[first].discard;
  // 차례 끝에 손패가 버려지고, 새 차례 시작 발동으로 발톱 1장이 더 들어온다.
  assert.equal(discard.length, before + 5 + 1);
  assert.equal(discard[discard.length - 1].cardId, 'test_bl_claw');
});

test('출혈 + 무기 피해: 추가 피해 1', () => {
  const { game, first, second } = startedGame();
  setHand(game, first, ['test_bl_bleed']);
  playAll(game, first);
  assert.equal(game.players[second].bleed, true);

  toAttackPhase(game, first);
  setHand(game, first, ['pistol', 'pistol']);
  const hpBefore = game.players[second].hp;
  attackWithHand(game, first);
  assert.equal(game.players[second].hp, hpBefore - 3);
  assert.equal(game.players[second].bleed, false);
  assert.equal(game.turnState.bleedTriggered, 1);
});

test('출혈 + 행동카드 피해: 추가 피해 2', () => {
  const { game, first, second } = startedGame();
  setHand(game, first, ['test_bl_bleed']);
  playAll(game, first);
  toAttackPhase(game, first);
  setHand(game, first, ['test_bl_slash']);
  const hpBefore = game.players[second].hp;
  attackWithHand(game, first);
  assert.equal(game.players[second].hp, hpBefore - 4);
  assert.equal(game.players[second].bleed, false);
  assert.equal(game.turnState.bleedTriggered, 2);
});

test('섞인 피해(행동 2 + 무기 1): 추가 피해 2', () => {
  const { game, first, second } = startedGame();
  setHand(game, first, ['test_bl_bleed']);
  playAll(game, first);
  toAttackPhase(game, first);
  setHand(game, first, ['test_bl_slash', 'pistol']);
  const hpBefore = game.players[second].hp;
  attackWithHand(game, first);
  assert.equal(game.players[second].hp, hpBefore - 5);
  assert.equal(game.players[second].bleed, false);
  assert.equal(game.turnState.bleedTriggered, 2);
});

test('출혈은 중첩되지 않는다', () => {
  const { game, first, second } = startedGame();
  setHand(game, first, ['test_bl_bleed', 'test_bl_bleed']);
  playAll(game, first);
  assert.equal(game.players[second].bleed, true);

  toAttackPhase(game, first);
  setHand(game, first, ['pistol']);
  const hpBefore = game.players[second].hp;
  attackWithHand(game, first);
  assert.equal(game.players[second].hp, hpBefore - 2);
  assert.equal(game.players[second].bleed, false);
});

test('방어가 피해를 다 막으면 출혈이 유지된다', () => {
  const { game, first, second } = startedGame();
  setHand(game, first, ['test_bl_bleed']);
  playAll(game, first);
  toAttackPhase(game, first);
  setHand(game, first, ['pistol', 'pistol']);
  game.players[second].defense = 5;
  const hpBefore = game.players[second].hp;
  attackWithHand(game, first);
  assert.equal(game.players[second].hp, hpBefore);
  assert.equal(game.players[second].bleed, true);
  assert.equal(game.turnState.bleedTriggered, 0);
});

test('afterAttack: 피해를 주면 그 뒤 상대에게 출혈을 건다', () => {
  const { game, first, second } = startedGame();
  toAttackPhase(game, first);
  setHand(game, first, ['test_bl_claw']);
  const hpBefore = game.players[second].hp;
  attackWithHand(game, first);
  assert.equal(game.players[second].hp, hpBefore - 2);
  assert.equal(game.players[second].bleed, true);

  // 피해가 0 이면 출혈이 걸리지 않는다.
  const { game: game2, first: first2, second: second2 } = startedGame();
  toAttackPhase(game2, first2);
  setHand(game2, first2, ['test_bl_claw']);
  game2.players[second2].defense = 5;
  const hpBefore2 = game2.players[second2].hp;
  attackWithHand(game2, first2);
  assert.equal(game2.players[second2].hp, hpBefore2);
  assert.equal(game2.players[second2].bleed, false);
});

test('oppBleed 조건: 출혈이 있으면 참', () => {
  const { game, first } = startedGame();
  setHand(game, first, ['test_bl_bleed', 'test_bl_ifBleed']);
  playAll(game, first);
  assert.equal(game.players[first].coins, 3);

  const { game: game2, first: first2 } = startedGame();
  setHand(game2, first2, ['test_bl_ifBleed']);
  playAll(game2, first2);
  assert.equal(game2.players[first2].coins, 0);
});

test('행동카드가 만든 공격 보너스도 행동카드 피해로 친다', () => {
  const { game, first, second } = startedGame();
  setHand(game, first, ['test_bl_bleed']);
  playAll(game, first);
  toAttackPhase(game, first);
  setHand(game, first, ['test_bl_bonus']);
  const hpBefore = game.players[second].hp;
  attackWithHand(game, first);
  assert.equal(game.players[second].hp, hpBefore - 4);
  assert.equal(game.players[second].bleed, false);
  assert.equal(game.turnState.bleedTriggered, 2);
});

test('출혈 상태도 JSON 왕복이 같다', () => {
  const { game, first } = startedGame();
  setHand(game, first, ['test_bl_bleed']);
  playAll(game, first);
  toAttackPhase(game, first);
  setHand(game, first, ['test_bl_claw']);
  attackWithHand(game, first);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(game)), game);
});
