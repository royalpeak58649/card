// JS 엔진에 등록된 데이터(카드·진영·캐릭터·증강·캠페인·AI 가치·추천 구성)를
// Godot 프로젝트가 읽는 godot/data/game_data.json 으로 내보낸다.
// 카드 수치를 바꾼 뒤에는 `node godot/tools/export_data.mjs` 를 다시 실행한다.
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  allCardIds, getCardDef, allFactionIds, getFaction, allCharacterIds, getCharacter,
  NEUTRAL_CARD_IDS, AUGMENTS, allCampaignIds, getCampaign,
} from '../../engine/index.js';
import { BASIC_PILE_SIZES } from '../../engine/cards/basic.js';
import { TUNED, defaultValue } from '../../engine/aiValues.js';
import { WEIGHTS } from '../../engine/aiSmart.js';
import { AI_SPEEDS, DEFAULT_AI_SPEED } from '../../engine/aiSpeed.js';
import { RECOMMENDATIONS } from '../../client/recommendationData.js';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, '..', 'data', 'game_data.json');

const cards = {};
for (const id of allCardIds()) cards[id] = getCardDef(id);
const factions = {};
for (const id of allFactionIds(true)) factions[id] = getFaction(id);
const characters = {};
for (const id of allCharacterIds(true)) characters[id] = getCharacter(id);
const defaultValues = {};
for (const id of allCardIds()) defaultValues[id] = defaultValue(id);
const campaigns = {};
for (const id of allCampaignIds()) campaigns[id] = getCampaign(id);

const data = {
  version: 1,
  cards,
  factions,
  characters,
  neutralCardIds: NEUTRAL_CARD_IDS,
  basicPileSizes: BASIC_PILE_SIZES,
  augments: AUGMENTS,
  campaigns,
  aiValues: { tuned: TUNED, defaults: defaultValues },
  aiWeights: WEIGHTS,
  aiSpeeds: AI_SPEEDS,
  defaultAiSpeed: DEFAULT_AI_SPEED,
  recommendations: RECOMMENDATIONS,
};

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(data, null, 1) + '\n');
console.log(`wrote ${out}: cards ${Object.keys(cards).length}, characters ${Object.keys(characters).length}`);
