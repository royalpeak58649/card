class_name Rules
extends RefCounted
## 대전 규칙 엔진. JS 의 engine/rng.js · state.js · conditions.js · effects.js · choices.js ·
## turn.js · augments.js(전투 부분) 를 한 파일로 옮긴 것이다.
##
## - 게임 상태는 JSON 직렬화 가능한 Dictionary/Array 만 쓴다(JS 와 같은 키 이름).
## - 모든 조작은 apply_action() 하나로. 실패하면 오류 문구를 돌려주고 상태를 통째로 되돌린다.
## - GDScript 에는 예외가 없으므로 내부 실패는 fail() 로 표시하고, 호출한 쪽이 failed() 를 확인해 즉시 돌아간다.

const HAND_SIZE := 5
const TEMP_UPGRADE_COST := 1
const PERM_UPGRADE_COST := 4
const MAX_TEMP_UPGRADES := 3
const MAX_STARS := 5
## JS 의 Infinity 대신 쓰는 큰 정수
const BIG := 1 << 60
const M32 := 0xFFFFFFFF

## 마지막 실패 문구("" 이면 성공)
static var error: String = ""
## 실패한 조작을 되돌리기 위한 스냅샷을 뜰지. AI 모의 실행(버리는 복사본)에서만 끈다.
static var atomic: bool = true


static func fail(msg: String) -> void:
	if error == "":
		error = msg


static func failed() -> bool:
	return error != ""


## JS 의 `a ?? b`
static func nz(v, dv):
	return dv if typeof(v) == TYPE_NIL else v


static func set_atomic(on: bool) -> bool:
	var prev := atomic
	atomic = on
	return prev


# ─────────────────────────── 난수(mulberry32, JS 와 같은 결과) ───────────────────────────

static func _imul(a: int, b: int) -> int:
	a &= M32
	b &= M32
	var al := a & 0xFFFF
	var ah := a >> 16
	var bl := b & 0xFFFF
	var bh := b >> 16
	return (al * bl + (((ah * bl + al * bh) & 0xFFFF) << 16)) & M32


## [0, 1) 실수. 상태는 s.rngState 에 32비트 정수로 저장된다.
static func next_random(s: Dictionary) -> float:
	var st: int = (int(s["rngState"]) + 0x6d2b79f5) & M32
	s["rngState"] = st
	var t := st
	t = _imul(t ^ (t >> 15), t | 1)
	t = (t ^ ((t + _imul(t ^ (t >> 7), t | 61)) & M32)) & M32
	return float((t ^ (t >> 14)) & M32) / 4294967296.0


static func random_int(s: Dictionary, n: int) -> int:
	return int(floor(next_random(s) * n))


## Fisher-Yates 셔플(제자리)
static func shuffle_in_place(s: Dictionary, arr: Array) -> Array:
	var i := arr.size() - 1
	while i > 0:
		var j := random_int(s, i + 1)
		var tmp = arr[i]
		arr[i] = arr[j]
		arr[j] = tmp
		i -= 1
	return arr


# ─────────────────────────── 상태 ───────────────────────────

static func create_card_instance(game: Dictionary, card_id: String) -> Dictionary:
	var uid := "c%d" % int(game["nextUid"])
	game["nextUid"] = int(game["nextUid"]) + 1
	return {"uid": uid, "cardId": card_id, "upgraded": false}


## 새 게임 상태. players: [{ id, name, characterId?, maxHp? }] 2명
static func create_game(seed: int, players: Array) -> Dictionary:
	if players.size() != 2:
		push_error("플레이어는 정확히 2명이어야 합니다")
		return {}
	var plist := []
	for p in players:
		var character_id = p.get("characterId")
		var max_hp: int = int(GameData.character(character_id)["maxHp"]) if character_id != null else int(p.get("maxHp", 0))
		plist.append({
			"id": p["id"],
			"name": p["name"],
			"characterId": character_id,
			"maxHp": max_hp,
			"hp": max_hp,
			"stars": 0,
			"drawPile": [],
			"hand": [],
			"discard": [],
			"inPlay": [],
			"actions": 0,
			"buys": 0,
			"coins": 0,
			"debt": 0,
			"defense": 0,
			"abilityUsed": false,
			"abilityUses": 0,
			"turnsTaken": 0,
			"bleed": false,
		})
	var game := {
		"seed": seed,
		"rngState": seed & M32,
		"nextUid": 1,
		"turn": 1,
		"phase": "setup",
		"activeIndex": 0,
		"firstPlayerIndex": 0,
		"winner": null,
		"draw": false,
		"players": plist,
		"market": {},
		"trash": [],
		"log": [],
	}
	var sizes := GameData.basic_pile_sizes()
	for card_id in sizes:
		game["market"][card_id] = {"count": int(sizes[card_id]), "bought": 0}

	game["firstPlayerIndex"] = random_int(game, 2)
	game["activeIndex"] = game["firstPlayerIndex"]

	for i in plist.size():
		var player: Dictionary = plist[i]
		var start_deck = null
		if player["characterId"] != null:
			start_deck = GameData.character(player["characterId"]).get("startDeck")
		if start_deck is Array:
			for card_id in start_deck:
				player["drawPile"].append(create_card_instance(game, card_id))
		else:
			for k in 7:
				player["drawPile"].append(create_card_instance(game, "stone"))
			for k in 3:
				player["drawPile"].append(create_card_instance(game, "pistol"))
		shuffle_in_place(game, player["drawPile"])
		draw_cards(game, i, 5)
	return game


static func add_market_pile(game: Dictionary, card_id: String, count := 8) -> void:
	if game["market"].has(card_id):
		fail("이미 시장에 있는 카드: %s" % card_id)
		return
	if not GameData.has_card(card_id):
		fail("알 수 없는 카드: %s" % card_id)
		return
	game["market"][card_id] = {"count": count, "bought": 0}


## drawPile 맨 끝에서 한 장씩 뽑는다. 비면 discard 를 섞어 옮긴다.
static func draw_cards(game: Dictionary, pi: int, n: int) -> int:
	var player: Dictionary = game["players"][pi]
	var drawn := 0
	for i in n:
		if player["drawPile"].is_empty():
			if player["discard"].is_empty():
				break
			player["drawPile"] = shuffle_in_place(game, player["discard"])
			player["discard"] = []
		player["hand"].append(player["drawPile"].pop_back())
		drawn += 1
	return drawn


## 현재 구매가. pi >= 0 이고 그 플레이어 차례면 차례 보정까지 적용한다.
static func get_purchase_price(game: Dictionary, card_id: String, pi := -1) -> int:
	var cdef := GameData.card(card_id)
	var slot = game["market"].get(card_id)
	if slot == null:
		fail("시장에 없는 카드: %s" % card_id)
		return 0
	var price := int(cdef["cost"])
	if cdef.has("surchargeFirst") and int(slot["bought"]) < int(cdef["surchargeFirst"]):
		price += 1
	var ts = game.get("turnState")
	if pi >= 0 and ts != null and pi == int(game["activeIndex"]):
		price -= int(nz(ts["mods"].get("marketDiscount"), 0))
		price -= _first_weapon_discount(game, card_id)
	return maxi(0, price)


