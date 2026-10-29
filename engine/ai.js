import { getCardDef } from './cards/registry.js';
import { getPurchasePrice } from './state.js';
import { getCharacter, getFaction } from './characters.js';
import { abilityMaxUses, canBuyCards } from './turn.js';

/**
 * 지금 발동형 능력을 쓸 수 있는지(횟수·차례 조건).
 * @param {GameState} game
 * @param {number} playerIndex
 * @returns {any|null} 쓸 수 있으면 능력 정의, 아니면 null
 */
function usableAbility(game, playerIndex) {
  const player = game.players[playerIndex];
  if (!player.characterId) return null;
  const ability = getCharacter(player.characterId).ability?.activeAbility;
  if (!ability) return null;
  if ((player.abilityUses ?? 0) >= abilityMaxUses(ability)) return null;
  if (ability.minOwnTurn !== undefined && (player.turnsTaken ?? 0) < ability.minOwnTurn) return null;
  if (game.turnState?.abilityActivated === true) return null;
  return ability;
}

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
/** 내 진영·캐릭터 카드 구매 보정 */
const OWN_POOL_BONUS = 12;

/**
 * 효과 목록(중첩 if 포함)에 그 op 가 있는지.
 * @param {any[]} effects
 * @param {string} op
 * @returns {boolean}
 */
function hasOp(effects, op) {
  for (const effect of effects ?? []) {
    if (effect.op === op) return true;
    if (effect.op === 'if' && (hasOp(effect.then, op) || hasOp(effect.else, op))) return true;
  }
  return false;
}

/**
 * 그 플레이어의 진영 카드 + 캐릭터 카드 id 목록.
 * @param {GameState} game
 * @param {number} playerIndex
 * @returns {string[]}
 */
function ownPool(game, playerIndex) {
  const characterId = game.players[playerIndex].characterId;
  if (!characterId) return [];
  const character = getCharacter(characterId);
  return [...getFaction(character.factionId).cardIds, ...character.cardIds];
}

/**
 * 행동카드를 내는 순서 점수(클수록 먼저). 행동력을 주는 카드 → 카드를 뽑는 카드 → 나머지,
 * "이번 차례 낸 행동카드 수"에 비례하는 카드는 마지막.
 * @param {CardInstance} card
 * @returns {number}
 */
function actionOrder(card) {
  const def = getCardDef(card.cardId);
  const effects = card.upgraded && def.upgradedEffects ? def.upgradedEffects : def.effects;
  let score = 0;
  if (hasOp(effects, 'gainActions')) score += 100;
  if (hasOp(effects, 'draw')) score += 50;
  if ((def.actionCost ?? 0) === 0) score += 10;
  if (hasOp(effects, 'gainCoinsPerStat') || JSON.stringify(effects).includes('"perAction"')
    || JSON.stringify(effects).includes('"actionsPlayed"')) score -= 80;
  return score;
}

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

  const character = player.characterId ? getCharacter(player.characterId) : null;
  const permCost = character?.ability?.permUpgradeCost ?? PERM_UPGRADE_COST;
  if (player.stars >= Math.min(PERM_UPGRADE_MIN_STARS, permCost)) {
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
  // 별이 2개 이상 남으면 손패의 강화 가능한 카드를 일시 강화한다(한 차례 3장까지).
  if (player.stars >= 2 && (game.turnState?.tempUpgrades ?? 0) < 3) {
    const candidates = player.hand.filter(canUpgrade);
    if (candidates.length > 0) {
      let best = candidates[0];
      for (const card of candidates) {
        if (getCardDef(card.cardId).cost > getCardDef(best.cardId).cost) best = card;
      }
      return { type: 'upgrade', uid: best.uid, mode: 'temp' };
    }
  }

  // 발동형 능력: 피해를 주는 행동카드를 낼 수 있으면 먼저 발동한다.
  const ability = usableAbility(game, playerIndex);
  if (ability && JSON.stringify(ability.effects).includes('actionDamageBonus')) {
    const damageCards = playable.filter((card) => getCardDef(card.cardId).dealsDamage === true);
    if (damageCards.length >= 2) return { type: 'activateAbility' };
  }
  if (playable.length > 0) {
    // 행동력을 주는 카드 먼저, 낸 행동카드 수에 비례하는 카드는 마지막에.
    let best = playable[0];
    for (const card of playable) if (actionOrder(card) > actionOrder(best)) best = card;
    // 행동력을 소모하는 카드를 냈을 때 행동력이 바닥나면 그 뒤 카드를 못 내므로 순서가 중요하다.
    return { type: 'playCard', uid: best.uid };
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
  // 구매할 수 없는 플레이어(모험 모드 보스)는 구매단계를 넘긴다.
  if (!canBuyCards(game, playerIndex)) return { type: 'endPhase' };

  const moneyInHand = player.hand.some((card) => getCardDef(card.cardId).type === 'money');
  if (moneyInHand) return { type: 'playAllMoney' };

  // 빚: 원이 있으면 먼저 갚고, 다 못 갚았으면(채무 동결이 없는 한) 살 수 없으니 넘어간다.
  const ignoreDebt = (game.turnState?.mods?.ignoreDebt ?? 0) > 0;
  if ((player.debt ?? 0) > 0 && !ignoreDebt) {
    if (player.coins > 0) return { type: 'payDebt' };
    return { type: 'endPhase' };
  }

  if (player.buys < 1) return { type: 'endPhase' };

  const allCards = [...player.drawPile, ...player.hand, ...player.discard, ...player.inPlay];
  const weaponRatio = allCards.length === 0
    ? 0
    : allCards.filter((card) => getCardDef(card.cardId).type === 'weapon').length / allCards.length;

  // 하윤 같은 '첫 무기 할인' 능력: 할인을 받아야 살 수 있는 비싼 무기가 있으면 발동한다.
  const discountAbility = usableAbility(game, playerIndex);
  if (discountAbility && JSON.stringify(discountAbility.effects).includes('firstWeaponDiscount')) {
    const boughtWeapon = (game.turnState?.bought ?? []).some((id) => getCardDef(id).type === 'weapon');
    const target = !boughtWeapon && Object.keys(game.market).some((id) => {
      const def = getCardDef(id);
      if (def.type !== 'weapon' || game.market[id].count <= 0 || def.cost < 5) return false;
      const price = getPurchasePrice(game, id, playerIndex);
      return price > player.coins && price - 1 <= player.coins;
    });
    if (target) return { type: 'activateAbility' };
  }

  const pool = ownPool(game, playerIndex);
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
    if (pool.includes(cardId)) score += OWN_POOL_BONUS;
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
