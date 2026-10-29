class_name CardView
extends PanelContainer
## 카드 한 장. 종류별 색, 행동력/종류 깃발, 이름, 효과 문구, 가격·남은 장수 배지, 강화 ★ 표시.

signal pressed(card_view: CardView)
signal star_pressed(card_view: CardView)

const SIZE_NORMAL := Vector2(128, 176)
const SIZE_MINI := Vector2(98, 136)
## 대전 화면 손패용 큰 카드
const SIZE_LARGE := Vector2(150, 212)

var card_id := ""
var uid := ""
var upgraded := false
var selected := false
var disabled := false
var mini := false
var price := -1
var badge := ""
var show_star := false
var clickable := true
var extra_note := ""
var large := false
## 지금 낼 수 없는 손패: 흐리게(누를 수는 있다)
var dim := false


static func make(id: String, opts := {}) -> CardView:
	var v := CardView.new()
	v.card_id = id
	v.uid = opts.get("uid", "")
	v.upgraded = opts.get("upgraded", false)
	v.selected = opts.get("selected", false)
	v.disabled = opts.get("disabled", false)
	v.mini = opts.get("mini", false)
	v.price = opts.get("price", -1)
	v.badge = str(opts.get("badge", ""))
	v.show_star = opts.get("star", false)
	v.clickable = opts.get("clickable", true)
	v.extra_note = opts.get("note", "")
	v.large = opts.get("large", false)
	v.dim = opts.get("dim", false)
	v._build()
	return v


func _build() -> void:
	var cdef := GameData.card(card_id)
	var type: String = cdef.get("type", "money")
	custom_minimum_size = SIZE_MINI if mini else (SIZE_LARGE if large else SIZE_NORMAL)
	size_flags_vertical = Control.SIZE_SHRINK_BEGIN
	mouse_filter = Control.MOUSE_FILTER_STOP
	if clickable and not disabled:
		mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND

	var border: Color = TYPE_BORDER(type)
	var bw := 3
	if upgraded:
		border = UiKit.GOLD
	if selected:
		border = UiKit.PURPLE
		bw = 5
	var style := UiKit.box(UiKit.TYPE_BG.get(type, Color.WHITE), border, bw, 12, 7 if mini else 9)
	if upgraded:
		style.shadow_color = Color(0.94, 0.7, 0.16, 0.35)
		style.shadow_size = 6
	add_theme_stylebox_override("panel", style)
	if disabled:
		modulate = Color(1, 1, 1, 0.5)
	elif dim:
		self_modulate = Color(0.86, 0.86, 0.9)

	var col := UiKit.vbox(3 if mini else 5)
	col.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(col)

	# 위쪽 줄: 깃발 · 강화 표시 · 배지
	var top := UiKit.hbox(4)
	top.mouse_filter = Control.MOUSE_FILTER_IGNORE
	col.add_child(top)
	var flag_text := "행동 %d" % int(Rules.nz(cdef.get("actionCost"), 0)) if type == "action" else GameData.type_label(type)
	var flag := _chip(flag_text, TYPE_BORDER(type), Color.WHITE if type != "money" else UiKit.INK, 11 if mini else 12)
	top.add_child(flag)
	if upgraded:
		top.add_child(_chip("★ 강화", UiKit.GOLD, UiKit.INK, 11 if mini else 12))
	top.add_child(UiKit.spacer())
	if badge != "":
		top.add_child(_chip(badge, UiKit.INK, Color.WHITE, 11 if mini else 12))
	if show_star:
		var sb := Button.new()
		sb.text = "★"
		sb.tooltip_text = "강화 비교"
		sb.focus_mode = Control.FOCUS_NONE
		sb.add_theme_font_size_override("font_size", 14)
		sb.add_theme_stylebox_override("normal", UiKit.box(UiKit.GOLD, UiKit.PURPLE_DARK, 2, 12, 3))
		sb.add_theme_stylebox_override("hover", UiKit.box(Color("#ffd463"), UiKit.PURPLE_DARK, 2, 12, 3))
		sb.add_theme_stylebox_override("pressed", UiKit.box(Color("#e09a10"), UiKit.PURPLE_DARK, 2, 12, 3))
		sb.add_theme_color_override("font_color", UiKit.INK)
		sb.add_theme_color_override("font_hover_color", UiKit.INK)
		sb.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
		sb.pressed.connect(func(): star_pressed.emit(self))
		top.add_child(sb)

	var name_l := UiKit.bold(cdef.get("name", card_id), 13 if mini else 16, UiKit.INK)
	name_l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	name_l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	name_l.mouse_filter = Control.MOUSE_FILTER_IGNORE
	col.add_child(name_l)

	# 종류 그림(동전·단검·두루마리)
	var icon := BoardArt.CardIcon.new(type)
	icon.custom_minimum_size = Vector2(0, 30 if mini else (54 if large else 40))
	col.add_child(icon)

	var text: String = cdef.get("upgradedText", cdef.get("text", "")) if upgraded else cdef.get("text", "")
	var text_l := UiKit.wrap_label(text, 11 if mini else (13 if large else 12), UiKit.INK)
	text_l.size_flags_vertical = Control.SIZE_EXPAND_FILL
	text_l.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	text_l.max_lines_visible = 3 if mini else (4 if large else 4)
	text_l.mouse_filter = Control.MOUSE_FILTER_IGNORE
	col.add_child(text_l)

	var bottom := UiKit.hbox(4)
	bottom.mouse_filter = Control.MOUSE_FILTER_IGNORE
	col.add_child(bottom)
	var cost := price if price >= 0 else int(cdef.get("cost", 0))
	var cost_chip := _chip("%d원" % cost, Color("#ffffffcc"), UiKit.INK, 11 if mini else 13)
	if price >= 0 and price != int(cdef.get("cost", 0)):
		cost_chip.tooltip_text = "기본 구매가 %d원" % int(cdef.get("cost", 0))
	bottom.add_child(cost_chip)
	if extra_note != "":
		bottom.add_child(UiKit.spacer())
		bottom.add_child(_chip(extra_note, UiKit.RED, Color.WHITE, 11))

	tooltip_text = tooltip_for(cdef)


