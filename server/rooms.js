// 방 관리. 네트워크와 분리된 순수 로직이라 테스트하기 쉽다.
import { randomInt, randomUUID } from 'node:crypto';

import {
  applyMatchAction,
  createMatch,
  getCandidates,
  allCharacterIds,
  getCampaign,
  createCampaign,
  applyCampaignAction,
  applyAction,
  settle,
} from '../engine/index.js';
import { chooseSmartAction } from '../engine/aiSmart.js';
import { DEFAULT_AI_SPEED, getAiSpeed } from '../engine/aiSpeed.js';

/** @typedef {import('../engine/match.js').MatchState} MatchState */

/**
 * @typedef {{
 *  name: string, token: string|null, connected: boolean, isAi: boolean
 * }} Seat
 */

/**
 * @typedef {{
 *  code: string, match: MatchState|null, seats: [Seat|null, Seat|null],
 *  vsAi: boolean, createdAt: number, lastActivity: number,
 *  campaignId: string|null, campaign: any|null, aiSpeed: string
 * }} Room
 */

/** 방 코드 길이 */
const CODE_LENGTH = 4;
/** 방 코드에 쓰는 글자(헷갈리는 I, O 제외) */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
/** AI 가 고를 수 있는 캐릭터 */
/** 드래프트에서 고르는 카드 종류 수 */
const DRAFT_SIZE = 4;
/** AI 를 한 번에 최대 몇 번까지 진행할지(무한루프 방지) */
const MAX_AI_STEPS = 500;
/** 마지막 활동 후 이 시간이 지나면 방을 지운다 */
const ROOM_TTL_MS = 2 * 60 * 60 * 1000;

/**
 * 배열에서 무작위로 하나를 고른다.
 * @template T
 * @param {T[]} items
 * @returns {T}
 */
function pickRandom(items) {
  return items[randomInt(items.length)];
}

/**
 * 배열을 무작위로 섞은 새 배열을 돌려준다.
 * @template T
 * @param {T[]} items
 * @returns {T[]}
 */
