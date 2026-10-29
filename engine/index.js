// 서버·클라이언트는 이 파일만 import 한다. 카드·진영·캐릭터 등록도 여기서 일어난다.
import './cards/basic.js';
import './cards/section8.js';
import './cards/neuro.js';
import './cards/ligand.js';
import './cards/vincent.js';
import './cards/neutral.js';

export {
  createGame,
  createCardInstance,
  drawCards,
  getPurchasePrice,
  addMarketPile,
} from './state.js';
export { startGame, applyAction } from './turn.js';
export {
  registerFactions,
  getFaction,
  allFactionIds,
  allCharacterIds,
  registerCharacters,
  getCharacter,
} from './characters.js';
export { registerCards, getCardDef, allCardIds } from './cards/registry.js';
export { NEUTRAL_CARD_IDS } from './cards/neutral.js';
export { createMatch, getCandidates, applyMatchAction } from './match.js';
export { viewFor } from './view.js';
export {
  registerCampaign,
  getCampaign,
  allCampaignIds,
  createCampaign,
  applyCampaignAction,
  runEnemy,
  campaignView,
  settle,
} from './campaign.js';
