extends Control
## 대전 화면(어두운 판 구도). 엔진의 view(가려진 상태)를 그리기만 하고 조작은 session 으로 보낸다.
##
## 구도
## - 오른쪽 기둥: 위에 상대 초상·체력·별(초상 왼쪽), 가운데에 차례 정보·단계 막대·차례 진행 버튼, 아래에 내 초상·체력·별·능력 버튼
## - 위: 상대 손패 뒷면(가운데), 상대 덱·버린 더미(오른쪽), 메뉴·기록 버튼(왼쪽)
## - 왼쪽: 거래소 탭(눌러서 펼침), 제거된 카드 수, 내 행동력·구매·원(·빚)
## - 가운데: 반투명 판. 현재 단계를 크게 보여 주고, 이번 차례 낸 카드와 상대 행동을 보여 준다. 손패를 이곳에 끌어다 놓으면 카드를 낸다.
## - 아래: 내 덱(왼쪽), 손패(가운데, 마우스를 올리면 솟는다), 내 버린 더미(오른쪽)

const LOG_LINES := 18
const KEYWORD_LABELS := {"trash": "제거", "discard": "버리기", "pay": "★ 별 사용", "skip": "사용 안 함"}
const PHASES := [["action", "행동단계"], ["buy", "구매단계"], ["attack", "공격단계"]]
const RIGHT_W := 300.0
const PORTRAIT := Vector2(188, 246)
const DARK := Color("#1d1926")
const DARK2 := Color("#2a2436")
const TEXT := Color("#f2eefa")
const TEXT_MUTED := Color("#a79fbd")
const PINK := Color("#f05fa8")

var app
## GameSession(AI 연습·모험) 또는 OnlineSession(온라인 대전)
var session

var _upgrade_uid := ""
var _choice_selection: Array = []
var _choice_key := ""
var _discard_open := false
var _market_open := false
var _log_open := false
var _menu_open := false
var _overlay_layer: Control
var _last_ai_action: Dictionary = {}
var _board: Control
## 끄는 카드(유령)가 다시 그리기와 상관없이 남도록 판 밖에 두는 층
var _fx: Control
var _play_area: Control
var _dragging := false
var _render_queued := false


func setup(app_node, s) -> void:
	app = app_node
	session = s
	session.ai_acted.connect(func(a): _last_ai_action = a)
	set_anchors_preset(Control.PRESET_FULL_RECT)
	clip_contents = true
	_board = Control.new()
	_board.set_anchors_preset(Control.PRESET_FULL_RECT)
	_board.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_board)
	_fx = Control.new()
	_fx.set_anchors_preset(Control.PRESET_FULL_RECT)
	_fx.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_fx.z_index = 40
	add_child(_fx)
	resized.connect(_queue_render)


func _queue_render() -> void:
	if _render_queued or session == null:
		return
	_render_queued = true
	(func():
		_render_queued = false
		if is_inside_tree() and not session.view().is_empty() and session.view().get("game") != null:
			render()).call_deferred()


func _send(action: Dictionary) -> void:
	_upgrade_uid = ""
	session.act_game(action)


static func _find(zone: Array, uid: String) -> Variant:
	for c in zone:
		if c["uid"] == uid:
			return c
	return null


# ─────────────────────────── 그리기 도우미 ───────────────────────────

func _put(node: Control, pos: Vector2, sz := Vector2.ZERO, parent: Control = null) -> Control:
	(parent if parent != null else _board).add_child(node)
	node.position = pos
	if sz != Vector2.ZERO:
		node.size = sz
		node.custom_minimum_size = sz
	return node


func _txt(text: String, size: int, color := TEXT, heavy := false) -> Label:
	var l := UiKit.label(text, "", size, color)
	if heavy:
		l.add_theme_font_override("font", UiKit.FONT_HEAVY)
	l.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return l


func _chip(text: String, bg: Color, fg: Color, size := 14, tip := "") -> PanelContainer:
	var p := UiKit.panel("", UiKit.box(bg, Color.TRANSPARENT, 0, 10, 5))
	var l := UiKit.bold(text, size, fg)
	p.add_child(l)
	p.tooltip_text = tip
	p.mouse_filter = Control.MOUSE_FILTER_PASS if tip != "" else Control.MOUSE_FILTER_IGNORE
	return p


func _dark_button(text: String, on_press: Callable, enabled := true, primary := false, font_size := 16) -> Button:
	var b := Button.new()
	b.text = text
	b.focus_mode = Control.FOCUS_NONE
	b.disabled = not enabled
	b.add_theme_font_size_override("font_size", font_size)
	b.add_theme_font_override("font", UiKit.FONT_BOLD)
	var base := UiKit.PURPLE if primary else Color("#3a3249")
	b.add_theme_stylebox_override("normal", UiKit.box(base, Color(1, 1, 1, 0.18), 1, 14, 10))
	b.add_theme_stylebox_override("hover", UiKit.box(base.lightened(0.15), Color(1, 1, 1, 0.5), 1, 14, 10))
	b.add_theme_stylebox_override("pressed", UiKit.box(base.darkened(0.15), Color(1, 1, 1, 0.5), 1, 14, 10))
	b.add_theme_stylebox_override("disabled", UiKit.box(Color("#2c2738"), Color(1, 1, 1, 0.06), 1, 14, 10))
	b.add_theme_stylebox_override("focus", StyleBoxEmpty.new())
	for k in ["font_color", "font_hover_color", "font_pressed_color"]:
		b.add_theme_color_override(k, Color.WHITE)
	b.add_theme_color_override("font_disabled_color", Color(1, 1, 1, 0.35))
	if enabled:
		b.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	if not on_press.is_null():
		b.pressed.connect(on_press)
	return b


# ─────────────────────────── 전체 그리기 ───────────────────────────