function shuffled(items) {
  const copy = items.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * 방 관리자. 방 목록은 메모리에만 둔다.
 */
export class RoomManager {
  constructor({ deferAi = false } = {}) {
    this.deferAi = deferAi;
    /** @type {Map<string, Room>} */
    this.rooms = new Map();
  }

  /**
   * 새 방을 만든다. vsAi 면 1번 자리에 AI 를 앉힌다.
   * campaignId 를 주면 모험 모드 방(1번 자리는 보스 AI)이 된다.
   * @param {{ vsAi?: boolean, campaignId?: string|null, aiSpeed?: string }} [opts]
   * @returns {Room}
   */
  createRoom({ vsAi = false, campaignId = null, aiSpeed = DEFAULT_AI_SPEED } = {}) {
    if (campaignId) getCampaign(campaignId);
    getAiSpeed(aiSpeed);
    const now = Date.now();
    /** @type {Room} */
    const room = {
      code: this.#newCode(),
      match: null,
      seats: [null, null],
      vsAi: Boolean(vsAi) || Boolean(campaignId),
      createdAt: now,
      lastActivity: now,
      campaignId: campaignId ?? null,
      campaign: null,
      aiSpeed,
    };
    if (room.vsAi) {
      room.seats[1] = { name: 'AI', token: null, connected: true, isAi: true };
    }
    this.rooms.set(room.code, room);
    return room;
  }

  /**
   * 방 코드로 빈 자리에 들어간다.
   * @param {string} code
   * @param {string} name
   * @returns {{ room: Room, you: number, token: string }}
   */
  join(code, name) {
    const room = this.#get(code);
    const you = room.seats.findIndex((seat) => seat === null);
    if (you < 0) throw new Error('방이 가득 찼습니다');
    const token = randomUUID();
    room.seats[you] = { name: String(name ?? ''), token, connected: true, isAi: false };
    this.#touch(room);
    this.#maybeStart(room);
    return { room, you, token };
  }

  /**
   * 예전 token 으로 같은 자리에 다시 앉는다.
   * @param {string} code
   * @param {string} token
   * @returns {{ room: Room, you: number }}
   */
  rejoin(code, token) {
    const room = this.#get(code);
    const you = room.seats.findIndex((seat) => seat !== null && seat.token === token);
    if (you < 0) throw new Error('다시 들어갈 수 없습니다');
    const seat = /** @type {Seat} */ (room.seats[you]);
    seat.connected = true;
    this.#touch(room);
    return { room, you };
  }

  /**
   * 경기 조작을 적용하고, 이어서 AI 차례를 진행한다.
   * @param {string} code
   * @param {number} you
   * @param {any} action
   * @returns {Room}
   */
  act(code, you, action) {
    const room = this.#get(code);
    if (room.campaign) {
      if (you !== 0) throw new Error('모험 모드에서는 조작할 수 없습니다');
      applyCampaignAction(room.campaign, action);
      room.match = room.campaign.match;
      this.runAi(room);
      this.#touch(room);
      return room;
    }
    if (!room.match) throw new Error('아직 경기가 시작되지 않았습니다');
    applyMatchAction(room.match, you, action);
    this.#touch(room);
    this.runAi(room);
    return room;
  }

  /**
   * AI 자리가 할 일이 있는 동안 반복해서 진행한다.
   * @param {Room} room
   * @returns {void}
   */
  runAi(room) {
    for (let step = 0; step < MAX_AI_STEPS; step++) {
      if (this.deferAi && room.match?.stage === 'playing') return;
      if (!this.stepAi(room)) return;
    }
  }

  /** 실제 조작을 하나만 적용한다. 모험에서도 같은 속도 제어를 사용한다. */
  stepAi(room) {
    const aiIndex = room.seats.findIndex((seat) => seat !== null && seat.isAi);
    if (aiIndex < 0) return false;
    const match = room.match;
    if (!match) return false;

    if (match.stage === 'select') {
      if (match.picks[aiIndex].characterId !== null) return false;
      applyMatchAction(match, aiIndex, {
        type: 'selectCharacter',
        characterId: pickRandom(allCharacterIds()),
      });
      return true;
    }

    if (match.stage === 'draft') {
      if (match.picks[aiIndex].cardIds !== null) return false;
      const candidates = getCandidates(match.picks[aiIndex].characterId);
      applyMatchAction(match, aiIndex, {
        type: 'draft',
        cardIds: shuffled(candidates).slice(0, DRAFT_SIZE),
      });
      return true;
    }

    if (match.stage === 'playing' && match.game) {
      const game = match.game;
      const pending = game.pending;
      const isAiTurn = pending
        ? pending.playerIndex === aiIndex
        : game.activeIndex === aiIndex;
      if (!isAiTurn) return false;
      const action = chooseSmartAction(game, aiIndex);
      if (!action) return false;
      if (room.campaign) {
        applyAction(game, aiIndex, action);
        settle(room.campaign);
      } else {
        applyMatchAction(match, aiIndex, { type: 'game', action });
      }
      this.#touch(room);
      return true;
    }

    return false;
  }

  /**
   * 마지막 활동이 오래된 방을 지운다.
   * @param {number} [now]
   * @returns {string[]} 지운 방 코드
   */
  sweep(now = Date.now()) {
    const removed = [];
    for (const [code, room] of this.rooms) {
      if (now - room.lastActivity > ROOM_TTL_MS) {
        this.rooms.delete(code);
        removed.push(code);
      }
    }
    return removed;
  }

  /**
   * 방을 찾는다. 없으면 Error.
   * @param {string} code
   * @returns {Room}
   */
  #get(code) {
    const room = this.rooms.get(String(code ?? '').toUpperCase());
    if (!room) throw new Error('방을 찾을 수 없습니다');
    return room;
  }

  /**
   * 두 자리가 다 찼고 아직 경기가 없으면 경기를 만든다.
   * @param {Room} room
   * @returns {void}
   */
  #maybeStart(room) {
    if (room.match) return;
    if (room.seats.some((seat) => seat === null)) return;
    if (room.campaignId) {
      room.campaign = createCampaign({
        seed: randomInt(2 ** 31),
        campaignId: room.campaignId,
        playerName: /** @type {Seat} */ (room.seats[0]).name,
      });
      room.match = room.campaign.match;
      return;
    }
    room.match = createMatch({
      seed: randomInt(2 ** 31),
      players: room.seats.map((seat, i) => ({
        id: `p${i}`,
        name: /** @type {Seat} */ (seat).name,
      })),
    });
  }

  /**
   * 마지막 활동 시각을 갱신한다.
   * @param {Room} room
   * @returns {void}
   */
  #touch(room) {
    room.lastActivity = Date.now();
  }

  /**
   * 겹치지 않는 방 코드를 만든다.
   * @returns {string}
   */
  #newCode() {
    for (;;) {
      let code = '';
      for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
      if (!this.rooms.has(code)) return code;
    }
  }
}
