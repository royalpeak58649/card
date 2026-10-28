import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createGame,
  startGame,
  applyAction,
  createCardInstance,
  addMarketPile,
  getFaction,
  getCharacter,
  getCardDef,
} from '../engine/index.js';

const SEED = 4321;

/** 선공에게 firstCharacter 를 준 게임. */
function gameWith(firstCharacter, secondCharacter = null) {
  const probe = createGame({ seed: SEED, players: [{ id: 'a', name: 'A', maxHp: 40 }, { id: 'b', name: 'B', maxHp: 40 }] });
  const order = probe.firstPlayerIndex === 0 ? [firstCharacter, secondCharacter] : [secondCharacter, firstCharacter];
  const game = createGame({
    seed: SEED,
    players: order.map((c, i) => ({ id: 'p' + i, name: 'P' + i, maxHp: 40, characterId: c })),
  });
  startGame(game);
  const first = game.activeIndex;
  return { game, first, second: 1 - first };
}

// 실패한 조작은 상태를 통째로 복원하므로 플레이어는 매번 새로 읽는다.
const me = (game, p) => game.players[p];

function setHand(game, p, ids) {
  const player = me(game, p);
  player.drawPile.push(...player.hand);
  player.hand = ids.map((id) => createCardInstance(game, id));
  return [...player.hand];
}

const play = (game, p, card) => applyAction(game, p, { type: 'playCard', uid: card.uid });

function toPhase(game, p, phase) {
  while (game.phase !== phase) applyAction(game, p, { type: 'endPhase' });
}

function passTurn(game, p) {
  while (game.activeIndex === p && game.phase !== 'gameOver') applyAction(game, p, { type: 'endPhase' });
}

/** 공격단계까지 가서 손패 무기를 다 내고 차례를 끝낸 뒤 상대가 받은 피해. */
function attackDamage(game, p) {
  const before = me(game, 1 - p).hp;
  toPhase(game, p, 'attack');
  for (const card of [...me(game, p).hand]) {
    if (getCardDef(card.cardId).type === 'weapon') play(game, p, card);
  }
  applyAction(game, p, { type: 'endPhase' });
  return before - me(game, 1 - p).hp;
}

test('빈센트 공화국: 카드 5장, 캐릭터 3명(라임 52·솔 54·아르거스 56), 14장 모두 문구와 강화판', () => {
  const faction = getFaction('vincent');
  assert.equal(faction.name, '빈센트 공화국');
  assert.equal(faction.cardIds.length, 5);
  assert.deepEqual(faction.characterIds, ['lime', 'sol', 'argus']);
  assert.deepEqual(faction.characterIds.map((c) => getCharacter(c).maxHp), [52, 54, 56]);
  const ids = [...faction.cardIds, ...faction.characterIds.flatMap((c) => getCharacter(c).cardIds)];
  assert.equal(new Set(ids).size, 14);
  for (const id of ids) {
    const def = getCardDef(id);
    assert.ok(def.text && def.upgradedText && def.upgradedEffects, id);
  }
});

test('고리대금: +4원 빚 +2, 빚이 있으면 구매 불가 → 갚으면 구매 가능', () => {
  const { game, first } = gameWith(null);
  const [usury] = setHand(game, first, ['vc_usury']);
  toPhase(game, first, 'buy');
  play(game, first, usury);
  assert.equal(me(game, first).coins, 4);
  assert.equal(me(game, first).debt, 2);
  assert.throws(() => applyAction(game, first, { type: 'buy', cardId: 'silver' }), /빚/);
  applyAction(game, first, { type: 'payDebt' });
  assert.equal(me(game, first).debt, 0);
  assert.equal(me(game, first).coins, 2);
  applyAction(game, first, { type: 'buy', cardId: 'stone' });
});

test('신용 대출: +2 카드, 빚 +2', () => {
  const { game, first } = gameWith(null);
  const [loan] = setHand(game, first, ['vc_creditLoan']);
  play(game, first, loan);
  assert.equal(me(game, first).hand.length, 2);
  assert.equal(me(game, first).debt, 2);
});

test('채권 발행: 구매가 5 이하 카드를 얻고 빚 +3 (구매 수에는 안 셈)', () => {
  const { game, first } = gameWith(null);
  const [bond] = setHand(game, first, ['vc_bond']);
  play(game, first, bond);
  assert.ok(game.pending.options.includes('rifle'));
  assert.equal(game.pending.options.includes('assaultRifle'), false);
  applyAction(game, first, { type: 'choose', selection: ['rifle'] });
  assert.ok(me(game, first).discard.some((c) => c.cardId === 'rifle'));
  assert.equal(me(game, first).debt, 3);
  assert.equal(game.market.rifle.bought, 0);
});

