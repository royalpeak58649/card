extends Control
## 앱 진입점. 로비 → 캐릭터 선택 → 입고 → 대전 화면을 바꿔 그린다.

const BattleScreen := preload("res://ui/battle_screen.gd")

## 지금 쓰는 세션: local(AI 연습·모험, GameSession) 또는 online(온라인 대전, OnlineSession)
var session
var local: GameSession
var online: OnlineSession
var screen_root: Control
var toast_layer: VBoxContainer
var _screen_key := ""
var _draft_selection: Array = []
var _draft_preview_upgraded := false
var _battle


func _ready() -> void:
	theme = UiKit.theme()
	set_anchors_preset(Control.PRESET_FULL_RECT)
	var bg := ColorRect.new()
	bg.color = UiKit.BG
	bg.set_anchors_preset(Control.PRESET_FULL_RECT)
	bg.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(bg)

	screen_root = Control.new()
	screen_root.set_anchors_preset(Control.PRESET_FULL_RECT)
	add_child(screen_root)

	toast_layer = UiKit.vbox(6)
	toast_layer.set_anchors_and_offsets_preset(Control.PRESET_CENTER_TOP, Control.PRESET_MODE_MINSIZE, 70)
	toast_layer.mouse_filter = Control.MOUSE_FILTER_IGNORE
	toast_layer.grow_horizontal = Control.GROW_DIRECTION_BOTH
	add_child(toast_layer)

	local = GameSession.new()
	add_child(local)
	online = OnlineSession.new()
	add_child(online)
	local.changed.connect(func(): _changed_from(local))
	online.changed.connect(func(): _changed_from(online))
	local.toast.connect(show_toast)
	online.toast.connect(show_toast)
	online.left.connect(_on_online_left)
	session = local
	_show_lobby()
	# 저장된 온라인 자리가 있으면(앱을 다시 켠 경우) 같은 자리로 다시 접속한다.
	var saved: Dictionary = UiKit.settings().online_session
	if not saved.is_empty():
		show_toast("저장된 방(%s)에 다시 접속합니다" % saved["room"])
		session = online
		online.resume(saved["url"], saved["room"], saved["token"])


## 지금 화면에 보이는 세션에서 온 변경만 그린다.
func _changed_from(source) -> void:
	if session == source:
		_refresh()


func _on_online_left(message: String) -> void:
	if session == online:
		session = local
		_show_lobby()
	if message != "":
		show_toast(message)


func show_toast(message: String) -> void:
	var p := UiKit.panel("", UiKit.box(UiKit.INK, Color.TRANSPARENT, 0, 10, 10))
	p.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var l := UiKit.label(message, "", 16, Color.WHITE)
	p.add_child(l)
	toast_layer.add_child(p)
	var tw := create_tween()
	tw.tween_interval(2.2)
	tw.tween_property(p, "modulate:a", 0.0, 0.4)
	tw.tween_callback(p.queue_free)


func _set_screen(node: Control, key: String) -> void:
	UiKit.clear(screen_root)
	_battle = null
	node.set_anchors_preset(Control.PRESET_FULL_RECT)
	screen_root.add_child(node)
	_screen_key = key


func _refresh() -> void:
	if session.waiting():
		_show_waiting()
		return
	if session.is_campaign() and session.campaign_status() != "battle":
		_show_campaign_result()
		return
	match session.stage():
		"":
			if session == online and online.active():
				_show_waiting()
			elif _screen_key != "lobby":
				_show_lobby()
		"select":
			_show_select()
		"draft":
			_show_draft()
		"playing", "finished":
			if _screen_key != "battle" or _battle == null:
				var battle = BattleScreen.new()
				battle.setup(self, session)
				_set_screen(battle, "battle")
				_battle = battle
			_battle.render()


func go_lobby() -> void:
	session.stop()
	session = local
	_show_lobby()


func confirm_leave() -> void:
	if session.is_campaign():
		if session.campaign_status() in ["lost", "cleared"]:
			go_lobby()
			return
		Dialogs.confirm(self, "로비로 돌아갈까요?", "모험을 종료하고 로비로 돌아갑니다. 지금까지의 진행 상황과 증강은 사라집니다.", "로비로", go_lobby)
		return
	if session.stage() == "" or session.stage() == "finished":
		go_lobby()
		return
	var msg := "진행 중인 경기를 종료하고 로비로 돌아갑니다."
	if session == online:
		msg = "방을 종료하고 로비로 돌아갑니다. 상대도 로비로 이동합니다."
	Dialogs.confirm(self, "로비로 돌아갈까요?", msg, "로비로", go_lobby)


