extends VBoxContainer
## 대전 화면. 엔진의 view(가려진 상태)를 그리기만 하고 조작은 session 으로 보낸다.
## 웹판 client/battle.js 의 구성(상대 영역 · 거래소 · 가운데 판 · 기록 · 내 영역 · 선택 창)을 따른다.

const LOG_LINES := 14
const KEYWORD_LABELS := {"trash": "제거", "discard": "버리기", "pay": "★ 별 사용", "skip": "사용 안 함"}
const PHASES := [["action", "행동단계"], ["buy", "구매단계"], ["attack", "공격단계"]]

var app
var session: GameSession

var _upgrade_uid := ""
var _choice_selection: Array = []
var _choice_key := ""
var _discard_open := false
var _overlay_layer: Control
var _last_ai_action: Dictionary = {}


func setup(app_node, s: GameSession) -> void:
	app = app_node
	session = s
	session.ai_acted.connect(func(a): _last_ai_action = a)
	add_theme_constant_override("separation", 0)


func _send(action: Dictionary) -> void:
	_upgrade_uid = ""
	session.act_game(action)


func render() -> void:
	UiKit.clear(self)
	var v := session.view()
	var g: Dictionary = v["game"]
	var you: int = v["you"]
	var me: Dictionary = g["players"][you]
	var opp: Dictionary = g["players"][1 - you]
	var finished: bool = v["stage"] == "finished"
	var pending = g.get("pending")
	var my_turn: bool = int(g["activeIndex"]) == you and not finished
	var can_act: bool = session.human_can_act() and pending == null and my_turn

	var title := "AI 연습 · %d턴 · %s" % [int(g["turn"]), "선공" if int(g["firstPlayerIndex"]) == you else "후공"]
	add_child(UiKit.top_bar(title, app._top_right_buttons()))

	var body := MarginContainer.new()
	body.size_flags_vertical = Control.SIZE_EXPAND_FILL
	for side in ["left", "right"]:
		body.add_theme_constant_override("margin_" + side, 12)
	body.add_theme_constant_override("margin_top", 8)
	body.add_theme_constant_override("margin_bottom", 8)
	add_child(body)
	var col := UiKit.vbox(8)
	body.add_child(col)

	col.add_child(_opponent_area(g, opp, my_turn, finished))

	var middle := UiKit.hbox(10)
	middle.size_flags_vertical = Control.SIZE_EXPAND_FILL
	col.add_child(middle)
	middle.add_child(_market_panel(g, me, you, my_turn, can_act))
	middle.add_child(_center_board(g, you, my_turn))
	middle.add_child(_log_panel(g, you))

	col.add_child(_my_area(g, me, you, can_act, finished))

	# 덮개(선택 창·강화 비교·버린 더미·결과)
	_overlay_layer = Control.new()
	_overlay_layer.set_anchors_preset(Control.PRESET_FULL_RECT)
	_overlay_layer.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_overlay_layer.top_level = true
	_overlay_layer.size = get_viewport_rect().size
	add_child(_overlay_layer)

	if pending != null and int(pending["playerIndex"]) == you and pending.get("waiting") != true and not finished:
		_choice_modal(g, me, pending)
	elif _upgrade_uid != "" and can_act:
		var card = _find(me["hand"], _upgrade_uid)
		if card != null and Rules.can_upgrade_card(card):
			_upgrade_modal(g, me, card)
		else:
			_upgrade_uid = ""
	elif _discard_open:
		_discard_modal(me)
	if finished:
		_finished_overlay(v, g, you)


func _notification(what: int) -> void:
	if what == NOTIFICATION_RESIZED and _overlay_layer != null and is_instance_valid(_overlay_layer):
		_overlay_layer.size = get_viewport_rect().size


static func _find(zone: Array, uid: String) -> Variant:
	for c in zone:
		if c["uid"] == uid:
			return c
	return null


# ─────────────────────────── 요약 · 상대 영역 ───────────────────────────

