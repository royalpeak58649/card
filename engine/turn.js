import './cards/basic.js';
import { getCardDef } from './cards/registry.js';
import { createCardInstance, drawCards, getPurchasePrice } from './state.js';
import { getCharacter } from './characters.js';
import { maxStarsOf, runEffects } from './effects.js';
import { resolveChoice } from './choices.js';
import { evalCond, getStat } from './conditions.js';

/** @typedef {import('./state.js').GameState} GameState */
/** @typedef {import('./state.js').CardInstance} CardInstance */
/** @typedef {{
 *  attackDamage: number, moneyPlayed: number, weaponsPlayed: number,
 *  actionsPlayed: number, bought: string[], starsSpent: number,
 *  tempUpgrades: number, upgradedPlayed: number, damageDealt: number,
 *  mods: Record<string, number>, attackBonuses: Record<string, any>[],
 *  endTriggers: { cond?: Record<string, any>, effects: import('./effects.js').Effect[],
 *    ctx: import('./effects.js').EffectContext }[],
 *  trashAtCleanup: string[],
 *  opponentStarGiven: boolean,
 *  defenseGained: number,
 *  playedActionIds: string[],
 *  lastAction: { cardId: string, upgraded: boolean } | null,
 *  prevAction: { cardId: string, upgraded: boolean } | null,
 *  echoUsed: boolean
 * }} TurnState */
/** @typedef {{ type: 'playCard', uid: string }
 *  | { type: 'playAllMoney' }
 *  | { type: 'buy', cardId: string }
 *  | { type: 'upgrade', uid: string, mode: 'temp'|'perm' }
 *  | { type: 'choose', selection: string[] }
 *  | { type: 'activateAbility' }
 *  | { type: 'endPhase' }} Action */

/** 차례 시작 시 뽑는 장수 */
const HAND_SIZE = 5;

/** 일시 강화 비용(별) */
const TEMP_UPGRADE_COST = 1;
/** 영구 강화 비용(별) */
const PERM_UPGRADE_COST = 4;
/** 한 차례 최대 일시 강화 장수 */
const MAX_TEMP_UPGRADES = 3;

/**
 * 새 turnState 를 만든다.
 * @returns {TurnState}
 */
function createTurnState() {
  return {
    attackDamage: 0,
    moneyPlayed: 0,
    weaponsPlayed: 0,
    actionsPlayed: 0,
    bought: [],
    starsSpent: 0,
    tempUpgrades: 0,
    upgradedPlayed: 0,
    damageDealt: 0,
    mods: { weaponBuyRefund: 0, marketDiscount: 0, actionDamageBonus: 0, firstWeaponDiscount: 0 },
    abilityActivated: false,
    attackBonuses: [],
    endTriggers: [],
    trashAtCleanup: [],
    opponentStarGiven: false,
    defenseGained: 0,
    playedActionIds: [],
    lastAction: null,
    prevAction: null,
    echoUsed: false,
  };
}

/**
 * 현재 플레이어의 차례를 시작한다.
 * @param {GameState} game
 * @returns {void}
 */
function startTurn(game) {
  const player = game.players[game.activeIndex];
  // 각 플레이어가 자기 차례를 몇 번째 맞는지(이번 차례 포함).
  player.turnsTaken = (player.turnsTaken ?? 0) + 1;
  // 경기 첫 차례(선공의 첫 차례)에는 별을 받지 않는다.
  if (game.turn !== 1) {
    player.stars = Math.min(maxStarsOf(game, game.activeIndex), player.stars + 1);
  }
  player.actions = 1;
  player.buys = 1;
  player.coins = 0;
  game.turnState = createTurnState();
  game.phase = 'action';
  runCharacterStartTriggers(game, game.activeIndex);
}

/**
 * 게임을 시작한다(setup 단계에서만).
 * @param {GameState} game
 * @returns {void}
 */
export function startGame(game) {
  if (game.phase !== 'setup') {
    throw new Error(`게임을 시작할 수 없는 단계: ${game.phase}`);
  }
  game.activeIndex = game.firstPlayerIndex;
  game.pending = null;
  game.draw = false;
  startTurn(game);
}

/**
 * 조작할 수 있는 상태인지 검사한다. 'choose' 는 선택 대기 중인 플레이어 기준.
 * @param {GameState} game
 * @param {number} playerIndex
 * @param {Action} action
 * @returns {void}
 */
