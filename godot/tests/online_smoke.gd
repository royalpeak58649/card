extends SceneTree
## 온라인 대전을 실제 화면으로 자동 진행한다(웹판 Node 서버 필요).
##   방장:  godot --path godot -s res://tests/online_smoke.gd -- --settings user://a.cfg --url ws://127.0.0.1:18080/ws --create /tmp/room.txt --shots /tmp/oshots
##   참가:  godot --path godot -s res://tests/online_smoke.gd -- --settings user://b.cfg --url ws://127.0.0.1:18080/ws --join /tmp/room.txt --drop 6 --result /tmp/b.txt
## 각 자리는 화면과 같은 세션 함수로 규칙 기반 AI 의 조작을 보낸다. --drop N 이면 N턴에 연결을 끊고 자동 재접속을 확인한다.

var main
var url := ""
var create_file := ""
var join_file := ""
var shots_dir := ""
var result_file := ""
var drop_turn := -1
var character := ""
var shot_n := 0


func _initialize() -> void:
	var args := OS.get_cmdline_user_args()
	for i in args.size():
		var next: String = args[i + 1] if i + 1 < args.size() else ""
		match args[i]:
			"--url":
				url = next
			"--create":
				create_file = next
			"--join":
				join_file = next
			"--shots":
				shots_dir = next
			"--result":
				result_file = next
			"--drop":
				drop_turn = int(next)
			"--char":
				character = next
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


func _fail(msg: String) -> void:
	printerr("[%s] 온라인 점검 실패: %s" % ["방장" if create_file != "" else "참가", msg])
	quit(1)


## 조건이 참이 될 때까지 기다린다(초 단위 제한)
func _until(cond: Callable, seconds: float) -> bool:
	var t0 := Time.get_ticks_msec()
	while not cond.call():
		if Time.get_ticks_msec() - t0 > seconds * 1000.0:
			return false
		await process_frame
	return true


func _run() -> void:
	var online: OnlineSession = main.online
	var who := "방장" if create_file != "" else "참가"
	await _shot("lobby")
	main.session = online
	if create_file != "":
		online.create_room(url, "방장")
		main._show_waiting()
		if not await _until(func(): return online.room != "", 15):
			_fail("방이 만들어지지 않았습니다")
			return
		# 참가자가 들어오기 전에 대기실 화면을 남긴다.
		await _shot("waiting_room")
		var f := FileAccess.open(create_file, FileAccess.WRITE)
		f.store_string(online.room)
		f.close()
		print("[방장] 방 코드 ", online.room)
	else:
		if not await _until(func(): return FileAccess.file_exists(join_file) and FileAccess.get_file_as_string(join_file).strip_edges() != "", 60):
			_fail("방 코드 파일이 없습니다")
			return
		var code := FileAccess.get_file_as_string(join_file).strip_edges()
		online.join_room(url, code, "참가자")
		main._show_waiting()

	if not await _until(func(): return online.stage() == "select", 60):
		_fail("캐릭터 선택 단계가 오지 않았습니다(%s)" % online.stage())
		return
	var chars := GameData.all_character_ids()
	var cid: String = character if character != "" else chars[(hash(who) % chars.size() + chars.size()) % chars.size()]
	var seq := online.state_seq
	online.act({"type": "selectCharacter", "characterId": cid})
	await _until(func(): return online.state_seq > seq, 10)
	await _shot("select_waiting")
	if not await _until(func(): return online.stage() == "draft", 60):
		_fail("입고 단계가 오지 않았습니다")
		return
	seq = online.state_seq
	online.act({"type": "draft", "cardIds": GameData.recommendations(cid)[0]["cardIds"]})
	await _until(func(): return online.state_seq > seq, 10)
	await _shot("draft_waiting")
	if not await _until(func(): return online.stage() == "playing", 60):
		_fail("대전이 시작되지 않았습니다")
		return
	await _shot("battle_start")

	var dropped := false
	var reconnected := false
	var acts := 0
	var shot_opp := false
	var t0 := Time.get_ticks_msec()
	while online.stage() == "playing":
		if Time.get_ticks_msec() - t0 > 900000:
			_fail("15분 안에 경기가 끝나지 않았습니다")
			return
		var g := online.game()
		if drop_turn > 0 and not dropped and int(g.get("turn", 0)) >= drop_turn:
			dropped = true
			print("[%s] %d턴에 연결을 일부러 끊습니다" % [who, int(g["turn"])])
			online.debug_drop_connection()
			await _wait(5)
			if not await _until(func(): return online.is_connected_to_server(), 20):
				_fail("자동 재접속이 되지 않았습니다")
				return
			var s0 := online.state_seq
			if not await _until(func(): return online.state_seq > s0, 10):
				_fail("재접속 뒤 상태를 받지 못했습니다")
				return
			reconnected = true
			print("[%s] 재접속 완료" % who)
			continue
		if not shot_opp and not online.human_can_act() and int(g.get("turn", 0)) >= 4 and shots_dir != "":
			shot_opp = true
			await _shot("opponent_turn")
		if not online.human_can_act():
			await _wait(1)
			continue
		var action = AiBasic.choose_action(g, online.you)
		if action == null:
			await _wait(1)
			continue
		seq = online.state_seq
		online.act_game(action)
		acts += 1
		if not await _until(func(): return online.state_seq > seq or not online.is_connected_to_server(), 15):
			_fail("조작 응답이 없습니다: %s" % JSON.stringify(action))
			return
	if online.stage() != "finished":
		_fail("경기가 끝나지 않았습니다: %s" % online.stage())
		return
	var v := online.view()
	var res := "draw" if v.get("draw") == true else str(v.get("winner"))
	await _shot("finished")
	print("[%s] 경기 종료 · 나는 %d번 · 결과 %s · %d턴 · 내 조작 %d · 재접속 %s" % [who, online.you, res, int(v["game"]["turn"]), acts, "확인" if reconnected else "안 함"])
	if result_file != "":
		var f := FileAccess.open(result_file, FileAccess.WRITE)
		f.store_string("%s %d" % [res, int(v["game"]["turn"])])
		f.close()
	if drop_turn > 0 and not reconnected:
		_fail("재접속을 시험하지 못했습니다")
		return
	# 방장이 로비로 나가면 방이 종료된다(참가자는 left 를 받는다).
	if create_file != "":
		await _wait(30)
		main.confirm_leave()
		await _wait(5)
		if online.active():
			_fail("로비로 나간 뒤에도 연결이 남아 있습니다")
			return
		await _shot("lobby_after")
	else:
		if not await _until(func(): return main.session != online, 30):
			_fail("방장이 나간 뒤 로비로 이동하지 않았습니다")
			return
		print("[참가] 방장이 나가 로비로 이동함")
	print("[%s] 온라인 점검 통과" % who)
	quit(0)
