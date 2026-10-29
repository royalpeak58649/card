class_name AiSmart
extends RefCounted
## 모의 실행(rollout) AI. 할 수 있는 조작마다 상태를 복사해 그 차례 끝까지 굴려 보고 점수로 고른다.
## JS engine/aiSmart.js · aiValues.js 이식.

const MAX_ROLLOUT_STEPS := 300
const MAX_CANDIDATES := 24


static func W(key: String) -> float:
	return float(GameData.ai_weights()[key])


## 카드 가치(캐릭터별 조정값 → 없으면 구매가 기반 기본값)
static func card_value(character_id, card_id: String, overrides = null) -> float:
	var tables: Dictionary = overrides if overrides != null else GameData.ai_tuned()
	var table: Dictionary = Rules.nz(tables.get(character_id if character_id != null else ""), {})
	if table.has(card_id):
		return float(table[card_id])
	return GameData.ai_default_value(card_id)


static func card_counts(game: Dictionary, p: int) -> Dictionary:
	var player: Dictionary = game["players"][p]
	var counts := {}
	for zone in [player["hand"], player["drawPile"], player["discard"], player["inPlay"]]:
		for c in zone:
			counts[c["cardId"]] = int(counts.get(c["cardId"], 0)) + 1
	return counts


static func perm_upgrades(game: Dictionary, p: int) -> int:
	return Rules.count_upgraded_owned(game, p)


static func star_worth(stars: int, mx: int) -> float:
	return mini(stars, mx - 1) * W("star")


static func is_terminal(cdef: Dictionary) -> bool:
	if cdef["type"] != "action" or int(Rules.nz(cdef.get("actionCost"), 0)) < 1:
		return false
	return not AiBasic.json_has(cdef.get("effects"), "gainActions")


static func composition_factor(game: Dictionary, p: int, card_id: String) -> float:
	var cdef := GameData.card(card_id)
	var type: String = cdef["type"]
	var counts := card_counts(game, p)
	if type == "action":
		if not is_terminal(cdef):
			return 1.0
		var terminals := 0
		for id in counts:
			if is_terminal(GameData.card(id)):
				terminals += int(counts[id])
		return 1.0 / (1.0 + 0.35 * terminals)
	var total := 0
	var weapons := 0
	for id in counts:
		var t: String = GameData.card(id)["type"]
		if t == "action":
			continue
		total += int(counts[id])
		if t == "weapon":
			weapons += int(counts[id])
	var share := 0.0 if total == 0 else float(weapons) / total
	var shift := (W("targetWeaponShare") - share) * 2.5
	var mult := 1.0 + shift if type == "weapon" else 1.0 - shift
	return maxf(0.4, minf(1.8, mult))


static func situational_value(game: Dictionary, p: int, card_id: String, values = null) -> float:
	var base := card_value(game["players"][p].get("characterId"), card_id, values)
	return base * composition_factor(game, p, card_id) if base > 0 else base


static func stage_factor(game: Dictionary) -> float:
	var min_hp := mini(int(game["players"][0]["hp"]), int(game["players"][1]["hp"]))
	return maxf(0.15, minf(1.0, min_hp / 40.0))


static func evaluate(before: Dictionary, after: Dictionary, p: int, values = null) -> float:
	var o := 1 - p
	if after["phase"] == "gameOver":
		if after.get("draw") == true:
			return 0.0
		return W("win") if after["winner"] == p else -W("win")
	var me0: Dictionary = before["players"][p]
	var me1: Dictionary = after["players"][p]
	var op0: Dictionary = before["players"][o]
	var op1: Dictionary = after["players"][o]

	var score := 0.0
	score += (int(op0["hp"]) - int(op1["hp"])) * W("damage")
	score += (int(me1["hp"]) - int(me0["hp"])) * W("selfHp")
	if int(op1["hp"]) <= 0 and int(op0["hp"]) > 0:
		score += W("lethal")

	var factor := stage_factor(before)
	var c0 := card_counts(before, p)
	var c1 := card_counts(after, p)
	var ids: Array = c0.keys()
	for id in c1:
		if not c0.has(id):
			ids.append(id)
	for id in ids:
		var diff := int(c1.get(id, 0)) - int(c0.get(id, 0))
		if diff == 0:
			continue
		var value := situational_value(before, p, id, values)
		score += diff * value * (factor if diff > 0 else 1.0)

	score += (perm_upgrades(after, p) - perm_upgrades(before, p)) * W("permUpgrade") * factor
	score += star_worth(int(me1["stars"]), Rules.max_stars_of(after, p)) - star_worth(int(me0["stars"]), Rules.max_stars_of(before, p))
	score -= (int(op1["stars"]) - int(op0["stars"])) * W("oppStar")
	score += (int(Rules.nz(me1.get("defense"), 0)) - int(Rules.nz(me0.get("defense"), 0))) * W("defense")
	score -= (int(Rules.nz(me1.get("debt"), 0)) - int(Rules.nz(me0.get("debt"), 0))) * W("debt")
	score += (int(Rules.nz(op1.get("debt"), 0)) - int(Rules.nz(op0.get("debt"), 0))) * W("oppDebt")
	score += (_b(op1.get("bleed")) - _b(op0.get("bleed"))) * W("oppBleed")
	score -= (_b(me1.get("bleed")) - _b(me0.get("bleed"))) * W("selfBleed")
	return score


