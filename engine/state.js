import './cards/basic.js';
import { BASIC_PILE_SIZES } from './cards/basic.js';
import { getCardDef } from './cards/registry.js';
import { randomInt, shuffleInPlace } from './rng.js';

/** @typedef {{ uid: string, cardId: string, upgraded: boolean }} CardInstance */
/** @typedef {{
 *  id: string, name: string, maxHp: number, hp: number, stars: number,
 *  drawPile: CardInstance[], hand: CardInstance[], discard: CardInstance[],
 *  inPlay: CardInstance[], actions: number, buys: number, coins: number
 * }} PlayerState */
/** @typedef {{
 *  seed: number, rngState: number, nextUid: number, turn: number,
 *  phase: string, activeIndex: number, firstPlayerIndex: number,
 *  winner: number|null, players: PlayerState[],
 *  market: Record<string, { count: number, bought: number }>,
 *  trash: CardInstance[], log: string[],
 *  pending: import('./choices.js').PendingChoice|null
 * }} GameState */

/**
 * 카드 인스턴스를 만든다.
 * @param {GameState} game
 * @param {string} cardId
 * @returns {CardInstance}
 */
export function createCardInstance(game, cardId) {
  return { uid: 'c' + game.nextUid++, cardId, upgraded: false };
}

/**
 * 새 게임 상태를 만든다.
 * @param {{ seed: number, players: { id: string, name: string, maxHp: number }[] }} opts
 * @returns {GameState}
 */
export function createGame({ seed, players }) {
  if (!Array.isArray(players) || players.length !== 2) {
    throw new Error('플레이어는 정확히 2명이어야 합니다');
  }

  /** @type {GameState} */
  const game = {
    seed,
    rngState: seed >>> 0,
    nextUid: 1,
    turn: 1,
    phase: 'setup',
    activeIndex: 0,
    firstPlayerIndex: 0,
    winner: null,
    players: players.map((p) => ({
      id: p.id,
      name: p.name,
      maxHp: p.maxHp,
      hp: p.maxHp,
      stars: 0,
      drawPile: [],
      hand: [],
      discard: [],
      inPlay: [],
      actions: 0,
      buys: 0,
      coins: 0,
    })),
    market: {},
    trash: [],
    log: [],
  };

  for (const cardId of Object.keys(BASIC_PILE_SIZES)) {
    game.market[cardId] = { count: BASIC_PILE_SIZES[cardId], bought: 0 };
  }

  game.firstPlayerIndex = randomInt(game, 2);
  game.activeIndex = game.firstPlayerIndex;

  for (let i = 0; i < game.players.length; i++) {
    const player = game.players[i];
    for (let k = 0; k < 6; k++) player.drawPile.push(createCardInstance(game, 'stone'));
    for (let k = 0; k < 4; k++) player.drawPile.push(createCardInstance(game, 'pistol'));
    shuffleInPlace(game, player.drawPile);
    drawCards(game, i, 5);
  }

  return game;
}

/**
 * drawPile 맨 끝에서 한 장씩 뽑아 손으로 가져온다.
 * drawPile 이 비면 discard 를 섞어 drawPile 로 옮긴 뒤 계속한다.
 * @param {GameState} game
 * @param {number} playerIndex
 * @param {number} n
 * @returns {number} 실제로 뽑은 장수
 */
export function drawCards(game, playerIndex, n) {
  const player = game.players[playerIndex];
  let drawn = 0;
  for (let i = 0; i < n; i++) {
    if (player.drawPile.length === 0) {
      if (player.discard.length === 0) break;
      player.drawPile = shuffleInPlace(game, player.discard);
      player.discard = [];
    }
    player.hand.push(player.drawPile.pop());
    drawn++;
  }
  return drawn;
}

/**
 * 현재 구매가를 계산한다.
 * @param {GameState} game
 * @param {string} cardId
 * @returns {number}
 */
export function getPurchasePrice(game, cardId) {
  const def = getCardDef(cardId);
  const slot = game.market[cardId];
  if (!slot) throw new Error(`시장에 없는 카드: ${cardId}`);
  let price = def.cost;
  if (def.surchargeFirst !== undefined && slot.bought < def.surchargeFirst) {
    price += 1;
  }
  return price;
}
