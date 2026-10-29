extends SceneTree
## JS 엔진이 남긴 기록(tests/trace.json)을 같은 순서로 다시 적용해
## 조작마다 오류 문구·상태 해시·가려진 화면 해시·AI 선택이 JS 와 같은지 확인한다.
##   godot --headless --path godot -s res://tests/cross_check.gd [-- --trace res://tests/trace.json --no-ai]

var check_ai := true
var failures := 0
var max_failures := 15


static func canonical(v) -> String:
	match typeof(v):
		TYPE_NIL:
			return "null"
		TYPE_BOOL:
			return "true" if v else "false"
		TYPE_INT:
			return str(v)
		TYPE_FLOAT:
			return "FLOAT(%s)" % str(v)
		TYPE_STRING, TYPE_STRING_NAME:
			return "\"" + String(v).replace("\\", "\\\\").replace("\"", "\\\"") + "\""
		TYPE_ARRAY:
			var parts := PackedStringArray()
			for x in v:
				parts.append(canonical(x))
			return "[" + ",".join(parts) + "]"
		TYPE_DICTIONARY:
			var keys: Array = v.keys()
			keys.sort()
			var parts := PackedStringArray()
			for k in keys:
				parts.append(canonical(String(k)) + ":" + canonical(v[k]))
			return "{" + ",".join(parts) + "}"
	return "?" + str(v)


static func h(v) -> String:
	return canonical(v).md5_text()


func _report(gi: int, si: int, what: String, detail: String) -> void:
	failures += 1
	if failures <= max_failures:
		printerr("[불일치] 경기 %d 단계 %d: %s\n  %s" % [gi, si, what, detail])


func _initialize() -> void:
	var path := "res://tests/trace.json"
	var args := OS.get_cmdline_user_args()
	for i in args.size():
		if args[i] == "--trace" and i + 1 < args.size():
			path = args[i + 1]
		if args[i] == "--no-ai":
			check_ai = false
	var text := FileAccess.get_file_as_string(path)
	var trace = GameData.intify(JSON.parse_string(text))
	if trace == null:
		printerr("기록을 읽지 못했습니다: ", path)
		quit(2)
		return
	var t0 := Time.get_ticks_msec()
	var steps_total := 0
	var ai_checked := 0
	for gi in trace["games"].size():
		var g: Dictionary = trace["games"][gi]
		if g["kind"] == "match":
			var r := _replay_match(gi, g)
			steps_total += r[0]
			ai_checked += r[1]
		else:
			var r := _replay_campaign(gi, g)
			steps_total += r[0]
			ai_checked += r[1]
		if failures > max_failures:
			break
	var ms := Time.get_ticks_msec() - t0
	print("교차 검증: 경기 %d · 조작 %d · AI 선택 비교 %d · %.1f초" % [trace["games"].size(), steps_total, ai_checked, ms / 1000.0])
	if failures > 0:
		printerr("실패: 불일치 %d건" % failures)
		quit(1)
	else:
		print("통과: JS 엔진과 모든 단계가 같습니다")
		quit(0)


func _check_ai(gi: int, si: int, game: Dictionary, step: Dictionary) -> bool:
	if not check_ai or step.get("ai") == null:
		return false
	var p: int = step["actor"]
	var mine = AiSmart.choose_action(game, p) if step["ai"] == "smart" else AiBasic.choose_action(game, p)
	var expected = step["action"]["action"]
	if canonical(mine) != canonical(expected):
		_report(gi, si, "AI(%s) 선택이 다름" % step["ai"], "JS %s / Godot %s" % [canonical(expected), canonical(mine)])
	return true


func _replay_match(gi: int, g: Dictionary) -> Array:
	var m := MatchRules.create_match(g["seed"], [{"id": "a", "name": "A"}, {"id": "b", "name": "B"}])
	var ai_n := 0
	for si in g["steps"].size():
		var step: Dictionary = g["steps"][si]
		if m["stage"] == "playing" and _check_ai(gi, si, m["game"], step):
			ai_n += 1
		var err := MatchRules.apply_match_action(m, step["actor"], step["action"])
		if err != step["error"]:
			_report(gi, si, "오류 문구가 다름", "JS '%s' / Godot '%s' · 조작 %s" % [step["error"], err, canonical(step["action"])])
		if h(m) != step["hash"]:
			_report(gi, si, "상태가 다름", "조작 %s" % canonical(step["action"]))
			return [si + 1, ai_n]
		if h(MatchRules.view_for(m, 0)) != step["view0"]:
			_report(gi, si, "화면 정보(view)가 다름", canonical(MatchRules.view_for(m, 0)).left(400))
	if m.get("winner") != g.get("winner"):
		_report(gi, g["steps"].size(), "승자가 다름", "%s / %s" % [str(g.get("winner")), str(m.get("winner"))])
	return [g["steps"].size(), ai_n]


func _replay_campaign(gi: int, g: Dictionary) -> Array:
	var c := CampaignRules.create_campaign(g["seed"], "silverbeast", "나")
	var ai_n := 0
	for si in g["steps"].size():
		var step: Dictionary = g["steps"][si]
		var m: Dictionary = c["match"]
		if m["stage"] == "playing" and _check_ai(gi, si, m["game"], step):
			ai_n += 1
		var err := ""
		if int(step["actor"]) == 0:
			err = CampaignRules.apply_campaign_action(c, step["action"])
		else:
			err = Rules.apply_action(m["game"], 1, step["action"]["action"])
			CampaignRules.settle(c)
		if err != step["error"]:
			_report(gi, si, "오류 문구가 다름", "JS '%s' / Godot '%s' · 조작 %s" % [step["error"], err, canonical(step["action"])])
		if h(c) != step["hash"]:
			_report(gi, si, "모험 상태가 다름", "조작 %s" % canonical(step["action"]))
			return [si + 1, ai_n]
		if step.has("cview") and h(CampaignRules.campaign_view(c)) != step["cview"]:
			_report(gi, si, "모험 화면 정보(campaignView)가 다름", canonical(CampaignRules.campaign_view(c)).left(400))
	return [g["steps"].size(), ai_n]
