import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createGame,
  createCardInstance,
  getPurchasePrice,
  addMarketPile,
  startGame,
  applyAction,
  getCardDef,
  NEUTRAL_CARD_IDS,
} from '../engine/index.js';

/**
 * 시작된 게임과 선공/후공 인덱스.
 * @param {number} [seed]
 */
function startedGame(seed = 12345) {
  const game = createGame({
    seed,
    players: [
      { id: 'p0', name: '플레이어0', maxHp: 20 },
      { id: 'p1', name: '플레이어1', maxHp: 20 },
    ],
  });
  for (const cardId of NEUTRAL_CARD_IDS) addMarketPile(game, cardId);
  startGame(game);
  const first = game.activeIndex;
  return { game, first, second: 1 - first };
}

/** 손패를 지정한 카드 id 목록으로 교체한다(기존 손패는 drawPile 로). */
function setHand(game, playerIndex, cardIds) {
  const player = game.players[playerIndex];
  player.drawPile.push(...player.hand);
  player.hand = cardIds.map((id) => createCardInstance(game, id));
  return player.hand;
}

/** 손패에 카드를 추가한다. */
function addToHand(game, playerIndex, cardId) {
  const card = createCardInstance(game, cardId);
  game.players[playerIndex].hand.push(card);
  return card;
}

/** 현재 단계가 어디든 차례가 상대에게 넘어갈 때까지 endPhase 한다. */
function passTurn(game, p) {
  while (game.activeIndex === p && game.phase !== 'gameOver') {
    applyAction(game, p, { type: 'endPhase' });
  }
}

/**
 * 선택 대기가 있으면 options 앞에서부터 min 개를 골라 끝까지 진행한다.
 * @param {import('../engine/state.js').GameState} game
 * @param {number} playerIndex
 */
function autoResolve(game, playerIndex) {
  let guard = 0;
  while (game.pending) {
    if (guard++ > 50) throw new Error('선택이 끝나지 않습니다');
    const pending = game.pending;
    const selection = pending.options.slice(0, pending.min);
    applyAction(game, pending.playerIndex, { type: 'choose', selection });
  }
  assert.equal(game.pending, null);
  assert.ok(playerIndex === game.activeIndex || game.phase === 'gameOver');
}

test('중립 카드 19장: 정의·문구·강화판이 모두 있다', () => {
  assert.equal(NEUTRAL_CARD_IDS.length, 19);
  assert.equal(new Set(NEUTRAL_CARD_IDS).size, 19);
  for (const id of NEUTRAL_CARD_IDS) {
    assert.ok(id.startsWith('n_'), id);
    const def = getCardDef(id);
    assert.equal(def.id, id);
    assert.equal(typeof def.text, 'string');
    assert.equal(typeof def.upgradedText, 'string');
    assert.notEqual(def.basic, true, id);
    assert.ok(Array.isArray(def.upgradedEffects), id);
    assert.ok(Array.isArray(def.effects), id);
    if (def.type === 'action') assert.equal(typeof def.actionCost, 'number', id);
    else assert.equal(def.actionCost, undefined, id);
  }
});

test('중립 카드 스모크: 기본판·강화판을 알맞은 단계에 내도 Error 가 없다', () => {
  for (const id of NEUTRAL_CARD_IDS) {
    const def = getCardDef(id);
    for (const upgraded of [false, true]) {
      const { game, first } = startedGame();
      const player = game.players[first];
      // 행동력이 모자라지 않도록 넉넉히 준다.
      player.actions = 5;
      if (def.type === 'money') applyAction(game, first, { type: 'endPhase' });
      if (def.type === 'weapon') {
        applyAction(game, first, { type: 'endPhase' });
        applyAction(game, first, { type: 'endPhase' });
      }
      const [card] = setHand(game, first, [id]);
      card.upgraded = upgraded;
      applyAction(game, first, { type: 'playCard', uid: card.uid });
      autoResolve(game, first);
      // 차례를 끝까지 진행해도 Error 가 없어야 한다.
      passTurn(game, first);
    }
  }
});

