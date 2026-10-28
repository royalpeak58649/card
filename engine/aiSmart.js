// 모의 실행(rollout) AI.
// 지금 할 수 있는 조작마다 게임 상태를 복사해 "그 조작 → 남은 차례는 기본 정책" 으로 차례 끝까지 굴려 보고,
// 결과(준 피해, 얻은/버린 카드의 가치, 별, 방어, 빚 ...)를 점수로 매겨 가장 좋은 조작을 고른다.
// 카드별 규칙을 따로 짜지 않아도 행동카드 순서, 능력 발동 시점, 무기 아끼기, 별 사용 여부를 스스로 판단한다.
//
// 참고: 모의 실행은 같은 난수 상태를 쓰므로 이번 차례에 뽑힐 내 카드를 "미리 보는" 셈이다.
// 밸런스 측정에서는 양쪽이 똑같이 이 이점을 가지므로 공정하다.

import { getCardDef } from './cards/registry.js';
import { getCharacter } from './characters.js';
import { maxStarsOf } from './effects.js';
import { getPurchasePrice } from './state.js';
import { applyAction, setAtomic, abilityMaxUses } from './turn.js';
import { chooseAiAction } from './ai.js';
import { cardValue } from './aiValues.js';

/** 평가 가중치. 단위는 "상대 체력 1" */
export const WEIGHTS = {
  damage: 1,
  selfHp: 0.8,
  star: 0.5,
  permUpgrade: 2.5,
  defense: 0.6,
  debt: 0.9,
  oppDebt: 0.9,
  oppStar: 0.5,
  lethal: 25,
  targetWeaponShare: 0.4,
  win: 1000,
};

/** 한 번의 모의 실행에서 허용할 최대 조작 수(무한 반복 방지) */
const MAX_ROLLOUT_STEPS = 300;
/** 한 결정에서 볼 최대 선택지 수 */
const MAX_CANDIDATES = 24;

/**
 * @param {any} game
 * @param {number} p
 * @returns {Record<string, number>} 내 카드(모든 구역) cardId → 장수
 */
function cardCounts(game, p) {
  const player = game.players[p];
  /** @type {Record<string, number>} */
  const counts = {};
  for (const zone of [player.hand, player.drawPile, player.discard, player.inPlay]) {
    for (const card of zone) counts[card.cardId] = (counts[card.cardId] ?? 0) + 1;
  }
  return counts;
}

/**
 * @param {any} game
 * @param {number} p
 * @returns {number} 영구 강화된 내 카드 수
 */
function permUpgrades(game, p) {
  const player = game.players[p];
  let n = 0;
  for (const zone of [player.hand, player.drawPile, player.discard, player.inPlay]) {
    for (const card of zone) if (card.upgraded === true && card.tempUpgraded !== true) n += 1;
  }
  return n;
}

/**
 * 별의 가치: 다음 차례 시작에 +1 이 들어오므로, 최대치-1 을 넘는 별은 버려질 별이라 가치가 없다.
 * @param {number} stars
 * @param {number} max
 * @returns {number}
 */
function starWorth(stars, max) {
  return Math.min(stars, max - 1) * WEIGHTS.star;
}

/**
 * 덱 구성 보정: 무기가 부족하면 무기를, 넘치면 재화를 더 쳐 준다.
 * @param {any} game
 * @param {number} p
 * @param {string} cardId
 * @returns {number}
 */
function compositionFactor(game, p, cardId) {
  const def = getCardDef(cardId);
  const type = def.type;
  const counts = cardCounts(game, p);
  if (type === 'action') {
    // 행동력을 쓰고 돌려주지 않는 카드는 덱에 많을수록 서로 부딪혀 못 쓴다.
    if (!isTerminal(def)) return 1;
    let terminals = 0;
    for (const [id, n] of Object.entries(counts)) if (isTerminal(getCardDef(id))) terminals += n;
    return 1 / (1 + 0.35 * terminals);
  }
  let total = 0;
  let weapons = 0;
  for (const [id, n] of Object.entries(counts)) {
    const t = getCardDef(id).type;
    if (t === 'action') continue;
    total += n;
    if (t === 'weapon') weapons += n;
  }
  const share = total === 0 ? 0 : weapons / total;
  const shift = (WEIGHTS.targetWeaponShare - share) * 2.5;
  const mult = type === 'weapon' ? 1 + shift : 1 - shift;
  return Math.max(0.4, Math.min(1.8, mult));
}

