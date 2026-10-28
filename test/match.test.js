import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createMatch,
  getCandidates,
  applyMatchAction,
  viewFor,
  NEUTRAL_CARD_IDS,
  getFaction,
  getCharacter,
} from '../engine/index.js';

const PLAYERS = [
  { id: 'p0', name: '플레이어0' },
  { id: 'p1', name: '플레이어1' },
];

/** 캐릭터 선택까지 끝낸 경기 */
function matchAtDraft(seed = 12345) {
  const match = createMatch({ seed, players: PLAYERS.map((p) => ({ ...p })) });
  applyMatchAction(match, 0, { type: 'selectCharacter', characterId: 'hayun' });
  applyMatchAction(match, 1, { type: 'selectCharacter', characterId: 'kangjin' });
  return match;
}

/** 대전이 시작된 경기 */
function matchAtPlaying(seed = 12345, picks0 = HAYUN_PICKS, picks1 = KANGJIN_PICKS) {
  const match = matchAtDraft(seed);
  applyMatchAction(match, 0, { type: 'draft', cardIds: picks0 });
  applyMatchAction(match, 1, { type: 'draft', cardIds: picks1 });
  return match;
}

const HAYUN_PICKS = ['s8_supplyOrder', 's8_logistics', 's8_opFunds', 's8_emergencyProc'];
const KANGJIN_PICKS = ['s8_supplyOrder', 's8_maintenance', 's8_breakthrough', 's8_loot'];

test('createMatch: select 단계와 중립 카드 2종', () => {
  const match = createMatch({ seed: 777, players: PLAYERS.map((p) => ({ ...p })) });
  assert.equal(match.stage, 'select');
  assert.equal(match.neutralIds.length, 2);
  assert.notEqual(match.neutralIds[0], match.neutralIds[1]);
  for (const id of match.neutralIds) assert.ok(NEUTRAL_CARD_IDS.includes(id));
  assert.equal(match.game, null);
  assert.equal(match.winner, null);
  assert.deepEqual(match.picks, [
    { characterId: null, cardIds: null },
    { characterId: null, cardIds: null },
  ]);

  const again = createMatch({ seed: 777, players: PLAYERS.map((p) => ({ ...p })) });
  assert.deepEqual(again.neutralIds, match.neutralIds);
});

test('getCandidates: 진영 카드 5 + 캐릭터 카드 3', () => {
  const faction = getFaction('section8');
  for (const characterId of ['hayun', 'kangjin']) {
    const candidates = getCandidates(characterId);
    assert.equal(candidates.length, 8);
    assert.equal(new Set(candidates).size, 8);
    for (const cardId of faction.cardIds) assert.ok(candidates.includes(cardId));
    for (const cardId of getCharacter(characterId).cardIds) {
      assert.ok(candidates.includes(cardId));
    }
  }
});

test('selectCharacter: 둘 다 고르면 draft, 잘못된 조작은 Error', () => {
  const match = createMatch({ seed: 1, players: PLAYERS.map((p) => ({ ...p })) });
  applyMatchAction(match, 0, { type: 'selectCharacter', characterId: 'hayun' });
  assert.equal(match.stage, 'select');
  applyMatchAction(match, 1, { type: 'selectCharacter', characterId: 'kangjin' });
  assert.equal(match.stage, 'draft');
  assert.equal(match.picks[0].characterId, 'hayun');
  assert.equal(match.picks[1].characterId, 'kangjin');

  const dup = createMatch({ seed: 1, players: PLAYERS.map((p) => ({ ...p })) });
  applyMatchAction(dup, 0, { type: 'selectCharacter', characterId: 'hayun' });
  assert.throws(() =>
    applyMatchAction(dup, 0, { type: 'selectCharacter', characterId: 'kangjin' }),
  );
  assert.throws(() =>
    applyMatchAction(dup, 1, { type: 'selectCharacter', characterId: 'nobody' }),
  );
  assert.throws(() => applyMatchAction(dup, 1, { type: 'draft', cardIds: HAYUN_PICKS }));
  assert.throws(() => applyMatchAction(dup, 0, { type: 'nope' }));
});

