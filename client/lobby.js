// 로비 화면: 이름 입력, 방 만들기 / AI 연습 / 방 코드로 참가.
import { loadSession } from './net.js';
import { loadAiSpeed } from './aiSpeed.js';
import { showGuide } from './dialogs.js';
import { allCampaignIds, getCampaign } from '/engine/index.js';

/** 이름 기억용 localStorage 키 */
const NAME_KEY = 'cardDuel.name';

/**
 * 저장된 이름을 읽는다.
 * @returns {string}
 */
export function loadName() {
  try {
    return localStorage.getItem(NAME_KEY) || '';
  } catch {
    return '';
  }
}

/**
 * 이름을 저장한다.
 * @param {string} name
 * @returns {void}
 */
export function saveName(name) {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {
    // 무시
  }
}

/**
 * 로비 화면을 그린다.
 * @param {HTMLElement} root
 * @param {{ send: (obj: any) => void }} net
 * @param {{ room?: string|null, error?: string|null }} [state]
 * @returns {void}
 */
export function renderLobby(root, net, state = {}) {
  if (!document.querySelector('link[href="/client/campaign.css"]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/client/campaign.css';
    document.head.appendChild(link);
  }
  const screen = document.createElement('div');
  screen.className = 'screen';

  const lobby = document.createElement('div');
  lobby.className = 'lobby';

  const intro = document.createElement('section');
  intro.className = 'lobby-intro';
  const title = document.createElement('h1');
  title.textContent = '당신의 한 수가, 전장을 바꾼다';
  const description = document.createElement('p');
  description.textContent = '카드를 모아 덱을 키우고, 별의 힘으로 강화하세요. 친구와의 대전부터 은빛 야수와의 모험까지, 나만의 전략을 펼칠 시간입니다.';
  intro.append(title, description);
  lobby.appendChild(intro);

  // 방을 만든 뒤라면 방 코드를 크게 보여준다.
  if (state.room) {
    const waiting = document.createElement('div');
    waiting.className = 'waiting-big';
    waiting.textContent = '상대를 기다리는 중 · 방 코드';
    const code = document.createElement('span');
    code.className = 'room-code';
    code.textContent = state.room;
    waiting.appendChild(code);
    lobby.appendChild(waiting);
    screen.appendChild(lobby);
    root.appendChild(screen);
    return;
  }

  const nameField = document.createElement('div');
  nameField.className = 'field';
  const nameLabel = document.createElement('label');
  nameLabel.textContent = '이름';
  nameLabel.htmlFor = 'lobby-name';
  const nameInput = document.createElement('input');
  nameInput.className = 'input';
  nameInput.id = 'lobby-name';
  nameInput.maxLength = 16;
  nameInput.placeholder = '이름을 입력하세요';
  nameInput.value = loadName();
  nameField.append(nameLabel, nameInput);
  lobby.appendChild(nameField);

  /** 현재 이름을 읽고 저장한다. */
  function currentName() {
    const name = nameInput.value.trim() || '플레이어';
    saveName(name);
    return name;
  }

  const createRow = document.createElement('div');
  createRow.className = 'row';

  const createBtn = document.createElement('button');
  createBtn.className = 'btn primary';
  createBtn.textContent = '방 만들기';
  createBtn.addEventListener('click', () => {
    showGuide({ mode: 'create', onStart: () => net.send({ t: 'create', name: currentName() }) });
  });

  const aiBtn = document.createElement('button');
  aiBtn.className = 'btn';
  aiBtn.textContent = 'AI 와 연습';
  aiBtn.addEventListener('click', () => {
    showGuide({ mode: 'vsAi', onStart: () => net.send({ t: 'vsAi', name: currentName(), aiSpeed: loadAiSpeed() }) });
  });

  createRow.append(createBtn, aiBtn);
  lobby.appendChild(createRow);

  const joinField = document.createElement('div');
  joinField.className = 'field';
  const joinLabel = document.createElement('label');
  joinLabel.textContent = '방 코드로 참가';
  joinLabel.htmlFor = 'lobby-room';
  const joinRow = document.createElement('div');
  joinRow.className = 'row';
  const roomInput = document.createElement('input');
  roomInput.className = 'input';
  roomInput.id = 'lobby-room';
  roomInput.maxLength = 8;
  roomInput.placeholder = '방 코드';
  roomInput.autocapitalize = 'characters';
  const joinBtn = document.createElement('button');
  joinBtn.className = 'btn';
  joinBtn.textContent = '참가';
  joinBtn.addEventListener('click', () => {
    const room = roomInput.value.trim().toUpperCase();
    if (!room) {
      roomInput.focus();
      return;
    }
    showGuide({ mode: 'join', onStart: () => net.send({ t: 'join', room, name: currentName() }) });
  });
  roomInput.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') joinBtn.click();
  });
  joinRow.append(roomInput, joinBtn);
  joinField.append(joinLabel, joinRow);
  lobby.appendChild(joinField);

  // 모험 모드
  const adventure = document.createElement('div');
  adventure.className = 'lobby-adventure';
  const advTitle = document.createElement('div');
  advTitle.className = 'lobby-adventure-title';
  advTitle.textContent = '모험 모드';
  adventure.appendChild(advTitle);
  for (const id of allCampaignIds()) {
    const def = getCampaign(id);
    const card = document.createElement('div');
    card.className = 'lobby-adventure-card';
    const name = document.createElement('div');
    name.className = 'lobby-adventure-name';
    name.textContent = def.name;
    const desc = document.createElement('div');
    desc.className = 'muted';
    desc.textContent = `${def.description} (스테이지 ${def.stages.length}개)`;
    const start = document.createElement('button');
    start.className = 'btn primary';
    start.textContent = '작전 시작';
    start.addEventListener('click', () => {
      showGuide({ mode: 'campaign', onStart: () => net.send({ t: 'campaign', campaignId: id, name: currentName(), aiSpeed: loadAiSpeed() }) });
    });
    card.append(name, desc, start);
    adventure.appendChild(card);
  }
  lobby.appendChild(adventure);

  const session = loadSession();
  if (session) {
    const note = document.createElement('div');
    note.className = 'muted';
    note.textContent = `저장된 방(${session.room})에 다시 접속합니다.`;
    lobby.appendChild(note);
  }

  screen.appendChild(lobby);
  root.appendChild(screen);
}