/**
 * 행동력을 쓰고(⚡1 이상) 행동력을 돌려주지 않는 행동카드인가.
 * @param {any} def
 * @returns {boolean}
 */
function isTerminal(def) {
  if (def.type !== 'action' || (def.actionCost ?? 0) < 1) return false;
  return !JSON.stringify(def.effects).includes('"gainActions"');
}

/**
 * 그 카드가 지금 그 플레이어에게 갖는 가치(캐릭터 가치 × 덱 구성 보정).
 * @param {any} game
 * @param {number} p
 * @param {string} cardId
 * @param {Record<string, Record<string, number>>} [values]
 * @returns {number}
 */
export function situationalValue(game, p, cardId, values) {
  const base = cardValue(game.players[p].characterId ?? null, cardId, values);
  return base > 0 ? base * compositionFactor(game, p, cardId) : base;
}

/**
 * 뒤로 갈수록 새 카드의 가치가 떨어진다(남은 경기 동안 몇 번 쓸 수 있는지).
 * @param {any} game
 * @returns {number}
 */
function stageFactor(game) {
  const minHp = Math.min(game.players[0].hp, game.players[1].hp);
  return Math.max(0.15, Math.min(1, minHp / 40));
}

/**
 * 결정 직전(before)과 모의 실행 뒤(after)를 비교한 점수.
 * @param {any} before
 * @param {any} after
 * @param {number} p
 * @param {Record<string, Record<string, number>>} [values]
 * @returns {number}
 */
export function evaluate(before, after, p, values) {
  const o = 1 - p;
  if (after.phase === 'gameOver') {
    if (after.draw === true) return 0;
    return after.winner === p ? WEIGHTS.win : -WEIGHTS.win;
  }
  const me0 = before.players[p];
  const me1 = after.players[p];
  const op0 = before.players[o];
  const op1 = after.players[o];

  let score = 0;
  score += (op0.hp - op1.hp) * WEIGHTS.damage;
  score += (me1.hp - me0.hp) * WEIGHTS.selfHp;
  if (op1.hp <= 0 && op0.hp > 0) score += WEIGHTS.lethal;

  // 얻은 카드는 +가치, 없앤 카드는 -가치(돌·권총처럼 가치가 음수면 없앨수록 이득).
  const factor = stageFactor(before);
  const c0 = cardCounts(before, p);
  const c1 = cardCounts(after, p);
  for (const id of new Set([...Object.keys(c0), ...Object.keys(c1)])) {
    const diff = (c1[id] ?? 0) - (c0[id] ?? 0);
    if (diff === 0) continue;
    const value = situationalValue(before, p, id, values);
    score += diff * value * (diff > 0 ? factor : 1);
  }

  score += (permUpgrades(after, p) - permUpgrades(before, p)) * WEIGHTS.permUpgrade * factor;
  score += starWorth(me1.stars, maxStarsOf(after, p)) - starWorth(me0.stars, maxStarsOf(before, p));
  score -= (op1.stars - op0.stars) * WEIGHTS.oppStar;
  score += ((me1.defense ?? 0) - (me0.defense ?? 0)) * WEIGHTS.defense;
  score -= ((me1.debt ?? 0) - (me0.debt ?? 0)) * WEIGHTS.debt;
  score += ((op1.debt ?? 0) - (op0.debt ?? 0)) * WEIGHTS.oppDebt;
  return score;
}

/**
 * 같은 효과를 내는 카드끼리는 하나만 보도록 묶는 키.
 * @param {any} card
 * @returns {string}
 */
function cardKey(card) {
  return `${card.cardId}${card.upgraded ? '+' : ''}`;
}

/**
 * @param {any} card
 * @returns {boolean}
 */
function canUpgradeCard(card) {
  const def = getCardDef(card.cardId);
  return def.basic !== true && Boolean(def.upgradedEffects) && card.upgraded !== true;
}

/**
 * 지금 쓸 수 있는 발동형 능력이 있는가.
 * @param {any} game
 * @param {number} p
 * @returns {boolean}
 */
