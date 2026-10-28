import test from 'node:test';
import assert from 'node:assert/strict';

import { createGame, createCardInstance } from '../engine/state.js';
import { registerCards } from '../engine/cards/registry.js';
import { registerOp } from '../engine/effects.js';
import { startGame, applyAction } from '../engine/turn.js';

registerCards({
  test_star_money: {
    id: 'test_star_money',
    name: '테스트 별 재화',
    type: 'money',
    cost: 3,
    effects: [{ op: 'gainCoins', n: 1 }],
    upgradedEffects: [{ op: 'gainCoins', n: 3 }],
  },
  test_star_noup: {
    id: 'test_star_noup',
    name: '테스트 강화판 없음',
    type: 'action',
    actionCost: 0,
    cost: 1,
    effects: [{ op: 'gainCoins', n: 1 }],
  },
  test_star_bomb: {
    id: 'test_star_bomb',
    name: '테스트 폭탄',
    type: 'action',
    actionCost: 0,
    cost: 1,
    effects: [{ op: 'test_star_boom', n: 1 }],
  },
});

registerOp('test_star_boom', () => {
  throw new Error('테스트 폭발');
});

const PLAYERS = [
  { id: 'p0', name: '플레이어0', maxHp: 20 },
  { id: 'p1', name: '플레이어1', maxHp: 20 },
];

