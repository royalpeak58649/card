import test from 'node:test';
import assert from 'node:assert/strict';

import { createGame, createCardInstance } from '../engine/state.js';
import { registerCards } from '../engine/cards/registry.js';
import { registerFactions, registerCharacters } from '../engine/characters.js';
import { startGame, applyAction } from '../engine/turn.js';
import { maxStarsOf } from '../engine/effects.js';

registerFactions({
  test_ea_faction: {
    id: 'test_ea_faction',
    name: '테스트 A',
    cardIds: [],
    characterIds: ['test_ea_astra', 'test_ea_doyun'],
  },
});

registerCharacters({
  test_ea_astra: {
    id: 'test_ea_astra',
    name: '아스트라',
    factionId: 'test_ea_faction',
    maxHp: 30,
    cardIds: [],
    ability: {
      maxStars: 7,
      startTriggers: [
        { cond: { stat: 'stars', gte: 5 }, effects: [{ op: 'gainCoins', n: 1 }] },
      ],
    },
    abilityText: '',
  },
  test_ea_doyun: {
    id: 'test_ea_doyun',
    name: '도윤',
    factionId: 'test_ea_faction',
    maxHp: 30,
    cardIds: [],
    ability: {
      endTriggers: [{ effects: [{ op: 'addDefense', n: 2 }] }],
    },
    abilityText: '',
  },
});

registerCards({
  test_ea_star3: {
    id: 'test_ea_star3',
    name: '테스트 별 3',
    type: 'action',
    actionCost: 0,
    cost: 1,
    effects: [{ op: 'gainStars', n: 3 }],
  },
  test_ea_shield: {
    id: 'test_ea_shield',
    name: '별자리 방패',
    type: 'action',
    actionCost: 0,
    cost: 1,
    effects: [{ op: 'addDefense', perStat: { stat: 'stars', per: 1 }, max: 5 }],
  },
  test_ea_weight: {
    id: 'test_ea_weight',
    name: '별의 무게',
    type: 'weapon',
    cost: 1,
    effects: [{ op: 'damagePerStat', stat: 'stars', per: 1, max: 6, plus: 0 }],
  },
  test_ea_trench: {
    id: 'test_ea_trench',
    name: '참호',
    type: 'action',
    actionCost: 0,
    cost: 1,
    effects: [{ op: 'addDefense', n: 3 }],
  },
  test_ea_supp: {
    id: 'test_ea_supp',
    name: '지원 사격',
    type: 'weapon',
    cost: 1,
    effects: [
      { op: 'damage', n: 2 },
      { op: 'if', cond: { stat: 'defenseGained', gte: 1 }, then: [{ op: 'damage', n: 2 }] },
    ],
  },
  test_ea_same: {
    id: 'test_ea_same',
    name: '같은 행동',
    type: 'action',
    actionCost: 0,
    cost: 1,
    effects: [
      { op: 'if', cond: { stat: 'maxSameAction', gte: 2 }, then: [{ op: 'gainCoins', n: 3 }] },
    ],
  },
});

const PLAYERS = [
  { id: 'p0', name: '플레이어0', maxHp: 20 },
  { id: 'p1', name: '플레이어1', maxHp: 20 },
];

/** 시작된 게임과 선공/후공 인덱스 */
function startedGame(seed = 12345, characterIds = [null, null]) {
  const game = createGame({
    seed,
    players: PLAYERS.map((p, i) => ({ ...p, characterId: characterIds[i] })),
  });
  startGame(game);
  const first = game.activeIndex;
  return { game, first, second: 1 - first };
}

/** 선공에게 캐릭터를 붙인 게임(선공 인덱스가 매번 달라도 확실히 지정된다). */
function startedGameWithFirst(characterId, seed = 12345) {
  const game = createGame({ seed, players: PLAYERS.map((p) => ({ ...p })) });
  game.players[game.firstPlayerIndex].characterId = characterId;
  startGame(game);
  const first = game.activeIndex;
  return { game, first, second: 1 - first };
}

/** 후공에게 캐릭터를 붙인 게임. */
function startedGameWithSecond(characterId, seed = 12345) {
  const game = createGame({ seed, players: PLAYERS.map((p) => ({ ...p })) });
  game.players[1 - game.firstPlayerIndex].characterId = characterId;
  startGame(game);
  const first = game.activeIndex;
  return { game, first, second: 1 - first };
}