function abilityUsable(game, p) {
  const player = game.players[p];
  if (!player.characterId) return false;
  const ability = getCharacter(player.characterId).ability?.activeAbility;
  if (!ability) return false;
  if ((player.abilityUses ?? 0) >= abilityMaxUses(ability)) return false;
  if (ability.minOwnTurn !== undefined && (player.turnsTaken ?? 0) < ability.minOwnTurn) return false;
  return game.turnState?.abilityActivated !== true;
}

/**
 * @param {string[]} items
 * @returns {string[][]}
 */
function permutations(items) {
  if (items.length <= 1) return [items.slice()];
  const out = [];
  items.forEach((item, i) => {
    for (const rest of permutations(items.filter((_, j) => j !== i))) out.push([item, ...rest]);
  });
  return out;
}

/**
 * 선택 대기 중일 때의 후보 선택들.
 * @param {any} game
 * @param {number} p
 * @returns {any[]}
 */
function pendingCandidates(game, p) {
  const pending = game.pending;
  const { options, min, max, kind } = pending;
  /** @type {string[][]} */
  const selections = [];
  const seen = new Set();
  const add = (sel) => {
    if (sel.length < min || sel.length > max) return;
    const key = sel.join(',');
    if (seen.has(key)) return;
    seen.add(key);
    selections.push(sel);
  };

  if (kind === 'reorderTop' && options.length <= 3) {
    for (const perm of permutations(options)) add(perm);
  } else {
    // 같은 종류 카드(uid)는 하나만: 어떤 카드인지 찾아서 묶는다.
    const zones = game.players.flatMap((pl) => [pl.hand, pl.drawPile, pl.discard, pl.inPlay]);
    const keyOf = (opt) => {
      for (const zone of zones) {
        const card = zone.find((c) => c.uid === opt);
        if (card) return cardKey(card);
      }
      return opt;
    };
    const byKey = new Map();
    for (const opt of options) if (!byKey.has(keyOf(opt))) byKey.set(keyOf(opt), opt);
    if (min === 0) add([]);
    if (min <= 1) for (const opt of byKey.values()) add([opt]);
    // 여러 장을 고르는 선택: 기본 정책의 선택과 "고를 수 있는 만큼 전부"
    const fallback = chooseAiAction(game, p);
    if (fallback && fallback.type === 'choose') add(fallback.selection);
    add(options.slice(0, max));
    if (selections.length === 0) add(options.slice(0, min));
  }
  return selections.map((selection) => ({ type: 'choose', selection }));
}

/**
 * 지금 내릴 수 있는 조작 후보들(같은 결과를 낼 조작은 하나만).
 * @param {any} game
 * @param {number} p
 * @returns {any[]}
 */
export function candidates(game, p) {
  if (game.pending) return game.pending.playerIndex === p ? pendingCandidates(game, p) : [];
  if (game.activeIndex !== p || game.phase === 'gameOver') return [];

  const player = game.players[p];
  const out = [{ type: 'endPhase' }];
  const seen = new Set();
  const once = (key, action) => {
    if (seen.has(key)) return;
    seen.add(key);
    out.push(action);
  };

  for (const card of player.hand) {
    const def = getCardDef(card.cardId);
    const key = cardKey(card);
    if (game.phase === 'action' && def.type === 'action') {
      const cost = def.actionCost ?? 0;
      if (cost === 0 || player.actions >= cost) once(`play:${key}`, { type: 'playCard', uid: card.uid });
    }
    if (game.phase === 'buy' && def.type === 'money' && def.basic !== true) {
      once(`play:${key}`, { type: 'playCard', uid: card.uid });
    }
    if (game.phase === 'attack' && def.type === 'weapon') once(`play:${key}`, { type: 'playCard', uid: card.uid });
    if (canUpgradeCard(card) && phaseFits(game.phase, def.type)) {
      if (player.stars >= 1 && (game.turnState?.tempUpgrades ?? 0) < 3) {
        once(`temp:${key}`, { type: 'upgrade', uid: card.uid, mode: 'temp' });
      }
      const permCost = (player.characterId ? getCharacter(player.characterId).ability?.permUpgradeCost : undefined) ?? 4;
      if (player.stars >= permCost) once(`perm:${key}`, { type: 'upgrade', uid: card.uid, mode: 'perm' });
    }
  }

  if (game.phase === 'buy') {
    if (player.hand.some((c) => getCardDef(c.cardId).type === 'money')) out.push({ type: 'playAllMoney' });
    if ((player.debt ?? 0) > 0 && player.coins > 0) out.push({ type: 'payDebt' });
    const blocked = (player.debt ?? 0) > 0 && !((game.turnState?.mods?.ignoreDebt ?? 0) > 0);
    if (player.buys >= 1 && !blocked) {
      for (const cardId of Object.keys(game.market)) {
        if (game.market[cardId].count <= 0) continue;
        if (getPurchasePrice(game, cardId, p) > player.coins) continue;
        out.push({ type: 'buy', cardId });
      }
    }
  }
  if (abilityUsable(game, p)) out.push({ type: 'activateAbility' });
  return out;
}