static func _first_weapon_discount(game: Dictionary, card_id: String) -> int:
	var ts = game.get("turnState")
	if ts == null:
		return 0
	var discount := int(nz(ts["mods"].get("firstWeaponDiscount"), 0))
	if discount <= 0:
		return 0
	if GameData.card(card_id)["type"] != "weapon":
		return 0
	for id in nz(ts.get("bought"), []):
		if GameData.card(id)["type"] == "weapon":
			return 0
	return discount


# ─────────────────────────── 조건·통계 ───────────────────────────

const STAT_KEYS := ["moneyPlayed", "weaponsPlayed", "actionsPlayed", "starsSpent", "damageDealt",
	"tempUpgrades", "upgradedPlayed", "defenseGained"]
const HAND_TYPES := ["money", "weapon", "action"]


static func count_upgraded_owned(game: Dictionary, pi: int) -> int:
	var player: Dictionary = game["players"][pi]
	var count := 0
	for zone in [player["hand"], player["drawPile"], player["discard"], player["inPlay"]]:
		for c in zone:
			if c.get("upgraded") == true and c.get("tempUpgraded") != true:
				count += 1
	return count


static func _max_same(card_ids: Array) -> int:
	var counts := {}
	var mx := 0
	for id in card_ids:
		counts[id] = int(counts.get(id, 0)) + 1
		if counts[id] > mx:
			mx = counts[id]
	return mx


static func get_stat(game: Dictionary, pi: int, stat: String) -> int:
	var ts: Dictionary = nz(game.get("turnState"), {})
	match stat:
		"boughtWeapons":
			var n := 0
			for id in nz(ts.get("bought"), []):
				if GameData.card(id)["type"] == "weapon":
					n += 1
			return n
		"stars":
			return int(nz(game["players"][pi].get("stars"), 0))
		"upgradedOwned":
			return count_upgraded_owned(game, pi)
		"maxSameAction":
			return _max_same(nz(ts.get("playedActionIds"), []))
		"debt":
			return int(nz(game["players"][pi].get("debt"), 0))
		"debtHalf":
			return int(nz(game["players"][pi].get("debt"), 0)) / 2
		"bleed":
			return 1 if game["players"][pi].get("bleed") == true else 0
		"oppBleed":
			return 1 if game["players"][1 - pi].get("bleed") == true else 0
	if not stat in STAT_KEYS:
		fail("알 수 없는 조건 stat: %s" % stat)
		return 0
	return int(nz(ts.get(stat), 0))


static func eval_cond(game: Dictionary, ctx: Dictionary, cond) -> bool:
	if typeof(cond) != TYPE_DICTIONARY:
		fail("잘못된 조건: %s" % JSON.stringify(cond))
		return false
	if cond.has("not"):
		return not eval_cond(game, ctx, cond["not"])
	if cond.has("all"):
		for c in cond["all"]:
			if not eval_cond(game, ctx, c):
				return false
		return true
	if cond.has("any"):
		for c in cond["any"]:
			if eval_cond(game, ctx, c):
				return true
		return false
	if cond.has("handHasNoType"):
		var type: String = cond["handHasNoType"]
		if not type in HAND_TYPES:
			fail("알 수 없는 카드 종류: %s" % type)
			return false
		for c in game["players"][ctx["playerIndex"]]["hand"]:
			if GameData.card(c["cardId"])["type"] == type:
				return false
		return true
	if cond.has("opponentHpAtMostHalf"):
		var opp: Dictionary = game["players"][1 - int(ctx["playerIndex"])]
		return int(opp["hp"]) * 2 <= int(opp["maxHp"])
	if cond.has("stat"):
		var value := get_stat(game, ctx["playerIndex"], cond["stat"])
		if cond.has("gte") and not (value >= cond["gte"]):
			return false
		if cond.has("lte") and not (value <= cond["lte"]):
			return false
		if cond.has("eq") and not (value == cond["eq"]):
			return false
		return true
	fail("알 수 없는 조건: %s" % JSON.stringify(cond))
	return false


# ─────────────────────────── 효과 ───────────────────────────

static func max_stars_of(game: Dictionary, pi: int) -> int:
	var character_id = game["players"][pi].get("characterId")
	if character_id == null or character_id == "":
		return MAX_STARS
	var ch := GameData.character(character_id)
	var ms = ch.get("ability", {}).get("maxStars")
	if ms is int or ms is float:
		return int(ms)
	var fid = ch.get("factionId")
	if fid != null:
		var fm = GameData.faction(fid).get("maxStars")
		if fm is int or fm is float:
			return int(fm)
	return MAX_STARS


## 효과 목록을 순서대로 실행한다. 선택 대기가 생기면 남은 효과를 pending.rest 에 저장하고 돌아간다.
static func run_effects(game: Dictionary, ctx: Dictionary, effects) -> void:
	if not effects is Array:
		return
	var queue: Array = effects.duplicate()
	while not queue.is_empty():
		var effect = queue.pop_front()
		var op = effect.get("op") if effect is Dictionary else null
		if op == "if":
			var c := eval_cond(game, ctx, effect.get("cond"))
			if failed():
				return
			var branch = effect.get("then") if c else effect.get("else")
			if branch is Array:
				queue = branch + queue
			continue
		if op == "repeatPrevAction":
			var repeated = _prev_action_effects(game)
			if repeated != null:
				queue = repeated + queue
			continue
		_run_op(game, ctx, effect)
		if failed():
			return
		if game.get("pending") != null:
			game["pending"]["rest"] = queue + nz(game["pending"].get("rest"), [])
			return


static func _contains_repeat(effects) -> bool:
	if not effects is Array:
		return false
	for e in effects:
		if not e is Dictionary:
			continue
		if e.get("op") == "repeatPrevAction":
			return true
		if e.get("op") == "if" and (_contains_repeat(e.get("then")) or _contains_repeat(e.get("else"))):
			return true
	return false


static func _prev_action_effects(game: Dictionary):
	var prev = nz(game.get("turnState"), {}).get("prevAction")
	if prev == null:
		return null
	var cdef := GameData.card(prev["cardId"])
	var effects = cdef.get("upgradedEffects") if prev.get("upgraded") == true and cdef.has("upgradedEffects") else cdef.get("effects")
	if not effects is Array or effects.is_empty():
		return null
	if _contains_repeat(effects):
		return null
	return effects


static func _matches_filter(cdef: Dictionary, filter) -> bool:
	if filter == null or filter == "":
		return true
	return cdef["type"] == filter


static func _index_by_uid(zone: Array, uid) -> int:
	for i in zone.size():
		if zone[i]["uid"] == uid:
			return i
	return -1


static func _take_from_hand(game: Dictionary, pi: int, uid) -> Variant:
	var hand: Array = game["players"][pi]["hand"]
	var idx := _index_by_uid(hand, uid)
	if idx < 0:
		fail("손에 없는 카드: %s" % str(uid))
		return null
	var c = hand[idx]
	hand.remove_at(idx)
	return c


static func _take_from_discard(game: Dictionary, pi: int, uid) -> Variant:
	var discard: Array = game["players"][pi]["discard"]
	var idx := _index_by_uid(discard, uid)
	if idx < 0:
		fail("버린 더미에 없는 카드: %s" % str(uid))
		return null
	var c = discard[idx]
	discard.remove_at(idx)
	return c


static func _put_card(game: Dictionary, pi: int, card: Dictionary, to) -> void:
	var player: Dictionary = game["players"][pi]
	match to:
		"hand":
			player["hand"].append(card)
		"discard":
			player["discard"].append(card)
		"deckTop":
			# drawCards 는 배열 끝에서 꺼내므로 끝에 넣으면 맨 위가 된다.
			player["drawPile"].append(card)
		_:
			fail("알 수 없는 이동 위치: %s" % str(to))


