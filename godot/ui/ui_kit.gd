class_name UiKit
extends RefCounted
## 색·글꼴·테마와 화면 조각을 만드는 도우미. 웹판(client/style.css)의 보라색 테마를 따른다.

const PURPLE := Color("#b425d6")
const PURPLE_DARK := Color("#7a1ea8")
const BG := Color("#f6f4fb")
const PANEL := Color("#e9e6f4")
const PANEL_LIGHT := Color("#ffffff")
const INK := Color("#2b2540")
const MUTED := Color("#6f6890")
const GOLD := Color("#f0b429")
const RED := Color("#d64545")
const GREEN := Color("#2f9e62")

const TYPE_BORDER := {"money": Color("#e9b949"), "weapon": Color("#e8606a"), "action": Color("#8e9fd8")}
const TYPE_BG := {"money": Color("#fff7d6"), "weapon": Color("#fde3e5"), "action": Color("#eef0fb")}

const FONT_REGULAR := preload("res://fonts/Pretendard-Regular.otf")
const FONT_BOLD := preload("res://fonts/Pretendard-Bold.otf")
const FONT_HEAVY := preload("res://fonts/Pretendard-ExtraBold.otf")

static var _theme: Theme


## 자동 로드된 설정 노드(res://ui/settings.gd). 전역 이름 대신 실행 중에 찾는다.
static func settings() -> Node:
	return (Engine.get_main_loop() as SceneTree).root.get_node("Settings")


static func box(bg: Color, border := Color.TRANSPARENT, border_w := 0, radius := 10, pad := 10) -> StyleBoxFlat:
	var s := StyleBoxFlat.new()
	s.bg_color = bg
	s.border_color = border
	s.set_border_width_all(border_w)
	s.set_corner_radius_all(radius)
	s.content_margin_left = pad
	s.content_margin_right = pad
	s.content_margin_top = pad
	s.content_margin_bottom = pad
	s.anti_aliasing = true
	return s


static func theme() -> Theme:
	if _theme != null:
		return _theme
	var t := Theme.new()
	t.default_font = FONT_REGULAR
	t.default_font_size = 16

	t.set_color("font_color", "Label", INK)

	# 버튼(기본: 흰 바탕 + 보라 테두리)
	t.set_stylebox("normal", "Button", box(PANEL_LIGHT, PURPLE, 2, 10, 10))
	t.set_stylebox("hover", "Button", box(Color("#f6e9fb"), PURPLE, 2, 10, 10))
	t.set_stylebox("pressed", "Button", box(Color("#ecd3f5"), PURPLE_DARK, 2, 10, 10))
	t.set_stylebox("disabled", "Button", box(Color("#eeeeee"), Color("#c9c4d6"), 2, 10, 10))
	t.set_stylebox("focus", "Button", box(Color.TRANSPARENT, PURPLE_DARK, 2, 10, 10))
	t.set_color("font_color", "Button", PURPLE_DARK)
	t.set_color("font_hover_color", "Button", PURPLE_DARK)
	t.set_color("font_pressed_color", "Button", PURPLE_DARK)
	t.set_color("font_focus_color", "Button", PURPLE_DARK)
	t.set_color("font_disabled_color", "Button", Color("#9a94ad"))
	t.set_font("font", "Button", FONT_BOLD)

	# 주 버튼
	t.set_type_variation("PrimaryButton", "Button")
	t.set_stylebox("normal", "PrimaryButton", box(PURPLE, PURPLE_DARK, 0, 10, 12))
	t.set_stylebox("hover", "PrimaryButton", box(Color("#c43fe3"), PURPLE_DARK, 0, 10, 12))
	t.set_stylebox("pressed", "PrimaryButton", box(PURPLE_DARK, PURPLE_DARK, 0, 10, 12))
	t.set_stylebox("disabled", "PrimaryButton", box(Color("#cdb6d6"), PURPLE_DARK, 0, 10, 12))
	for k in ["font_color", "font_hover_color", "font_pressed_color", "font_focus_color"]:
		t.set_color(k, "PrimaryButton", Color.WHITE)
	t.set_color("font_disabled_color", "PrimaryButton", Color("#f5eef8"))

	# 선택된 토글
	t.set_type_variation("ToggleOnButton", "Button")
	t.set_stylebox("normal", "ToggleOnButton", box(Color("#f3dcfa"), PURPLE_DARK, 3, 10, 10))
	t.set_stylebox("hover", "ToggleOnButton", box(Color("#ecd3f5"), PURPLE_DARK, 3, 10, 10))

	# 패널
	t.set_stylebox("panel", "PanelContainer", box(PANEL, Color.TRANSPARENT, 0, 14, 12))
	t.set_type_variation("WhitePanel", "PanelContainer")
	t.set_stylebox("panel", "WhitePanel", box(PANEL_LIGHT, Color("#ddd6ee"), 1, 14, 12))
	t.set_type_variation("TopBar", "PanelContainer")
	var top := box(PURPLE, Color.TRANSPARENT, 0, 0, 10)
	top.content_margin_left = 18
	top.content_margin_right = 18
	t.set_stylebox("panel", "TopBar", top)
	t.set_type_variation("Overlay", "PanelContainer")
	t.set_stylebox("panel", "Overlay", box(Color(0.12, 0.08, 0.2, 0.55), Color.TRANSPARENT, 0, 0, 0))
	t.set_type_variation("Modal", "PanelContainer")
	t.set_stylebox("panel", "Modal", box(PANEL_LIGHT, PURPLE, 3, 18, 20))

	# 제목 글꼴
	t.set_type_variation("TitleLabel", "Label")
	t.set_font("font", "TitleLabel", FONT_HEAVY)
	t.set_font_size("font_size", "TitleLabel", 26)
	t.set_type_variation("HeaderLabel", "Label")
	t.set_font("font", "HeaderLabel", FONT_BOLD)
	t.set_font_size("font_size", "HeaderLabel", 18)
	t.set_type_variation("MutedLabel", "Label")
	t.set_color("font_color", "MutedLabel", MUTED)
	t.set_font_size("font_size", "MutedLabel", 14)

	# 입력 칸
	t.set_stylebox("normal", "LineEdit", box(Color.WHITE, Color("#c9c0e0"), 2, 10, 10))
	t.set_stylebox("focus", "LineEdit", box(Color.TRANSPARENT, PURPLE, 2, 10, 10))
	t.set_color("font_color", "LineEdit", INK)
	t.set_color("font_placeholder_color", "LineEdit", MUTED)
	t.set_color("caret_color", "LineEdit", PURPLE_DARK)

	# 스크롤·툴팁·옵션
	t.set_stylebox("panel", "TooltipPanel", box(INK, Color.TRANSPARENT, 0, 8, 8))
	t.set_color("font_color", "TooltipLabel", Color.WHITE)
	t.set_font_size("font_size", "TooltipLabel", 14)
	t.set_stylebox("normal", "OptionButton", box(Color("#ffffff22"), Color.WHITE, 1, 8, 6))
	t.set_color("font_color", "OptionButton", Color.WHITE)
	t.set_color("font_hover_color", "OptionButton", Color.WHITE)
	t.set_stylebox("hover", "OptionButton", box(Color("#ffffff44"), Color.WHITE, 1, 8, 6))
	t.set_stylebox("pressed", "OptionButton", box(Color("#ffffff44"), Color.WHITE, 1, 8, 6))
	t.set_stylebox("focus", "OptionButton", box(Color.TRANSPARENT, Color.WHITE, 1, 8, 6))
	t.set_font_size("font_size", "PopupMenu", 16)
	_theme = t
	return t


