import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createGame,
  startGame,
  applyAction,
  createCardInstance,
  addMarketPile,
  getCharacter,
  getCardDef,
} from '../engine/index.js';

const SEED = 777;

/** characterId 를 선공에게 준 게임. */
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

const me = (game, p) => game.players[p];

function setHand(game, p, ids) {
  const player = me(game, p);
  player.drawPile.push(...player.hand);
  player.hand = ids.map((id) => createCardInstance(game, id));
  return [...player.hand];
}

function play(game, p, card) {
  applyAction(game, p, { type: 'playCard', uid: card.uid });
}

function toPhase(game, p, phase) {
  while (game.phase !== phase) applyAction(game, p, { type: 'endPhase' });
}

function passTurn(game, p) {
  while (game.activeIndex === p && game.phase !== 'gameOver') applyAction(game, p, { type: 'endPhase' });
}

/** 공격단계까지 가서 손패 무기를 다 내고 차례를 끝낸 뒤 상대가 받은 피해. */
function attackDamage(game, p) {
  const opp = 1 - p;
  const before = me(game, opp).hp;
  toPhase(game, p, 'attack');
  for (const card of [...me(game, p).hand]) {
    if (getCardDef(card.cardId).type === 'weapon') play(game, p, card);
  }
  applyAction(game, p, { type: 'endPhase' });
  return before - me(game, opp).hp;
}

// ---------- 도윤 ----------

test('도윤: 체력 60, 차례 끝 방어 +2로 상대 공격 2 감소', () => {
  const { game, first, second } = gameWith(null, 'doyun');
  assert.equal(me(game, second).maxHp, 60);
  passTurn(game, first);
  passTurn(game, second);
  assert.equal(me(game, second).defense, 2);
  setHand(game, first, ['pistol', 'pistol', 'pistol']);
  assert.equal(attackDamage(game, first), 1);
});

test('도윤: 무기를 낸 차례에는 차례 끝 방어가 붙지 않는다', () => {
  const { game, first } = gameWith('doyun');
  setHand(game, first, ['pistol']);
  attackDamage(game, first); // 권총을 내고 차례 종료
  assert.equal(me(game, first).defense, 0);
});

test('참호 구축 + 제압 사격: 방어를 얻은 차례에 4 피해', () => {
  const { game, first } = gameWith('doyun');
  const [trench] = setHand(game, first, ['s8_trench', 's8_suppress']);
  play(game, first, trench);
  assert.equal(me(game, first).defense, 3);
  assert.equal(attackDamage(game, first), 4);
});

test('제압 사격: 방어를 얻지 않은 차례에는 2 피해', () => {
  const { game, first } = gameWith('doyun');
  setHand(game, first, ['s8_suppress']);
  assert.equal(attackDamage(game, first), 2);
});

test('보급선 차단: 상대 덱 위 2장을 버리게 하고 +1원', () => {
  const { game, first, second } = gameWith('doyun');
  const opp = me(game, second);
  const deckBefore = opp.drawPile.length;
  const discardBefore = opp.discard.length;
  const [cut] = setHand(game, first, ['s8_cutSupply']);
  play(game, first, cut);
  assert.equal(opp.drawPile.length, deckBefore - 2);
  assert.equal(opp.discard.length, discardBefore + 2);
  assert.equal(me(game, first).coins, 1);
});

// ---------- 에코 ----------

test('미러 프로토콜: 직전 행동카드(시냅스 점화)의 효과를 한 번 더', () => {
  const { game, first } = gameWith('echo');
  const [synapse, mirror] = setHand(game, first, ['nu_synapse', 'nu_mirror']);
  play(game, first, synapse); // 행동력 1 → 2
  play(game, first, mirror); // ⚡1 사용 → 1, 시냅스 효과 반복 → +1 = 2
  assert.equal(me(game, first).actions, 2);
});

test('에코 패시브: 내 4번째 차례부터 그 차례 첫 ⚡1 행동카드(난사가 아닌 사고 전파)가 두 번', () => {
  const { game, first, second } = gameWith('echo');
  for (let i = 0; i < 3; i++) {
    passTurn(game, first);
    passTurn(game, second);
  }
  assert.equal(me(game, first).turnsTaken, 4);
  const [thought] = setHand(game, first, ['nu_thought']);
  play(game, first, thought); // 2 피해, +1 행동력 → 두 번
  assert.equal(game.turnState.attackDamage, 4);
  assert.equal(me(game, first).actions, 2);
});

test('루프백: 버린 더미의 행동카드를 덱 맨 위로, 강화판은 손으로', () => {
  const { game, first } = gameWith('echo');
  const player = me(game, first);
  player.discard.push(createCardInstance(game, 'nu_synapse'), createCardInstance(game, 'stone'));
  const [loop] = setHand(game, first, ['nu_loopback']);
  play(game, first, loop);
  assert.deepEqual(game.pending.options.length, 1);
  applyAction(game, first, { type: 'choose', selection: game.pending.options });
  assert.equal(me(game, first).drawPile.at(-1).cardId, 'nu_synapse');
});

test('잔향: 같은 행동카드 2장을 낸 차례에 +4원, 아니면 +1원', () => {
  const { game, first } = gameWith('echo');
  const [s1, s2] = setHand(game, first, ['nu_synapse', 'nu_synapse', 'nu_reverb']);
  play(game, first, s1);
  play(game, first, s2);
  toPhase(game, first, 'buy');
  const reverb = me(game, first).hand.find((c) => c.cardId === 'nu_reverb');
  play(game, first, reverb);
  assert.equal(me(game, first).coins, 4);

  const g2 = gameWith('echo');
  const [r] = setHand(g2.game, g2.first, ['nu_reverb']);
  toPhase(g2.game, g2.first, 'buy');
  play(g2.game, g2.first, r);
  assert.equal(me(g2.game, g2.first).coins, 1);
});

// ---------- 아스트라 ----------

test('아스트라: 별 최대 7, 차례 시작에 별 5개 이상이면 +1원', () => {
  const { game, first, second } = gameWith('astra');
  assert.equal(getCharacter('astra').ability.maxStars, 7);
  const [v1, v2, v3, v4] = setHand(game, first, ['lg_galaxyVault', 'lg_galaxyVault', 'lg_galaxyVault', 'lg_galaxyVault']);
  for (const v of [v1, v2, v3, v4]) {
    me(game, first).actions = 1;
    play(game, first, v);
  }
  assert.equal(me(game, first).stars, 7);
  passTurn(game, first);
  passTurn(game, second);
  assert.equal(me(game, first).stars, 7);
  assert.equal(me(game, first).coins, 1);
});

test('별자리 방패: 별 수만큼 방어(최대 5), 별의 무게: 별 수만큼 피해(별은 그대로)', () => {
  const { game, first } = gameWith('astra');
  me(game, first).stars = 6;
  const [shield] = setHand(game, first, ['lg_constellShield', 'lg_starWeight']);
  play(game, first, shield);
  assert.equal(me(game, first).defense, 5);
  assert.equal(attackDamage(game, first), 6);
  assert.equal(me(game, first).stars, 6);
});

test('세 캐릭터 카드는 거래소에 올려 살 수 있다', () => {
  const { game } = gameWith('astra');
  for (const c of ['doyun', 'echo', 'astra']) {
    for (const id of getCharacter(c).cardIds) addMarketPile(game, id);
  }
  assert.ok(game.market.nu_mirror && game.market.lg_starWeight && game.market.s8_trench);
});