static func _market_options(game: Dictionary, filter, max_cost: int) -> Array:
	var out := []
	for card_id in game["market"]:
		var slot = game["market"][card_id]
		if slot == null or int(slot["count"]) <= 0:
			continue
		var cdef := GameData.card(card_id)
		if not _matches_filter(cdef, filter):
			continue
		if int(cdef["cost"]) <= max_cost:
			out.append(card_id)
	return out


## 효과를 낸 카드(ctx.cardUid)가 행동카드인지
static func _source_is_action(game: Dictionary, ctx: Dictionary) -> bool:
	var uid = ctx.get("cardUid")
	if uid == null or uid == "":
		return false
	var zones := []
	for p in game["players"]:
		zones.append_array([p["hand"], p["inPlay"], p["discard"], p["drawPile"]])
	zones.append(game["trash"])
	for zone in zones:
		for c in zone:
			if c["uid"] == uid:
				return GameData.card(c["cardId"])["type"] == "action"
	return false


static func _add_attack_damage(game: Dictionary, ctx: Dictionary, amount: int) -> void:
	var ts: Dictionary = game["turnState"]
	ts["attackDamage"] = int(ts["attackDamage"]) + amount
	if _source_is_action(game, ctx):
		ts["actionDamage"] = int(nz(ts.get("actionDamage"), 0)) + amount


static func _n(effect: Dictionary, key := "n", dv := 0) -> int:
	return int(nz(effect.get(key), dv))


static func _run_op(game: Dictionary, ctx: Dictionary, e: Dictionary) -> void:
	var pi: int = ctx["playerIndex"]
	var player: Dictionary = game["players"][pi]
	match e.get("op"):
		"gainCoins":
			player["coins"] = int(player["coins"]) + _n(e)
		"gainCoinsPerStat":
			var value := get_stat(game, pi, e["stat"])
			player["coins"] = int(player["coins"]) + mini(_n(e, "max", BIG), _n(e, "per", 1) * value)
		"damage":
			_add_attack_damage(game, ctx, _n(e))
		"draw":
			draw_cards(game, pi, _n(e))
		"gainActions":
			player["actions"] = int(player["actions"]) + _n(e)
		"gainBuys":
			player["buys"] = int(player["buys"]) + _n(e)
		"gainStars":
			player["stars"] = mini(max_stars_of(game, pi), int(player["stars"]) + _n(e))
		"trashFromHand":
			var options := []
			for c in player["hand"]:
				if _matches_filter(GameData.card(c["cardId"]), e.get("filter")):
					options.append(c["uid"])
			request_choice(game, ctx, {"kind": "trashFromHand", "prompt": "제거할 카드를 고르세요",
				"options": options, "min": _n(e, "min"), "max": _n(e)})
		"retrieveFromDiscard":
			var options := []
			for c in player["discard"]:
				if _matches_filter(GameData.card(c["cardId"]), e.get("filter")):
					options.append(c["uid"])
			request_choice(game, ctx, {"kind": "retrieveFromDiscard", "prompt": "가져올 카드를 고르세요",
				"options": options, "min": _n(e, "min"), "max": _n(e), "data": {"to": nz(e.get("to"), "hand")}})
		"trashFromDiscard":
			var options := []
			for c in player["discard"]:
				options.append(c["uid"])
			request_choice(game, ctx, {"kind": "trashFromDiscard", "prompt": "제거할 카드를 고르세요",
				"options": options, "min": 0, "max": _n(e)})
		"gainFromMarket":
			request_choice(game, ctx, {"kind": "gainFromMarket", "prompt": "얻을 카드를 고르세요",
				"options": _market_options(game, e.get("filter"), _n(e, "maxCost")), "min": 1, "max": 1,
				"data": {"to": nz(e.get("to"), "discard"), "debt": _n(e, "debt")}})
		"exchangeForWeapon":
			var options := []
			for c in player["hand"]:
				if GameData.card(c["cardId"])["type"] == "money":
					options.append(c["uid"])
			request_choice(game, ctx, {"kind": "exchangeForWeapon", "prompt": "바꿀 재화카드를 고르세요",
				"options": options, "min": 0, "max": 1,
				"data": {"plus": _n(e, "plus"), "allowDiscard": e.get("allowDiscard") == true}})
		"addMod":
			var mods: Dictionary = game["turnState"]["mods"]
			mods[e["key"]] = int(nz(mods.get(e["key"]), 0)) + _n(e)
		"addAttackBonus":
			var bonus := {}
			for k in ["flat", "perWeapon", "perAction", "perStat", "cap", "cond"]:
				if e.has(k) and e[k] != null:
					bonus[k] = e[k]
			if _source_is_action(game, ctx):
				bonus["fromAction"] = true
			game["turnState"]["attackBonuses"].append(bonus)
		"addEndTrigger":
			var trig := {}
			if e.has("cond") and e["cond"] != null:
				trig["cond"] = e["cond"]
			trig["effects"] = nz(e.get("effects"), [])
			trig["ctx"] = {"playerIndex": pi, "cardUid": ctx.get("cardUid")}
			game["turnState"]["endTriggers"].append(trig)
		"trashSelfAtCleanup":
			game["turnState"]["trashAtCleanup"].append(ctx.get("cardUid"))
		"gainCard":
			var slot = game["market"].get(e["cardId"])
			if slot == null or int(slot["count"]) <= 0:
				return
			slot["count"] = int(slot["count"]) - 1
			_put_card(game, pi, create_card_instance(game, e["cardId"]), nz(e.get("to"), "discard"))
		"gainDebt":
			player["debt"] = int(nz(player.get("debt"), 0)) + _n(e)
		"reduceDebt":
			player["debt"] = maxi(0, int(nz(player.get("debt"), 0)) - _n(e))
		"clearDebt":
			player["debt"] = 0
		"transferDebt":
			var opp: Dictionary = game["players"][1 - pi]
			var amount := mini(_n(e, "max", BIG), int(nz(player.get("debt"), 0)))
			if amount <= 0:
				return
			player["debt"] = int(nz(player.get("debt"), 0)) - amount
			opp["debt"] = int(nz(opp.get("debt"), 0)) + amount
		"debtToDamage":
			var amount := mini(_n(e, "max", BIG), int(nz(player.get("debt"), 0)))
			if amount <= 0:
				return
			player["debt"] = int(nz(player.get("debt"), 0)) - amount
			_add_attack_damage(game, ctx, amount * _n(e, "per", 1))
		"heal":
			player["hp"] = mini(int(player["maxHp"]), int(player["hp"]) + _n(e))
		"addDefense":
			var amount := 0
			if e.has("perStat") and e["perStat"] != null:
				var per := int(nz(e["perStat"].get("per"), 0))
				var value := get_stat(game, pi, e["perStat"]["stat"])
				amount = mini(_n(e, "max", BIG), per * value)
			else:
				amount = _n(e)
			player["defense"] = int(nz(player.get("defense"), 0)) + amount
			if game.get("turnState") != null:
				game["turnState"]["defenseGained"] = int(nz(game["turnState"].get("defenseGained"), 0)) + amount
		"damagePerStat":
			var value := get_stat(game, pi, e["stat"])
			var amount := mini(_n(e, "max", BIG), _n(e, "per", 1) * value) + _n(e, "plus")
			_add_attack_damage(game, ctx, amount)
		"discardFromHand":
			var options := []
			for c in player["hand"]:
				options.append(c["uid"])
			request_choice(game, ctx, {"kind": "discardFromHand", "prompt": "버릴 카드를 고르세요",
				"options": options, "min": _n(e, "min"), "max": _n(e),
				"data": {"thenIfAny": nz(e.get("thenIfAny"), [])}})
		"freeUpgrade":
			var options := []
			for c in player["hand"]:
				if can_upgrade_card(c):
					options.append(c["uid"])
			request_choice(game, ctx, {"kind": "freeUpgrade", "prompt": "무료로 강화할 카드를 고르세요",
				"options": options, "min": 0, "max": _n(e)})
		"payStars":
			var n := _n(e)
			if int(player["stars"]) < n:
				return
			request_choice(game, ctx, {"kind": "payStars", "prompt": "별 %d개를 쓸까요?" % n,
				"options": ["pay", "skip"], "min": 1, "max": 1,
				"data": {"n": n, "then": nz(e.get("then"), [])}})
		"reorderTop":
			var n := maxi(0, _n(e))
			var pile: Array = player["drawPile"]
			var top := pile.slice(maxi(0, pile.size() - n))
			if top.is_empty():
				return
			var uids := []
			for c in top:
				uids.append(c["uid"])
			var trash_up_to := maxi(0, _n(e, "trashUpTo"))
			if trash_up_to > 0:
				request_choice(game, ctx, {"kind": "reorderTopTrash", "prompt": "제거할 카드를 고르세요",
					"options": uids, "min": 0, "max": trash_up_to, "data": {"top": uids.duplicate()}})
				return
			_request_reorder(game, ctx, uids)
		"opponentMillTop":
			var opp: Dictionary = game["players"][1 - pi]
			for i in _n(e):
				if opp["drawPile"].is_empty():
					if opp["discard"].is_empty():
						break
					opp["drawPile"] = shuffle_in_place(game, opp["discard"])
					opp["discard"] = []
				opp["discard"].append(opp["drawPile"].pop_back())
		"applyBleed":
			var timing = nz(e.get("timing"), "now")
			if timing == "now":
				game["players"][1 - pi]["bleed"] = true
			elif timing == "afterAttack":
				game["turnState"]["bleedOnHit"] = true
			else:
				fail("알 수 없는 출혈 시점: %s" % str(timing))
		"gainRandomCard":
			var pool = nz(e.get("pool"), [])
			if not pool is Array or pool.is_empty():
				return
			var to = nz(e.get("to"), "discard")
			for i in _n(e, "n", 1):
				var card_id: String = pool[random_int(game, pool.size())]
				_put_card(game, pi, create_card_instance(game, card_id), to)
		_:
			fail("알 수 없는 효과: %s" % str(e.get("op")))


