import test from 'node:test';
import assert from 'node:assert/strict';

import {
  registerCampaign,
  getCampaign,
  allCampaignIds,
  createCampaign,
  applyCampaignAction,
  runEnemy,
  campaignView,
  getCharacter,
  getCandidates,
} from '../engine/index.js';
import { chooseAiAction } from '../engine/ai.js';

registerCampaign({
  id: 'test_cp',
  name: '테스트',
  description: '',
  stages: [
    { name: '1', bossId: 'jin', intro: '' },
    { name: '2', bossId: 'kangjin', intro: '' },
  ],
});

const PICKS = ['s8_supplyOrder', 's8_logistics', 's8_opFunds', 's8_emergencyProc'];

/** 캐릭터 선택까지 끝낸 모험 */
function campaignAtDraft(seed = 12345) {
  const campaign = createCampaign({ seed, campaignId: 'test_cp', playerName: '나' });
  applyCampaignAction(campaign, { type: 'selectCharacter', characterId: 'hayun' });
  return campaign;
}

/** 대전이 시작된 모험 */
function campaignAtPlaying(seed = 12345) {
  const campaign = campaignAtDraft(seed);
  applyCampaignAction(campaign, { type: 'draft', cardIds: PICKS });
  return campaign;
}

/** 플레이어 손패를 권총 하나로 바꾸고 보스 hp 를 1 로 둔다 */
function setupQuickWin(campaign) {
  const game = campaign.match.game;
  game.players[1].hp = 1;
  game.players[0].hand = [{ uid: 'c999', cardId: 'pistol', upgraded: false }];
  game.phase = 'attack';
}

/** 플레이어가 권총으로 공격하고 차례를 넘긴 뒤 보스 차례를 진행한다 */
function playerAttackAndPass(campaign) {
  applyCampaignAction(campaign, { type: 'game', action: { type: 'playCard', uid: 'c999' } });
  applyCampaignAction(campaign, { type: 'game', action: { type: 'endPhase' } });
  runEnemy(campaign, chooseAiAction);
}

test('registerCampaign: 중복·없는 id 는 Error', () => {
  assert.ok(allCampaignIds().includes('test_cp'));
  assert.equal(getCampaign('test_cp').stages.length, 2);
  assert.throws(() =>
    registerCampaign({ id: 'test_cp', name: 'x', description: '', stages: [{ name: '1', bossId: 'jin', intro: '' }] }),
  );
  assert.throws(() => getCampaign('nope'));
});

test('createCampaign: select 단계, 보스 캐릭터, 중립 카드 2종', () => {
  const campaign = createCampaign({ seed: 777, campaignId: 'test_cp', playerName: '나' });
  assert.equal(campaign.status, 'battle');
  assert.equal(campaign.stageIndex, 0);
  assert.deepEqual(campaign.augments, []);
  assert.deepEqual(campaign.history, []);
  assert.equal(campaign.match.stage, 'select');
  assert.equal(campaign.match.picks[1].characterId, 'jin');
  assert.deepEqual(campaign.match.picks[1].cardIds, []);
  assert.equal(campaign.match.picks[0].characterId, null);
  assert.equal(campaign.match.neutralIds.length, 2);
  assert.notEqual(campaign.match.neutralIds[0], campaign.match.neutralIds[1]);
  assert.equal(campaign.match.players[1].name, getCharacter('jin').name);
  assert.equal(campaign.match.game, null);

  const again = createCampaign({ seed: 777, campaignId: 'test_cp', playerName: '나' });
  assert.deepEqual(again.match.neutralIds, campaign.match.neutralIds);
  assert.equal(again.match.seed, campaign.match.seed);
});

