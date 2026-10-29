// 키보드와 모바일에서 공통으로 쓰는 모달.
export function element(tag, className = '', text) {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function openDialog(title) {
  document.querySelectorAll('dialog.game-dialog').forEach((dialog) => dialog.close());
  const dialog = element('dialog', 'game-dialog');
  const head = element('div', 'dialog-head');
  const close = element('button', 'btn small', '닫기');
  close.type = 'button';
  close.addEventListener('click', () => dialog.close());
  head.append(element('h2', '', title), close);
  const body = element('div', 'dialog-body');
  dialog.append(head, body);
  dialog.addEventListener('close', () => dialog.remove(), { once: true });
  dialog.addEventListener('click', (event) => {
    if (event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
  });
  document.body.appendChild(dialog);
  dialog.showModal();
  return { dialog, body };
}

const RULES = [
  ['나만의 덱을 키우는 카드 대전', '돌 6장과 권총 4장으로 시작합니다. 매 차례 카드를 사용하고 거래소에서 더 좋은 카드를 사서, 상대보다 강한 덱을 만들어 보세요. 구매한 카드는 보통 버린 더미로 들어가고, 뽑을 덱이 비면 버린 더미를 섞어 다시 뽑습니다.'],
  ['준비 · 캐릭터와 거래소 입고', '캐릭터를 고른 뒤 진영·전용 카드 후보 8종 중 4종을 거래소에 입고합니다. 시작 덱에 넣는 것이 아니라, 전투 중 구매할 카드 종류를 정하는 단계입니다. 중립 카드 2종과 상대가 입고한 카드도 함께 거래소에 놓입니다.'],
  ['① 행동 → ② 구매 → ③ 공격', '행동단계에는 행동카드로 효과를 준비합니다. 행동력 비용을 확인하세요. 구매단계에는 재화카드를 내서 원을 얻고 구매 횟수 안에서 카드를 삽니다. 공격단계에는 무기를 내고, 단계를 끝내면 모아 둔 피해가 한 번에 적용됩니다.'],
  ['별을 모아 강화하기', '매 차례 별이 1개 생깁니다(선공 첫 차례 제외). 보통 최대 5개까지 모을 수 있습니다. 별 1개로 이번 차례만 강화(최대 3장), 별 4개로 영구 강화할 수 있습니다. 기본 공급 카드는 강화할 수 없고, 일부 캐릭터는 별 최대치나 비용이 다릅니다.'],
  ['라운드가 끝날 때 승패 판정', '체력이 0 이하가 되어도 후공의 차례가 끝날 때까지 전투는 계속됩니다. 한쪽만 0 이하면 상대 승리, 둘 다 0 이하면 남은 체력이 높은 쪽 승리입니다. 체력까지 같으면 무승부입니다.'],
  ['첫 전투의 팁', '은괴로 구매력을 늘리고 소총으로 공격을 강화해 보세요. 소총과 돌격소총은 양쪽 플레이어를 합쳐 처음 구매되는 2장까지 1원 더 비쌉니다. 빚이 있으면 구매 전에 원으로 갚아야 합니다. 카드와 캐릭터의 자세한 효과는 도감에서 확인할 수 있습니다.'],
];

export function showGuide({ mode = 'guide', onStart } = {}) {
  const titles = { guide: '플레이 가이드', create: '친구와 대전하기', join: '방 코드로 참가하기', vsAi: 'AI와 연습하기', campaign: '은빛 야수 소탕 작전' };
  const { dialog, body } = openDialog(titles[mode] || titles.guide);
  body.appendChild(element('p', 'guide-lead', '카드를 모으고, 별로 강화하고, 결정적인 한 차례를 만드세요.'));
  if (mode === 'campaign') {
    const story = element('section', 'guide-story');
    story.append(element('h3', '', '달빛 아래, 은빛 발톱이 움직인다'), element('p', '', '숲을 피로 물들이는 은빛 야수들이 모습을 드러냈습니다. 숲 어귀에서 야수왕의 둥지까지, 다섯 전장을 돌파하세요. 승리 후 얻은 증강은 남은 모험 내내 당신의 힘이 됩니다.'), element('p', '', '스테이지마다 체력이 회복되고 캐릭터와 덱을 새로 준비합니다. 패배하면 1스테이지부터 다시 시작합니다. 출혈 중 피해를 받으면 추가 피해 1(행동카드 피해가 섞이면 2)을 받고 출혈이 사라집니다. 방어로 피해를 전부 막으면 출혈은 유지됩니다.'));
    body.appendChild(story);
  } else if (mode === 'vsAi') {
    body.appendChild(element('p', 'guide-story', 'AI를 상대로 차례의 흐름을 익혀 보세요. 시간에 쫓기지 않고 카드 효과와 강화 조합을 연습할 수 있습니다.'));
  } else if (mode === 'create' || mode === 'join') {
    body.appendChild(element('p', 'guide-story', '방 코드를 공유해 두 명이 대전합니다. 로비로 돌아가면 방이 종료되고 상대도 로비로 이동합니다.'));
  }
  const grid = element('div', 'guide-grid');
  for (const [title, text] of RULES) {
    const section = element('section', 'guide-rule');
    section.append(element('h3', '', title), element('p', '', text));
    grid.appendChild(section);
  }
  body.appendChild(grid);
  if (onStart) {
    const start = element('button', 'btn primary guide-start', '설명 확인 · 시작하기');
    start.addEventListener('click', () => { dialog.close(); onStart(); });
    body.appendChild(start);
  }
}

export function confirmLeave(onLeave, finished = false) {
  if (finished) { onLeave(); return; }
  const { dialog, body } = openDialog('로비로 돌아갈까요?');
  body.appendChild(element('p', '', '진행 중인 방과 모험이 종료되며 진행 상황은 저장되지 않습니다. 온라인 대전이라면 상대도 로비로 이동합니다.'));
  const actions = element('div', 'dialog-actions');
  const cancel = element('button', 'btn', '계속 플레이');
  cancel.addEventListener('click', () => dialog.close());
  const leave = element('button', 'btn primary', '종료하고 로비로');
  leave.addEventListener('click', () => { dialog.close(); onLeave(); });
  actions.append(cancel, leave);
  body.appendChild(actions);
  cancel.focus();
}