static func label(text: String, variation := "", size := 0, color = null) -> Label:
	var l := Label.new()
	l.text = text
	if variation != "":
		l.theme_type_variation = variation
	if size > 0:
		l.add_theme_font_size_override("font_size", size)
	if color != null:
		l.add_theme_color_override("font_color", color)
	return l


static func wrap_label(text: String, size := 0, color = null) -> Label:
	var l := label(text, "", size, color)
	l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	return l


static func bold(text: String, size := 16, color = null) -> Label:
	var l := label(text, "", size, color)
	l.add_theme_font_override("font", FONT_BOLD)
	return l


static func button(text: String, on_press: Callable, primary := false, disabled := false) -> Button:
	var b := Button.new()
	b.text = text
	if primary:
		b.theme_type_variation = "PrimaryButton"
	b.disabled = disabled
	b.focus_mode = Control.FOCUS_NONE
	b.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	if not on_press.is_null():
		b.pressed.connect(on_press)
	return b


static func hbox(sep := 8) -> HBoxContainer:
	var h := HBoxContainer.new()
	h.add_theme_constant_override("separation", sep)
	return h


static func vbox(sep := 8) -> VBoxContainer:
	var v := VBoxContainer.new()
	v.add_theme_constant_override("separation", sep)
	return v


static func panel(variation := "", style: StyleBox = null) -> PanelContainer:
	var p := PanelContainer.new()
	if variation != "":
		p.theme_type_variation = variation
	if style != null:
		p.add_theme_stylebox_override("panel", style)
	return p


static func spacer() -> Control:
	var c := Control.new()
	c.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	return c


static func clear(node: Node) -> void:
	for c in node.get_children():
		node.remove_child(c)
		c.queue_free()


## 화면 맨 위 보라색 막대
static func top_bar(title: String, right: Array = []) -> PanelContainer:
	var bar := panel("TopBar")
	bar.custom_minimum_size.y = 60
	var row := hbox(12)
	bar.add_child(row)
	var t := label(title, "TitleLabel", 24, Color.WHITE)
	row.add_child(t)
	row.add_child(spacer())
	for node in right:
		row.add_child(node)
	return bar


static func stars_text(stars: int, max_stars: int) -> String:
	var s := ""
	for i in max_stars:
		s += "★" if i < stars else "☆"
	return s
