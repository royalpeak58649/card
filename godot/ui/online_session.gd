class_name OnlineSession
extends Node
## 웹판 Node 서버(server/index.js)에 WebSocket 으로 붙는 온라인 대전 세션. 규격은 docs/PROTOCOL.md.
## 판정은 전부 서버가 하고, 이 세션은 받은 view 를 화면에 넘기고 조작을 action 으로 보낸다.
## 화면 쪽에서 보면 GameSession(AI 연습)과 같은 함수(stage·view·act_game·human_can_act …)를 가진다.
## 브라우저 클라이언트와 같은 메시지를 쓰므로 Godot 사용자와 웹 사용자가 같은 방에서 대전할 수 있다.

signal changed
signal toast(message: String)
## 화면 공용 인터페이스(온라인에서는 쓰지 않음)
signal ai_acted(action: Dictionary)
## 방이 끝났거나 들어갈 수 없어 로비로 돌아가야 할 때
signal left(message: String)

const PING_INTERVAL := 25.0
const RECONNECT_DELAY := 2.0
const MAX_RECONNECT_TRIES := 30

var url := ""
var room := ""
var you := -1
var token := ""
var last_view = null
var opponent = null
## 받은 state 메시지 수(시험 도구가 응답을 기다릴 때 쓴다)
var state_seq := 0

var _ws: WebSocketPeer
var _open := false
var _ever_opened := false
var _queue: Array = []
var _ping_t := 0.0
var _reconnect_t := -1.0
var _reconnect_tries := 0
var _leaving := false
## 조작을 보낸 뒤 서버 응답(state·error)을 기다리는 중(두 번 눌러 두 번 보내지 않도록)
var _awaiting := false


func _ready() -> void:
	set_process(false)


# ─────────────────────────── 시작·종료 ───────────────────────────

## 새 방을 만든다.
func create_room(server_url: String, player_name: String) -> void:
	_start(server_url, {"t": "create", "name": player_name})


## 방 코드로 참가한다.
func join_room(server_url: String, code: String, player_name: String) -> void:
	_start(server_url, {"t": "join", "room": code.strip_edges().to_upper(), "name": player_name})


## 저장된 자리로 다시 들어간다(앱 재실행·연결 끊김 후).
func resume(server_url: String, saved_room: String, saved_token: String) -> void:
	_reset()
	room = saved_room
	token = saved_token
	url = server_url
	_connect()


func _start(server_url: String, first: Dictionary) -> void:
	_reset()
	url = server_url.strip_edges()
	_queue.append(first)
	_connect()


func _reset() -> void:
	_close_socket()
	room = ""
	you = -1
	token = ""
	last_view = null
	opponent = null
	_queue.clear()
	_leaving = false
	_awaiting = false
	_reconnect_t = -1.0
	_reconnect_tries = 0
	_ever_opened = false


## 로비로: 서버에 퇴장을 알리고(방 종료) 연결을 닫는다.
func stop() -> void:
	_leaving = true
	if _open:
		_send({"t": "leave"})
		_ws.poll()
	UiKit.settings().clear_online_session()
	_close_socket()
	room = ""
	last_view = null
	set_process(false)


func active() -> bool:
	return is_processing()


func _connect() -> void:
	if url == "" or not (url.begins_with("ws://") or url.begins_with("wss://")):
		toast.emit("서버 주소는 ws:// 또는 wss:// 로 시작해야 합니다")
		left.emit("")
		return
	_ws = WebSocketPeer.new()
	_ws.inbound_buffer_size = 1 << 22
	var err := _ws.connect_to_url(url)
	if err != OK:
		_ws = null
		toast.emit("서버에 연결할 수 없습니다: %s" % url)
		left.emit("")
		return
	_open = false
	set_process(true)
	changed.emit()


func _close_socket() -> void:
	if _ws != null:
		_ws.close()
		_ws = null
	_open = false


## 시험용: 연결이 갑자기 끊긴 상황을 흉내 낸다(자동 재접속 확인).
func debug_drop_connection() -> void:
	if _ws != null:
		_ws.close()


# ─────────────────────────── 송수신 ───────────────────────────

func _send(msg: Dictionary) -> void:
	if _open and _ws != null:
		_ws.send_text(JSON.stringify(msg))
	else:
		_queue.append(msg)


