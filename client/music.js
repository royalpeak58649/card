// 오리지널 곡「별의 돌격」. 재생은 사용자의 클릭 후에만 시작한다.
const KEY = 'cardDuel.music';
export function createMusicControls() {
  let preferences = { enabled: true, volume: 0.3 };
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (saved) preferences = { enabled: saved.enabled !== false, volume: Number.isFinite(saved.volume) ? Math.max(0, Math.min(1, saved.volume)) : 0.3 };
  } catch { /* 저장 불가 환경은 기본값 사용 */ }
  const audio = new Audio('/client/audio/star-charge.mp3');
  audio.loop = true;
  audio.preload = 'none';
  audio.volume = preferences.volume;
  let unlocked = false;
  let starting = false;
  let failed = false;
  const group = document.createElement('div');
  group.className = 'music-controls';
  const toggle = document.createElement('button');
  toggle.className = 'btn small';
  toggle.title = '별의 돌격 · 피아노 BGM';
  const volume = document.createElement('input');
  volume.type = 'range';
  volume.min = '0';
  volume.max = '100';
  volume.value = String(Math.round(preferences.volume * 100));
  volume.setAttribute('aria-label', 'BGM 볼륨');
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(preferences)); } catch { /* 무시 */ }
  }
  function update() {
    toggle.textContent = failed ? 'BGM 다시 시도' : preferences.enabled && !audio.paused ? '♫ BGM 끄기' : '♫ BGM 켜기';
    toggle.setAttribute('aria-pressed', String(preferences.enabled && !audio.paused));
  }
  async function play() {
    if (starting || !preferences.enabled || document.hidden) return;
    starting = true;
    try { await audio.play(); failed = false; }
    catch (error) { failed = error.name !== 'NotAllowedError'; }
    finally { starting = false; update(); }
  }
  function unlock(event) {
    // 음소거 버튼 자체가 첫 클릭이면 자동 재생과 클릭 동작을 겹치지 않는다.
    if (group.contains(event.target)) return;
    unlocked = true;
    if (preferences.enabled) void play();
  }
  document.addEventListener('click', unlock);
  document.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') unlock(event); });
  toggle.addEventListener('click', () => {
    unlocked = true;
    preferences.enabled = audio.paused || failed ? true : false;
    if (preferences.enabled) void play();
    else audio.pause();
    save();
    update();
  });
  volume.addEventListener('input', () => {
    preferences.volume = Number(volume.value) / 100;
    audio.volume = preferences.volume;
    save();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) audio.pause();
    else if (unlocked && preferences.enabled) void play();
    update();
  });
  audio.addEventListener('error', () => { failed = true; update(); });
  group.append(toggle, volume);
  update();
  return group;
}
