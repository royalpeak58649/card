import { AI_SPEEDS, DEFAULT_AI_SPEED } from '/engine/aiSpeed.js';

const STORAGE_KEY = 'cardDuel.aiSpeed';

export function loadAiSpeed() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (AI_SPEEDS.some((speed) => speed.id === saved)) return saved;
  } catch { /* 저장소를 쓸 수 없으면 기본값 사용 */ }
  return DEFAULT_AI_SPEED;
}

export function createAiSpeedControls(net) {
  const label = document.createElement('label');
  label.className = 'ai-speed-controls';
  label.hidden = true;
  label.append('AI 속도 ');
  const select = document.createElement('select');
  select.className = 'input';
  select.setAttribute('aria-label', 'AI 진행 속도');
  for (const speed of AI_SPEEDS) {
    const option = document.createElement('option');
    option.value = speed.id;
    option.textContent = speed.label;
    select.appendChild(option);
  }
  select.value = loadAiSpeed();
  select.addEventListener('change', () => net.send({ t: 'aiSpeed', speed: select.value }));
  label.appendChild(select);
  return {
    element: label,
    update(state) {
      label.hidden = !state.opponent?.isAi;
      if (!AI_SPEEDS.some((speed) => speed.id === state.aiSpeed)) return;
      select.value = state.aiSpeed;
      try { localStorage.setItem(STORAGE_KEY, state.aiSpeed); } catch { /* 저장 실패 무시 */ }
    },
  };
}
