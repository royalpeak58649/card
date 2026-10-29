extends Control
## 앱 진입점. 로비 → 캐릭터 선택 → 입고 → 대전 화면을 바꿔 그린다.

const BattleScreen := preload("res://ui/battle_screen.gd")

var session: GameSession
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

	session = GameSession.new()
	add_child(session)
	session.changed.connect(_refresh)
	session.toast.connect(show_toast)
	_show_lobby()


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
	match session.stage():
		"":
			if _screen_key != "lobby":
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
	_show_lobby()


func confirm_leave() -> void:
	if session.stage() == "" or session.stage() == "finished":
		go_lobby()
		return
	Dialogs.confirm(self, "로비로 돌아갈까요?", "진행 중인 경기를 종료하고 로비로 돌아갑니다.", "로비로", go_lobby)


func _top_right_buttons() -> Array:
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
	var col := UiKit.vbox(18)
	col.custom_minimum_size.x = 560
	center.add_child(col)

	var title := UiKit.label("카드 대전", "TitleLabel", 54, UiKit.PURPLE_DARK)
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	col.add_child(title)
	var sub := UiKit.label("카드를 모으고, 별로 강화하고, 결정적인 한 차례를 만드세요.", "MutedLabel", 17)
	sub.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	col.add_child(sub)

	var card := UiKit.panel("WhitePanel")
	col.add_child(card)
	var inner := UiKit.vbox(12)
	card.add_child(inner)
	inner.add_child(UiKit.bold("내 이름", 15, UiKit.MUTED))
	var name_edit := LineEdit.new()
	name_edit.text = UiKit.settings().player_name
	name_edit.max_length = 12
	name_edit.placeholder_text = "이름"
	inner.add_child(name_edit)

	var start := UiKit.button("AI와 연습하기", func():
		var n := name_edit.text.strip_edges()
		UiKit.settings().player_name = n if n != "" else "나"
		UiKit.settings()._save()
		Dialogs.guide(self, "AI를 상대로 차례의 흐름을 익혀 보세요. 시간에 쫓기지 않고 카드 효과와 강화 조합을 연습할 수 있습니다.",
			func(): session.start_vs_ai(UiKit.settings().player_name), "연습 시작"), true)
	start.custom_minimum_size.y = 56
	start.add_theme_font_size_override("font_size", 20)
	inner.add_child(start)

	var later := UiKit.hbox(10)
	later.add_child(_disabled_mode("친구와 대전 (준비 중)"))
	later.add_child(_disabled_mode("모험 모드 (준비 중)"))
	inner.add_child(later)
	var note := UiKit.wrap_label("Godot 이식판 1단계: AI 연습 대전을 지원합니다. 온라인 대전·모험 모드·도감은 다음 단계에서 옮깁니다.", 13, UiKit.MUTED)
	inner.add_child(note)
	_set_screen(root, "lobby")


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
	if _screen_key == "select":
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
	for fid in GameData.all_faction_ids():
		var f := GameData.faction(fid)
		col.add_child(UiKit.label(f["name"], "HeaderLabel", 22, UiKit.PURPLE_DARK))
		var grid := GridContainer.new()
		grid.columns = 3
		grid.add_theme_constant_override("h_separation", 14)
		grid.add_theme_constant_override("v_separation", 14)
		for cid in f["characterIds"]:
			var id: String = cid
			grid.add_child(_character_card(GameData.character(id), func():
				session.act({"type": "selectCharacter", "characterId": id})))
		col.add_child(grid)
	_set_screen(root, "select")


# ─────────────────────────── 입고 ───────────────────────────

func _show_draft() -> void:
	if _screen_key != "draft":
		_draft_selection = []
		_draft_preview_upgraded = false
	var v := session.view()
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