test('selectCharacter: draft 로, 잘못된 조작은 Error', () => {
  const campaign = createCampaign({ seed: 1, campaignId: 'test_cp', playerName: '나' });
  assert.throws(() => applyCampaignAction(campaign, { type: 'selectCharacter', characterId: 'nobody' }));
  assert.throws(() => applyCampaignAction(campaign, { type: 'draft', cardIds: PICKS }));
  assert.throws(() => applyCampaignAction(campaign, { type: 'game', action: { type: 'endPhase' } }));
  assert.throws(() => applyCampaignAction(campaign, { type: 'nextStage' }));
  assert.throws(() => applyCampaignAction(campaign, { type: 'restart' }));
  assert.throws(() => applyCampaignAction(campaign, { type: 'nope' }));
  assert.equal(campaign.match.stage, 'select');

  applyCampaignAction(campaign, { type: 'selectCharacter', characterId: 'hayun' });
  assert.equal(campaign.match.stage, 'draft');
  assert.equal(campaign.match.picks[0].characterId, 'hayun');
  assert.throws(() => applyCampaignAction(campaign, { type: 'selectCharacter', characterId: 'kangjin' }));
});

test('draft: 잘못된 선택은 Error 이고 상태가 그대로', () => {
  const campaign = campaignAtDraft();
  const before = JSON.stringify(campaign);
  const bad = [
    PICKS.slice(0, 3),
    [...PICKS, 's8_budget'],
    [PICKS[0], PICKS[0], PICKS[1], PICKS[2]],
    ['s8_breakthrough', 's8_loot', 's8_heavyMg', 's8_supplyOrder'],
  ];
  for (const cardIds of bad) {
    assert.throws(() => applyCampaignAction(campaign, { type: 'draft', cardIds }));
    assert.equal(JSON.stringify(campaign), before);
  }
});

test('draft: 대전 시작, 플레이어 선공, 시장 구성', () => {
  const campaign = campaignAtPlaying();
  const match = campaign.match;
  assert.equal(match.stage, 'playing');
  const game = match.game;
  assert.equal(game.activeIndex, 0);
  assert.equal(game.firstPlayerIndex, 0);
  assert.equal(game.phase, 'action');
  assert.equal(game.players[0].maxHp, 56);
  assert.equal(game.players[0].characterId, 'hayun');
  assert.equal(game.players[1].characterId, 'jin');

  for (const cardId of match.neutralIds) assert.equal(game.market[cardId].count, 8);
  for (const cardId of PICKS) assert.equal(game.market[cardId].count, 8);
  for (const cardId of getCandidates('jin')) {
    assert.equal(game.market[cardId], undefined, `보스 카드가 시장에 있음: ${cardId}`);
  }
});

test('승리하면 stageWon, nextStage 로 다음 보스', () => {
  const campaign = campaignAtPlaying();
  setupQuickWin(campaign);
  playerAttackAndPass(campaign);

  assert.equal(campaign.status, 'stageWon');
  assert.equal(campaign.match.stage, 'finished');
  assert.equal(campaign.match.winner, 0);
  assert.equal(campaign.history.length, 1);
  assert.equal(campaign.history[0].result, 'win');
  assert.equal(campaign.history[0].stageIndex, 0);
  assert.equal(campaign.history[0].characterId, 'hayun');
  assert.equal(typeof campaign.history[0].turns, 'number');

  applyCampaignAction(campaign, { type: 'chooseAugment', augmentId: campaign.augmentChoices[0] });
  applyCampaignAction(campaign, { type: 'nextStage' });
  assert.equal(campaign.stageIndex, 1);
  assert.equal(campaign.status, 'battle');
  assert.equal(campaign.match.stage, 'select');
  assert.equal(campaign.match.picks[1].characterId, 'kangjin');
  assert.equal(campaign.match.picks[0].characterId, null);
  assert.equal(campaign.match.game, null);
});

