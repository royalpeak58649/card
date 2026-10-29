class_name CampaignUi
extends RefCounted
## 모험 모드 화면 조각. 웹판 client/campaign.js 와 같은 구성:
## 진행 막대 · 이번 보스 소개 · 보유 증강 · 스테이지 결과(증강 3택 보상 · 다음 스테이지 / 처음부터 다시).

const RARITY_LABELS := {1: "소소한 증강", 2: "강력한 증강", 3: "매우 강력한 증강"}
const RARITY_COLORS := {1: Color("#5b7fc7"), 2: Color("#b425d6"), 3: Color("#e09a10")}
const RARITY_BG := {1: Color("#eef3ff"), 2: Color("#f8eafc"), 3: Color("#fff6dc")}

const STORY_TITLE := "달빛 아래, 은빛 발톱이 움직인다"
const STORY := [
	"숲을 피로 물들이는 은빛 야수들이 모습을 드러냈습니다. 숲 어귀에서 야수왕의 둥지까지, 다섯 전장을 돌파하세요. 승리 후 얻은 증강은 남은 모험 내내 당신의 힘이 됩니다.",
	"스테이지마다 체력이 회복되고 캐릭터와 덱을 새로 준비합니다. 패배하면 1스테이지부터 다시 시작합니다. 출혈 중 피해를 받으면 추가 피해 1(행동카드 피해가 섞이면 2)을 받고 출혈이 사라집니다. 방어로 피해를 전부 막으면 출혈은 유지됩니다.",
]


static func stars(n: int) -> String:
	return "★".repeat(n)


## 스테이지 진행 막대(1~N)
static func stage_track(cv: Dictionary) -> HBoxContainer:
	var row := UiKit.hbox(0)
	row.alignment = BoxContainer.ALIGNMENT_CENTER
	var stages: Array = cv["stages"]
	for i in stages.size():
		var st: Dictionary = stages[i]
		var current: bool = i == int(cv["stageIndex"])
		var cleared: bool = st["cleared"]
		var node := UiKit.vbox(4)
		node.custom_minimum_size.x = 110
		var circle := PanelContainer.new()
		var bg := UiKit.GREEN if cleared else (UiKit.PURPLE if current else Color.WHITE)
		var border := UiKit.GREEN if cleared else (UiKit.PURPLE_DARK if current else Color("#c9c0e0"))
		var cs := UiKit.box(bg, border, 3, 22, 0)
		circle.add_theme_stylebox_override("panel", cs)
		circle.custom_minimum_size = Vector2(44, 44)
		circle.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
		var num := UiKit.bold("✓" if cleared else str(i + 1), 18, Color.WHITE if (cleared or current) else UiKit.MUTED)
		num.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		num.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		circle.add_child(num)
		node.add_child(circle)
		var nm := UiKit.label(st["name"], "", 13, UiKit.PURPLE_DARK if current else UiKit.MUTED)
		nm.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		if current:
			nm.add_theme_font_override("font", UiKit.FONT_BOLD)
		node.add_child(nm)
		node.tooltip_text = "%s · %s (체력 %d)" % [st["name"], st["bossName"], int(st["bossMaxHp"])]
		row.add_child(node)
		if i < stages.size() - 1:
			var link := ColorRect.new()
			link.color = UiKit.GREEN if cleared else Color("#d6cfe8")
			link.custom_minimum_size = Vector2(36, 4)
			link.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
			var wrap := MarginContainer.new()
			wrap.add_theme_constant_override("margin_top", 20)
			wrap.add_child(link)
			row.add_child(wrap)
	return row


## 보유 증강(접어 두는 목록). compact 면 한 줄짜리 칩으로만 보여 준다.
static func owned_augments(cv: Dictionary, compact := false) -> Control:
	var ids: Array = cv.get("augments", [])
	if compact:
		var row := UiKit.hbox(6)
		row.add_child(UiKit.bold("보유 증강 %d개" % ids.size(), 14, UiKit.MUTED))
		if ids.is_empty():
			row.add_child(UiKit.label("스테이지 돌파 후 증강을 얻습니다", "MutedLabel", 13))
		for id in ids:
			row.add_child(augment_chip(id))
		return row
	var box := UiKit.vbox(6)
	box.add_child(UiKit.bold("보유 증강 %d개" % ids.size(), 15, UiKit.PURPLE_DARK))
	if ids.is_empty():
		box.add_child(UiKit.label("스테이지 돌파 후 증강을 얻습니다.", "MutedLabel", 14))
	for id in ids:
		var a := GameData.augment(id)
		var r := int(a["rarity"])
		var line := UiKit.hbox(8)
		line.add_child(UiKit.bold("%s %s" % [stars(r), a["name"]], 15, RARITY_COLORS[r]))
		var t := UiKit.wrap_label(a["text"], 14)
		t.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		line.add_child(t)
		box.add_child(line)
	return box