test('draft: 잘못된 선택은 Error 이고 상태가 변하지 않는다', () => {
  const match = matchAtDraft();
  const before = JSON.stringify(match);
  const bad = [
    HAYUN_PICKS.slice(0, 3),
    [...HAYUN_PICKS, 's8_budget'],
    [HAYUN_PICKS[0], HAYUN_PICKS[0], HAYUN_PICKS[1], HAYUN_PICKS[2]],
    ['s8_breakthrough', 's8_loot', 's8_heavyMg', 's8_supplyOrder'],
  ];
  for (const cardIds of bad) {
    assert.throws(() => applyMatchAction(match, 0, { type: 'draft', cardIds }));
    assert.equal(JSON.stringify(match), before);
  }
});

test('draft: 둘 다 고르면 대전 시작, 시장 구성과 더미 장수', () => {
  const match = matchAtPlaying(12345, HAYUN_PICKS, KANGJIN_PICKS);
  assert.equal(match.stage, 'playing');
  assert.equal(match.game.phase, 'action');

  const market = match.game.market;
  for (const cardId of ['stone', 'silver', 'gold', 'pistol', 'rifle', 'assaultRifle']) {
    assert.ok(market[cardId], `기본 공급 누락: ${cardId}`);
  }
  for (const cardId of match.neutralIds) assert.ok(market[cardId]);
  for (const cardId of [...HAYUN_PICKS, ...KANGJIN_PICKS]) assert.ok(market[cardId]);

  // 두 사람이 같은 카드를 고르면 12장, 한 사람만 고르면 8장.
  assert.equal(market.s8_supplyOrder.count, 12);
  assert.equal(market.s8_logistics.count, 8);
  assert.equal(market.s8_breakthrough.count, 8);
  for (const cardId of match.neutralIds) assert.equal(market[cardId].count, 8);

  assert.equal(match.game.players[0].maxHp, 56);
  assert.equal(match.game.players[1].maxHp, 52);
  assert.equal(match.game.players[0].characterId, 'hayun');
  assert.equal(match.game.players[1].characterId, 'kangjin');
});

test('game 조작: 선공 endPhase 로 buy 단계, 차례 아닌 쪽은 Error', () => {
  const match = matchAtPlaying();
  const first = match.game.activeIndex;
  const second = 1 - first;
  assert.throws(() =>
    applyMatchAction(match, second, { type: 'game', action: { type: 'endPhase' } }),
  );
  applyMatchAction(match, first, { type: 'game', action: { type: 'endPhase' } });
  assert.equal(match.game.phase, 'buy');
});

test('game 조작: 상대 hp 1 에서 권총 공격으로 승리하면 finished', () => {
  const match = matchAtPlaying();
  const game = match.game;
  const first = game.activeIndex;
  const second = 1 - game.activeIndex;
  game.players[second].hp = 1;
  game.players[first].hand = [{ uid: 'c999', cardId: 'pistol', upgraded: false }];
  game.phase = 'attack';

  applyMatchAction(match, first, {
    type: 'game',
    action: { type: 'playCard', uid: 'c999' },
  });
  applyMatchAction(match, first, { type: 'game', action: { type: 'endPhase' } });

  assert.equal(match.stage, 'finished');
  assert.equal(match.winner, first);
  assert.equal(match.game.phase, 'gameOver');
});

