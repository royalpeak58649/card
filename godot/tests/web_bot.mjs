// 웹판 브라우저 클라이언트와 같은 메시지로 서버에 붙는 시험용 참가자.
// Godot 방장이 만든 방에 들어가 끝까지 대전한다(웹 사용자 ↔ Godot 사용자 호환 확인).
//   node godot/tests/web_bot.mjs ws://127.0.0.1:18080/ws /tmp/room.txt /tmp/web_result.txt
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import WebSocket from 'ws';
import { allCharacterIds, getCandidates } from '../../engine/index.js';
import { chooseAiAction } from '../../engine/ai.js';

const [url, roomFile, resultFile] = process.argv.slice(2);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

for (let i = 0; i < 600 && !(existsSync(roomFile) && readFileSync(roomFile, 'utf8').trim()); i++) await sleep(100);
const room = readFileSync(roomFile, 'utf8').trim();
const ws = new WebSocket(url);
let you = null;
let busy = false;
const send = (msg) => ws.send(JSON.stringify(msg));

const timer = setTimeout(() => {
  console.error('[웹] 시간 초과');
  process.exit(1);
}, 15 * 60 * 1000);

ws.on('open', () => send({ t: 'join', room, name: '웹 사용자' }));
ws.on('message', (data) => {
  const msg = JSON.parse(String(data));
  if (msg.t === 'joined') {
    you = msg.you;
    console.log(`[웹] 방 ${msg.room} 참가, ${you}번 자리`);
  } else if (msg.t === 'error') {
    console.log(`[웹] 서버 오류: ${msg.message}`);
    busy = false;
  } else if (msg.t === 'left') {
    console.log('[웹] 방장이 나가 방이 종료됨');
    clearTimeout(timer);
    ws.close();
    process.exit(0);
  } else if (msg.t === 'state' && msg.view) {
    busy = false;
    const view = msg.view;
    if (view.stage === 'select' && view.picks[you].characterId === null) {
      send({ t: 'action', action: { type: 'selectCharacter', characterId: allCharacterIds()[3] } });
    } else if (view.stage === 'draft' && view.picks[you].cardIds === null) {
      send({ t: 'action', action: { type: 'draft', cardIds: getCandidates(view.picks[you].characterId).slice(0, 4) } });
    } else if (view.stage === 'playing' && !busy) {
      // 브라우저처럼 가려진 view 만 보고 조작을 고른다(손패·거래소·선택지는 다 보인다).
      const action = chooseAiAction(view.game, you);
      if (action) {
        busy = true;
        send({ t: 'action', action: { type: 'game', action } });
      }
    } else if (view.stage === 'finished') {
      const res = `${view.draw ? 'draw' : view.winner} ${view.game.turn}`;
      console.log(`[웹] 경기 종료 · 결과 ${res}`);
      writeFileSync(resultFile, res);
    }
  }
});
