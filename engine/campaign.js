import './cards/basic.js';
import './cards/section8.js';
import './cards/neutral.js';
import { NEUTRAL_CARD_IDS } from './cards/neutral.js';
import { allCharacterIds, getCharacter } from './characters.js';
import { getCandidates } from './match.js';
import { randomInt, shuffleInPlace } from './rng.js';
import { addMarketPile, createGame } from './state.js';
import { applyAction, startGame } from './turn.js';
import { viewFor } from './view.js';

/** @typedef {import('./match.js').MatchState} MatchState */
/** @typedef {import('./state.js').GameState} GameState */
/** @typedef {{ name: string, bossId: string, intro: string }} CampaignStage */
/** @typedef {{ id: string, name: string, description: string, stages: CampaignStage[] }} CampaignDef */
/** @typedef {{
 *  campaignId: string, seed: number, rngState: number, stageIndex: number,
 *  status: string, augments: any[], history: any[], playerName: string,
 *  match: MatchState
 * }} CampaignState */

/** 경기 시작 시 공개되는 중립 카드 수 */
const NEUTRAL_SEED_COUNT = 2;
/** 드래프트에서 고르는 카드 종류 수 */
const DRAFT_SIZE = 4;
/** 카드 더미 기본 장수 */
const PILE_SIZE = 8;
/** 보스 차례를 진행하는 최대 조작 수 */
const MAX_ENEMY_ACTIONS = 3000;

/** @type {Record<string, CampaignDef>} */
const campaigns = {};

/**
 * 모험(캠페인) 정의를 등록한다. 같은 id 가 이미 있으면 Error.
 * @param {CampaignDef} def
 * @returns {void}
 */
export function registerCampaign(def) {
  if (!def || typeof def !== 'object') throw new Error('잘못된 캠페인 정의입니다');
  if (typeof def.id !== 'string' || def.id === '') throw new Error('캠페인 id 가 필요합니다');
  if (Object.prototype.hasOwnProperty.call(campaigns, def.id)) {
    throw new Error(`이미 등록된 캠페인: ${def.id}`);
  }
  if (!Array.isArray(def.stages) || def.stages.length === 0) {
    throw new Error(`캠페인 스테이지가 없습니다: ${def.id}`);
  }
  for (const stage of def.stages) {
    // 없는 캐릭터면 getCharacter 가 Error 를 던진다.
    getCharacter(stage.bossId);
  }
  campaigns[def.id] = {
    id: def.id,
    name: def.name ?? def.id,
    description: def.description ?? '',
    stages: def.stages.map((s) => ({
      name: s.name ?? '',
      bossId: s.bossId,
      intro: s.intro ?? '',
    })),
  };
}

/**
 * @param {string} id
 * @returns {CampaignDef}
 */
export function getCampaign(id) {
  if (!Object.prototype.hasOwnProperty.call(campaigns, id)) {
    throw new Error(`알 수 없는 캠페인: ${id}`);
  }
  return campaigns[id];
}

/**
 * 등록된 모든 캠페인 id.
 * @returns {string[]}
 */
export function allCampaignIds() {
  return Object.keys(campaigns);
}

/**
 * 스테이지 경기 상태를 만든다. 보스는 1번 자리에서 캐릭터 정의로 만들어진다.
 * @param {CampaignState} campaign
 * @returns {MatchState}
 */
function createStageMatch(campaign) {
  const def = getCampaign(campaign.campaignId);
  const stage = def.stages[campaign.stageIndex];
  const boss = getCharacter(stage.bossId);

  /** @type {MatchState} */
  const match = {
    seed: randomInt(campaign, 2 ** 31),
    rngState: 0,
    stage: 'select',
    players: [
      { id: 'p0', name: campaign.playerName },
      { id: 'p1', name: boss.name },
    ],
    neutralIds: [],
    picks: [
      { characterId: null, cardIds: null },
      { characterId: stage.bossId, cardIds: [] },
    ],
    game: null,
    winner: null,
    draw: false,
  };
  match.rngState = match.seed >>> 0;

  const shuffled = shuffleInPlace(campaign, NEUTRAL_CARD_IDS.slice());
  match.neutralIds = shuffled.slice(0, NEUTRAL_SEED_COUNT);
  return match;
}

