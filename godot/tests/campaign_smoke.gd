extends SceneTree
## 모험 모드를 실제 화면으로 자동 진행한다: 로비 → 작전 시작 → (선택 → 입고 → 보스전 → 결과 → 증강 선택 → 다음 스테이지) 반복
## → 실패/완료 화면 → 처음부터 다시 → 로비. 사람 자리는 모의 실행 AI 가 화면 조작과 같은 세션 함수로 대신 누른다.
##   xvfb-run godot --path godot -s res://tests/campaign_smoke.gd -- --shots /tmp/cshots [--seed 7]

var main
var shots_dir := ""
var shot_n := 0
var seed := 7
## 일부러 지는 모드: 사람 자리가 아무것도 하지 않고 단계만 넘긴다(실패 화면 점검)
var lose := false


func _initialize() -> void:
	var args := OS.get_cmdline_user_args()
	for i in args.size():
		if args[i] == "--shots" and i + 1 < args.size():
			shots_dir = args[i + 1]
		if args[i] == "--lose":
			lose = true
		if args[i] == "--seed" and i + 1 < args.size():
			seed = int(args[i + 1])
	if shots_dir != "":
		DirAccess.make_dir_recursive_absolute(shots_dir)
	var settings = root.get_node_or_null("Settings")
	if settings != null:
		settings.set_ai_speed("veryFast")
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


func _fail(msg: String) -> void:
	printerr("모험 점검 실패: ", msg)
	quit(1)


func _buttons(node: Node, out: Array) -> void:
	if node is Button and node.is_visible_in_tree():
		out.append(node)
	for c in node.get_children():
		_buttons(c, out)


func _text_of(node: Node) -> String:
	var s := ""
	if node is Button:
		s += (node as Button).text
	if node is Label:
		s += (node as Label).text
	for c in node.get_children():
		s += " " + _text_of(c)
	return s


## 글자가 들어 있는 버튼 중 마지막(가장 위에 그려진) 것
func _find(text_part: String) -> Button:
	var all := []
	_buttons(main, all)
	var found: Button = null
	for b in all:
		if _text_of(b).contains(text_part):
			found = b
	return found


func _press(text_part: String) -> bool:
	var b := _find(text_part)
	if b == null or b.disabled:
		return false
	b.pressed.emit()
	return true


func _run() -> void:
	var session: GameSession = main.session
	session.rng.seed = seed
	if not _press("작전 시작"):
		_fail("로비에 작전 시작 버튼이 없습니다")
		return
	await _shot("guide")
	if not _press("작전 시작"):  # 가이드 창의 버튼
		_fail("가이드 창의 시작 버튼이 없습니다")
		return
	await _wait()
	if not session.is_campaign():
		_fail("모험이 시작되지 않았습니다")
		return

	var chars := ["kangjin", "hayun", "doyun", "astra", "echo"]
	var stages_played := 0
	var augments_picked := 0
	while true:
		var cv := session.campaign_view()
		var stage_i := int(cv["stageIndex"])
		if stage_i == 0 or stages_played < 2:
			await _shot("stage%d_select" % (stage_i + 1))
		session.act({"type": "selectCharacter", "characterId": chars[stage_i % chars.size()]})
		await _wait()
		_press("이 구성 적용")
		await _wait()
		if stages_played == 0:
			await _shot("stage%d_draft" % (stage_i + 1))
		if not _press("확정하기 (4/4)"):
			_fail("입고 확정 버튼을 누를 수 없습니다")
			return
		await _wait()
		if session.stage() != "playing":
			_fail("보스전이 시작되지 않았습니다")
			return
		var shot_mid := false
		var t0 := Time.get_ticks_msec()
		while session.campaign_status() == "battle":
			if Time.get_ticks_msec() - t0 > 600000:
				_fail("10분 안에 보스전이 끝나지 않았습니다")
				return
			if not session.human_can_act():
				await _wait(1)
				continue
			var g := session.game()
			if not shot_mid and int(g["turn"]) >= 7:
				shot_mid = true
				await _shot("stage%d_battle" % (stage_i + 1))
				continue
			var action = AiSmart.choose_action(g, 0)
			if lose:
				action = AiBasic.choose_action(g, 0) if g.get("pending") != null else {"type": "endPhase"}
			if action == null:
				await _wait(1)
				continue
			var err := session.act_game(action)
			if err != "":
				_fail("사람 자리 조작 실패: %s %s" % [err, JSON.stringify(action)])
				return
			await _wait(1)
		stages_played += 1
		var status := session.campaign_status()
		await _shot("stage%d_%s" % [stage_i + 1, status])
		if status == "stageWon":
			# 보상 카드 중 첫 번째를 화면에서 고른다.
			if not _press("선택하기"):
				_fail("증강 선택 버튼이 없습니다")
				return
			augments_picked += 1
			await _wait()
			if not session.campaign_view()["augmentChoices"].is_empty():
				_fail("증강 선택이 반영되지 않았습니다")
				return
			if augments_picked == 1:
				await _shot("stage%d_reward_picked" % (stage_i + 1))
			if not _press("다음 스테이지"):
				_fail("다음 스테이지 버튼을 누를 수 없습니다")
				return
			await _wait()
			continue
		break

	var final := session.campaign_view()
	print("모험 점검: 상태 %s · 스테이지 %d까지 · 증강 %d개 · 기록 %d줄" % [final["status"], int(final["stageIndex"]) + 1, final["augments"].size(), final["history"].size()])
	if not _press("처음부터 다시"):
		_fail("처음부터 다시 버튼이 없습니다")
		return
	await _wait()
	var again := session.campaign_view()
	if int(again["stageIndex"]) != 0 or not again["augments"].is_empty() or session.stage() != "select":
		_fail("처음부터 다시가 초기화되지 않았습니다")
		return
	await _shot("restart")
	main.go_lobby()
	await _wait()
	if session.is_campaign():
		_fail("로비로 돌아간 뒤에도 모험 상태가 남아 있습니다")
		return
	print("모험 점검 통과: 스테이지 %d판 진행, 증강 선택 %d회, 처음부터 다시·로비 복귀 확인" % [stages_played, augments_picked])
	quit(0)
