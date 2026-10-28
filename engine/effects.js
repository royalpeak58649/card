import { drawCards, createCardInstance } from './state.js';
import { getCardDef } from './cards/registry.js';
import { getCharacter, getFaction } from './characters.js';
import { requestChoice, registerChoice } from './choices.js';
import { evalCond, getStat } from './conditions.js';
import { shuffleInPlace } from './rng.js';

/** @typedef {{ op: string, n?: number }} Effect */
/** @typedef {{ playerIndex: number, cardUid: string }} EffectContext */
/** @typedef {(game: import('./state.js').GameState, ctx: EffectContext, effect: Effect) => void} OpFn */

/** 별 최대치(캐릭터 ability.maxStars 가 없을 때) */
export const MAX_STARS = 5;

/**
 * 플레이어의 별 최대치. 캐릭터 ability.maxStars 가 숫자면 그 값, 아니면 MAX_STARS.
 * @param {import('./state.js').GameState} game
 * @param {number} playerIndex
 * @returns {number}
 */
export function maxStarsOf(game, playerIndex) {
  const player = game.players[playerIndex];
  const characterId = player?.characterId;
  if (!characterId) return MAX_STARS;
  const character = getCharacter(characterId);
  const maxStars = character.ability?.maxStars;
  if (typeof maxStars === 'number') return maxStars;
  // 캐릭터 정의에 maxStars 가 없으면 진영 정의의 값을 쓴다.
  const factionMax = character.factionId ? getFaction(character.factionId).maxStars : undefined;
  return typeof factionMax === 'number' ? factionMax : MAX_STARS;
}

/** @type {Record<string, OpFn>} */
const ops = {};

/**
 * 효과 op 를 등록한다. 같은 이름이 이미 있으면 Error.
 * @param {string} name
 * @param {OpFn} fn
 * @returns {void}
 */
export function registerOp(name, fn) {
  if (Object.prototype.hasOwnProperty.call(ops, name)) {
    throw new Error(`이미 등록된 효과: ${name}`);
  }
  ops[name] = fn;
}

/**
 * 효과 목록을 순서대로 실행한다. 선택 대기(game.pending)가 생기면
 * 남은 효과를 pending.rest 에 저장하고 즉시 돌아간다.
 * @param {import('./state.js').GameState} game
 * @param {EffectContext} ctx
 * @param {Effect[]} effects
 * @returns {void}
 */
export function runEffects(game, ctx, effects) {
  if (!Array.isArray(effects)) return;
  const queue = effects.slice();
  while (queue.length > 0) {
    const effect = queue.shift();
    const op = effect && effect.op;
    if (op === 'if') {
      // 조건에 맞는 가지를 큐 맨 앞에 끼워 넣는다(재귀 호출하지 않는다).
      const branch = evalCond(game, ctx, effect.cond) ? effect.then : effect.else;
      if (Array.isArray(branch)) queue.unshift(...branch);
      continue;
    }
    if (op === 'repeatPrevAction') {
      // 직전 행동카드의 효과를 큐 맨 앞에 끼워 넣는다(재귀 호출하지 않는다).
      const repeated = prevActionEffects(game);
      if (repeated) queue.unshift(...repeated);
      continue;
    }
    if (!Object.prototype.hasOwnProperty.call(ops, op)) {
      throw new Error(`알 수 없는 효과: ${op}`);
    }
    ops[op](game, ctx, effect);
    if (game.pending) {
      game.pending.rest = queue.concat(game.pending.rest ?? []);
      return;
    }
  }
}

/**
 * 효과 목록 안에(중첩 if 포함) repeatPrevAction 이 있는지 검사한다.
 * @param {Effect[]} effects
 * @returns {boolean}
 */
function containsRepeatPrevAction(effects) {
  if (!Array.isArray(effects)) return false;
  for (const effect of effects) {
    if (!effect) continue;
    if (effect.op === 'repeatPrevAction') return true;
    if (effect.op === 'if') {
      if (containsRepeatPrevAction(effect.then) || containsRepeatPrevAction(effect.else)) return true;
    }
  }
  return false;
}

/**
 * repeatPrevAction 으로 다시 실행할 직전 행동카드의 효과 목록을 구한다.
 * 직전 행동카드가 없거나, 그 효과에 repeatPrevAction 이 있으면 null(무한 반복 방지).
 * @param {import('./state.js').GameState} game
 * @returns {Effect[]|null}
 */