func render() -> void:
	if _dragging:
		# 끄는 중에는 다시 그리지 않는다(놓은 뒤 그린다).
		_queue_render()
		return
	UiKit.clear(_board)
	var v: Dictionary = session.view()
	var g: Dictionary = v["game"]
	var you: int = v["you"]
	var me: Dictionary = g["players"][you]
	var opp: Dictionary = g["players"][1 - you]
	var finished: bool = v["stage"] == "finished"
	var pending = g.get("pending")
	var my_turn: bool = int(g["activeIndex"]) == you and not finished
	var can_act: bool = session.human_can_act() and pending == null and my_turn
	var W := size.x if size.x > 0 else get_viewport_rect().size.x
	var H := size.y if size.y > 0 else get_viewport_rect().size.y
	var MW := W - RIGHT_W

	_background(W, H)
	_right_column(g, me, opp, you, my_turn, can_act, finished, W, H)
	_top_row(g, opp, MW)
	_left_column(g, me, you, my_turn, can_act, H)
	_play_area_panel(g, you, my_turn, MW, H)
	_bottom_row(g, me, can_act, MW, H)
	_drawers(g, me, you, my_turn, can_act, H)

	# 덮개(선택 창·카드 상세·버린 더미·결과)
	_overlay_layer = Control.new()
	_overlay_layer.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_overlay_layer.position = Vector2.ZERO
	_overlay_layer.size = Vector2(W, H)
	_board.add_child(_overlay_layer)
	var cv: Dictionary = session.campaign_view()
	if pending != null and int(pending["playerIndex"]) == you and pending.get("waiting") != true and not finished:
		_choice_modal(g, me, pending)
	elif _upgrade_uid != "":
		var card = _find(me["hand"], _upgrade_uid)
		if card != null:
			_card_modal(g, me, card, can_act)
		else:
			_upgrade_uid = ""
	elif _discard_open:
		_discard_modal(me)
	# 모험 모드의 결과는 별도 화면(CampaignUi.result_screen)에서 보여 준다.
	if finished and cv.is_empty():
		_finished_overlay(v, g, you)


func _background(W: float, H: float) -> void:
	var bg := TextureRect.new()
	var grad := Gradient.new()
	grad.set_color(0, Color("#3b3150"))
	grad.set_color(1, Color("#15121c"))
	var tex := GradientTexture2D.new()
	tex.gradient = grad
	tex.fill = GradientTexture2D.FILL_RADIAL
	tex.fill_from = Vector2(0.4, 0.45)
	tex.fill_to = Vector2(1.1, 1.1)
	tex.width = 64
	tex.height = 64
	bg.texture = tex
	bg.stretch_mode = TextureRect.STRETCH_SCALE
	bg.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	bg.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_put(bg, Vector2.ZERO, Vector2(W, H))


# ─────────────────────────── 오른쪽 기둥 ───────────────────────────

func _right_column(g: Dictionary, me: Dictionary, opp: Dictionary, you: int, my_turn: bool, can_act: bool, finished: bool, W: float, H: float) -> void:
	var x0 := W - RIGHT_W
	var col_bg := Panel.new()
	col_bg.add_theme_stylebox_override("panel", UiKit.box(Color(0.07, 0.06, 0.1, 0.72), Color.TRANSPARENT, 0, 0, 0))
	col_bg.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_put(col_bg, Vector2(x0, 0), Vector2(RIGHT_W, H))

	# 상대: 초상(오른쪽 위) · 체력(왼쪽 위) · 별(체력 아래)
	_put(BoardArt.Portrait.new(opp.get("characterId"), true), Vector2(W - PORTRAIT.x, 0), PORTRAIT)
	_put(BoardArt.Heart.new(int(opp["hp"]), int(opp["maxHp"])), Vector2(x0 + 6, 6), Vector2(92, 84))
	var opp_max := Rules.max_stars_of({"players": [opp]}, 0)
	_put(BoardArt.star_column(int(opp["stars"]), opp_max), Vector2(x0 + 30, 96), Vector2(40, 0))
	var opp_info := info_box(opp, g, finished, true)
	_put(opp_info, Vector2(W - PORTRAIT.x + 6, PORTRAIT.y - 4), Vector2(PORTRAIT.x - 12, 0))

	# 가운데: 차례 정보 · 단계 막대 · 차례 진행 버튼
	var mid_y := PORTRAIT.y + 56
	var turn_txt := "%d턴 %s" % [int(g["turn"]), "선공" if int(g["firstPlayerIndex"]) == you else "후공"]
	var tl := _txt(turn_txt, 15, TEXT_MUTED)
	tl.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	_put(tl, Vector2(x0 + 100, mid_y), Vector2(RIGHT_W - 116, 20))
	var bars := HBoxContainer.new()
	bars.add_theme_constant_override("separation", 6)
	for ph in PHASES:
		var bar := Panel.new()
		var cur: bool = g["phase"] == ph[0]
		bar.add_theme_stylebox_override("panel", UiKit.box(Color.WHITE if cur else Color(1, 1, 1, 0.16), Color.TRANSPARENT, 0, 6, 0))
		bar.custom_minimum_size = Vector2(56, 10)
		bar.tooltip_text = ph[1]
		bars.add_child(bar)
	_put(bars, Vector2(x0 + 100, mid_y + 26))
	var btn := _turn_button(g, me, you, my_turn, can_act, finished)
	_put(btn, Vector2(x0 + 100, mid_y + 50), Vector2(RIGHT_W - 112, 92))

	# 나: 초상(오른쪽 아래) · 체력(왼쪽 아래) · 별(체력 위) · 능력 버튼
	_put(BoardArt.Portrait.new(me.get("characterId"), false), Vector2(W - PORTRAIT.x, H - PORTRAIT.y), PORTRAIT)
	_put(BoardArt.Heart.new(int(me["hp"]), int(me["maxHp"])), Vector2(x0 + 6, H - 92), Vector2(92, 84))
	var my_max := Rules.max_stars_of({"players": [me]}, 0)
	var star_h := 34.0 * my_max + (34.0 if int(me["stars"]) > 0 else 0.0)
	_put(BoardArt.star_column(int(me["stars"]), my_max), Vector2(x0 + 30, H - 100 - star_h), Vector2(40, 0))
	var my_info := info_box(me, g, finished, false)
	_put(my_info, Vector2(W - PORTRAIT.x + 6, H - PORTRAIT.y + 6), Vector2(PORTRAIT.x - 12, 0))
	var ability := _ability_button(g, me, you, can_act)
	if ability != null:
		_put(ability, Vector2(x0 - 34, H * 0.62), Vector2(64, 64))


