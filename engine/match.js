import './cards/basic.js';
import './cards/section8.js';
import './cards/neutral.js';
import { NEUTRAL_CARD_IDS } from './cards/neutral.js';
import { getCharacter, getFaction } from './characters.js';
import { shuffleInPlace } from './rng.js';
import { addMarketPile, createGame } from './state.js';
import { applyAction, startGame } from './turn.js';

/** @typedef {import('./state.js').GameState} GameState */
/** @typedef {{ id: string, name: string }} MatchPlayer */
/** @typedef {{ characterId: string|null, cardIds: string[]|null }} Pick */
/** @typedef {{
 *  seed: number, rngState: number, stage: string, players: MatchPlayer[],
 *  neutralIds: string[], picks: Pick[], game: GameState|null, winner: number|null,
 *  draw: boolean
 * }} MatchState */

/** 경기 시작 시 공개되는 중립 카드 수 */
const NEUTRAL_SEED_COUNT = 2;
/** 드래프트에서 고르는 카드 종류 수 */
const DRAFT_SIZE = 4;
/** 카드 더미 기본 장수 */
const PILE_SIZE = 8;
/** 두 플레이어가 같은 카드를 골랐을 때의 장수 */
const SHARED_PILE_SIZE = 12;

/**
 * 새 경기 상태를 만든다. 중립 카드 2종을 seed 로 공개한다.
 * @param {{ seed: number, players: MatchPlayer[] }} opts
 * @returns {MatchState}
 */
export function createMatch({ seed, players }) {
  if (!Array.isArray(players) || players.length !== 2) {
    throw new Error('플레이어는 정확히 2명이어야 합니다');
  }

  /** @type {MatchState} */
  const match = {
    seed,
    rngState: seed >>> 0,
    stage: 'select',
    players: players.map((p) => ({ id: p.id, name: p.name })),
    neutralIds: [],
    picks: [
      { characterId: null, cardIds: null },
      { characterId: null, cardIds: null },
    ],
    game: null,
    winner: null,
    draw: false,
  };

  const shuffled = shuffleInPlace(match, NEUTRAL_CARD_IDS.slice());
  match.neutralIds = shuffled.slice(0, NEUTRAL_SEED_COUNT);
  return match;
}

/**
 * 캐릭터가 고를 수 있는 후보 카드 id 목록(진영 카드 5 + 캐릭터 카드 3).
 * @param {string} characterId
 * @returns {string[]}
 */
export function getCandidates(characterId) {
  const character = getCharacter(characterId);
  const faction = getFaction(character.factionId);
  return [...faction.cardIds, ...character.cardIds];
}

/**
 * 경기 조작의 단일 입구. 잘못된 조작은 상태를 바꾸지 않고 Error 를 던진다.
 * @param {MatchState} match
 * @param {number} playerIndex
 * @param {{ type: 'selectCharacter', characterId: string }
 *  | { type: 'draft', cardIds: string[] }
 *  | { type: 'game', action: any }} action
 * @returns {void}
 */
export function applyMatchAction(match, playerIndex, action) {
  if (!action || typeof action !== 'object') throw new Error('잘못된 조작입니다');
  if (playerIndex !== 0 && playerIndex !== 1) {
    throw new Error(`잘못된 플레이어 번호: ${playerIndex}`);
  }

  switch (action.type) {
    case 'selectCharacter': {
      if (match.stage !== 'select') {
        throw new Error(`캐릭터를 고를 수 없는 단계: ${match.stage}`);
      }
      if (match.picks[playerIndex].characterId !== null) {
        throw new Error('이미 캐릭터를 골랐습니다');
      }
      // 없는 캐릭터면 getCharacter 가 Error 를 던진다.
      getCharacter(action.characterId);
      match.picks[playerIndex].characterId = action.characterId;
      if (match.picks.every((p) => p.characterId !== null)) {
        match.stage = 'draft';
      }
      return;
    }
    case 'draft': {
      if (match.stage !== 'draft') {
        throw new Error(`카드를 고를 수 없는 단계: ${match.stage}`);
      }
      const pick = match.picks[playerIndex];
      if (pick.cardIds !== null) throw new Error('이미 카드를 골랐습니다');
      const cardIds = action.cardIds;
      if (!Array.isArray(cardIds) || cardIds.length !== DRAFT_SIZE) {
        throw new Error(`카드는 정확히 ${DRAFT_SIZE}종이어야 합니다`);
      }
      if (new Set(cardIds).size !== cardIds.length) {
        throw new Error('같은 카드를 두 번 고를 수 없습니다');
      }
      const candidates = getCandidates(pick.characterId);
      for (const cardId of cardIds) {
        if (!candidates.includes(cardId)) {
          throw new Error(`후보에 없는 카드: ${cardId}`);
        }
      }
      pick.cardIds = cardIds.slice();
      if (match.picks.every((p) => p.cardIds !== null)) startBattle(match);
      return;
    }
    case 'game': {
      if (match.stage !== 'playing') {
        throw new Error(`대전 중이 아닙니다: ${match.stage}`);
      }
      applyAction(match.game, playerIndex, action.action);
      if (match.game.phase === 'gameOver') {
        match.stage = 'finished';
        match.winner = match.game.winner;
        match.draw = match.game.draw === true;
      }
      return;
    }
    default:
      throw new Error(`알 수 없는 조작: ${action.type}`);
  }
}

/**
 * 대전을 시작한다. 시장에 중립 2종과 두 플레이어가 고른 카드를 추가한다.
 * @param {MatchState} match
 * @returns {void}
 */
function startBattle(match) {
  const game = createGame({
    seed: (match.rngState ^ 0x9e3779b9) >>> 0,
    players: match.players.map((p, i) => ({
      id: p.id,
      name: p.name,
      characterId: match.picks[i].characterId,
    })),
  });

  const chosen = [match.picks[0].cardIds, match.picks[1].cardIds];
  const shared = chosen[0].filter((id) => chosen[1].includes(id));
  const all = [...match.neutralIds, ...chosen[0], ...chosen[1]];
  const seen = new Set();
  for (const cardId of all) {
    if (seen.has(cardId)) continue;
    seen.add(cardId);
    addMarketPile(game, cardId, shared.includes(cardId) ? SHARED_PILE_SIZE : PILE_SIZE);
  }

  startGame(game);
  match.game = game;
  match.stage = 'playing';
}
