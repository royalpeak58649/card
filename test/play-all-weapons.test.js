import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, startGame, createCardInstance, applyAction, getCardDef } from '../engine/index.js';

function setup(cardIds, phase = 'attack') {
  const game = createGame({ seed: 71, players: [{ id: 'a', name: 'A', maxHp: 55 }, { id: 'b', name: 'B', maxHp: 55 }] });
  startGame(game);
  const p = game.activeIndex;
  game.phase = phase;
  game.players[p].hand = cardIds.map(id => createCardInstance(game, id));
  return { game, p };
}

test('무기 모두 내기: 손패 순서의 개별 사용과 피해·강화·강진 능력이 동일하다', () => {
  const { game, p } = setup(['stone', 's8_heavyMg', 'pistol', 'vc_seizure', 'n_reinforce']);
  game.players[p].characterId = 'kangjin';
  game.players[p].hand[3].upgraded = true;
  const individual = structuredClone(game);
  const weapons = individual.players[p].hand.filter(c => getCardDef(c.cardId).type === 'weapon');
  for (const card of weapons) applyAction(individual, p, { type: 'playCard', uid: card.uid });
  applyAction(game, p, { type: 'playAllWeapons' });
  assert.deepEqual(game.players, individual.players);
  assert.deepEqual(game.turnState, individual.turnState);
  assert.equal(game.turnState.weaponsPlayed, 3);
  assert.equal(game.turnState.upgradedPlayed, 1);
  assert.deepEqual(game.players[p].hand.map(c => c.cardId), ['stone', 'n_reinforce']);
  const other = 1 - p;
  applyAction(game, p, { type: 'endPhase' });
  applyAction(individual, p, { type: 'endPhase' });
  assert.equal(game.players[other].hp, individual.players[other].hp);
});

test('무기 모두 내기: 유성 낙하의 별 사용 선택에서 멈추고, 선택 후 나머지를 낸다', () => {
  const { game, p } = setup(['lg_meteor', 'lg_meteor', 'pistol']);
  game.players[p].stars = 3;
  applyAction(game, p, { type: 'upgrade', uid: game.players[p].hand[0].uid, mode: 'temp' });
  applyAction(game, p, { type: 'playAllWeapons' });
  assert.equal(game.pending.kind, 'payStars');
  assert.equal(game.turnState.attackDamage, 3);
  assert.equal(game.turnState.weaponsPlayed, 1);
  const waiting = structuredClone(game);
  assert.throws(() => applyAction(game, p, { type: 'playAllWeapons' }), /선택/);
  assert.deepEqual(game, waiting);
  applyAction(game, p, { type: 'choose', selection: ['pay'] });
  assert.equal(game.turnState.attackDamage, 6);
  applyAction(game, p, { type: 'playAllWeapons' });
  assert.equal(game.pending.kind, 'payStars');
  assert.equal(game.turnState.weaponsPlayed, 2);
  applyAction(game, p, { type: 'choose', selection: ['skip'] });
  applyAction(game, p, { type: 'playAllWeapons' });
  assert.equal(game.pending, null);
  assert.equal(game.turnState.weaponsPlayed, 3);
  assert.equal(game.turnState.attackDamage, 9);
  assert.equal(game.players[p].stars, 1);
});

test('무기 모두 내기: 다른 단계·상대 차례는 거절하고, 빈 손패는 차례를 끝내지 않는다', () => {
  for (const phase of ['action', 'buy']) {
    const { game, p } = setup(['pistol'], phase);
    const before = structuredClone(game);
    assert.throws(() => applyAction(game, p, { type: 'playAllWeapons' }), /공격단계/);
    assert.deepEqual(game, before);
  }
  const { game, p } = setup(['stone']);
  const before = structuredClone(game);
  assert.throws(() => applyAction(game, 1 - p, { type: 'playAllWeapons' }), /차례/);
  assert.deepEqual(game, before);
  applyAction(game, p, { type: 'playAllWeapons' });
  assert.equal(game.phase, 'attack');
  assert.equal(game.turnState.weaponsPlayed, 0);
});

test('강화 증원 요청: 기본 효과를 합산하지 않고 3장, 에코는 강화 효과 두 번으로 6장 뽑는다', () => {
  for (const echo of [false, true]) {
    const { game, p } = setup(['n_reinforce', 'stone', 'stone', 'stone', 'stone'], 'action');
    const player = game.players[p];
    if (echo) { player.characterId = 'echo'; player.turnsTaken = 4; }
    player.stars = 1;
    player.drawPile = Array.from({ length: 10 }, () => createCardInstance(game, 'stone'));
    player.discard = [];
    const uid = player.hand[0].uid;
    applyAction(game, p, { type: 'upgrade', uid, mode: 'temp' });
    assert.equal(player.drawPile.length, 10, '강화 자체는 카드를 뽑지 않는다');
    applyAction(game, p, { type: 'playCard', uid });
    assert.equal(player.drawPile.length, echo ? 4 : 7);
    assert.equal(player.hand.length, echo ? 10 : 7);
    assert.equal(game.turnState.actionsPlayed, 1);
  }
});