/**
 * 강화는 그 카드를 쓰는 단계 전후에만 의미가 있으므로, 후보를 줄이기 위해 단계를 맞춘다.
 * @param {string} phase
 * @param {string} type
 * @returns {boolean}
 */
function phaseFits(phase, type) {
  if (type === 'action') return phase === 'action';
  if (type === 'money') return phase === 'action' || phase === 'buy';
  return true; // 무기는 어느 단계에서든 미리 강화해 둘 수 있다
}

/**
 * 모의 실행 안에서 쓰는 빠른 기본 정책: 구매만 카드 가치로 고르고 나머지는 규칙 기반 AI.
 * @param {any} game
 * @param {number} p
 * @param {Record<string, Record<string, number>>} [values]
 * @returns {any}
 */
export function rolloutPolicy(game, p, values) {
  if (!game.pending && game.activeIndex === p && game.phase === 'buy') {
    const player = game.players[p];
    if (player.hand.some((c) => getCardDef(c.cardId).type === 'money')) return { type: 'playAllMoney' };
    const ignoreDebt = (game.turnState?.mods?.ignoreDebt ?? 0) > 0;
    if ((player.debt ?? 0) > 0 && !ignoreDebt) {
      return player.coins > 0 ? { type: 'payDebt' } : { type: 'endPhase' };
    }
    if (player.buys < 1) return { type: 'endPhase' };
    const factor = stageFactor(game);
    let best = null;
    let bestValue = 0.3;
    for (const cardId of Object.keys(game.market)) {
      if (game.market[cardId].count <= 0) continue;
      if (getPurchasePrice(game, cardId, p) > player.coins) continue;
      const value = situationalValue(game, p, cardId, values) * factor;
      if (value > bestValue) {
        best = cardId;
        bestValue = value;
      }
    }
    return best ? { type: 'buy', cardId: best } : { type: 'endPhase' };
  }
  return chooseAiAction(game, p);
}

/**
 * 상태를 복사해 action 을 적용하고, 내 차례가 끝날 때까지 기본 정책으로 굴린다.
 * @param {any} game
 * @param {number} p
 * @param {any} action
 * @param {Record<string, Record<string, number>>} [values]
 * @returns {any|null} 굴린 뒤 상태, 조작이 불가능하면 null
 */
function rollout(game, p, action, values) {
  const copy = JSON.parse(JSON.stringify({ ...game, log: [] }));
  const prev = setAtomic(false);
  try {
    applyAction(copy, p, action);
    for (let step = 0; step < MAX_ROLLOUT_STEPS; step++) {
      if (copy.phase === 'gameOver') break;
      const actor = copy.pending ? copy.pending.playerIndex : copy.activeIndex;
      if (actor !== p) break;
      const next = rolloutPolicy(copy, p, values);
      if (!next) break;
      applyAction(copy, p, next);
    }
    return copy;
  } catch {
    return null;
  } finally {
    setAtomic(prev);
  }
}

/**
 * 모의 실행으로 다음 조작을 고른다.
 * @param {any} game
 * @param {number} p
 * @param {{ values?: Record<string, Record<string, number>> }} [opts]
 * @returns {any|null}
 */
export function chooseSmartAction(game, p, opts = {}) {
  const list = candidates(game, p).slice(0, MAX_CANDIDATES);
  if (list.length === 0) return chooseAiAction(game, p);
  if (list.length === 1) return list[0];

  const before = { ...game, log: [] };
  let best = null;
  let bestScore = -Infinity;
  for (const action of list) {
    const after = rollout(game, p, action, opts.values);
    if (after === null) continue;
    const score = evaluate(before, after, p, opts.values);
    if (score > bestScore) {
      best = action;
      bestScore = score;
    }
  }
  return best ?? chooseAiAction(game, p);
}