## 이름·상태(방어·빚·출혈·연결) 칩 묶음
func info_box(player: Dictionary, g: Dictionary, finished: bool, is_opp: bool) -> VBoxContainer:
	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", 3)
	box.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var ch_name: String = GameData.character(player["characterId"]).get("name", "") if player.get("characterId") != null else ""
	var nm := _txt("%s · %s" % [player["name"], ch_name] if ch_name != "" else str(player["name"]), 13, TEXT_MUTED)
	nm.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	box.add_child(nm)
	var row := HFlowContainer.new()
	row.add_theme_constant_override("h_separation", 4)
	row.add_theme_constant_override("v_separation", 4)
	if int(Rules.nz(player.get("defense"), 0)) > 0:
		row.add_child(_chip("방어 %d" % int(player["defense"]), Color("#2f5d99"), Color.WHITE, 13, "상대의 다음 공격 피해를 그만큼 줄입니다"))
	if int(Rules.nz(player.get("debt"), 0)) > 0:
		row.add_child(_chip("빚 %d" % int(player["debt"]), Color("#a55200"), Color.WHITE, 13, "빚이 있으면 카드를 살 수 없습니다. 구매단계에 원으로 갚습니다"))
	if player.get("bleed") == true:
		row.add_child(_chip("출혈", Color("#a10f0f"), Color.WHITE, 13, "피해를 입으면 추가 피해 1(행동카드 피해가 섞이면 2)을 입고 사라집니다"))
	if int(player["hp"]) <= 0 and not finished:
		row.add_child(_chip("마지막 반격!", UiKit.RED, Color.WHITE, 13, "라운드가 끝날 때 승패를 판정합니다"))
	var ch = GameData.character(player["characterId"]) if player.get("characterId") != null else {}
	if ch.get("ability", {}).get("activeAbility") != null and player.get("abilityUsed") == true:
		row.add_child(_chip("능력 사용함", Color(1, 1, 1, 0.15), TEXT, 12))
	if is_opp:
		var info: Dictionary = session.opponent_info()
		if info.get("connected") == false and not finished:
			row.add_child(_chip("연결 끊김", UiKit.RED, Color.WHITE, 13, "상대가 다시 접속하면 이어서 진행합니다"))
		var pending = g.get("pending")
		if pending != null and pending.get("waiting") == true and not finished:
			row.add_child(_chip("선택하는 중…", UiKit.GOLD, UiKit.INK, 13))
		elif session.is_thinking():
			row.add_child(_chip("생각 중…", Color(1, 1, 1, 0.15), TEXT, 13))
	box.add_child(row)
	return box


func _turn_button(g: Dictionary, me: Dictionary, you: int, my_turn: bool, can_act: bool, finished: bool) -> Button:
	var pending = g.get("pending")
	var label := ""
	var enabled := false
	if finished or g["phase"] == "gameOver":
		label = "경기 종료"
	elif not my_turn:
		label = "상대 차례\n진행중"
	elif pending != null:
		label = "선택하는 중"
	else:
		match g["phase"]:
			"action":
				label = "구매단계로 ▶"
			"buy":
				label = "공격단계로 ▶"
			"attack":
				label = "차례 끝내기 ▶"
		enabled = can_act
	var b := _dark_button(label, func(): _send({"type": "endPhase"}), enabled, enabled, 24 if enabled else 22)
	b.name = "TurnButton"
	return b


func _extra_buttons(g: Dictionary, me: Dictionary, can_act: bool) -> Array:
	var out := []
	if not can_act:
		return out
	var has_type := func(t: String) -> bool:
		for c in me["hand"]:
			if GameData.card(c["cardId"])["type"] == t:
				return true
		return false
	match g["phase"]:
		"buy":
			if int(Rules.nz(me.get("debt"), 0)) > 0:
				var pay := mini(int(me["debt"]), int(me["coins"]))
				out.append(_dark_button("빚 갚기 (%d)" % pay, func(): _send({"type": "payDebt"}), pay > 0))
			if has_type.call("money"):
				out.append(_dark_button("재화 모두 내기", func(): _send({"type": "playAllMoney"})))
		"attack":
			if has_type.call("weapon"):
				var b := _dark_button("무기 모두 내기", func(): _send({"type": "playAllWeapons"}))
				b.tooltip_text = "손패 순서대로 냅니다. 선택 효과가 나오면 선택을 마친 뒤 다시 눌러주세요."
				out.append(b)
	return out