static func augment_chip(id: String) -> PanelContainer:
	var a := GameData.augment(id)
	var r := int(a["rarity"])
	var p := UiKit.panel("", UiKit.box(RARITY_BG[r], RARITY_COLORS[r], 2, 8, 4))
	p.add_child(UiKit.bold("%s %s" % [stars(r), a["name"]], 13, RARITY_COLORS[r]))
	p.tooltip_text = a["text"]
	p.mouse_filter = Control.MOUSE_FILTER_PASS
	return p


## 캐릭터 선택·입고 화면 위에 붙는 머리말: 진행 막대 + 이번 보스 소개 + 보유 증강
static func header(cv: Dictionary) -> PanelContainer:
	var p := UiKit.panel("WhitePanel")
	var col := UiKit.vbox(10)
	p.add_child(col)
	var top := UiKit.hbox(16)
	col.add_child(top)
	top.add_child(UiKit.label(cv["name"], "HeaderLabel", 20, UiKit.PURPLE_DARK))
	top.add_child(UiKit.spacer())
	top.add_child(stage_track(cv))

	var st: Dictionary = cv["stages"][int(cv["stageIndex"])]
	var boss := GameData.character(st["bossId"])
	var boss_row := UiKit.hbox(14)
	col.add_child(boss_row)
	var info := UiKit.vbox(4)
	info.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var head := UiKit.hbox(10)
	head.add_child(UiKit.bold("스테이지 %d · %s" % [int(cv["stageIndex"]) + 1, st["name"]], 15, UiKit.MUTED))
	head.add_child(UiKit.bold(st["bossName"], 20, UiKit.INK))
	head.add_child(UiKit.bold("♥ %d" % int(st["bossMaxHp"]), 17, UiKit.RED))
	info.add_child(head)
	if st.get("intro", "") != "":
		info.add_child(UiKit.wrap_label(st["intro"], 14, UiKit.INK))
	if boss.get("abilityText", "") != "":
		info.add_child(UiKit.wrap_label(boss["abilityText"], 14, UiKit.PURPLE_DARK))
	info.add_child(owned_augments(cv, true))
	info.add_child(UiKit.label("스테이지마다 캐릭터와 입고 카드를 새로 고릅니다. 지면 1스테이지부터 다시 시작합니다.", "MutedLabel", 13))
	boss_row.add_child(info)
	# 보스 시작 덱의 야수 카드 미리보기(돌·권총 제외)
	var deck = boss.get("startDeck")
	if deck is Array:
		var seen := {}
		var cards := UiKit.hbox(6)
		for id in deck:
			if seen.has(id) or GameData.card(id).get("basic") == true:
				continue
			seen[id] = true
			cards.add_child(CardView.make(id, {"mini": true, "clickable": false}))
		if cards.get_child_count() > 0:
			boss_row.add_child(cards)
	return p


## 스테이지가 끝났을 때의 화면. on_action(action) 으로 chooseAugment·nextStage·restart 를 보낸다.
static func result_screen(cv: Dictionary, on_action: Callable, on_leave: Callable, top_right: Array) -> Control:
	var root := UiKit.vbox(0)
	root.add_child(UiKit.top_bar(cv["name"], top_right))
	var scroll := ScrollContainer.new()
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	root.add_child(scroll)
	var center := CenterContainer.new()
	center.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scroll.add_child(center)
	var margin := MarginContainer.new()
	for side in ["top", "bottom"]:
		margin.add_theme_constant_override("margin_" + side, 18)
	center.add_child(margin)
	var box := UiKit.panel("WhitePanel")
	box.custom_minimum_size.x = 860
	margin.add_child(box)
	var col := UiKit.vbox(14)
	box.add_child(col)
	col.add_child(stage_track(cv))

	var status: String = cv["status"]
	var idx := int(cv["stageIndex"])
	var st: Dictionary = cv["stages"][idx]
	var v: Dictionary = cv["match"]
	var title := ""
	var sub := ""
	var color := UiKit.PURPLE
	if status == "stageWon":
		title = "스테이지 %d 돌파!" % (idx + 1)
		sub = "%s을(를) 쓰러뜨렸습니다." % st["bossName"]
	elif status == "cleared":
		title = "작전 완료!"
		sub = "%s의 모든 은빛 야수를 소탕했습니다." % cv["name"]
	else:
		title = "무승부… 작전 실패" if v.get("draw") == true else "작전 실패"
		sub = "스테이지 %d %s에서 쓰러졌습니다. 1스테이지부터 다시 시작합니다." % [idx + 1, st["name"]]
		color = UiKit.RED
	var tl := UiKit.label(title, "TitleLabel", 40, color)
	tl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	col.add_child(tl)
	var sl := UiKit.label(sub, "", 17, UiKit.INK)
	sl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	col.add_child(sl)
	var g = v.get("game")
	if g != null:
		var me: Dictionary = g["players"][0]
		var boss: Dictionary = g["players"][1]
		var hp := UiKit.label("내 체력 %d / %d · %s %d / %d · %d턴" % [int(me["hp"]), int(me["maxHp"]), st["bossName"], int(boss["hp"]), int(boss["maxHp"]), int(g["turn"])], "MutedLabel", 15)
		hp.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		col.add_child(hp)

	var choices: Array = cv.get("augmentChoices", [])
	if status == "stageWon" and not choices.is_empty():
		col.add_child(_reward(choices, on_action))
	elif status == "stageWon" and not cv["augments"].is_empty():
		var latest := GameData.augment(cv["augments"].back())
		var r := int(latest["rarity"])
		var got := UiKit.bold("%s %s 획득!" % [stars(r), latest["name"]], 20, RARITY_COLORS[r])
		got.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		col.add_child(got)

	col.add_child(HSeparator.new())
	col.add_child(owned_augments(cv))

	var history: Array = cv.get("history", [])
	if not history.is_empty():
		col.add_child(UiKit.bold("지금까지의 기록", 15, UiKit.PURPLE_DARK))
		for hrow in history:
			var s: Dictionary = cv["stages"][int(hrow["stageIndex"])]
			var who: String = GameData.character(hrow["characterId"]).get("name", str(hrow["characterId"])) if GameData.has_character(hrow["characterId"]) else str(hrow["characterId"])
			var mark: String = {"win": "승리", "draw": "무승부"}.get(hrow["result"], "패배")
			col.add_child(UiKit.label("%d. %s — %s · %s (%d턴)" % [int(hrow["stageIndex"]) + 1, s["name"], who, mark, int(hrow["turns"])], "", 14, UiKit.INK))

	var buttons := UiKit.hbox(12)
	buttons.alignment = BoxContainer.ALIGNMENT_CENTER
	col.add_child(buttons)
	if status == "stageWon":
		var next := UiKit.button("다음 스테이지 ▶", func(): on_action.call({"type": "nextStage"}), true, not choices.is_empty())
		next.custom_minimum_size = Vector2(200, 50)
		if not choices.is_empty():
			next.tooltip_text = "먼저 증강을 고르세요"
		buttons.add_child(next)
	else:
		var again := UiKit.button("처음부터 다시", func(): on_action.call({"type": "restart"}), true)
		again.custom_minimum_size = Vector2(200, 50)
		buttons.add_child(again)
	var leave := UiKit.button("로비로", on_leave)
	leave.custom_minimum_size = Vector2(120, 50)
	buttons.add_child(leave)
	return root