static func _request_reorder(game: Dictionary, ctx: Dictionary, uids: Array) -> void:
	if uids.size() <= 1:
		return
	request_choice(game, ctx, {"kind": "reorderTop", "prompt": "덱 맨 위 순서를 정하세요(먼저 고른 카드가 맨 위)",
		"options": uids, "min": uids.size(), "max": uids.size()})


static func can_upgrade_card(card: Dictionary) -> bool:
	var cdef := GameData.card(card["cardId"])
	return cdef.get("basic") != true and cdef.get("upgradedEffects") != null and card.get("upgraded") != true


# ─────────────────────────── 선택 대기 ───────────────────────────

## options 가 비어 있으면 아무 것도 하지 않는다.
static func request_choice(game: Dictionary, ctx: Dictionary, spec: Dictionary) -> void:
	var options: Array = (spec.get("options", []) as Array).duplicate()
	if options.is_empty():
		return
	var mn := mini(int(nz(spec.get("min"), 0)), options.size())
	var mx := mini(int(nz(spec.get("max"), options.size())), options.size())
	game["pending"] = {
		"playerIndex": int(nz(spec.get("playerIndex"), ctx["playerIndex"])),
		"kind": spec["kind"],
		"prompt": spec["prompt"],
		"options": options,
		"min": mn,
		"max": mx,
		"data": nz(spec.get("data"), {}),
		"ctx": ctx,
		"rest": [],
	}


static func resolve_choice(game: Dictionary, pi: int, selection) -> void:
	var pending = game.get("pending")
	if pending == null:
		fail("대기 중인 선택이 없습니다")
		return
	if pi != int(pending["playerIndex"]):
		fail("선택할 차례가 아닙니다")
		return
	if not selection is Array:
		fail("선택은 배열이어야 합니다")
		return
	if selection.size() < int(pending["min"]) or selection.size() > int(pending["max"]):
		fail("선택 개수가 맞지 않습니다: %d" % selection.size())
		return
	var seen := {}
	for item in selection:
		if not item in pending["options"]:
			fail("선택할 수 없는 항목: %s" % str(item))
			return
		if seen.has(item):
			fail("중복된 선택: %s" % str(item))
			return
		seen[item] = true

	game["pending"] = null
	_handle_choice(game, pending, selection)
	if failed():
		return
	if game.get("pending") != null:
		game["pending"]["rest"] = game["pending"]["rest"] + pending["rest"]
	else:
		run_effects(game, pending["ctx"], pending["rest"])