static func _b(v) -> int:
	return 1 if v == true else 0


static func card_key(card: Dictionary) -> String:
	return "%s%s" % [card["cardId"], "+" if card.get("upgraded") == true else ""]


static func _permutations(items: Array) -> Array:
	if items.size() <= 1:
		return [items.duplicate()]
	var out := []
	for i in items.size():
		var rest_items := []
		for j in items.size():
			if j != i:
				rest_items.append(items[j])
		for rest in _permutations(rest_items):
			out.append([items[i]] + rest)
	return out


static func _pending_candidates(game: Dictionary, p: int) -> Array:
	var pending: Dictionary = game["pending"]
	var options: Array = pending["options"]
	var mn: int = pending["min"]
	var mx: int = pending["max"]
	var kind: String = pending["kind"]
	var selections := []
	var seen := {}
	var add := func(sel: Array) -> void:
		if sel.size() < mn or sel.size() > mx:
			return
		var key := ",".join(PackedStringArray(sel))
		if seen.has(key):
			return
		seen[key] = true
		selections.append(sel)

	if kind == "reorderTop" and options.size() <= 3:
		for perm in _permutations(options):
			add.call(perm)
	else:
		var zones := []
		for pl in game["players"]:
			zones.append_array([pl["hand"], pl["drawPile"], pl["discard"], pl["inPlay"]])
		var by_key := {}
		for opt in options:
			var key = opt
			var found := false
			for zone in zones:
				for c in zone:
					if c["uid"] == opt:
						key = card_key(c)
						found = true
						break
				if found:
					break
			if not by_key.has(key):
				by_key[key] = opt
		if mn == 0:
			add.call([])
		if mn <= 1:
			for k in by_key:
				add.call([by_key[k]])
		var fallback = AiBasic.choose_action(game, p)
		if fallback != null and fallback.get("type") == "choose":
			add.call(fallback["selection"])
		add.call(options.slice(0, mx))
		if selections.is_empty():
			add.call(options.slice(0, mn))
	var out := []
	for sel in selections:
		out.append({"type": "choose", "selection": sel})
	return out


static func _phase_fits(phase: String, type: String) -> bool:
	if type == "action":
		return phase == "action"
	if type == "money":
		return phase == "action" or phase == "buy"
	return true


## 지금 내릴 수 있는 조작 후보들(같은 결과를 낼 조작은 하나만)
static func candidates(game: Dictionary, p: int) -> Array:
	var pending = game.get("pending")
	if pending != null:
		return _pending_candidates(game, p) if int(pending["playerIndex"]) == p else []
	if int(game["activeIndex"]) != p or game["phase"] == "gameOver":
		return []
	var player: Dictionary = game["players"][p]
	var out := [{"type": "endPhase"}]
	var seen := {}
	var phase: String = game["phase"]
	var ts = game.get("turnState")
	for card in player["hand"]:
		var cdef := GameData.card(card["cardId"])
		var key := card_key(card)
		var t: String = cdef["type"]
		if phase == "action" and t == "action":
			var cost := int(Rules.nz(cdef.get("actionCost"), 0))
			if cost == 0 or int(player["actions"]) >= cost:
				_once(seen, out, "play:" + key, {"type": "playCard", "uid": card["uid"]})
		if phase == "buy" and t == "money" and cdef.get("basic") != true:
			_once(seen, out, "play:" + key, {"type": "playCard", "uid": card["uid"]})
		if phase == "attack" and t == "weapon":
			_once(seen, out, "play:" + key, {"type": "playCard", "uid": card["uid"]})
		if Rules.can_upgrade_card(card) and _phase_fits(phase, t):
			var temp_used := int(Rules.nz(ts.get("tempUpgrades"), 0)) if ts != null else 0
			if int(player["stars"]) >= 1 and temp_used < 3:
				_once(seen, out, "temp:" + key, {"type": "upgrade", "uid": card["uid"], "mode": "temp"})
			var perm_cost := 4
			if player.get("characterId") != null:
				var pc = GameData.character(player["characterId"]).get("ability", {}).get("permUpgradeCost")
				if pc != null:
					perm_cost = int(pc)
			if int(player["stars"]) >= perm_cost:
				_once(seen, out, "perm:" + key, {"type": "upgrade", "uid": card["uid"], "mode": "perm"})

	if phase == "buy" and Rules.can_buy_cards(game, p):
		for c in player["hand"]:
			if GameData.card(c["cardId"])["type"] == "money":
				out.append({"type": "playAllMoney"})
				break
		var debt := int(Rules.nz(player.get("debt"), 0))
		if debt > 0 and int(player["coins"]) > 0:
			out.append({"type": "payDebt"})
		var ignore := ts != null and int(Rules.nz(ts["mods"].get("ignoreDebt"), 0)) > 0
		var blocked := debt > 0 and not ignore
		if int(player["buys"]) >= 1 and not blocked:
			for card_id in game["market"]:
				if int(game["market"][card_id]["count"]) <= 0:
					continue
				if Rules.get_purchase_price(game, card_id, p) > int(player["coins"]):
					continue
				out.append({"type": "buy", "cardId": card_id})
	if Rules.usable_ability(game, p) != null:
		out.append({"type": "activateAbility"})
	return out