test('discardFromHand: 버리면 +1 카드, 안 버리면 뽑지 않는다', () => {
  const { game, first } = startedGame();
  const player = game.players[first];
  player.actions = 3;
  const [card] = setHand(game, first, ['n_blackMarket', 'stone', 'stone']);
  applyAction(game, first, { type: 'playCard', uid: card.uid });
  assert.equal(player.coins, 2);
  assert.equal(game.pending.kind, 'discardFromHand');
  const handBefore = player.hand.length;
  const target = player.hand[0].uid;
  applyAction(game, first, { type: 'choose', selection: [target] });
  assert.equal(player.discard[0].uid, target);
  // 버린 1장 + 뽑은 1장
  assert.equal(player.hand.length, handBefore - 1 + 1);

  const { game: g2, first: f2 } = startedGame();
  const p2 = g2.players[f2];
  p2.actions = 3;
  const [card2] = setHand(g2, f2, ['n_blackMarket', 'stone', 'stone']);
  applyAction(g2, f2, { type: 'playCard', uid: card2.uid });
  const handBefore2 = p2.hand.length;
  applyAction(g2, f2, { type: 'choose', selection: [] });
  assert.equal(p2.hand.length, handBefore2);
  assert.equal(p2.discard.length, 0);
});

test('discardFromHand: thenIfAny 뒤의 남은 효과도 실행된다', () => {
  const { game, first } = startedGame();
  const player = game.players[first];
  player.actions = 3;
  const [card] = setHand(game, first, ['n_blackMarket', 'stone', 'stone']);
  applyAction(game, first, { type: 'playCard', uid: card.uid });
  const target = player.hand[0].uid;
  applyAction(game, first, { type: 'choose', selection: [target] });
  // 암시장은 +2원 뒤 버리기 → 뽑기 순서이고, 그 뒤 남은 효과는 없다.
  assert.equal(player.coins, 2);
  assert.equal(game.pending, null);
});

test('reorderTop: 고른 순서대로 다음에 뽑힌다', () => {
  const { game, first } = startedGame();
  const player = game.players[first];
  const [card] = setHand(game, first, ['n_informant']);
  player.drawPile = [];
  const a = createCardInstance(game, 'stone');
  const b = createCardInstance(game, 'stone');
  const c = createCardInstance(game, 'stone');
  // 배열 끝이 맨 위 → [A, B, C] 에서 C 가 맨 위
  player.drawPile.push(a, b, c);
  applyAction(game, first, { type: 'playCard', uid: card.uid });
  assert.equal(game.pending.kind, 'reorderTop');
  assert.deepEqual(game.pending.options, [a.uid, b.uid, c.uid]);
  assert.equal(game.pending.min, 3);
  assert.equal(game.pending.max, 3);
  applyAction(game, first, { type: 'choose', selection: [a.uid, c.uid, b.uid] });
  assert.equal(game.pending, null);
  const drawn = [];
  for (let i = 0; i < 3; i++) drawn.push(player.drawPile.pop().uid);
  assert.deepEqual(drawn, [a.uid, c.uid, b.uid]);
});

test('reorderTop: trashUpTo 1 이면 1장 제거 후 남은 2장만 순서 선택', () => {
  const { game, first } = startedGame();
  const player = game.players[first];
  const [card] = setHand(game, first, ['n_informant']);
  card.upgraded = true;
  player.drawPile = [];
  const a = createCardInstance(game, 'stone');
  const b = createCardInstance(game, 'stone');
  const c = createCardInstance(game, 'stone');
  player.drawPile.push(a, b, c);
  applyAction(game, first, { type: 'playCard', uid: card.uid });
  assert.equal(game.pending.kind, 'reorderTopTrash');
  assert.equal(game.pending.max, 1);
  applyAction(game, first, { type: 'choose', selection: [b.uid] });
  assert.equal(game.trash[0].uid, b.uid);
  assert.equal(game.pending.kind, 'reorderTop');
  assert.deepEqual(game.pending.options, [a.uid, c.uid]);
  applyAction(game, first, { type: 'choose', selection: [c.uid, a.uid] });
  assert.equal(player.drawPile.pop().uid, c.uid);
  assert.equal(player.drawPile.pop().uid, a.uid);
});

test('reorderTop: drawPile 이 1장이면 순서 선택 없이 끝난다', () => {
  const { game, first } = startedGame();
  const player = game.players[first];
  const [card] = setHand(game, first, ['n_informant']);
  player.drawPile = [];
  const only = createCardInstance(game, 'stone');
  player.drawPile.push(only);
  applyAction(game, first, { type: 'playCard', uid: card.uid });
  assert.equal(game.pending, null);
  assert.equal(player.drawPile[player.drawPile.length - 1].uid, only.uid);
});

test('수류탄: 3 피해 후 차례 끝에 제거된다', () => {
  const { game, first, second } = startedGame();
  applyAction(game, first, { type: 'endPhase' });
  applyAction(game, first, { type: 'endPhase' });
  const [grenade] = setHand(game, first, ['n_grenade']);
  applyAction(game, first, { type: 'playCard', uid: grenade.uid });
  applyAction(game, first, { type: 'endPhase' });
  assert.equal(game.players[second].hp, 20 - 3);
  assert.ok(game.trash.some((c) => c.uid === grenade.uid));
  assert.equal(game.players[first].discard.some((c) => c.uid === grenade.uid), false);
});