func _stat_chip(text: String, bg: Color, fg := UiKit.INK, size := 15, tip := "") -> PanelContainer:
	var p := UiKit.panel("", UiKit.box(bg, Color.TRANSPARENT, 0, 9, 5))
	var l := UiKit.bold(text, size, fg)
	p.add_child(l)
	p.tooltip_text = tip
	p.mouse_filter = Control.MOUSE_FILTER_PASS if tip != "" else Control.MOUSE_FILTER_IGNORE
	return p


func _summary(player: Dictionary, ongoing: bool) -> HBoxContainer:
	var row := UiKit.hbox(8)
	var ch := GameData.character(player["characterId"]) if player.get("characterId") != null else {}
	var name_box := UiKit.vbox(0)
	var nm := UiKit.bold(ch.get("name", player["name"]), 17, UiKit.INK)
	nm.tooltip_text = ch.get("abilityText", "")
	nm.mouse_filter = Control.MOUSE_FILTER_PASS
	name_box.add_child(nm)
	var sub: String = player["name"]
	if ch.get("ability", {}).get("activeAbility") != null and player.get("abilityUsed") == true:
		sub += " · 능력 사용함"
	name_box.add_child(UiKit.label(sub, "MutedLabel", 13))
	row.add_child(name_box)

	var hp := int(player["hp"])
	var hp_chip := _stat_chip("♥ %d / %d" % [hp, int(player["maxHp"])], Color("#ffe1e1"), UiKit.RED if hp > 0 else Color("#8a0000"), 18, "체력")
	row.add_child(hp_chip)
	if hp <= 0 and ongoing:
		row.add_child(_stat_chip("마지막 반격!", UiKit.RED, Color.WHITE, 14, "라운드가 끝날 때 승패를 판정합니다"))
	var max_stars := Rules.max_stars_of({"players": [player]}, 0)
	row.add_child(_stat_chip(UiKit.stars_text(int(player["stars"]), max_stars), Color("#fff3c4"), Color("#b07800"), 16, "별 %d / %d" % [int(player["stars"]), max_stars]))
	if int(Rules.nz(player.get("defense"), 0)) > 0:
		row.add_child(_stat_chip("방어 %d" % int(player["defense"]), Color("#dfeeff"), Color("#1d5fa8"), 15, "상대의 다음 공격 피해를 그만큼 줄입니다"))
	if int(Rules.nz(player.get("debt"), 0)) > 0:
		row.add_child(_stat_chip("빚 %d" % int(player["debt"]), Color("#ffe7cc"), Color("#a55200"), 15, "빚이 있으면 카드를 살 수 없습니다. 구매단계에 원으로 갚습니다"))
	if player.get("bleed") == true:
		row.add_child(_stat_chip("출혈", Color("#ffd6d6"), Color("#a10f0f"), 15, "피해를 입으면 추가 피해 1(행동카드 피해가 섞이면 2)을 입고 사라집니다"))
	return row


func _opponent_area(g: Dictionary, opp: Dictionary, my_turn: bool, finished: bool) -> PanelContainer:
	var p := UiKit.panel("WhitePanel")
	var row := UiKit.hbox(14)
	p.add_child(row)
	row.add_child(_summary(opp, not finished))
	row.add_child(_stat_chip("덱 %d" % int(Rules.nz(opp.get("drawCount"), 0)), UiKit.PANEL, UiKit.INK, 14, "뽑을 덱"))
	row.add_child(_stat_chip("버린 %d" % opp["discard"].size(), UiKit.PANEL, UiKit.INK, 14, "버린 더미"))
	row.add_child(UiKit.spacer())
	var hand := UiKit.hbox(-14)
	var count := int(Rules.nz(opp.get("handCount"), 0))
	for i in count:
		hand.add_child(CardView.back(Vector2(40, 56)))
	if count == 0:
		hand.add_child(UiKit.label("손패 없음", "MutedLabel"))
	row.add_child(hand)
	if not my_turn and not finished:
		var tag := _stat_chip("상대 차례 진행중" + (" · 생각 중…" if session.is_thinking() else ""), UiKit.PURPLE, Color.WHITE, 14)
		row.add_child(tag)
	return p


