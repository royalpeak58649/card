import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AUGMENTS, getAugment, createGame, createCardInstance, startGame, applyAction,
  createCampaign, applyCampaignAction, getCandidates, campaignView, settle, addMarketPile,
} from '../engine/index.js';
import { applyAugments, rollAugmentChoices } from '../engine/augments.js';
import { chooseAiAction } from '../engine/ai.js';
import { runEffects } from '../engine/effects.js';

function gameWith(ids, characterId = 'hayun') {
  const game = createGame({ seed: 23, players: [
    { id: 'p0', name: '나', characterId }, { id: 'p1', name: '보스', characterId: 'sb_king' },
  ] });
  game.firstPlayerIndex = 0;
  game.activeIndex = 0;
  applyAugments(game, ids);
  startGame(game);
  return game;
}

function passTurn(game) {
  const actor = game.activeIndex;
  while (game.activeIndex === actor && game.phase !== 'gameOver') {
    applyAction(game, actor, { type: 'endPhase' });
  }
}

function play(game, cardId) {
  const card = createCardInstance(game, cardId);
  game.players[0].hand.push(card);
  applyAction(game, 0, { type: 'playCard', uid: card.uid });
  return card;
}

function wonCampaign(seed = 1) {
  const campaign = createCampaign({ seed, campaignId: 'silverbeast' });
  applyCampaignAction(campaign, { type: 'selectCharacter', characterId: 'hayun' });
  applyCampaignAction(campaign, { type: 'draft', cardIds: getCandidates('hayun').slice(0, 4) });
  campaign.match.game.phase = 'gameOver';
  campaign.match.game.winner = 0;
  settle(campaign);
  return campaign;
}

test('증강: 보상 화면 단위 확률, 같은 등급 3종, 중복 보유 제외, 시드 재현', () => {
  const counts = { 1: 0, 2: 0, 3: 0 };
  for (let seed = 0; seed < 20000; seed++) {
    const state = { rngState: seed, augments: [] };
    const ids = rollAugmentChoices(state);
    assert.equal(ids.length, 3);
    assert.equal(new Set(ids).size, 3);
    const rarity = getAugment(ids[0]).rarity;
    assert.ok(ids.every((id) => getAugment(id).rarity === rarity));
    counts[rarity]++;
    assert.deepEqual(ids, rollAugmentChoices({ rngState: seed, augments: [] }));
    const owned = AUGMENTS.filter((a) => a.rarity === rarity).slice(0, 3).map((a) => a.id);
    const remaining = rollAugmentChoices({ rngState: seed, augments: owned });
    assert.equal(remaining.length, 3);
    assert.ok(remaining.every((id) => !owned.includes(id)));
  }
  assert.ok(counts[1] / 20000 > .91 && counts[1] / 20000 < .93);
  assert.ok(counts[2] / 20000 > .07 && counts[2] / 20000 < .085);
  assert.ok(counts[3] / 20000 > .001 && counts[3] / 20000 < .003);
  assert.throws(() => getAugment('__proto__'));
});

test('증강 선택은 필수, 후보 외 선택·중복 선택은 원자적으로 거절하고 재접속에도 유지', () => {
  const campaign = wonCampaign();
  const snapshot = JSON.stringify(campaign);
  settle(campaign);
  assert.equal(JSON.stringify(campaign), snapshot, '결과 처리를 반복해도 다시 뽑지 않는다');
  for (const action of [{ type: 'nextStage' }, { type: 'chooseAugment', augmentId: 'nope' }]) {
    assert.throws(() => applyCampaignAction(campaign, action));
    assert.equal(JSON.stringify(campaign), snapshot);
  }
  const restored = JSON.parse(snapshot);
  assert.deepEqual(campaignView(restored).augmentChoices, campaign.augmentChoices);
  const id = restored.augmentChoices[0];
  applyCampaignAction(restored, { type: 'chooseAugment', augmentId: id });
  assert.deepEqual(restored.augments, [id]);
  assert.throws(() => applyCampaignAction(restored, { type: 'chooseAugment', augmentId: id }));
  applyCampaignAction(restored, { type: 'nextStage' });
  applyCampaignAction(restored, { type: 'selectCharacter', characterId: 'jin' });
  applyCampaignAction(restored, { type: 'draft', cardIds: getCandidates('jin').slice(0, 4) });
  assert.deepEqual(restored.match.game.players[0].augmentIds, [id]);
  assert.equal(restored.match.game.players[1].augmentIds, undefined);
  restored.match.game.phase = 'gameOver';
  restored.match.game.winner = 1;
  settle(restored);
  applyCampaignAction(restored, { type: 'restart' });
  assert.deepEqual(restored.augments, []);
  assert.deepEqual(restored.augmentChoices, []);
});