/** 손패를 지정한 카드 id 목록으로 교체한다(나머지는 drawPile 로). */
function setHand(game, playerIndex, cardIds) {
  const player = game.players[playerIndex];
  player.drawPile.push(...player.hand);
  player.hand = cardIds.map((id) => createCardInstance(game, id));
  // 카드를 내면 손패 배열이 줄어드므로 복사본을 돌려준다.
  return [...player.hand];
}

/** 차례를 끝내고 상대 차례로 넘긴다. */
function passTurn(game, playerIndex) {
  applyAction(game, playerIndex, { type: 'endPhase' });
  applyAction(game, playerIndex, { type: 'endPhase' });
  applyAction(game, playerIndex, { type: 'endPhase' });
}

test('아스트라의 별 최대치는 7, 캐릭터가 없으면 5', () => {
  const { game, first } = startedGameWithFirst('test_ea_astra');
  const player = game.players[first];
  assert.equal(player.characterId, 'test_ea_astra');
  assert.equal(maxStarsOf(game, first), 7);
  assert.equal(maxStarsOf(game, 1 - first), 5);

  const cards = setHand(game, first, ['test_ea_star3', 'test_ea_star3', 'test_ea_star3']);
  for (const card of cards) {
    applyAction(game, first, { type: 'playCard', uid: card.uid });
  }
  // 3 + 3 + 3 = 9 지만 최대 7 에서 멈춘다.
  assert.equal(player.stars, 7);
});

test('아스트라 차례 시작: 별 5 이상이면 coins 1', () => {
  const { game, first, second } = startedGameWithFirst('test_ea_astra');
  const astra = game.players[first];
  astra.stars = 5;
  passTurn(game, first);
  assert.equal(game.activeIndex, second);
  passTurn(game, second);
  assert.equal(game.activeIndex, first);
  // 차례 시작 별 +1(6) 뒤 startTriggers 로 coins 1
  assert.equal(astra.stars, 6);
  assert.equal(astra.coins, 1);

  // 별 4 이하(차례 시작 +1 해도 4)면 coins 0
  const { game: game2, first: first2, second: second2 } = startedGameWithFirst('test_ea_astra');
  const astra2 = game2.players[first2];
  astra2.stars = 3;
  passTurn(game2, first2);
  passTurn(game2, second2);
  assert.equal(game2.activeIndex, first2);
  assert.equal(astra2.stars, 4);
  assert.equal(astra2.coins, 0);
});

test('별자리 방패: 별만큼 방어, 최대 5', () => {
  const { game, first } = startedGame();
  const player = game.players[first];
  player.stars = 4;
  const [shield] = setHand(game, first, ['test_ea_shield']);
  applyAction(game, first, { type: 'playCard', uid: shield.uid });
  assert.equal(player.defense, 4);
  assert.equal(game.turnState.defenseGained, 4);

  const { game: game2, first: first2 } = startedGame();
  const player2 = game2.players[first2];
  player2.stars = 7;
  const [shield2] = setHand(game2, first2, ['test_ea_shield']);
  applyAction(game2, first2, { type: 'playCard', uid: shield2.uid });
  assert.equal(player2.defense, 5);
});

test('별의 무게: 별만큼 피해, 별은 줄지 않는다', () => {
  const { game, first, second } = startedGame();
  const player = game.players[first];
  const opponent = game.players[second];
  player.stars = 3;
  const hpBefore = opponent.hp;
  const [weight] = setHand(game, first, ['test_ea_weight']);
  applyAction(game, first, { type: 'endPhase' }); // buy
  applyAction(game, first, { type: 'endPhase' }); // attack
  applyAction(game, first, { type: 'playCard', uid: weight.uid });
  assert.equal(game.turnState.attackDamage, 3);
  applyAction(game, first, { type: 'endPhase' }); // 공격 해결
  assert.equal(opponent.hp, hpBefore - 3);
  assert.equal(player.stars, 3);
});