static func _once(seen: Dictionary, out: Array, key: String, action: Dictionary) -> void:
	if seen.has(key):
		return
	seen[key] = true
	out.append(action)


## 모의 실행 안의 빠른 기본 정책: 구매만 카드 가치로 고르고 나머지는 규칙 기반 AI
static func rollout_policy(game: Dictionary, p: int, values = null) -> Variant:
	if game.get("pending") == null and int(game["activeIndex"]) == p and game["phase"] == "buy":
		var player: Dictionary = game["players"][p]
		if not Rules.can_buy_cards(game, p):
			return {"type": "endPhase"}
		for c in player["hand"]:
			if GameData.card(c["cardId"])["type"] == "money":
				return {"type": "playAllMoney"}
		var ignore := int(Rules.nz(game["turnState"]["mods"].get("ignoreDebt"), 0)) > 0
		if int(Rules.nz(player.get("debt"), 0)) > 0 and not ignore:
			return {"type": "payDebt"} if int(player["coins"]) > 0 else {"type": "endPhase"}
		if int(player["buys"]) < 1:
			return {"type": "endPhase"}
		var factor := stage_factor(game)
		var best = null
		var best_value := 0.3
		for card_id in game["market"]:
			if int(game["market"][card_id]["count"]) <= 0:
				continue
			if Rules.get_purchase_price(game, card_id, p) > int(player["coins"]):
				continue
			var value := situational_value(game, p, card_id, values) * factor
			if value > best_value:
				best = card_id
				best_value = value
		return {"type": "buy", "cardId": best} if best != null else {"type": "endPhase"}
	return AiBasic.choose_action(game, p)


static func _copy_without_log(game: Dictionary) -> Dictionary:
	var shallow := game.duplicate(false)
	shallow["log"] = []
	return shallow.duplicate(true)


## 상태를 복사해 action 을 적용하고 내 차례가 끝날 때까지 굴린다. 불가능하면 null.
static func rollout(game: Dictionary, p: int, action: Dictionary, values = null) -> Variant:
	var copy := _copy_without_log(game)
	var prev := Rules.set_atomic(false)
	var result = copy
	if Rules.apply_action(copy, p, action) != "":
		result = null
	else:
		for step in MAX_ROLLOUT_STEPS:
			if copy["phase"] == "gameOver":
				break
			var pending = copy.get("pending")
			var actor: int = int(pending["playerIndex"]) if pending != null else int(copy["activeIndex"])
			if actor != p:
				break
			var next = rollout_policy(copy, p, values)
			if next == null:
				break
			if Rules.apply_action(copy, p, next) != "":
				result = null
				break
	Rules.set_atomic(prev)
	return result


## 모의 실행으로 다음 조작을 고른다.
static func choose_action(game: Dictionary, p: int, values = null) -> Variant:
	var list := candidates(game, p).slice(0, MAX_CANDIDATES)
	if list.is_empty():
		return AiBasic.choose_action(game, p)
	if list.size() == 1:
		return list[0]
	var before := game.duplicate(false)
	before["log"] = []
	var best = null
	var best_score := -INF
	for action in list:
		var after = rollout(game, p, action, values)
		if after == null:
			continue
		var score := evaluate(before, after, p, values)
		if score > best_score:
			best = action
			best_score = score
	return best if best != null else AiBasic.choose_action(game, p)