func _save_name(edit: LineEdit) -> void:
	var n := edit.text.strip_edges()
	UiKit.settings().player_name = n if n != "" else "나"
	UiKit.settings()._save()


func _show_campaign_result() -> void:
	var cv: Dictionary = session.campaign_view()
	_set_screen(CampaignUi.result_screen(cv, func(a): session.act(a), confirm_leave, _top_right_buttons()), "campaign_result")


func _top_right_buttons() -> Array:
	if session == online:
		var conn := UiKit.label("● 연결됨" if online.is_connected_to_server() else "● 다시 연결하는 중…", "", 14,
			Color("#c9ffd9") if online.is_connected_to_server() else Color("#ffd2d2"))
		return [conn, UiKit.button("플레이 가이드", func(): Dialogs.guide(self)), UiKit.button("로비로", confirm_leave)]
	return [UiKit.settings().make_speed_picker(),
		UiKit.button("플레이 가이드", func(): Dialogs.guide(self)),
		UiKit.button("로비로", confirm_leave)]


# ─────────────────────────── 로비 ───────────────────────────

func _show_lobby() -> void:
	var root := UiKit.vbox(0)
	root.add_child(UiKit.top_bar("카드 대전", [UiKit.settings().make_speed_picker(), UiKit.button("플레이 가이드", func(): Dialogs.guide(self))]))
	var center := CenterContainer.new()
	center.size_flags_vertical = Control.SIZE_EXPAND_FILL
	root.add_child(center)
	var col := UiKit.vbox(16)
	center.add_child(col)

	var title := UiKit.label("카드 대전", "TitleLabel", 50, UiKit.PURPLE_DARK)
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	col.add_child(title)
	var sub := UiKit.label("카드를 모으고, 별로 강화하고, 결정적인 한 차례를 만드세요.", "MutedLabel", 17)
	sub.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	col.add_child(sub)

	var name_row := UiKit.hbox(10)
	name_row.alignment = BoxContainer.ALIGNMENT_CENTER
	name_row.add_child(UiKit.bold("내 이름", 15, UiKit.MUTED))
	var name_edit := LineEdit.new()
	name_edit.text = UiKit.settings().player_name
	name_edit.max_length = 12
	name_edit.placeholder_text = "이름"
	name_edit.custom_minimum_size.x = 260
	name_row.add_child(name_edit)
	col.add_child(name_row)

	var columns := UiKit.hbox(18)
	col.add_child(columns)
	var left := UiKit.vbox(16)
	left.custom_minimum_size.x = 520
	columns.add_child(left)

	# AI 연습
	var card := UiKit.panel("WhitePanel")
	left.add_child(card)
	var inner := UiKit.vbox(10)
	card.add_child(inner)
	inner.add_child(UiKit.label("AI 연습", "HeaderLabel", 20, UiKit.PURPLE_DARK))
	var start := UiKit.button("AI와 연습하기", func():
		_save_name(name_edit)
		Dialogs.guide(self, "AI를 상대로 차례의 흐름을 익혀 보세요. 시간에 쫓기지 않고 카드 효과와 강화 조합을 연습할 수 있습니다.",
			func():
				session = local
				local.start_vs_ai(UiKit.settings().player_name), "연습 시작"), true)
	start.custom_minimum_size.y = 54
	start.add_theme_font_size_override("font_size", 20)
	inner.add_child(start)

	# 모험 모드
	var adv := UiKit.panel("WhitePanel")
	left.add_child(adv)
	var ac := UiKit.vbox(8)
	adv.add_child(ac)
	ac.add_child(UiKit.label("모험 모드", "HeaderLabel", 20, UiKit.PURPLE_DARK))
	for cid in GameData.all_campaign_ids():
		var id: String = cid
		var cdef := GameData.campaign(id)
		var row := UiKit.hbox(12)
		var info := UiKit.vbox(2)
		info.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		info.add_child(UiKit.bold(cdef["name"], 17))
		info.add_child(UiKit.wrap_label("%s (스테이지 %d개)" % [cdef["description"], cdef["stages"].size()], 13, UiKit.MUTED))
		row.add_child(info)
		var go := UiKit.button("작전 시작", func():
			_save_name(name_edit)
			Dialogs.guide(self, "카드를 모으고, 별로 강화하고, 결정적인 한 차례를 만드세요.",
				func():
					session = local
					local.start_campaign(id, UiKit.settings().player_name), "작전 시작",
				cdef["name"], CampaignUi.STORY_TITLE, CampaignUi.STORY), true)
		go.custom_minimum_size = Vector2(130, 48)
		go.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		row.add_child(go)
		ac.add_child(row)

	# 친구와 대전(온라인)
	var on := UiKit.panel("WhitePanel")
	on.custom_minimum_size.x = 440
	columns.add_child(on)
	var oc := UiKit.vbox(10)
	on.add_child(oc)
	oc.add_child(UiKit.label("친구와 대전 (온라인)", "HeaderLabel", 20, UiKit.PURPLE_DARK))
	oc.add_child(UiKit.wrap_label("방을 만들고 방 코드를 알려 주세요. 웹판(브라우저) 사용자와도 같은 서버에서 대전할 수 있습니다.", 13, UiKit.MUTED))
	oc.add_child(UiKit.bold("서버 주소", 14, UiKit.MUTED))
	var url_edit := LineEdit.new()
	url_edit.text = UiKit.settings().server_url
	url_edit.placeholder_text = "ws://서버주소/ws"
	url_edit.tooltip_text = "웹판 서버의 WebSocket 주소. HTTPS 도메인이면 wss://도메인/ws"
	oc.add_child(url_edit)
	var save_inputs := func():
		_save_name(name_edit)
		var u := url_edit.text.strip_edges()
		if u != "":
			UiKit.settings().server_url = u
			UiKit.settings()._save()
	var create := UiKit.button("방 만들기", func():
		save_inputs.call()
		Dialogs.guide(self, "방 코드를 공유해 두 명이 대전합니다. 로비로 돌아가면 방이 종료되고 상대도 로비로 이동합니다.",
			func():
				session = online
				online.create_room(UiKit.settings().server_url, UiKit.settings().player_name)
				_show_waiting(), "방 만들기", "친구와 대전하기"), true)
	create.custom_minimum_size.y = 48
	oc.add_child(create)
	oc.add_child(UiKit.bold("방 코드로 참가", 14, UiKit.MUTED))
	var join_row := UiKit.hbox(8)
	var code_edit := LineEdit.new()
	code_edit.placeholder_text = "방 코드"
	code_edit.max_length = 8
	code_edit.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	join_row.add_child(code_edit)
	var join := func():
		var code := code_edit.text.strip_edges().to_upper()
		if code == "":
			show_toast("방 코드를 입력하세요")
			return
		save_inputs.call()
		Dialogs.guide(self, "방 코드를 공유해 두 명이 대전합니다. 로비로 돌아가면 방이 종료되고 상대도 로비로 이동합니다.",
			func():
				session = online
				online.join_room(UiKit.settings().server_url, code, UiKit.settings().player_name)
				_show_waiting(), "참가하기", "방 코드로 참가하기")
	code_edit.text_submitted.connect(func(_t): join.call())
	var join_btn := UiKit.button("참가", join, true)
	join_btn.custom_minimum_size.x = 100
	join_row.add_child(join_btn)
	oc.add_child(join_row)

	var note := UiKit.wrap_label("Godot 이식판: AI 연습·모험 모드·온라인 대전을 지원합니다. 도감은 다음 단계에서 옮깁니다.", 13, UiKit.MUTED)
	note.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	col.add_child(note)
	_set_screen(root, "lobby")


