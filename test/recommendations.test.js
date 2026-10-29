import test from 'node:test';
import assert from 'node:assert/strict';
import { allCharacterIds, getCandidates, createMatch, applyMatchAction, viewFor } from '../engine/index.js';
import { RECOMMENDATIONS } from '../client/recommendationData.js';
import { combinations, simulateDraft } from '../tools/recommend.js';

test('추천: 모든 플레이 가능 캐릭터에 서로 2장 이상 다른 유효한 입고 구성 2개', () => {
  assert.deepEqual(Object.keys(RECOMMENDATIONS).sort(), allCharacterIds().sort());
  for (const id of allCharacterIds()) {
    const builds = RECOMMENDATIONS[id];
    assert.equal(builds.length, 2, id);
    assert.ok(builds[0].cardIds.filter(card => builds[1].cardIds.includes(card)).length <= 2, id);
    for (const build of builds) {
      assert.ok(build.name && build.strategy);
      assert.equal(build.cardIds.length, 4);
      assert.equal(new Set(build.cardIds).size, 4);
      assert.ok(build.cardIds.every(card => getCandidates(id).includes(card)), id);
      const match = createMatch({ seed: 71, players: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }] });
      applyMatchAction(match, 0, { type: 'selectCharacter', characterId: id });
      applyMatchAction(match, 1, { type: 'selectCharacter', characterId: 'hayun' });
      applyMatchAction(match, 0, { type: 'draft', cardIds: build.cardIds });
      // 추천 선택도 상대에게는 확정 전/드래프트 중 공개되지 않는다.
      assert.equal(viewFor(match, 1).picks[0].cardIds, null);
      applyMatchAction(match, 1, { type: 'draft', cardIds: getCandidates('hayun').slice(0, 4) });
      assert.equal(match.stage, 'playing');
    }
  }
});

test('추천 검색: 70개 고유 조합, 실제 중립 2종 및 공용 더미 12장 규칙, 결정적 AI 경기', () => {
  const cardIds = getCandidates('hayun').slice(0, 4);
  const rows = combinations(getCandidates('hayun'));
  assert.equal(rows.length, 70);
  assert.equal(new Set(rows.map(row => row.join(','))).size, 70);
  const args = { characterId: 'hayun', cardIds, opponentId: 'hayun', seed: 71, seat: 1, ai: 'basic' };
  const result = simulateDraft(args);
  assert.deepEqual(simulateDraft(args), result);
  assert.equal(result.neutralIds.length, 2);
  for (const id of result.neutralIds) assert.equal(result.marketCounts[id], 8);
  for (const id of cardIds) assert.equal(result.marketCounts[id], result.opponentCards.includes(id) ? 12 : 8);
  assert.ok([0, 0.5, 1].includes(result.score));
});
