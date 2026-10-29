extends Node
## 저장되는 설정(AI 진행 속도·플레이어 이름). user://settings.cfg 에 보관한다.

signal ai_speed_changed(speed_id: String)

const PATH := "user://settings.cfg"

var ai_speed := "normal"
var player_name := "나"


func _ready() -> void:
	ai_speed = GameData.default_ai_speed()
	var cfg := ConfigFile.new()
	if cfg.load(PATH) == OK:
		var s = cfg.get_value("game", "ai_speed", ai_speed)
		if _speed_def(s) != null:
			ai_speed = s
		player_name = str(cfg.get_value("game", "player_name", player_name))


func _save() -> void:
	var cfg := ConfigFile.new()
	cfg.set_value("game", "ai_speed", ai_speed)
	cfg.set_value("game", "player_name", player_name)
	cfg.save(PATH)


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
	ob.tooltip_text = "AI 진행 속도"
	var speeds := GameData.ai_speeds()
	for i in speeds.size():
		ob.add_item("AI 속도: %s" % speeds[i]["label"], i)
		if speeds[i]["id"] == ai_speed:
			ob.select(i)
	ob.item_selected.connect(func(i): set_ai_speed(speeds[i]["id"]))
	return ob
