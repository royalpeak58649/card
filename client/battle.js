// 대전 화면 자리표시. 다음 작업에서 실제 대전 화면으로 교체한다.

/**
 * 대전 화면을 그린다.
 * @param {HTMLElement} root
 * @param {Record<string, any>} state
 * @param {{ send: (obj: any) => void }} net
 * @returns {void}
 */
export function renderBattle(root, state, net) {
  const view = state.view || {};
  const game = view.game || null;
  const you = typeof view.you === 'number' ? view.you : 0;
  const oppIndex = you === 0 ? 1 : 0;

  const bar = document.createElement('div');
  bar.className = 'topbar';
  bar.textContent = view.stage === 'finished' ? '대전 종료' : '대전';
  root.appendChild(bar);

  const screen = document.createElement('div');
  screen.className = 'screen';

  const wrap = document.createElement('div');
  wrap.className = 'battle-placeholder';

  const title = document.createElement('div');
  title.className = 'waiting-big';
  title.textContent = '대전 화면 준비 중';
  wrap.appendChild(title);

  const hpRow = document.createElement('div');
  hpRow.className = 'hp-row';

  const myPlayer = game ? game.players[you] : null;
  const oppPlayer = game ? game.players[oppIndex] : null;

  const mine = document.createElement('div');
  mine.className = 'hp-box';
  mine.textContent = `내 체력 ${myPlayer ? `${myPlayer.hp} / ${myPlayer.maxHp}` : '-'}`;

  const theirs = document.createElement('div');
  theirs.className = 'hp-box';
  theirs.textContent = `상대 체력 ${oppPlayer ? `${oppPlayer.hp} / ${oppPlayer.maxHp}` : '-'}`;

  hpRow.append(mine, theirs);
  wrap.appendChild(hpRow);

  if (view.stage === 'finished' && typeof view.winner === 'number') {
    const result = document.createElement('div');
    result.className = 'waiting-big';
    result.textContent = view.winner === you ? '승리!' : '패배';
    wrap.appendChild(result);
  }

  screen.appendChild(wrap);
  root.appendChild(screen);
}
