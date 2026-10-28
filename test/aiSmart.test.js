import test from 'node:test';
import assert from 'node:assert/strict';

import { createGame, startGame, applyAction, createCardInstance, addMarketPile } from '../engine/index.js';
import { chooseSmartAction, candidates, evaluate } from '../engine/aiSmart.js';
import { setAtomic } from '../engine/turn.js';

/** 선공에게 characterId 를 준 게임. */
function gameWith(characterId = null) {
  const probe = createGame({ seed: 11, players: [{ id: 'a', name: 'A', maxHp: 40 }, { id: 'b', name: 'B', maxHp: 40 }] });
  const order = probe.firstPlayerIndex === 0 ? [characterId, null] : [null, characterId];
  const game = createGame({ seed: 11, players: order.map((c, i) => ({ id: 'p' + i, name: 'P' + i, maxHp: 40, characterId: c })) });
  startGame(game);
  return { game, p: game.activeIndex };
}

function setHand(game, p, ids) {
  const player = game.players[p];
  player.drawPile.push(...player.hand);
  player.hand = ids.map((id) => createCardInstance(game, id));
}

test('candidates: 행동단계에는 차례 넘기기와 낼 수 있는 행동카드(같은 카드는 한 번)', () => {
  const { game, p } = gameWith();
  setHand(game, p, ['n_reinforce', 'n_reinforce', 'stone']);
  const list = candidates(game, p);
  assert.ok(list.some((a) => a.type === 'endPhase'));
  assert.equal(list.filter((a) => a.type === 'playCard').length, 1);
});

test('모의 실행은 실제 게임 상태를 바꾸지 않는다', () => {
  const { game, p } = gameWith();
  setHand(game, p, ['n_reinforce', 'stone', 'pistol']);
  const before = JSON.stringify(game);
  const action = chooseSmartAction(game, p);
  assert.ok(action);
  assert.equal(JSON.stringify(game), before);
});

test('모의 실행 뒤에도 원자성 스위치는 켜진 상태로 돌아온다', () => {
  const { game, p } = gameWith();
  chooseSmartAction(game, p);
  assert.equal(setAtomic(true), true);
});

test('공격단계: 무기가 있으면 내서 피해를 준다', () => {
  const { game, p } = gameWith();
  setHand(game, p, ['assaultRifle']);
  applyAction(game, p, { type: 'endPhase' });
  applyAction(game, p, { type: 'endPhase' });
  const action = chooseSmartAction(game, p);
  assert.equal(action.type, 'playCard');
});

test('도윤은 권총 1장뿐이면 무기를 아끼고 방어 +2 를 받는다', () => {
  const { game, p } = gameWith('doyun');
  setHand(game, p, ['pistol']);
  applyAction(game, p, { type: 'endPhase' });
  applyAction(game, p, { type: 'endPhase' });
  assert.equal(chooseSmartAction(game, p).type, 'endPhase');
});

test('구매: 살 수 있으면 돌(가치 음수) 대신 가치 있는 카드를 산다', () => {
  const { game, p } = gameWith();
  setHand(game, p, ['gold', 'gold']);
  applyAction(game, p, { type: 'endPhase' });
  applyAction(game, p, { type: 'playAllMoney' });
  const action = chooseSmartAction(game, p);
  assert.equal(action.type, 'buy');
  assert.notEqual(action.cardId, 'stone');
});

test('evaluate: 이긴 결과는 아주 큰 점수', () => {
  const { game, p } = gameWith();
  const after = JSON.parse(JSON.stringify(game));
  after.phase = 'gameOver';
  after.winner = p;
  assert.ok(evaluate(game, after, p) > 100);
});

test('시장에 진영 카드가 있어도 끝까지 둘 수 있다(smart 끼리 한 판)', () => {
  const { game } = gameWith('jin');
  for (const id of ['nu_synapse', 'nu_overload', 's8_serviceSmg', 'lg_meteor', 'vc_usury']) addMarketPile(game, id);
  for (let step = 0; step < 6000 && game.phase !== 'gameOver' && game.turn <= 200; step++) {
    const actor = game.pending ? game.pending.playerIndex : game.activeIndex;
    applyAction(game, actor, chooseSmartAction(game, actor));
  }
  assert.ok(game.phase === 'gameOver' || game.turn > 200);
});