# ─────────────────────────── 거래소 ───────────────────────────

func _display_price(g: Dictionary, card_id: String, my_turn: bool) -> int:
	# view 에는 turnState 가 그대로 있으므로 엔진 계산을 그대로 쓴다(내 차례일 때만 차례 보정).
	return Rules.get_purchase_price(g, card_id, int(g["activeIndex"]) if my_turn else -1)


func _market_panel(g: Dictionary, me: Dictionary, you: int, my_turn: bool, can_act: bool) -> PanelContainer:
	var p := UiKit.panel("WhitePanel")
	p.custom_minimum_size.x = 470
	var col := UiKit.vbox(6)
	p.add_child(col)
	var head := UiKit.hbox(8)
	head.add_child(UiKit.label("거래소", "HeaderLabel"))
	head.add_child(UiKit.spacer())
	head.add_child(UiKit.bold("%d원 · 구매 %d" % [int(me["coins"]), int(me["buys"])], 15, UiKit.PURPLE_DARK))
	col.add_child(head)
	var debt_blocked := int(Rules.nz(me.get("debt"), 0)) > 0 and not (my_turn and int(Rules.nz(g["turnState"]["mods"].get("ignoreDebt"), 0)) > 0)
	if debt_blocked:
		col.add_child(UiKit.wrap_label("빚 %d을(를) 다 갚기 전에는 구매할 수 없습니다" % int(me["debt"]), 13, Color("#a55200")))
	if not Rules.can_buy_cards(g, you):
		col.add_child(UiKit.wrap_label("이 캐릭터는 카드를 살 수 없습니다", 13, UiKit.MUTED))
	var scroll := ScrollContainer.new()
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	col.add_child(scroll)
	var inner := UiKit.vbox(6)
	inner.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scroll.add_child(inner)
	for type in ["money", "weapon", "action"]:
		var ids := []
		for id in g["market"]:
			if GameData.card(id)["type"] == type:
				ids.append(id)
		if ids.is_empty():
			continue
		inner.add_child(UiKit.bold(GameData.type_label(type), 14, UiKit.MUTED))
		var flow := HFlowContainer.new()
		flow.add_theme_constant_override("h_separation", 6)
		flow.add_theme_constant_override("v_separation", 6)
		inner.add_child(flow)
		for cid in ids:
			var id: String = cid
			var slot: Dictionary = g["market"][id]
			var price := _display_price(g, id, my_turn)
			var sold_out := int(slot["count"]) <= 0
			var affordable: bool = can_act and g["phase"] == "buy" and int(me["buys"]) >= 1 and int(me["coins"]) >= price and not debt_blocked and Rules.can_buy_cards(g, you)
			var cv := CardView.make(id, {"mini": true, "price": price, "badge": "%d장" % int(slot["count"]),
				"disabled": sold_out or not affordable, "note": "매진" if sold_out else ""})
			if not sold_out and not affordable:
				cv.modulate = Color(1, 1, 1, 0.78)
			cv.pressed.connect(func(_c): _send({"type": "buy", "cardId": id}))
			flow.add_child(cv)
	return p


# ─────────────────────────── 가운데 판 · 기록 ───────────────────────────

func _log_text(entry: Dictionary, you: int) -> String:
	var who := "나" if int(entry["p"]) == you else "상대"
	var nm := ""
	if entry.get("cardId") != null:
		nm = GameData.card(entry["cardId"]).get("name", entry["cardId"])
	var t := "%d턴 · %s: " % [int(entry["turn"]), who]
	match entry["type"]:
		"playCard":
			return t + "%s 사용" % nm
		"buy":
			return t + "%s 구매" % nm
		"upgrade":
			return t + "%s 강화(%s)" % [nm, "영구" if entry.get("mode") == "perm" else "일시"]
		"playAllMoney":
			return t + "재화 모두 내기"
		"playAllWeapons":
			return t + "무기 모두 내기"
		"choose":
			return t + "선택 완료"
		"payDebt":
			return t + "빚 %s 갚음" % str(Rules.nz(entry.get("amount"), ""))
		"activateAbility":
			return t + "캐릭터 능력 발동!"
	return ""