function assertCanAct(game, playerIndex, action) {
  if (game.phase === 'gameOver') throw new Error('게임이 끝났습니다');
  if (game.phase === 'setup') throw new Error('게임이 아직 시작되지 않았습니다');
  if (action && action.type === 'choose') {
    if (!game.pending) throw new Error('대기 중인 선택이 없습니다');
    if (playerIndex !== game.pending.playerIndex) throw new Error('선택할 차례가 아닙니다');
    return;
  }
  if (game.pending) throw new Error('먼저 선택을 끝내야 합니다');
  if (playerIndex !== game.activeIndex) throw new Error('차례가 아닙니다');
}

/**
 * 손에서 uid 로 카드를 찾는다.
 * @param {GameState} game
 * @param {number} playerIndex
 * @param {string} uid
 * @returns {CardInstance}
 */
function findInHand(game, playerIndex, uid) {
  const card = game.players[playerIndex].hand.find((c) => c.uid === uid);
  if (!card) throw new Error(`손에 없는 카드: ${uid}`);
  return card;
}

/**
 * 카드 종류와 현재 단계가 맞는지 검사한다.
 * @param {GameState} game
 * @param {import('./cards/registry.js').CardDef} def
 * @returns {void}
 */
function assertPhaseForCard(game, def) {
  if (def.type === 'action' && game.phase !== 'action') {
    throw new Error('행동카드는 행동단계에만 낼 수 있습니다');
  }
  if (def.type === 'money' && game.phase !== 'buy') {
    throw new Error('재화카드는 구매단계에만 낼 수 있습니다');
  }
  if (def.type === 'weapon' && game.phase !== 'attack') {
    throw new Error('무기카드는 공격단계에만 낼 수 있습니다');
  }
}

/**
 * 카드를 낸다(검사 → 변경 순서).
 * @param {GameState} game
 * @param {number} playerIndex
 * @param {string} uid
 * @returns {void}
 */
function playCard(game, playerIndex, uid) {
  const player = game.players[playerIndex];
  const card = findInHand(game, playerIndex, uid);
  const def = getCardDef(card.cardId);
  assertPhaseForCard(game, def);

  const actionCost = def.type === 'action' ? (def.actionCost ?? 0) : 0;
  if (actionCost > 0 && player.actions < actionCost) {
    throw new Error('행동력이 부족합니다');
  }

  // 여기서부터 상태 변경
  player.actions -= actionCost;
  player.hand.splice(player.hand.indexOf(card), 1);
  player.inPlay.push(card);

  // 낸 카드 수는 효과 실행 전에 센다(방금 낸 카드 자신도 조건에 포함된다).
  if (def.type === 'money') game.turnState.moneyPlayed += 1;
  if (def.type === 'weapon') game.turnState.weaponsPlayed += 1;
  if (def.type === 'action') {
    game.turnState.actionsPlayed += 1;
    game.turnState.playedActionIds.push(card.cardId);
    // 직전 행동카드 기록(효과 실행 전에 남긴다).
    game.turnState.prevAction = game.turnState.lastAction;
    game.turnState.lastAction = { cardId: card.cardId, upgraded: card.upgraded === true };
    triggerOpponentActionStar(game, playerIndex);
  }
  if (card.upgraded === true) game.turnState.upgradedPlayed += 1;

  const effects = card.upgraded && def.upgradedEffects ? def.upgradedEffects : def.effects;
  const doubled = shouldDoubleFirstCostlyAction(game, playerIndex, def, actionCost);
  if (doubled) game.turnState.echoUsed = true;
  runEffects(game, { playerIndex, cardUid: card.uid }, doubled ? effects.concat(effects) : effects);

  // 피해를 주는 행동카드는 차례 보정만큼 공격 피해를 더한다.
  const actionDamageBonus = game.turnState.mods.actionDamageBonus ?? 0;
  if (def.type === 'action' && def.dealsDamage === true && actionDamageBonus > 0) {
    game.turnState.attackDamage += actionDamageBonus;
  }
}