static func _handle_choice(game: Dictionary, pending: Dictionary, selection: Array) -> void:
	var pi: int = pending["playerIndex"]
	var data: Dictionary = pending["data"]
	match pending["kind"]:
		"trashFromHand":
			for uid in selection:
				var c = _take_from_hand(game, pi, uid)
				if failed():
					return
				game["trash"].append(c)
		"retrieveFromDiscard":
			for uid in selection:
				var c = _take_from_discard(game, pi, uid)
				if failed():
					return
				_put_card(game, pi, c, data["to"])
				if failed():
					return
		"trashFromDiscard":
			for uid in selection:
				var c = _take_from_discard(game, pi, uid)
				if failed():
					return
				game["trash"].append(c)
		"gainFromMarket":
			var card_id: String = selection[0]
			var slot = game["market"].get(card_id)
			if slot == null or int(slot["count"]) <= 0:
				fail("시장 더미가 비었습니다: %s" % card_id)
				return
			slot["count"] = int(slot["count"]) - 1
			_put_card(game, pi, create_card_instance(game, card_id), data["to"])
			if failed():
				return
			var debt := int(nz(data.get("debt"), 0))
			if debt > 0:
				var player: Dictionary = game["players"][pi]
				player["debt"] = int(nz(player.get("debt"), 0)) + debt
		"exchangeForWeapon":
			if selection.is_empty():
				return
			var uid = selection[0]
			var hand: Array = game["players"][pi]["hand"]
			var idx := _index_by_uid(hand, uid)
			if idx < 0:
				fail("손에 없는 카드: %s" % str(uid))
				return
			var nd: Dictionary = data.duplicate()
			nd["uid"] = uid
			nd["cost"] = int(GameData.card(hand[idx]["cardId"])["cost"])
			if data.get("allowDiscard") == true:
				request_choice(game, pending["ctx"], {"kind": "exchangeForWeaponPlace",
					"prompt": "카드를 어디로 보낼지 고르세요", "options": ["trash", "discard"],
					"min": 1, "max": 1, "data": nd})
			else:
				_finish_exchange(game, pending["ctx"], nd, "trash")
		"exchangeForWeaponPlace":
			_finish_exchange(game, pending["ctx"], data, selection[0])
		"discardFromHand":
			for uid in selection:
				var c = _take_from_hand(game, pi, uid)
				if failed():
					return
				game["players"][pi]["discard"].append(c)
			var then_if_any: Array = nz(data.get("thenIfAny"), [])
			if selection.size() > 0 and then_if_any.size() > 0:
				pending["rest"] = then_if_any + pending["rest"]
		"freeUpgrade":
			var hand: Array = game["players"][pi]["hand"]
			for uid in selection:
				var idx := _index_by_uid(hand, uid)
				if idx < 0:
					fail("손에 없는 카드: %s" % str(uid))
					return
				# 별을 쓰지 않으므로 starsSpent·tempUpgrades 는 늘리지 않는다.
				hand[idx]["upgraded"] = true
				hand[idx]["tempUpgraded"] = true
		"payStars":
			if selection[0] != "pay":
				return
			var player: Dictionary = game["players"][pi]
			var n := int(nz(data.get("n"), 0))
			player["stars"] = int(player["stars"]) - n
			game["turnState"]["starsSpent"] = int(game["turnState"]["starsSpent"]) + n
			var then: Array = nz(data.get("then"), [])
			if then.size() > 0:
				pending["rest"] = then + pending["rest"]
		"reorderTopTrash":
			var player: Dictionary = game["players"][pi]
			for uid in selection:
				var idx := _index_by_uid(player["drawPile"], uid)
				if idx < 0:
					fail("뽑을 덱에 없는 카드: %s" % str(uid))
					return
				game["trash"].append(player["drawPile"][idx])
				player["drawPile"].remove_at(idx)
			var remaining := []
			for uid in nz(data.get("top"), []):
				if not uid in selection:
					remaining.append(uid)
			_request_reorder(game, pending["ctx"], remaining)
		"reorderTop":
			var player: Dictionary = game["players"][pi]
			var cards := []
			for uid in selection:
				var idx := _index_by_uid(player["drawPile"], uid)
				if idx < 0:
					fail("뽑을 덱에 없는 카드: %s" % str(uid))
					return
				cards.append(player["drawPile"][idx])
				player["drawPile"].remove_at(idx)
			# selection[0] 이 맨 위가 되도록 뒤에서부터 끝에 쌓는다.
			var i := cards.size() - 1
			while i >= 0:
				player["drawPile"].append(cards[i])
				i -= 1
		_:
			fail("알 수 없는 선택: %s" % str(pending["kind"]))


static func _finish_exchange(game: Dictionary, ctx: Dictionary, data: Dictionary, place) -> void:
	var pi: int = ctx["playerIndex"]
	var c = _take_from_hand(game, pi, data["uid"])
	if failed():
		return
	if place == "discard":
		game["players"][pi]["discard"].append(c)
	else:
		game["trash"].append(c)
	request_choice(game, ctx, {"kind": "gainFromMarket", "prompt": "얻을 무기를 고르세요",
		"options": _market_options(game, "weapon", int(data["cost"]) + int(nz(data.get("plus"), 0))),
		"min": 1, "max": 1, "data": {"to": "hand"}})


# ─────────────────────────── 증강(전투 적용) ───────────────────────────

static func has_augment(game: Dictionary, pi: int, id: String) -> bool:
	return id in nz(game["players"][pi].get("augmentIds"), [])


static func apply_augments(game: Dictionary, augment_ids: Array) -> void:
	var player: Dictionary = game["players"][0]
	player["augmentIds"] = augment_ids.duplicate()
	for id in augment_ids:
		var a := GameData.augment(id)
		player["maxHp"] = int(player["maxHp"]) + int(a.get("maxHp", 0))
		player["hp"] = int(player["hp"]) + int(a.get("maxHp", 0))
		player["stars"] = int(player["stars"]) + int(a.get("stars", 0))


static func _augment_turn_start(game: Dictionary, pi: int) -> void:
	var player: Dictionary = game["players"][pi]
	var ctx := {"playerIndex": pi, "cardUid": ""}
	for id in nz(player.get("augmentIds"), []):
		var a := GameData.augment(id)
		if int(player["turnsTaken"]) == 1:
			run_effects(game, ctx, a.get("openingEffects"))
		run_effects(game, ctx, a.get("startEffects"))
	if has_augment(game, pi, "quick_hands") and int(player["turnsTaken"]) == 1:
		player["actions"] = int(player["actions"]) + 1
		draw_cards(game, pi, 1)
	if has_augment(game, pi, "supply_pouch") and int(player["turnsTaken"]) <= 3:
		player["coins"] = int(player["coins"]) + 1
	if has_augment(game, pi, "second_wind") and int(player["hp"]) * 2 <= int(player["maxHp"]):
		player["hp"] = mini(int(player["maxHp"]), int(player["hp"]) + 3)


static func _augment_extra_action_runs(game: Dictionary, pi: int, cdef: Dictionary) -> int:
	if cdef["type"] != "action" or int(nz(cdef.get("actionCost"), 0)) < 1:
		return 0
	if has_augment(game, pi, "chronocrown") and not game["turnState"].get("augmentActionEchoUsed", false):
		game["turnState"]["augmentActionEchoUsed"] = true
		return 2
	return 0


static func _augment_attack_bonuses(game: Dictionary, pi: int) -> Array:
	var out := []
	for id in nz(game["players"][pi].get("augmentIds"), []):
		var b = GameData.augment(id).get("attackBonus")
		if b != null:
			out.append(b)
	return out


# ─────────────────────────── 차례 진행 ───────────────────────────

static func _create_turn_state() -> Dictionary:
	return {
		"attackDamage": 0,
		"moneyPlayed": 0,
		"weaponsPlayed": 0,
		"actionsPlayed": 0,
		"bought": [],
		"starsSpent": 0,
		"tempUpgrades": 0,
		"upgradedPlayed": 0,
		"damageDealt": 0,
		"mods": {
			"weaponBuyRefund": 0,
			"marketDiscount": 0,
			"actionDamageBonus": 0,
			"firstWeaponDiscount": 0,
			"ignoreDebt": 0,
		},
		"abilityActivated": false,
		"attackBonuses": [],
		"endTriggers": [],
		"trashAtCleanup": [],
		"opponentStarGiven": false,
		"defenseGained": 0,
		"playedActionIds": [],
		"lastAction": null,
		"prevAction": null,
		"echoUsed": false,
		"actionDamage": 0,
		"bleedOnHit": false,
		"bleedTriggered": 0,
	}


static func _ability(game: Dictionary, pi: int) -> Dictionary:
	var character_id = game["players"][pi].get("characterId")
	if character_id == null or character_id == "":
		return {}
	return GameData.character(character_id).get("ability", {})


static func _start_turn(game: Dictionary) -> void:
	var ai: int = game["activeIndex"]
	var player: Dictionary = game["players"][ai]
	player["turnsTaken"] = int(nz(player.get("turnsTaken"), 0)) + 1
	# 경기 첫 차례(선공의 첫 차례)에는 별을 받지 않는다.
	if int(game["turn"]) != 1:
		player["stars"] = mini(max_stars_of(game, ai), int(player["stars"]) + 1)
	player["actions"] = 1
	player["buys"] = 1
	player["coins"] = 0
	game["turnState"] = _create_turn_state()
	game["phase"] = "action"
	_run_character_triggers(game, ai, "startTriggers", "차례 시작 효과에는 선택형 효과를 쓸 수 없습니다")
	if failed():
		return
	_augment_turn_start(game, ai)


