// 캐릭터 선택(stage 'select')와 카드 입고(stage 'draft') 화면.
import { getCharacter, getFaction, getCandidates, allFactionIds, getCardDef } from '/engine/index.js';
import { renderCard, cardTypeLabel } from './cards.js';

/** 입고할 카드 종류 수 */
const DRAFT_SIZE = 4;

/**
 * 화면 상단 보라 바를 만든다.
 * @param {string} title
 * @returns {HTMLElement}
 */
function topbar(title) {
  const bar = document.createElement('div');
  bar.className = 'topbar';
  bar.textContent = title;
  return bar;
}

/**
 * 캐릭터 카드(선택용 큰 카드)를 만든다.
 * @param {import('/engine/characters.js').CharacterDef} character
 * @param {{ chosen?: boolean, disabled?: boolean, onClick?: () => void }} opts
 * @returns {HTMLElement}
 */
function characterCard(character, opts = {}) {
  const el = document.createElement('div');
  el.className = 'character-card';
  if (opts.chosen) el.classList.add('chosen');
  if (opts.disabled) el.classList.add('disabled');

  const name = document.createElement('div');
  name.className = 'character-name';
  name.textContent = character.name;

  const hp = document.createElement('div');
  hp.className = 'character-hp';
  hp.textContent = `체력 ${character.maxHp}`;

  const ability = document.createElement('div');
  ability.className = 'character-ability';
  ability.textContent = character.abilityText;

  const preview = document.createElement('div');
  preview.className = 'card-row center';
  for (const cardId of character.cardIds) {
    preview.appendChild(renderCard(cardId, { mini: true }));
  }

  el.append(name, hp, ability, preview);
  if (opts.onClick && !opts.disabled) {
    el.addEventListener('click', opts.onClick);
  }
  return el;
}

/**
 * 캐릭터 선택 화면을 그린다.
 * @param {HTMLElement} root
 * @param {Record<string, any>} state
 * @param {{ send: (obj: any) => void }} net
 * @returns {void}
 */
export function renderSelect(root, state, net) {
  const view = state.view;
  const you = view.you;
  const myPick = view.picks[you];
  const oppIndex = you === 0 ? 1 : 0;
  const oppPick = view.picks[oppIndex];

  root.appendChild(topbar('캐릭터 선택'));

  const screen = document.createElement('div');
  screen.className = 'screen';

  const layout = document.createElement('div');
  layout.className = 'select-layout';

  // 모든 진영과 그 캐릭터를 보여준다(진영이 늘어나도 그대로 동작).
  for (const factionId of allFactionIds()) {
    const faction = getFaction(factionId);
    const factionName = document.createElement('div');
    factionName.className = 'faction-name';
    factionName.textContent = faction.name;
    layout.appendChild(factionName);

    const grid = document.createElement('div');
    grid.className = 'character-grid';
    for (const characterId of faction.characterIds) {
      const character = getCharacter(characterId);
      const chosen = myPick.characterId === characterId;
      grid.appendChild(
        characterCard(character, {
          chosen,
          disabled: myPick.characterId !== null,
          onClick: () => {
            net.send({ t: 'action', action: { type: 'selectCharacter', characterId } });
          },
        }),
      );
    }
    layout.appendChild(grid);
  }

  if (myPick.characterId) {
    const waiting = document.createElement('div');
    waiting.className = 'waiting-big';
    waiting.textContent = oppPick.characterId ? '상대도 캐릭터를 골랐습니다' : '상대 선택을 기다리는 중';
    layout.appendChild(waiting);
  }

  // 상대가 골랐다면 오른쪽 패널에 표시한다.
  if (oppPick.characterId) {
    const side = document.createElement('div');
    side.className = 'panel';
    const title = document.createElement('div');
    title.className = 'panel-title';
    title.textContent = '상대 캐릭터';
    side.appendChild(title);
    side.appendChild(characterCard(getCharacter(oppPick.characterId), { disabled: true }));
    layout.appendChild(side);
  }

  screen.appendChild(layout);
  root.appendChild(screen);
}

/**
 * 카드 입고 화면을 그린다.
 * @param {HTMLElement} root
 * @param {Record<string, any>} state
 * @param {{ send: (obj: any) => void }} net
 * @returns {void}
 */