/**
 * 캐릭터 패시브 ability.doubleFirstCostlyAction: { minOwnTurn } 발동 여부.
 * 내 차례 minOwnTurn 번째부터, 그 차례 처음 내는 행동력 1 이상 행동카드만 두 번 실행한다.
 * @param {GameState} game
 * @param {number} playerIndex
 * @param {import('./cards/registry.js').CardDef} def
 * @param {number} actionCost
 * @returns {boolean}
 */
function shouldDoubleFirstCostlyAction(game, playerIndex, def, actionCost) {
  if (def.type !== 'action' || actionCost < 1) return false;
  if (game.turnState.echoUsed === true) return false;
  const characterId = game.players[playerIndex].characterId;
  if (!characterId) return false;
  const passive = getCharacter(characterId).ability?.doubleFirstCostlyAction;
  if (!passive) return false;
  const minOwnTurn = passive.minOwnTurn ?? 0;
  return (game.players[playerIndex].turnsTaken ?? 0) >= minOwnTurn;
}

/**
 * 상대 캐릭터의 '상대가 행동카드를 N장째 낼 때' 패시브를 처리한다.
 * 한 차례에 한 번만 발동한다.
 * @param {GameState} game
 * @param {number} playerIndex
 * @returns {void}
 */
function triggerOpponentActionStar(game, playerIndex) {
  const turnState = game.turnState;
  if (turnState.opponentStarGiven === true) return;
  const opponent = game.players[1 - playerIndex];
  if (!opponent.characterId) return;
  const passive = getCharacter(opponent.characterId).ability?.opponentActionStar;
  if (!passive) return;
  if (turnState.actionsPlayed !== passive.threshold) return;
  opponent.stars = Math.min(maxStarsOf(game, 1 - playerIndex), opponent.stars + (passive.stars ?? 0));
  turnState.opponentStarGiven = true;
}

/**
 * 구매한다.
 * @param {GameState} game
 * @param {number} playerIndex
 * @param {string} cardId
 * @returns {void}
 */
function buy(game, playerIndex, cardId) {
  if (game.phase !== 'buy') throw new Error('구매는 구매단계에만 할 수 있습니다');
  const player = game.players[playerIndex];
  if (player.buys < 1) throw new Error('구매 횟수가 부족합니다');
  const slot = game.market[cardId];
  if (!slot) throw new Error(`시장에 없는 카드: ${cardId}`);
  if (slot.count <= 0) throw new Error(`시장 더미가 비었습니다: ${cardId}`);
  const price = getPurchasePrice(game, cardId, playerIndex);
  if (player.coins < price) throw new Error('원이 부족합니다');

  // 여기서부터 상태 변경
  player.coins -= price;
  player.buys -= 1;
  slot.count -= 1;
  slot.bought += 1;
  player.discard.push(createCardInstance(game, cardId));
  game.turnState.bought.push(cardId);

  // 무기 구매 환급은 한 차례에 한 번만 적용된다.
  const refund = game.turnState.mods.weaponBuyRefund ?? 0;
  if (getCardDef(cardId).type === 'weapon' && refund > 0) {
    player.coins += refund;
    game.turnState.mods.weaponBuyRefund = 0;
  }
}

/**
 * 영구 강화 비용(별)을 구한다. 캐릭터의 permUpgradeCost 가 있으면 그 값을 쓴다.
 * @param {GameState} game
 * @param {number} playerIndex
 * @returns {number}
 */
function permUpgradeCost(game, playerIndex) {
  const characterId = game.players[playerIndex].characterId;
  if (!characterId) return PERM_UPGRADE_COST;
  const cost = getCharacter(characterId).ability?.permUpgradeCost;
  return typeof cost === 'number' ? cost : PERM_UPGRADE_COST;
}

/**
 * 손패의 카드를 별로 강화한다(검사 → 변경 순서).
 * @param {GameState} game
 * @param {number} playerIndex
 * @param {string} uid
 * @param {'temp'|'perm'} mode
 * @returns {void}
 */
