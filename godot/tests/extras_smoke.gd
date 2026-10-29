extends SceneTree
## 도감·BGM 점검: 도감 탭별 항목 수·검색·필터, BGM 재생 시작(첫 입력 뒤)·끄기·볼륨 저장·창 비활성화 시 일시 정지.
##   xvfb-run godot --path godot -s res://tests/extras_smoke.gd -- --shots /tmp/xshots

var main
var shots_dir := ""
var shot_n := 0
var failures := 0


func _initialize() -> void:
	var args := OS.get_cmdline_user_args()
	for i in args.size():
		if args[i] == "--shots" and i + 1 < args.size():
			shots_dir = args[i + 1]
	if shots_dir != "":
		DirAccess.make_dir_recursive_absolute(shots_dir)
	main = load("res://scenes/main.tscn").instantiate()
	root.add_child(main)
	_run.call_deferred()


func _wait(n := 3) -> void:
	for i in n:
		await process_frame


func _shot(name: String) -> void:
	await _wait(4)
	if shots_dir == "" or DisplayServer.get_name() == "headless":
		return
	await RenderingServer.frame_post_draw
	shot_n += 1
	var path := "%s/%02d_%s.png" % [shots_dir, shot_n, name]
	root.get_texture().get_image().save_png(path)
	print("스크린샷: ", path)


func _check(cond: bool, what: String) -> void:
	if cond:
		print("  ✓ ", what)
	else:
		failures += 1
		printerr("  ✗ ", what)


func _count(st) -> int:
	return Codex.entries(st).size()


func _run() -> void:
	print("도감")
	var st := Codex.State.new()
	var n_cards := _count(st)
	_check(n_cards == GameData.all_card_ids().size(), "카드 탭: 등록 카드 전부 %d장" % n_cards)
	st.category = "characters"
	_check(_count(st) == 12, "캐릭터 탭: 플레이 캐릭터 12명 (%d)" % _count(st))
	st.category = "enemies"
	_check(_count(st) == 5, "보스 탭: 은빛 야수 5종 (%d)" % _count(st))
	st.category = "augments"
	_check(_count(st) == 19, "증강 탭: 19종 (%d)" % _count(st))
	st.query = "3성"
	_check(_count(st) == 6, "증강 '3성' 검색 6종 (%d)" % _count(st))
	st = Codex.State.new()
	st.faction = "basic"
	_check(_count(st) == 6, "카드 진영 필터 '기본 공급' 6장 (%d)" % _count(st))
	st.faction = "section8"
	st.type = "weapon"
	var s8w := _count(st)
	_check(s8w >= 1, "Section 8 무기 필터 %d장" % s8w)
	for e in Codex.entries(st):
		var c := GameData.card(e["id"])
		_check(c["type"] == "weapon", "  %s 는 무기" % c["name"])
	st = Codex.State.new()
	st.query = "출혈"
	var bleed := _count(st)
	_check(bleed > 0, "'출혈' 검색 %d장" % bleed)
	st.query = "없는단어zzz"
	_check(_count(st) == 0, "없는 검색어는 0개")
	st = Codex.State.new()
	st.query = "하윤 전용"
	_check(_count(st) == 3, "소속 이름 검색 '하윤 전용' 3장 (%d)" % _count(st))

	# 실제 창: 열고 탭 바꾸기
	var win: Control = Codex.open(main)
	await _shot("codex_cards")
	var render: Callable = win.get_meta("codex_render")
	var wst = win.get_meta("codex_state")
	var count_label: Label = win.get_meta("codex_count")
	_check(count_label.text == "%d개 항목" % n_cards, "창의 항목 수 표시: %s" % count_label.text)
	wst.category = "characters"
	render.call()
	await _shot("codex_characters")
	wst.category = "enemies"
	render.call()
	await _shot("codex_enemies")
	wst.category = "augments"
	render.call()
	await _shot("codex_augments")
	wst.category = "cards"
	wst.faction = "vincent"
	wst.query = "빚"
	render.call()
	await _shot("codex_filtered")
	_check(count_label.text != "0개 항목", "빈센트 + '빚' 검색: %s" % count_label.text)
	win.queue_free()
	await _wait()

	print("BGM")
	var music = root.get_node("Music")
	var settings = root.get_node("Settings")
	settings.music_enabled = true
	_check(not music.is_playing(), "첫 입력 전에는 재생하지 않음")
	var click := InputEventMouseButton.new()
	click.button_index = MOUSE_BUTTON_LEFT
	click.pressed = true
	click.position = Vector2(5, 790)
	Input.parse_input_event(click)
	await _wait(5)
	_check(music.unlocked and music.is_playing(), "첫 클릭 뒤 재생 시작")
	_check(music.player.stream.loop, "반복 재생 설정")
	var len: float = music.player.stream.get_length()
	_check(len > 50.0 and len < 62.0, "곡 길이 약 56초 (%.1f초)" % len)
	await _shot("lobby_music_on")
	music.set_enabled(false)
	await _wait()
	_check(not music.is_playing(), "끄기 → 멈춤")
	_check(settings.music_enabled == false, "끈 상태 저장")
	music.set_enabled(true)
	await _wait()
	_check(music.is_playing(), "다시 켜기 → 재생")
	music.set_volume(0.55)
	var cfg := ConfigFile.new()
	cfg.load(settings.path)
	_check(is_equal_approx(float(cfg.get_value("music", "volume", -1)), 0.55), "볼륨 0.55 저장 (%s)" % str(cfg.get_value("music", "volume")))
	music._notification(Node.NOTIFICATION_APPLICATION_FOCUS_OUT)
	_check(not music.is_playing(), "창 비활성화 → 일시 정지")
	music._notification(Node.NOTIFICATION_APPLICATION_FOCUS_IN)
	_check(music.is_playing(), "창 활성화 → 다시 재생")
	music.set_volume(0.3)

	print("도감·BGM 점검 %s (실패 %d)" % ["통과" if failures == 0 else "실패", failures])
	quit(1 if failures > 0 else 0)