func _phase_label(id: String) -> String:
	for p in PHASES:
		if p[0] == id:
			return p[1]
	return ""


func _center_board(g: Dictionary, you: int, my_turn: bool) -> PanelContainer:
	var p := UiKit.panel("")
	p.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var col := UiKit.vbox(10)
	p.add_child(col)

	var phases := UiKit.hbox(6)
	phases.alignment = BoxContainer.ALIGNMENT_CENTER
	for ph in PHASES:
		var cur: bool = g["phase"] == ph[0]
		var bg := UiKit.PURPLE if cur else Color("#ffffff")
		var fg := Color.WHITE if cur else UiKit.MUTED
		var chip := _stat_chip(ph[1], bg, fg, 16)
		if not my_turn:
			chip.modulate = Color(1, 1, 1, 0.6)
		phases.add_child(chip)
	col.add_child(phases)

	# 상대 행동 안내(AI 진행 속도에 맞춰 한 행동씩 보인다)
	var logs: Array = g["log"]
	var last = logs.back() if not logs.is_empty() else null
	var message := "내 차례입니다" if my_turn else "상대가 다음 행동을 준비하고 있습니다…"
	if g["phase"] == "gameOver":
		message = "경기 종료"
	elif last != null and int(last["p"]) != you:
		if last["type"] == "endPhase":
			message = "상대 차례 종료 · 내 차례입니다" if my_turn else "상대: %s 시작" % _phase_label(g["phase"])
		else:
			message = _log_text(last, you)
	var act := UiKit.panel("WhitePanel")
	var ac := UiKit.vbox(4)
	act.add_child(ac)
	var ml := UiKit.bold(message, 18, UiKit.PURPLE_DARK)
	ml.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	ac.add_child(ml)
	if last != null and int(last["p"]) != you and last.get("cardId") != null and g["phase"] != "gameOver":
		var cdef := GameData.card(last["cardId"])
		var upgraded: bool = last["type"] == "upgrade"
		if last["type"] == "playCard":
			for c in g["players"][int(last["p"])]["inPlay"]:
				if c["cardId"] == last["cardId"]:
					upgraded = c.get("upgraded") == true
		var et := UiKit.wrap_label(cdef.get("upgradedText", "") if upgraded else cdef.get("text", ""), 14, UiKit.INK)
		et.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		ac.add_child(et)
	col.add_child(act)

	var active: Dictionary = g["players"][int(g["activeIndex"])]
	col.add_child(UiKit.bold("이번 차례 낸 카드 (%s)" % ("나" if my_turn else "상대"), 14, UiKit.MUTED))
	var scroll := ScrollContainer.new()
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	col.add_child(scroll)
	var flow := HFlowContainer.new()
	flow.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	flow.add_theme_constant_override("h_separation", 6)
	flow.add_theme_constant_override("v_separation", 6)
	scroll.add_child(flow)
	if active["inPlay"].is_empty():
		flow.add_child(UiKit.label("아직 낸 카드 없음", "MutedLabel"))
	for c in active["inPlay"]:
		flow.add_child(CardView.make(c["cardId"], {"mini": true, "upgraded": c.get("upgraded") == true, "clickable": false}))

	var info := UiKit.hbox(10)
	info.alignment = BoxContainer.ALIGNMENT_CENTER
	var ts = g.get("turnState")
	if ts != null and (g["phase"] == "attack" or int(ts["attackDamage"]) > 0):
		info.add_child(_stat_chip("누적 피해 %d" % int(ts["attackDamage"]), UiKit.RED, Color.WHITE, 18, "공격단계가 끝날 때 한 번에 들어갑니다"))
	if ts != null and int(g["activeIndex"]) == you:
		var mods: Dictionary = ts["mods"]
		if int(mods.get("actionDamageBonus", 0)) > 0:
			info.add_child(_stat_chip("피해 행동카드 +%d" % int(mods["actionDamageBonus"]), UiKit.GOLD, UiKit.INK, 14))
		if int(mods.get("firstWeaponDiscount", 0)) > 0:
			info.add_child(_stat_chip("첫 무기 구매가 -%d" % int(mods["firstWeaponDiscount"]), UiKit.GOLD, UiKit.INK, 14))
		if int(mods.get("marketDiscount", 0)) > 0:
			info.add_child(_stat_chip("구매가 -%d" % int(mods["marketDiscount"]), UiKit.GOLD, UiKit.INK, 14))
	info.add_child(_stat_chip("제거된 카드 %d" % g["trash"].size(), UiKit.PANEL_LIGHT, UiKit.MUTED, 13))
	col.add_child(info)
	return p


