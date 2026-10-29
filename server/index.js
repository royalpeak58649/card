// HTTP 정적 파일 + WebSocket 방 서버. 규격은 docs/PROTOCOL.md.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { WebSocketServer } from 'ws';

import { viewFor, campaignView } from '../engine/index.js';
import { RoomManager } from './rooms.js';

/** @typedef {import('./rooms.js').Room} Room */

/** 저장소 루트 */
const ROOT = fileURLToPath(new URL('..', import.meta.url));
/** 클라이언트 폴더 */
const CLIENT_DIR = join(ROOT, 'client');
/** 엔진 폴더 */
const ENGINE_DIR = join(ROOT, 'engine');
/** 확장자별 Content-Type */
const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.mp3': 'audio/mpeg',
};
/** 방 정리 주기 */
const SWEEP_INTERVAL_MS = 10 * 60 * 1000;

/**
 * 경로를 폴더 안의 실제 파일 경로로 바꾼다. 폴더를 벗어나면 null.
 * @param {string} dir
 * @param {string} relative
 * @returns {string|null}
 */
function resolveInside(dir, relative) {
  const target = normalize(join(dir, relative));
  if (target !== dir && !target.startsWith(dir.endsWith(sep) ? dir : dir + sep)) return null;
  return target;
}

/**
 * 파일을 읽어 응답한다. 없으면 404.
 * @param {import('node:http').ServerResponse} res
 * @param {string} filePath
 * @returns {Promise<void>}
 */
async function sendFile(res, filePath) {
  let body;
  try {
    body = await readFile(filePath);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('찾을 수 없습니다');
    return;
  }
  const type = CONTENT_TYPES[extname(filePath).toLowerCase()] ?? 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': type });
  res.end(body);
}

/**
 * HTTP 요청을 처리한다.
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 * @returns {Promise<void>}
 */
async function handleHttp(req, res) {
  const rawUrl = req.url ?? '/';
  const pathname = decodeURIComponent(rawUrl.split('?')[0]);

  if (pathname.includes('..')) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('금지된 경로');
    return;
  }

  if (pathname === '/' || pathname === '/index.html') {
    const index = join(CLIENT_DIR, 'index.html');
    try {
      await readFile(index);
    } catch {
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('카드 게임 서버가 실행 중입니다. 클라이언트는 /client/ 아래에 있습니다.');
      return;
    }
    await sendFile(res, index);
    return;
  }

  if (pathname.startsWith('/client/')) {
    const filePath = resolveInside(CLIENT_DIR, pathname.slice('/client/'.length));
    if (!filePath) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('금지된 경로');
      return;
    }
    await sendFile(res, filePath);
    return;
  }

  if (pathname.startsWith('/engine/')) {
    const filePath = resolveInside(ENGINE_DIR, pathname.slice('/engine/'.length));
    if (!filePath) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('금지된 경로');
      return;
    }
    await sendFile(res, filePath);
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('찾을 수 없습니다');
}

/**
 * 서버를 시작한다.
 * @param {{ port?: number, host?: string }} [opts]
 * @returns {Promise<{ server: import('node:http').Server, close: () => Promise<void> }>}
 */
