// 카드 한 장을 DOM 으로 그린다. 카드 정보는 engine 의 getCardDef 에서 직접 얻는다.
import { getCardDef } from '/engine/index.js';

/** @typedef {{ upgraded?: boolean, selected?: boolean, disabled?: boolean, mini?: boolean,
 *  price?: number, onClick?: (ev: MouseEvent) => void, badge?: number|string }} CardOpts */

/** 카드 종류별 이모지 아이콘 */
const TYPE_ICONS = { money: '💰', weapon: '🔫', action: '📜' };

/**
 * 카드 종류의 한국어 이름.
 * @param {'money'|'weapon'|'action'|string} type
 * @returns {string}
 */
export function cardTypeLabel(type) {
  if (type === 'money') return '재화';
  if (type === 'weapon') return '무기';
  if (type === 'action') return '행동';
  return String(type);
}

/**
 * 카드 요소를 만든다.
 * @param {string} cardId
 * @param {CardOpts} [opts]
 * @returns {HTMLElement}
 */
export function renderCard(cardId, opts = {}) {
  const def = getCardDef(cardId);
  const upgraded = Boolean(opts.upgraded);
  const type = def.type;

  const el = document.createElement('div');
  el.className = `card type-${type}`;
  if (upgraded) el.classList.add('upgraded');
  if (opts.selected) el.classList.add('selected');
  if (opts.disabled) el.classList.add('disabled');
  if (opts.mini) el.classList.add('mini');
  el.dataset.cardId = cardId;
  el.setAttribute('role', 'button');
  el.setAttribute('aria-label', `${def.name} (${cardTypeLabel(type)})`);

  // 왼쪽 위 깃발 배지
  const flag = document.createElement('div');
  flag.className = 'card-flag';
  if (type === 'action') {
    flag.textContent = `⚡ ${def.actionCost ?? 0}`;
  } else {
    flag.textContent = cardTypeLabel(type);
  }
  el.appendChild(flag);

  // 오른쪽 위 작은 숫자 배지(예: 시장 남은 장수)
  if (opts.badge !== undefined && opts.badge !== null) {
    const badge = document.createElement('div');
    badge.className = 'card-badge';
    badge.textContent = String(opts.badge);
    el.appendChild(badge);
  }

  // 강화 표시
  if (upgraded) {
    const star = document.createElement('div');
    star.className = 'card-star';
    star.textContent = '★';
    el.appendChild(star);
  }

  // 큰 아이콘
  const icon = document.createElement('div');
  icon.className = 'card-icon';
  icon.textContent = TYPE_ICONS[type] || '❔';
  el.appendChild(icon);

  // 이름 리본
  const name = document.createElement('div');
  name.className = 'card-name';
  name.textContent = def.name;
  el.appendChild(name);

  // 효과 문구
  const text = document.createElement('div');
  text.className = 'card-text';
  const body = upgraded && def.upgradedText ? def.upgradedText : def.text;
  text.textContent = body || '';
  el.appendChild(text);

  // 구매가 배지
  const price = document.createElement('div');
  price.className = 'card-price';
  price.textContent = String(opts.price !== undefined && opts.price !== null ? opts.price : def.cost);
  el.appendChild(price);

  if (typeof opts.onClick === 'function') {
    el.classList.add('clickable');
    el.addEventListener('click', opts.onClick);
  }
  return el;
}