function prevActionEffects(game) {
  const prevAction = game.turnState?.prevAction;
  if (!prevAction) return null;
  const def = getCardDef(prevAction.cardId);
  const effects = prevAction.upgraded === true && def.upgradedEffects ? def.upgradedEffects : def.effects;
  if (!Array.isArray(effects) || effects.length === 0) return null;
  if (containsRepeatPrevAction(effects)) return null;
  return effects;
}

/**
 * @param {string} name
 * @returns {boolean}
 */
export function hasOp(name) {
  return Object.prototype.hasOwnProperty.call(ops, name);
}

/**
 * 카드 종류 필터에 맞는지 검사한다.
 * @param {import('./cards/registry.js').CardDef} def
 * @param {'money'|'weapon'|'action'|undefined} filter
 * @returns {boolean}
 */
function matchesFilter(def, filter) {
  if (!filter) return true;
  return def.type === filter;
}

/**
 * 손패에서 uid 로 카드를 찾아 뺀다.
 * @param {import('./state.js').GameState} game
 * @param {number} playerIndex
 * @param {string} uid
 * @returns {import('./state.js').CardInstance}
 */
function takeFromHand(game, playerIndex, uid) {
  const hand = game.players[playerIndex].hand;
  const index = hand.findIndex((c) => c.uid === uid);
  if (index < 0) throw new Error(`손에 없는 카드: ${uid}`);
  return hand.splice(index, 1)[0];
}

/**
 * 버린 더미에서 uid 로 카드를 찾아 뺀다.
 * @param {import('./state.js').GameState} game
 * @param {number} playerIndex
 * @param {string} uid
 * @returns {import('./state.js').CardInstance}
 */
function takeFromDiscard(game, playerIndex, uid) {
  const discard = game.players[playerIndex].discard;
  const index = discard.findIndex((c) => c.uid === uid);
  if (index < 0) throw new Error(`버린 더미에 없는 카드: ${uid}`);
  return discard.splice(index, 1)[0];
}

/**
 * 카드를 지정한 위치로 옮긴다.
 * @param {import('./state.js').GameState} game
 * @param {number} playerIndex
 * @param {import('./state.js').CardInstance} card
 * @param {'hand'|'discard'|'deckTop'} to
 * @returns {void}
 */
function putCard(game, playerIndex, card, to) {
  const player = game.players[playerIndex];
  if (to === 'hand') {
    player.hand.push(card);
  } else if (to === 'discard') {
    player.discard.push(card);
  } else if (to === 'deckTop') {
    // drawCards 는 배열 끝에서 pop 하므로 끝에 넣으면 맨 위가 된다.
    player.drawPile.push(card);
  } else {
    throw new Error(`알 수 없는 이동 위치: ${to}`);
  }
}

/**
 * 시장에서 얻을 수 있는 cardId 목록을 만든다.
 * @param {import('./state.js').GameState} game
 * @param {'money'|'weapon'|'action'|undefined} filter
 * @param {number} maxCost
 * @returns {string[]}
 */
function marketOptions(game, filter, maxCost) {
  return Object.keys(game.market).filter((cardId) => {
    const slot = game.market[cardId];
    if (!slot || slot.count <= 0) return false;
    const def = getCardDef(cardId);
    if (!matchesFilter(def, filter)) return false;
    return def.cost <= maxCost;
  });
}

registerOp('gainCoins', (game, ctx, effect) => {
  game.players[ctx.playerIndex].coins += effect.n ?? 0;
});

registerOp('gainCoinsPerStat', (game, ctx, effect) => {
  const value = getStat(game, ctx.playerIndex, effect.stat);
  const per = effect.per ?? 1;
  const max = effect.max ?? Infinity;
  game.players[ctx.playerIndex].coins += Math.min(max, per * value);
});

registerOp('damage', (game, ctx, effect) => {
  game.turnState.attackDamage += effect.n ?? 0;
});

registerOp('draw', (game, ctx, effect) => {
  drawCards(game, ctx.playerIndex, effect.n ?? 0);
});

registerOp('gainActions', (game, ctx, effect) => {
  game.players[ctx.playerIndex].actions += effect.n ?? 0;
});

registerOp('gainBuys', (game, ctx, effect) => {
  game.players[ctx.playerIndex].buys += effect.n ?? 0;
});

registerOp('gainStars', (game, ctx, effect) => {
  const player = game.players[ctx.playerIndex];
  const max = maxStarsOf(game, ctx.playerIndex);
  player.stars = Math.min(max, player.stars + (effect.n ?? 0));
});

