// 입고 4종 추천 검색. 실제 createMatch/applyMatchAction의 공유 거래소 규칙으로 평가한다.
// node tools/recommend.js [--out docs/recommendation-results.json]
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import {
  allCharacterIds, getCharacter, getCandidates, createMatch, applyMatchAction,
} from '../engine/index.js';
import { chooseAiAction } from '../engine/ai.js';
import { chooseSmartAction } from '../engine/aiSmart.js';
import { mulberry32, sample, MAX_TURNS, MAX_ACTIONS } from './match.js';

export function combinations(items, count = 4) {
  const result = [];
  function visit(start, current) {
    if (current.length === count) { result.push(current); return; }
    for (let i = start; i <= items.length - (count - current.length); i++) visit(i + 1, [...current, items[i]]);
  }
  visit(0, []);
  return result;
}

export function simulateDraft({ characterId, cardIds, opponentId, seed, seat = 0, ai = 'smart' }) {
  const rand = mulberry32(seed ^ 0x5a17);
  const ids = seat === 0 ? [characterId, opponentId] : [opponentId, characterId];
  const match = createMatch({ seed, players: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }] });
  for (let p = 0; p < 2; p++) applyMatchAction(match, p, { type: 'selectCharacter', characterId: ids[p] });
  const opponentCards = sample(rand, getCandidates(opponentId), 4);
  for (let p = 0; p < 2; p++) applyMatchAction(match, p, { type: 'draft', cardIds: p === seat ? cardIds : opponentCards });
  const game = match.game;
  const marketCounts = Object.fromEntries(Object.entries(game.market).map(([id, pile]) => [id, pile.count]));
  let actions = 0;
  while (match.stage === 'playing' && game.turn <= MAX_TURNS && actions < MAX_ACTIONS) {
    const p = game.pending ? game.pending.playerIndex : game.activeIndex;
    const action = ai === 'basic' ? chooseAiAction(game, p) : chooseSmartAction(game, p);
    if (!action) break;
    applyMatchAction(match, p, { type: 'game', action });
    actions++;
  }
  return { score: match.winner === null ? 0.5 : match.winner === seat ? 1 : 0,
    draw: match.winner === null, turns: game.turn, first: game.firstPlayerIndex === seat,
    // 사전 입력·서버의 실제 거래소 수량 검증에 사용한다.
    neutralIds: match.neutralIds, opponentCards,
    marketCounts,
  };
}

export function evaluateDraft(characterId, cardIds, { seed, games, ai }) {
  const characters = allCharacterIds();
  const stats = { games, wins: 0, draws: 0, losses: 0, score: 0, firstGames: 0, firstWins: 0, turns: 0 };
  for (let i = 0; i < games; i++) {
    // 12명 모두와 대전. 12판마다 좌석을 바꿔 동일 상대를 양쪽 좌석에서 평가한다.
    const seat = (Math.floor(i / characters.length) + i) % 2;
    const result = simulateDraft({ characterId, cardIds, opponentId: characters[i % characters.length], seed: seed + i, seat, ai });
    stats.score += result.score;
    stats.turns += result.turns;
    if (result.draw) stats.draws++;
    else if (result.score === 1) stats.wins++;
    else stats.losses++;
    if (result.first) { stats.firstGames++; if (result.score === 1) stats.firstWins++; }
  }
  return stats;
}

const overlap = (a, b) => a.filter(id => b.includes(id)).length;
export async function generateRecommendations(out) {
  const report = {
    method: '70개 조합 basic AI 12판 → 6개 이상 후보 smart AI 24판 → 서로 2장 이상 다른 추천 2개 smart AI 별도 시드 96판씩',
    startingDeck: { stone: 7, pistol: 3 },
    opponents: '플레이 가능 캐릭터 12명 균등, 상대 입고 4종 무작위, 실제 중립 2종·공유 더미 12장 규칙',
    seeds: { screening: 312026, ranking: 719090, validation: 1047290 },
    limits: { turns: MAX_TURNS, actions: MAX_ACTIONS },
    characters: {},
  };
  if (fs.existsSync(out)) {
    const previous = JSON.parse(fs.readFileSync(out, 'utf8'));
    if (JSON.stringify(previous.seeds) !== JSON.stringify(report.seeds)) throw new Error('기존 결과의 시드가 다릅니다. 다른 출력 경로를 사용하세요.');
    report.characters = previous.characters;
  }
  for (const characterId of allCharacterIds()) {
    if (report.characters[characterId]) continue;
    const name = getCharacter(characterId).name;
    const started = Date.now();
    const rows = combinations(getCandidates(characterId)).map(cardIds => ({ cardIds,
      screening: evaluateDraft(characterId, cardIds, { seed: report.seeds.screening, games: 12, ai: 'basic' }),
    })).sort((a, b) => b.screening.score - a.screening.score);
    console.log(`${name}: 70개 조합 1차 비교 완료 (${((Date.now() - started) / 1000).toFixed(0)}초)`);
    const shortlist = rows.slice(0, 3);
    for (const row of rows) {
      if (shortlist.length >= 6) break;
      if (!shortlist.includes(row) && overlap(row.cardIds, rows[0].cardIds) <= 2) shortlist.push(row);
    }
    for (const row of shortlist) row.ranking = evaluateDraft(characterId, row.cardIds, { seed: report.seeds.ranking, games: 24, ai: 'smart' });
    shortlist.sort((a, b) => b.ranking.score - a.ranking.score || b.screening.score - a.screening.score);
    const primary = shortlist[0];
    let alternate = shortlist.find(row => overlap(row.cardIds, primary.cardIds) <= 2);
    if (!alternate) {
      const extra = rows.filter(row => !shortlist.includes(row) && overlap(row.cardIds, primary.cardIds) <= 2).slice(0, 3);
      for (const row of extra) row.ranking = evaluateDraft(characterId, row.cardIds, { seed: report.seeds.ranking, games: 24, ai: 'smart' });
      extra.sort((a, b) => b.ranking.score - a.ranking.score || b.screening.score - a.screening.score);
      shortlist.push(...extra);
      alternate = extra[0];
    }
    if (!alternate) throw new Error(`${characterId}: 서로 다른 추천을 찾지 못했습니다`);
    const builds = [primary, alternate];
    for (const row of builds) row.validation = evaluateDraft(characterId, row.cardIds, { seed: report.seeds.validation, games: 96, ai: 'smart' });
    report.characters[characterId] = { builds, shortlist, screened: rows };
    fs.writeFileSync(out, JSON.stringify(report, null, 2) + '\n');
    console.log(`${name}: 완료, 검증 ${builds.map(r => `${r.validation.wins}승 ${r.validation.draws}무 ${r.validation.losses}패`).join(' / ')} (${((Date.now() - started) / 1000).toFixed(0)}초)`);
    await new Promise(resolve => setImmediate(resolve));
  }
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const index = process.argv.indexOf('--out');
  await generateRecommendations(index >= 0 ? process.argv[index + 1] : 'docs/recommendation-results.json');
}
