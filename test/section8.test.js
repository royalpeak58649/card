import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createGame,
  createCardInstance,
  getPurchasePrice,
  addMarketPile,
  startGame,
  applyAction,
  getFaction,
  getCharacter,
  getCardDef,
} from '../engine/index.js';

/** 시장에 필요한 section8 카드를 추가한다. */
const SECTION8_PILE_IDS = [
  's8_supplyOrder',
  's8_logistics',
  's8_opFunds',
  's8_maintenance',
  's8_serviceSmg',
  's8_emergencyProc',
  's8_budget',
  's8_depot',
  's8_breakthrough',
  's8_loot',
  's8_heavyMg',
];

/**
 * 시작된 게임과 선공/후공 인덱스.
 * @param {{ characterId?: string|null }[]} [characters]
 * @param {number} [seed]
 */
function startedGame(characters = [{}, {}], seed = 12345) {
  // 선공은 seed 로 정해지므로, characters[0] 이 항상 선공 플레이어에게 가도록 순서를 맞춘다.
  const probe = createGame({ seed, players: [{ id: 'a', name: 'a', maxHp: 1 }, { id: 'b', name: 'b', maxHp: 1 }] });
  const ordered = probe.firstPlayerIndex === 0 ? characters : [characters[1], characters[0]];
  const players = ordered.map((c, i) => ({
    id: 'p' + i,
    name: '플레이어' + i,
    maxHp: 20,
    characterId: c.characterId ?? null,
  }));
  const game = createGame({ seed, players });
  for (const cardId of SECTION8_PILE_IDS) addMarketPile(game, cardId);
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

/** 버린 더미를 지정한 카드 id 목록으로 교체한다. */
function setDiscard(game, playerIndex, cardIds) {
  const player = game.players[playerIndex];
  player.discard = cardIds.map((id) => createCardInstance(game, id));
  return player.discard;
}

/** 손패에 카드를 추가한다. */
function addToHand(game, playerIndex, cardId) {
  const card = createCardInstance(game, cardId);
  game.players[playerIndex].hand.push(card);
  return card;
}

/** 현재 단계가 어디든 차례가 상대에게 넘어갈 때까지 endPhase 한다. */
function passTurn(game, playerIndex) {
  while (game.activeIndex === playerIndex && game.phase !== 'gameOver') {
    applyAction(game, playerIndex, { type: 'endPhase' });
  }
}

/**
 * 공격단계로 넘어가 손패의 무기를 모두 낸 뒤 공격을 해결한다.
 * @returns {number} 상대가 실제로 받은 피해
 */
function attackWith(game, playerIndex, cardIds) {
  const opponent = game.players[1 - playerIndex];
  const hpBefore = opponent.hp;
  applyAction(game, playerIndex, { type: 'endPhase' }); // buy
  applyAction(game, playerIndex, { type: 'endPhase' }); // attack
  setHand(game, playerIndex, cardIds);
  for (const card of [...game.players[playerIndex].hand]) {
    applyAction(game, playerIndex, { type: 'playCard', uid: card.uid });
  }
  applyAction(game, playerIndex, { type: 'endPhase' });
  return hpBefore - opponent.hp;
}

test('진영 section8: 카드 5장, 캐릭터 2명, 13장 모두 정의와 문구가 있다', () => {
  const faction = getFaction('section8');
  assert.equal(faction.name, 'Section 8');
  assert.equal(faction.cardIds.length, 5);
  assert.deepEqual(faction.characterIds, ['hayun', 'kangjin']);

  const allIds = [...faction.cardIds];
  for (const characterId of faction.characterIds) {
    const character = getCharacter(characterId);
    assert.equal(character.factionId, 'section8');
    assert.equal(character.cardIds.length, 3);
    assert.equal(typeof character.abilityText, 'string');
    allIds.push(...character.cardIds);
  }
  assert.equal(allIds.length, 11);
  assert.equal(new Set(allIds).size, 11);
  for (const id of allIds) {
    assert.ok(id.startsWith('s8_'), id);
    const def = getCardDef(id);
    assert.equal(def.id, id);
    assert.equal(typeof def.text, 'string');
    assert.equal(typeof def.upgradedText, 'string');
    assert.ok(def.upgradedEffects, id);
  }
});

test('characterId 로 maxHp 가 정해진다', () => {
  const { game } = startedGame([{ characterId: 'hayun' }, { characterId: 'kangjin' }]);
  const hayun = game.players.find((p) => p.characterId === 'hayun');
  const kangjin = game.players.find((p) => p.characterId === 'kangjin');
  assert.equal(hayun.maxHp, 56);
  assert.equal(hayun.hp, 56);
  assert.equal(kangjin.maxHp, 52);
  assert.equal(kangjin.hp, 52);

  // maxHp 를 같이 줘도 캐릭터 값이 우선한다.
  const game2 = createGame({
    seed: 1,
    players: [
      { id: 'a', name: 'a', maxHp: 99, characterId: 'hayun' },
      { id: 'b', name: 'b', maxHp: 30 },
    ],
  });
  assert.equal(game2.players[0].maxHp, 56);
  assert.equal(game2.players[1].maxHp, 30);
  assert.equal(game2.players[1].characterId, null);
});

test('보급 지령: +1 카드, +1원, 행동력 그대로 / 강화판은 행동력 +1', () => {
  const { game, first } = startedGame();
  const player = game.players[first];
  const [card] = setHand(game, first, ['s8_supplyOrder']);
  const handBefore = player.hand.length;
  applyAction(game, first, { type: 'playCard', uid: card.uid });
  assert.equal(player.hand.length, handBefore - 1 + 1);
  assert.equal(player.coins, 1);
  assert.equal(player.actions, 1);

  const { game: g2, first: f2 } = startedGame();
  const p2 = g2.players[f2];
  const [up] = setHand(g2, f2, ['s8_supplyOrder']);
  up.upgraded = true;
  applyAction(g2, f2, { type: 'playCard', uid: up.uid });
  assert.equal(p2.actions, 2);
  assert.equal(p2.coins, 1);
});

test('군수 전환: 은괴를 제거하고 소총을 손으로 / 강화판은 버리기와 한도 +4', () => {
  const { game, first } = startedGame();
  const player = game.players[first];
  const [card] = setHand(game, first, ['s8_logistics']);
  const silver = addToHand(game, first, 'silver');
  applyAction(game, first, { type: 'playCard', uid: card.uid });
  assert.deepEqual(game.pending.options, [silver.uid]);
  applyAction(game, first, { type: 'choose', selection: [silver.uid] });
  assert.equal(game.trash[0].uid, silver.uid);
  assert.ok(game.pending.options.includes('rifle'));
  assert.equal(game.pending.options.includes('assaultRifle'), false);
  applyAction(game, first, { type: 'choose', selection: ['rifle'] });
  assert.equal(player.hand[player.hand.length - 1].cardId, 'rifle');

  const { game: g2, first: f2 } = startedGame();
  const p2 = g2.players[f2];
  const [up] = setHand(g2, f2, ['s8_logistics']);
  up.upgraded = true;
  const silver2 = addToHand(g2, f2, 'silver');
  applyAction(g2, f2, { type: 'playCard', uid: up.uid });
  applyAction(g2, f2, { type: 'choose', selection: [silver2.uid] });
  assert.deepEqual(g2.pending.options, ['trash', 'discard']);
  applyAction(g2, f2, { type: 'choose', selection: ['discard'] });
  assert.equal(p2.discard[0].uid, silver2.uid);
  assert.equal(g2.trash.length, 0);
  // 은괴(3) + 4 = 7 한도
  assert.ok(g2.pending.options.includes('s8_heavyMg'));
  assert.equal(g2.pending.options.includes('assaultRifle'), false);
  applyAction(g2, f2, { type: 'choose', selection: ['s8_heavyMg'] });
  assert.equal(p2.hand[p2.hand.length - 1].cardId, 's8_heavyMg');
});

test('작전 자금: +2원, 무기 구매 시 +1 환급', () => {
  const { game, first } = startedGame();
  const player = game.players[first];
  setHand(game, first, ['s8_opFunds', 'stone', 'stone', 'stone', 'stone']);
  applyAction(game, first, { type: 'endPhase' }); // buy
  const [money] = player.hand;
  applyAction(game, first, { type: 'playCard', uid: money.uid });
  assert.equal(player.coins, 2);
  applyAction(game, first, { type: 'playAllMoney' });
  assert.equal(player.coins, 6);
  applyAction(game, first, { type: 'buy', cardId: 'rifle' });
  // 소총 6원 + 환급 1원
  assert.equal(player.coins, 1);
});

test('정비 교대: 버린 더미의 권총이 drawPile 맨 위 / 강화판은 손으로', () => {
  const { game, first } = startedGame();
  const player = game.players[first];
  const [card] = setHand(game, first, ['s8_maintenance']);
  const [pistol, stone] = setDiscard(game, first, ['pistol', 'stone']);
  applyAction(game, first, { type: 'playCard', uid: card.uid });
  assert.deepEqual(game.pending.options, [pistol.uid]);
  applyAction(game, first, { type: 'choose', selection: [pistol.uid] });
  assert.equal(player.drawPile[player.drawPile.length - 1].uid, pistol.uid);
  assert.equal(player.discard[0].uid, stone.uid);

  const { game: g2, first: f2 } = startedGame();
  const p2 = g2.players[f2];
  const [up] = setHand(g2, f2, ['s8_maintenance']);
  up.upgraded = true;
  const [pistol2] = setDiscard(g2, f2, ['pistol']);
  applyAction(g2, f2, { type: 'playCard', uid: up.uid });
  applyAction(g2, f2, { type: 'choose', selection: [pistol2.uid] });
  assert.equal(p2.hand[p2.hand.length - 1].uid, pistol2.uid);
});

test('제식 기관단총: 재화 3장이면 4 피해, 아니면 2 / 강화판 5, 3', () => {
  const { game, first, second } = startedGame();
  setHand(game, first, ['stone', 'stone', 'stone']);
  applyAction(game, first, { type: 'endPhase' }); // buy
  applyAction(game, first, { type: 'playAllMoney' });
  applyAction(game, first, { type: 'endPhase' }); // attack
  const [smg] = setHand(game, first, ['s8_serviceSmg']);
  applyAction(game, first, { type: 'playCard', uid: smg.uid });
  applyAction(game, first, { type: 'endPhase' });
  assert.equal(game.players[second].hp, 20 - 4);

  const { game: g2, first: f2, second: s2 } = startedGame();
  setHand(g2, f2, ['stone', 'stone']);
  applyAction(g2, f2, { type: 'endPhase' });
  applyAction(g2, f2, { type: 'playAllMoney' });
  applyAction(g2, f2, { type: 'endPhase' });
  const [smg2] = setHand(g2, f2, ['s8_serviceSmg']);
  applyAction(g2, f2, { type: 'playCard', uid: smg2.uid });
  applyAction(g2, f2, { type: 'endPhase' });
  assert.equal(g2.players[s2].hp, 20 - 2);

  const { game: g3, first: f3, second: s3 } = startedGame();
  setHand(g3, f3, ['stone', 'stone', 'stone']);
  applyAction(g3, f3, { type: 'endPhase' });
  applyAction(g3, f3, { type: 'playAllMoney' });
  applyAction(g3, f3, { type: 'endPhase' });
  const [smg3] = setHand(g3, f3, ['s8_serviceSmg']);
  smg3.upgraded = true;
  applyAction(g3, f3, { type: 'playCard', uid: smg3.uid });
  applyAction(g3, f3, { type: 'endPhase' });
  assert.equal(g3.players[s3].hp, 20 - 5);

  const { game: g4, first: f4, second: s4 } = startedGame();
  applyAction(g4, f4, { type: 'endPhase' });
  applyAction(g4, f4, { type: 'endPhase' });
  const [smg4] = setHand(g4, f4, ['s8_serviceSmg']);
  smg4.upgraded = true;
  applyAction(g4, f4, { type: 'playCard', uid: smg4.uid });
  applyAction(g4, f4, { type: 'endPhase' });
  assert.equal(g4.players[s4].hp, 20 - 3);
});

test('하윤 능력: 첫 무기 구매만 -1, 다음 차례에 다시 적용', () => {
  const { game, first, second } = startedGame([{ characterId: 'hayun' }, {}]);
  const player = game.players[first];
  // 할증이 끝난 소총은 5 - 1 = 4 (할증 중이면 5 + 1 - 1 = 5)
  game.market.rifle.bought = 2;
  assert.equal(getPurchasePrice(game, 'rifle', first), 4);
  // 캐릭터가 없는 플레이어는 할인 없음
  assert.equal(getPurchasePrice(game, 'rifle', second), 5);
  game.market.rifle.bought = 0;
  // 할증 중인 소총은 5 + 1 - 1 = 5
  assert.equal(getPurchasePrice(game, 'rifle', first), 5);
  // 캐릭터가 없는 플레이어는 할인 없음
  assert.equal(getPurchasePrice(game, 's8_serviceSmg', second), 5);

  setHand(game, first, ['gold', 'gold', 'gold']);
  applyAction(game, first, { type: 'endPhase' }); // buy
  applyAction(game, first, { type: 'playAllMoney' });
  assert.equal(player.coins, 9);
  applyAction(game, first, { type: 'buy', cardId: 'rifle' });
  // 할증 중 소총 6원 - 할인 1원
  assert.equal(player.coins, 4);
  // 같은 차례 두 번째 무기는 할인 없음(할증 중인 소총은 5 + 1)
  assert.equal(getPurchasePrice(game, 'pistol', first), 0);
  assert.equal(getPurchasePrice(game, 'rifle', first), 6);
  assert.equal(getPurchasePrice(game, 's8_serviceSmg', first), 5);

  passTurn(game, first);
  passTurn(game, second);
  assert.equal(game.activeIndex, first);
  assert.equal(getPurchasePrice(game, 's8_serviceSmg', first), 4);
});

test('긴급 조달: 구매가 5 이하 무기를 덱 맨 위로 / 강화판은 8 이하', () => {
  const { game, first } = startedGame([{ characterId: 'hayun' }, {}]);
  const player = game.players[first];
  const [card] = setHand(game, first, ['s8_emergencyProc']);
  applyAction(game, first, { type: 'playCard', uid: card.uid });
  assert.ok(game.pending.options.includes('rifle'));
  assert.equal(game.pending.options.includes('assaultRifle'), false);
  applyAction(game, first, { type: 'choose', selection: ['rifle'] });
  assert.equal(player.drawPile[player.drawPile.length - 1].cardId, 'rifle');

  const { game: g2, first: f2 } = startedGame([{ characterId: 'hayun' }, {}]);
  const p2 = g2.players[f2];
  const [up] = setHand(g2, f2, ['s8_emergencyProc']);
  up.upgraded = true;
  applyAction(g2, f2, { type: 'playCard', uid: up.uid });
  assert.ok(g2.pending.options.includes('assaultRifle'));
  applyAction(g2, f2, { type: 'choose', selection: ['assaultRifle'] });
  assert.equal(p2.drawPile[p2.drawPile.length - 1].cardId, 'assaultRifle');
});

test('예산 집행: 손에 무기가 없으면 +1 카드 / 강화판은 항상 +1 카드, +3원', () => {
  const { game, first } = startedGame([{ characterId: 'hayun' }, {}]);
  const player = game.players[first];
  setHand(game, first, ['s8_budget', 'stone', 'stone']);
  applyAction(game, first, { type: 'endPhase' }); // buy
  const [budget] = player.hand;
  const handBefore = player.hand.length;
  applyAction(game, first, { type: 'playCard', uid: budget.uid });
  assert.equal(player.coins, 2);
  assert.equal(player.hand.length, handBefore - 1 + 1);

  const { game: g2, first: f2 } = startedGame([{ characterId: 'hayun' }, {}]);
  const p2 = g2.players[f2];
  setHand(g2, f2, ['s8_budget', 'pistol']);
  applyAction(g2, f2, { type: 'endPhase' });
  const [budget2] = p2.hand;
  const handBefore2 = p2.hand.length;
  applyAction(g2, f2, { type: 'playCard', uid: budget2.uid });
  assert.equal(p2.coins, 2);
  assert.equal(p2.hand.length, handBefore2 - 1);

  const { game: g3, first: f3 } = startedGame([{ characterId: 'hayun' }, {}]);
  const p3 = g3.players[f3];
  setHand(g3, f3, ['s8_budget', 'pistol']);
  applyAction(g3, f3, { type: 'endPhase' });
  const [budget3] = p3.hand;
  budget3.upgraded = true;
  const handBefore3 = p3.hand.length;
  applyAction(g3, f3, { type: 'playCard', uid: budget3.uid });
  assert.equal(p3.coins, 3);
  assert.equal(p3.hand.length, handBefore3 - 1 + 1);
});

test('보급 창고: +1 구매, 무기 2장 산 차례 끝에 별 +1', () => {
  const { game, first } = startedGame([{ characterId: 'hayun' }, {}]);
  const player = game.players[first];
  setHand(game, first, ['s8_depot', 'gold', 'gold', 'gold']);
  const [depot] = player.hand;
  applyAction(game, first, { type: 'playCard', uid: depot.uid });
  assert.equal(player.buys, 2);
  applyAction(game, first, { type: 'endPhase' }); // buy
  applyAction(game, first, { type: 'playAllMoney' });
  applyAction(game, first, { type: 'buy', cardId: 'pistol' });
  applyAction(game, first, { type: 'buy', cardId: 'pistol' });
  applyAction(game, first, { type: 'endPhase' }); // attack
  applyAction(game, first, { type: 'endPhase' }); // 차례 종료
  assert.equal(player.stars, 1);

  const { game: g2, first: f2 } = startedGame([{ characterId: 'hayun' }, {}]);
  const p2 = g2.players[f2];
  setHand(g2, f2, ['s8_depot', 'gold', 'gold', 'gold']);
  const [depot2] = p2.hand;
  applyAction(g2, f2, { type: 'playCard', uid: depot2.uid });
  applyAction(g2, f2, { type: 'endPhase' });
  applyAction(g2, f2, { type: 'playAllMoney' });
  applyAction(g2, f2, { type: 'buy', cardId: 'pistol' });
  applyAction(g2, f2, { type: 'endPhase' });
  applyAction(g2, f2, { type: 'endPhase' });
  assert.equal(p2.stars, 0);
});

test('강진 능력: 무기 3장이면 +2 피해, 2장이면 없음', () => {
  const { game, first } = startedGame([{ characterId: 'kangjin' }, {}]);
  assert.equal(attackWith(game, first, ['pistol', 'pistol', 'pistol']), 5);

  const { game: g2, first: f2 } = startedGame([{ characterId: 'kangjin' }, {}]);
  assert.equal(attackWith(g2, f2, ['pistol', 'pistol']), 2);
});

test('돌파 명령: 권총 4장이면 4+3(+강진이면 +2), 강화판은 상한 없음', () => {
  const { game, first, second } = startedGame();
  const hpBefore = game.players[second].hp;
  setHand(game, first, ['s8_breakthrough']);
  const [card] = game.players[first].hand;
  applyAction(game, first, { type: 'playCard', uid: card.uid });
  applyAction(game, first, { type: 'endPhase' }); // buy
  applyAction(game, first, { type: 'endPhase' }); // attack
  setHand(game, first, ['pistol', 'pistol', 'pistol', 'pistol']);
  for (const pistol of [...game.players[first].hand]) {
    applyAction(game, first, { type: 'playCard', uid: pistol.uid });
  }
  applyAction(game, first, { type: 'endPhase' });
  assert.equal(hpBefore - game.players[second].hp, 7);

  const { game: g2, first: f2, second: s2 } = startedGame([{ characterId: 'kangjin' }, {}]);
  const hpBefore2 = g2.players[s2].hp;
  setHand(g2, f2, ['s8_breakthrough']);
  const [card2] = g2.players[f2].hand;
  applyAction(g2, f2, { type: 'playCard', uid: card2.uid });
  applyAction(g2, f2, { type: 'endPhase' });
  applyAction(g2, f2, { type: 'endPhase' });
  setHand(g2, f2, ['pistol', 'pistol', 'pistol', 'pistol']);
  for (const pistol of [...g2.players[f2].hand]) {
    applyAction(g2, f2, { type: 'playCard', uid: pistol.uid });
  }
  applyAction(g2, f2, { type: 'endPhase' });
  assert.equal(hpBefore2 - g2.players[s2].hp, 9);

  const { game: g3, first: f3, second: s3 } = startedGame();
  const hpBefore3 = g3.players[s3].hp;
  setHand(g3, f3, ['s8_breakthrough']);
  const [card3] = g3.players[f3].hand;
  card3.upgraded = true;
  applyAction(g3, f3, { type: 'playCard', uid: card3.uid });
  applyAction(g3, f3, { type: 'endPhase' });
  applyAction(g3, f3, { type: 'endPhase' });
  setHand(g3, f3, ['pistol', 'pistol', 'pistol', 'pistol', 'pistol']);
  for (const pistol of [...g3.players[f3].hand]) {
    applyAction(g3, f3, { type: 'playCard', uid: pistol.uid });
  }
  applyAction(g3, f3, { type: 'endPhase' });
  assert.equal(hpBefore3 - g3.players[s3].hp, 10);
});

test('전리품 회수: 8 피해 이상이면 차례 끝에 금괴 / 강화판은 5', () => {
  const { game, first } = startedGame([{ characterId: 'kangjin' }, {}]);
  const player = game.players[first];
  setHand(game, first, ['s8_loot']);
  const [loot] = player.hand;
  applyAction(game, first, { type: 'playCard', uid: loot.uid });
  attackWith(game, first, ['pistol', 'pistol', 'pistol', 'pistol', 'pistol', 'pistol']);
  assert.ok(player.discard.some((c) => c.cardId === 'gold'));

  const { game: g2, first: f2 } = startedGame([{ characterId: 'kangjin' }, {}]);
  const p2 = g2.players[f2];
  setHand(g2, f2, ['s8_loot']);
  const [loot2] = p2.hand;
  applyAction(g2, f2, { type: 'playCard', uid: loot2.uid });
  attackWith(g2, f2, ['pistol', 'pistol', 'pistol', 'pistol']);
  assert.equal(p2.discard.some((c) => c.cardId === 'gold'), false);

  const { game: g3, first: f3 } = startedGame([{ characterId: 'kangjin' }, {}]);
  const p3 = g3.players[f3];
  setHand(g3, f3, ['s8_loot']);
  const [loot3] = p3.hand;
  loot3.upgraded = true;
  applyAction(g3, f3, { type: 'playCard', uid: loot3.uid });
  attackWith(g3, f3, ['pistol', 'pistol', 'pistol', 'pistol']);
  assert.ok(p3.discard.some((c) => c.cardId === 'gold'));
});

test('중기관총 + 권총 2장: 1 + 3 = 4 피해 / 강화판 5', () => {
  const { game, first } = startedGame();
  // 중기관총(1) + 권총 2장(2) + 무기 1장당 +1(3) = 6
  assert.equal(attackWith(game, first, ['s8_heavyMg', 'pistol', 'pistol']), 6);

  const { game: g2, first: f2 } = startedGame();
  applyAction(g2, f2, { type: 'endPhase' }); // buy
  applyAction(g2, f2, { type: 'endPhase' }); // attack
  const opponent = g2.players[1 - f2];
  const hpBefore = opponent.hp;
  const [mg, p1, p2] = setHand(g2, f2, ['s8_heavyMg', 'pistol', 'pistol']);
  mg.upgraded = true;
  for (const card of [mg, p1, p2]) {
    applyAction(g2, f2, { type: 'playCard', uid: card.uid });
  }
  applyAction(g2, f2, { type: 'endPhase' });
  // 중기관총(2) + 권총 2장(2) + 무기 1장당 +1(3) = 7
  assert.equal(hpBefore - opponent.hp, 7);
});