test('소소한 증강: 최대 체력·시작 별·첫 차례 손패·초반 보급·회복·방어', () => {
  const game = gameWith(['field_rations', 'star_cache', 'quick_hands', 'supply_pouch', 'iron_guard', 'battle_medicine']);
  const me = game.players[0];
  assert.equal(me.maxHp, 62);
  assert.equal(me.hp, 62);
  assert.equal(me.stars, 2);
  assert.equal(me.actions, 2);
  assert.equal(me.hand.length, 6);
  assert.equal(me.coins, 1);
  assert.equal(me.defense, 1);
  me.hp -= 5;
  for (let turn = 2; turn <= 4; turn++) {
    passTurn(game);
    passTurn(game);
    assert.equal(me.actions, 1);
    assert.equal(me.hand.length, 5);
    assert.equal(me.coins, turn <= 3 ? 1 : 0);
    assert.equal(me.hp, 57 + turn - 1);
    assert.equal(me.defense, 1);
  }
});

test('집중 조준·과충전 탄환은 조건·상한을 지키고 무기가 없으면 피해를 만들지 않는다', () => {
  for (const [weapons, expected] of [[0, 0], [1, 2], [2, 5], [5, 10]]) {
    const game = gameWith(['focused_aim', 'overcharge']);
    const before = game.players[1].hp;
    game.phase = 'attack';
    game.players[0].hand = [];
    for (let i = 0; i < weapons; i++) play(game, 'pistol');
    applyAction(game, 0, { type: 'endPhase' });
    assert.equal(before - game.players[1].hp, expected);
  }
});

test('강력한 증강: 보급·행동력·별은 매 차례 적용, 회복은 절반 이하에서만', () => {
  const game = gameWith(['tactical_link', 'arsenal', 'war_economy', 'star_engine', 'second_wind']);
  const me = game.players[0];
  assert.equal(me.hand.length, 7);
  assert.equal(me.hand.filter((c) => c.cardId === 'rifle').length, 1);
  assert.equal(game.market.rifle.count, 12, '시작 소총은 거래소 수량을 줄이지 않는다');
  assert.equal(me.actions, 2);
  assert.equal(me.buys, 2);
  assert.equal(me.coins, 1);
  assert.equal(me.stars, 1);
  me.hp = 28;
  passTurn(game);
  passTurn(game);
  assert.equal(me.hp, 31);
  assert.equal(me.hand.length, 6);
  assert.equal(me.stars, 3);
  passTurn(game);
  passTurn(game);
  assert.equal(me.hp, 31);
  assert.equal(me.stars, 5);
});

test('종말의 탄두: 카드·캐릭터·증강 보너스를 2배 후 방어·출혈 처리, 라운드 끝 승패 유지', () => {
  const game = gameWith(['apocalypse', 'overcharge'], 'kangjin');
  game.phase = 'attack';
  game.players[0].hand = [];
  game.players[1].hp = 5;
  game.players[1].defense = 3;
  game.players[1].bleed = true;
  play(game, 'pistol');
  play(game, 'pistol');
  play(game, 'pistol');
  // 권총 3 + 강진 2 + 과충전 3 = 8. 2배 -> 16, 방어 -3, 출혈 +1 = 14.
  applyAction(game, 0, { type: 'endPhase' });
  assert.equal(game.players[1].hp, -9);
  assert.equal(game.players[1].bleed, false);
  assert.equal(game.phase, 'action');
  assert.equal(game.activeIndex, 1);
  assert.equal(game.winner, null);
  passTurn(game);
  assert.equal(game.phase, 'gameOver');
  assert.equal(game.winner, 0);
});

test('시간왕의 왕관: 비용·횟수는 한 번, 0비용 제외, 차례마다 재발동·선택 대기 JSON 복구', () => {
  const game = gameWith(['chronocrown']);
  game.players[0].hand = [];
  play(game, 'n_radio');
  assert.equal(game.turnState.augmentActionEchoUsed, undefined);
  const before = game.players[0].hand.length;
  play(game, 'n_briefing');
  assert.equal(game.players[0].hand.length, before + 3);
  assert.equal(game.players[0].actions, 7); // 초기 1 + 무전 1 - 비용 1 + 2*3
  assert.equal(game.turnState.actionsPlayed, 2);
  play(game, 'n_briefing');
  assert.equal(game.players[0].actions, 8);
  passTurn(game);
  passTurn(game);
  game.players[0].discard.push(...Array.from({ length: 3 }, () => createCardInstance(game, 'pistol')));
  play(game, 'n_reorganize');
  assert.ok(game.pending);
  const restored = JSON.parse(JSON.stringify(game));
  let choices = 0;
  while (restored.pending) {
    applyAction(restored, 0, { type: 'choose', selection: [restored.pending.options[0]] });
    choices++;
  }
  assert.equal(choices, 3);
});

