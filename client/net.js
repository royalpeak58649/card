// 서버 WebSocket 연결. 끊기면 자동 재접속하고, 저장된 세션이 있으면 rejoin 을 보낸다.

/** localStorage 키 */
const SESSION_KEY = 'cardDuel.session';
/** 재접속 대기 시간(ms) */
const RECONNECT_DELAY = 2000;
/** ping 주기(ms) */
const PING_INTERVAL = 25000;

/**
 * 저장된 세션을 읽는다.
 * @returns {{ room: string, token: string } | null}
 */
export function loadSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.room !== 'string' || typeof parsed.token !== 'string') return null;
    return { room: parsed.room, token: parsed.token };
  } catch {
    return null;
  }
}

/**
 * 세션을 저장한다.
 * @param {{ room: string, token: string }} session
 * @returns {void}
 */
export function saveSession(session) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify({ room: session.room, token: session.token }));
  } catch {
    // 저장 실패는 무시한다(사생활 보호 모드 등).
  }
}

/**
 * 세션을 지운다.
 * @returns {void}
 */
export function clearSession() {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    // 무시
  }
}

/**
 * 서버에 접속한다.
 * @param {(msg: any) => void} onMessage 서버 메시지(JSON 파싱 결과)를 받는 콜백
 * @returns {{ send: (obj: any) => void }}
 */
export function connect(onMessage) {
  const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
  const url = `${protocol}://${location.host}/ws`;

  /** @type {WebSocket | null} */
  let socket = null;
  /** @type {any[]} */
  let queue = [];
  /** @type {ReturnType<typeof setInterval> | null} */
  let pingTimer = null;
  let closed = false;

  function open() {
    socket = new WebSocket(url);

    socket.addEventListener('open', () => {
      const session = loadSession();
      if (session) {
        socket.send(JSON.stringify({ t: 'rejoin', room: session.room, token: session.token }));
      }
      for (const msg of queue) socket.send(JSON.stringify(msg));
      queue = [];
      if (pingTimer) clearInterval(pingTimer);
      pingTimer = setInterval(() => {
        if (socket && socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ t: 'ping' }));
        }
      }, PING_INTERVAL);
    });

    socket.addEventListener('message', (ev) => {
      let msg;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }
      if (!msg || typeof msg !== 'object') return;
      if (msg.t === 'joined') {
        saveSession({ room: msg.room, token: msg.token });
      }
      if (msg.t === 'left') clearSession();
      onMessage(msg);
    });

    socket.addEventListener('close', () => {
      if (pingTimer) {
        clearInterval(pingTimer);
        pingTimer = null;
      }
      socket = null;
      if (closed) return;
      setTimeout(open, RECONNECT_DELAY);
    });

    socket.addEventListener('error', () => {
      // close 이벤트가 뒤따르므로 여기서는 아무것도 하지 않는다.
    });
  }

  open();

  return {
    /**
     * 메시지를 보낸다. 연결 전이면 열린 뒤에 보낸다.
     * @param {any} obj
     * @returns {void}
     */
    send(obj) {
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(obj));
      } else {
        queue.push(obj);
      }
    },
  };
}
