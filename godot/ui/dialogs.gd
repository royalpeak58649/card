class_name Dialogs
extends RefCounted
## 화면 위에 덮는 창(규칙 안내·확인 창). host 의 맨 위에 붙이고 닫으면 지운다.

const RULES := [
	["나만의 덱을 키우는 카드 대전", "돌 7장과 권총 3장으로 시작합니다. 매 차례 카드를 사용하고 거래소에서 더 좋은 카드를 사서, 상대보다 강한 덱을 만들어 보세요. 구매한 카드는 보통 버린 더미로 들어가고, 뽑을 덱이 비면 버린 더미를 섞어 다시 뽑습니다."],
	["준비 · 캐릭터와 거래소 입고", "캐릭터를 고른 뒤 진영·전용 카드 후보 8종 중 4종을 거래소에 입고합니다. 시작 덱에 넣는 것이 아니라, 전투 중 구매할 카드 종류를 정하는 단계입니다. 중립 카드 2종과 상대가 입고한 카드도 함께 거래소에 놓입니다."],
	["① 행동 → ② 구매 → ③ 공격", "행동단계에는 행동카드로 효과를 준비합니다. 행동력 비용을 확인하세요. 구매단계에는 재화카드를 내서 원을 얻고 구매 횟수 안에서 카드를 삽니다. 공격단계에는 무기를 내고, 단계를 끝내면 모아 둔 피해가 한 번에 적용됩니다."],
	["별을 모아 강화하기", "매 차례 별이 1개 생깁니다(선공 첫 차례 제외). 보통 최대 5개까지 모을 수 있습니다. 별 1개로 이번 차례만 강화(최대 3장), 별 4개로 영구 강화할 수 있습니다. 기본 공급 카드는 강화할 수 없고, 일부 캐릭터는 별 최대치나 비용이 다릅니다."],
	["라운드가 끝날 때 승패 판정", "체력이 0 이하가 되어도 후공의 차례가 끝날 때까지 전투는 계속됩니다. 한쪽만 0 이하면 상대 승리, 둘 다 0 이하면 남은 체력이 높은 쪽 승리입니다. 체력까지 같으면 무승부입니다."],
	["첫 전투의 팁", "은괴로 구매력을 늘리고 소총으로 공격을 강화해 보세요. 소총과 돌격소총은 양쪽 플레이어를 합쳐 처음 구매되는 2장까지 1원 더 비쌉니다. 빚이 있으면 구매 전에 원으로 갚아야 합니다."],
]


## 반투명 덮개 + 가운데 창. content 는 창 안에 들어갈 노드.
static func modal(host: Control, title: String, content: Control, width := 640.0) -> Control:
	var overlay := UiKit.panel("Overlay")
	overlay.set_anchors_preset(Control.PRESET_FULL_RECT)
	overlay.mouse_filter = Control.MOUSE_FILTER_STOP
	var center := CenterContainer.new()
	overlay.add_child(center)
	var win := UiKit.panel("Modal")
	win.custom_minimum_size.x = width
	center.add_child(win)
	var col := UiKit.vbox(12)
	win.add_child(col)
	if title != "":
		col.add_child(UiKit.label(title, "TitleLabel", 24, UiKit.PURPLE_DARK))
	col.add_child(content)
	host.add_child(overlay)
	return overlay


static func guide(host: Control, lead := "", on_start := Callable(), start_label := "시작하기") -> Control:
	var col := UiKit.vbox(10)
	if lead != "":
		col.add_child(UiKit.wrap_label(lead, 16, UiKit.MUTED))
	var scroll := ScrollContainer.new()
	scroll.custom_minimum_size = Vector2(0, 420)
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	var inner := UiKit.vbox(12)
	inner.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scroll.add_child(inner)
	for r in RULES:
		var item := UiKit.vbox(2)
		item.add_child(UiKit.bold(r[0], 17, UiKit.PURPLE_DARK))
		item.add_child(UiKit.wrap_label(r[1], 15))
		inner.add_child(item)
	col.add_child(scroll)
	var row := UiKit.hbox(10)
	row.alignment = BoxContainer.ALIGNMENT_END
	col.add_child(row)
	# 람다는 지역 변수를 값으로 잡으므로 창 노드는 배열에 담아 넘긴다.
	var holder := [null]
	var close := func(): holder[0].queue_free()
	if on_start.is_null():
		row.add_child(UiKit.button("닫기", close, true))
	else:
		row.add_child(UiKit.button("닫기", close))
		row.add_child(UiKit.button(start_label, func():
			holder[0].queue_free()
			on_start.call(), true))
	holder[0] = modal(host, "플레이 가이드", col, 720)
	return holder[0]


static func confirm(host: Control, title: String, message: String, ok_label: String, on_ok: Callable) -> Control:
	var col := UiKit.vbox(16)
	col.add_child(UiKit.wrap_label(message, 16))
	var row := UiKit.hbox(10)
	row.alignment = BoxContainer.ALIGNMENT_END
	col.add_child(row)
	var holder := [null]
	row.add_child(UiKit.button("취소", func(): holder[0].queue_free()))
	row.add_child(UiKit.button(ok_label, func():
		holder[0].queue_free()
		on_ok.call(), true))
	holder[0] = modal(host, title, col, 480)
	return holder[0]