test('viewFor: 숨길 정보만 가리고 원본은 그대로', () => {
  const match = matchAtPlaying();
  const before = JSON.stringify(match);
  const view = viewFor(match, 0);

  assert.equal(view.you, 0);
  assert.equal(view.seed, undefined);
  assert.equal(view.rngState, undefined);
  assert.equal(view.game.seed, undefined);
  assert.equal(view.game.rngState, undefined);

  assert.deepEqual(view.game.players[1].hand, []);
  assert.equal(view.game.players[1].handCount, 5);
  assert.equal(view.game.players[0].hand.length, 5);
  for (const player of view.game.players) {
    assert.deepEqual(player.drawPile, []);
    assert.equal(typeof player.drawCount, 'number');
  }
  assert.equal(typeof view.game.market.stone.count, 'number');
  assert.equal(typeof view.game.players[0].hp, 'number');
  assert.equal(typeof view.game.players[0].stars, 'number');
  assert.equal(typeof view.game.players[0].defense, 'number');
  assert.ok(view.game.turnState);

  assert.equal(JSON.stringify(match), before);
});

test('viewFor: draft 중 상대 cardIds 는 null, pending 은 상대에게 가려진다', () => {
  const match = matchAtDraft();
  applyMatchAction(match, 0, { type: 'draft', cardIds: HAYUN_PICKS });

  const view0 = viewFor(match, 0);
  assert.deepEqual(view0.picks[0].cardIds, HAYUN_PICKS);
  assert.equal(view0.picks[1].cardIds, null);

  const view1 = viewFor(match, 1);
  assert.equal(view1.picks[0].cardIds, null);
  assert.equal(view1.picks[1].cardIds, null);

  // 대전이 시작되면 공개된다.
  applyMatchAction(match, 1, { type: 'draft', cardIds: KANGJIN_PICKS });
  const playing = viewFor(match, 0);
  assert.deepEqual(playing.picks[1].cardIds, KANGJIN_PICKS);

  // 상대에게는 pending 의 options 가 보이지 않는다.
  match.game.pending = {
    playerIndex: 1,
    kind: 'test',
    prompt: '고르세요',
    options: ['a', 'b'],
    min: 1,
    max: 1,
    data: { secret: true },
    ctx: { playerIndex: 1, cardUid: 'c1' },
    rest: [],
  };
  const hidden = viewFor(match, 0);
  assert.deepEqual(hidden.game.pending, {
    playerIndex: 1,
    prompt: '고르세요',
    waiting: true,
  });

  const own = viewFor(match, 1);
  assert.deepEqual(own.game.pending.options, ['a', 'b']);
  assert.equal(own.game.pending.ctx, undefined);
  assert.equal(own.game.pending.rest, undefined);
  assert.equal(own.game.pending.data, undefined);
});

test('viewFor: 내 선택지가 가려진 덱의 카드여도 optionCards 로 종류를 알려준다', async () => {
  const { createMatch, applyMatchAction, viewFor, createCardInstance, NEUTRAL_CARD_IDS } = await import('../engine/index.js');
  const match = createMatch({ seed: 7, players: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }] });
  applyMatchAction(match, 0, { type: 'selectCharacter', characterId: 'hayun' });
  applyMatchAction(match, 1, { type: 'selectCharacter', characterId: 'kangjin' });
  applyMatchAction(match, 0, { type: 'draft', cardIds: ['s8_supplyOrder', 's8_logistics', 's8_opFunds', 's8_maintenance'] });
  applyMatchAction(match, 1, { type: 'draft', cardIds: ['s8_supplyOrder', 's8_logistics', 's8_opFunds', 's8_maintenance'] });
  const game = match.game;
  const p = game.activeIndex;
  const informant = createCardInstance(game, 'n_informant');
  game.players[p].hand.push(informant);
  applyMatchAction(match, p, { type: 'game', action: { type: 'playCard', uid: informant.uid } });
  assert.equal(game.pending.kind, 'reorderTop');
  const mine = viewFor(match, p);
  assert.equal(Object.keys(mine.game.pending.optionCards).length, game.pending.options.length);
  for (const uid of game.pending.options) {
    assert.equal(mine.game.pending.optionCards[uid], game.players[p].drawPile.find((c) => c.uid === uid).cardId);
  }
  const theirs = viewFor(match, 1 - p);
  assert.equal(theirs.game.pending.optionCards, undefined);
  assert.equal(theirs.game.pending.options, undefined);
  assert.ok(NEUTRAL_CARD_IDS.includes('n_informant'));
});