function upgradeCard(game, playerIndex, uid, mode) {
  if (mode !== 'temp' && mode !== 'perm') {
    throw new Error(`알 수 없는 강화 방식: ${mode}`);
  }
  const player = game.players[playerIndex];
  const card = findInHand(game, playerIndex, uid);
  const def = getCardDef(card.cardId);
  if (def.basic === true) throw new Error(`기본 카드는 강화할 수 없습니다: ${card.cardId}`);
  if (!def.upgradedEffects) throw new Error(`강화판이 없는 카드: ${card.cardId}`);
  if (card.upgraded) throw new Error(`이미 강화된 카드: ${uid}`);

  const cost = mode === 'temp' ? TEMP_UPGRADE_COST : permUpgradeCost(game, playerIndex);
  if (player.stars < cost) throw new Error('별이 부족합니다');
  if (mode === 'temp' && game.turnState.tempUpgrades >= MAX_TEMP_UPGRADES) {
    throw new Error('일시 강화는 한 차례에 3장까지입니다');
  }

  // 여기서부터 상태 변경
  player.stars -= cost;
  game.turnState.starsSpent += cost;
  card.upgraded = true;
  if (mode === 'temp') {
    card.tempUpgraded = true;
    game.turnState.tempUpgrades += 1;
  }
}

/**
 * 일시 강화를 모두 되돌린다(영구 강화는 유지).
 * @param {GameState} game
 * @param {number} playerIndex
 * @returns {void}
 */
function revertTempUpgrades(game, playerIndex) {
  const player = game.players[playerIndex];
  const zones = [player.hand, player.inPlay, player.discard, player.drawPile, game.trash];
  for (const zone of zones) {
    for (const card of zone) {
      if (card.tempUpgraded === true) {
        card.upgraded = false;
        delete card.tempUpgraded;
      }
    }
  }
}

/**
 * 공격 플레이어 캐릭터의 공격 보너스 목록을 돌려준다.
 * @param {GameState} game
 * @param {number} playerIndex
 * @returns {Record<string, any>[]}
 */
function characterAttackBonuses(game, playerIndex) {
  const characterId = game.players[playerIndex].characterId;
  if (!characterId) return [];
  const ability = getCharacter(characterId).ability ?? {};
  return ability.attackBonuses ?? [];
}

/**
 * 공격단계를 끝내고 피해를 적용한다.
 * @param {GameState} game
 * @param {number} playerIndex
 * @returns {void}
 */
function resolveAttack(game, playerIndex) {
  const turnState = game.turnState;
  let total = turnState.attackDamage;
  const bonuses = (turnState.attackBonuses ?? []).concat(characterAttackBonuses(game, playerIndex));
  // 캐릭터 능력의 조건은 '이번 공격단계에 낸 무기 수'를 기준으로 본다.
  const weaponsPlayed = turnState.weaponsPlayed;
  const actionsPlayed = turnState.actionsPlayed;
  const condCtx = { playerIndex, cardUid: '' };
  for (const bonus of bonuses) {
    if (bonus.cond !== undefined && !evalCond(game, condCtx, bonus.cond)) {
      continue;
    }
    let amount = (bonus.flat ?? 0)
      + (bonus.perWeapon ?? 0) * weaponsPlayed
      + (bonus.perAction ?? 0) * actionsPlayed;
    if (bonus.perStat !== undefined) {
      amount += (bonus.perStat.per ?? 0) * getStat(game, playerIndex, bonus.perStat.stat);
    }
    if (bonus.cap !== undefined) amount = Math.min(amount, bonus.cap);
    total += amount;
  }

  const opponentIndex = 1 - playerIndex;
  const opponent = game.players[opponentIndex];
  const defense = opponent.defense ?? 0;
  const damage = Math.max(0, total - defense);
  // 공격이 해결되면 상대 방어는 소모된다(무기를 내지 않았어도).
  opponent.defense = 0;

  turnState.damageDealt = damage;
  // 승패는 라운드 끝(후공 차례 종료)에만 판정하므로 hp 는 음수 그대로 둔다.
  opponent.hp -= damage;
}

/**
 * 발동형 능력의 최대 사용 횟수(maxUses, 없으면 oncePerGame 이면 1, 둘 다 없으면 무제한).
 * @param {{ maxUses?: number, oncePerGame?: boolean }} ability
 * @returns {number}
 */
export function abilityMaxUses(ability) {
  if (typeof ability.maxUses === 'number') return ability.maxUses;
  return ability.oncePerGame === true ? 1 : Infinity;
}

/**
 * 캐릭터의 발동형 능력을 쓴다(검사 → 변경 순서).
 * @param {GameState} game
 * @param {number} playerIndex
 * @returns {void}
 */
