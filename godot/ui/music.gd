extends Node
## 배경 음악: 오리지널 피아노 곡 「별의 돌격」(138 BPM, 약 56초, 반복). 웹판 client/music.js 와 같은 동작.
## - 첫 클릭·키 입력 뒤에 재생을 시작한다(웹 내보내기의 자동 재생 제한과 같은 흐름).
## - 켜기/끄기와 볼륨은 설정 파일에 저장한다.
## - 창이 비활성화되면(다른 창·탭) 멈추고, 돌아오면 이어서 재생한다.

signal state_changed

const TRACK := preload("res://audio/star-charge.mp3")

var player: AudioStreamPlayer
## 사용자가 한 번이라도 입력했는가(그 전에는 재생하지 않는다)
var unlocked := false
var _focused := true


func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	var stream: AudioStreamMP3 = TRACK.duplicate()
	stream.loop = true
	player = AudioStreamPlayer.new()
	player.stream = stream
	player.bus = "Master"
	add_child(player)
	_apply_volume()


func _settings() -> Node:
	return get_node("/root/Settings")


func _input(event: InputEvent) -> void:
	if unlocked:
		return
	var gesture: bool = (event is InputEventMouseButton and event.pressed) \
		or (event is InputEventScreenTouch and event.pressed) \
		or (event is InputEventKey and event.pressed)
	if gesture:
		unlock()


## 첫 사용자 입력: 켜 둔 상태면 재생을 시작한다.
func unlock() -> void:
	unlocked = true
	_update_playback()


func is_playing() -> bool:
	return player.playing and not player.stream_paused


func enabled() -> bool:
	return _settings().music_enabled


func set_enabled(on: bool) -> void:
	unlocked = true
	_settings().music_enabled = on
	_settings()._save()
	_update_playback()


func set_volume(v: float) -> void:
	_settings().music_volume = clampf(v, 0.0, 1.0)
	_settings()._save()
	_apply_volume()


func _apply_volume() -> void:
	var v: float = _settings().music_volume
	player.volume_db = linear_to_db(v) if v > 0.001 else -80.0


func _update_playback() -> void:
	var want: bool = unlocked and enabled() and _focused
	if want:
		if not player.playing:
			player.play()
		player.stream_paused = false
	elif player.playing:
		player.stream_paused = true
	state_changed.emit()


func _notification(what: int) -> void:
	if what == NOTIFICATION_APPLICATION_FOCUS_OUT:
		_focused = false
		_update_playback()
	elif what == NOTIFICATION_APPLICATION_FOCUS_IN:
		_focused = true
		_update_playback()


## 상단 막대용 조작: ♪ 켜기/끄기 버튼 + 볼륨 막대
func make_controls() -> HBoxContainer:
	var box := HBoxContainer.new()
	box.add_theme_constant_override("separation", 6)
	var toggle := Button.new()
	toggle.focus_mode = Control.FOCUS_NONE
	toggle.tooltip_text = "별의 돌격 · 피아노 BGM"
	toggle.custom_minimum_size.x = 112
	var slider := HSlider.new()
	slider.min_value = 0
	slider.max_value = 100
	slider.step = 1
	slider.value = round(_settings().music_volume * 100.0)
	slider.custom_minimum_size = Vector2(90, 24)
	slider.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	slider.focus_mode = Control.FOCUS_NONE
	slider.tooltip_text = "BGM 볼륨"
	var refresh := func():
		if not is_instance_valid(toggle):
			return
		toggle.text = "♪ BGM 끄기" if enabled() and (is_playing() or not unlocked) else "♪ BGM 켜기"
		if enabled() and not unlocked:
			toggle.tooltip_text = "화면을 한 번 누르면 재생을 시작합니다"
	toggle.pressed.connect(func(): set_enabled(not (enabled() and is_playing())))
	slider.value_changed.connect(func(v): set_volume(v / 100.0))
	state_changed.connect(refresh)
	toggle.tree_exiting.connect(func(): state_changed.disconnect(refresh), CONNECT_ONE_SHOT)
	refresh.call()
	box.add_child(toggle)
	box.add_child(slider)
	return box
