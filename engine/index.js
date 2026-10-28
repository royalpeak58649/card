// 서버·클라이언트는 이 파일만 import 한다. 카드·진영·캐릭터 등록도 여기서 일어난다.
import './cards/basic.js';
import './cards/section8.js';

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
  registerCharacters,
  getCharacter,
} from './characters.js';
export { registerCards, getCardDef, allCardIds } from './cards/registry.js';