## 온라인: 방에 들어갔고 상대를 기다리는 중(또는 서버에 접속하는 중)
func _show_waiting() -> void:
	var root := UiKit.vbox(0)
	root.add_child(UiKit.top_bar("친구와 대전", _top_right_buttons()))
	var center := CenterContainer.new()
	center.size_flags_vertical = Control.SIZE_EXPAND_FILL
	root.add_child(center)
	var box := UiKit.panel("WhitePanel")
	box.custom_minimum_size.x = 520
	center.add_child(box)
	var col := UiKit.vbox(14)
	box.add_child(col)
	var connected := online.is_connected_to_server()
	if online.room == "":
		var l := UiKit.label("서버에 접속하는 중…" if not connected else "방에 들어가는 중…", "HeaderLabel", 22, UiKit.PURPLE_DARK)
		l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		col.add_child(l)
		var u := UiKit.label(online.url, "MutedLabel", 14)
		u.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		col.add_child(u)
	else:
		var l := UiKit.label("방 코드", "MutedLabel", 16)
		l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		col.add_child(l)
		var code := UiKit.label(online.room, "TitleLabel", 56, UiKit.PURPLE)
		code.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		col.add_child(code)
		var w := UiKit.label("상대를 기다리는 중…" if connected else "서버에 다시 연결하는 중…", "HeaderLabel", 20)
		w.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		col.add_child(w)
		var hint := UiKit.wrap_label("친구에게 방 코드를 알려 주세요. 친구는 같은 서버 주소로 '방 코드로 참가'에 이 코드를 넣으면 됩니다. 웹판에서는 로비의 방 코드 칸에 넣습니다.", 14, UiKit.MUTED)
		hint.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		col.add_child(hint)
	var row := UiKit.hbox(10)
	row.alignment = BoxContainer.ALIGNMENT_CENTER
	if online.room != "":
		row.add_child(UiKit.button("코드 복사", func():
			DisplayServer.clipboard_set(online.room)
			show_toast("방 코드를 복사했습니다")))
	row.add_child(UiKit.button("취소하고 로비로", go_lobby, true))
	col.add_child(row)
	_set_screen(root, "waiting")