## 캐릭터 발동형 능력 버튼(둥근 청록 단추). 능력이 없으면 null.
func _ability_button(g: Dictionary, me: Dictionary, you: int, can_act: bool) -> Button:
	var ch := GameData.character(me["characterId"])
	var active = ch.get("ability", {}).get("activeAbility")
	if active == null:
		return null
	var max_uses := Rules.ability_max_uses(active)
	var left := max_uses - int(Rules.nz(me.get("abilityUses"), 0))
	var too_early: bool = active.get("minOwnTurn") != null and int(Rules.nz(me.get("turnsTaken"), 0)) < int(active["minOwnTurn"])
	var used_now: bool = g.get("turnState") != null and g["turnState"].get("abilityActivated") == true and int(g["activeIndex"]) == you
	var usable: bool = can_act and not too_early and not used_now and me.get("abilityUsed") != true
	var text: String = active.get("text", ch.get("abilityText", ""))
	var b := Button.new()
	b.name = "AbilityButton"
	b.text = "능력"
	b.focus_mode = Control.FOCUS_NONE
	b.add_theme_font_override("font", UiKit.FONT_HEAVY)
	b.add_theme_font_size_override("font_size", 16)
	var cyan := Color("#3fd6ec")
	b.add_theme_stylebox_override("normal", UiKit.box(cyan, Color("#1a6f8a"), 3, 32, 4))
	b.add_theme_stylebox_override("hover", UiKit.box(cyan.lightened(0.2), Color.WHITE, 3, 32, 4))
	b.add_theme_stylebox_override("pressed", UiKit.box(cyan.darkened(0.15), Color.WHITE, 3, 32, 4))
	b.add_theme_stylebox_override("disabled", UiKit.box(Color("#3a4a52"), Color("#2a3238"), 3, 32, 4))
	b.add_theme_stylebox_override("focus", StyleBoxEmpty.new())
	for k in ["font_color", "font_hover_color", "font_pressed_color"]:
		b.add_theme_color_override(k, Color("#0c2f3a"))
	b.add_theme_color_override("font_disabled_color", Color(1, 1, 1, 0.35))
	b.disabled = not usable
	var status := "남은 횟수 %d" % left if max_uses < Rules.BIG else ""
	if me.get("abilityUsed") == true:
		status = "모두 사용함"
	elif too_early:
		status = "내 %d번째 차례부터" % int(active["minOwnTurn"])
	elif used_now:
		status = "이번 차례 발동함"
	b.tooltip_text = "%s 능력: %s\n%s" % [ch["name"], text, status]
	if usable:
		b.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	b.pressed.connect(func():
		Dialogs.confirm(app, "%s 능력 발동" % ch["name"], text + ("\n(%s)" % status if status != "" else ""), "발동", func(): _send({"type": "activateAbility"})))
	return b


# ─────────────────────────── 위 · 왼쪽 ───────────────────────────

func _top_row(g: Dictionary, opp: Dictionary, MW: float) -> void:
	# 메뉴 · 기록 단추
	var icons := HBoxContainer.new()
	icons.add_theme_constant_override("separation", 10)
	var menu := _dark_button("메뉴", func():
		_menu_open = not _menu_open
		_log_open = false
		render(), true, _menu_open, 15)
	icons.add_child(menu)
	var logb := _dark_button("기록", func():
		_log_open = not _log_open
		_menu_open = false
		render(), true, _log_open, 15)
	icons.add_child(logb)
	if session.has_method("is_connected_to_server"):
		var ok: bool = session.is_connected_to_server()
		icons.add_child(_chip("● 연결됨" if ok else "● 다시 연결 중…", Color(1, 1, 1, 0.1), Color("#8dffb0") if ok else Color("#ff9a9a"), 13))
	_put(icons, Vector2(16, 14))
	var label_text := session.mode_label() as String
	var cv: Dictionary = session.campaign_view()
	if not cv.is_empty():
		var st: Dictionary = cv["stages"][int(cv["stageIndex"])]
		label_text = "스테이지 %d · %s" % [int(cv["stageIndex"]) + 1, st["name"]]
	_put(_txt(label_text, 13, TEXT_MUTED), Vector2(18, 62))
	if not cv.is_empty() and not cv["augments"].is_empty():
		var aug := HFlowContainer.new()
		aug.add_theme_constant_override("h_separation", 4)
		for id in cv["augments"]:
			aug.add_child(CampaignUi.augment_chip(id))
		_put(aug, Vector2(16, 84), Vector2(MW * 0.3, 0))

	# 상대 손패 뒷면(가운데, 위로 반쯤 걸친다)
	var n := int(Rules.nz(opp.get("handCount"), 0))
	var cw := 92.0
	var step := minf(cw + 4, (MW * 0.42) / maxf(1, n))
	var total := cw + step * maxf(0, n - 1)
	var x := MW / 2.0 - total / 2.0
	for i in n:
		var back := CardView.back(Vector2(cw, 128))
		back.mouse_filter = Control.MOUSE_FILTER_PASS
		back.tooltip_text = "상대 손패 %d장" % n
		_put(back, Vector2(x + step * i, -34), Vector2(cw, 128))

	# 상대 덱 · 버린 더미(오른쪽 위)
	_put(BoardArt.pile_tile(int(Rules.nz(opp.get("drawCount"), 0)), true, "상대 뽑을 덱"), Vector2(MW - 186, 10))
	_put(BoardArt.pile_tile(opp["discard"].size(), false, "상대 버린 더미"), Vector2(MW - 98, 10))