registerOp('trashFromHand', (game, ctx, effect) => {
  const player = game.players[ctx.playerIndex];
  const options = player.hand
    .filter((c) => matchesFilter(getCardDef(c.cardId), effect.filter))
    .map((c) => c.uid);
  requestChoice(game, ctx, {
    kind: 'trashFromHand',
    prompt: '제거할 카드를 고르세요',
    options,
    min: effect.min ?? 0,
    max: effect.n ?? 0,
  });
});

registerChoice('trashFromHand', (game, pending, selection) => {
  for (const uid of selection) {
    game.trash.push(takeFromHand(game, pending.playerIndex, uid));
  }
});

registerOp('retrieveFromDiscard', (game, ctx, effect) => {
  const player = game.players[ctx.playerIndex];
  const options = player.discard
    .filter((c) => matchesFilter(getCardDef(c.cardId), effect.filter))
    .map((c) => c.uid);
  requestChoice(game, ctx, {
    kind: 'retrieveFromDiscard',
    prompt: '가져올 카드를 고르세요',
    options,
    min: effect.min ?? 0,
    max: effect.n ?? 0,
    data: { to: effect.to ?? 'hand' },
  });
});

registerChoice('retrieveFromDiscard', (game, pending, selection) => {
  for (const uid of selection) {
    putCard(game, pending.playerIndex, takeFromDiscard(game, pending.playerIndex, uid), pending.data.to);
  }
});

registerOp('trashFromDiscard', (game, ctx, effect) => {
  const player = game.players[ctx.playerIndex];
  requestChoice(game, ctx, {
    kind: 'trashFromDiscard',
    prompt: '제거할 카드를 고르세요',
    options: player.discard.map((c) => c.uid),
    min: 0,
    max: effect.n ?? 0,
  });
});

registerChoice('trashFromDiscard', (game, pending, selection) => {
  for (const uid of selection) {
    game.trash.push(takeFromDiscard(game, pending.playerIndex, uid));
  }
});

registerOp('gainFromMarket', (game, ctx, effect) => {
  requestChoice(game, ctx, {
    kind: 'gainFromMarket',
    prompt: '얻을 카드를 고르세요',
    options: marketOptions(game, effect.filter, effect.maxCost ?? 0),
    min: 1,
    max: 1,
    data: { to: effect.to ?? 'discard' },
  });
});

registerChoice('gainFromMarket', (game, pending, selection) => {
  const cardId = selection[0];
  const slot = game.market[cardId];
  if (!slot || slot.count <= 0) throw new Error(`시장 더미가 비었습니다: ${cardId}`);
  // "얻기"는 구매가 아니므로 bought 는 늘리지 않는다.
  slot.count -= 1;
  putCard(game, pending.playerIndex, createCardInstance(game, cardId), pending.data.to);
});

registerOp('exchangeForWeapon', (game, ctx, effect) => {
  const player = game.players[ctx.playerIndex];
  const options = player.hand
    .filter((c) => getCardDef(c.cardId).type === 'money')
    .map((c) => c.uid);
  requestChoice(game, ctx, {
    kind: 'exchangeForWeapon',
    prompt: '바꿀 재화카드를 고르세요',
    options,
    min: 0,
    max: 1,
    data: { plus: effect.plus ?? 0, allowDiscard: effect.allowDiscard === true },
  });
});

registerChoice('exchangeForWeapon', (game, pending, selection) => {
  if (selection.length === 0) return;
  const uid = selection[0];
  const card = game.players[pending.playerIndex].hand.find((c) => c.uid === uid);
  if (!card) throw new Error(`손에 없는 카드: ${uid}`);
  const data = { ...pending.data, uid, cost: getCardDef(card.cardId).cost };
  if (pending.data.allowDiscard === true) {
    requestChoice(game, pending.ctx, {
      kind: 'exchangeForWeaponPlace',
      prompt: '카드를 어디로 보낼지 고르세요',
      options: ['trash', 'discard'],
      min: 1,
      max: 1,
      data,
    });
  } else {
    finishExchange(game, pending.ctx, data, 'trash');
  }
});

registerChoice('exchangeForWeaponPlace', (game, pending, selection) => {
  finishExchange(game, pending.ctx, pending.data, selection[0]);
});

/**
 * 교환한 재화카드를 옮기고 무기 선택을 요청한다.
 * @param {import('./state.js').GameState} game
 * @param {EffectContext} ctx
 * @param {{ uid: string, cost: number, plus: number }} data
 * @param {'trash'|'discard'} place
 * @returns {void}
 */