func _log_panel(g: Dictionary, you: int) -> PanelContainer:
	var p := UiKit.panel("WhitePanel")
	p.custom_minimum_size.x = 250
	var col := UiKit.vbox(4)
	p.add_child(col)
	col.add_child(UiKit.label("기록", "HeaderLabel"))
	var logs: Array = g["log"]
	var lines := []
	for e in logs:
		var t := _log_text(e, you)
		if t != "":
			lines.append([t, int(e["p"]) == you])
	if lines.is_empty():
		col.add_child(UiKit.label("아직 기록이 없습니다", "MutedLabel"))
	for item in lines.slice(maxi(0, lines.size() - LOG_LINES)):
		col.add_child(UiKit.wrap_label(item[0], 13, UiKit.INK if item[1] else UiKit.PURPLE_DARK))
	return p


# ─────────────────────────── 내 영역 ───────────────────────────

func _can_play(g: Dictionary, me: Dictionary, card: Dictionary, can_act: bool) -> bool:
	if not can_act:
		return false
	var cdef := GameData.card(card["cardId"])
	match cdef["type"]:
		"action":
			return g["phase"] == "action" and int(Rules.nz(cdef.get("actionCost"), 0)) <= int(me["actions"])
		"money":
			return g["phase"] == "buy"
		"weapon":
			return g["phase"] == "attack"
	return false


func _my_area(g: Dictionary, me: Dictionary, you: int, can_act: bool, finished: bool) -> PanelContainer:
	var p := UiKit.panel("WhitePanel")
	var col := UiKit.vbox(8)
	p.add_child(col)

	var top := UiKit.hbox(8)
	col.add_child(top)
	top.add_child(_summary(me, not finished))
	top.add_child(_stat_chip("행동력 %d" % int(me["actions"]), Color("#eef0fb"), Color("#3b4f9c"), 15))
	top.add_child(_stat_chip("구매 %d" % int(me["buys"]), Color("#e8f6ee"), UiKit.GREEN, 15))
	top.add_child(_stat_chip("%d원" % int(me["coins"]), Color("#fff7d6"), Color("#9a6b00"), 15))
	top.add_child(_stat_chip("덱 %d" % int(Rules.nz(me.get("drawCount"), 0)), UiKit.PANEL, UiKit.INK, 14, "뽑을 덱"))
	var discard_btn := UiKit.button("버린 더미 %d" % me["discard"].size(), func():
		_discard_open = true
		render())
	top.add_child(discard_btn)
	top.add_child(UiKit.spacer())
	for b in _action_buttons(g, me, you, can_act):
		top.add_child(b)

	var scroll := ScrollContainer.new()
	scroll.custom_minimum_size.y = CardView.SIZE_NORMAL.y + 14
	scroll.vertical_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	col.add_child(scroll)
	var hand := UiKit.hbox(8)
	scroll.add_child(hand)
	if me["hand"].is_empty():
		hand.add_child(UiKit.label("손패 없음", "MutedLabel"))
	for c in me["hand"]:
		var card: Dictionary = c
		var playable := _can_play(g, me, card, can_act)
		var star := can_act and Rules.can_upgrade_card(card)
		var cv := CardView.make(card["cardId"], {"uid": card["uid"], "upgraded": card.get("upgraded") == true,
			"disabled": not playable and not star, "star": star, "clickable": playable})
		if not playable and star:
			cv.modulate = Color(1, 1, 1, 0.7)
		cv.pressed.connect(func(_c): _send({"type": "playCard", "uid": card["uid"]}))
		cv.star_pressed.connect(func(_c):
			_upgrade_uid = card["uid"]
			render())
		hand.add_child(cv)
	return p


