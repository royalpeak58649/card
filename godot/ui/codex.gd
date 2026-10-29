class_name Codex
extends RefCounted
## 전략 도감. 웹판 client/codex.js 와 같은 구성:
## 카드·캐릭터·보스·증강 탭, 이름·효과 검색, 진영 필터(증강 제외), 종류 필터(카드만).
## 데이터는 엔진 등록 데이터(GameData)를 그대로 읽는다.

const CATEGORIES := [["cards", "카드"], ["characters", "캐릭터"], ["enemies", "보스"], ["augments", "증강"]]
const TYPES := [["", "모든 종류"], ["money", "재화"], ["action", "행동"], ["weapon", "무기"]]


class State:
	var category := "cards"
	var query := ""
	var faction := ""
	var type := ""


## 카드 → 소속(진영 카드 / 캐릭터 전용 / 기본 공급 / 중립)
static func affiliation(card_id: String) -> Dictionary:
	for cid in GameData.all_character_ids(true):
		var ch := GameData.character(cid)
		if card_id in ch["cardIds"]:
			return {"id": ch["factionId"], "label": "%s · %s 전용" % [GameData.faction(ch["factionId"])["name"], ch["name"]]}
	for fid in GameData.all_faction_ids(true):
		if card_id in GameData.faction(fid)["cardIds"]:
			return {"id": fid, "label": GameData.faction(fid)["name"]}
	if GameData.card(card_id).get("basic") == true:
		return {"id": "basic", "label": "기본 공급"}
	return {"id": "neutral", "label": "중립"}


static func _matches(query: String, parts: Array) -> bool:
	if query == "":
		return true
	return " ".join(PackedStringArray(parts)).to_lower().contains(query.to_lower())


## 조건에 맞는 항목들(화면과 시험 도구가 같이 쓴다). 각 항목은 { kind, id }.
static func entries(st: State) -> Array:
	var out := []
	var q := st.query.strip_edges()
	match st.category:
		"cards":
			for id in GameData.all_card_ids():
				var c := GameData.card(id)
				var g := affiliation(id)
				if st.faction != "" and st.faction != g["id"]:
					continue
				if st.type != "" and st.type != c["type"]:
					continue
				if not _matches(q, [c["name"], c.get("text", ""), c.get("upgradedText", ""), g["label"]]):
					continue
				out.append({"kind": "card", "id": id})
		"characters", "enemies":
			for id in GameData.all_character_ids(true):
				var ch := GameData.character(id)
				if (ch.get("enemy") == true) != (st.category == "enemies"):
					continue
				var f := GameData.faction(ch["factionId"])
				if st.faction != "" and st.faction != f["id"]:
					continue
				if not _matches(q, [ch["name"], ch.get("abilityText", ""), f["name"]]):
					continue
				out.append({"kind": "character", "id": id})
		"augments":
			for a in GameData.augments():
				if not _matches(q, [a["name"], a["text"], "%d성" % int(a["rarity"])]):
					continue
				out.append({"kind": "augment", "id": a["id"]})
	return out