function finishExchange(game, ctx, data, place) {
  const card = takeFromHand(game, ctx.playerIndex, data.uid);
  if (place === 'discard') {
    game.players[ctx.playerIndex].discard.push(card);
  } else {
    game.trash.push(card);
  }
  requestChoice(game, ctx, {
    kind: 'gainFromMarket',
    prompt: '얻을 무기를 고르세요',
    options: marketOptions(game, 'weapon', data.cost + data.plus),
    min: 1,
    max: 1,
    data: { to: 'hand' },
  });
}

registerOp('addMod', (game, ctx, effect) => {
  const mods = game.turnState.mods;
  mods[effect.key] = (mods[effect.key] ?? 0) + (effect.n ?? 0);
});

registerOp('addAttackBonus', (game, ctx, effect) => {
  /** @type {Record<string, any>} */
  const bonus = {};
  if (effect.flat !== undefined) bonus.flat = effect.flat;
  if (effect.perWeapon !== undefined) bonus.perWeapon = effect.perWeapon;
  if (effect.perAction !== undefined) bonus.perAction = effect.perAction;
  if (effect.perStat !== undefined) bonus.perStat = effect.perStat;
  if (effect.cap !== undefined) bonus.cap = effect.cap;
  if (effect.cond !== undefined) bonus.cond = effect.cond;
  game.turnState.attackBonuses.push(bonus);
});

registerOp('addEndTrigger', (game, ctx, effect) => {
  game.turnState.endTriggers.push({
    cond: effect.cond,
    effects: effect.effects ?? [],
    ctx: { playerIndex: ctx.playerIndex, cardUid: ctx.cardUid },
  });
});

registerOp('trashSelfAtCleanup', (game, ctx) => {
  game.turnState.trashAtCleanup.push(ctx.cardUid);
});

registerOp('gainCard', (game, ctx, effect) => {
  const slot = game.market[effect.cardId];
  if (!slot || slot.count <= 0) return;
  // "얻기"는 구매가 아니므로 bought 는 늘리지 않는다.
  slot.count -= 1;
  putCard(game, ctx.playerIndex, createCardInstance(game, effect.cardId), effect.to ?? 'discard');
});

registerOp('heal', (game, ctx, effect) => {
  const player = game.players[ctx.playerIndex];
  player.hp = Math.min(player.maxHp, player.hp + (effect.n ?? 0));
});

registerOp('addDefense', (game, ctx, effect) => {
  const player = game.players[ctx.playerIndex];
  let amount;
  if (effect.perStat !== undefined) {
    const per = effect.perStat.per ?? 0;
    const value = getStat(game, ctx.playerIndex, effect.perStat.stat);
    amount = Math.min(effect.max ?? Infinity, per * value);
  } else {
    amount = effect.n ?? 0;
  }
  player.defense = (player.defense ?? 0) + amount;
  if (game.turnState) {
    game.turnState.defenseGained = (game.turnState.defenseGained ?? 0) + amount;
  }
});

registerOp('damagePerStat', (game, ctx, effect) => {
  const per = effect.per ?? 1;
  const value = getStat(game, ctx.playerIndex, effect.stat);
  const amount = Math.min(effect.max ?? Infinity, per * value) + (effect.plus ?? 0);
  game.turnState.attackDamage += amount;
});

registerOp('discardFromHand', (game, ctx, effect) => {
  const player = game.players[ctx.playerIndex];
  requestChoice(game, ctx, {
    kind: 'discardFromHand',
    prompt: '버릴 카드를 고르세요',
    options: player.hand.map((c) => c.uid),
    min: effect.min ?? 0,
    max: effect.n ?? 0,
    data: { thenIfAny: effect.thenIfAny ?? [] },
  });
});

registerChoice('discardFromHand', (game, pending, selection) => {
  for (const uid of selection) {
    game.players[pending.playerIndex].discard.push(takeFromHand(game, pending.playerIndex, uid));
  }
  // 1장 이상 버렸을 때만 후속 효과를 남은 효과보다 먼저 실행한다.
  const thenIfAny = pending.data.thenIfAny ?? [];
  if (selection.length > 0 && thenIfAny.length > 0) {
    pending.rest.unshift(...thenIfAny);
  }
});

registerOp('freeUpgrade', (game, ctx, effect) => {
  const player = game.players[ctx.playerIndex];
  const options = player.hand
    .filter((c) => {
      const def = getCardDef(c.cardId);
      return def.basic !== true && Boolean(def.upgradedEffects) && c.upgraded !== true;
    })
    .map((c) => c.uid);
  requestChoice(game, ctx, {
    kind: 'freeUpgrade',
    prompt: '무료로 강화할 카드를 고르세요',
    options,
    min: 0,
    max: effect.n ?? 0,
  });
});

