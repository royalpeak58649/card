// 모험 모드 화면: 스테이지 진행 표시, 스테이지 결과(승리·패배·클리어).
import { getCharacter, getCardDef } from '/engine/index.js';
import { renderCard } from './cards.js';

let cssLoaded = false;

/** campaign.css 를 한 번만 불러온다. */
function ensureCss() {
  if (cssLoaded || document.querySelector('link[href="/client/campaign.css"]')) return;
  cssLoaded = true;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '/client/campaign.css';
  document.head.appendChild(link);
}

/**
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
 * 스테이지 진행 막대(1~N).
 * @param {any} campaign
 * @returns {HTMLElement}
 */
function stageTrack(campaign) {
  const track = el('div', 'cp-track');
  campaign.stages.forEach((stage, i) => {
    const node = el('div', 'cp-node');
    if (stage.cleared) node.classList.add('cleared');
    if (i === campaign.stageIndex) node.classList.add('current');
    node.appendChild(el('div', 'cp-node-num', stage.cleared ? '✓' : String(i + 1)));
    node.appendChild(el('div', 'cp-node-name', stage.name));
    track.appendChild(node);
    if (i < campaign.stages.length - 1) track.appendChild(el('div', 'cp-link'));
  });
  return track;
}

/**
 * 캐릭터 선택·입고 화면 위에 붙는 모험 모드 머리말: 진행 막대 + 이번 보스 소개.
 * @param {any} campaign
 * @returns {HTMLElement}
 */
export function renderCampaignHeader(campaign) {
  ensureCss();
  const box = el('div', 'cp-header');
  box.appendChild(el('div', 'cp-title', campaign.name));
  box.appendChild(stageTrack(campaign));

  const stage = campaign.stages[campaign.stageIndex];
  const boss = safeCharacter(stage.bossId);
  const bossBox = el('div', 'cp-boss');
  const head = el('div', 'cp-boss-head');
  head.appendChild(el('span', 'cp-stage-label', `스테이지 ${campaign.stageIndex + 1} · ${stage.name}`));
  head.appendChild(el('span', 'cp-boss-name', stage.bossName));
  head.appendChild(el('span', 'cp-boss-hp', `❤ ${stage.bossMaxHp}`));
  bossBox.appendChild(head);
  if (stage.intro) bossBox.appendChild(el('div', 'cp-intro', stage.intro));
  if (boss?.abilityText) bossBox.appendChild(el('div', 'cp-ability', boss.abilityText));

  // 보스 시작 덱의 야수 카드 미리보기(돌·권총 제외)
  if (boss?.startDeck) {
    const ids = [...new Set(boss.startDeck)].filter((id) => !getCardDef(id).basic);
    if (ids.length > 0) {
      const row = el('div', 'cp-boss-cards');
      for (const id of ids) row.appendChild(renderCard(id, { mini: true }));
      bossBox.appendChild(row);
    }
  }
  box.appendChild(bossBox);
  box.appendChild(
    el('div', 'cp-note', '스테이지마다 캐릭터와 입고 카드를 새로 고릅니다. 지면 1스테이지부터 다시 시작합니다.'),
  );
  return box;
}

/**
 * @param {string} id
 * @returns {any|null}
 */
function safeCharacter(id) {
  try {
    return getCharacter(id);
  } catch {
    return null;
  }
}

/**
 * 스테이지가 끝났을 때의 화면(다음 스테이지 / 처음부터 / 클리어).
 * @param {HTMLElement} root
 * @param {any} state
 * @param {{ send: (obj: any) => void }} net
 * @returns {void}
 */
export function renderCampaignResult(root, state, net) {
  ensureCss();
  const campaign = state.campaign;
  const status = campaign.status;
  const view = state.view;
  const g = view.game;

  root.appendChild(el('div', 'topbar', campaign.name));

  const screen = el('div', 'screen');
  const box = el('div', 'cp-result');
  box.appendChild(stageTrack(campaign));

  const stage = campaign.stages[campaign.stageIndex];
  if (status === 'stageWon') {
    box.appendChild(el('div', 'cp-result-title win', `스테이지 ${campaign.stageIndex + 1} 돌파!`));
    box.appendChild(el('div', 'cp-result-sub', `${stage.bossName}을(를) 쓰러뜨렸습니다.`));
  } else if (status === 'cleared') {
    box.appendChild(el('div', 'cp-result-title win', '작전 완료!'));
    box.appendChild(el('div', 'cp-result-sub', `${campaign.name}의 모든 은빛 야수를 소탕했습니다.`));
  } else {
    box.appendChild(el('div', 'cp-result-title lose', view.draw ? '무승부… 작전 실패' : '작전 실패'));
    box.appendChild(el('div', 'cp-result-sub', `스테이지 ${campaign.stageIndex + 1} ${stage.name}에서 쓰러졌습니다. 1스테이지부터 다시 시작합니다.`));
  }

  if (g) {
    const me = g.players[view.you ?? 0];
    const boss = g.players[1 - (view.you ?? 0)];
    box.appendChild(el('div', 'cp-result-hp', `내 체력 ${me.hp} / ${me.maxHp} · ${stage.bossName} ${boss.hp} / ${boss.maxHp} · ${g.turn}턴`));
  }

  // 지금까지의 기록
  if (campaign.history.length > 0) {
    const list = el('div', 'cp-history');
    for (const h of campaign.history) {
      const s = campaign.stages[h.stageIndex];
      const who = safeCharacter(h.characterId)?.name ?? h.characterId;
      const mark = h.result === 'win' ? '승리' : h.result === 'draw' ? '무승부' : '패배';
      list.appendChild(el('div', 'cp-history-row', `${h.stageIndex + 1}. ${s.name} — ${who} · ${mark} (${h.turns}턴)`));
    }
    box.appendChild(list);
  }

  const buttons = el('div', 'row cp-buttons');
  const btn = (text, cls, onClick) => {
    const b = el('button', cls, text);
    b.addEventListener('click', onClick);
    return b;
  };
  if (status === 'stageWon') {
    buttons.appendChild(btn('다음 스테이지 ▶', 'btn primary', () => net.send({ t: 'action', action: { type: 'nextStage' } })));
  } else {
    buttons.appendChild(btn('처음부터 다시', 'btn primary', () => net.send({ t: 'action', action: { type: 'restart' } })));
  }
  buttons.appendChild(
    btn('로비로', 'btn', () => {
      try {
        localStorage.removeItem('cardDuel.session');
      } catch {
        // 무시
      }
      location.reload();
    }),
  );
  box.appendChild(buttons);
  screen.appendChild(box);
  root.appendChild(screen);
}