/**
 * 새 모험 상태를 만든다.
 * @param {{ seed: number, campaignId: string, playerName?: string }} opts
 * @returns {CampaignState}
 */
export function createCampaign({ seed, campaignId, playerName }) {
  getCampaign(campaignId);
  /** @type {CampaignState} */
  const campaign = {
    campaignId,
    seed,
    rngState: seed >>> 0,
    stageIndex: 0,
    status: 'battle',
    augments: [],
    history: [],
    playerName: playerName ?? '플레이어',
    match: null,
  };
  campaign.match = createStageMatch(campaign);
  return campaign;
}

/**
 * 모험 조작의 단일 입구. 플레이어(0번)만 조작한다.
 * 잘못된 조작은 상태를 바꾸지 않고 Error 를 던진다.
 * @param {CampaignState} campaign
 * @param {{ type: 'selectCharacter', characterId: string }
 *  | { type: 'draft', cardIds: string[] }
 *  | { type: 'game', action: any }
 *  | { type: 'nextStage' }
 *  | { type: 'restart' }} action
 * @returns {void}
 */
export function applyCampaignAction(campaign, action) {
  if (!action || typeof action !== 'object') throw new Error('잘못된 조작입니다');

  switch (action.type) {
    case 'selectCharacter': {
      if (campaign.status !== 'battle') {
        throw new Error(`캐릭터를 고를 수 없는 상태: ${campaign.status}`);
      }
      const match = campaign.match;
      if (match.stage !== 'select') {
        throw new Error(`캐릭터를 고를 수 없는 단계: ${match.stage}`);
      }
      if (!allCharacterIds().includes(action.characterId)) {
        throw new Error(`알 수 없는 캐릭터: ${action.characterId}`);
      }
      match.picks[0].characterId = action.characterId;
      match.stage = 'draft';
      return;
    }
    case 'draft': {
      if (campaign.status !== 'battle') {
        throw new Error(`카드를 고를 수 없는 상태: ${campaign.status}`);
      }
      const match = campaign.match;
      if (match.stage !== 'draft') {
        throw new Error(`카드를 고를 수 없는 단계: ${match.stage}`);
      }
      const characterId = match.picks[0].characterId;
      if (characterId === null) throw new Error('먼저 캐릭터를 골라야 합니다');
      const cardIds = action.cardIds;
      if (!Array.isArray(cardIds) || cardIds.length !== DRAFT_SIZE) {
        throw new Error(`카드는 정확히 ${DRAFT_SIZE}종이어야 합니다`);
      }
      if (new Set(cardIds).size !== cardIds.length) {
        throw new Error('같은 카드를 두 번 고를 수 없습니다');
      }
      const candidates = getCandidates(characterId);
      for (const cardId of cardIds) {
        if (!candidates.includes(cardId)) {
          throw new Error(`후보에 없는 카드: ${cardId}`);
        }
      }

      match.picks[0].cardIds = cardIds.slice();
      startBattle(campaign);
      return;
    }
    case 'game': {
      if (campaign.status !== 'battle') {
        throw new Error(`대전 중이 아닙니다: ${campaign.status}`);
      }
      const match = campaign.match;
      if (match.stage !== 'playing') {
        throw new Error(`대전 중이 아닙니다: ${match.stage}`);
      }
      applyAction(match.game, 0, action.action);
      settle(campaign);
      return;
    }
    case 'nextStage': {
      if (campaign.status !== 'stageWon') {
        throw new Error(`다음 스테이지로 갈 수 없는 상태: ${campaign.status}`);
      }
      campaign.stageIndex += 1;
      campaign.match = createStageMatch(campaign);
      campaign.status = 'battle';
      return;
    }
    case 'restart': {
      if (campaign.status !== 'lost' && campaign.status !== 'cleared') {
        throw new Error(`다시 시작할 수 없는 상태: ${campaign.status}`);
      }
      campaign.stageIndex = 0;
      campaign.augments = [];
      campaign.history = [];
      campaign.match = createStageMatch(campaign);
      campaign.status = 'battle';
      return;
    }
    default:
      throw new Error(`알 수 없는 조작: ${action.type}`);
  }
}