registerChoice('freeUpgrade', (game, pending, selection) => {
  const hand = game.players[pending.playerIndex].hand;
  for (const uid of selection) {
    const card = hand.find((c) => c.uid === uid);
    if (!card) throw new Error(`손에 없는 카드: ${uid}`);
    // 별을 쓰지 않으므로 starsSpent·tempUpgrades 는 늘리지 않는다.
    card.upgraded = true;
    card.tempUpgraded = true;
  }
});

registerOp('payStars', (game, ctx, effect) => {
  const player = game.players[ctx.playerIndex];
  const n = effect.n ?? 0;
  if (player.stars < n) return;
  requestChoice(game, ctx, {
    kind: 'payStars',
    prompt: `별 ${n}개를 쓸까요?`,
    options: ['pay', 'skip'],
    min: 1,
    max: 1,
    data: { n, then: effect.then ?? [] },
  });
});

registerChoice('payStars', (game, pending, selection) => {
  if (selection[0] !== 'pay') return;
  const player = game.players[pending.playerIndex];
  const n = pending.data.n ?? 0;
  player.stars -= n;
  game.turnState.starsSpent += n;
  // 후속 효과를 남은 효과보다 먼저 실행한다.
  const then = pending.data.then ?? [];
  if (then.length > 0) pending.rest.unshift(...then);
});

registerOp('reorderTop', (game, ctx, effect) => {
  const player = game.players[ctx.playerIndex];
  const n = Math.max(0, effect.n ?? 0);
  // drawPile 배열 끝쪽 n 장이 맨 위(다음에 뽑힐 카드)다.
  const top = player.drawPile.slice(Math.max(0, player.drawPile.length - n));
  if (top.length === 0) return;
  const trashUpTo = Math.max(0, effect.trashUpTo ?? 0);
  if (trashUpTo > 0) {
    requestChoice(game, ctx, {
      kind: 'reorderTopTrash',
      prompt: '제거할 카드를 고르세요',
      options: top.map((c) => c.uid),
      min: 0,
      max: trashUpTo,
      data: { top: top.map((c) => c.uid) },
    });
    return;
  }
  requestReorder(game, ctx, top.map((c) => c.uid));
});

registerChoice('reorderTopTrash', (game, pending, selection) => {
  const player = game.players[pending.playerIndex];
  for (const uid of selection) {
    const index = player.drawPile.findIndex((c) => c.uid === uid);
    if (index < 0) throw new Error(`뽑을 덱에 없는 카드: ${uid}`);
    game.trash.push(player.drawPile.splice(index, 1)[0]);
  }
  const remaining = (pending.data.top ?? []).filter((uid) => !selection.includes(uid));
  requestReorder(game, pending.ctx, remaining);
});

/**
 * 남은 카드의 순서를 묻는다. 1장 이하면 순서 선택을 건너뛴다.
 * @param {import('./state.js').GameState} game
 * @param {EffectContext} ctx
 * @param {string[]} uids
 * @returns {void}
 */
function requestReorder(game, ctx, uids) {
  if (uids.length <= 1) return;
  requestChoice(game, ctx, {
    kind: 'reorderTop',
    prompt: '덱 맨 위 순서를 정하세요(먼저 고른 카드가 맨 위)',
    options: uids,
    min: uids.length,
    max: uids.length,
  });
}

registerChoice('reorderTop', (game, pending, selection) => {
  const player = game.players[pending.playerIndex];
  const cards = [];
  for (const uid of selection) {
    const index = player.drawPile.findIndex((c) => c.uid === uid);
    if (index < 0) throw new Error(`뽑을 덱에 없는 카드: ${uid}`);
    cards.push(player.drawPile.splice(index, 1)[0]);
  }
  // selection[0] 이 맨 위가 되도록 뒤에서부터 끝에 쌓는다.
  for (let i = cards.length - 1; i >= 0; i--) {
    player.drawPile.push(cards[i]);
  }
});

registerOp('opponentMillTop', (game, ctx, effect) => {
  const opponent = game.players[1 - ctx.playerIndex];
  const n = effect.n ?? 0;
  for (let i = 0; i < n; i++) {
    if (opponent.drawPile.length === 0) {
      if (opponent.discard.length === 0) break;
      opponent.drawPile = shuffleInPlace(game, opponent.discard);
      opponent.discard = [];
    }
    opponent.discard.push(opponent.drawPile.pop());
  }
});