func _left_column(g: Dictionary, me: Dictionary, you: int, my_turn: bool, can_act: bool, H: float) -> void:
	# 거래소 탭(분홍)
	var tab := Button.new()
	tab.name = "MarketTab"
	tab.text = "거래소\n›"
	tab.focus_mode = Control.FOCUS_NONE
	tab.add_theme_font_override("font", UiKit.FONT_HEAVY)
	tab.add_theme_font_size_override("font_size", 20)
	var st := UiKit.box(PINK, Color.WHITE, 3, 0, 8)
	st.corner_radius_top_right = 26
	st.corner_radius_bottom_right = 26
	tab.add_theme_stylebox_override("normal", st)
	var st_h: StyleBoxFlat = st.duplicate()
	st_h.bg_color = PINK.lightened(0.15)
	tab.add_theme_stylebox_override("hover", st_h)
	tab.add_theme_stylebox_override("pressed", st_h)
	tab.add_theme_stylebox_override("focus", StyleBoxEmpty.new())
	for k in ["font_color", "font_hover_color", "font_pressed_color"]:
		tab.add_theme_color_override(k, Color.WHITE)
	tab.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	tab.tooltip_text = "거래소 열기"
	tab.pressed.connect(func():
		_market_open = not _market_open
		render())
	_put(tab, Vector2(0, 168), Vector2(118, 112))
	# 구매할 수 있으면 표시
	if can_act and g["phase"] == "buy" and int(me["buys"]) >= 1:
		_put(_chip("구매 가능", UiKit.GOLD, UiKit.INK, 12), Vector2(10, 284))

	# 제거된 카드
	var trash := PanelContainer.new()
	trash.add_theme_stylebox_override("panel", UiKit.box(Color.WHITE, Color.TRANSPARENT, 0, 10, 8))
	trash.tooltip_text = "제거된 카드 수"
	var tv := VBoxContainer.new()
	tv.add_child(_txt("제거", 13, UiKit.MUTED))
	tv.add_child(_txt(str(g["trash"].size()), 26, UiKit.RED, true))
	trash.add_child(tv)
	_put(trash, Vector2(0, 312), Vector2(118, 72))

	# 내 자원(행동력 · 구매 · 원 · 빚)
	var res := PanelContainer.new()
	res.add_theme_stylebox_override("panel", UiKit.box(Color(0.1, 0.08, 0.14, 0.75), Color(1, 1, 1, 0.55), 2, 14, 14))
	var rv := VBoxContainer.new()
	rv.add_theme_constant_override("separation", 6)
	res.add_child(rv)
	var rows := [["행동력", int(me["actions"]), Color("#cfd7ff")], ["구매", int(me["buys"]), Color("#bff0d2")], ["원", int(me["coins"]), Color("#ffe7a1")]]
	if int(Rules.nz(me.get("debt"), 0)) > 0:
		rows.append(["빚", int(me["debt"]), Color("#ffb37a")])
	for r in rows:
		var line := HBoxContainer.new()
		line.add_theme_constant_override("separation", 10)
		var k := _txt(r[0], 15, TEXT_MUTED)
		k.custom_minimum_size.x = 52
		line.add_child(k)
		line.add_child(_txt(str(r[1]), 30, r[2], true))
		rv.add_child(line)
	_put(res, Vector2(26, H * 0.5 - 20), Vector2(150, 0))
	var ts = g.get("turnState")
	if ts != null and my_turn:
		var mods: Dictionary = ts["mods"]
		var notes := VBoxContainer.new()
		if int(mods.get("actionDamageBonus", 0)) > 0:
			notes.add_child(_chip("피해 행동카드 +%d" % int(mods["actionDamageBonus"]), UiKit.GOLD, UiKit.INK, 12))
		if int(mods.get("firstWeaponDiscount", 0)) > 0:
			notes.add_child(_chip("첫 무기 -%d원" % int(mods["firstWeaponDiscount"]), UiKit.GOLD, UiKit.INK, 12))
		if int(mods.get("marketDiscount", 0)) > 0:
			notes.add_child(_chip("구매가 -%d" % int(mods["marketDiscount"]), UiKit.GOLD, UiKit.INK, 12))
		if notes.get_child_count() > 0:
			_put(notes, Vector2(26, H * 0.5 + 170))


# ─────────────────────────── 가운데 판 ───────────────────────────