function activateAbility(game, playerIndex) {
  if (game.phase !== 'action' && game.phase !== 'buy' && game.phase !== 'attack') {
    throw new Error(`능력을 쓸 수 없는 단계: ${game.phase}`);
  }
  const player = game.players[playerIndex];
  if (!player.characterId) throw new Error('캐릭터가 없습니다');
  const ability = getCharacter(player.characterId).ability?.activeAbility;
  if (!ability) throw new Error('발동형 능력이 없습니다');
  const maxUses = abilityMaxUses(ability);
  const uses = player.abilityUses ?? (player.abilityUsed ? 1 : 0);
  if (uses >= maxUses) throw new Error('능력을 더 쓸 수 없습니다');
  if (ability.minOwnTurn !== undefined && (player.turnsTaken ?? 0) < ability.minOwnTurn) {
    throw new Error(`내 ${ability.minOwnTurn}번째 차례부터 쓸 수 있습니다`);
  }
  if (game.turnState.abilityActivated === true) throw new Error('이번 차례에 이미 능력을 썼습니다');

  // 여기서부터 상태 변경
  player.abilityUses = uses + 1;
  player.abilityUsed = player.abilityUses >= maxUses;
  game.turnState.abilityActivated = true;
  runEffects(game, { playerIndex, cardUid: '' }, ability.effects ?? []);
}

/**
 * 라운드 끝(후공 차례 종료)에 승패를 판정한다.
 * 둘 다 0 이하면 hp 가 높은 쪽 승리, 같으면 무승부.
 * @param {GameState} game
 * @returns {boolean} 경기가 끝났으면 true
 */
function checkRoundEnd(game) {
  const [p0, p1] = game.players;
  const alive0 = p0.hp > 0;
  const alive1 = p1.hp > 0;
  if (alive0 && alive1) return false;

  game.phase = 'gameOver';
  if (alive0) {
    game.winner = 0;
  } else if (alive1) {
    game.winner = 1;
  } else if (p0.hp > p1.hp) {
    game.winner = 0;
  } else if (p1.hp > p0.hp) {
    game.winner = 1;
  } else {
    game.winner = null;
    game.draw = true;
  }
  return true;
}

/**
 * 정리하고 다음 차례로 넘긴다.
 * @param {GameState} game
 * @param {number} playerIndex
 * @returns {void}
 */
function endTurn(game, playerIndex) {
  const player = game.players[playerIndex];
  runEndTriggers(game, playerIndex);
  revertTempUpgrades(game, playerIndex);
  const trashed = new Set(game.turnState.trashAtCleanup ?? []);
  const toDiscard = [];
  for (const card of [...player.inPlay, ...player.hand]) {
    if (trashed.has(card.uid)) {
      game.trash.push(card);
    } else {
      toDiscard.push(card);
    }
  }
  player.discard.push(...toDiscard);
  player.inPlay = [];
  player.hand = [];
  drawCards(game, playerIndex, HAND_SIZE);
  player.coins = 0;
  player.actions = 0;
  player.buys = 0;
  // 라운드 끝(후공 차례 종료)에만 승패를 판정한다.
  if (playerIndex !== game.firstPlayerIndex && checkRoundEnd(game)) return;
  game.activeIndex = 1 - playerIndex;
  game.turn += 1;
  startTurn(game);
}

/**
 * 차례 끝 발동 효과를 순서대로 처리한다. 선택형 효과는 쓸 수 없다.
 * @param {GameState} game
 * @param {number} playerIndex
 * @returns {void}
 */
function runEndTriggers(game, playerIndex) {
  const triggers = game.turnState.endTriggers ?? [];
  for (const trigger of triggers) {
    if (trigger.cond !== undefined && !evalCond(game, trigger.ctx, trigger.cond)) continue;
    runEffects(game, trigger.ctx, trigger.effects);
    if (game.pending) {
      throw new Error('차례 끝 효과에는 선택형 효과를 쓸 수 없습니다');
    }
  }
  runCharacterEndTriggers(game, playerIndex);
}

/**
 * 캐릭터의 차례 시작 발동(startTriggers)을 처리한다.
 * @param {GameState} game
 * @param {number} playerIndex
 * @returns {void}
 */
