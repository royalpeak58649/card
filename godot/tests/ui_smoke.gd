extends SceneTree
## 실제 화면(main.tscn)을 띄워 로비 → 캐릭터 선택 → 입고 → 대전 → 결과까지 자동으로 진행한다.
## 사람 자리는 규칙 기반 AI 가 화면 조작과 같은 세션 함수로 대신 누른다.
## 화면이 있는 환경(xvfb 등)에서 --shots <폴더> 를 주면 단계별 스크린샷을 저장한다.
##   godot --path godot -s res://tests/ui_smoke.gd -- --shots /tmp/shots [--char hayun]

var main
var shots_dir := ""
var character := ""
var shot_n := 0
var frames := 0


func _initialize() -> void:
	var args := OS.get_cmdline_user_args()
	for i in args.size():
		if args[i] == "--shots" and i + 1 < args.size():
			shots_dir = args[i + 1]
		if args[i] == "--char" and i + 1 < args.size():
			character = args[i + 1]
	if shots_dir != "":
		DirAccess.make_dir_recursive_absolute(shots_dir)
	var settings = root.get_node_or_null("Settings")
	if settings != null:
		settings.set_ai_speed("veryFast")
	else:
		printerr("Settings 자동 로드가 없습니다")
	var scene: PackedScene = load("res://scenes/main.tscn")
	main = scene.instantiate()
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
	var img := root.get_texture().get_image()
	shot_n += 1
	var path := "%s/%02d_%s.png" % [shots_dir, shot_n, name]
	img.save_png(path)
	print("스크린샷: ", path)


func _fail(msg: String) -> void:
	printerr("UI 점검 실패: ", msg)
	quit(1)


func _find_button(node: Node, text_part: String) -> Button:
	if node is Button and node.visible and (node as Button).text.contains(text_part):
		return node
	for c in node.get_children():
		var b := _find_button(c, text_part)
		if b != null:
			return b
	return null


func _run() -> void:
	await _shot("lobby")
	var session: GameSession = main.session
	var start := _find_button(main, "AI와 연습하기")
	if start == null:
		_fail("로비의 시작 버튼이 없습니다")
		return
	start.pressed.emit()
	await _shot("guide")
	var go := _find_button(main, "연습 시작")
	if go == null:
		_fail("가이드 창의 시작 버튼이 없습니다")
		return
	go.pressed.emit()
	await _shot("select")
	if session.stage() != "select":
		_fail("캐릭터 선택 단계가 아닙니다: " + session.stage())
		return

	var cid: String = character if character != "" else GameData.all_character_ids()[randi() % 12]
	session.act({"type": "selectCharacter", "characterId": cid})
	await _wait()
	if session.stage() != "draft":
		_fail("입고 단계가 아닙니다")
		return
	# 추천 구성 적용 버튼을 실제로 눌러 본다.
	var rec := _find_button(main, "이 구성 적용")
	if rec != null:
		rec.pressed.emit()
	await _shot("draft")
	var confirm := _find_button(main, "확정하기 (4/4)")
	if confirm == null:
		session.act({"type": "draft", "cardIds": MatchRules.get_candidates(cid).slice(0, 4)})
	else:
		confirm.pressed.emit()
	await _wait()
	if session.stage() != "playing":
		_fail("대전이 시작되지 않았습니다: " + session.stage())
		return
	await _shot("battle_start")

	var took_market := false
	var took_choice := false
	var took_upgrade := false
	var steps := 0
	var t0 := Time.get_ticks_msec()
	while session.stage() == "playing" and steps < 3000:
		if Time.get_ticks_msec() - t0 > 600000:
			_fail("10분 안에 경기가 끝나지 않았습니다")
			return
		if not session.human_can_act():
			await _wait(1)
			continue
		var g := session.game()
		var action = AiBasic.choose_action(g, 0)
		if action == null:
			await _wait(1)
			continue
		if action["type"] == "choose" and not took_choice:
			took_choice = true
			await _shot("choice")
		if action["type"] == "upgrade" and not took_upgrade:
			took_upgrade = true
			main._battle._upgrade_uid = action["uid"]
			main._battle.render()
			await _shot("upgrade_preview")
		if action["type"] == "buy" and not took_market and int(g["turn"]) >= 5:
			took_market = true
			await _shot("buy_phase")
		var err := session.act_game(action)
		if err != "":
			_fail("사람 자리 조작 실패: %s %s" % [err, JSON.stringify(action)])
			return
		steps += 1
		await _wait(1)
	if session.stage() != "finished":
		_fail("경기가 끝나지 않았습니다(%d 조작)" % steps)
		return
	await _shot("finished")
	var v := session.view()
	print("UI 점검 통과: 캐릭터 %s · %d턴 · 결과 %s · 사람 자리 조작 %d" % [cid, int(v["game"]["turn"]),
		"무승부" if v.get("draw") == true else ("승리" if v["winner"] == 0 else "패배"), steps])
	var back := _find_button(main, "로비로")
	if back != null:
		back.pressed.emit()
	await _shot("lobby_again")
	quit(0)