func _action_buttons(g: Dictionary, me: Dictionary, you: int, can_act: bool) -> Array:
	var out := []
	var hand: Array = me["hand"]
	var has_type := func(t: String) -> bool:
		for c in hand:
			if GameData.card(c["cardId"])["type"] == t:
				return true
		return false
	match g["phase"]:
		"action":
			out.append(UiKit.button("구매단계로 ▶", func(): _send({"type": "endPhase"}), true, not can_act))
		"buy":
			if int(Rules.nz(me.get("debt"), 0)) > 0:
				var pay := mini(int(me["debt"]), int(me["coins"]))
				out.append(UiKit.button("빚 갚기 (%d)" % pay, func(): _send({"type": "payDebt"}), false, not can_act or pay <= 0))
			if has_type.call("money"):
				out.append(UiKit.button("재화 모두 내기", func(): _send({"type": "playAllMoney"}), false, not can_act))
			out.append(UiKit.button("공격단계로 ▶", func(): _send({"type": "endPhase"}), true, not can_act))
		"attack":
			if has_type.call("weapon"):
				var b := UiKit.button("무기 모두 내기", func(): _send({"type": "playAllWeapons"}), false, not can_act)
				b.tooltip_text = "손패 순서대로 냅니다. 선택 효과가 나오면 선택을 마친 뒤 다시 눌러주세요."
				out.append(b)
			out.append(UiKit.button("차례 끝내기 ▶", func(): _send({"type": "endPhase"}), true, not can_act))

	var ch := GameData.character(me["characterId"])
	var active = ch.get("ability", {}).get("activeAbility")
	if active != null and me.get("abilityUsed") != true:
		var max_uses := Rules.ability_max_uses(active)
		var left := max_uses - int(Rules.nz(me.get("abilityUses"), 0))
		var too_early: bool = active.get("minOwnTurn") != null and int(Rules.nz(me.get("turnsTaken"), 0)) < int(active["minOwnTurn"])
		var used_now: bool = g.get("turnState") != null and g["turnState"].get("abilityActivated") == true and int(g["activeIndex"]) == you
		var label := "능력 발동 (%d회 남음)" % left if max_uses < Rules.BIG else "능력 발동"
		if too_early:
			label = "능력: 내 %d번째 차례부터" % int(active["minOwnTurn"])
		elif used_now:
			label = "이번 차례 발동함"
		var text: String = active.get("text", ch.get("abilityText", ""))
		var b := UiKit.button(label, func():
			Dialogs.confirm(app, "%s 능력 발동" % ch["name"], text, "발동", func(): _send({"type": "activateAbility"})),
			false, not can_act or too_early or used_now)
		b.tooltip_text = text
		out.push_front(b)
	return out


# ─────────────────────────── 덮개 창 ───────────────────────────

func _modal(title: String, content: Control, width := 760.0) -> Control:
	return Dialogs.modal(_overlay_layer, title, content, width)