test('도윤: 차례가 끝나면 방어 +2', () => {
  const { game, first, second } = startedGameWithSecond('test_ea_doyun');
  const doyun = game.players[second];
  passTurn(game, first);
  assert.equal(game.activeIndex, second);
  assert.equal(doyun.defense, 0);
  passTurn(game, second);
  assert.equal(doyun.defense, 2);

  // 상대(선공)가 권총 3장으로 공격하면 피해 1
  const attacker = game.players[first];
  const hpBefore = doyun.hp;
  const pistols = setHand(game, first, ['pistol', 'pistol', 'pistol']);
  applyAction(game, first, { type: 'endPhase' }); // buy
  applyAction(game, first, { type: 'endPhase' }); // attack
  for (const pistol of pistols) {
    applyAction(game, first, { type: 'playCard', uid: pistol.uid });
  }
  // 권총 1장당 1 피해
  assert.equal(game.turnState.attackDamage, 3);
  assert.equal(doyun.defense, 2);
  applyAction(game, first, { type: 'endPhase' }); // 공격 해결
  assert.equal(doyun.hp, hpBefore - 1);
  assert.equal(doyun.defense, 0);
  assert.equal(attacker.hp, attacker.maxHp);
});

test('defenseGained: 참호를 낸 차례에만 지원 사격이 4 피해', () => {
  const { game, first, second } = startedGame();
  const opponent = game.players[second];
  const hpBefore = opponent.hp;
  const [trench, supp] = setHand(game, first, ['test_ea_trench', 'test_ea_supp']);
  applyAction(game, first, { type: 'playCard', uid: trench.uid });
  applyAction(game, first, { type: 'endPhase' }); // buy
  applyAction(game, first, { type: 'endPhase' }); // attack
  applyAction(game, first, { type: 'playCard', uid: supp.uid });
  assert.equal(game.turnState.attackDamage, 4);
  applyAction(game, first, { type: 'endPhase' }); // 공격 해결
  assert.equal(opponent.hp, hpBefore - 4);

  // 참호를 내지 않은 차례에는 2 피해
  const { game: game2, first: first2, second: second2 } = startedGame();
  const opponent2 = game2.players[second2];
  const hpBefore2 = opponent2.hp;
  const [supp2] = setHand(game2, first2, ['test_ea_supp']);
  applyAction(game2, first2, { type: 'endPhase' }); // buy
  applyAction(game2, first2, { type: 'endPhase' }); // attack
  applyAction(game2, first2, { type: 'playCard', uid: supp2.uid });
  assert.equal(game2.turnState.attackDamage, 2);
  applyAction(game2, first2, { type: 'endPhase' }); // 공격 해결
  assert.equal(opponent2.hp, hpBefore2 - 2);
});

test('maxSameAction: 같은 행동카드를 두 번째로 내면 +3', () => {
  const { game, first } = startedGame();
  const player = game.players[first];
  const [a, b] = setHand(game, first, ['test_ea_same', 'test_ea_same']);
  applyAction(game, first, { type: 'playCard', uid: a.uid });
  assert.equal(player.coins, 0);
  assert.equal(game.turnState.playedActionIds.length, 1);
  assert.equal(game.turnState.playedActionIds[0], 'test_ea_same');
  applyAction(game, first, { type: 'playCard', uid: b.uid });
  assert.equal(player.coins, 3);

  // 다른 카드 2장 뒤 첫 test_ea_same 은 0
  const { game: game2, first: first2 } = startedGame();
  const player2 = game2.players[first2];
  const [trench, star3, same] = setHand(game2, first2, ['test_ea_trench', 'test_ea_star3', 'test_ea_same']);
  applyAction(game2, first2, { type: 'playCard', uid: trench.uid });
  applyAction(game2, first2, { type: 'playCard', uid: star3.uid });
  applyAction(game2, first2, { type: 'playCard', uid: same.uid });
  assert.equal(player2.coins, 0);
});

test('상태는 JSON 왕복해도 같다', () => {
  const { game, first } = startedGameWithFirst('test_ea_astra');
  const [trench, star3] = setHand(game, first, ['test_ea_trench', 'test_ea_star3']);
  applyAction(game, first, { type: 'playCard', uid: trench.uid });
  applyAction(game, first, { type: 'playCard', uid: star3.uid });
  const copy = JSON.parse(JSON.stringify(game));
  assert.deepEqual(copy, game);
  assert.deepEqual(JSON.parse(JSON.stringify(game.turnState)), game.turnState);
});