static func _reward(choices: Array, on_action: Callable) -> Control:
	var col := UiKit.vbox(10)
	var rarity := int(GameData.augment(choices[0])["rarity"])
	var h := UiKit.bold("%s %s" % [stars(rarity), RARITY_LABELS[rarity]], 22, RARITY_COLORS[rarity])
	h.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	col.add_child(h)
	var hint := UiKit.label("하나를 고르세요. 남은 모험의 모든 전투에 적용됩니다.", "MutedLabel", 15)
	hint.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	col.add_child(hint)
	var grid := UiKit.hbox(12)
	grid.alignment = BoxContainer.ALIGNMENT_CENTER
	col.add_child(grid)
	for cid in choices:
		var id: String = cid
		var a := GameData.augment(id)
		var r := int(a["rarity"])
		var b := Button.new()
		b.focus_mode = Control.FOCUS_NONE
		b.custom_minimum_size = Vector2(250, 170)
		b.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
		b.add_theme_stylebox_override("normal", UiKit.box(RARITY_BG[r], RARITY_COLORS[r], 3, 16, 14))
		b.add_theme_stylebox_override("hover", UiKit.box(RARITY_BG[r].lightened(0.4), RARITY_COLORS[r], 5, 16, 14))
		b.add_theme_stylebox_override("pressed", UiKit.box(RARITY_BG[r].darkened(0.05), RARITY_COLORS[r], 5, 16, 14))
		b.pressed.connect(func(): on_action.call({"type": "chooseAugment", "augmentId": id}))
		var inner := UiKit.vbox(6)
		inner.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT, Control.PRESET_MODE_KEEP_SIZE, 14)
		inner.mouse_filter = Control.MOUSE_FILTER_IGNORE
		b.add_child(inner)
		for node in [UiKit.bold(stars(r), 18, RARITY_COLORS[r]), UiKit.bold(a["name"], 19, UiKit.INK)]:
			node.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
			node.mouse_filter = Control.MOUSE_FILTER_IGNORE
			inner.add_child(node)
		var t := UiKit.wrap_label(a["text"], 14, UiKit.INK)
		t.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		t.size_flags_vertical = Control.SIZE_EXPAND_FILL
		t.mouse_filter = Control.MOUSE_FILTER_IGNORE
		inner.add_child(t)
		var pick := UiKit.bold("선택하기", 15, RARITY_COLORS[r])
		pick.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		pick.mouse_filter = Control.MOUSE_FILTER_IGNORE
		inner.add_child(pick)
		grid.add_child(b)
	var odds := UiKit.label("보상 등급 확률 · 1성 92% · 2성 7.8% · 3성 0.2%", "MutedLabel", 13)
	odds.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	col.add_child(odds)
	return col