func _choice_option(option: String, g: Dictionary, me: Dictionary, pending: Dictionary, selected: bool, order: int, disabled: bool, on_click: Callable) -> Control:
	if KEYWORD_LABELS.has(option):
		var b := UiKit.button(KEYWORD_LABELS[option], on_click, false, disabled)
		if selected:
			b.theme_type_variation = "ToggleOnButton"
		b.custom_minimum_size = Vector2(140, 52)
		return b
	var card_id := ""
	if g["market"].has(option) and GameData.has_card(option):
		card_id = option
	else:
		var oc: Dictionary = Rules.nz(pending.get("optionCards"), {})
		if oc.has(option):
			card_id = oc[option]
		else:
			for zone in [me["hand"], me["discard"]]:
				var c = _find(zone, option)
				if c != null:
					card_id = c["cardId"]
	if card_id == "":
		return UiKit.label("알 수 없는 카드", "MutedLabel")
	var upgraded := false
	for zone in [me["hand"], me["discard"], me["inPlay"]]:
		var c = _find(zone, option)
		if c != null:
			upgraded = c.get("upgraded") == true
	var cv := CardView.make(card_id, {"selected": selected, "disabled": disabled, "upgraded": upgraded,
		"badge": str(order) if selected else ""})
	cv.pressed.connect(func(_c): on_click.call())
	return cv


func _choice_modal(g: Dictionary, me: Dictionary, pending: Dictionary) -> void:
	var key := "%s|%s|%s" % [pending["kind"], ",".join(PackedStringArray(pending["options"])), str(g["log"].size())]
	if key != _choice_key:
		_choice_key = key
		_choice_selection = []
	var options: Array = pending["options"]
	var mn := int(pending.get("min", 0))
	var mx := int(pending.get("max", 0))
	var keyword_only := true
	for o in options:
		if not KEYWORD_LABELS.has(o):
			keyword_only = false
	var single := "discard" in options or "pay" in options
	var limit := 1 if single else mx

	var col := UiKit.vbox(12)
	col.add_child(UiKit.label("하나를 고르세요" if keyword_only else "%d~%d장 선택" % [mn, mx], "MutedLabel", 15))
	if pending["kind"] == "reorderTop":
		col.add_child(UiKit.label("먼저 고른 카드가 맨 위", "MutedLabel", 14))
	var scroll := ScrollContainer.new()
	scroll.custom_minimum_size = Vector2(0, CardView.SIZE_NORMAL.y + 24)
	scroll.vertical_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	var row := UiKit.hbox(8)
	scroll.add_child(row)
	col.add_child(scroll)
	for o in options:
		var option: String = o
		var at := _choice_selection.find(option)
		var sel := at >= 0
		var dis := not sel and _choice_selection.size() >= limit
		row.add_child(_choice_option(option, g, me, pending, sel, at + 1, dis, func():
			var i := _choice_selection.find(option)
			if i >= 0:
				_choice_selection.remove_at(i)
			elif _choice_selection.size() < limit:
				_choice_selection.append(option)
			render()))
	var footer := UiKit.hbox(10)
	footer.add_child(UiKit.label("%d / %d 선택" % [_choice_selection.size(), mx], "MutedLabel", 15))
	footer.add_child(UiKit.spacer())
	var ok := _choice_selection.size() >= mn and _choice_selection.size() <= mx
	footer.add_child(UiKit.button("확인", func():
		var selection := _choice_selection.duplicate()
		_choice_selection = []
		_choice_key = ""
		_send({"type": "choose", "selection": selection}), true, not ok))
	col.add_child(footer)
	_modal(pending.get("prompt", "선택하세요"), col, 900)


