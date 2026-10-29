// AI의 판단은 그대로 두고, 실제 대전에서 행동 사이의 대기 시간만 조절한다.
export const AI_SPEEDS = [
  { id: 'slow', label: '느림', delay: 1400 },
  { id: 'normal', label: '보통', delay: 850 },
  { id: 'fast', label: '빠름', delay: 350 },
  { id: 'veryFast', label: '매우 빠름', delay: 0 },
];
export const DEFAULT_AI_SPEED = 'normal';

export function getAiSpeed(id) {
  const speed = AI_SPEEDS.find((item) => item.id === id);
  if (!speed) throw new Error('올바른 AI 진행 속도를 선택하세요');
  return speed;
}