static func TYPE_BORDER(type: String) -> Color:
	return UiKit.TYPE_BORDER.get(type, UiKit.MUTED)


static func tooltip_for(cdef: Dictionary) -> String:
	var s := "%s (%s · %d원" % [cdef.get("name", ""), GameData.type_label(cdef.get("type", "")), int(cdef.get("cost", 0))]
	if cdef.get("type") == "action":
		s += " · 행동력 %d" % int(Rules.nz(cdef.get("actionCost"), 0))
	s += ")\n기본: %s" % cdef.get("text", "")
	if cdef.get("upgradedText") != null:
		s += "\n★강화: %s" % cdef["upgradedText"]
	return s


static func _chip(text: String, bg: Color, fg: Color, size: int) -> PanelContainer:
	var p := PanelContainer.new()
	var st := UiKit.box(bg, Color.TRANSPARENT, 0, 8, 2)
	st.content_margin_left = 6
	st.content_margin_right = 6
	p.add_theme_stylebox_override("panel", st)
	p.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var l := UiKit.bold(text, size, fg)
	l.mouse_filter = Control.MOUSE_FILTER_IGNORE
	p.add_child(l)
	return p


func _gui_input(event: InputEvent) -> void:
	if not clickable or disabled:
		return
	var released := false
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT and not event.pressed:
		released = true
	elif event is InputEventScreenTouch and not event.pressed:
		released = true
	if released and get_global_rect().has_point(get_global_mouse_position()):
		accept_event()
		pressed.emit(self)


## 상대 손패 뒷면
static func back(mini_size := Vector2(46, 64)) -> Control:
	var p := PanelContainer.new()
	p.custom_minimum_size = mini_size
	var st := UiKit.box(UiKit.PURPLE, UiKit.PURPLE_DARK, 2, 8, 0)
	p.add_theme_stylebox_override("panel", st)
	var l := UiKit.bold("◆", 18, Color("#ffffffaa"))
	l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	l.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	p.add_child(l)
	return p
