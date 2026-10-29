extends SceneTree
## AI 끼리 대전시켜 엔진·AI 가 끝까지 도는지와 판단 시간을 잰다.
##   godot --headless --path godot -s res://tests/sim.gd -- --games 10 [--basic]

func _initialize() -> void:
	var games := 10
	var smart := true
	var args := OS.get_cmdline_user_args()
	for i in args.size():
		if args[i] == "--games" and i + 1 < args.size():
			games = int(args[i + 1])
		if args[i] == "--basic":
			smart = false
	var rng := RandomNumberGenerator.new()
	rng.seed = 2026
	var wins := [0, 0]
	var draws := 0
	var decisions := 0
	var think_ms := 0
	var max_ms := 0
	var failures := 0
	var t0 := Time.get_ticks_msec()
	var chars := GameData.all_character_ids()
	for gi in games:
		var m := MatchRules.create_match(rng.randi_range(0, 0x7fffffff), [{"id": "a", "name": "A"}, {"id": "b", "name": "B"}])
		for p in 2:
			MatchRules.apply_match_action(m, p, {"type": "selectCharacter", "characterId": chars[rng.randi_range(0, chars.size() - 1)]})
		for p in 2:
			var cands := MatchRules.get_candidates(m["picks"][p]["characterId"]).duplicate()
			cands.shuffle()
			MatchRules.apply_match_action(m, p, {"type": "draft", "cardIds": cands.slice(0, 4)})
		var steps := 0
		while m["stage"] == "playing" and steps < 4000:
			var g: Dictionary = m["game"]
			var pending = g.get("pending")
			var p: int = int(pending["playerIndex"]) if pending != null else int(g["activeIndex"])
			var s := Time.get_ticks_usec()
			var action = AiSmart.choose_action(g, p) if smart else AiBasic.choose_action(g, p)
			var dt := (Time.get_ticks_usec() - s) / 1000
			think_ms += dt
			max_ms = maxi(max_ms, dt)
			decisions += 1
			if action == null:
				printerr("경기 %d: AI 가 조작을 고르지 못함" % gi)
				failures += 1
				break
			var err := MatchRules.apply_match_action(m, p, {"type": "game", "action": action})
			if err != "":
				printerr("경기 %d: AI 조작 실패 %s · %s" % [gi, err, JSON.stringify(action)])
				failures += 1
				break
			steps += 1
		if m["stage"] != "finished":
			printerr("경기 %d: 끝나지 않음(%d 조작)" % [gi, steps])
			failures += 1
		elif m.get("draw") == true:
			draws += 1
		else:
			wins[int(m["winner"])] += 1
	var total := Time.get_ticks_msec() - t0
	print("AI 대전 %d판(%s): 0번 %d승 · 1번 %d승 · 무승부 %d · 실패 %d" % [games, "모의 실행" if smart else "규칙 기반", wins[0], wins[1], draws, failures])
	print("판단 %d회 · 평균 %.1fms · 최대 %dms · 전체 %.1f초" % [decisions, float(think_ms) / maxi(1, decisions), max_ms, total / 1000.0])
	quit(1 if failures > 0 else 0)