func _disabled_mode(text: String) -> Button:
	var b := UiKit.button(text, Callable(), false, true)
	b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	return b


# ─────────────────────────── 캐릭터 선택 ───────────────────────────

func _character_card(ch: Dictionary, on_pick: Callable, chosen := false) -> PanelContainer:
	var border := UiKit.PURPLE if chosen else Color("#ddd6ee")
	var p := UiKit.panel("", UiKit.box(Color.WHITE, border, 4 if chosen else 2, 14, 14))
	p.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var col := UiKit.vbox(8)
	p.add_child(col)
	var head := UiKit.hbox(8)
	head.add_child(UiKit.bold(ch["name"], 20, UiKit.INK))
	head.add_child(UiKit.spacer())
	head.add_child(UiKit.bold("체력 %d" % int(ch["maxHp"]), 16, UiKit.RED))
	col.add_child(head)
	var ab := UiKit.wrap_label(ch.get("abilityText", ""), 14, UiKit.MUTED)
	ab.custom_minimum_size.y = 40
	col.add_child(ab)
	var row := UiKit.hbox(6)
	for id in ch["cardIds"]:
		var cv := CardView.make(id, {"mini": true, "clickable": false})
		row.add_child(cv)
	col.add_child(row)
	if not on_pick.is_null():
		col.add_child(UiKit.button("이 캐릭터로 결정" if not chosen else "선택됨", on_pick, true, chosen))
	return p


func _show_select() -> void:
	var v: Dictionary = session.view()
	var you: int = int(v.get("you", 0))
	var my_char = v["picks"][you]["characterId"] if v.has("picks") else null
	var opp_char = v["picks"][1 - you]["characterId"] if v.has("picks") else null
	# 온라인에서는 내가 먼저 고르면 상대를 기다리는 표시로 바꿔 그린다.
	var key := "select:%s:%s" % [str(my_char), str(opp_char != null)]
	if _screen_key == key:
		return
	var root := UiKit.vbox(0)
	root.add_child(UiKit.top_bar("캐릭터 선택", _top_right_buttons()))
	var scroll := ScrollContainer.new()
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	root.add_child(scroll)
	var margin := MarginContainer.new()
	margin.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	for side in ["left", "right", "top", "bottom"]:
		margin.add_theme_constant_override("margin_" + side, 24)
	scroll.add_child(margin)
	var col := UiKit.vbox(14)
	margin.add_child(col)
	if session.is_campaign():
		col.add_child(CampaignUi.header(session.campaign_view()))
	if my_char != null and not session.is_campaign():
		var wait := UiKit.panel("", UiKit.box(Color("#f8eafc"), UiKit.PURPLE, 2, 12, 14))
		var wr := UiKit.hbox(12)
		wait.add_child(wr)
		wr.add_child(UiKit.bold("%s 선택 완료 · %s" % [GameData.character(my_char)["name"],
			"상대도 캐릭터를 골랐습니다" if opp_char != null else "상대 선택을 기다리는 중…"], 18, UiKit.PURPLE_DARK))
		col.add_child(wait)
	for fid in GameData.all_faction_ids():
		var f := GameData.faction(fid)
		col.add_child(UiKit.label(f["name"], "HeaderLabel", 22, UiKit.PURPLE_DARK))
		var grid := GridContainer.new()
		grid.columns = 3
		grid.add_theme_constant_override("h_separation", 14)
		grid.add_theme_constant_override("v_separation", 14)
		for cid in f["characterIds"]:
			var id: String = cid
			var pick := Callable() if my_char != null else func(): session.act({"type": "selectCharacter", "characterId": id})
			grid.add_child(_character_card(GameData.character(id), pick, my_char == id))
		col.add_child(grid)
	_set_screen(root, key)


