class_name GameData
extends RefCounted
## 카드·진영·캐릭터·증강·캠페인·AI 가치 데이터.
## JS 엔진의 등록 데이터를 tools/export_data.mjs 가 data/game_data.json 으로 내보낸 것을 읽는다.

const DATA_PATH := "res://data/game_data.json"

static var _d: Dictionary = {}
static var _augments_by_id: Dictionary = {}


static func _ensure() -> void:
	if not _d.is_empty():
		return
	var text := ""
	var f := FileAccess.open(DATA_PATH, FileAccess.READ)
	if f != null:
		text = f.get_as_text()
	else:
		var res = load(DATA_PATH)
		if res is JSON:
			text = JSON.stringify(res.data)
	var parsed = JSON.parse_string(text)
	if typeof(parsed) != TYPE_DICTIONARY:
		push_error("게임 데이터를 읽지 못했습니다: %s" % DATA_PATH)
		return
	_d = intify(parsed)
	for a in _d["augments"]:
		_augments_by_id[a["id"]] = a


## JSON 숫자는 모두 float 로 읽히므로 정수 값은 int 로 바꾼다(JS 와 같은 정수 연산을 위해).
static func intify(v):
	match typeof(v):
		TYPE_FLOAT:
			if is_finite(v) and v == floor(v) and absf(v) < 9.0e15:
				return int(v)
			return v
		TYPE_DICTIONARY:
			var out := {}
			for k in v:
				out[k] = intify(v[k])
			return out
		TYPE_ARRAY:
			var arr := []
			for x in v:
				arr.append(intify(x))
			return arr
	return v


static func raw() -> Dictionary:
	_ensure()
	return _d


static func has_card(id: String) -> bool:
	_ensure()
	return _d["cards"].has(id)


static func card(id: String) -> Dictionary:
	_ensure()
	var c = _d["cards"].get(id)
	if c == null:
		push_error("알 수 없는 카드: %s" % id)
		return {}
	return c


static func all_card_ids() -> Array:
	_ensure()
	return _d["cards"].keys()


static func has_character(id) -> bool:
	_ensure()
	return id is String and _d["characters"].has(id)


static func character(id: String) -> Dictionary:
	_ensure()
	var c = _d["characters"].get(id)
	if c == null:
		push_error("알 수 없는 캐릭터: %s" % id)
		return {}
	return c


## 등록된 캐릭터 id. 기본은 적(enemy) 캐릭터를 뺀다.
static func all_character_ids(include_enemies := false) -> Array:
	_ensure()
	var out := []
	for id in _d["characters"]:
		if include_enemies or _d["characters"][id].get("enemy") != true:
			out.append(id)
	return out


static func faction(id: String) -> Dictionary:
	_ensure()
	var f = _d["factions"].get(id)
	if f == null:
		push_error("알 수 없는 진영: %s" % id)
		return {}
	return f


static func all_faction_ids(include_enemies := false) -> Array:
	_ensure()
	var out := []
	for id in _d["factions"]:
		if include_enemies or _d["factions"][id].get("enemy") != true:
			out.append(id)
	return out


static func neutral_card_ids() -> Array:
	_ensure()
	return _d["neutralCardIds"]


static func basic_pile_sizes() -> Dictionary:
	_ensure()
	return _d["basicPileSizes"]


static func augments() -> Array:
	_ensure()
	return _d["augments"]


static func has_augment_def(id: String) -> bool:
	_ensure()
	return _augments_by_id.has(id)


static func augment(id: String) -> Dictionary:
	_ensure()
	return _augments_by_id.get(id, {})


static func campaign(id: String) -> Dictionary:
	_ensure()
	return _d["campaigns"].get(id, {})


static func all_campaign_ids() -> Array:
	_ensure()
	return _d["campaigns"].keys()


static func ai_tuned() -> Dictionary:
	_ensure()
	return _d["aiValues"]["tuned"]


static func ai_default_value(card_id: String) -> float:
	_ensure()
	return float(_d["aiValues"]["defaults"].get(card_id, 0.0))


static func ai_weights() -> Dictionary:
	_ensure()
	return _d["aiWeights"]


static func ai_speeds() -> Array:
	_ensure()
	return _d["aiSpeeds"]


static func default_ai_speed() -> String:
	_ensure()
	return _d["defaultAiSpeed"]


static func recommendations(character_id: String) -> Array:
	_ensure()
	return _d["recommendations"].get(character_id, [])


## 캐릭터가 고를 수 있는 후보 카드 id 목록(진영 카드 5 + 캐릭터 카드 3).
static func candidates(character_id: String) -> Array:
	var ch := character(character_id)
	var out: Array = []
	out.append_array(faction(ch["factionId"])["cardIds"])
	out.append_array(ch["cardIds"])
	return out


static func type_label(type: String) -> String:
	match type:
		"money":
			return "재화"
		"weapon":
			return "무기"
		"action":
			return "행동"
	return type