func _play_area_panel(g: Dictionary, you: int, my_turn: bool, MW: float, H: float) -> void:
	var rect := Rect2(200, 132, MW - 240, H - 132 - 214)
	var area := PanelContainer.new()
	area.name = "PlayArea"
	var st := UiKit.box(Color(1, 1, 1, 0.07), Color(1, 1, 1, 0.55), 2, 18, 18)
	area.add_theme_stylebox_override("panel", st)
	area.mouse_filter = Control.MOUSE_FILTER_PASS
	_put(area, rect.position, rect.size)
	_play_area = area
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 8)
	col.mouse_filter = Control.MOUSE_FILTER_IGNORE
	area.add_child(col)

	# 단계 이름(이전 단계는 흐리게) + 동그란 막대 3개
	var idx := 0
	for i in PHASES.size():
		if PHASES[i][0] == g["phase"]:
			idx = i
	var head := HBoxContainer.new()
	head.alignment = BoxContainer.ALIGNMENT_CENTER
	head.add_theme_constant_override("separation", 22)
	head.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var prev_name: String = PHASES[(idx + 2) % 3][1]
	head.add_child(_txt(prev_name, 30, Color(1, 1, 1, 0.12), true))
	var cur_name: String = PHASES[idx][1] if g["phase"] != "gameOver" else "경기 종료"
	var cur := _txt(cur_name, 46, Color(1, 1, 1, 0.92 if my_turn else 0.55), true)
	cur.add_theme_constant_override("outline_size", 6)
	cur.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.35))
	head.add_child(cur)
	col.add_child(head)
	var pills := HBoxContainer.new()
	pills.alignment = BoxContainer.ALIGNMENT_CENTER
	pills.add_theme_constant_override("separation", 12)
	pills.mouse_filter = Control.MOUSE_FILTER_IGNORE
	for i in 3:
		var p := Panel.new()
		var on := i == idx
		p.add_theme_stylebox_override("panel", UiKit.box(Color(1, 1, 1, 0.75) if on else Color.TRANSPARENT, Color(1, 1, 1, 0.6), 2, 14, 0))
		p.custom_minimum_size = Vector2(92, 26)
		p.mouse_filter = Control.MOUSE_FILTER_IGNORE
		pills.add_child(p)
	col.add_child(pills)

	# 상대 행동 안내 · 내 차례 안내
	var logs: Array = g["log"]
	var last = logs.back() if not logs.is_empty() else null
	var message := "카드를 이곳으로 끌어다 놓으면 냅니다" if my_turn else "상대가 다음 행동을 준비하고 있습니다…"
	var effect := ""
	if g["phase"] == "gameOver":
		message = "경기 종료"
	elif last != null and int(last["p"]) != you:
		if last["type"] == "endPhase":
			message = "상대 차례 종료 · 내 차례입니다" if my_turn else "상대: %s 시작" % _phase_label(g["phase"])
		else:
			message = _log_text(last, you)
			if last.get("cardId") != null:
				var cdef := GameData.card(last["cardId"])
				var upgraded: bool = last["type"] == "upgrade"
				if last["type"] == "playCard":
					for c in g["players"][int(last["p"])]["inPlay"]:
						if c["cardId"] == last["cardId"]:
							upgraded = c.get("upgraded") == true
				effect = cdef.get("upgradedText", "") if upgraded else cdef.get("text", "")
	var ml := _txt(message, 17, Color("#ffd6f0") if not my_turn else TEXT)
	ml.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	col.add_child(ml)
	if effect != "":
		var el := _txt(effect, 14, TEXT_MUTED)
		el.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		el.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		col.add_child(el)

	# 이번 차례 낸 카드
	var active: Dictionary = g["players"][int(g["activeIndex"])]
	var played := HFlowContainer.new()
	played.alignment = FlowContainer.ALIGNMENT_CENTER
	played.add_theme_constant_override("h_separation", 6)
	played.add_theme_constant_override("v_separation", 6)
	played.size_flags_vertical = Control.SIZE_EXPAND_FILL
	played.mouse_filter = Control.MOUSE_FILTER_IGNORE
	for c in active["inPlay"]:
		var mv := CardView.make(c["cardId"], {"mini": true, "upgraded": c.get("upgraded") == true, "clickable": false})
		mv.mouse_filter = Control.MOUSE_FILTER_PASS
		played.add_child(mv)
	col.add_child(played)

	# 보조 버튼(재화 모두 내기 · 무기 모두 내기 · 빚 갚기): 판 오른쪽 아래
	var extra := HBoxContainer.new()
	extra.add_theme_constant_override("separation", 8)
	for b in _extra_buttons(g, g["players"][you], session.human_can_act() and g.get("pending") == null and my_turn):
		extra.add_child(b)
	if extra.get_child_count() > 0:
		_put(extra, rect.position + Vector2(rect.size.x - 16 - 150 * extra.get_child_count(), rect.size.y - 56), Vector2(150 * extra.get_child_count(), 42))
	else:
		extra.queue_free()

	# 누적 피해(오른쪽 위 모서리)
	var ts = g.get("turnState")
	if ts != null and (g["phase"] == "attack" or int(ts["attackDamage"]) > 0):
		_put(_chip("누적 피해 %d" % int(ts["attackDamage"]), UiKit.RED, Color.WHITE, 18, "공격단계가 끝날 때 한 번에 들어갑니다"), rect.position + Vector2(rect.size.x - 150, 12))


# ─────────────────────────── 아래(손패) ───────────────────────────

func _bottom_row(g: Dictionary, me: Dictionary, can_act: bool, MW: float, H: float) -> void:
	_put(BoardArt.pile_tile(int(Rules.nz(me.get("drawCount"), 0)), true, "내 뽑을 덱"), Vector2(30, H - 122))
	var discard_btn := Button.new()
	discard_btn.flat = true
	discard_btn.focus_mode = Control.FOCUS_NONE
	discard_btn.tooltip_text = "버린 더미 보기"
	discard_btn.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	var tile := BoardArt.pile_tile(me["discard"].size(), false, "버린 더미 보기")
	tile.mouse_filter = Control.MOUSE_FILTER_IGNORE
	discard_btn.add_child(tile)
	discard_btn.pressed.connect(func():
		_discard_open = true
		render())
	_put(discard_btn, Vector2(MW - 112, H - 122), Vector2(78, 108))

	var hand: Array = me["hand"]
	var card_size := CardView.SIZE_LARGE
	var left := 140.0
	var right := MW - 130.0
	var avail := right - left
	var n := hand.size()
	var step := card_size.x + 6
	if n > 1:
		step = minf(step, (avail - card_size.x) / (n - 1))
	var total := card_size.x + step * maxf(0, n - 1)
	var x := left + avail / 2.0 - total / 2.0
	var y := H - card_size.y + 40
	for i in n:
		var card: Dictionary = hand[i]
		var playable := _can_play(g, me, card, can_act)
		var star := can_act and Rules.can_upgrade_card(card)
		var hc := HandCard.make(card, card_size, playable, star, _fx)
		hc.name = "Hand_%s" % card["uid"]
		hc.clicked.connect(func(uid):
			_upgrade_uid = uid
			render())
		hc.view.star_pressed.connect(func(_v):
			_upgrade_uid = card["uid"]
			render())
		hc.drag_started.connect(func(_u): _dragging = true)
		hc.drag_ended.connect(func(_u): _dragging = false)
		hc.dropped.connect(func(uid, pos): _on_drop(hc, uid, pos))
		_put(hc, Vector2(x + step * i, y), card_size)
	if n == 0:
		_put(_txt("손패 없음", 16, TEXT_MUTED), Vector2(left + avail / 2.0 - 30, H - 60))


