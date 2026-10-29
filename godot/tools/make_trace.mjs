// JS 엔진으로 경기를 진행하며 조작·AI 선택·오류·상태 해시를 기록한다.
// Godot 쪽 tests/cross_check.gd 가 같은 조작을 다시 적용해 한 단계씩 결과가 같은지 확인한다.
//   node godot/tools/make_trace.mjs [--games 40] [--campaigns 6] [--seed 1234] [--out godot/tests/trace.json]
import { createHash } from 'node:crypto';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  createMatch, applyMatchAction, viewFor, getCandidates, allCharacterIds,
  createCampaign, applyCampaignAction,
} from '../../engine/index.js';
import { chooseAiAction } from '../../engine/ai.js';
import { chooseSmartAction, candidates } from '../../engine/aiSmart.js';
import { nextRandom, randomInt } from '../../engine/rng.js';

const args = process.argv.slice(2);
const arg = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const GAMES = Number(arg('games', 40));
const CAMPAIGNS = Number(arg('campaigns', 6));
const SEED = Number(arg('seed', 1234));
const OUT = arg('out', 'godot/tests/trace.json');
const MAX_STEPS = 1500;

/** 키를 정렬한 JSON(정수는 정수 그대로) */
export function canonical(v) {
  if (v === null || v === undefined) return 'null';
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
  if (typeof v === 'object') {
    const keys = Object.keys(v).filter((k) => v[k] !== undefined).sort();
    return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}';
  }
  if (typeof v === 'number') {
    if (!Number.isInteger(v)) throw new Error(`상태에 실수가 있습니다: ${v}`);
    return String(v);
  }
  return JSON.stringify(v);
}
const hash = (v) => createHash('md5').update(canonical(v)).digest('hex');

const driver = { rngState: SEED >>> 0 };
const pick = (arr) => arr[randomInt(driver, arr.length)];

/** 가끔 넣어 볼 잘못된 조작들 */
function invalidAction(game, p) {
  const opts = [
    { type: 'buy', cardId: 'nope' },
    { type: 'playCard', uid: 'c99999' },
    { type: 'endPhase' },
    { type: 'upgrade', uid: game.players[p].hand[0]?.uid ?? 'x', mode: 'perm' },
    { type: 'payDebt' },
    { type: 'activateAbility' },
    { type: 'choose', selection: ['zzz'] },
    { type: 'playAllMoney' },
    { type: 'playAllWeapons' },
  ];
  return pick(opts);
}

function chooseFor(game, p, mode) {
  const r = nextRandom(driver);
  if (r < 0.04) return { action: invalidAction(game, 1 - p), actor: 1 - p, ai: null };
  if (r < 0.06) return { action: invalidAction(game, p), actor: p, ai: null };
  if (r < (mode === 'random' ? 0.7 : 0.16)) {
    const list = candidates(game, p);
    if (list.length > 0) return { action: pick(list), actor: p, ai: null };
  }
  const ai = mode === 'smart' ? 'smart' : 'basic';
  const action = ai === 'smart' ? chooseSmartAction(game, p) : chooseAiAction(game, p);
  return { action, actor: p, ai };
}

function runMatch(index) {
  const seed = randomInt(driver, 2 ** 31);
  const mode = ['smart', 'basic', 'random'][index % 3];
  const match = createMatch({ seed, players: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }] });
  const steps = [];
  const record = (actor, action, ai) => {
    let error = '';
    try {
      applyMatchAction(match, actor, action);
    } catch (e) {
      error = e.message;
    }
    steps.push({ actor, action, ai, error, hash: hash(match), view0: hash(viewFor(match, 0)) });
  };
  const chars = allCharacterIds();
  for (const p of [0, 1]) record(p, { type: 'selectCharacter', characterId: pick(chars) }, null);
  for (const p of [0, 1]) {
    const cands = getCandidates(match.picks[p].characterId).slice();
    const chosen = [];
    while (chosen.length < 4) {
      const c = pick(cands);
      if (!chosen.includes(c)) chosen.push(c);
    }
    record(p, { type: 'draft', cardIds: chosen }, null);
  }
  for (let i = 0; i < MAX_STEPS && match.stage === 'playing'; i++) {
    const game = match.game;
    const p = game.pending ? game.pending.playerIndex : game.activeIndex;
    const { action, actor, ai } = chooseFor(game, p, mode);
    if (!action) break;
    record(actor, { type: 'game', action }, ai);
  }
  for (const e of match.game?.log ?? []) if (e.type === 'playCard' && e.cardId) played.add(e.cardId);
  return { kind: 'match', seed, mode, steps, winner: match.winner, draw: match.draw };
}

function runCampaign(index) {
  const seed = randomInt(driver, 2 ** 31);
  const campaign = createCampaign({ seed, campaignId: 'silverbeast', playerName: '나' });
  const steps = [];
  const record = (actor, action, ai) => {
    let error = '';
    try {
      if (actor === 0) applyCampaignAction(campaign, action);
      else {
        // 보스 조작은 엔진에 직접 적용(서버의 runEnemy 와 같은 방식)
        const { applyAction } = turnApi;
        applyAction(campaign.match.game, 1, action.action);
      }
    } catch (e) {
      error = e.message;
    }
    if (actor === 1) settleApi.settle(campaign);
    steps.push({ actor, action, ai, error, hash: hash(campaign) });
  };
  const chars = allCharacterIds();
  for (let stage = 0; stage < 5; stage++) {
    record(0, { type: 'selectCharacter', characterId: pick(chars) }, null);
    const cands = getCandidates(campaign.match.picks[0].characterId).slice();
    const chosen = [];
    while (chosen.length < 4) {
      const c = pick(cands);
      if (!chosen.includes(c)) chosen.push(c);
    }
    record(0, { type: 'draft', cardIds: chosen }, null);
    for (let i = 0; i < MAX_STEPS && campaign.status === 'battle'; i++) {
      const game = campaign.match.game;
      const p = game.pending ? game.pending.playerIndex : game.activeIndex;
      const { action, actor, ai } = chooseFor(game, p, 'smart');
      if (!action) break;
      record(actor, { type: 'game', action }, ai);
    }
    if (campaign.status !== 'stageWon') break;
    record(0, { type: 'chooseAugment', augmentId: pick(campaign.augmentChoices) }, null);
    record(0, { type: 'nextStage' }, null);
  }
  return { kind: 'campaign', seed, steps, status: campaign.status, stageIndex: campaign.stageIndex };
}

const turnApi = await import('../../engine/turn.js');
const settleApi = await import('../../engine/campaign.js');

const played = new Set();
const games = [];
const t0 = Date.now();
for (let i = 0; i < GAMES; i++) games.push(runMatch(i));
for (let i = 0; i < CAMPAIGNS; i++) games.push(runCampaign(i));
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify({ seed: SEED, games }));
const total = games.reduce((n, g) => n + g.steps.length, 0);
const errs = games.reduce((n, g) => n + g.steps.filter((s) => s.error).length, 0);
const { allCardIds } = await import('../../engine/index.js');
const missing = allCardIds().filter((id) => !played.has(id) && !id.startsWith('sb_'));
console.log(`played ${played.size} card kinds in matches; never played: ${missing.join(', ') || 'none'}`);
console.log(`wrote ${OUT}: ${games.length} games, ${total} steps (${errs} rejected) in ${Date.now() - t0}ms`);