test('마지막 스테이지 승리 → cleared, restart 로 초기화', () => {
  const campaign = campaignAtPlaying();
  setupQuickWin(campaign);
  playerAttackAndPass(campaign);
  applyCampaignAction(campaign, { type: 'chooseAugment', augmentId: campaign.augmentChoices[0] });
  applyCampaignAction(campaign, { type: 'nextStage' });

  applyCampaignAction(campaign, { type: 'selectCharacter', characterId: 'hayun' });
  applyCampaignAction(campaign, { type: 'draft', cardIds: PICKS });
  setupQuickWin(campaign);
  playerAttackAndPass(campaign);

  assert.equal(campaign.status, 'cleared');
  assert.equal(campaign.history.length, 2);
  assert.equal(campaign.history[1].result, 'win');
  assert.throws(() => applyCampaignAction(campaign, { type: 'nextStage' }));

  applyCampaignAction(campaign, { type: 'restart' });
  assert.equal(campaign.stageIndex, 0);
  assert.equal(campaign.status, 'battle');
  assert.deepEqual(campaign.history, []);
  assert.deepEqual(campaign.augments, []);
  assert.equal(campaign.match.stage, 'select');
  assert.equal(campaign.match.picks[1].characterId, 'jin');
});

test('지면 lost, nextStage 는 Error 이고 restart 는 된다', () => {
  const campaign = campaignAtPlaying();
  const game = campaign.match.game;
  game.players[0].hp = 1;
  game.phase = 'attack';

  applyCampaignAction(campaign, { type: 'game', action: { type: 'endPhase' } });
  runEnemy(campaign, chooseAiAction);

  assert.equal(campaign.status, 'lost');
  assert.equal(campaign.history[0].result, 'lose');
  assert.throws(() => applyCampaignAction(campaign, { type: 'nextStage' }));
  assert.throws(() => applyCampaignAction(campaign, { type: 'selectCharacter', characterId: 'hayun' }));

  applyCampaignAction(campaign, { type: 'restart' });
  assert.equal(campaign.status, 'battle');
  assert.equal(campaign.stageIndex, 0);
  assert.deepEqual(campaign.history, []);
});

test('campaignView: 스테이지 정보와 가려진 보스 손패', () => {
  const campaign = campaignAtPlaying();
  const view = campaignView(campaign);
  assert.equal(view.campaignId, 'test_cp');
  assert.equal(view.name, '테스트');
  assert.equal(view.stageCount, 2);
  assert.equal(view.stageIndex, 0);
  assert.equal(view.status, 'battle');
  assert.equal(view.seed, undefined);
  assert.equal(view.rngState, undefined);
  assert.equal(view.match.seed, undefined);
  assert.equal(view.match.rngState, undefined);

  assert.equal(view.stages[0].bossId, 'jin');
  assert.equal(view.stages[0].bossName, getCharacter('jin').name);
  assert.equal(view.stages[0].bossMaxHp, getCharacter('jin').maxHp);
  assert.equal(view.stages[0].cleared, false);
  assert.equal(view.stages[1].bossName, getCharacter('kangjin').name);

  assert.deepEqual(view.match.game.players[1].hand, []);
  assert.equal(typeof view.match.game.players[1].handCount, 'number');
  assert.ok(view.match.game.players[0].hand.length > 0);

  // 원본은 그대로.
  assert.ok(campaign.match.game.players[1].hand.length > 0);
});

test('JSON 왕복 후에도 이어서 진행된다', () => {
  const campaign = campaignAtPlaying();
  const restored = JSON.parse(JSON.stringify(campaign));
  setupQuickWin(restored);
  playerAttackAndPass(restored);
  assert.equal(restored.status, 'stageWon');

  applyCampaignAction(restored, { type: 'chooseAugment', augmentId: restored.augmentChoices[0] });
  applyCampaignAction(restored, { type: 'nextStage' });
  assert.equal(restored.stageIndex, 1);
  applyCampaignAction(restored, { type: 'selectCharacter', characterId: 'hayun' });
  applyCampaignAction(restored, { type: 'draft', cardIds: PICKS });
  assert.equal(restored.match.stage, 'playing');
  assert.equal(restored.match.game.activeIndex, 0);
});
