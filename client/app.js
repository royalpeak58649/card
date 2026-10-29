// 화면 전환과 서버 메시지 처리.
import { connect, clearSession } from './net.js';
import { renderLobby } from './lobby.js';
import { renderSelect, renderDraft } from './draft.js';
import { renderCampaignHeader, renderCampaignResult } from './campaign.js';

import { showGuide, confirmLeave } from './dialogs.js';
import { showCodex } from './codex.js';
import { createMusicControls } from './music.js';
import { renderBattle } from './battle.js';
import { createAiSpeedControls } from './aiSpeed.js';

const app = document.getElementById('app');

/** @type {{ you: number|null, room: string|null, view: any, opponent: any, error: string|null,
 *  campaign: any, draftSelection?: string[], draftUpgraded?: boolean, leaveLobby?: () => void, render: () => void }} */
const state = {
  you: null,
  room: null,
  view: null,
  campaign: null,
  opponent: null,
  error: null,
  render,
};

/** @type {ReturnType<typeof setTimeout> | null} */
let toastTimer = null;

/**
 * 화면을 다시 그린다.
 * @returns {void}
 */
function render() {
  app.textContent = '';
  const campaign = state.campaign;
  if (!state.view) {
    renderLobby(app, net, { room: campaign ? null : state.room, error: state.error });
  } else if (campaign && campaign.status !== 'battle') {
    renderCampaignResult(app, state, net);
  } else if (state.view.stage === 'select' || state.view.stage === 'draft') {
    if (state.view.stage === 'select') renderSelect(app, state, net);
    else renderDraft(app, state, net);
    // 모험 모드: 상단 바 아래에 진행 막대와 이번 보스 소개를 붙인다.
    if (campaign) app.insertBefore(renderCampaignHeader(campaign), app.children[1] ?? null);
  } else {
    renderBattle(app, state, net);
  }
  const leaveButton = document.getElementById('return-lobby');
  aiSpeedControls.update(state);
  if (leaveButton) leaveButton.hidden = !state.room;
  if (state.error) showToast(state.error);
}

/**
 * 화면 아래 토스트를 3초 표시한다.
 * @param {string} message
 * @returns {void}
 */
function showToast(message) {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  if (toastTimer) clearTimeout(toastTimer);

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  document.body.appendChild(toast);

  toastTimer = setTimeout(() => {
    toast.remove();
    toastTimer = null;
  }, 3000);
}

/**
 * 서버 메시지를 처리한다.
 * @param {any} msg
 * @returns {void}
 */
function onMessage(msg) {
  switch (msg.t) {
    case 'joined':
      state.you = msg.you;
      state.room = msg.room;
      render();
      return;
    case 'state': {
      const prevStage = state.view ? state.view.stage : null;
      state.view = msg.view;
      state.campaign = msg.campaign || null;
      state.opponent = msg.opponent || null;
      state.aiSpeed = msg.aiSpeed ?? null;
      if (typeof msg.view?.you === 'number') state.you = msg.view.you;
      // 단계가 바뀌면 입고 화면의 임시 선택을 초기화한다.
      if (msg.view?.stage !== prevStage) {
        state.draftSelection = [];
        state.draftUpgraded = false;
      }
      render();
      return;
    }
    case 'left':
      clearSession();
      document.querySelectorAll('dialog.game-dialog').forEach((dialog) => dialog.close());
      Object.assign(state, { you: null, room: null, view: null, campaign: null, opponent: null, error: null, draftSelection: [], draftUpgraded: false });
      render();
      if (msg.message) showToast(msg.message);
      return;
    case 'error':
      state.error = msg.message || '오류가 발생했습니다';
      showToast(state.error);
      return;
    default:
      // pong 등은 무시한다.
      return;
  }
}

const net = connect(onMessage);
const aiSpeedControls = createAiSpeedControls(net);
state.leaveLobby = () => net.send({ t: 'leave' });
const toolbar = document.createElement('nav');
toolbar.className = 'game-toolbar';
toolbar.setAttribute('aria-label', '게임 메뉴');
for (const [label, action, id] of [
  ['← 로비로', () => confirmLeave(state.leaveLobby, state.view?.stage === 'finished' && (!state.campaign || ['lost', 'cleared'].includes(state.campaign.status))), 'return-lobby'],
  ['도감', showCodex, 'open-codex'],
  ['플레이 가이드', () => showGuide(), 'open-guide'],
]) {
  const button = document.createElement('button');
  button.className = 'btn small';
  button.id = id;
  button.textContent = label;
  button.addEventListener('click', action);
  toolbar.appendChild(button);
}
toolbar.append(aiSpeedControls.element, createMusicControls());
app.before(toolbar);

render();