## 도감 창을 연다. host 위에 덮는 창을 붙이고 돌려준다.
static func open(host: Control) -> Control:
	var st := State.new()
	var col := UiKit.vbox(10)
	col.add_child(UiKit.label("카드와 캐릭터, 모험의 적과 증강을 살펴보고 다음 전투를 준비하세요.", "MutedLabel", 15))

	var tabs := UiKit.hbox(8)
	col.add_child(tabs)
	var controls := UiKit.hbox(8)
	col.add_child(controls)
	var search := LineEdit.new()
	search.placeholder_text = "이름이나 효과 검색"
	search.clear_button_enabled = true
	search.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	controls.add_child(search)
	var faction := OptionButton.new()
	faction.focus_mode = Control.FOCUS_NONE
	var faction_ids := ["", "basic", "neutral"]
	faction.add_item("모든 진영")
	faction.add_item("기본 공급")
	faction.add_item("중립")
	for fid in GameData.all_faction_ids(true):
		faction_ids.append(fid)
		faction.add_item(GameData.faction(fid)["name"])
	controls.add_child(faction)
	var type := OptionButton.new()
	type.focus_mode = Control.FOCUS_NONE
	for t in TYPES:
		type.add_item(t[1])
	controls.add_child(type)

	var count := UiKit.label("", "MutedLabel", 14)
	col.add_child(count)
	var scroll := ScrollContainer.new()
	scroll.custom_minimum_size = Vector2(0, 470)
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	col.add_child(scroll)
	var grid := GridContainer.new()
	grid.columns = 2
	grid.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	grid.add_theme_constant_override("h_separation", 12)
	grid.add_theme_constant_override("v_separation", 12)
	scroll.add_child(grid)

	var footer := UiKit.hbox(8)
	footer.alignment = BoxContainer.ALIGNMENT_END
	col.add_child(footer)

	var tab_buttons := []
	var render := func():
		for i in tab_buttons.size():
			tab_buttons[i].theme_type_variation = "PrimaryButton" if CATEGORIES[i][0] == st.category else ""
		type.visible = st.category == "cards"
		faction.visible = st.category != "augments"
		UiKit.clear(grid)
		var list := entries(st)
		count.text = "%d개 항목" % list.size()
		for e in list:
			grid.add_child(_entry(e))
		if list.is_empty():
			grid.add_child(UiKit.label("조건에 맞는 항목이 없습니다. 검색어나 필터를 바꿔 보세요.", "MutedLabel", 15))
		scroll.scroll_vertical = 0
	for c in CATEGORIES:
		var id: String = c[0]
		var b := UiKit.button(c[1], func():
			st.category = id
			render.call())
		b.custom_minimum_size.x = 90
		tabs.add_child(b)
		tab_buttons.append(b)
	search.text_changed.connect(func(t):
		st.query = t
		render.call())
	faction.item_selected.connect(func(i):
		st.faction = faction_ids[i]
		render.call())
	type.item_selected.connect(func(i):
		st.type = TYPES[i][0]
		render.call())

	var holder := [null]
	footer.add_child(UiKit.button("닫기", func(): holder[0].queue_free(), true))
	holder[0] = Dialogs.modal(host, "전략 도감", col, 1080)
	holder[0].set_meta("codex_state", st)
	holder[0].set_meta("codex_render", render)
	holder[0].set_meta("codex_count", count)
	render.call()
	search.grab_focus.call_deferred()
	return holder[0]


static func _entry(e: Dictionary) -> Control:
	var p := UiKit.panel("WhitePanel")
	p.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	match e["kind"]:
		"card":
			var c := GameData.card(e["id"])
			var g := affiliation(e["id"])
			var row := UiKit.hbox(12)
			p.add_child(row)
			row.add_child(CardView.make(e["id"], {"mini": true, "clickable": false}))
			var info := UiKit.vbox(4)
			info.size_flags_horizontal = Control.SIZE_EXPAND_FILL
			info.add_child(UiKit.bold(c["name"], 17))
			var meta := "%s · %s · %d원" % [g["label"], GameData.type_label(c["type"]), int(c["cost"])]
			if c["type"] == "action":
				meta += " · 행동력 %d" % int(Rules.nz(c.get("actionCost"), 0))
			info.add_child(UiKit.wrap_label(meta, 13, UiKit.MUTED))
			info.add_child(UiKit.wrap_label("기본 · " + c.get("text", ""), 14))
			if c.get("basic") == true:
				info.add_child(UiKit.wrap_label("기본 공급 카드는 강화할 수 없습니다.", 13, UiKit.MUTED))
			else:
				info.add_child(UiKit.wrap_label("★ 강화 · " + str(c.get("upgradedText", c.get("text", ""))), 14, Color("#8a5d00")))
			if c.get("surchargeFirst") != null:
				info.add_child(UiKit.label("처음 구매되는 %d장은 +1원" % int(c["surchargeFirst"]), "MutedLabel", 13))
			row.add_child(info)
		"character":
			var ch := GameData.character(e["id"])
			var info := UiKit.vbox(4)
			p.add_child(info)
			info.add_child(UiKit.bold(ch["name"], 18))
			info.add_child(UiKit.label("%s · 최대 체력 %d" % [GameData.faction(ch["factionId"])["name"], int(ch["maxHp"])], "MutedLabel", 13))
			info.add_child(UiKit.wrap_label(ch.get("abilityText", ""), 14, UiKit.PURPLE_DARK))
			var cards: Array = ch.get("startDeck", ch["cardIds"]) if ch.get("startDeck") != null else ch["cardIds"]
			var seen := {}
			for cid in cards:
				if seen.has(cid):
					continue
				seen[cid] = true
				var c := GameData.card(cid)
				info.add_child(UiKit.wrap_label("· %s — %s" % [c["name"], c.get("text", "")], 13))
		"augment":
			var a := GameData.augment(e["id"])
			var r := int(a["rarity"])
			p.add_theme_stylebox_override("panel", UiKit.box(CampaignUi.RARITY_BG[r], CampaignUi.RARITY_COLORS[r], 2, 14, 12))
			var info := UiKit.vbox(4)
			p.add_child(info)
			info.add_child(UiKit.bold(CampaignUi.stars(r), 15, CampaignUi.RARITY_COLORS[r]))
			info.add_child(UiKit.bold(a["name"], 17))
			info.add_child(UiKit.wrap_label(a["text"], 14))
	return p