## 게임을 시작한다(setup 단계에서만).
static func start_game(game: Dictionary) -> String:
	error = ""
	if game["phase"] != "setup":
		return "게임을 시작할 수 없는 단계: %s" % game["phase"]
	game["activeIndex"] = game["firstPlayerIndex"]
	game["pending"] = null
	game["draw"] = false
	_start_turn(game)
	return error


static func _assert_can_act(game: Dictionary, pi: int, action: Dictionary) -> void:
	if game["phase"] == "gameOver":
		fail("게임이 끝났습니다")
		return
	if game["phase"] == "setup":
		fail("게임이 아직 시작되지 않았습니다")
		return
	if action.get("type") == "choose":
		if game.get("pending") == null:
			fail("대기 중인 선택이 없습니다")
			return
		if pi != int(game["pending"]["playerIndex"]):
			fail("선택할 차례가 아닙니다")
			return
		return
	if game.get("pending") != null:
		fail("먼저 선택을 끝내야 합니다")
		return
	if pi != int(game["activeIndex"]):
		fail("차례가 아닙니다")
		return


static func _assert_phase_for_card(game: Dictionary, cdef: Dictionary) -> void:
	var t: String = cdef["type"]
	if t == "action" and game["phase"] != "action":
		fail("행동카드는 행동단계에만 낼 수 있습니다")
	elif t == "money" and game["phase"] != "buy":
		fail("재화카드는 구매단계에만 낼 수 있습니다")
	elif t == "weapon" and game["phase"] != "attack":
		fail("무기카드는 공격단계에만 낼 수 있습니다")


static func _play_card(game: Dictionary, pi: int, uid) -> void:
	var player: Dictionary = game["players"][pi]
	var hand: Array = player["hand"]
	var idx := _index_by_uid(hand, uid)
	if idx < 0:
		fail("손에 없는 카드: %s" % str(uid))
		return
	var card: Dictionary = hand[idx]
	var cdef := GameData.card(card["cardId"])
	_assert_phase_for_card(game, cdef)
	if failed():
		return
	var action_cost := int(nz(cdef.get("actionCost"), 0)) if cdef["type"] == "action" else 0
	if action_cost > 0 and int(player["actions"]) < action_cost:
		fail("행동력이 부족합니다")
		return

	var ts: Dictionary = game["turnState"]
	player["actions"] = int(player["actions"]) - action_cost
	hand.remove_at(idx)
	player["inPlay"].append(card)

	# 낸 카드 수는 효과 실행 전에 센다(방금 낸 카드 자신도 조건에 포함된다).
	match cdef["type"]:
		"money":
			ts["moneyPlayed"] = int(ts["moneyPlayed"]) + 1
		"weapon":
			ts["weaponsPlayed"] = int(ts["weaponsPlayed"]) + 1
		"action":
			ts["actionsPlayed"] = int(ts["actionsPlayed"]) + 1
			ts["playedActionIds"].append(card["cardId"])
			ts["prevAction"] = ts["lastAction"]
			ts["lastAction"] = {"cardId": card["cardId"], "upgraded": card.get("upgraded") == true}
			_trigger_opponent_action_star(game, pi)
	if card.get("upgraded") == true:
		ts["upgradedPlayed"] = int(ts["upgradedPlayed"]) + 1

	var effects = cdef.get("upgradedEffects") if card.get("upgraded") == true and cdef.get("upgradedEffects") != null else cdef.get("effects")
	var doubled := _should_double_first_costly_action(game, pi, cdef, action_cost)
	if doubled:
		ts["echoUsed"] = true
	var extra_runs := _augment_extra_action_runs(game, pi, cdef)
	var runs := 1 + (1 if doubled else 0) + extra_runs
	var all_effects := []
	for r in runs:
		all_effects.append_array(effects)
	run_effects(game, {"playerIndex": pi, "cardUid": card["uid"]}, all_effects)
	if failed():
		return

	# 피해를 주는 행동카드는 차례 보정만큼 공격 피해를 더한다.
	var bonus := int(nz(ts["mods"].get("actionDamageBonus"), 0))
	if cdef["type"] == "action" and cdef.get("dealsDamage") == true and bonus > 0:
		ts["attackDamage"] = int(ts["attackDamage"]) + bonus
		ts["actionDamage"] = int(nz(ts.get("actionDamage"), 0)) + bonus


static func _should_double_first_costly_action(game: Dictionary, pi: int, cdef: Dictionary, action_cost: int) -> bool:
	if cdef["type"] != "action" or action_cost < 1:
		return false
	if game["turnState"].get("echoUsed") == true:
		return false
	var passive = _ability(game, pi).get("doubleFirstCostlyAction")
	if passive == null:
		return false
	return int(nz(game["players"][pi].get("turnsTaken"), 0)) >= int(nz(passive.get("minOwnTurn"), 0))


static func _trigger_opponent_action_star(game: Dictionary, pi: int) -> void:
	var ts: Dictionary = game["turnState"]
	if ts.get("opponentStarGiven") == true:
		return
	var passive = _ability(game, 1 - pi).get("opponentActionStar")
	if passive == null:
		return
	if int(ts["actionsPlayed"]) != int(passive["threshold"]):
		return
	var opp: Dictionary = game["players"][1 - pi]
	opp["stars"] = mini(max_stars_of(game, 1 - pi), int(opp["stars"]) + int(nz(passive.get("stars"), 0)))
	ts["opponentStarGiven"] = true


static func can_buy_cards(game: Dictionary, pi: int) -> bool:
	return _ability(game, pi).get("noBuy") != true


static func _buy(game: Dictionary, pi: int, card_id) -> void:
	if game["phase"] != "buy":
		fail("구매는 구매단계에만 할 수 있습니다")
		return
	var player: Dictionary = game["players"][pi]
	if not can_buy_cards(game, pi):
		fail("이 플레이어는 구매할 수 없습니다")
		return
	var ts: Dictionary = game["turnState"]
	if int(nz(player.get("debt"), 0)) > 0 and int(nz(ts["mods"].get("ignoreDebt"), 0)) <= 0:
		fail("빚을 다 갚기 전에는 구매할 수 없습니다")
		return
	if int(player["buys"]) < 1:
		fail("구매 횟수가 부족합니다")
		return
	if not card_id is String:
		fail("시장에 없는 카드: %s" % str(card_id))
		return
	var slot = game["market"].get(card_id)
	if slot == null:
		fail("시장에 없는 카드: %s" % card_id)
		return
	if int(slot["count"]) <= 0:
		fail("시장 더미가 비었습니다: %s" % card_id)
		return
	var price := get_purchase_price(game, card_id, pi)
	if int(player["coins"]) < price:
		fail("원이 부족합니다")
		return

	player["coins"] = int(player["coins"]) - price
	player["buys"] = int(player["buys"]) - 1
	slot["count"] = int(slot["count"]) - 1
	slot["bought"] = int(slot["bought"]) + 1
	var bought_card := create_card_instance(game, card_id)
	var cdef := GameData.card(card_id)
	if has_augment(game, pi, "celestial_forge") and cdef.get("basic") != true and cdef.get("upgradedEffects") != null:
		bought_card["upgraded"] = true
	player["discard"].append(bought_card)
	ts["bought"].append(card_id)

	# 무기 구매 환급은 한 차례에 한 번만 적용된다.
	var refund := int(nz(ts["mods"].get("weaponBuyRefund"), 0))
	if cdef["type"] == "weapon" and refund > 0:
		player["coins"] = int(player["coins"]) + refund
		ts["mods"]["weaponBuyRefund"] = 0


