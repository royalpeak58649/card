import test from 'node:test';
import assert from 'node:assert/strict';

import { RoomManager } from '../server/rooms.js';
import { getCandidates, createCardInstance } from '../engine/index.js';

test('모험 모드 방: 혼자 들어가면 캠페인이 시작되고 보스는 AI', () => {
  const rooms = new RoomManager();
  const room = rooms.createRoom({ campaignId: 'silverbeast' });
  const { you } = rooms.join(room.code, '나');
  assert.equal(you, 0);
  assert.ok(room.campaign);
  assert.equal(room.campaign.status, 'battle');
  assert.equal(room.match.picks[1].characterId, 'sb_pup');
  assert.throws(() => rooms.join(room.code, '다른 사람'), /가득/);
});

test('모험 모드 방: 캐릭터·입고 후 대전, 보스를 쓰러뜨리면 다음 스테이지로', () => {
  const rooms = new RoomManager();
  const room = rooms.createRoom({ campaignId: 'silverbeast' });
  rooms.join(room.code, '나');
  rooms.act(room.code, 0, { type: 'selectCharacter', characterId: 'kangjin' });
  rooms.act(room.code, 0, { type: 'draft', cardIds: getCandidates('kangjin').slice(0, 4) });
  const game = room.campaign.match.game;
  assert.equal(game.activeIndex, 0);
  assert.equal(game.players[1].characterId, 'sb_pup');

  // 보스 체력을 1 로 두고 권총으로 공격 → 보스 차례가 끝나면 승리 판정
  game.players[1].hp = 1;
  const me = game.players[0];
  me.drawPile.push(...me.hand);
  me.hand = [createCardInstance(game, 'pistol'), createCardInstance(game, 'pistol')];
  rooms.act(room.code, 0, { type: 'game', action: { type: 'endPhase' } });
  rooms.act(room.code, 0, { type: 'game', action: { type: 'endPhase' } });
  for (const card of [...room.campaign.match.game.players[0].hand]) {
    rooms.act(room.code, 0, { type: 'game', action: { type: 'playCard', uid: card.uid } });
  }
  rooms.act(room.code, 0, { type: 'game', action: { type: 'endPhase' } });
  assert.equal(room.campaign.status, 'stageWon');

  rooms.act(room.code, 0, { type: 'nextStage' });
  assert.equal(room.campaign.stageIndex, 1);
  assert.equal(room.match.picks[1].characterId, 'sb_wolfpack');
  assert.equal(room.match.stage, 'select');
});

test('없는 캠페인으로는 방을 만들 수 없다', () => {
  const rooms = new RoomManager();
  assert.throws(() => rooms.createRoom({ campaignId: 'nope' }));
});
