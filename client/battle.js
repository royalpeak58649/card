// 대전 화면(stage 'playing' / 'finished'). 서버가 보낸 view 를 그리기만 하고 조작은 action 으로 보낸다.
import { getCardDef, getCharacter } from '/engine/index.js';
import { renderCard, cardTypeLabel } from './cards.js';

/** battle.css 를 한 번만 불러오기 위한 표시 */
const CSS_HREF = '/client/battle.css';
/** 로그에 보여줄 최대 줄 수 */
const LOG_LINES = 12;
/** 별 최대 개수(engine/effects.js 의 MAX_STARS 와 같다) */
const MAX_STARS = 5;
/** 한 차례 최대 일시 강화 장수(engine/turn.js 와 같다) */
const MAX_TEMP_UPGRADES = 3;
/** 일시 강화 비용(별) */
const TEMP_UPGRADE_COST = 1;
/** 영구 강화 비용(별) */
const PERM_UPGRADE_COST = 4;
/** 카드가 아닌 선택지 키워드의 표시 이름 */
const KEYWORD_LABELS = { trash: '제거', discard: '버리기', pay: '★ 별 사용', skip: '사용 안 함' };
/** 세션 저장 키(client/net.js 와 같다) */
const SESSION_KEY = 'cardDuel.session';

/** 단계 표시 순서 */
const PHASES = [
  { id: 'action', label: '행동단계' },
  { id: 'buy', label: '구매단계' },
  { id: 'attack', label: '공격단계' },
];

/** 거래소 패널의 종류 묶음 순서 */
const MARKET_GROUPS = ['money', 'weapon', 'action'];

// 화면을 다시 그려도 유지할 상태(모듈 변수).
/** 거래소 서랍 열림 여부 */
let marketOpen = false;
/** 버린 더미 패널 열림 여부 */
let discardOpen = false;
/** 강화 메뉴를 연 카드 uid */
let upgradeMenuUid = null;
/** 선택 창에서 고르던 항목 */
let choiceSelection = [];
/** choiceSelection 이 속한 pending 의 서명 */
let choiceKey = null;

/**
 * battle.css 를 아직 넣지 않았으면 <link> 를 추가한다.
 * @returns {void}
 */