static func _pay_debt(game: Dictionary, pi: int, amount) -> int:
	if game["phase"] != "buy":
		fail("빚은 구매단계에만 갚을 수 있습니다")
		return 0
	var player: Dictionary = game["players"][pi]
	var debt := int(nz(player.get("debt"), 0))
	if debt <= 0:
		fail("갚을 빚이 없습니다")
		return 0
	if int(player["coins"]) <= 0:
		fail("원이 부족합니다")
		return 0
	if amount != null and not (amount >= 1):
		fail("갚을 양은 1 이상이어야 합니다")
		return 0
	var paid := mini(mini(int(nz(amount, BIG)), int(player["coins"])), debt)
	player["coins"] = int(player["coins"]) - paid
	player["debt"] = debt - paid
	return paid


static func perm_upgrade_cost(game: Dictionary, pi: int) -> int:
	var cost = _ability(game, pi).get("permUpgradeCost")
	return int(cost) if (cost is int or cost is float) else PERM_UPGRADE_COST


static func _upgrade_card(game: Dictionary, pi: int, uid, mode) -> void:
	if mode != "temp" and mode != "perm":
		fail("알 수 없는 강화 방식: %s" % str(mode))
		return
	var player: Dictionary = game["players"][pi]
	var idx := _index_by_uid(player["hand"], uid)
	if idx < 0:
		fail("손에 없는 카드: %s" % str(uid))
		return
	var card: Dictionary = player["hand"][idx]
	var cdef := GameData.card(card["cardId"])
	if cdef.get("basic") == true:
		fail("기본 카드는 강화할 수 없습니다: %s" % card["cardId"])
		return
	if cdef.get("upgradedEffects") == null:
		fail("강화판이 없는 카드: %s" % card["cardId"])
		return
	if card.get("upgraded") == true:
		fail("이미 강화된 카드: %s" % str(uid))
		return
	var cost := TEMP_UPGRADE_COST if mode == "temp" else perm_upgrade_cost(game, pi)
	if int(player["stars"]) < cost:
		fail("별이 부족합니다")
		return
	if mode == "temp" and int(game["turnState"]["tempUpgrades"]) >= MAX_TEMP_UPGRADES:
		fail("일시 강화는 한 차례에 3장까지입니다")
		return

	player["stars"] = int(player["stars"]) - cost
	game["turnState"]["starsSpent"] = int(game["turnState"]["starsSpent"]) + cost
	card["upgraded"] = true
	if mode == "temp":
		card["tempUpgraded"] = true
		game["turnState"]["tempUpgrades"] = int(game["turnState"]["tempUpgrades"]) + 1


static func _revert_temp_upgrades(game: Dictionary, pi: int) -> void:
	var player: Dictionary = game["players"][pi]
	for zone in [player["hand"], player["inPlay"], player["discard"], player["drawPile"], game["trash"]]:
		for c in zone:
			if c.get("tempUpgraded") == true:
				c["upgraded"] = false
				c.erase("tempUpgraded")


static func _resolve_attack(game: Dictionary, pi: int) -> void:
	var ts: Dictionary = game["turnState"]
	var total := int(ts["attackDamage"])
	var bonuses: Array = []
	bonuses.append_array(nz(ts.get("attackBonuses"), []))
	bonuses.append_array(nz(_ability(game, pi).get("attackBonuses"), []))
	bonuses.append_array(_augment_attack_bonuses(game, pi))
	var weapons := int(ts["weaponsPlayed"])
	var actions := int(ts["actionsPlayed"])
	var cond_ctx := {"playerIndex": pi, "cardUid": ""}
	var action_part := 0
	for bonus in bonuses:
		if bonus.get("cond") != null:
			var ok := eval_cond(game, cond_ctx, bonus["cond"])
			if failed():
				return
			if not ok:
				continue
		var amount := int(nz(bonus.get("flat"), 0)) + int(nz(bonus.get("perWeapon"), 0)) * weapons \
			+ int(nz(bonus.get("perAction"), 0)) * actions
		if bonus.get("perStat") != null:
			amount += int(nz(bonus["perStat"].get("per"), 0)) * get_stat(game, pi, bonus["perStat"]["stat"])
		if bonus.get("cap") != null:
			amount = mini(amount, int(bonus["cap"]))
		total += amount
		if bonus.get("fromAction") == true:
			action_part += amount

	if has_augment(game, pi, "apocalypse"):
		total *= 2

	var opp: Dictionary = game["players"][1 - pi]
	var defense := int(nz(opp.get("defense"), 0))
	var damage := maxi(0, total - defense)
	# 공격이 해결되면 상대 방어는 소모된다(무기를 내지 않았어도).
	opp["defense"] = 0

	# 출혈: 피해를 입으면 추가 피해를 받고 사라진다. 행동카드 피해가 섞이면 +2.
	if damage >= 1 and opp.get("bleed") == true:
		var action_damage := int(nz(ts.get("actionDamage"), 0)) + action_part
		var extra := 2 if action_damage > 0 else 1
		damage += extra
		opp["bleed"] = false
		ts["bleedTriggered"] = extra
	if ts.get("bleedOnHit") == true and damage >= 1:
		opp["bleed"] = true

	ts["damageDealt"] = damage
	# 승패는 라운드 끝에만 판정하므로 hp 는 음수 그대로 둔다.
	opp["hp"] = int(opp["hp"]) - damage


## 발동형 능력의 최대 사용 횟수
static func ability_max_uses(ability: Dictionary) -> int:
	var mu = ability.get("maxUses")
	if mu is int or mu is float:
		return int(mu)
	return 1 if ability.get("oncePerGame") == true else BIG


static func _activate_ability(game: Dictionary, pi: int) -> void:
	if not game["phase"] in ["action", "buy", "attack"]:
		fail("능력을 쓸 수 없는 단계: %s" % game["phase"])
		return
	var player: Dictionary = game["players"][pi]
	if player.get("characterId") == null:
		fail("캐릭터가 없습니다")
		return
	var ability = _ability(game, pi).get("activeAbility")
	if ability == null:
		fail("발동형 능력이 없습니다")
		return
	var max_uses := ability_max_uses(ability)
	var uses := int(nz(player.get("abilityUses"), 1 if player.get("abilityUsed") == true else 0))
	if uses >= max_uses:
		fail("능력을 더 쓸 수 없습니다")
		return
	if ability.get("minOwnTurn") != null and int(nz(player.get("turnsTaken"), 0)) < int(ability["minOwnTurn"]):
		fail("내 %d번째 차례부터 쓸 수 있습니다" % int(ability["minOwnTurn"]))
		return
	if game["turnState"].get("abilityActivated") == true:
		fail("이번 차례에 이미 능력을 썼습니다")
		return

	player["abilityUses"] = uses + 1
	player["abilityUsed"] = int(player["abilityUses"]) >= max_uses
	game["turnState"]["abilityActivated"] = true
	run_effects(game, {"playerIndex": pi, "cardUid": ""}, nz(ability.get("effects"), []))


