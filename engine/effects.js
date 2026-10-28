import { drawCards, createCardInstance } from './state.js';
import { getCardDef } from './cards/registry.js';
import { requestChoice, registerChoice } from './choices.js';
import { evalCond } from './conditions.js';
import { shuffleInPlace } from './rng.js';

/** @typedef {{ op: string, n?: number }} Effect */
/** @typedef {{ playerIndex: number, cardUid: string }} EffectContext */
/** @typedef {(game: import('./state.js').GameState, ctx: EffectContext, effect: Effect) => void} OpFn */

/** 별 최대치 */
export const MAX_STARS = 5;

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
  player.stars = Math.min(MAX_STARS, player.stars + (effect.n ?? 0));
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
  player.defense = (player.defense ?? 0) + (effect.n ?? 0);
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
