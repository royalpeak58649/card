// 모험 모드 스테이지별 난이도 측정.
// 사용법: node tools/campaignSim.js --campaign silverbeast --games 200 --seed 1 [--stages 1,2,3]
// 플레이어·보스 모두 모의 실행 AI. 플레이어 캐릭터와 입고 4종은 판마다 무작위(덱은 매판 새로).
import {
  allCharacterIds,
  getCampaign,
  getCandidates,
  createCampaign,
  applyCampaignAction,
  runEnemy,
} from '../engine/index.js';
import { createStageMatch } from '../engine/campaign.js';
import { chooseSmartAction } from '../engine/aiSmart.js';

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 한 스테이지를 한 판 둔다.
 * @returns {{ result: 'win'|'lose'|'draw', turns: number, hpLeft: number, characterId: string }}
 */
export function playStage(campaignId, stageIndex, seed) {
  const rand = mulberry32(seed);
  const campaign = createCampaign({ seed, campaignId, playerName: 'AI' });
  campaign.stageIndex = stageIndex;
  campaign.match = createStageMatch(campaign);

  const chars = allCharacterIds();
  const characterId = chars[Math.floor(rand() * chars.length)];
  applyCampaignAction(campaign, { type: 'selectCharacter', characterId });
  const cand = getCandidates(characterId).slice();
  const picks = [];
  while (picks.length < 4) picks.push(cand.splice(Math.floor(rand() * cand.length), 1)[0]);
  applyCampaignAction(campaign, { type: 'draft', cardIds: picks });

  for (let step = 0; step < 8000; step++) {
    const match = campaign.match;
    const game = match.game;
    if (campaign.status !== 'battle' || game.phase === 'gameOver' || game.turn > 200) break;
    const actor = game.pending ? game.pending.playerIndex : game.activeIndex;
    if (actor === 1) {
      runEnemy(campaign, (g, p) => chooseSmartAction(g, p));
      continue;
    }
    applyCampaignAction(campaign, { type: 'game', action: chooseSmartAction(game, 0) });
  }
  const game = campaign.match.game;
  const result = game.phase !== 'gameOver' || game.draw ? 'draw' : game.winner === 0 ? 'win' : 'lose';
  return { result, turns: game.turn, hpLeft: game.players[0].hp, characterId };
}

async function main() {
  const campaignId = arg('campaign', 'silverbeast');
  const games = Number(arg('games', '200'));
  const seed = Number(arg('seed', '1'));
  const def = getCampaign(campaignId);
  const stages = arg('stages', def.stages.map((_, i) => i + 1).join(','))
    .split(',')
    .map((s) => Number(s) - 1);
  for (const s of stages) {
    let wins = 0;
    let turns = 0;
    let hp = 0;
    /** @type {Record<string, [number, number]>} */
    const byChar = {};
    for (let i = 0; i < games; i++) {
      const r = playStage(campaignId, s, seed + s * 100000 + i);
      if (r.result === 'win') {
        wins += 1;
        hp += r.hpLeft;
      }
      turns += r.turns;
      const c = (byChar[r.characterId] ??= [0, 0]);
      c[0] += 1;
      if (r.result === 'win') c[1] += 1;
    }
    const stage = def.stages[s];
    const worst = Object.entries(byChar)
      .map(([id, [n, w]]) => [id, w / n])
      .sort((a, b) => a[1] - b[1])
      .slice(0, 3)
      .map(([id, r]) => `${id} ${(r * 100).toFixed(0)}%`)
      .join(', ');
    console.log(
      `스테이지 ${s + 1} ${stage.name}(${stage.bossId}): 플레이어 승률 ${((wins / games) * 100).toFixed(1)}%`
        + ` | 평균 차례 ${(turns / games).toFixed(1)} | 이긴 판 남은 체력 ${(hp / Math.max(1, wins)).toFixed(1)} | 약한 캐릭터: ${worst}`,
    );
  }
}

if (process.argv[1] && process.argv[1].endsWith('campaignSim.js')) main();
