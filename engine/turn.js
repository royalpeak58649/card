import './cards/basic.js';
import { getCardDef } from './cards/registry.js';
import { createCardInstance, drawCards, getPurchasePrice } from './state.js';
import { MAX_STARS, runEffects } from './effects.js';

/** @typedef {import('./state.js').GameState} GameState */
/** @typedef {import('./state.js').CardInstance} CardInstance */
/** @typedef {{
 *  attackDamage: number, moneyPlayed: number, weaponsPlayed: number,
 *  actionsPlayed: number, bought: string[], starsSpent: number,
 *  tempUpgrades: number, damageDealt: number
 * }} TurnState */
/** @typedef {{ type: 'playCard', uid: string }
 *  | { type: 'playAllMoney' }
 *  | { type: 'buy', cardId: string }
 *  | { type: 'endPhase' }} Action */

/** 차례 시작 시 뽑는 장수 */
const HAND_SIZE = 5;

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
    damageDealt: 0,
  };
}

/**
 * 현재 플레이어의 차례를 시작한다.
 * @param {GameState} game
 * @returns {void}
 */
function startTurn(game) {
  const player = game.players[game.activeIndex];
  // 경기 첫 차례(선공의 첫 차례)에는 별을 받지 않는다.
  if (game.turn !== 1) {
    player.stars = Math.min(MAX_STARS, player.stars + 1);
  }
  player.actions = 1;
  player.buys = 1;
  player.coins = 0;
  game.turnState = createTurnState();
  game.phase = 'action';
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
  startTurn(game);
}

/**
 * @param {GameState} game
 * @param {number} playerIndex
 * @returns {void}
 */
function assertCanAct(game, playerIndex) {
  if (game.phase === 'gameOver') throw new Error('게임이 끝났습니다');
  if (game.phase === 'setup') throw new Error('게임이 아직 시작되지 않았습니다');
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

  const effects = card.upgraded && def.upgradedEffects ? def.upgradedEffects : def.effects;
  runEffects(game, { playerIndex, card }, effects);

  if (def.type === 'money') game.turnState.moneyPlayed += 1;
  if (def.type === 'weapon') game.turnState.weaponsPlayed += 1;
  if (def.type === 'action') game.turnState.actionsPlayed += 1;
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
  const price = getPurchasePrice(game, cardId);
  if (player.coins < price) throw new Error('원이 부족합니다');

  // 여기서부터 상태 변경
  player.coins -= price;
  player.buys -= 1;
  slot.count -= 1;
  slot.bought += 1;
  player.discard.push(createCardInstance(game, cardId));
  game.turnState.bought.push(cardId);
}

/**
 * 공격단계를 끝내고 피해를 적용한다.
 * @param {GameState} game
 * @param {number} playerIndex
 * @returns {void}
 */
function resolveAttack(game, playerIndex) {
  const damage = game.turnState.attackDamage;
  game.turnState.damageDealt = damage;
  const opponentIndex = 1 - playerIndex;
  const opponent = game.players[opponentIndex];
  opponent.hp -= damage;
  if (opponent.hp <= 0) {
    opponent.hp = 0;
    game.winner = playerIndex;
    game.phase = 'gameOver';
  }
}

/**
 * 정리하고 다음 차례로 넘긴다.
 * @param {GameState} game
 * @param {number} playerIndex
 * @returns {void}
 */
function endTurn(game, playerIndex) {
  const player = game.players[playerIndex];
  player.discard.push(...player.inPlay, ...player.hand);
  player.inPlay = [];
  player.hand = [];
  drawCards(game, playerIndex, HAND_SIZE);
  player.coins = 0;
  player.actions = 0;
  player.buys = 0;
  game.activeIndex = 1 - playerIndex;
  game.turn += 1;
  startTurn(game);
}

/**
 * 모든 조작의 단일 입구. 잘못된 조작은 상태를 바꾸지 않고 Error 를 던진다.
 * @param {GameState} game
 * @param {number} playerIndex
 * @param {Action} action
 * @returns {void}
 */
export function applyAction(game, playerIndex, action) {
  assertCanAct(game, playerIndex);
  if (!action || typeof action !== 'object') throw new Error('잘못된 조작입니다');

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
    case 'endPhase': {
      if (game.phase === 'action') {
        game.phase = 'buy';
      } else if (game.phase === 'buy') {
        game.phase = 'attack';
      } else if (game.phase === 'attack') {
        resolveAttack(game, playerIndex);
        if (game.phase !== 'gameOver') endTurn(game, playerIndex);
      } else {
        throw new Error(`알 수 없는 단계: ${game.phase}`);
      }
      break;
    }
    default:
      throw new Error(`알 수 없는 조작: ${action.type}`);
  }

  /** @type {{ turn: number, p: number, type: string, cardId?: string }} */
  const entry = { turn: game.turn, p: playerIndex, type: action.type };
  if (action.type === 'playCard') {
    const played = game.players[playerIndex].inPlay.find((c) => c.uid === action.uid);
    if (played) entry.cardId = played.cardId;
  } else if (action.type === 'buy') {
    entry.cardId = action.cardId;
  }
  game.log.push(entry);
}
