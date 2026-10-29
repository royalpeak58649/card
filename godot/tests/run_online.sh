#!/usr/bin/env bash
# 온라인 대전 점검: 웹판 Node 서버를 띄우고 Godot 클라이언트 둘(방장·참가자)로 한 판을 끝까지 진행한다.
# 참가자는 6턴에 연결을 일부러 끊어 자동 재접속을 확인한다. 방장은 화면이 있으면 스크린샷을 남긴다.
#   bash godot/tests/run_online.sh [/tmp/oshots]
#   GUEST=web bash godot/tests/run_online.sh   # 참가자를 웹판 클라이언트와 같은 메시지를 쓰는 Node 봇으로(웹 ↔ Godot 호환)
set -u
cd "$(dirname "$0")/../.."
SHOTS="${1:-}"
PORT="${PORT:-18080}"
WORK="$(mktemp -d)"
GODOT="${GODOT:-godot}"
URL="ws://127.0.0.1:${PORT}/ws"

PORT="$PORT" node server/index.js > "$WORK/server.log" 2>&1 &
SERVER=$!
trap 'kill $SERVER 2>/dev/null' EXIT
for _ in $(seq 1 50); do
  grep -q "WebSocket" "$WORK/server.log" 2>/dev/null && break
  sleep 0.1
done

HOST_CMD=("$GODOT" --path godot -s res://tests/online_smoke.gd -- --settings user://test_host.cfg --url "$URL" --create "$WORK/room.txt" --result "$WORK/host.txt")
if [ -n "$SHOTS" ] && command -v xvfb-run >/dev/null; then
  HOST_CMD=(xvfb-run -a -s "-screen 0 1280x800x24" "$GODOT" --path godot --rendering-driver opengl3 -s res://tests/online_smoke.gd -- --settings user://test_host.cfg --url "$URL" --create "$WORK/room.txt" --result "$WORK/host.txt" --shots "$SHOTS")
else
  HOST_CMD=("$GODOT" --headless "${HOST_CMD[@]:1}")
fi
timeout 900 "${HOST_CMD[@]}" > "$WORK/host.log" 2>&1 &
HOST=$!
if [ "${GUEST:-godot}" = "web" ]; then
  timeout 900 node godot/tests/web_bot.mjs "$URL" "$WORK/room.txt" "$WORK/guest.txt" > "$WORK/guest.log" 2>&1
else
  timeout 900 "$GODOT" --headless --path godot -s res://tests/online_smoke.gd -- --settings user://test_guest.cfg --url "$URL" --join "$WORK/room.txt" --drop 6 --result "$WORK/guest.txt" > "$WORK/guest.log" 2>&1
fi
GUEST_RC=$?
wait $HOST
HOST_RC=$?

grep -h -E "^\[(방장|참가|웹)\]|SCRIPT ERROR|실패" "$WORK/host.log" "$WORK/guest.log"
HOST_RES="$(cat "$WORK/host.txt" 2>/dev/null)"
GUEST_RES="$(cat "$WORK/guest.txt" 2>/dev/null)"
echo "방장 결과: ${HOST_RES:-없음} / 참가자 결과: ${GUEST_RES:-없음} (승자 번호·턴)"
if [ $HOST_RC -ne 0 ] || [ $GUEST_RC -ne 0 ] || [ -z "$HOST_RES" ] || [ "$HOST_RES" != "$GUEST_RES" ]; then
  echo "온라인 점검 실패 (기록: $WORK)"
  exit 1
fi
if grep -q "SCRIPT ERROR" "$WORK/host.log" "$WORK/guest.log"; then
  echo "온라인 점검 실패: 스크립트 오류 (기록: $WORK)"
  exit 1
fi
echo "온라인 점검 통과"