## 손패를 놓았을 때: 가운데 판 위면 카드를 내고, 아니면 제자리로.
func _on_drop(hc: HandCard, uid: String, pos: Vector2) -> void:
	if _play_area != null and is_instance_valid(_play_area) and _play_area.get_global_rect().has_point(pos) and hc.playable:
		hc.fly_to(_play_area.get_global_rect().get_center())
		_send({"type": "playCard", "uid": uid})
	else:
		hc.snap_back()
		if _play_area != null and is_instance_valid(_play_area) and _play_area.get_global_rect().has_point(pos) and not hc.playable:
			app.show_toast("지금은 이 카드를 낼 수 없습니다")


# ─────────────────────────── 서랍(거래소 · 기록 · 메뉴) ───────────────────────────

func _drawer(pos: Vector2, sz: Vector2, title: String, on_close: Callable, dark := false) -> VBoxContainer:
	var p := PanelContainer.new()
	p.add_theme_stylebox_override("panel", UiKit.box(DARK2 if dark else Color("#fbf9ff"), PINK, 3, 16, 14))
	p.mouse_filter = Control.MOUSE_FILTER_STOP
	_put(p, pos, sz)
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 8)
	p.add_child(col)
	var head := HBoxContainer.new()
	head.add_child(UiKit.label(title, "HeaderLabel", 18, TEXT if dark else UiKit.INK))
	head.add_child(UiKit.spacer())
	head.add_child(UiKit.button("닫기", on_close))
	col.add_child(head)
	return col


func _drawers(g: Dictionary, me: Dictionary, you: int, my_turn: bool, can_act: bool, H: float) -> void:
	if _market_open:
		var col := _drawer(Vector2(118, 120), Vector2(470, H - 240), "거래소 · %d원 · 구매 %d" % [int(me["coins"]), int(me["buys"])], func():
			_market_open = false
			render())
		var debt_blocked := int(Rules.nz(me.get("debt"), 0)) > 0 and not (my_turn and int(Rules.nz(g["turnState"]["mods"].get("ignoreDebt"), 0)) > 0)
		if debt_blocked:
			col.add_child(UiKit.wrap_label("빚 %d을(를) 다 갚기 전에는 구매할 수 없습니다" % int(me["debt"]), 13, Color("#a55200")))
		if not Rules.can_buy_cards(g, you):
			col.add_child(UiKit.wrap_label("이 캐릭터는 카드를 살 수 없습니다", 13, UiKit.MUTED))
		if can_act and g["phase"] != "buy":
			col.add_child(UiKit.wrap_label("구매는 구매단계에 할 수 있습니다", 13, UiKit.MUTED))
		var scroll := ScrollContainer.new()
		scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
		scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
		col.add_child(scroll)
		var inner := VBoxContainer.new()
		inner.add_theme_constant_override("separation", 6)
		inner.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		scroll.add_child(inner)
		for type in ["money", "weapon", "action"]:
			var ids := []
			for id in g["market"]:
				if GameData.card(id)["type"] == type:
					ids.append(id)
			if ids.is_empty():
				continue
			inner.add_child(UiKit.bold(GameData.type_label(type), 13, UiKit.MUTED))
			for cid in ids:
				var id: String = cid
				var slot: Dictionary = g["market"][id]
				var price := _display_price(g, id, my_turn)
				var sold_out := int(slot["count"]) <= 0
				var affordable: bool = can_act and g["phase"] == "buy" and int(me["buys"]) >= 1 and int(me["coins"]) >= price and not debt_blocked and Rules.can_buy_cards(g, you)
				inner.add_child(_market_row(id, price, int(slot["count"]), sold_out, affordable))
	if _log_open:
		var col := _drawer(Vector2(16, 80), Vector2(380, H - 330), "기록", func():
			_log_open = false
			render())
		var scroll := ScrollContainer.new()
		scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
		scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
		col.add_child(scroll)
		var inner := VBoxContainer.new()
		inner.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		scroll.add_child(inner)
		var lines := []
		for e in g["log"]:
			var t := _log_text(e, you)
			if t != "":
				lines.append([t, int(e["p"]) == you])
		if lines.is_empty():
			inner.add_child(UiKit.label("아직 기록이 없습니다", "MutedLabel"))
		for item in lines.slice(maxi(0, lines.size() - 60)):
			inner.add_child(UiKit.wrap_label(item[0], 13, UiKit.INK if item[1] else UiKit.PURPLE_DARK))
		(func(): scroll.scroll_vertical = 100000).call_deferred()
	if _menu_open:
		var col := _drawer(Vector2(16, 80), Vector2(360, 0), "메뉴", func():
			_menu_open = false
			render(), true)
		for node in app._top_right_buttons():
			col.add_child(node)


# ─────────────────────────── 카드 상세(누르기) ───────────────────────────

func _modal(title: String, content: Control, width := 760.0) -> Control:
	return Dialogs.modal(_overlay_layer, title, content, width)