# ─────────────────────────── 입고 ───────────────────────────

func _show_draft() -> void:
	if _screen_key != "draft":
		_draft_selection = []
		_draft_preview_upgraded = false
	var v: Dictionary = session.view()
	var you: int = v["you"]
	var my_pick: Dictionary = v["picks"][you]
	var opp_pick: Dictionary = v["picks"][1 - you]
	var ch := GameData.character(my_pick["characterId"])
	var submitted: bool = my_pick["cardIds"] != null

	var root := UiKit.vbox(0)
	root.add_child(UiKit.top_bar("거래소 카드 입고하기", _top_right_buttons()))
	var body := UiKit.hbox(16)
	body.size_flags_vertical = Control.SIZE_EXPAND_FILL
	var margin := MarginContainer.new()
	margin.size_flags_vertical = Control.SIZE_EXPAND_FILL
	for side in ["left", "right", "top", "bottom"]:
		margin.add_theme_constant_override("margin_" + side, 18)
	margin.add_child(body)
	root.add_child(margin)

	# 왼쪽: 후보 카드
	var scroll := ScrollContainer.new()
	scroll.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	body.add_child(scroll)
	var main := UiKit.vbox(12)
	main.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scroll.add_child(main)
	if session.is_campaign():
		main.add_child(CampaignUi.header(session.campaign_view()))
	main.add_child(UiKit.label("%s · 거래소에 입고할 카드 %d종류를 선택해주세요." % [ch["name"], MatchRules.DRAFT_SIZE], "HeaderLabel", 20))

	var cands := MatchRules.get_candidates(my_pick["characterId"])
	var faction_ids: Array = GameData.faction(ch["factionId"])["cardIds"]
	for row_def in [["진영 카드", true], ["캐릭터 카드", false]]:
		main.add_child(UiKit.bold(row_def[0], 16, UiKit.MUTED))
		var row := HFlowContainer.new()
		row.add_theme_constant_override("h_separation", 10)
		row.add_theme_constant_override("v_separation", 10)
		for cid in cands:
			if (cid in faction_ids) != row_def[1]:
				continue
			var id: String = cid
			var idx := _draft_selection.find(id)
			var sel := idx >= 0
			var dis := submitted or (not sel and _draft_selection.size() >= MatchRules.DRAFT_SIZE)
			var cv := CardView.make(id, {"upgraded": _draft_preview_upgraded, "selected": sel, "disabled": dis,
				"badge": str(idx + 1) if sel else ""})
			cv.pressed.connect(func(_c):
				var at := _draft_selection.find(id)
				if at >= 0:
					_draft_selection.remove_at(at)
				elif _draft_selection.size() < MatchRules.DRAFT_SIZE:
					_draft_selection.append(id)
				_show_draft())
			row.add_child(cv)
		main.add_child(row)

	var recs := GameData.recommendations(my_pick["characterId"])
	if not recs.is_empty() and not submitted:
		main.add_child(UiKit.bold("AI 추천 입고 구성", 16, UiKit.MUTED))
		for r in recs:
			var rp := UiKit.panel("WhitePanel")
			var rc := UiKit.vbox(6)
			rp.add_child(rc)
			var rh := UiKit.hbox(8)
			rh.add_child(UiKit.bold(r["name"], 16, UiKit.PURPLE_DARK))
			rh.add_child(UiKit.spacer())
			var ids: Array = r["cardIds"]
			rh.add_child(UiKit.button("이 구성 적용", func():
				_draft_selection = ids.duplicate()
				_show_draft()))
			rc.add_child(rh)
			var names := PackedStringArray()
			for id in ids:
				names.append(GameData.card(id)["name"])
			rc.add_child(UiKit.label(" · ".join(names), "", 14, UiKit.INK))
			rc.add_child(UiKit.wrap_label(r.get("strategy", ""), 13, UiKit.MUTED))
			main.add_child(rp)

	var footer := UiKit.hbox(12)
	var toggle := UiKit.button("강화된 카드 미리보기", func():
		_draft_preview_upgraded = not _draft_preview_upgraded
		_show_draft())
	if _draft_preview_upgraded:
		toggle.theme_type_variation = "ToggleOnButton"
	footer.add_child(toggle)
	var confirm := UiKit.button("상대를 기다리는 중" if submitted else "확정하기 (%d/%d)" % [_draft_selection.size(), MatchRules.DRAFT_SIZE],
		func(): session.act({"type": "draft", "cardIds": _draft_selection.duplicate()}), true,
		submitted or _draft_selection.size() != MatchRules.DRAFT_SIZE)
	footer.add_child(confirm)
	main.add_child(footer)

	# 오른쪽: 중립 카드·상대 정보
	var side := UiKit.vbox(12)
	side.custom_minimum_size.x = 340
	body.add_child(side)
	var np := UiKit.panel("WhitePanel")
	side.add_child(np)
	var nc := UiKit.vbox(8)
	np.add_child(nc)
	nc.add_child(UiKit.label("중립 거래소 카드", "HeaderLabel"))
	for nid in v["neutralIds"]:
		var cdef := GameData.card(nid)
		var row := UiKit.hbox(10)
		row.add_child(CardView.make(nid, {"mini": true, "upgraded": _draft_preview_upgraded, "clickable": false}))
		var info := UiKit.vbox(2)
		info.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		info.add_child(UiKit.bold(cdef["name"], 16))
		var meta := "%s · %d원" % [GameData.type_label(cdef["type"]), int(cdef["cost"])]
		if cdef["type"] == "action":
			meta += " · 행동력 %d" % int(Rules.nz(cdef.get("actionCost"), 0))
		info.add_child(UiKit.label(meta, "MutedLabel"))
		var txt: String = cdef.get("upgradedText", cdef["text"]) if _draft_preview_upgraded else cdef["text"]
		info.add_child(UiKit.wrap_label(("★ 강화 · " if _draft_preview_upgraded else "기본 · ") + txt, 13))
		row.add_child(info)
		nc.add_child(row)

	var op := UiKit.panel("WhitePanel")
	if session.is_campaign():
		op.queue_free()  # 모험에서는 머리말에 보스 정보가 있다
	else:
		side.add_child(op)
	var oc := UiKit.vbox(6)
	op.add_child(oc)
	oc.add_child(UiKit.label("상대의 상황", "HeaderLabel"))
	if opp_pick["characterId"] != null:
		var och := GameData.character(opp_pick["characterId"])
		oc.add_child(UiKit.bold("%s · 체력 %d" % [och["name"], int(och["maxHp"])], 15))
		oc.add_child(UiKit.wrap_label(och.get("abilityText", ""), 13, UiKit.MUTED))
	var done: bool = opp_pick["cardIds"] != null
	oc.add_child(UiKit.bold("입고 완료" if done else "고르는 중", 14, UiKit.GREEN if done else UiKit.MUTED))
	var mine := UiKit.panel("WhitePanel")
	side.add_child(mine)
	var mc := UiKit.vbox(6)
	mine.add_child(mc)
	mc.add_child(UiKit.label("내 캐릭터", "HeaderLabel"))
	mc.add_child(UiKit.bold("%s · 체력 %d" % [ch["name"], int(ch["maxHp"])], 15))
	mc.add_child(UiKit.wrap_label(ch.get("abilityText", ""), 13, UiKit.MUTED))
	_set_screen(root, "draft")
