class_name BoardArt
extends RefCounted
## 대전 화면에 쓰는 그림 조각(코드로 그린다). 그림 자원이 생기면 같은 자리에 바꿔 끼운다.
## - Portrait: 캐릭터 초상. res://art/characters/<캐릭터id>.png 가 있으면 그 그림, 없으면 진영 색 실루엣.
## - CardIcon: 카드 종류 그림(재화 = 동전, 무기 = 단검, 행동 = 두루마리).
## - Heart: 하트 모양 체력 표시.

const FACTION_COLORS := {
	"section8": [Color("#4f6b3a"), Color("#a3c26a")],
	"neuro": [Color("#1f4f8a"), Color("#4fd2e8")],
	"ligand": [Color("#5b2a86"), Color("#e7b94a")],
	"vincent": [Color("#7a1f2b"), Color("#f0a35b")],
	"silverbeast": [Color("#3b4250"), Color("#c9d2de")],
}


static func faction_colors(character_id) -> Array:
	if character_id == null or not GameData.has_character(character_id):
		return [Color("#3a3248"), Color("#b425d6")]
	var fid: String = GameData.character(character_id).get("factionId", "")
	return FACTION_COLORS.get(fid, [Color("#3a3248"), Color("#b425d6")])


## 캐릭터 초상(그림이 없으면 진영 색 배경 + 실루엣 + 이름)
class Portrait extends Control:
	var character_id = null
	var mirror := false
	var _tex: Texture2D

	func _init(id = null, flip := false) -> void:
		character_id = id
		mirror = flip
		mouse_filter = Control.MOUSE_FILTER_PASS
		clip_contents = true
		if id != null:
			var path := "res://art/characters/%s.png" % id
			if ResourceLoader.exists(path):
				_tex = load(path)
			if GameData.has_character(id):
				tooltip_text = "%s\n%s" % [GameData.character(id)["name"], GameData.character(id).get("abilityText", "")]

	func _draw() -> void:
		var r := Rect2(Vector2.ZERO, size)
		var cols: Array = BoardArt.faction_colors(character_id)
		if _tex != null:
			draw_texture_rect(_tex, r, false)
			return
		# 대각선 그러데이션 배경
		var steps := 24
		for i in steps:
			var t := float(i) / steps
			var c: Color = cols[0].lerp(cols[1], t * 0.85)
			draw_rect(Rect2(0, size.y * t, size.x, size.y / steps + 1), c)
		# 빛 줄무늬
		var stripe := PackedVector2Array([Vector2(size.x * 0.55, 0), Vector2(size.x * 0.8, 0), Vector2(size.x * 0.35, size.y), Vector2(size.x * 0.1, size.y)])
		draw_colored_polygon(stripe, Color(1, 1, 1, 0.08))
		# 실루엣(머리·어깨)
		var cx := size.x * (0.42 if mirror else 0.58)
		var head_r := size.x * 0.17
		var head_c := Vector2(cx, size.y * 0.38)
		var sil := Color(0, 0, 0, 0.32)
		draw_circle(head_c, head_r, sil)
		var body := PackedVector2Array()
		var w := size.x * 0.42
		var top := head_c.y + head_r * 0.9
		body.append(Vector2(cx - w * 0.35, top))
		body.append(Vector2(cx + w * 0.35, top))
		body.append(Vector2(cx + w, size.y))
		body.append(Vector2(cx - w, size.y))
		draw_colored_polygon(body, sil)
		# 이름
		if character_id != null and GameData.has_character(character_id):
			var nm: String = GameData.character(character_id)["name"]
			var font: Font = UiKit.FONT_HEAVY
			var fs := 22
			var tw := font.get_string_size(nm, HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x
			if tw > size.x - 16:
				fs = int(fs * (size.x - 16) / tw)
			var pos := Vector2(10, size.y - 14)
			draw_string_outline(font, pos, nm, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, 6, Color(0, 0, 0, 0.55))
			draw_string(font, pos, nm, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, Color.WHITE)


## 카드 종류 그림
class CardIcon extends Control:
	var type := "money"
	var tint := Color.WHITE

	func _init(t := "money") -> void:
		type = t
		mouse_filter = Control.MOUSE_FILTER_IGNORE

	func _draw() -> void:
		var c := size / 2.0
		var s := minf(size.x, size.y) * 0.42
		var dark := Color(0, 0, 0, 0.55)
		# 바탕 원
		draw_circle(c, s * 1.08, Color(1, 1, 1, 0.55))
		match type:
			"money":
				draw_circle(c, s * 0.82, Color("#e9b949"))
				draw_circle(c, s * 0.62, Color("#f6d365"))
				draw_arc(c, s * 0.82, 0, TAU, 32, Color("#b07800"), 2.0, true)
				var font: Font = UiKit.FONT_HEAVY
				var fs := int(s * 0.9)
				var tw := font.get_string_size("₩", HORIZONTAL_ALIGNMENT_LEFT, -1, fs)
				draw_string(font, c + Vector2(-tw.x / 2, fs * 0.36), "₩", HORIZONTAL_ALIGNMENT_LEFT, -1, fs, Color("#8a5d00"))
			"weapon":
				# 단검: 칼날 + 손잡이
				var blade := PackedVector2Array([c + Vector2(-s * 0.55, s * 0.55), c + Vector2(s * 0.55, -s * 0.75), c + Vector2(s * 0.7, -s * 0.6), c + Vector2(-s * 0.4, s * 0.7)])
				draw_colored_polygon(blade, Color("#d9dee6"))
				draw_polyline(PackedVector2Array([blade[0], blade[1], blade[2], blade[3], blade[0]]), dark, 1.5, true)
				var guard_a := c + Vector2(-s * 0.72, s * 0.32)
				var guard_b := c + Vector2(-s * 0.28, s * 0.78)
				draw_line(guard_a, guard_b, Color("#5a3b2a"), s * 0.16, true)
				draw_line(c + Vector2(-s * 0.55, s * 0.6), c + Vector2(-s * 0.85, s * 0.9), Color("#3a2a20"), s * 0.18, true)
			"action":
				# 두루마리
				var r := Rect2(c - Vector2(s * 0.6, s * 0.7), Vector2(s * 1.2, s * 1.4))
				draw_rect(r, Color("#f3ead2"))
				draw_rect(r, dark, false, 1.5)
				for i in 4:
					var y := r.position.y + s * 0.3 + i * s * 0.28
					draw_line(Vector2(r.position.x + s * 0.18, y), Vector2(r.end.x - s * 0.18, y), Color("#8e9fd8"), 2.0)
				draw_circle(Vector2(c.x, r.position.y), s * 0.16, Color("#8e9fd8"))
				draw_circle(Vector2(c.x, r.end.y), s * 0.16, Color("#8e9fd8"))


## 하트 모양 체력
class Heart extends Control:
	var hp := 0
	var max_hp := 0

	func _init(h := 0, m := 0) -> void:
		hp = h
		max_hp = m
		custom_minimum_size = Vector2(92, 84)
		mouse_filter = Control.MOUSE_FILTER_PASS
		tooltip_text = "체력 %d / %d" % [h, m]

	func _draw() -> void:
		var w := size.x
		var c := Vector2(w / 2, 26)
		var r := 18.0
		var col := Color("#ff6fae") if hp > 0 else Color("#7a2a40")
		draw_circle(c + Vector2(-r * 0.75, 0), r, col)
		draw_circle(c + Vector2(r * 0.75, 0), r, col)
		draw_colored_polygon(PackedVector2Array([c + Vector2(-r * 1.72, 6), c + Vector2(r * 1.72, 6), c + Vector2(0, r * 2.2)]), col)
		var font: Font = UiKit.FONT_HEAVY
		var txt := str(hp)
		var fs := 40
		var tw := font.get_string_size(txt, HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x
		var pos := Vector2(w / 2 - tw / 2, 76)
		draw_string_outline(font, pos, txt, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, 8, Color("#3a2030"))
		draw_string(font, pos, txt, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, Color("#ffe9a8") if hp > 0 else Color("#ff8a8a"))


## 별 칸(세로). filled 개는 채운 별.
static func star_column(filled: int, slots: int) -> VBoxContainer:
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 0)
	col.tooltip_text = "별 %d / %d" % [filled, slots]
	col.mouse_filter = Control.MOUSE_FILTER_PASS
	if filled > 0:
		var badge := PanelContainer.new()
		badge.add_theme_stylebox_override("panel", UiKit.box(UiKit.GOLD, Color("#8a5d00"), 2, 10, 2))
		var l := UiKit.label(str(filled), "", 20, UiKit.INK)
		l.add_theme_font_override("font", UiKit.FONT_HEAVY)
		l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		l.custom_minimum_size = Vector2(32, 0)
		badge.add_child(l)
		col.add_child(badge)
	for i in slots:
		var s := UiKit.label("★" if i < filled else "★", "", 30, UiKit.GOLD if i < filled else Color(1, 1, 1, 0.12))
		s.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		s.mouse_filter = Control.MOUSE_FILTER_IGNORE
		col.add_child(s)
	return col


## 덱·버린 더미 타일(카드 뒷면 또는 빈 칸 + 장수)
static func pile_tile(count: int, back: bool, tip: String) -> PanelContainer:
	var p := PanelContainer.new()
	p.add_theme_stylebox_override("panel", UiKit.box(Color("#f6f2fb"), Color("#ffffff"), 0, 10, 6))
	p.custom_minimum_size = Vector2(78, 108)
	p.tooltip_text = tip
	p.mouse_filter = Control.MOUSE_FILTER_PASS
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 4)
	p.add_child(col)
	var inner := PanelContainer.new()
	inner.size_flags_vertical = Control.SIZE_EXPAND_FILL
	if back and count > 0:
		inner.add_theme_stylebox_override("panel", UiKit.box(UiKit.PURPLE, Color("#3b2a6a"), 2, 6, 0))
		var mark := UiKit.label("◆", "", 26, Color(1, 1, 1, 0.75))
		mark.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		mark.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		inner.add_child(mark)
	else:
		inner.add_theme_stylebox_override("panel", UiKit.box(Color("#e6e0ee"), Color.TRANSPARENT, 0, 6, 0))
	col.add_child(inner)
	var n := UiKit.label(str(count), "", 20, UiKit.INK)
	n.add_theme_font_override("font", UiKit.FONT_HEAVY)
	n.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	n.mouse_filter = Control.MOUSE_FILTER_IGNORE
	col.add_child(n)
	return p