## 손패를 누르면 여는 창: 기본/강화 효과 비교, 사용하기(드래그 대신), 일시·영구 강화
func _card_modal(g: Dictionary, me: Dictionary, card: Dictionary, can_act: bool) -> void:
	var cdef := GameData.card(card["cardId"])
	var can_upgrade := Rules.can_upgrade_card(card)
	var col := UiKit.vbox(10)
	var row := UiKit.hbox(16)
	col.add_child(row)
	var left := UiKit.vbox(6)
	left.add_child(UiKit.bold("현재 효과", 15, UiKit.MUTED))
	left.add_child(CardView.make(card["cardId"], {"clickable": false, "upgraded": card.get("upgraded") == true, "large": true}))
	row.add_child(left)
	if can_upgrade:
		row.add_child(UiKit.label("→", "TitleLabel", 32, UiKit.PURPLE))
		var right := UiKit.vbox(6)
		right.add_child(UiKit.bold("강화 후 효과", 15, Color("#b07800")))
		right.add_child(CardView.make(card["cardId"], {"upgraded": true, "clickable": false, "large": true}))
		row.add_child(right)
	var texts := UiKit.vbox(6)
	texts.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var meta := "%s · %d원" % [GameData.type_label(cdef["type"]), int(cdef["cost"])]
	if cdef["type"] == "action":
		meta += " · 행동력 %d" % int(Rules.nz(cdef.get("actionCost"), 0))
	texts.add_child(UiKit.label(meta, "MutedLabel", 14))
	texts.add_child(UiKit.wrap_label("기본: " + cdef.get("text", ""), 15))
	if cdef.get("upgradedText") != null:
		texts.add_child(UiKit.wrap_label("★강화: " + cdef.get("upgradedText", ""), 15, Color("#8a5d00")))
	if card.get("upgraded") == true:
		texts.add_child(UiKit.label("이 카드는 강화되어 있습니다", "MutedLabel", 14))
	elif cdef.get("basic") == true:
		texts.add_child(UiKit.label("기본 공급 카드는 강화할 수 없습니다", "MutedLabel", 14))
	row.add_child(texts)

	var btns := UiKit.hbox(10)
	col.add_child(btns)
	var playable := _can_play(g, me, card, can_act)
	var use := UiKit.button("사용하기", func(): _send({"type": "playCard", "uid": card["uid"]}), true, not playable)
	use.tooltip_text = "가운데 판으로 끌어다 놓아도 됩니다" if playable else "지금 단계에는 낼 수 없습니다"
	btns.add_child(use)
	var stars := int(me["stars"])
	if can_upgrade and can_act:
		var temp_limit := int(Rules.nz(g["turnState"].get("tempUpgrades"), 0)) >= Rules.MAX_TEMP_UPGRADES
		var perm_cost := Rules.perm_upgrade_cost(g, int(g["activeIndex"]))
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
	if can_upgrade and can_act:
		col.add_child(UiKit.label("보유 별 ★%d · 강화 버튼을 누르면 별을 사용합니다" % stars, "MutedLabel", 14))
	_modal(("★ %s 강화" % cdef["name"]) if can_upgrade and can_act else cdef["name"], col, 860)



# ─────────────────────────── 웹판과 같은 조각(거래소 줄 · 기록 문구 · 선택 창 · 결과) ───────────────────────────

func _display_price(g: Dictionary, card_id: String, my_turn: bool) -> int:
	# view 에는 turnState 가 그대로 있으므로 엔진 계산을 그대로 쓴다(내 차례일 때만 차례 보정).
	return Rules.get_purchase_price(g, card_id, int(g["activeIndex"]) if my_turn else -1)


func _market_row(id: String, price: int, count: int, sold_out: bool, affordable: bool) -> Control:
	var cdef := GameData.card(id)
	var type: String = cdef["type"]
	var bg: Color = UiKit.TYPE_BG.get(type, Color.WHITE)
	var border: Color = UiKit.TYPE_BORDER.get(type, UiKit.MUTED)
	var b := Button.new()
	b.focus_mode = Control.FOCUS_NONE
	b.custom_minimum_size.y = 46
	b.disabled = sold_out or not affordable
	b.add_theme_stylebox_override("normal", UiKit.box(bg, border, 2, 10, 6))
	b.add_theme_stylebox_override("hover", UiKit.box(bg.lightened(0.3), UiKit.PURPLE, 3, 10, 6))
	b.add_theme_stylebox_override("pressed", UiKit.box(bg.darkened(0.08), UiKit.PURPLE_DARK, 3, 10, 6))
	b.add_theme_stylebox_override("disabled", UiKit.box(bg, border.lerp(Color.WHITE, 0.5), 2, 10, 6))
	if not b.disabled:
		b.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	b.tooltip_text = CardView.tooltip_for(cdef)
	b.pressed.connect(func(): _send({"type": "buy", "cardId": id}))
	var row := UiKit.hbox(8)
	row.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT, Control.PRESET_MODE_KEEP_SIZE, 8)
	row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	b.add_child(row)
	var fade := 0.45 if (sold_out or not affordable) else 1.0
	var flag := "행동 %d" % int(Rules.nz(cdef.get("actionCost"), 0)) if type == "action" else GameData.type_label(type)
	var chip := CardView._chip(flag, border, Color.WHITE if type != "money" else UiKit.INK, 12)
	chip.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	row.add_child(chip)
	var texts := UiKit.vbox(0)
	texts.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	texts.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var nm := UiKit.bold(cdef["name"], 15, UiKit.INK)
	nm.mouse_filter = Control.MOUSE_FILTER_IGNORE
	texts.add_child(nm)
	var tx := UiKit.label(cdef.get("text", ""), "", 12, UiKit.MUTED)
	tx.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	tx.clip_text = true
	tx.mouse_filter = Control.MOUSE_FILTER_IGNORE
	texts.add_child(tx)
	row.add_child(texts)
	var price_l := UiKit.bold("매진" if sold_out else "%d원" % price, 16, UiKit.RED if sold_out else UiKit.INK)
	price_l.mouse_filter = Control.MOUSE_FILTER_IGNORE
	if price != int(cdef["cost"]) and not sold_out:
		price_l.add_theme_color_override("font_color", UiKit.PURPLE_DARK)
	row.add_child(price_l)
	var cnt := UiKit.label("%d장" % count, "", 12, UiKit.MUTED)
	cnt.custom_minimum_size.x = 30
	cnt.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	cnt.mouse_filter = Control.MOUSE_FILTER_IGNORE
	row.add_child(cnt)
	row.modulate = Color(1, 1, 1, fade)
	return b


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
	if session.can_restart():
		row.add_child(UiKit.button("다시 하기", func(): session.start_vs_ai(UiKit.settings().player_name)))
	row.add_child(UiKit.button("로비로", app.go_lobby, true))
	col.add_child(row)
	_modal("", col, 520)
