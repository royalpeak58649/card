import test from 'node:test';
import assert from 'node:assert/strict';

// Node 22 의 전역 WebSocket(클라이언트). 없는 환경이면 ws 패키지로 대신한다.
const WebSocketImpl = globalThis.WebSocket ?? (await import('ws')).WebSocket;

import { startServer } from '../server/index.js';
import { RoomManager } from '../server/rooms.js';
import { getCandidates } from '../engine/index.js';

/** 메시지 대기 타임아웃 */
const TIMEOUT_MS = 2000;

/**
 * 서버를 빈 포트에 띄우고 정리 함수와 함께 돌려준다.
 * @returns {Promise<{ base: string, wsUrl: string, close: () => Promise<void> }>}
 */
async function boot() {
  const { server, close } = await startServer({ port: 0, host: '127.0.0.1' });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  return { base: `http://127.0.0.1:${port}`, wsUrl: `ws://127.0.0.1:${port}/ws`, close };
}

/**
 * 소켓을 열고, 받은 메시지를 큐에 쌓는 도우미를 만든다.
 * @param {string} wsUrl
 * @returns {Promise<{ socket: WebSocket, next: (t: string) => Promise<any>, send: (msg: any) => void, close: () => void }>}
 */
async function connect(wsUrl) {
  const socket = new WebSocketImpl(wsUrl);
  /** @type {any[]} */
  const queue = [];
  /** @type {((msg: any) => void)[]} */
  const waiters = [];

  socket.addEventListener('message', (event) => {
    const msg = JSON.parse(String(event.data));
    const waiter = waiters.shift();
    if (waiter) waiter(msg);
    else queue.push(msg);
  });

  await new Promise((resolve, reject) => {
    socket.addEventListener('open', () => resolve(undefined), { once: true });
    socket.addEventListener('error', reject, { once: true });
  });

  /**
   * 특정 t 의 메시지가 올 때까지 기다린다.
   * @param {string} t
   * @returns {Promise<any>}
   */
  const next = (t) => {
    const index = queue.findIndex((msg) => msg.t === t);
    if (index >= 0) return Promise.resolve(queue.splice(index, 1)[0]);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const i = waiters.indexOf(waiter);
        if (i >= 0) waiters.splice(i, 1);
        reject(new Error(`시간 초과: ${t} 를 기다렸습니다`));
      }, TIMEOUT_MS);
      /** @param {any} msg */
      const waiter = (msg) => {
        if (msg.t !== t) {
          queue.push(msg);
          waiters.push(waiter);
          return;
        }
        clearTimeout(timer);
        resolve(msg);
      };
      waiters.push(waiter);
    });
  };

  return {
    socket,
    next,
    send: (msg) => socket.send(JSON.stringify(msg)),
    close: () => socket.close(),
  };
}

/**
 * 소켓이 닫힐 때까지 기다린다.
 * @param {WebSocket} socket
 * @returns {Promise<void>}
 */
function closed(socket) {
  if (socket.readyState === WebSocketImpl.CLOSED) return Promise.resolve();
  return new Promise((resolve) => socket.addEventListener('close', () => resolve(undefined), { once: true }));
}