func _upgrade_modal(g: Dictionary, me: Dictionary, card: Dictionary) -> void:
	var cdef := GameData.card(card["cardId"])
	var col := UiKit.vbox(10)
	var row := UiKit.hbox(16)
	col.add_child(row)
	var left := UiKit.vbox(6)
	left.add_child(UiKit.bold("현재 효과", 15, UiKit.MUTED))
	left.add_child(CardView.make(card["cardId"], {"clickable": false}))
	row.add_child(left)
	row.add_child(UiKit.label("→", "TitleLabel", 32, UiKit.PURPLE))
	var right := UiKit.vbox(6)
	right.add_child(UiKit.bold("강화 후 효과", 15, Color("#b07800")))
	right.add_child(CardView.make(card["cardId"], {"upgraded": true, "clickable": false}))
	row.add_child(right)
	var texts := UiKit.vbox(6)
	texts.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	texts.add_child(UiKit.wrap_label("기본: " + cdef.get("text", ""), 15))
	texts.add_child(UiKit.wrap_label("★강화: " + cdef.get("upgradedText", ""), 15, Color("#8a5d00")))
	row.add_child(texts)

	var temp_limit := int(Rules.nz(g["turnState"].get("tempUpgrades"), 0)) >= Rules.MAX_TEMP_UPGRADES
	var perm_cost := Rules.perm_upgrade_cost(g, int(g["activeIndex"]))
	var stars := int(me["stars"])
	var btns := UiKit.hbox(10)
	col.add_child(btns)
	var tb := UiKit.button("일시 강화 ★%d" % Rules.TEMP_UPGRADE_COST, func(): _send({"type": "upgrade", "uid": card["uid"], "mode": "temp"}),
		true, stars < Rules.TEMP_UPGRADE_COST or temp_limit)
	tb.tooltip_text = "이번 차례 일시 강화 3장 사용 완료" if temp_limit else "이번 차례에만 적용 · 한 차례 최대 3장"
	btns.add_child(tb)
	var pb := UiKit.button("영구 강화 ★%d" % perm_cost, func(): _send({"type": "upgrade", "uid": card["uid"], "mode": "perm"}),
		true, stars < perm_cost)
	pb.tooltip_text = "이 카드에 경기 내내 적용"
	btns.add_child(pb)
	btns.add_child(UiKit.spacer())
	btns.add_child(UiKit.button("닫기", func():
		_upgrade_uid = ""
		render()))
	col.add_child(UiKit.label("보유 별 ★%d · 강화 버튼을 누르면 별을 사용합니다%s" % [stars, " · 일시 강화 3장 사용 완료" if temp_limit else ""], "MutedLabel", 14))
	_modal("★ %s 강화" % cdef["name"], col, 820)


func _discard_modal(me: Dictionary) -> void:
	var col := UiKit.vbox(10)
	var scroll := ScrollContainer.new()
	scroll.custom_minimum_size = Vector2(0, 360)
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	var flow := HFlowContainer.new()
	flow.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	flow.add_theme_constant_override("h_separation", 6)
	flow.add_theme_constant_override("v_separation", 6)
	scroll.add_child(flow)
	col.add_child(scroll)
	if me["discard"].is_empty():
		flow.add_child(UiKit.label("버린 카드가 없습니다", "MutedLabel"))
	for c in me["discard"]:
		flow.add_child(CardView.make(c["cardId"], {"mini": true, "upgraded": c.get("upgraded") == true, "clickable": false}))
	var row := UiKit.hbox(8)
	row.alignment = BoxContainer.ALIGNMENT_END
	row.add_child(UiKit.button("닫기", func():
		_discard_open = false
		render(), true))
	col.add_child(row)
	_modal("버린 더미 %d장" % me["discard"].size(), col, 900)


func _finished_overlay(v: Dictionary, g: Dictionary, you: int) -> void:
	var col := UiKit.vbox(14)
	var text := "무승부"
	var color := UiKit.MUTED
	if v.get("draw") != true:
		var won: bool = v.get("winner") == you
		text = "승리!" if won else "패배…"
		color = UiKit.PURPLE if won else UiKit.RED
	var big := UiKit.label(text, "TitleLabel", 56, color)
	big.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	col.add_child(big)
	var me: Dictionary = g["players"][you]
	var opp: Dictionary = g["players"][1 - you]
	var hp := UiKit.label("내 체력 %d / %d · 상대 체력 %d / %d · %d턴" % [int(me["hp"]), int(me["maxHp"]), int(opp["hp"]), int(opp["maxHp"]), int(g["turn"])], "", 17)
	hp.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	col.add_child(hp)
	var row := UiKit.hbox(12)
	row.alignment = BoxContainer.ALIGNMENT_CENTER
	row.add_child(UiKit.button("다시 하기", func(): session.start_vs_ai(Settings.player_name)))
	row.add_child(UiKit.button("로비로", app.go_lobby, true))
	col.add_child(row)
	_modal("", col, 520)