func _process(delta: float) -> void:
	if _ws == null:
		if _reconnect_t >= 0.0:
			_reconnect_t -= delta
			if _reconnect_t < 0.0:
				_reconnect_tries += 1
				_connect()
		return
	_ws.poll()
	var st := _ws.get_ready_state()
	if st == WebSocketPeer.STATE_OPEN:
		if not _open:
			_on_open()
		while _ws != null and _ws.get_available_packet_count() > 0:
			var text := _ws.get_packet().get_string_from_utf8()
			var msg = JSON.parse_string(text)
			if msg is Dictionary:
				_on_message(GameData.intify(msg))
		_ping_t += delta
		if _ping_t >= PING_INTERVAL and _ws != null:
			_ping_t = 0.0
			_send({"t": "ping"})
	elif st == WebSocketPeer.STATE_CLOSED:
		_on_closed()


func _on_open() -> void:
	_open = true
	_ever_opened = true
	_reconnect_tries = 0
	_ping_t = 0.0
	# 이미 자리가 있으면(재접속) 먼저 같은 자리로 돌아간다.
	if room != "" and token != "":
		_ws.send_text(JSON.stringify({"t": "rejoin", "room": room, "token": token}))
	for msg in _queue:
		_ws.send_text(JSON.stringify(msg))
	_queue.clear()
	changed.emit()


func _on_closed() -> void:
	var was_open := _open
	_ws = null
	_open = false
	_awaiting = false
	if _leaving:
		set_process(false)
		return
	if room != "" and token != "" and _reconnect_tries < MAX_RECONNECT_TRIES:
		# 방에 들어가 있었다면 잠시 뒤 같은 자리로 다시 접속한다.
		if was_open:
			toast.emit("서버 연결이 끊겼습니다. 다시 연결하는 중…")
		_reconnect_t = RECONNECT_DELAY
		changed.emit()
		return
	set_process(false)
	toast.emit("서버에 연결할 수 없습니다" if not _ever_opened else "서버 연결이 끊겼습니다")
	left.emit("")


func _on_message(msg: Dictionary) -> void:
	match msg.get("t"):
		"joined":
			room = str(msg["room"])
			you = int(msg["you"])
			if msg.get("token") != null:
				token = str(msg["token"])
			UiKit.settings().save_online_session(url, room, token)
			changed.emit()
		"state":
			_awaiting = false
			last_view = msg.get("view")
			opponent = msg.get("opponent")
			if last_view is Dictionary and last_view.has("you"):
				you = int(last_view["you"])
			state_seq += 1
			changed.emit()
		"error":
			_awaiting = false
			var m := str(msg.get("message", "오류가 발생했습니다"))
			# 자리가 없어졌으면(서버 재시작·오래된 방) 저장된 자리를 지우고 로비로.
			if room != "" and last_view == null and (m.contains("방을 찾을 수 없습니다") or m.contains("다시 들어갈 수 없습니다")):
				UiKit.settings().clear_online_session()
				_leaving = true
				_close_socket()
				set_process(false)
				room = ""
				left.emit(m)
				return
			if room == "" and m != "":
				# 방 만들기·참가 실패: 로비에 머문다.
				_leaving = true
				_close_socket()
				set_process(false)
				left.emit(m)
				return
			toast.emit(m)
			changed.emit()
		"left":
			UiKit.settings().clear_online_session()
			_leaving = true
			_close_socket()
			set_process(false)
			room = ""
			last_view = null
			left.emit(str(msg.get("message", "")))
		_:
			pass


# ─────────────────────────── 화면 공용 인터페이스 ───────────────────────────

func act(action: Dictionary) -> String:
	if room == "":
		return "방에 들어가 있지 않습니다"
	_awaiting = true
	_send({"t": "action", "action": action})
	changed.emit()
	return ""


func act_game(action: Dictionary) -> String:
	return act({"type": "game", "action": action})


func is_connected_to_server() -> bool:
	return _open


## 방에는 들어갔지만 아직 상대가 없어 경기가 시작되지 않았다
func waiting() -> bool:
	return room != "" and last_view == null


func stage() -> String:
	if last_view is Dictionary:
		return last_view.get("stage", "")
	return ""


func game() -> Dictionary:
	if last_view is Dictionary and last_view.get("game") != null:
		return last_view["game"]
	return {}


func view() -> Dictionary:
	return last_view if last_view is Dictionary else {}


func human_can_act() -> bool:
	if not _open or _awaiting or stage() != "playing":
		return false
	var g := game()
	if g.is_empty() or g["phase"] == "gameOver":
		return false
	var pending = g.get("pending")
	if pending != null:
		return int(pending["playerIndex"]) == you and pending.get("waiting") != true
	return int(g["activeIndex"]) == you


func is_thinking() -> bool:
	return false


func is_campaign() -> bool:
	return false


func campaign_view() -> Dictionary:
	return {}


func campaign_status() -> String:
	return ""


func mode_label() -> String:
	return "온라인 대전 · 방 %s" % room


func can_restart() -> bool:
	return false


func opponent_info() -> Dictionary:
	return opponent if opponent is Dictionary else {}