/**
 * 스테이지 대전을 시작한다. 플레이어가 항상 선공이다.
 * @param {CampaignState} campaign
 * @returns {void}
 */
function startBattle(campaign) {
  const match = campaign.match;
  const def = getCampaign(campaign.campaignId);
  const stage = def.stages[campaign.stageIndex];
  const playerCharacterId = match.picks[0].characterId;

  const game = createGame({
    seed: (match.rngState ^ 0x9e3779b9) >>> 0,
    players: [
      { id: 'p0', name: match.players[0].name, characterId: playerCharacterId },
      { id: 'p1', name: match.players[1].name, characterId: stage.bossId },
    ],
  });
  // 모험 모드에서는 플레이어가 항상 선공이다.
  game.firstPlayerIndex = 0;
  game.activeIndex = 0;

  const all = [...match.neutralIds, ...match.picks[0].cardIds];
  const seen = new Set();
  for (const cardId of all) {
    if (seen.has(cardId)) continue;
    seen.add(cardId);
    addMarketPile(game, cardId, PILE_SIZE);
  }

  startGame(game);
  match.game = game;
  match.stage = 'playing';
}

/**
 * 대전이 끝났으면 결과를 반영한다.
 * @param {CampaignState} campaign
 * @returns {void}
 */
export function settle(campaign) {
  const match = campaign.match;
  const game = match.game;
  if (!game || game.phase !== 'gameOver') return;

  match.stage = 'finished';
  match.winner = game.winner;
  match.draw = game.draw === true;

  const result = game.draw === true ? 'draw' : game.winner === 0 ? 'win' : 'lose';
  campaign.history.push({
    stageIndex: campaign.stageIndex,
    characterId: match.picks[0].characterId,
    result,
    turns: game.turn,
  });

  if (result === 'win') {
    const def = getCampaign(campaign.campaignId);
    campaign.status = campaign.stageIndex >= def.stages.length - 1 ? 'cleared' : 'stageWon';
  } else {
    campaign.status = 'lost';
  }
}

/**
 * 보스(1번) 차례를 진행한다. AI 는 인자로 받는다.
 * @param {CampaignState} campaign
 * @param {(game: GameState, playerIndex: number) => any} chooseAction
 * @returns {void}
 */
export function runEnemy(campaign, chooseAction) {
  const match = campaign.match;
  if (!match || match.stage !== 'playing' || !match.game) return;
  const game = match.game;

  for (let i = 0; i < MAX_ENEMY_ACTIONS; i++) {
    if (game.phase === 'gameOver') break;
    const isEnemyTurn = game.pending
      ? game.pending.playerIndex === 1
      : game.activeIndex === 1;
    if (!isEnemyTurn) break;
    const action = chooseAction(game, 1);
    if (!action) break;
    applyAction(game, 1, action);
  }

  settle(campaign);
}

/**
 * 플레이어(0번) 기준으로 보여줄 모험 상태를 만든다.
 * @param {CampaignState} campaign
 * @returns {Record<string, any>}
 */
export function campaignView(campaign) {
  const def = getCampaign(campaign.campaignId);
  const status = campaign.status;
  return {
    campaignId: campaign.campaignId,
    name: def.name,
    description: def.description,
    stageIndex: campaign.stageIndex,
    stageCount: def.stages.length,
    status,
    augments: JSON.parse(JSON.stringify(campaign.augments)),
    history: JSON.parse(JSON.stringify(campaign.history)),
    stages: def.stages.map((stage, i) => {
      const boss = getCharacter(stage.bossId);
      return {
        name: stage.name,
        intro: stage.intro,
        bossId: stage.bossId,
        bossName: boss.name,
        bossMaxHp: boss.maxHp,
        cleared:
          i < campaign.stageIndex ||
          (i === campaign.stageIndex && (status === 'stageWon' || status === 'cleared')),
      };
    }),
    match: viewFor(campaign.match, 0),
  };
}