export function renderDraft(root, state, net) {
  const view = state.view;
  const you = view.you;
  const oppIndex = you === 0 ? 1 : 0;
  const myPick = view.picks[you];
  const oppPick = view.picks[oppIndex];

  // 화면을 다시 그려도 선택이 유지되도록 state 에 보관한다.
  if (!Array.isArray(state.draftSelection)) state.draftSelection = [];
  if (typeof state.draftUpgraded !== 'boolean') state.draftUpgraded = false;
  const selection = state.draftSelection;
  const showUpgraded = state.draftUpgraded;

  const submitted = Array.isArray(myPick.cardIds) && myPick.cardIds.length > 0;

  root.appendChild(topbar('거래소 카드 입고하기'));

  const screen = document.createElement('div');
  screen.className = 'screen';

  const layout = document.createElement('div');
  layout.className = 'draft-layout';

  const main = document.createElement('div');
  main.className = 'draft-main';

  const guide = document.createElement('div');
  guide.className = 'draft-guide';
  guide.append(document.createTextNode('거래소에 입고할 카드 '));
  const strong = document.createElement('strong');
  strong.textContent = `${DRAFT_SIZE}종류`;
  guide.append(strong, document.createTextNode('를 선택해주세요.'));
  main.appendChild(guide);

  const candidates = myPick.characterId ? getCandidates(myPick.characterId) : [];
  const factionCardIds = myPick.characterId ? getFaction(getCharacter(myPick.characterId).factionId).cardIds : [];
  const rows = [
    { label: '진영 카드', ids: candidates.filter((id) => factionCardIds.includes(id)) },
    { label: '캐릭터 카드', ids: candidates.filter((id) => !factionCardIds.includes(id)) },
  ];

  for (const row of rows) {
    if (row.ids.length === 0) continue;
    const rowWrap = document.createElement('div');
    const rowLabel = document.createElement('div');
    rowLabel.className = 'draft-row-label';
    rowLabel.textContent = row.label;
    const cardRow = document.createElement('div');
    cardRow.className = 'card-row';
    for (const cardId of row.ids) {
      const index = selection.indexOf(cardId);
      const selected = index >= 0;
      const disabled = submitted || (!selected && selection.length >= DRAFT_SIZE);
      cardRow.appendChild(
        renderCard(cardId, {
          upgraded: showUpgraded,
          selected,
          disabled,
          badge: selected ? index + 1 : undefined,
          onClick: () => {
            if (submitted) return;
            const at = selection.indexOf(cardId);
            if (at >= 0) {
              selection.splice(at, 1);
            } else if (selection.length < DRAFT_SIZE) {
              selection.push(cardId);
            }
            state.render();
          },
        }),
      );
    }
    rowWrap.append(rowLabel, cardRow);
    main.appendChild(rowWrap);
  }

  // 하단: 강화 미리보기 토글 / 확정 / 안내문
  const footer = document.createElement('div');
  footer.className = 'draft-footer';

  const upgradeBtn = document.createElement('button');
  upgradeBtn.className = 'btn small';
  if (showUpgraded) upgradeBtn.classList.add('toggle-on');
  upgradeBtn.textContent = '강화된 카드 미리보기';
  upgradeBtn.addEventListener('click', () => {
    state.draftUpgraded = !state.draftUpgraded;
    state.render();
  });

  const confirmBtn = document.createElement('button');
  confirmBtn.className = 'btn primary';
  confirmBtn.textContent = submitted ? '상대를 기다리는 중' : `확정하기 (${selection.length}/${DRAFT_SIZE})`;
  confirmBtn.disabled = submitted || selection.length !== DRAFT_SIZE;
  confirmBtn.addEventListener('click', () => {
    if (selection.length !== DRAFT_SIZE) return;
    net.send({ t: 'action', action: { type: 'draft', cardIds: selection.slice() } });
  });

  const hint = document.createElement('div');
  hint.className = 'draft-hint';
  hint.textContent = submitted ? '상대를 기다리는 중' : '준비되면 카드 4종을 확정해주세요!';

  footer.append(upgradeBtn, confirmBtn, hint);
  main.appendChild(footer);

  // 오른쪽 패널
  const side = document.createElement('div');
  side.className = 'draft-side';

  const neutralPanel = document.createElement('div');
  neutralPanel.className = 'panel';
  const neutralTitle = document.createElement('div');
  neutralTitle.className = 'panel-title';
  neutralTitle.textContent = '중립 거래소 카드';
  neutralPanel.appendChild(neutralTitle);
  const neutralRow = document.createElement('div');
  neutralRow.className = 'draft-preview-list';
  for (const cardId of view.neutralIds || []) {
    const def = getCardDef(cardId);
    const preview = document.createElement('article');
    preview.className = 'draft-preview';
    const thumbnail = renderCard(cardId, { mini: true, upgraded: showUpgraded });
    thumbnail.removeAttribute('role');
    const info = document.createElement('div');
    info.className = 'draft-preview-info';
    const name = document.createElement('h3');
    name.textContent = def.name;
    const meta = document.createElement('div');
    meta.className = 'draft-preview-meta';
    meta.textContent = `${cardTypeLabel(def.type)} · ${def.cost}원${def.type === 'action' ? ` · 행동력 ${def.actionCost ?? 0}` : ''}`;
    const effect = document.createElement('p');
    effect.className = 'draft-preview-effect';
    effect.textContent = `${showUpgraded ? '★ 강화' : '기본'} · ${showUpgraded && def.upgradedText ? def.upgradedText : def.text}`;
    info.append(name, meta, effect);
    preview.append(thumbnail, info);
    neutralRow.appendChild(preview);
  }
  neutralPanel.appendChild(neutralRow);
  side.appendChild(neutralPanel);

  const oppPanel = document.createElement('div');
  oppPanel.className = 'panel';
  const oppTitle = document.createElement('div');
  oppTitle.className = 'panel-title';
  oppTitle.textContent = '상대의 상황:';
  oppPanel.appendChild(oppTitle);

  if (oppPick.characterId) {
    const character = getCharacter(oppPick.characterId);
    const line = document.createElement('div');
    line.className = 'opponent-line';
    line.textContent = `${character.name} · 체력 ${character.maxHp}`;
    oppPanel.appendChild(line);
  } else {
    const line = document.createElement('div');
    line.className = 'opponent-line muted';
    line.textContent = '상대 캐릭터 정보 없음';
    oppPanel.appendChild(line);
  }

  const done = Array.isArray(oppPick.cardIds) && oppPick.cardIds.length > 0;
  const pill = document.createElement('span');
  pill.className = 'status-pill';
  if (done) pill.classList.add('done');
  pill.textContent = done ? '입고 완료' : '고르는 중';
  oppPanel.appendChild(pill);
  side.appendChild(oppPanel);

  layout.append(main, side);
  screen.appendChild(layout);
  root.appendChild(screen);
}