/**
 * 잠깐 기다린다.
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test('HTTP: 정적 파일, 경로 탈출, 없는 경로', async () => {
  const { base, close } = await boot();
  try {
    const engine = await fetch(`${base}/engine/index.js`);
    assert.equal(engine.status, 200);
    assert.match(engine.headers.get('content-type') ?? '', /text\/javascript/);

    const escape = await fetch(`${base}/../package.json`);
    assert.ok(escape.status === 403 || escape.status === 404, `status=${escape.status}`);

    const missing = await fetch(`${base}/nope/nothing.js`);
    assert.equal(missing.status, 404);

    const root = await fetch(`${base}/`);
    assert.equal(root.status, 200);
  } finally {
    await close();
  }
});

test('두 클라이언트: create → join → state', async () => {
  const { wsUrl, close } = await boot();
  const a = await connect(wsUrl);
  const b = await connect(wsUrl);
  try {
    a.send({ t: 'create', name: '가' });
    const joinedA = await a.next('joined');
    await a.next('state'); // 혼자 들어왔을 때의 상태(view 없음)
    assert.equal(joinedA.you, 0);
    assert.equal(joinedA.room.length, 4);
    assert.match(joinedA.room, /^[A-HJ-NP-Z]{4}$/);
    assert.equal(typeof joinedA.token, 'string');

    b.send({ t: 'join', room: joinedA.room, name: '나' });
    const joinedB = await b.next('joined');
    assert.equal(joinedB.you, 1);

    const stateA = await a.next('state');
    const stateB = await b.next('state');
    assert.equal(stateA.view.stage, 'select');
    assert.equal(stateB.view.stage, 'select');
    assert.equal(stateB.opponent.name, '가');
    assert.equal(stateA.opponent.name, '나');
  } finally {
    a.close();
    b.close();
    await close();
  }
});

test('캐릭터 선택과 드래프트를 거쳐 대전 시작', async () => {
  const { wsUrl, close } = await boot();
  const a = await connect(wsUrl);
  const b = await connect(wsUrl);
  try {
    a.send({ t: 'create', name: '가' });
    const joinedA = await a.next('joined');
    await a.next('state'); // 혼자 들어왔을 때의 상태(view 없음)
    b.send({ t: 'join', room: joinedA.room, name: '나' });
    await b.next('joined');
    await a.next('state');
    await b.next('state');

    a.send({ t: 'action', action: { type: 'selectCharacter', characterId: 'hayun' } });
    await a.next('state');
    await b.next('state');
    b.send({ t: 'action', action: { type: 'selectCharacter', characterId: 'kangjin' } });
    const draftA = await a.next('state');
    await b.next('state');
    assert.equal(draftA.view.stage, 'draft');

    a.send({ t: 'action', action: { type: 'draft', cardIds: getCandidates('hayun').slice(0, 4) } });
    await a.next('state');
    await b.next('state');
    b.send({ t: 'action', action: { type: 'draft', cardIds: getCandidates('kangjin').slice(0, 4) } });
    const playingA = await a.next('state');
    const playingB = await b.next('state');
    assert.equal(playingA.view.stage, 'playing');
    assert.equal(playingB.view.stage, 'playing');
    assert.deepEqual(playingA.view.game.players[1].hand, []);
    assert.ok(playingA.view.game.players[0].hand.length > 0);
  } finally {
    a.close();
    b.close();
    await close();
  }
});

test('차례가 아닌 쪽의 조작은 error 이고 상대에게는 아무 것도 안 간다', async () => {
  const { wsUrl, close } = await boot();
  const a = await connect(wsUrl);
  const b = await connect(wsUrl);
  try {
    a.send({ t: 'create', name: '가' });
    const joinedA = await a.next('joined');
    await a.next('state'); // 혼자 들어왔을 때의 상태(view 없음)
    b.send({ t: 'join', room: joinedA.room, name: '나' });
    await b.next('joined');
    await a.next('state');
    await b.next('state');

    a.send({ t: 'action', action: { type: 'selectCharacter', characterId: 'hayun' } });
    await a.next('state');
    await b.next('state');
    b.send({ t: 'action', action: { type: 'selectCharacter', characterId: 'kangjin' } });
    await a.next('state');
    await b.next('state');
    a.send({ t: 'action', action: { type: 'draft', cardIds: getCandidates('hayun').slice(0, 4) } });
    await a.next('state');
    await b.next('state');
    b.send({ t: 'action', action: { type: 'draft', cardIds: getCandidates('kangjin').slice(0, 4) } });
    const playingA = await a.next('state');
    await b.next('state');

    const active = playingA.view.game.activeIndex;
    const idle = active === 0 ? b : a;
    const other = active === 0 ? a : b;
    idle.send({ t: 'action', action: { type: 'game', action: { type: 'endPhase' } } });
    const error = await idle.next('error');
    assert.equal(typeof error.message, 'string');
    assert.ok(error.message.length > 0);

    // 상대에게는 state 가 가지 않는다.
    await assert.rejects(other.next('state'), /시간 초과/);
  } finally {
    a.close();
    b.close();
    await close();
  }
});

test('vsAi: AI 가 자동으로 고르고 자기 차례를 진행한다', async () => {
  const { wsUrl, close } = await boot();
  const a = await connect(wsUrl);
  try {
    a.send({ t: 'vsAi', name: '가', aiSpeed: 'veryFast' });
    const joined = await a.next('joined');
    assert.equal(joined.you, 0);
    const initial = await a.next('state');
    assert.equal(initial.opponent.isAi, true);

    a.send({ t: 'action', action: { type: 'selectCharacter', characterId: 'hayun' } });
    const draft = await a.next('state');
    assert.equal(draft.view.stage, 'draft');
    assert.notEqual(draft.view.picks[1].characterId, null);

    a.send({ t: 'action', action: { type: 'draft', cardIds: getCandidates('hayun').slice(0, 4) } });
    const playing = await a.next('state');
    assert.equal(playing.view.stage, 'playing');

    // 사람이 차례를 넘기면 AI 가 진행하고 다시 사람 차례로 돌아온다.
    let view = playing.view;
    for (let i = 0; i < 20 && view.game.activeIndex !== 0; i++) {
      view = await a.next('state').then((msg) => msg.view);
    }
    assert.equal(view.game.activeIndex, 0);

    a.send({ t: 'action', action: { type: 'game', action: { type: 'endPhase' } } });
    let back = await a.next('state');
    for (let i = 0; i < 40 && back.view.game.activeIndex !== 0; i++) {
      back = await a.next('state');
    }
    assert.equal(back.view.game.activeIndex, 0);
    assert.equal(back.view.stage, 'playing');
  } finally {
    a.close();
    await close();
  }
});

test('AI 속도: 모험 행동별 전송, 잘못된 속도 거절, 즉시 속도 변경, 재접속·퇴장 시 타이머 정리', async () => {
  const { wsUrl, close } = await boot();
  const a = await connect(wsUrl);
  let again;
  try {
    a.send({ t: 'campaign', campaignId: 'silverbeast', name: '나' });
    const joined = await a.next('joined');
    assert.equal((await a.next('state')).aiSpeed, 'normal');
    a.send({ t: 'aiSpeed', speed: 'invalid' });
    assert.match((await a.next('error')).message, /올바른 AI 진행 속도/);
    a.send({ t: 'action', action: { type: 'selectCharacter', characterId: 'hayun' } });
    await a.next('state');
    a.send({ t: 'action', action: { type: 'draft', cardIds: getCandidates('hayun').slice(0, 4) } });
    await a.next('state');
    let before;
    for (let i = 0; i < 3; i++) {
      a.send({ t: 'action', action: { type: 'game', action: { type: 'endPhase' } } });
      before = await a.next('state');
    }
    assert.equal(before.view.game.activeIndex, 1);
    const firstStep = await a.next('state');
    assert.equal(firstStep.view.game.log.length, before.view.game.log.length + 1);
    assert.equal(firstStep.view.game.activeIndex, 1);
    assert.deepEqual(firstStep.view.game.players[1].hand, []);

    a.close();
    await closed(a.socket);
    // 대기 중이던 다음 행동은 연결이 끊기면 취소한다.
    await sleep(950);
    again = await connect(wsUrl);
    again.send({ t: 'rejoin', room: joined.room, token: joined.token });
    await again.next('joined');
    const resumed = await again.next('state');
    assert.equal(resumed.view.game.log.length, firstStep.view.game.log.length);
    assert.equal(resumed.aiSpeed, 'normal');
    again.send({ t: 'aiSpeed', speed: 'veryFast' });
    assert.equal((await again.next('state')).aiSpeed, 'veryFast');
    const done = await again.next('state');
    assert.equal(done.view.game.activeIndex, 0);
    assert.ok(done.view.game.log.length > resumed.view.game.log.length + 1);

    again.send({ t: 'aiSpeed', speed: 'slow' });
    await again.next('state');
    for (let i = 0; i < 3; i++) {
      again.send({ t: 'action', action: { type: 'game', action: { type: 'endPhase' } } });
      await again.next('state');
    }
    again.send({ t: 'leave' });
    await again.next('left');
    again.send({ t: 'create', name: '새 방' });
    await again.next('joined');
    assert.equal((await again.next('state')).view, null);
    // 이전 AI 타이머가 새 방에 상태를 보내지 않는다.
    await assert.rejects(again.next('state'), /시간 초과/);
    again.send({ t: 'aiSpeed', speed: 'fast' });
    assert.match((await again.next('error')).message, /AI 대전에서만/);
  } finally {
    a.close();
    again?.close();
    await close();
  }
});

test('vsAi: 선택한 속도로 상대 차례를 보여 주고 도중에 속도를 바꾼다', async () => {
  const { wsUrl, close } = await boot();
  const a = await connect(wsUrl);
  try {
    a.send({ t: 'vsAi', name: '나', aiSpeed: 'veryFast' });
    await a.next('joined');
    await a.next('state');
    a.send({ t: 'action', action: { type: 'selectCharacter', characterId: 'hayun' } });
    await a.next('state');
    a.send({ t: 'action', action: { type: 'draft', cardIds: getCandidates('hayun').slice(0, 4) } });
    let msg = await a.next('state');
    if (msg.view.game.activeIndex === 1) msg = await a.next('state');
    a.send({ t: 'aiSpeed', speed: 'fast' });
    await a.next('state');
    for (let i = 0; i < 3; i++) {
      a.send({ t: 'action', action: { type: 'game', action: { type: 'endPhase' } } });
      msg = await a.next('state');
    }
    assert.equal(msg.view.game.activeIndex, 1);
    const step = await a.next('state');
    assert.equal(step.view.game.log.length, msg.view.game.log.length + 1);
    assert.equal(step.aiSpeed, 'fast');
    a.send({ t: 'aiSpeed', speed: 'veryFast' });
    await a.next('state');
    assert.equal((await a.next('state')).view.game.activeIndex, 0);
  } finally {
    a.close();
    await close();
  }
});

test('rejoin: 끊긴 뒤 token 으로 같은 자리에 다시 앉는다', async () => {
  const { wsUrl, close } = await boot();
  const a = await connect(wsUrl);
  const b = await connect(wsUrl);
  try {
    a.send({ t: 'create', name: '가' });
    const joinedA = await a.next('joined');
    await a.next('state'); // 혼자 들어왔을 때의 상태(view 없음)
    b.send({ t: 'join', room: joinedA.room, name: '나' });
    await b.next('joined');
    await a.next('state');
    await b.next('state');

    a.close();
    await closed(a.socket);
    const disconnected = await b.next('state');
    assert.equal(disconnected.opponent.connected, false);

    const again = await connect(wsUrl);
    try {
      again.send({ t: 'rejoin', room: joinedA.room, token: joinedA.token });
      const rejoined = await again.next('joined');
      assert.equal(rejoined.you, joinedA.you);
      const state = await again.next('state');
      assert.equal(state.view.you, joinedA.you);
      const seenByB = await b.next('state');
      assert.equal(seenByB.opponent.connected, true);
    } finally {
      again.close();
    }
  } finally {
    b.close();
    await close();
  }
});

test('RoomManager: 없는 방, 가득 찬 방, 틀린 token', async () => {
  const rooms = new RoomManager();
  assert.throws(() => rooms.join('ZZZZ', '가'), /방을 찾을 수 없습니다/);

  const room = rooms.createRoom({ vsAi: false });
  rooms.join(room.code, '가');
  rooms.join(room.code, '나');
  assert.throws(() => rooms.join(room.code, '다'), /방이 가득 찼습니다/);
  assert.ok(room.match);
  assert.equal(room.match.stage, 'select');

  assert.throws(() => rooms.rejoin(room.code, 'wrong-token'), /다시 들어갈 수 없습니다/);
  assert.throws(() => rooms.rejoin('ZZZZ', 'x'), /방을 찾을 수 없습니다/);

  const aiRoom = rooms.createRoom({ vsAi: true });
  assert.equal(aiRoom.seats[1].isAi, true);
  assert.equal(aiRoom.match, null);
  rooms.join(aiRoom.code, '가');
  assert.ok(aiRoom.match);

  // 오래된 방은 sweep 으로 지운다.
  const removed = rooms.sweep(Date.now() + 3 * 60 * 60 * 1000);
  assert.ok(removed.includes(room.code));
  assert.equal(rooms.rooms.size, 0);
  await sleep(0);
});

test('leave: 대기 방을 삭제하고 재접속을 막으며 같은 연결에서 새 게임을 만든다', async () => {
  const { wsUrl, close } = await boot();
  const a = await connect(wsUrl);
  try {
    a.send({ t: 'create', name: '가' });
    const old = await a.next('joined');
    const waiting = await a.next('state');
    assert.equal(waiting.view, null);
    a.send({ t: 'leave' });
    await a.next('left');
    a.send({ t: 'action', action: { type: 'selectCharacter', characterId: 'hayun' } });
    assert.match((await a.next('error')).message, /방에 들어가야/);
    a.send({ t: 'rejoin', room: old.room, token: old.token });
    assert.match((await a.next('error')).message, /방을 찾을 수 없습니다/);
    a.send({ t: 'vsAi', name: '새 게임' });
    await a.next('joined');
    assert.equal((await a.next('state')).view.stage, 'select');
    a.send({ t: 'leave' });
    await a.next('left');
    a.send({ t: 'campaign', campaignId: 'silverbeast', name: '모험' });
    await a.next('joined');
    assert.equal((await a.next('state')).campaign.status, 'battle');
    a.send({ t: 'leave' });
    await a.next('left');
  } finally {
    a.close();
    await close();
  }
});

test('leave: 상대도 방에서 나가며 이전 토큰·조작은 새 방에 영향을 주지 않는다', async () => {
  const { wsUrl, close } = await boot();
  const a = await connect(wsUrl);
  const b = await connect(wsUrl);
  try {
    a.send({ t: 'create', name: '가' });
    const old = await a.next('joined');
    await a.next('state');
    b.send({ t: 'join', room: old.room, name: '나' });
    await b.next('joined');
    await a.next('state');
    await b.next('state');
    a.send({ t: 'leave' });
    await a.next('left');
    assert.match((await b.next('left')).message, /상대.*종료/);
    b.send({ t: 'action', action: { type: 'selectCharacter', characterId: 'hayun' } });
    assert.match((await b.next('error')).message, /방에 들어가야/);
    b.send({ t: 'create', name: '다시' });
    await b.next('joined');
    assert.equal((await b.next('state')).view, null);
    a.send({ t: 'rejoin', room: old.room, token: old.token });
    assert.match((await a.next('error')).message, /방을 찾을 수 없습니다/);
  } finally {
    a.close();
    b.close();
    await close();
  }
});