## 지금 그 플레이어가 발동형 능력을 쓸 수 있으면 능력 정의, 아니면 null (AI·화면 공용)
static func usable_ability(game: Dictionary, pi: int):
	var player: Dictionary = game["players"][pi]
	if player.get("characterId") == null:
		return null
	var ability = _ability(game, pi).get("activeAbility")
	if ability == null:
		return null
	if int(nz(player.get("abilityUses"), 0)) >= ability_max_uses(ability):
		return null
	if ability.get("minOwnTurn") != null and int(nz(player.get("turnsTaken"), 0)) < int(ability["minOwnTurn"]):
		return null
	var ts = game.get("turnState")
	if ts != null and ts.get("abilityActivated") == true:
		return null
	return ability


static func _check_round_end(game: Dictionary) -> bool:
	var p0: Dictionary = game["players"][0]
	var p1: Dictionary = game["players"][1]
	var alive0 := int(p0["hp"]) > 0
	var alive1 := int(p1["hp"]) > 0
	if alive0 and alive1:
		return false
	game["phase"] = "gameOver"
	if alive0:
		game["winner"] = 0
	elif alive1:
		game["winner"] = 1
	elif int(p0["hp"]) > int(p1["hp"]):
		game["winner"] = 0
	elif int(p1["hp"]) > int(p0["hp"]):
		game["winner"] = 1
	else:
		game["winner"] = null
		game["draw"] = true
	return true


static func _end_turn(game: Dictionary, pi: int) -> void:
	var player: Dictionary = game["players"][pi]
	_run_end_triggers(game, pi)
	if failed():
		return
	_revert_temp_upgrades(game, pi)
	var trashed: Array = nz(game["turnState"].get("trashAtCleanup"), [])
	var to_discard := []
	for c in player["inPlay"] + player["hand"]:
		if c["uid"] in trashed:
			game["trash"].append(c)
		else:
			to_discard.append(c)
	player["discard"].append_array(to_discard)
	player["inPlay"] = []
	player["hand"] = []
	draw_cards(game, pi, _hand_size_at_end(game, pi))
	player["coins"] = 0
	player["actions"] = 0
	player["buys"] = 0
	# 라운드 끝(후공 차례 종료)에만 승패를 판정한다.
	if pi != int(game["firstPlayerIndex"]) and _check_round_end(game):
		return
	game["activeIndex"] = 1 - pi
	game["turn"] = int(game["turn"]) + 1
	_start_turn(game)


static func _hand_size_at_end(game: Dictionary, pi: int) -> int:
	var extra = _ability(game, pi).get("extraDrawIfDebt")
	if not (extra is int or extra is float):
		return HAND_SIZE
	return HAND_SIZE + int(extra) if int(nz(game["players"][pi].get("debt"), 0)) >= 1 else HAND_SIZE


static func _run_end_triggers(game: Dictionary, pi: int) -> void:
	for trig in nz(game["turnState"].get("endTriggers"), []):
		if trig.get("cond") != null:
			var ok := eval_cond(game, trig["ctx"], trig["cond"])
			if failed():
				return
			if not ok:
				continue
		run_effects(game, trig["ctx"], trig["effects"])
		if failed():
			return
		if game.get("pending") != null:
			fail("차례 끝 효과에는 선택형 효과를 쓸 수 없습니다")
			return
	_run_character_triggers(game, pi, "endTriggers", "차례 끝 효과에는 선택형 효과를 쓸 수 없습니다")


static func _run_character_triggers(game: Dictionary, pi: int, key: String, pending_msg: String) -> void:
	var triggers = nz(_ability(game, pi).get(key), [])
	var ctx := {"playerIndex": pi, "cardUid": ""}
	for trig in triggers:
		if trig.get("cond") != null:
			var ok := eval_cond(game, ctx, trig["cond"])
			if failed():
				return
			if not ok:
				continue
		run_effects(game, ctx, nz(trig.get("effects"), []))
		if failed():
			return
		if game.get("pending") != null:
			fail(pending_msg)
			return


static func _cards_of_type(hand: Array, type: String) -> Array:
	var out := []
	for c in hand:
		if GameData.card(c["cardId"])["type"] == type:
			out.append(c["uid"])
	return out


## 모든 조작의 단일 입구. 성공하면 "", 실패하면 오류 문구를 돌려주고 상태는 그대로 둔다.
## action: { type: playCard|playAllMoney|playAllWeapons|buy|payDebt|upgrade|choose|activateAbility|endPhase, ... }
static func apply_action(game: Dictionary, pi: int, action) -> String:
	error = ""
	if not action is Dictionary:
		return "잘못된 조작입니다"
	_assert_can_act(game, pi, action)
	if failed():
		return error

	var snapshot = game.duplicate(true) if atomic else null
	var debt_paid := 0
	var turn_before: int = game["turn"]
	var type = action.get("type")

	match type:
		"playCard":
			_play_card(game, pi, action.get("uid"))
		"playAllMoney":
			if game["phase"] != "buy":
				fail("재화카드는 구매단계에만 낼 수 있습니다")
			else:
				for uid in _cards_of_type(game["players"][pi]["hand"], "money"):
					_play_card(game, pi, uid)
					if failed():
						break
		"playAllWeapons":
			if game["phase"] != "attack":
				fail("무기카드는 공격단계에만 낼 수 있습니다")
			else:
				# 손패 순서대로 낸다. 선택이 생기면 멈춘다.
				for uid in _cards_of_type(game["players"][pi]["hand"], "weapon"):
					_play_card(game, pi, uid)
					if failed() or game.get("pending") != null:
						break
		"buy":
			_buy(game, pi, action.get("cardId"))
		"payDebt":
			debt_paid = _pay_debt(game, pi, action.get("amount"))
		"upgrade":
			_upgrade_card(game, pi, action.get("uid"), action.get("mode"))
		"choose":
			resolve_choice(game, pi, action.get("selection"))
		"activateAbility":
			_activate_ability(game, pi)
		"endPhase":
			match game["phase"]:
				"action":
					game["phase"] = "buy"
				"buy":
					game["phase"] = "attack"
				"attack":
					_resolve_attack(game, pi)
					if not failed():
						_end_turn(game, pi)
				_:
					fail("알 수 없는 단계: %s" % game["phase"])
		_:
			fail("알 수 없는 조작: %s" % str(type))

	if failed():
		# 실패한 조작은 흔적을 남기지 않는다(객체 참조는 유지).
		if snapshot != null:
			game.clear()
			for k in snapshot:
				game[k] = snapshot[k]
		return error

	var entry := {"turn": turn_before, "p": pi, "type": type}
	if type == "playCard":
		var i := _index_by_uid(game["players"][pi]["inPlay"], action.get("uid"))
		if i >= 0:
			entry["cardId"] = game["players"][pi]["inPlay"][i]["cardId"]
	elif type == "buy":
		entry["cardId"] = action.get("cardId")
	elif type == "payDebt":
		entry["amount"] = debt_paid
	elif type == "upgrade":
		var i := _index_by_uid(game["players"][pi]["hand"], action.get("uid"))
		if i >= 0:
			entry["cardId"] = game["players"][pi]["hand"][i]["cardId"]
		entry["mode"] = action.get("mode")
	game["log"].append(entry)
	return ""