test('상환 계획: +2원, 빚 1을 없앤다 / 강제 집행: 빚이 없을 때만 +2', () => {
  const { game, first } = gameWith(null);
  me(game, first).debt = 3;
  const [plan] = setHand(game, first, ['vc_repayPlan', 'vc_seizure']);
  toPhase(game, first, 'buy');
  play(game, first, plan);
  assert.equal(me(game, first).debt, 2);
  assert.equal(attackDamage(game, first), 2); // 빚이 남아 있음

  const g2 = gameWith(null);
  setHand(g2.game, g2.first, ['vc_seizure']);
  assert.equal(attackDamage(g2.game, g2.first), 4);
});

test('라임: 선지급(+2 카드 +1 행동력 빚 +2) 후 빚이 남으면 차례 끝 6장', () => {
  const { game, first } = gameWith('lime');
  const [adv] = setHand(game, first, ['vc_advance']);
  play(game, first, adv);
  assert.equal(me(game, first).actions, 2);
  assert.equal(me(game, first).debt, 2);
  passTurn(game, first);
  assert.equal(me(game, first).hand.length, 6);
});

test('레버리지: 빚이 있으면 +4원, 없으면 +2원 / 미래 자원: 손으로 얻고 빚 +3', () => {
  const { game, first } = gameWith('lime');
  me(game, first).debt = 1;
  const [lev] = setHand(game, first, ['vc_leverage']);
  toPhase(game, first, 'buy');
  play(game, first, lev);
  assert.equal(me(game, first).coins, 4);

  const g2 = gameWith('lime');
  const [fut] = setHand(g2.game, g2.first, ['vc_futures']);
  play(g2.game, g2.first, fut);
  assert.ok(g2.game.pending.options.includes('gold'));
  applyAction(g2.game, g2.first, { type: 'choose', selection: ['gold'] });
  assert.ok(me(g2.game, g2.first).hand.some((c) => c.cardId === 'gold'));
  assert.equal(me(g2.game, g2.first).debt, 3);
});

test('솔: 차례 시작 시 빚 -1, 책임 전가로 빚 3을 상대에게, 상대는 구매 불가', () => {
  const { game, first, second } = gameWith('sol');
  me(game, first).debt = 5;
  const [shift] = setHand(game, first, ['vc_blameShift']);
  play(game, first, shift);
  assert.equal(me(game, first).debt, 2);
  assert.equal(me(game, second).debt, 3);
  passTurn(game, first);
  // 상대 차례: 빚 때문에 구매 불가
  toPhase(game, second, 'buy');
  me(game, second).coins = 0;
  assert.throws(() => applyAction(game, second, { type: 'buy', cardId: 'stone' }), /빚/);
  passTurn(game, second);
  // 솔 차례 시작: 빚 2 → 1
  assert.equal(me(game, first).debt, 1);
});

test('파산 신청: 빚을 모두 없애고 사용 후 제거 / 채무 동결: 빚이 있어도 그 차례 구매 가능', () => {
  const { game, first } = gameWith('sol');
  me(game, first).debt = 7;
  const [bk] = setHand(game, first, ['vc_bankruptcy']);
  play(game, first, bk);
  assert.equal(me(game, first).debt, 0);
  passTurn(game, first);
  assert.ok(game.trash.some((c) => c.cardId === 'vc_bankruptcy'));

  const g2 = gameWith('sol');
  me(g2.game, g2.first).debt = 4;
  const [fz] = setHand(g2.game, g2.first, ['vc_freeze']);
  toPhase(g2.game, g2.first, 'buy');
  play(g2.game, g2.first, fz);
  applyAction(g2.game, g2.first, { type: 'buy', cardId: 'stone' });
  assert.equal(me(g2.game, g2.first).debt, 4);
});

test('아르거스: 이자 계산(빚 4 → 1+4), 패시브 빚 2당 +1(최대 3)', () => {
  const { game, first } = gameWith('argus');
  me(game, first).debt = 4;
  setHand(game, first, ['vc_interest']);
  // 무기 1 + 빚 4 + 패시브 floor(4/2)=2
  assert.equal(attackDamage(game, first), 7);
});

test('대차대조표: 빚 1당 +1원(최대 4) / 채무 상환: 빚 최대 3을 갚고 그만큼 피해', () => {
  const { game, first } = gameWith(null);
  me(game, first).debt = 5;
  const [bs, repay] = setHand(game, first, ['vc_balanceSheet', 'vc_debtRepay']);
  play(game, first, bs);
  assert.equal(me(game, first).coins, 4);
  play(game, first, repay);
  assert.equal(me(game, first).debt, 2);
  assert.equal(game.turnState.attackDamage, 3);
});

test('빈센트 카드는 거래소에 올라간다', () => {
  const { game } = gameWith(null);
  for (const id of getFaction('vincent').cardIds) addMarketPile(game, id);
  assert.equal(game.market.vc_usury.count, 8);
});
