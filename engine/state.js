import './cards/basic.js';
import { BASIC_PILE_SIZES } from './cards/basic.js';
import { getCardDef } from './cards/registry.js';
import { getCharacter } from './characters.js';
import { randomInt, shuffleInPlace } from './rng.js';

/** @typedef {{ uid: string, cardId: string, upgraded: boolean }} CardInstance */
/** @typedef {{
 *  id: string, name: string, characterId: string|null, maxHp: number, hp: number,
 *  stars: number,
 *  drawPile: CardInstance[], hand: CardInstance[], discard: CardInstance[],
 *  inPlay: CardInstance[], actions: number, buys: number, coins: number,
 *  debt: number,
 *  defense: number, abilityUsed: boolean, abilityUses: number, turnsTaken: number,
 *  bleed: boolean, augmentIds?: string[]
 * }} PlayerState */
/** @typedef {{
 *  seed: number, rngState: number, nextUid: number, turn: number,
 *  phase: string, activeIndex: number, firstPlayerIndex: number,
 *  winner: number|null, draw: boolean, players: PlayerState[],
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
 * 새 게임 상태를 만든다. characterId 가 있으면 그 캐릭터의 maxHp 를 쓴다.
 * @param {{ seed: number, players: { id: string, name: string, maxHp?: number,
 *   characterId?: string|null }[] }} opts
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
    draw: false,
    players: players.map((p) => {
      const characterId = p.characterId ?? null;
      const maxHp = characterId !== null ? getCharacter(characterId).maxHp : p.maxHp;
      return {
        id: p.id,
        name: p.name,
        characterId,
        maxHp,
        hp: maxHp,
        stars: 0,
        drawPile: [],
        hand: [],
        discard: [],
        inPlay: [],
        actions: 0,
        buys: 0,
        coins: 0,
        debt: 0,
        defense: 0,
        abilityUsed: false,
        abilityUses: 0,
        turnsTaken: 0,
        bleed: false,
      };
    }),
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
    // 캐릭터에 startDeck 이 있으면 그 카드들로 시작 덱을 만든다.
    const startDeck = player.characterId !== null ? getCharacter(player.characterId).startDeck : undefined;
    if (Array.isArray(startDeck)) {
      for (const cardId of startDeck) player.drawPile.push(createCardInstance(game, cardId));
    } else {
      for (let k = 0; k < 7; k++) player.drawPile.push(createCardInstance(game, 'stone'));
      for (let k = 0; k < 3; k++) player.drawPile.push(createCardInstance(game, 'pistol'));
    }
    shuffleInPlace(game, player.drawPile);
    drawCards(game, i, 5);
  }

  return game;
}

/**
 * 시장에 카드 더미를 추가한다.
 * @param {GameState} game
 * @param {string} cardId
 * @param {number} [count]
 * @returns {void}
 */
export function addMarketPile(game, cardId, count = 8) {
  if (Object.prototype.hasOwnProperty.call(game.market, cardId)) {
    throw new Error(`이미 시장에 있는 카드: ${cardId}`);
  }
  // 없는 카드 id 면 getCardDef 가 Error 를 던진다.
  getCardDef(cardId);
  game.market[cardId] = { count, bought: 0 };
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
 * playerIndex 를 주면 그 플레이어가 차례일 때 차례 보정(marketDiscount)과
 * 차례 보정 mods.firstWeaponDiscount(하윤 능력 등)를 적용한다.
 * @param {GameState} game
 * @param {string} cardId
 * @param {number} [playerIndex]
 * @returns {number}
 */
export function getPurchasePrice(game, cardId, playerIndex) {
  const def = getCardDef(cardId);
  const slot = game.market[cardId];
  if (!slot) throw new Error(`시장에 없는 카드: ${cardId}`);
  let price = def.cost;
  if (def.surchargeFirst !== undefined && slot.bought < def.surchargeFirst) {
    price += 1;
  }
  if (playerIndex !== undefined && game.turnState && playerIndex === game.activeIndex) {
    price -= game.turnState.mods?.marketDiscount ?? 0;
    price -= firstWeaponDiscount(game, cardId, playerIndex);
  }
  return Math.max(0, price);
}

/**
 * 캐릭터의 '첫 무기 구매 할인' 값을 구한다.
 * 이번 차례 아직 무기카드를 사지 않았고 대상 카드가 무기일 때만 적용된다.
 * @param {GameState} game
 * @param {string} cardId
 * @param {number} playerIndex
 * @returns {number}
 */
function firstWeaponDiscount(game, cardId, playerIndex) {
  const discount = game.turnState?.mods?.firstWeaponDiscount ?? 0;
  if (discount <= 0) return 0;
  if (getCardDef(cardId).type !== 'weapon') return 0;
  const bought = game.turnState.bought ?? [];
  const boughtWeapon = bought.some((id) => getCardDef(id).type === 'weapon');
  return boughtWeapon ? 0 : discount;
}