test('산탄총: 상대 체력이 절반 이하일 때만 +2', () => {
  const { game, first, second } = startedGame();
  applyAction(game, first, { type: 'endPhase' });
  applyAction(game, first, { type: 'endPhase' });
  const [shotgun] = setHand(game, first, ['n_shotgun']);
  applyAction(game, first, { type: 'playCard', uid: shotgun.uid });
  applyAction(game, first, { type: 'endPhase' });
  assert.equal(game.players[second].hp, 20 - 3);

  const { game: g2, first: f2, second: s2 } = startedGame();
  g2.players[s2].hp = 10;
  applyAction(g2, f2, { type: 'endPhase' });
  applyAction(g2, f2, { type: 'endPhase' });
  const [shotgun2] = setHand(g2, f2, ['n_shotgun']);
  applyAction(g2, f2, { type: 'playCard', uid: shotgun2.uid });
  applyAction(g2, f2, { type: 'endPhase' });
  assert.equal(g2.players[s2].hp, 10 - 5);
});

test('저격소총: 혼자면 7, 권총과 같이 내면 5', () => {
  const { game, first, second } = startedGame();
  applyAction(game, first, { type: 'endPhase' });
  applyAction(game, first, { type: 'endPhase' });
  const [sniper] = setHand(game, first, ['n_sniper']);
  applyAction(game, first, { type: 'playCard', uid: sniper.uid });
  applyAction(game, first, { type: 'endPhase' });
  assert.equal(game.players[second].hp, 20 - 7);

  const { game: g2, first: f2, second: s2 } = startedGame();
  applyAction(g2, f2, { type: 'endPhase' });
  applyAction(g2, f2, { type: 'endPhase' });
  const [sniper2, pistol] = setHand(g2, f2, ['n_sniper', 'pistol']);
  applyAction(g2, f2, { type: 'playCard', uid: sniper2.uid });
  applyAction(g2, f2, { type: 'playCard', uid: pistol.uid });
  applyAction(g2, f2, { type: 'endPhase' });
  assert.equal(g2.players[s2].hp, 20 - 5);
});

test('방탄 조끼: 상대의 다음 공격 피해가 3 줄어든다', () => {
  const { game, first, second } = startedGame();
  const [vest] = setHand(game, first, ['n_vest']);
  applyAction(game, first, { type: 'playCard', uid: vest.uid });
  assert.equal(game.players[first].defense, 3);
  passTurn(game, first);
  assert.equal(game.activeIndex, second);
  applyAction(game, second, { type: 'endPhase' });
  applyAction(game, second, { type: 'endPhase' });
  setHand(game, second, ['pistol', 'pistol', 'pistol', 'pistol']);
  for (const card of [...game.players[second].hand]) {
    applyAction(game, second, { type: 'playCard', uid: card.uid });
  }
  applyAction(game, second, { type: 'endPhase' });
  assert.equal(game.players[first].hp, 20 - 1);
});

test('비상금: 별을 안 썼으면 +3, 쓴 뒤에는 +2', () => {
  const { game, first } = startedGame();
  const player = game.players[first];
  setHand(game, first, ['n_rainyDay', 'stone']);
  applyAction(game, first, { type: 'endPhase' });
  const [rainy] = player.hand;
  applyAction(game, first, { type: 'playCard', uid: rainy.uid });
  assert.equal(player.coins, 3);

  const { game: g2, first: f2 } = startedGame();
  const p2 = g2.players[f2];
  setHand(g2, f2, ['n_rainyDay', 'stone']);
  // 이번 차례 별을 쓴 상태를 만든다(기본 카드는 강화할 수 없으므로 직접 기록).
  g2.turnState.starsSpent = 1;
  applyAction(g2, f2, { type: 'endPhase' });
  const [rainy2] = p2.hand.filter((c) => c.cardId === 'n_rainyDay');
  applyAction(g2, f2, { type: 'playCard', uid: rainy2.uid });
  assert.equal(p2.coins, 2);
});

test('시세 교란: 소총 구매가 6 → 5', () => {
  const { game, first } = startedGame();
  const player = game.players[first];
  assert.equal(getPurchasePrice(game, 'rifle', first), 6);
  const [rig] = setHand(game, first, ['n_priceRig']);
  applyAction(game, first, { type: 'playCard', uid: rig.uid });
  assert.equal(getPurchasePrice(game, 'rifle', first), 5);
  assert.equal(player.coins, 0);
});
