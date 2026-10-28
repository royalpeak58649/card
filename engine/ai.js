import { getCardDef } from './cards/registry.js';
import { getPurchasePrice } from './state.js';

/** @typedef {import('./state.js').GameState} GameState */
/** @typedef {import('./state.js').CardInstance} CardInstance */
/** @typedef {import('./turn.js').Action} Action */

/** 영구 강화 비용(별) */
const PERM_UPGRADE_COST = 4;
/** 영구 강화를 고려하는 최소 별 */
const PERM_UPGRADE_MIN_STARS = 4;
/** 무기 비율이 이보다 낮으면 무기를 산다 */
const LOW_WEAPON_RATIO = 0.4;
/** 무기 비율이 이보다 높으면 재화를 산다 */
const HIGH_WEAPON_RATIO = 0.6;
/** 무기 부족 시 무기 점수 보정 */
const WEAPON_BONUS = 15;
/** 재화 과다 시 재화 점수 보정 */
const MONEY_BONUS = 15;
/** 카드 종류별 기본 점수 */
const TYPE_SCORE = { weapon: 3, money: 2, action: 1 };
/** 제거 우선순위(앞일수록 먼저 제거) */
const TRASH_PRIORITY = ['stone', 'pistol'];

/**
 * 손패에서 uid 로 카드를 찾는다.
 * @param {GameState} game
 * @param {number} playerIndex
 * @param {string} uid
 * @returns {CardInstance|undefined}
 */
function findInHand(game, playerIndex, uid) {
  return game.players[playerIndex].hand.find((c) => c.uid === uid);
}

/**
 * 선택 항목(uid 또는 cardId)을 cardId 로 바꾼다.
 * @param {GameState} game
 * @param {number} playerIndex
 * @param {string} item
 * @returns {string|null}
 */
function toCardId(game, playerIndex, item) {
  if (Object.prototype.hasOwnProperty.call(game.market, item)) return item;
  const card = findInHand(game, playerIndex, item);
  return card ? card.cardId : null;
}

/**
 * 강화 가능한 카드인지 검사한다.
 * @param {CardInstance} card
 * @returns {boolean}
 */
function canUpgrade(card) {
  const def = getCardDef(card.cardId);
  return def.basic !== true && Boolean(def.upgradedEffects) && card.upgraded !== true;
}

/**
 * 선택 대기 중일 때의 조작을 고른다.
 * @param {GameState} game
 * @param {number} playerIndex
 * @returns {Action}
 */
function choosePending(game, playerIndex) {
  const pending = game.pending;
  const options = pending.options;
  const min = pending.min;
  const max = pending.max;
  const kind = pending.kind;

  /** @param {string[]} selection */
  const choose = (selection) => ({ type: 'choose', selection });

  if (kind.includes('trash')) {
    const ranked = options
      .map((item) => ({ item, cardId: toCardId(game, playerIndex, item) }))
      .filter((entry) => entry.cardId !== null)
      .sort((a, b) => {
        const ra = TRASH_PRIORITY.indexOf(a.cardId);
        const rb = TRASH_PRIORITY.indexOf(b.cardId);
        const pa = ra < 0 ? TRASH_PRIORITY.length : ra;
        const pb = rb < 0 ? TRASH_PRIORITY.length : rb;
        return pa - pb;
      });
    const wanted = ranked.slice(0, max).map((entry) => entry.item);
    if (wanted.length >= min) return choose(wanted);
    return choose(options.slice(0, min));
  }

  if (kind === 'gainFromMarket') {
    let best = null;
    let bestCost = -1;
    for (const cardId of options) {
      const cost = getCardDef(cardId).cost;
      if (cost > bestCost) {
        best = cardId;
        bestCost = cost;
      }
    }
    return choose(best === null ? [] : [best]);
  }

  if (kind === 'exchangeForWeapon') {
    const preferred = options.find((item) => {
      const cardId = toCardId(game, playerIndex, item);
      return cardId === 'stone' || cardId === 'silver';
    });
    return choose(preferred === undefined ? [] : [preferred]);
  }

  if (kind === 'exchangeForWeaponPlace') {
    return choose(options.includes('trash') ? ['trash'] : options.slice(0, min));
  }

  if (kind === 'reorderTop') {
    return choose(options.slice());
  }

  const count = min > 0 ? min : Math.min(max, 1);
  return choose(options.slice(0, count));
}