function runCharacterStartTriggers(game, playerIndex) {
  const characterId = game.players[playerIndex].characterId;
  if (!characterId) return;
  const triggers = getCharacter(characterId).ability?.startTriggers ?? [];
  const ctx = { playerIndex, cardUid: '' };
  for (const trigger of triggers) {
    if (trigger.cond !== undefined && !evalCond(game, ctx, trigger.cond)) continue;
    runEffects(game, ctx, trigger.effects ?? []);
    if (game.pending) {
      throw new Error('차례 시작 효과에는 선택형 효과를 쓸 수 없습니다');
    }
  }
}

/**
 * 캐릭터의 차례 끝 발동(endTriggers)을 처리한다.
 * @param {GameState} game
 * @param {number} playerIndex
 * @returns {void}
 */
function runCharacterEndTriggers(game, playerIndex) {
  const characterId = game.players[playerIndex].characterId;
  if (!characterId) return;
  const triggers = getCharacter(characterId).ability?.endTriggers ?? [];
  const ctx = { playerIndex, cardUid: '' };
  for (const trigger of triggers) {
    if (trigger.cond !== undefined && !evalCond(game, ctx, trigger.cond)) continue;
    runEffects(game, ctx, trigger.effects ?? []);
    if (game.pending) {
      throw new Error('차례 끝 효과에는 선택형 효과를 쓸 수 없습니다');
    }
  }
}

/**
 * 모든 조작의 단일 입구. 잘못된 조작은 상태를 바꾸지 않고 Error 를 던진다.
 * @param {GameState} game
 * @param {number} playerIndex
 * @param {Action} action
 * @returns {void}
 */
export function applyAction(game, playerIndex, action) {
  if (!action || typeof action !== 'object') throw new Error('잘못된 조작입니다');
  assertCanAct(game, playerIndex, action);

  const snapshot = JSON.stringify(game);
  // 로그의 turn 은 조작을 처리하기 전의 차례 번호로 기록한다.
  const turnBefore = game.turn;

  try {
    switch (action.type) {
      case 'playCard': {
        playCard(game, playerIndex, action.uid);
        break;
      }
      case 'playAllMoney': {
        if (game.phase !== 'buy') throw new Error('재화카드는 구매단계에만 낼 수 있습니다');
        const uids = game.players[playerIndex].hand
          .filter((c) => getCardDef(c.cardId).type === 'money')
          .map((c) => c.uid);
        for (const uid of uids) playCard(game, playerIndex, uid);
        break;
      }
      case 'buy': {
        buy(game, playerIndex, action.cardId);
        break;
      }
      case 'upgrade': {
        upgradeCard(game, playerIndex, action.uid, action.mode);
        break;
      }
      case 'choose': {
        resolveChoice(game, playerIndex, action.selection);
        break;
      }
      case 'activateAbility': {
        activateAbility(game, playerIndex);
        break;
      }
      case 'endPhase': {
        if (game.phase === 'action') {
          game.phase = 'buy';
        } else if (game.phase === 'buy') {
          game.phase = 'attack';
        } else if (game.phase === 'attack') {
          resolveAttack(game, playerIndex);
          endTurn(game, playerIndex);
        } else {
          throw new Error(`알 수 없는 단계: ${game.phase}`);
        }
        break;
      }
      default:
        throw new Error(`알 수 없는 조작: ${action.type}`);
    }

    /** @type {{ turn: number, p: number, type: string, cardId?: string, mode?: string }} */
    const entry = { turn: turnBefore, p: playerIndex, type: action.type };
    if (action.type === 'playCard') {
      const played = game.players[playerIndex].inPlay.find((c) => c.uid === action.uid);
      if (played) entry.cardId = played.cardId;
    } else if (action.type === 'buy') {
      entry.cardId = action.cardId;
    } else if (action.type === 'upgrade') {
      const upgraded = game.players[playerIndex].hand.find((c) => c.uid === action.uid);
      if (upgraded) entry.cardId = upgraded.cardId;
      entry.mode = action.mode;
    }
    game.log.push(entry);
  } catch (err) {
    // 실패한 조작은 흔적을 남기지 않는다(객체 참조는 유지).
    for (const key of Object.keys(game)) delete game[key];
    Object.assign(game, JSON.parse(snapshot));
    throw err;
  }
}