/** 시작된 게임과 선공/후공 인덱스 */
function startedGame(seed = 12345) {
  const game = createGame({ seed, players: PLAYERS.map((p) => ({ ...p })) });
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

/** 선공이 3번 endPhase 해서 후공 차례로 넘긴다. */
function passTurn(game, playerIndex) {
  applyAction(game, playerIndex, { type: 'endPhase' });
  applyAction(game, playerIndex, { type: 'endPhase' });
  applyAction(game, playerIndex, { type: 'endPhase' });
}

test('별 1개로 일시 강화', () => {
  const { game, first } = startedGame();
  const player = game.players[first];
  player.stars = 2;
  const [card] = setHand(game, first, ['test_star_money']);

  applyAction(game, first, { type: 'upgrade', uid: card.uid, mode: 'temp' });

  assert.equal(player.stars, 1);
  assert.equal(card.upgraded, true);
  assert.equal(card.tempUpgraded, true);
  assert.equal(game.turnState.tempUpgrades, 1);
  assert.equal(game.turnState.starsSpent, 1);
  const entry = game.log[game.log.length - 1];
  assert.equal(entry.type, 'upgrade');
  assert.equal(entry.cardId, 'test_star_money');
  assert.equal(entry.mode, 'temp');
});

test('강화한 재화카드는 강화판 효과를 쓴다', () => {
  const { game, first } = startedGame();
  const player = game.players[first];
  player.stars = 1;
  const [card] = setHand(game, first, ['test_star_money']);
  applyAction(game, first, { type: 'upgrade', uid: card.uid, mode: 'temp' });
  applyAction(game, first, { type: 'endPhase' }); // buy
  applyAction(game, first, { type: 'playCard', uid: card.uid });
  assert.equal(player.coins, 3);

  // 강화하지 않은 카드는 +1
  const { game: game2, first: first2 } = startedGame();
  const player2 = game2.players[first2];
  const [plain] = setHand(game2, first2, ['test_star_money']);
  applyAction(game2, first2, { type: 'endPhase' }); // buy
  applyAction(game2, first2, { type: 'playCard', uid: plain.uid });
  assert.equal(player2.coins, 1);
});

test('행동단계·공격단계에서도 강화할 수 있다', () => {
  const { game, first } = startedGame();
  const player = game.players[first];
  player.stars = 5;
  const [a, b] = setHand(game, first, ['test_star_money', 'test_star_money']);

  applyAction(game, first, { type: 'upgrade', uid: a.uid, mode: 'temp' });
  assert.equal(a.upgraded, true);

  applyAction(game, first, { type: 'endPhase' }); // buy
  applyAction(game, first, { type: 'upgrade', uid: b.uid, mode: 'temp' });
  assert.equal(b.upgraded, true);

  applyAction(game, first, { type: 'endPhase' }); // attack
  const [c] = setHand(game, first, ['test_star_money']);
  applyAction(game, first, { type: 'upgrade', uid: c.uid, mode: 'temp' });
  assert.equal(c.upgraded, true);
  assert.equal(game.turnState.tempUpgrades, 3);
});

test('일시 강화 4장째는 Error 이고 상태가 바뀌지 않는다', () => {
  const { game, first } = startedGame();
  const player = game.players[first];
  player.stars = 5;
  const cards = setHand(game, first, [
    'test_star_money',
    'test_star_money',
    'test_star_money',
    'test_star_money',
  ]);
  for (const card of cards.slice(0, 3)) {
    applyAction(game, first, { type: 'upgrade', uid: card.uid, mode: 'temp' });
  }
  assert.equal(game.turnState.tempUpgrades, 3);
  const before = JSON.stringify(game);
  assert.throws(
    () => applyAction(game, first, { type: 'upgrade', uid: cards[3].uid, mode: 'temp' }),
    Error,
  );
  assert.equal(JSON.stringify(game), before);
  assert.equal(player.stars, 2);
  assert.equal(cards[3].upgraded, false);
});

test('일시 강화 3장 뒤에도 영구 강화는 가능하다', () => {
  const { game, first } = startedGame();
  const player = game.players[first];
  player.stars = 5;
  const cards = setHand(game, first, [
    'test_star_money',
    'test_star_money',
    'test_star_money',
    'test_star_money',
  ]);
  for (const card of cards.slice(0, 3)) {
    applyAction(game, first, { type: 'upgrade', uid: card.uid, mode: 'temp' });
  }
  assert.equal(player.stars, 2);
  player.stars = 4;
  applyAction(game, first, { type: 'upgrade', uid: cards[3].uid, mode: 'perm' });
  assert.equal(player.stars, 0);
  assert.equal(cards[3].upgraded, true);
  assert.equal(cards[3].tempUpgraded, undefined);
  assert.equal(game.turnState.tempUpgrades, 3);
  assert.equal(game.turnState.starsSpent, 7);
});

test('별 3개로 영구 강화는 Error', () => {
  const { game, first } = startedGame();
  const player = game.players[first];
  player.stars = 3;
  const [card] = setHand(game, first, ['test_star_money']);
  assert.throws(() => applyAction(game, first, { type: 'upgrade', uid: card.uid, mode: 'perm' }), Error);
  assert.equal(player.stars, 3);
  assert.equal(card.upgraded, false);
});

test('강화할 수 없는 카드는 Error', () => {
  const { game, first } = startedGame();
  const player = game.players[first];
  player.stars = 5;
  const [stone, noup, money] = setHand(game, first, ['stone', 'test_star_noup', 'test_star_money']);

  // 기본 카드
  assert.throws(() => applyAction(game, first, { type: 'upgrade', uid: stone.uid, mode: 'temp' }), Error);
  // upgradedEffects 없음
  assert.throws(() => applyAction(game, first, { type: 'upgrade', uid: noup.uid, mode: 'temp' }), Error);
  // 손에 없는 uid
  assert.throws(() => applyAction(game, first, { type: 'upgrade', uid: '없는uid', mode: 'temp' }), Error);
  // 잘못된 mode
  assert.throws(() => applyAction(game, first, { type: 'upgrade', uid: money.uid, mode: 'x' }), Error);
  // 이미 강화된 카드
  applyAction(game, first, { type: 'upgrade', uid: money.uid, mode: 'temp' });
  assert.throws(() => applyAction(game, first, { type: 'upgrade', uid: money.uid, mode: 'temp' }), Error);
  assert.throws(() => applyAction(game, first, { type: 'upgrade', uid: money.uid, mode: 'perm' }), Error);

  assert.equal(game.players[first].stars, 4);
  assert.equal(game.turnState.tempUpgrades, 1);
  assert.equal(game.players[first].hand.find((c) => c.uid === stone.uid).upgraded, false);
  assert.equal(game.players[first].hand.find((c) => c.uid === noup.uid).upgraded, false);
});

test('차례를 넘기면 일시 강화만 풀린다', () => {
  const { game, first } = startedGame();
  const player = game.players[first];
  player.stars = 5;
  const [temp, perm] = setHand(game, first, ['test_star_money', 'test_star_money']);
  applyAction(game, first, { type: 'upgrade', uid: temp.uid, mode: 'temp' });
  applyAction(game, first, { type: 'upgrade', uid: perm.uid, mode: 'perm' });
  assert.equal(temp.upgraded, true);
  assert.equal(perm.upgraded, true);

  passTurn(game, first);

  const all = [...player.hand, ...player.drawPile, ...player.discard, ...player.inPlay];
  const tempCard = all.find((c) => c.uid === temp.uid);
  const permCard = all.find((c) => c.uid === perm.uid);
  assert.equal(tempCard.upgraded, false);
  assert.equal(Object.prototype.hasOwnProperty.call(tempCard, 'tempUpgraded'), false);
  assert.equal(permCard.upgraded, true);
  assert.equal(Object.prototype.hasOwnProperty.call(permCard, 'tempUpgraded'), false);
});

test('효과 실행 중 오류가 나면 조작 전 상태로 완전히 되돌린다', () => {
  const { game, first } = startedGame();
  const [bomb] = setHand(game, first, ['test_star_bomb']);
  const before = JSON.stringify(game);
  const ref = game;

  assert.throws(() => applyAction(game, first, { type: 'playCard', uid: bomb.uid }), Error);

  assert.equal(JSON.stringify(game), before);
  assert.equal(game, ref);
  const player = game.players[first];
  assert.equal(player.hand.length, 1);
  assert.equal(player.hand[0].uid, bomb.uid);
  assert.equal(player.inPlay.length, 0);
  assert.equal(player.actions, 1);
});

test('로그의 turn 은 조작 전 차례 번호다', () => {
  const { game, first } = startedGame();
  applyAction(game, first, { type: 'endPhase' }); // buy
  applyAction(game, first, { type: 'endPhase' }); // attack
  applyAction(game, first, { type: 'endPhase' }); // 차례 종료
  assert.equal(game.turn, 2);
  const last = game.log[game.log.length - 1];
  assert.equal(last.type, 'endPhase');
  assert.equal(last.turn, 1);
  assert.equal(last.p, first);
});