export async function startServer({ port = 8080, host = '0.0.0.0' } = {}) {
  const rooms = new RoomManager();
  const server = createServer((req, res) => {
    handleHttp(req, res).catch(() => {
      if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('서버 오류');
    });
  });

  const wss = new WebSocketServer({ server, path: '/ws' });

  /**
   * 소켓에 JSON 메시지를 보낸다.
   * @param {import('ws').WebSocket} socket
   * @param {any} message
   * @returns {void}
   */
  const send = (socket, message) => {
    if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
  };

  /**
   * 방의 모든 접속자에게 state 를 보낸다.
   * @param {Room} room
   * @returns {void}
   */
  const broadcast = (room) => {
    for (let you = 0; you < 2; you++) {
      const seat = room.seats[you];
      if (!seat || seat.isAi || !seat.connected) continue;
      const socket = sockets.get(seat.token);
      if (!socket) continue;
      const other = room.seats[1 - you];
      if (room.campaign) {
        // 모험 모드: 경기 화면은 그대로 쓰고, 캠페인 정보를 따로 보낸다.
        const { match, ...campaign } = campaignView(room.campaign);
        send(socket, {
          t: 'state',
          view: match,
          campaign,
          opponent: { name: match.players[1].name, connected: true, isAi: true },
        });
        continue;
      }
      send(socket, {
        t: 'state',
        view: room.match ? viewFor(room.match, you) : null,
        opponent: other ? { name: other.name, connected: other.connected, isAi: other.isAi } : null,
      });
    }
  };

  /** @type {Map<string, import('ws').WebSocket>} token → 소켓 */
  const sockets = new Map();
  /** @type {Map<import('ws').WebSocket, { code: string, you: number, token: string }>} */
  const sessions = new Map();

  // 명시적 퇴장은 방을 끝낸다. 단순 연결 끊김은 기존 재접속 동작을 유지한다.
  const leave = (socket) => {
    const session = sessions.get(socket);
    if (session) {
      rooms.rooms.delete(session.code);
      for (const [peer, member] of sessions) {
        if (member.code !== session.code) continue;
        sessions.delete(peer);
        if (sockets.get(member.token) === peer) sockets.delete(member.token);
        send(peer, { t: 'left', message: peer === socket ? '' : '상대가 로비로 돌아가 방이 종료되었습니다.' });
      }
    } else {
      send(socket, { t: 'left' });
    }
  };

  /**
   * 방에 앉은 뒤 공통 처리.
   * @param {import('ws').WebSocket} socket
   * @param {Room} room
   * @param {number} you
   * @param {string|null} token
   * @returns {void}
   */
  const enter = (socket, room, you, token) => {
    if (token) {
      sockets.set(token, socket);
      sessions.set(socket, { code: room.code, you, token });
    }
    send(socket, { t: 'joined', room: room.code, you, token });
    broadcast(room);
  };

  /**
   * 메시지 하나를 처리한다.
   * @param {import('ws').WebSocket} socket
   * @param {any} msg
   * @returns {void}
   */
  const handleMessage = (socket, msg) => {
    if (!msg || typeof msg !== 'object') {
      send(socket, { t: 'error', message: '잘못된 메시지입니다' });
      return;
    }

    try {
      switch (msg.t) {
        case 'leave':
          leave(socket);
          return;
        case 'create': {
          const room = rooms.createRoom({ vsAi: false });
          const { you, token } = rooms.join(room.code, msg.name);
          enter(socket, room, you, token);
          return;
        }
        case 'vsAi': {
          const room = rooms.createRoom({ vsAi: true });
          const { you, token } = rooms.join(room.code, msg.name);
          enter(socket, room, you, token);
          return;
        }
        case 'campaign': {
          const room = rooms.createRoom({ campaignId: String(msg.campaignId ?? '') });
          const { you, token } = rooms.join(room.code, msg.name);
          enter(socket, room, you, token);
          return;
        }
        case 'join': {
          const { room, you, token } = rooms.join(msg.room, msg.name);
          enter(socket, room, you, token);
          return;
        }
        case 'rejoin': {
          const { room, you } = rooms.rejoin(msg.room, msg.token);
          enter(socket, room, you, msg.token);
          return;
        }
        case 'action': {
          const session = sessions.get(socket);
          if (!session) throw new Error('먼저 방에 들어가야 합니다');
          const room = rooms.act(session.code, session.you, msg.action);
          broadcast(room);
          return;
        }
        case 'ping': {
          send(socket, { t: 'pong' });
          return;
        }
        default:
          send(socket, { t: 'error', message: '알 수 없는 요청입니다' });
      }
    } catch (err) {
      send(socket, { t: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  };

  wss.on('connection', (socket) => {
    socket.on('message', (data) => {
      let msg;
      try {
        msg = JSON.parse(String(data));
      } catch {
        send(socket, { t: 'error', message: 'JSON 이 아닙니다' });
        return;
      }
      handleMessage(socket, msg);
    });

    socket.on('close', () => {
      const session = sessions.get(socket);
      sessions.delete(socket);
      if (!session) return;
      if (sockets.get(session.token) === socket) sockets.delete(session.token);
      const room = rooms.rooms.get(session.code);
      if (!room) return;
      const seat = room.seats[session.you];
      if (!seat || seat.token !== session.token) return;
      seat.connected = false;
      broadcast(room);
    });
  });

  const sweeper = setInterval(() => rooms.sweep(), SWEEP_INTERVAL_MS);
  sweeper.unref?.();

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      resolve(undefined);
    });
  });

  /**
   * 서버를 닫는다.
   * @returns {Promise<void>}
   */
  const close = async () => {
    clearInterval(sweeper);
    for (const socket of wss.clients) socket.terminate();
    await new Promise((resolve) => wss.close(() => resolve(undefined)));
    await new Promise((resolve) => server.close(() => resolve(undefined)));
  };

  return { server, close };
}

// 직접 실행하면 PORT 환경변수(기본 8080)로 시작한다.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const port = Number(process.env.PORT ?? 8080);
  const { server } = await startServer({ port });
  const address = server.address();
  const shown = typeof address === 'object' && address ? address.port : port;
  console.log(`카드 게임 서버: http://localhost:${shown}/ (WebSocket: /ws)`);
}
