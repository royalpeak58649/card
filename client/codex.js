import { allCardIds, getCardDef, allCharacterIds, getCharacter, allFactionIds, getFaction, AUGMENTS } from '/engine/index.js';
import { renderCard, cardTypeLabel } from './cards.js';
import { element as el, openDialog } from './dialogs.js';

export function showCodex() {
  const { body } = openDialog('전략 도감');
  body.appendChild(el('p', 'muted', '카드와 캐릭터, 모험의 적과 증강을 살펴보고 다음 전투를 준비하세요.'));
  const controls = el('div', 'codex-controls');
  const tabs = el('div', 'codex-tabs');
  let category = 'cards';
  const categories = [['cards', '카드'], ['characters', '캐릭터'], ['enemies', '보스'], ['augments', '증강']];
  const buttons = categories.map(([id, label]) => {
    const button = el('button', 'btn small', label);
    button.addEventListener('click', () => { category = id; render(); });
    tabs.appendChild(button);
    return button;
  });
  const search = el('input', 'input');
  search.type = 'search';
  search.placeholder = '이름이나 효과 검색';
  search.setAttribute('aria-label', '도감 검색');
  const faction = el('select', 'input');
  faction.setAttribute('aria-label', '진영 필터');
  for (const [id, name] of [['', '모든 진영'], ['basic', '기본 공급'], ['neutral', '중립'], ...allFactionIds(true).map((id) => [id, getFaction(id).name])]) {
    const option = el('option', '', name);
    option.value = id;
    faction.appendChild(option);
  }
  const type = el('select', 'input');
  type.setAttribute('aria-label', '카드 종류 필터');
  for (const [id, name] of [['', '모든 종류'], ['money', '재화'], ['action', '행동'], ['weapon', '무기']]) {
    const option = el('option', '', name);
    option.value = id;
    type.appendChild(option);
  }
  controls.append(tabs, search, faction, type);
  const count = el('p', 'muted');
  count.setAttribute('aria-live', 'polite');
  const grid = el('div', 'codex-grid');
  body.append(controls, count, grid);

  // 카드 데이터에 없는 소속은 진영·캐릭터 정의에서 읽는다.
  const affiliation = new Map();
  for (const id of allFactionIds(true)) {
    for (const card of getFaction(id).cardIds) affiliation.set(card, { id, label: getFaction(id).name });
  }
  for (const id of allCharacterIds(true)) {
    const character = getCharacter(id);
    for (const card of character.cardIds) affiliation.set(card, { id: character.factionId, label: `${getFaction(character.factionId).name} · ${character.name} 전용` });
  }
  function render() {
    grid.textContent = '';
    buttons.forEach((button, i) => {
      const active = categories[i][0] === category;
      button.classList.toggle('primary', active);
      button.setAttribute('aria-pressed', String(active));
    });
    type.hidden = category !== 'cards';
    faction.hidden = category === 'augments';
    const query = search.value.trim().toLocaleLowerCase();
    const matches = (...parts) => parts.join(' ').toLocaleLowerCase().includes(query);
    let total = 0;
    if (category === 'cards') {
      for (const id of allCardIds()) {
        const card = getCardDef(id);
        const group = affiliation.get(id) || { id: card.basic ? 'basic' : 'neutral', label: card.basic ? '기본 공급' : '중립' };
        if (faction.value && faction.value !== group.id) continue;
        if (type.value && type.value !== card.type) continue;
        if (!matches(card.name, card.text, card.upgradedText || '', group.label)) continue;
        const entry = el('article', 'codex-entry');
        const thumbnail = renderCard(id, { mini: true });
        thumbnail.removeAttribute('role');
        const info = el('div', 'codex-info');
        info.append(el('h3', '', card.name), el('div', 'codex-meta', `${group.label} · ${cardTypeLabel(card.type)} · ${card.cost}원${card.type === 'action' ? ` · 행동력 ${card.actionCost ?? 0}` : ''}`), el('p', '', `기본 · ${card.text}`), el('p', 'codex-upgrade', card.basic ? '기본 공급 카드는 강화할 수 없습니다.' : `★ 강화 · ${card.upgradedText || card.text}`));
        if (card.surchargeFirst) info.appendChild(el('small', 'muted', `처음 구매되는 ${card.surchargeFirst}장은 +1원`));
        entry.append(thumbnail, info);
        grid.appendChild(entry);
        total++;
      }
    } else if (category === 'characters' || category === 'enemies') {
      for (const id of allCharacterIds(true)) {
        const character = getCharacter(id);
        if (Boolean(character.enemy) !== (category === 'enemies')) continue;
        const group = getFaction(character.factionId);
        if (faction.value && faction.value !== group.id) continue;
        if (!matches(character.name, character.abilityText, group.name)) continue;
        const entry = el('article', 'codex-entry codex-character');
        entry.append(el('h3', '', character.name), el('div', 'codex-meta', `${group.name} · 최대 체력 ${character.maxHp}`), el('p', '', character.abilityText));
        const cards = [...new Set(character.startDeck || character.cardIds)];
        for (const cardId of cards) {
          const card = getCardDef(cardId);
          entry.appendChild(el('p', 'codex-linked', `${card.name} · ${card.text}`));
        }
        grid.appendChild(entry);
        total++;
      }
    } else {
      for (const augment of AUGMENTS) {
        if (!matches(augment.name, augment.text, `${augment.rarity}성`)) continue;
        const entry = el('article', `codex-entry codex-character augment-${augment.rarity}`);
        entry.append(el('div', 'codex-meta', '★'.repeat(augment.rarity)), el('h3', '', augment.name), el('p', '', augment.text));
        grid.appendChild(entry);
        total++;
      }
    }
    count.textContent = `${total}개 항목`;
    if (!total) grid.appendChild(el('p', 'muted', '조건에 맞는 항목이 없습니다. 검색어나 필터를 바꿔 보세요.'));
  }
  search.addEventListener('input', render);
  faction.addEventListener('change', render);
  type.addEventListener('change', render);
  render();
}