function ensureStyles() {
  if (document.querySelector('link[data-battle-css]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = CSS_HREF;
  link.dataset.battleCss = '1';
  document.head.appendChild(link);
}

/**
 * 글자만 담은 요소를 만든다.
 * @param {string} tag
 * @param {string} [className]
 * @param {string} [text]
 * @returns {HTMLElement}
 */
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/**
 * 버튼을 만든다.
 * @param {string} label
 * @param {string} className
 * @param {() => void} onClick
 * @param {boolean} [disabled]
 * @returns {HTMLButtonElement}
 */
function button(label, className, onClick, disabled = false) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = className;
  btn.textContent = label;
  btn.disabled = Boolean(disabled);
  if (!disabled) btn.addEventListener('click', onClick);
  return btn;
}

/**
 * 카드 정의를 안전하게 얻는다(없으면 null).
 * @param {string} cardId
 * @returns {import('/engine/cards/registry.js').CardDef | null}
 */
function safeCardDef(cardId) {
  try {
    return getCardDef(cardId);
  } catch {
    return null;
  }
}

/**
 * 캐릭터 이름을 안전하게 얻는다.
 * @param {string|null} characterId
 * @returns {string}
 */
function safeCharacter(characterId) {
  if (!characterId) return null;
  try {
    return getCharacter(characterId);
  } catch {
    return null;
  }
}

/**
 * @param {string|null} characterId
 * @returns {string}
 */
function characterName(characterId) {
  if (!characterId) return '알 수 없음';
  try {
    return getCharacter(characterId).name;
  } catch {
    return String(characterId);
  }
}

/**
 * 카드 인스턴스의 표시용 cardId 를 얻는다.
 * @param {any} card
 * @returns {string}
 */
function cardIdOf(card) {
  return card && typeof card.cardId === 'string' ? card.cardId : '';
}

/**
 * 카드 인스턴스의 이름.
 * @param {any} card
 * @returns {string}
 */
function cardName(card) {
  const def = safeCardDef(cardIdOf(card));
  return def ? def.name : cardIdOf(card);
}

/**
 * 게임 조작을 서버로 보낸다.
 * @param {{ send: (obj: any) => void }} net
 * @param {Record<string, any>} action
 * @returns {void}
 */
function sendGame(net, action) {
  net.send({ t: 'action', action: { type: 'game', action } });
}

/**
 * 표시용 구매가를 계산한다(PROTOCOL.md 규칙, 실제 판정은 서버).
 * @param {Record<string, any>} g
 * @param {string} cardId
 * @param {number} you
 * @param {boolean} myTurn
 * @returns {number}
 */
function displayPrice(g, cardId, you, myTurn) {
  const def = safeCardDef(cardId);
  if (!def) return 0;
  const slot = g.market[cardId] || { count: 0, bought: 0 };
  let price = def.cost;
  if (def.surchargeFirst !== undefined && slot.bought < def.surchargeFirst) price += 1;
  if (myTurn) {
    price -= g.turnState?.mods?.marketDiscount ?? 0;
    const me = g.players[you];
    if (def.type === 'weapon' && me && me.characterId) {
      let discount = 0;
      try {
        discount = getCharacter(me.characterId).ability?.firstWeaponDiscount ?? 0;
      } catch {
        discount = 0;
      }
      const bought = g.turnState?.bought ?? [];
      const boughtWeapon = bought.some((id) => safeCardDef(id)?.type === 'weapon');
      if (discount > 0 && !boughtWeapon) price -= discount;
    }
  }
  return Math.max(0, price);
}

/**
 * 손패 카드를 지금 낼 수 있는지 검사한다.
 * @param {Record<string, any>} g
 * @param {Record<string, any>} me
 * @param {any} card
 * @param {boolean} canAct
 * @returns {boolean}
 */
function canPlayCard(g, me, card, canAct) {
  if (!canAct) return false;
  const def = safeCardDef(cardIdOf(card));
  if (!def) return false;
  if (def.type === 'action') {
    return g.phase === 'action' && (def.actionCost ?? 0) <= me.actions;
  }
  if (def.type === 'money') return g.phase === 'buy';
  if (def.type === 'weapon') return g.phase === 'attack';
  return false;
}

/**
 * 강화할 수 있는 카드인지 검사한다.
 * @param {any} card
 * @returns {boolean}
 */
function canUpgradeCard(card) {
  const def = safeCardDef(cardIdOf(card));
  if (!def) return false;
  if (def.basic === true) return false;
  if (!def.upgradedEffects) return false;
  return card.upgraded !== true;
}

/**
 * 별 표시(채워진 수 = stars).
 * @param {number} stars
 * @returns {HTMLElement}
 */
function starRow(stars) {
  const row = el('div', 'bt-stars');
  const filled = Math.max(0, Math.min(MAX_STARS, stars || 0));
  for (let i = 0; i < MAX_STARS; i++) {
    row.appendChild(el('span', i < filled ? 'bt-star on' : 'bt-star', '★'));
  }
  return row;
}

/**
 * 로그 한 줄을 문장으로 만든다.
 * @param {Record<string, any>} entry
 * @param {number} you
 * @returns {string}
 */
function logText(entry, you) {
  const who = entry.p === you ? '나' : '상대';
  const name = entry.cardId ? (safeCardDef(entry.cardId)?.name ?? entry.cardId) : '';
  switch (entry.type) {
    case 'playCard':
      return `${entry.turn}턴 · ${who}: ${name} 사용`;
    case 'buy':
      return `${entry.turn}턴 · ${who}: ${name} 구매`;
    case 'upgrade':
      return `${entry.turn}턴 · ${who}: ${name} 강화(${entry.mode === 'perm' ? '영구' : '일시'})`;
    case 'playAllMoney':
      return `${entry.turn}턴 · ${who}: 재화 모두 내기`;
    case 'choose':
      return `${entry.turn}턴 · ${who}: 선택 완료`;
    case 'activateAbility':
      return `${entry.turn}턴 · ${who}: 캐릭터 능력 발동!`;
    default:
      return '';
  }
}

/**
 * 상대(또는 나)의 요약 패널을 만든다.
 * @param {Record<string, any>} player
 * @param {{ opponent?: boolean, connected?: boolean, active?: boolean, ongoing?: boolean }} opts
 * @returns {HTMLElement}
 */
function playerSummary(player, opts = {}) {
  const box = el('div', opts.opponent ? 'bt-summary bt-summary-opp' : 'bt-summary bt-summary-me');

  const tiles = el('div', 'bt-tiles');
  const deckTile = el('div', 'bt-tile');
  deckTile.append(el('span', 'bt-tile-icon', '🂠'), el('span', 'bt-tile-num', String(player.drawCount ?? 0)));
  deckTile.title = '뽑을 덱';
  const discardTile = el('div', 'bt-tile');
  discardTile.append(
    el('span', 'bt-tile-icon', '🗑'),
    el('span', 'bt-tile-num', String((player.discard || []).length)),
  );
  discardTile.title = '버린 더미';
  tiles.append(deckTile, discardTile);

  const hp = el('div', 'bt-hp');
  const hpNum = el('span', 'bt-hp-num', String(player.hp));
  if ((player.hp ?? 0) <= 0) hpNum.classList.add('bt-hp-num-dead');
  hp.append(el('span', 'bt-hp-icon', '❤'), hpNum);
  hp.append(el('span', 'bt-hp-max', `/ ${player.maxHp}`));
  // 0 이하인데 경기가 계속 중이면(라운드 끝 판정 전) 마지막 반격 기회를 알린다.
  if ((player.hp ?? 0) <= 0 && opts.ongoing === true) {
    hp.appendChild(el('span', 'bt-last-stand', '마지막 반격!'));
  }

  const defense = el('div', 'bt-defense');
  if ((player.defense ?? 0) > 0) defense.textContent = `🛡 ${player.defense}`;

  const namePanel = el('div', 'bt-name', characterName(player.characterId));
  const character = safeCharacter(player.characterId);
  if (character) {
    namePanel.title = character.abilityText ?? '';
    if (character.ability?.activeAbility && player.abilityUsed) {
      namePanel.appendChild(el('span', 'bt-ability-used', ' · 능력 사용함'));
    }
  }

  box.append(tiles, hp, starRow(player.stars), defense, namePanel);

  if (opts.active) box.appendChild(el('div', 'bt-turn-tag', '상대 차례 진행중'));
  if (opts.opponent && opts.connected === false) {
    box.appendChild(el('div', 'bt-disconnected', '연결 끊김'));
  }
  return box;
}

/**
 * 상대 영역(손패 뒷면 + 요약).
 * @param {Record<string, any>} g
 * @param {Record<string, any>} opp
 * @param {Record<string, any>|null} opponent
 * @param {boolean} oppTurn
 * @param {boolean} ongoing 경기가 계속 중인지(라운드 끝 판정 전)
 * @returns {HTMLElement}
 */
function opponentArea(g, opp, opponent, oppTurn, ongoing) {
  const area = el('div', 'bt-opp');

  const handWrap = el('div', 'bt-opp-hand');
  const count = opp.handCount ?? 0;
  for (let i = 0; i < count; i++) {
    const back = el('div', 'card mini back');
    back.setAttribute('aria-label', '상대 손패');
    handWrap.appendChild(back);
  }
  if (count === 0) handWrap.appendChild(el('div', 'bt-muted', '손패 없음'));
  area.appendChild(handWrap);

  const connected = opponent ? opponent.connected !== false : true;
  area.appendChild(playerSummary(opp, { opponent: true, connected, active: oppTurn, ongoing }));
  return area;
}

/**
 * 가운데 판(단계 표시 · 이번 차례 낸 카드 · 누적 피해 · 턴 표시).
 * @param {Record<string, any>} g
 * @param {number} you
 * @param {boolean} myTurn
 * @returns {HTMLElement}
 */
function centerBoard(g, you, myTurn) {
  const board = el('div', 'bt-center');

  const phases = el('div', 'bt-phases');
  for (const phase of PHASES) {
    const cell = el('div', 'bt-phase', phase.label);
    if (g.phase === phase.id) cell.classList.add('current');
    if (!myTurn) cell.classList.add('dim');
    phases.appendChild(cell);
  }
  board.appendChild(phases);

  const activePlayer = g.players[g.activeIndex];
  const inPlay = (activePlayer && activePlayer.inPlay) || [];
  const inPlayRow = el('div', 'bt-inplay');
  if (inPlay.length === 0) {
    inPlayRow.appendChild(el('div', 'bt-muted', '이번 차례 낸 카드 없음'));
  } else {
    for (const card of inPlay) {
      inPlayRow.appendChild(renderCard(cardIdOf(card), { mini: true, upgraded: card.upgraded === true }));
    }
  }
  board.appendChild(inPlayRow);

  if (g.phase === 'attack') {
    const damage = el('div', 'bt-damage');
    damage.append(el('span', 'bt-damage-label', '누적 피해 '));
    damage.append(el('span', 'bt-damage-num', String(g.turnState?.attackDamage ?? 0)));
    board.appendChild(damage);
  }

  const first = g.firstPlayerIndex === you ? '선공' : '후공';
  board.appendChild(el('div', 'bt-turninfo', `${g.turn}턴 · ${first}`));
  return board;
}

/**
 * 왼쪽 열(거래소 버튼 · 제거된 카드 수 · 내 자원).
 * @param {Record<string, any>} g
 * @param {Record<string, any>} me
 * @param {() => void} onToggleMarket
 * @returns {HTMLElement}
 */
function leftColumn(g, me, onToggleMarket) {
  const col = el('div', 'bt-left');

  const marketBtn = button('🛍 거래소', 'bt-market-btn', onToggleMarket);
  if (marketOpen) marketBtn.classList.add('open');
  col.appendChild(marketBtn);

  const trash = el('div', 'bt-trash');
  trash.append(el('span', 'bt-trash-icon', '🚮'), el('span', 'bt-trash-num', String((g.trash || []).length)));
  trash.title = '제거된 카드 수';
  col.appendChild(trash);

  const res = el('div', 'bt-resources');
  const rows = [
    { icon: '⚡', label: '행동력', value: me.actions },
    { icon: '🛒', label: '구매', value: me.buys },
    { icon: '💰', label: '원', value: me.coins },
  ];
  for (const row of rows) {
    const item = el('div', 'bt-res');
    item.append(el('span', 'bt-res-icon', row.icon));
    item.append(el('span', 'bt-res-label', row.label));
    item.append(el('span', 'bt-res-value', String(row.value ?? 0)));
    res.appendChild(item);
  }
  col.appendChild(res);
  return col;
}

/**
 * 내 손패 카드 한 장(강화 ★ 버튼 포함).
 * @param {Record<string, any>} g
 * @param {Record<string, any>} me
 * @param {any} card
 * @param {{ canAct: boolean, myTurn: boolean, net: { send: (obj: any) => void }, rerender: () => void }} ctx
 * @returns {HTMLElement}
 */
function handCard(g, me, card, ctx) {
  const playable = canPlayCard(g, me, card, ctx.canAct);
  const wrap = el('div', 'bt-hand-card');

  const cardEl = renderCard(cardIdOf(card), {
    upgraded: card.upgraded === true,
    disabled: !playable,
    onClick: playable
      ? () => {
          upgradeMenuUid = null;
          sendGame(ctx.net, { type: 'playCard', uid: card.uid });
        }
      : undefined,
  });
  wrap.appendChild(cardEl);

  if (ctx.canAct && canUpgradeCard(card)) {
    const starBtn = button('★', 'bt-upgrade-btn', (ev) => {
      ev.stopPropagation();
      upgradeMenuUid = upgradeMenuUid === card.uid ? null : card.uid;
      ctx.rerender();
    });
    starBtn.title = '강화';
    wrap.appendChild(starBtn);

    if (upgradeMenuUid === card.uid) {
      const menu = el('div', 'bt-upgrade-menu');
      const tempOk = me.stars >= TEMP_UPGRADE_COST && (g.turnState?.tempUpgrades ?? 0) < MAX_TEMP_UPGRADES;
      const permCost = safeCharacter(me.characterId)?.ability?.permUpgradeCost ?? PERM_UPGRADE_COST;
      const permOk = me.stars >= permCost;
      menu.appendChild(
        button(`일시 강화 ★${TEMP_UPGRADE_COST}`, 'bt-menu-btn', () => {
          upgradeMenuUid = null;
          sendGame(ctx.net, { type: 'upgrade', uid: card.uid, mode: 'temp' });
        }, !tempOk),
      );
      menu.appendChild(
        button(`영구 강화 ★${permCost}`, 'bt-menu-btn', () => {
          upgradeMenuUid = null;
          sendGame(ctx.net, { type: 'upgrade', uid: card.uid, mode: 'perm' });
        }, !permOk),
      );
      wrap.appendChild(menu);
    }
  }
  return wrap;
}

/**
 * 아래쪽(내 영역): 손패 · 덱/버린 더미 · 내 요약.
 * @param {Record<string, any>} g
 * @param {Record<string, any>} me
 * @param {{ canAct: boolean, myTurn: boolean, ongoing: boolean, net: { send: (obj: any) => void }, rerender: () => void }} ctx
 * @returns {HTMLElement}
 */
function myArea(g, me, ctx) {
  const area = el('div', 'bt-me');

  const hand = el('div', 'bt-hand');
  const cards = me.hand || [];
  if (cards.length > 6) hand.classList.add('crowded');
  if (cards.length === 0) hand.appendChild(el('div', 'bt-muted', '손패 없음'));
  for (const card of cards) hand.appendChild(handCard(g, me, card, ctx));
  area.appendChild(hand);

  const bottom = el('div', 'bt-me-bottom');

  const deck = el('div', 'bt-tile bt-deck');
  deck.append(el('span', 'bt-tile-icon', '🂠'), el('span', 'bt-tile-num', String(me.drawCount ?? 0)));
  deck.title = '내 덱';

  const discardBtn = button('', 'bt-tile bt-discard', () => {
    discardOpen = !discardOpen;
    ctx.rerender();
  });
  discardBtn.append(el('span', 'bt-tile-icon', '🗑'), el('span', 'bt-tile-num', String((me.discard || []).length)));
  discardBtn.title = '버린 더미 보기';
  if (discardOpen) discardBtn.classList.add('open');

  bottom.append(deck, discardBtn);
  bottom.appendChild(playerSummary(me, { ongoing: ctx.ongoing }));
  area.appendChild(bottom);
  return area;
}

/**
 * 오른쪽 아래 조작 버튼.
 * @param {Record<string, any>} g
 * @param {Record<string, any>} me
 * @param {{ canAct: boolean, net: { send: (obj: any) => void } }} ctx
 * @returns {HTMLElement}
 */
function actionButtons(g, me, ctx) {
  const box = el('div', 'bt-actions');
  const canAct = ctx.canAct;

  if (g.phase === 'action') {
    box.appendChild(button('구매단계로', 'btn small primary', () => sendGame(ctx.net, { type: 'endPhase' }), !canAct));
  } else if (g.phase === 'buy') {
    box.appendChild(button('공격단계로', 'btn small primary', () => sendGame(ctx.net, { type: 'endPhase' }), !canAct));
    const hasMoney = (me.hand || []).some((c) => safeCardDef(cardIdOf(c))?.type === 'money');
    if (hasMoney) {
      box.appendChild(
        button('재화 모두 내기', 'btn small', () => sendGame(ctx.net, { type: 'playAllMoney' }), !canAct),
      );
    }
  } else if (g.phase === 'attack') {
    box.appendChild(button('차례 끝내기', 'btn small primary', () => sendGame(ctx.net, { type: 'endPhase' }), !canAct));
  }
  const character = safeCharacter(me.characterId);
  const active = character?.ability?.activeAbility;
  if (active && !me.abilityUsed) {
    const btn = button('✨ 능력 발동', 'btn small bt-ability-btn', () => {
      if (window.confirm(`${character.name} 능력을 발동할까요? (경기 중 1번)\n${active.text ?? character.abilityText ?? ''}`)) {
        sendGame(ctx.net, { type: 'activateAbility' });
      }
    }, !canAct);
    btn.title = active.text ?? character.abilityText ?? '';
    box.appendChild(btn);
  }
  if (g.turnState?.mods?.actionDamageBonus > 0 && g.activeIndex === ctx.you) {
    box.appendChild(el('div', 'bt-ability-on', `능력 발동 중: 피해 행동카드 +${g.turnState.mods.actionDamageBonus}`));
  }
  return box;
}

/**
 * 오른쪽 로그 패널.
 * @param {Record<string, any>} g
 * @param {number} you
 * @returns {HTMLElement}
 */
function logPanel(g, you) {
  const panel = el('div', 'bt-log');
  panel.appendChild(el('div', 'bt-log-title', '기록'));
  const list = el('div', 'bt-log-list');
  const entries = (g.log || []).slice(-LOG_LINES);
  if (entries.length === 0) list.appendChild(el('div', 'bt-muted', '아직 기록이 없습니다'));
  for (const entry of entries) {
    const text = logText(entry, you);
    if (!text) continue;
    list.appendChild(el('div', 'bt-log-line', text));
  }
  panel.appendChild(list);
  return panel;
}

/**
 * 거래소 서랍.
 * @param {Record<string, any>} g
 * @param {Record<string, any>} me
 * @param {{ you: number, myTurn: boolean, canAct: boolean, net: { send: (obj: any) => void }, rerender: () => void }} ctx
 * @returns {HTMLElement}
 */
function marketDrawer(g, me, ctx) {
  const drawer = el('div', 'bt-drawer bt-market');

  const head = el('div', 'bt-drawer-head');
  head.appendChild(el('div', 'bt-drawer-title', '🛍 거래소'));
  head.appendChild(
    el('div', 'bt-drawer-info', `💰 ${me.coins}원 · 🛒 구매 ${me.buys}`),
  );
  head.appendChild(
    button('닫기', 'btn small', () => {
      marketOpen = false;
      ctx.rerender();
    }),
  );
  drawer.appendChild(head);

  const body = el('div', 'bt-drawer-body');
  const marketIds = Object.keys(g.market || {});
  for (const type of MARKET_GROUPS) {
    const ids = marketIds.filter((id) => safeCardDef(id)?.type === type);
    if (ids.length === 0) continue;
    body.appendChild(el('div', 'bt-group-label', cardTypeLabel(type)));
    const row = el('div', 'bt-market-row');
    for (const cardId of ids) {
      const slot = g.market[cardId];
      const price = displayPrice(g, cardId, ctx.you, ctx.myTurn);
      const soldOut = (slot.count ?? 0) <= 0;
      const affordable = ctx.canAct && g.phase === 'buy' && me.buys >= 1 && me.coins >= price;
      const disabled = soldOut || !affordable;
      const cardEl = renderCard(cardId, {
        price,
        badge: slot.count,
        disabled,
        onClick: disabled
          ? undefined
          : () => {
              sendGame(ctx.net, { type: 'buy', cardId });
            },
      });
      if (soldOut) {
        const tag = el('div', 'bt-soldout', '매진');
        cardEl.appendChild(tag);
      }
      row.appendChild(cardEl);
    }
    body.appendChild(row);
  }
  drawer.appendChild(body);
  return drawer;
}

/**
 * 버린 더미 패널.
 * @param {Record<string, any>} me
 * @param {() => void} rerender
 * @returns {HTMLElement}
 */
function discardDrawer(me, rerender) {
  const drawer = el('div', 'bt-drawer bt-discard-panel');
  const head = el('div', 'bt-drawer-head');
  head.appendChild(el('div', 'bt-drawer-title', `🗑 버린 더미 ${(me.discard || []).length}장`));
  head.appendChild(
    button('닫기', 'btn small', () => {
      discardOpen = false;
      rerender();
    }),
  );
  drawer.appendChild(head);

  const body = el('div', 'bt-drawer-body');
  const row = el('div', 'bt-market-row');
  const cards = me.discard || [];
  if (cards.length === 0) row.appendChild(el('div', 'bt-muted', '버린 카드가 없습니다'));
  for (const card of cards) {
    row.appendChild(renderCard(cardIdOf(card), { mini: true, upgraded: card.upgraded === true }));
  }
  body.appendChild(row);
  drawer.appendChild(body);
  return drawer;
}

/**
 * 선택 항목 하나를 카드/버튼으로 그린다.
 * @param {string} option
 * @param {Record<string, any>} g
 * @param {Record<string, any>} me
 * @param {Record<string, any>} pending
 * @param {{ selected: boolean, order: number, disabled: boolean, onClick: () => void }} opts
 * @returns {HTMLElement}
 */
function choiceItem(option, g, me, pending, opts) {
  if (Object.prototype.hasOwnProperty.call(KEYWORD_LABELS, option)) {
    const label = KEYWORD_LABELS[option];
    const btn = button(label, 'btn small', opts.onClick, opts.disabled);
    if (opts.selected) btn.classList.add('toggle-on');
    return btn;
  }

  const def = safeCardDef(option);
  if (def && g.market && Object.prototype.hasOwnProperty.call(g.market, option)) {
    return renderCard(option, {
      selected: opts.selected,
      disabled: opts.disabled,
      badge: opts.selected ? opts.order : undefined,
      onClick: opts.disabled ? undefined : opts.onClick,
    });
  }

  // 그 밖에는 uid: optionCards → 내 손패/버린 더미 순으로 cardId 를 찾는다.
  const optionCards = pending.optionCards || {};
  let cardId = typeof optionCards[option] === 'string' ? optionCards[option] : null;
  if (!cardId) {
    const zones = [me.hand || [], me.discard || []];
    for (const zone of zones) {
      const found = zone.find((c) => c.uid === option);
      if (found) {
        cardId = found.cardId;
        break;
      }
    }
  }
  if (!cardId) {
    const unknown = el('div', 'bt-choice-unknown', '알 수 없는 카드');
    return unknown;
  }
  return renderCard(cardId, {
    selected: opts.selected,
    disabled: opts.disabled,
    badge: opts.selected ? opts.order : undefined,
    onClick: opts.disabled ? undefined : opts.onClick,
  });
}

/**
 * 선택 창(모달).
 * @param {Record<string, any>} g
 * @param {Record<string, any>} me
 * @param {Record<string, any>} pending
 * @param {{ net: { send: (obj: any) => void }, rerender: () => void }} ctx
 * @returns {HTMLElement}
 */
function choiceModal(g, me, pending, ctx) {
  const overlay = el('div', 'bt-modal-overlay');
  const modal = el('div', 'bt-modal');

  modal.appendChild(el('div', 'bt-modal-title', pending.prompt || '선택하세요'));
  const min = pending.min ?? 0;
  const max = pending.max ?? 0;
  const keywordOnly = (pending.options || []).every((o) => Object.prototype.hasOwnProperty.call(KEYWORD_LABELS, o));
  modal.appendChild(el('div', 'bt-modal-sub', keywordOnly ? '하나를 고르세요' : `${min}~${max} 장 선택`));
  if (pending.kind === 'reorderTop') {
    modal.appendChild(el('div', 'bt-modal-hint', '먼저 고른 카드가 맨 위'));
  }

  const options = Array.isArray(pending.options) ? pending.options : [];
  const single = options.some((o) => o === 'discard' || o === 'pay');
  const limit = single ? 1 : max;

  const row = el('div', 'bt-modal-cards');
  for (const option of options) {
    const order = choiceSelection.indexOf(option);
    const selected = order >= 0;
    const disabled = !selected && choiceSelection.length >= limit;
    row.appendChild(
      choiceItem(option, g, me, pending, {
        selected,
        order: order + 1,
        disabled,
        onClick: () => {
          const at = choiceSelection.indexOf(option);
          if (at >= 0) {
            choiceSelection.splice(at, 1);
          } else if (choiceSelection.length < limit) {
            choiceSelection.push(option);
          }
          ctx.rerender();
        },
      }),
    );
  }
  modal.appendChild(row);

  const footer = el('div', 'bt-modal-footer');
  footer.appendChild(el('div', 'bt-modal-count', `${choiceSelection.length} / ${max} 선택`));
  const ok = choiceSelection.length >= min && choiceSelection.length <= max;
  footer.appendChild(
    button('확인', 'btn primary', () => {
      if (!ok) return;
      const selection = choiceSelection.slice();
      choiceSelection = [];
      choiceKey = null;
      sendGame(ctx.net, { type: 'choose', selection });
    }, !ok),
  );
  modal.appendChild(footer);

  overlay.appendChild(modal);
  return overlay;
}

/**
 * 경기 종료 덮개.
 * @param {Record<string, any>} view
 * @param {Record<string, any>} g
 * @param {number} you
 * @returns {HTMLElement}
 */
function finishedOverlay(view, g, you) {
  const overlay = el('div', 'bt-finished');
  const box = el('div', 'bt-finished-box');

  const won = view.winner === you;
  if (view.draw === true) {
    box.appendChild(el('div', 'bt-result draw', '무승부'));
  } else {
    box.appendChild(el('div', won ? 'bt-result win' : 'bt-result lose', won ? '승리!' : '패배…'));
  }

  const me = g.players[you];
  const opp = g.players[1 - you];
  const hpLine = el('div', 'bt-result-hp');
  hpLine.textContent = `내 체력 ${me.hp} / ${me.maxHp} · 상대 체력 ${opp.hp} / ${opp.maxHp}`;
  box.appendChild(hpLine);

  box.appendChild(
    button('로비로', 'btn primary', () => {
      try {
        localStorage.removeItem(SESSION_KEY);
      } catch {
        // 무시
      }
      location.reload();
    }),
  );

  overlay.appendChild(box);
  return overlay;
}

/**
 * 대전 화면을 그린다.
 * @param {HTMLElement} root
 * @param {Record<string, any>} state
 * @param {{ send: (obj: any) => void }} net
 * @returns {void}
 */
export function renderBattle(root, state, net) {
  ensureStyles();

  const view = state.view || {};
  const g = view.game || null;
  const you = typeof view.you === 'number' ? view.you : 0;

  if (!g) {
    root.appendChild(el('div', 'topbar', '대전'));
    const screen = el('div', 'screen');
    screen.appendChild(el('div', 'waiting-big', '대전 준비 중'));
    root.appendChild(screen);
    return;
  }

  const me = g.players[you];
  const opp = g.players[1 - you];
  const myTurn = g.activeIndex === you;
  const pending = g.pending || null;
  const myPending = Boolean(pending && pending.playerIndex === you);
  const canAct = myTurn && !pending && g.phase !== 'gameOver';
  // 라운드 끝 판정 전(경기 계속 중)인지. 체력 0 이하 표시에 쓴다.
  const ongoing = view.stage !== 'finished' && g.phase !== 'gameOver';
  const rerender = () => {
    if (typeof state.render === 'function') state.render();
  };

  // 선택 창에서 고르던 항목은 같은 pending 인 동안 유지한다.
  if (myPending) {
    const key = JSON.stringify([pending.kind, pending.prompt, pending.options]);
    if (key !== choiceKey) {
      choiceKey = key;
      choiceSelection = [];
    }
    choiceSelection = choiceSelection.filter((item) => pending.options.includes(item));
  } else {
    choiceKey = null;
    choiceSelection = [];
  }

  root.appendChild(el('div', 'topbar', view.stage === 'finished' ? '대전 종료' : '대전'));

  const screen = el('div', 'screen bt-screen');
  const board = el('div', 'bt-board');

  const main = el('div', 'bt-main');
  main.appendChild(opponentArea(g, opp, state.opponent, !myTurn, ongoing));
  main.appendChild(centerBoard(g, you, myTurn));

  const middle = el('div', 'bt-middle');
  middle.appendChild(leftColumn(g, me, () => {
    marketOpen = !marketOpen;
    rerender();
  }));
  middle.appendChild(myArea(g, me, { canAct, myTurn, ongoing, net, rerender }));
  main.appendChild(middle);

  main.appendChild(actionButtons(g, me, { canAct, net, you }));
  board.appendChild(main);
  board.appendChild(logPanel(g, you));
  screen.appendChild(board);

  if (marketOpen) screen.appendChild(marketDrawer(g, me, { you, myTurn, canAct, net, rerender }));
  if (discardOpen) screen.appendChild(discardDrawer(me, rerender));

  if (pending && pending.waiting) {
    screen.appendChild(el('div', 'bt-waiting-banner', '상대가 선택하는 중…'));
  }
  if (myPending) screen.appendChild(choiceModal(g, me, pending, { net, rerender }));

  if (view.stage === 'finished') screen.appendChild(finishedOverlay(view, g, you));

  root.appendChild(screen);
}