test('시간왕의 왕관과 에코는 추가 실행 횟수를 합산하고 실패한 조작은 되돌린다', () => {
  const game = gameWith(['chronocrown'], 'echo');
  game.players[0].turnsTaken = 5;
  const card = createCardInstance(game, 'n_briefing');
  game.players[0].hand = [card];
  game.players[0].actions = 0;
  const before = JSON.stringify(game);
  assert.throws(() => applyAction(game, 0, { type: 'playCard', uid: card.uid }));
  assert.equal(JSON.stringify(game), before);
  game.players[0].actions = 1;
  applyAction(game, 0, { type: 'playCard', uid: card.uid });
  assert.equal(game.players[0].actions, 8, '기본 1회 + 왕관 2회 + 에코 1회');
});

test('천상의 대장간: 구매만 영구 강화, 기본 공급·무료 획득 제외, 정리 후 유지', () => {
  const game = gameWith(['celestial_forge']);
  addMarketPile(game, 'n_briefing');
  game.phase = 'buy';
  game.players[0].coins = 30;
  game.players[0].buys = 3;
  applyAction(game, 0, { type: 'buy', cardId: 'n_briefing' });
  applyAction(game, 0, { type: 'buy', cardId: 'rifle' });
  const upgraded = game.players[0].discard.find((c) => c.cardId === 'n_briefing');
  assert.equal(upgraded.upgraded, true);
  assert.equal(upgraded.tempUpgraded, undefined);
  assert.equal(game.players[0].discard.find((c) => c.cardId === 'rifle').upgraded, false);
  assert.equal(game.turnState.starsSpent, 0);
  runEffects(game, { playerIndex: 0, cardUid: '' }, [{ op: 'gainCard', cardId: 'n_briefing', to: 'hand' }]);
  assert.equal(game.players[0].hand.find((c) => c.cardId === 'n_briefing').upgraded, false);
  passTurn(game);
  assert.equal(upgraded.upgraded, true);
});

test('5스테이지 진행: 보상 4개 누적·캐릭터 교체·최종 보상 없음', () => {
  const campaign = wonCampaign(56);
  for (let stage = 0; stage < 4; stage++) {
    assert.equal(campaign.status, 'stageWon');
    assert.equal(campaign.augmentChoices.length, 3);
    applyCampaignAction(campaign, { type: 'chooseAugment', augmentId: campaign.augmentChoices[0] });
    applyCampaignAction(campaign, { type: 'nextStage' });
    const characterId = stage % 2 ? 'hayun' : 'echo';
    applyCampaignAction(campaign, { type: 'selectCharacter', characterId });
    applyCampaignAction(campaign, { type: 'draft', cardIds: getCandidates(characterId).slice(0, 4) });
    assert.equal(campaign.match.game.players[0].augmentIds.length, stage + 1);
    campaign.match.game.phase = 'gameOver';
    campaign.match.game.winner = 0;
    settle(campaign);
  }
  assert.equal(campaign.status, 'cleared');
  assert.equal(campaign.history.length, 5);
  assert.equal(new Set(campaign.augments).size, 4);
  assert.deepEqual(campaign.augmentChoices, []);
});

test('나머지 3성: 거신·서고·금고 효과와 보스 격리', () => {
  const game = gameWith(['titan_heart', 'infinite_library', 'imperial_treasury']);
  const me = game.players[0];
  assert.equal(me.maxHp, 80);
  assert.equal(me.hp, 80);
  assert.equal(me.hand.length, 7);
  assert.equal(me.actions, 3);
  assert.equal(me.coins, 3);
  assert.equal(me.buys, 2);
  assert.equal(me.defense, 4);
  passTurn(game);
  const boss = game.players[1];
  assert.equal(boss.coins, 0);
  assert.equal(boss.actions, 1);
  assert.equal(boss.buys, 1);
  passTurn(game);
  assert.equal(me.hand.length, 7);
  assert.equal(me.defense, 4);
});

test('모든 증강은 AI 대전·JSON 왕복 상태에서도 조작 가능하다', () => {
  for (const augment of AUGMENTS) {
    const game = JSON.parse(JSON.stringify(gameWith([augment.id])));
    for (let step = 0; step < 300 && game.turn <= 6 && game.phase !== 'gameOver'; step++) {
      const actor = game.pending ? game.pending.playerIndex : game.activeIndex;
      applyAction(game, actor, chooseAiAction(game, actor));
    }
    assert.ok(game.turn > 6 || game.phase === 'gameOver', augment.id);
  }
});