/**
 * 행동단계의 조작을 고른다.
 * @param {GameState} game
 * @param {number} playerIndex
 * @returns {Action}
 */
function chooseActionPhase(game, playerIndex) {
  const player = game.players[playerIndex];

  if (player.stars >= PERM_UPGRADE_MIN_STARS) {
    const candidates = player.hand.filter(canUpgrade);
    if (candidates.length > 0) {
      let best = candidates[0];
      for (const card of candidates) {
        if (getCardDef(card.cardId).cost > getCardDef(best.cardId).cost) best = card;
      }
      return { type: 'upgrade', uid: best.uid, mode: 'perm' };
    }
  }

  const playable = player.hand.filter((card) => {
    const def = getCardDef(card.cardId);
    if (def.type !== 'action') return false;
    const actionCost = def.actionCost ?? 0;
    return actionCost === 0 || player.actions >= actionCost;
  });
  if (playable.length > 0) {
    // 행동력을 쓰지 않는 카드를 먼저 낸다.
    const free = playable.find((card) => (getCardDef(card.cardId).actionCost ?? 0) === 0);
    return { type: 'playCard', uid: (free ?? playable[0]).uid };
  }

  return { type: 'endPhase' };
}

/**
 * 구매단계의 조작을 고른다.
 * @param {GameState} game
 * @param {number} playerIndex
 * @returns {Action}
 */
function chooseBuyPhase(game, playerIndex) {
  const player = game.players[playerIndex];

  const moneyInHand = player.hand.some((card) => getCardDef(card.cardId).type === 'money');
  if (moneyInHand) return { type: 'playAllMoney' };

  if (player.buys < 1) return { type: 'endPhase' };

  const allCards = [...player.drawPile, ...player.hand, ...player.discard, ...player.inPlay];
  const weaponRatio = allCards.length === 0
    ? 0
    : allCards.filter((card) => getCardDef(card.cardId).type === 'weapon').length / allCards.length;

  let best = null;
  let bestScore = -Infinity;
  for (const cardId of Object.keys(game.market)) {
    const slot = game.market[cardId];
    if (!slot || slot.count <= 0) continue;
    const def = getCardDef(cardId);
    // 돌·권총(0원)은 사지 않는다.
    if (def.cost <= 0) continue;
    const price = getPurchasePrice(game, cardId, playerIndex);
    if (price > player.coins) continue;

    let score = price * 10 + (TYPE_SCORE[def.type] ?? 0);
    if (def.type === 'weapon' && weaponRatio < LOW_WEAPON_RATIO) score += WEAPON_BONUS;
    if (def.type === 'money' && weaponRatio > HIGH_WEAPON_RATIO) score += MONEY_BONUS;
    if (score > bestScore) {
      best = cardId;
      bestScore = score;
    }
  }

  if (best === null) return { type: 'endPhase' };
  return { type: 'buy', cardId: best };
}

/**
 * 공격단계의 조작을 고른다.
 * @param {GameState} game
 * @param {number} playerIndex
 * @returns {Action}
 */
function chooseAttackPhase(game, playerIndex) {
  const player = game.players[playerIndex];
  const weapon = player.hand.find((card) => getCardDef(card.cardId).type === 'weapon');
  if (weapon) return { type: 'playCard', uid: weapon.uid };
  return { type: 'endPhase' };
}

/**
 * 다음에 할 조작 하나를 고른다. 그 시점에 합법적인 조작만 돌려준다.
 * @param {GameState} game
 * @param {number} playerIndex
 * @returns {Action|null} 차례가 아니고 선택 대기 중도 아니면 null
 */
export function chooseAiAction(game, playerIndex) {
  if (!game || game.phase === 'gameOver' || game.phase === 'setup') return null;

  if (game.pending) {
    if (game.pending.playerIndex !== playerIndex) return null;
    return choosePending(game, playerIndex);
  }

  if (playerIndex !== game.activeIndex) return null;

  if (game.phase === 'action') return chooseActionPhase(game, playerIndex);
  if (game.phase === 'buy') return chooseBuyPhase(game, playerIndex);
  if (game.phase === 'attack') return chooseAttackPhase(game, playerIndex);
  return null;
}
