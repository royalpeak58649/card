import { drawCards } from './state.js';
import { runEffects } from './effects.js';
import { randomInt, shuffleInPlace } from './rng.js';

/**
 * 모험 모드 증강. 등급은 보상 등장 확률을 결정한다.
 * 1성 92%, 2성 7.8%, 3성 0.2%.
 */
export const AUGMENTS = [
  { id: 'field_rations', rarity: 1, name: '야전 식량', text: '매 전투 최대 체력 +6', maxHp: 6 },
  { id: 'star_cache', rarity: 1, name: '별 조각 보관함', text: '매 전투 별 2개를 가지고 시작한다', stars: 2 },
  { id: 'quick_hands', rarity: 1, name: '빠른 손', text: '첫 차례에 행동력 +1, 카드 1장' },
  { id: 'supply_pouch', rarity: 1, name: '보급 주머니', text: '내 첫 3차례 시작 시 +1원' },
  { id: 'iron_guard', rarity: 1, name: '철벽 방어', text: '내 차례 시작 시 방어 +1', startEffects: [{ op: 'addDefense', n: 1 }] },
  { id: 'focused_aim', rarity: 1, name: '집중 조준', text: '무기를 2장 이상 낸 차례 공격 피해 +1', attackBonus: { flat: 1, cond: { stat: 'weaponsPlayed', gte: 2 } } },
  { id: 'battle_medicine', rarity: 1, name: '전투 의무관', text: '내 차례 시작 시 체력 1 회복', startEffects: [{ op: 'heal', n: 1 }] },

  { id: 'overcharge', rarity: 2, name: '과충전 탄환', text: '낸 무기 1장당 공격 피해 +1 (차례당 최대 +4)', attackBonus: { perWeapon: 1, cap: 4 } },
  { id: 'second_wind', rarity: 2, name: '두 번째 바람', text: '내 차례 시작 시 체력이 절반 이하면 체력 3 회복' },
  { id: 'tactical_link', rarity: 2, name: '전술 연결망', text: '내 차례 시작 시 카드 1장, 행동력 +1', startEffects: [{ op: 'draw', n: 1 }, { op: 'gainActions', n: 1 }] },
  { id: 'arsenal', rarity: 2, name: '비축 무기고', text: '매 전투 시작 손패에 소총 1장 추가', openingEffects: [{ op: 'gainRandomCard', pool: ['rifle'], n: 1, to: 'hand' }] },
  { id: 'war_economy', rarity: 2, name: '전시 경제', text: '내 차례 시작 시 +1원, +1 구매', startEffects: [{ op: 'gainCoins', n: 1 }, { op: 'gainBuys', n: 1 }] },
  { id: 'star_engine', rarity: 2, name: '성운 기관', text: '내 차례 시작 시 별 +1 추가 (별 최대치 유지)', startEffects: [{ op: 'gainStars', n: 1 }] },

  { id: 'apocalypse', rarity: 3, name: '종말의 탄두', text: '모든 공격 피해 2배 (보너스 합산 후, 상대 방어 적용 전)' },
  { id: 'chronocrown', rarity: 3, name: '시간왕의 왕관', text: '매 차례 처음 내는 행동력 비용 1 이상 행동카드의 효과를 3회 실행한다. 캐릭터의 추가 실행과 합산' },
  { id: 'celestial_forge', rarity: 3, name: '천상의 대장간', text: '구매한 강화 가능한 카드가 즉시 영구 강화된다. 기본 공급 카드는 제외' },
  { id: 'titan_heart', rarity: 3, name: '거신의 심장', text: '매 전투 최대 체력 +24. 내 차례 시작 시 방어 +4', maxHp: 24, startEffects: [{ op: 'addDefense', n: 4 }] },
  { id: 'infinite_library', rarity: 3, name: '무한의 서고', text: '내 차례 시작 시 카드 2장, 행동력 +2', startEffects: [{ op: 'draw', n: 2 }, { op: 'gainActions', n: 2 }] },
  { id: 'imperial_treasury', rarity: 3, name: '제국의 금고', text: '내 차례 시작 시 +3원, +1 구매', startEffects: [{ op: 'gainCoins', n: 3 }, { op: 'gainBuys', n: 1 }] },
];

const BY_ID = Object.fromEntries(AUGMENTS.map((a) => [a.id, a]));

export function getAugment(id) {
  if (!Object.hasOwn(BY_ID, id)) throw new Error(`알 수 없는 증강: ${id}`);
  return BY_ID[id];
}

export function augmentByRarity(rarity) {
  return AUGMENTS.filter((augment) => augment.rarity === rarity);
}

/** 등급을 한 번 뽑고 같은 등급의 미보유 증강 3개를 제시한다. */
export function rollAugmentChoices(campaign) {
  const roll = randomInt(campaign, 10000);
  const rarity = roll < 9200 ? 1 : roll < 9980 ? 2 : 3;
  const pool = augmentByRarity(rarity).filter((a) => !campaign.augments.includes(a.id));
  return shuffleInPlace(campaign, pool.map((a) => a.id)).slice(0, 3);
}

/** 스테이지 시작 시 플레이어에게 증강을 적용한다. */
export function applyAugments(game, augmentIds) {
  const player = game.players[0];
  player.augmentIds = [...augmentIds];
  for (const id of augmentIds) {
    const augment = getAugment(id);
    player.maxHp += augment.maxHp ?? 0;
    player.hp += augment.maxHp ?? 0;
    player.stars += augment.stars ?? 0;
  }
}

export function hasAugment(game, playerIndex, id) {
  return (game.players[playerIndex].augmentIds ?? []).includes(id);
}

/** 차례 시작 보정. turnState 가 만들어진 뒤 호출한다. */
export function augmentTurnStart(game, playerIndex) {
  const player = game.players[playerIndex];
  const ctx = { playerIndex, cardUid: '' };
  for (const id of player.augmentIds ?? []) {
    const augment = getAugment(id);
    if (player.turnsTaken === 1) runEffects(game, ctx, augment.openingEffects);
    runEffects(game, ctx, augment.startEffects);
  }
  if (hasAugment(game, playerIndex, 'quick_hands') && player.turnsTaken === 1) {
    player.actions += 1;
    drawCards(game, playerIndex, 1);
  }
  if (hasAugment(game, playerIndex, 'supply_pouch') && player.turnsTaken <= 3) {
    player.coins += 1;
  }
  if (hasAugment(game, playerIndex, 'second_wind') && player.hp * 2 <= player.maxHp) {
    player.hp = Math.min(player.maxHp, player.hp + 3);
  }
}

/** 행동카드 효과를 실행하기 직전에 호출한다. */
export function augmentExtraActionRuns(game, playerIndex, cardDef) {
  if (cardDef.type !== 'action' || (cardDef.actionCost ?? 0) < 1) return 0;
  if (hasAugment(game, playerIndex, 'chronocrown') && !game.turnState.augmentActionEchoUsed) {
    game.turnState.augmentActionEchoUsed = true;
    return 2;
  }
  return 0;
}

/** 캐릭터·카드와 같은 조건 평가로 처리하는 공격 보너스. */
export function augmentAttackBonuses(game, playerIndex) {
  return (game.players[playerIndex].augmentIds ?? [])
    .map((id) => getAugment(id).attackBonus).filter(Boolean);
}

