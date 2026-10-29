extends Node
## 저장되는 설정(AI 진행 속도·플레이어 이름·온라인 서버 주소·재접속 정보). user://settings.cfg 에 보관한다.
## 실행 인자 `-- --settings user://다른이름.cfg` 로 파일을 바꿀 수 있다(한 컴퓨터에서 두 창을 띄워 시험할 때).

signal ai_speed_changed(speed_id: String)

## 웹판 서버의 WebSocket 주소. 웹 내보내기에서는 페이지를 연 서버 주소를 기본으로 쓴다.
const DEFAULT_SERVER_URL := "ws://40.76.104.201/ws"

var path := "user://settings.cfg"
var ai_speed := "normal"
var player_name := "나"
var server_url := DEFAULT_SERVER_URL
## 온라인 방 재접속 정보(새로고침·재실행 후 같은 자리로 돌아간다). 없으면 빈 Dictionary.
var online_session: Dictionary = {}
## BGM 켜기/끄기와 볼륨(0~1). 웹판 기본값과 같다.
var music_enabled := true
var music_volume := 0.3


func _ready() -> void:
	var args := OS.get_cmdline_user_args()
	for i in args.size():
		if args[i] == "--settings" and i + 1 < args.size():
			path = args[i + 1]
	ai_speed = GameData.default_ai_speed()
	if OS.has_feature("web"):
		var loc = JavaScriptBridge.eval("location.protocol + '//' + location.host", true)
		if loc is String and loc.begins_with("http"):
			server_url = ("wss" if loc.begins_with("https") else "ws") + loc.substr(loc.find(":")) + "/ws"
	var cfg := ConfigFile.new()
	if cfg.load(path) == OK:
		var s = cfg.get_value("game", "ai_speed", ai_speed)
		if _speed_def(s) != null:
			ai_speed = s
		player_name = str(cfg.get_value("game", "player_name", player_name))
		server_url = str(cfg.get_value("online", "server_url", server_url))
		music_enabled = cfg.get_value("music", "enabled", music_enabled) == true
		music_volume = clampf(float(cfg.get_value("music", "volume", music_volume)), 0.0, 1.0)
		var sess = cfg.get_value("online", "session", {})
		if sess is Dictionary and sess.has("room") and sess.has("token") and sess.has("url"):
			online_session = sess


func _save() -> void:
	var cfg := ConfigFile.new()
	cfg.set_value("game", "ai_speed", ai_speed)
	cfg.set_value("game", "player_name", player_name)
	cfg.set_value("online", "server_url", server_url)
	cfg.set_value("online", "session", online_session)
	cfg.set_value("music", "enabled", music_enabled)
	cfg.set_value("music", "volume", music_volume)
	cfg.save(path)


func save_online_session(url: String, room: String, token: String) -> void:
	online_session = {"url": url, "room": room, "token": token}
	_save()


func clear_online_session() -> void:
	if online_session.is_empty():
		return
	online_session = {}
	_save()


func _speed_def(id) -> Variant:
	for s in GameData.ai_speeds():
		if s["id"] == id:
			return s
	return null


func set_ai_speed(id: String) -> void:
	if _speed_def(id) == null or id == ai_speed:
		return
	ai_speed = id
	_save()
	ai_speed_changed.emit(id)


## 현재 속도의 행동 간 대기 시간(초)
func ai_delay() -> float:
	var s = _speed_def(ai_speed)
	return float(s["delay"]) / 1000.0 if s != null else 0.85


## 상단 막대용 AI 속도 선택 상자
func make_speed_picker() -> OptionButton:
	var ob := OptionButton.new()
	ob.focus_mode = Control.FOCUS_NONE
	ob.theme_type_variation = "TopBarOption"
	ob.tooltip_text = "AI 진행 속도"
	var speeds := GameData.ai_speeds()
	for i in speeds.size():
		ob.add_item("AI 속도: %s" % speeds[i]["label"], i)
		if speeds[i]["id"] == ai_speed:
			ob.select(i)
	ob.item_selected.connect(func(i): set_ai_speed(speeds[i]["id"]))
	return ob
