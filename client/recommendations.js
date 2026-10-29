// AI 대전 결과로 고른 캐릭터별 입고 구성. 적용은 임시 선택만 바꾸며 확정은 사용자가 한다.
import { getCardDef } from '/engine/index.js';
import { RECOMMENDATIONS } from './recommendationData.js';
import { element as el } from './dialogs.js';

export function renderRecommendations(characterId, state, submitted) {
  const builds = RECOMMENDATIONS[characterId];
  if (!builds) return null;
  const section = el('section', 'draft-recommendations');
  section.setAttribute('aria-label', 'AI 추천 입고 구성');
  section.append(el('h2', '', 'AI 추천 구성'), el('p', 'muted', '내 캐릭터에 맞춘 입고 카드 4종입니다. 적용 후 카드를 바꾸거나 직접 확정할 수 있어요.'));
  const grid = el('div', 'recommendation-grid');
  for (const [index, build] of builds.entries()) {
    const active = state.draftSelection?.length === 4 && build.cardIds.every(id => state.draftSelection.includes(id));
    const article = el('article', `recommendation${active ? ' active' : ''}`);
    article.dataset.recommendation = String(index);
    article.append(el('span', 'recommendation-label', `추천 ${index + 1}`), el('h3', '', build.name), el('p', 'recommendation-strategy', build.strategy));
    article.appendChild(el('p', 'recommendation-card-names', build.cardIds.map(id => getCardDef(id).name).join(' · ')));
    const details = el('details', 'recommendation-details');
    details.appendChild(el('summary', '', '카드 4종 · 효과 보기'));
    const cards = el('ul', 'recommendation-cards');
    for (const id of build.cardIds) {
      const card = getCardDef(id);
      const row = el('li');
      row.append(el('strong', '', `${card.name} · ${card.cost}원`), el('span', '', card.text));
      cards.appendChild(row);
    }
    details.appendChild(cards);
    article.appendChild(details);
    const apply = el('button', 'btn small', active ? '이 구성 선택 중' : '이 구성 적용');
    apply.type = 'button';
    apply.disabled = submitted;
    apply.setAttribute('aria-pressed', String(active));
    apply.setAttribute('aria-label', `${build.name} ${active ? '선택 중' : '적용'}`);
    apply.addEventListener('click', () => {
      if (submitted) return;
      state.draftSelection = [...build.cardIds];
      state.render();
    });
    article.appendChild(apply);
    grid.appendChild(article);
  }
  section.append(grid, el('p', 'recommendation-note', '현재 시작 덱(돌 7·권총 3) 기준 AI 대전으로 고른 두 가지 구성입니다. 번호는 성능 순위를 뜻하지 않습니다. 상대와 중립 카드에 따라 유리한 조합은 달라집니다. 모험의 보스·증강에 맞춘 구성은 아닙니다.'));
  return section;
}
