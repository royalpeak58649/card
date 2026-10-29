class_name AiBasic
extends RefCounted
## 규칙 기반 AI(빠름). 모의 실행 AI 안에서 남은 차례를 굴리는 기본 정책으로 쓰인다. JS engine/ai.js 이식.

const PERM_UPGRADE_COST := 4
const PERM_UPGRADE_MIN_STARS := 4
const LOW_WEAPON_RATIO := 0.4
const HIGH_WEAPON_RATIO := 0.6
const WEAPON_BONUS := 15
const MONEY_BONUS := 15
const TYPE_SCORE := {"weapon": 3, "money": 2, "action": 1}
const TRASH_PRIORITY := ["stone", "pistol"]
const OWN_POOL_BONUS := 12


static func has_op(effects, op: String) -> bool:
	if not effects is Array:
		return false
	for e in effects:
		if e.get("op") == op:
			return true
		if e.get("op") == "if" and (has_op(e.get("then"), op) or has_op(e.get("else"), op)):
			return true
	return false


## JS 의 JSON.stringify(x).includes('"token"') 와 같은 검사(키 이름 또는 문자열 값)
static func json_has(x, token: String) -> bool:
	match typeof(x):
		TYPE_DICTIONARY:
			for k in x:
				if k == token or json_has(x[k], token):
					return true
		TYPE_ARRAY:
			for v in x:
				if json_has(v, token):
					return true
		TYPE_STRING:
			return x == token
	return false


## 안정 정렬(JS Array.prototype.sort 와 같은 순서 보장). cmp(a, b) 가 음수면 a 가 앞.
static func stable_sort(arr: Array, cmp: Callable) -> Array:
	var out := arr.duplicate()
	for i in range(1, out.size()):
		var item = out[i]
		var j := i - 1
		while j >= 0 and int(cmp.call(out[j], item)) > 0:
			out[j + 1] = out[j]
			j -= 1
		out[j + 1] = item
	return out


static func own_pool(game: Dictionary, pi: int) -> Array:
	var character_id = game["players"][pi].get("characterId")
	if character_id == null:
		return []
	return GameData.candidates(character_id)


static func action_order(card: Dictionary) -> int:
	var cdef := GameData.card(card["cardId"])
	var effects = cdef.get("upgradedEffects") if card.get("upgraded") == true and cdef.get("upgradedEffects") != null else cdef.get("effects")
	var score := 0
	if has_op(effects, "gainActions"):
		score += 100
	if has_op(effects, "draw"):
		score += 50
	if int(Rules.nz(cdef.get("actionCost"), 0)) == 0:
		score += 10
	if has_op(effects, "gainCoinsPerStat") or json_has(effects, "perAction") or json_has(effects, "actionsPlayed"):
		score -= 80
	return score


static func _find_in_hand(game: Dictionary, pi: int, uid) -> Variant:
	for c in game["players"][pi]["hand"]:
		if c["uid"] == uid:
			return c
	return null


static func _to_card_id(game: Dictionary, pi: int, item) -> Variant:
	if game["market"].has(item):
		return item
	var c = _find_in_hand(game, pi, item)
	return c["cardId"] if c != null else null


static func _choose(selection: Array) -> Dictionary:
	return {"type": "choose", "selection": selection}


static func _choose_pending(game: Dictionary, pi: int) -> Dictionary:
	var pending: Dictionary = game["pending"]
	var options: Array = pending["options"]
	var mn: int = pending["min"]
	var mx: int = pending["max"]
	var kind: String = pending["kind"]

	if kind.contains("trash"):
		var entries := []
		for item in options:
			var cid = _to_card_id(game, pi, item)
			if cid != null:
				entries.append({"item": item, "cardId": cid})
		var ranked := stable_sort(entries, func(a, b):
			var ra := TRASH_PRIORITY.find(a["cardId"])
			var rb := TRASH_PRIORITY.find(b["cardId"])
			var pa := TRASH_PRIORITY.size() if ra < 0 else ra
			var pb := TRASH_PRIORITY.size() if rb < 0 else rb
			return pa - pb)
		var wanted := []
		for e in ranked.slice(0, mx):
			wanted.append(e["item"])
		if wanted.size() >= mn:
			return _choose(wanted)
		return _choose(options.slice(0, mn))

	if kind == "gainFromMarket":
		var best = null
		var best_cost := -1
		for card_id in options:
			var cost := int(GameData.card(card_id)["cost"])
			if cost > best_cost:
				best = card_id
				best_cost = cost
		return _choose([] if best == null else [best])

	if kind == "exchangeForWeapon":
		for item in options:
			var cid = _to_card_id(game, pi, item)
			if cid == "stone" or cid == "silver":
				return _choose([item])
		return _choose([])

	if kind == "exchangeForWeaponPlace":
		return _choose(["trash"] if "trash" in options else options.slice(0, mn))

	if kind == "reorderTop":
		return _choose(options.duplicate())

	var count := mn if mn > 0 else mini(mx, 1)
	return _choose(options.slice(0, count))


static func _best_by_cost(cards: Array) -> Dictionary:
	var best: Dictionary = cards[0]
	for c in cards:
		if int(GameData.card(c["cardId"])["cost"]) > int(GameData.card(best["cardId"])["cost"]):
			best = c
	return best


static func _choose_action_phase(game: Dictionary, pi: int) -> Dictionary:
	var player: Dictionary = game["players"][pi]
	var perm_cost := PERM_UPGRADE_COST
	if player.get("characterId") != null:
		var pc = GameData.character(player["characterId"]).get("ability", {}).get("permUpgradeCost")
		if pc != null:
			perm_cost = int(pc)
	if int(player["stars"]) >= mini(PERM_UPGRADE_MIN_STARS, perm_cost):
		var cands: Array = player["hand"].filter(func(c): return Rules.can_upgrade_card(c))
		if not cands.is_empty():
			return {"type": "upgrade", "uid": _best_by_cost(cands)["uid"], "mode": "perm"}

	var playable := []
	for c in player["hand"]:
		var cdef := GameData.card(c["cardId"])
		if cdef["type"] != "action":
			continue
		var cost := int(Rules.nz(cdef.get("actionCost"), 0))
		if cost == 0 or int(player["actions"]) >= cost:
			playable.append(c)

	var ts = game.get("turnState")
	var temp_used := int(Rules.nz(ts.get("tempUpgrades"), 0)) if ts != null else 0
	if int(player["stars"]) >= 2 and temp_used < 3:
		var cands: Array = player["hand"].filter(func(c): return Rules.can_upgrade_card(c))
		if not cands.is_empty():
			return {"type": "upgrade", "uid": _best_by_cost(cands)["uid"], "mode": "temp"}

	var ability = Rules.usable_ability(game, pi)
	if ability != null and json_has(ability.get("effects"), "actionDamageBonus"):
		var damage_cards := 0
		for c in playable:
			if GameData.card(c["cardId"]).get("dealsDamage") == true:
				damage_cards += 1
		if damage_cards >= 2:
			return {"type": "activateAbility"}
	if not playable.is_empty():
		var best: Dictionary = playable[0]
		for c in playable:
			if action_order(c) > action_order(best):
				best = c
		return {"type": "playCard", "uid": best["uid"]}
	return {"type": "endPhase"}


static func _choose_buy_phase(game: Dictionary, pi: int) -> Dictionary:
	var player: Dictionary = game["players"][pi]
	if not Rules.can_buy_cards(game, pi):
		return {"type": "endPhase"}
	for c in player["hand"]:
		if GameData.card(c["cardId"])["type"] == "money":
			return {"type": "playAllMoney"}

	var ts: Dictionary = game["turnState"]
	var ignore_debt := int(Rules.nz(ts["mods"].get("ignoreDebt"), 0)) > 0
	if int(Rules.nz(player.get("debt"), 0)) > 0 and not ignore_debt:
		if int(player["coins"]) > 0:
			return {"type": "payDebt"}
		return {"type": "endPhase"}
	if int(player["buys"]) < 1:
		return {"type": "endPhase"}

	var all_cards: Array = player["drawPile"] + player["hand"] + player["discard"] + player["inPlay"]
	var weapon_ratio := 0.0
	if not all_cards.is_empty():
		var w := 0
		for c in all_cards:
			if GameData.card(c["cardId"])["type"] == "weapon":
				w += 1
		weapon_ratio = float(w) / all_cards.size()

	var discount_ability = Rules.usable_ability(game, pi)
	if discount_ability != null and json_has(discount_ability.get("effects"), "firstWeaponDiscount"):
		var bought_weapon := false
		for id in Rules.nz(ts.get("bought"), []):
			if GameData.card(id)["type"] == "weapon":
				bought_weapon = true
		if not bought_weapon:
			for id in game["market"]:
				var cdef := GameData.card(id)
				if cdef["type"] != "weapon" or int(game["market"][id]["count"]) <= 0 or int(cdef["cost"]) < 5:
					continue
				var price := Rules.get_purchase_price(game, id, pi)
				if price > int(player["coins"]) and price - 1 <= int(player["coins"]):
					return {"type": "activateAbility"}

	var pool := own_pool(game, pi)
	var best = null
	var best_score := -INF
	for card_id in game["market"]:
		var slot: Dictionary = game["market"][card_id]
		if int(slot["count"]) <= 0:
			continue
		var cdef := GameData.card(card_id)
		if int(cdef["cost"]) <= 0:
			continue
		var price := Rules.get_purchase_price(game, card_id, pi)
		if price > int(player["coins"]):
			continue
		var score := float(price * 10 + int(TYPE_SCORE.get(cdef["type"], 0)))
		if card_id in pool:
			score += OWN_POOL_BONUS
		if cdef["type"] == "weapon" and weapon_ratio < LOW_WEAPON_RATIO:
			score += WEAPON_BONUS
		if cdef["type"] == "money" and weapon_ratio > HIGH_WEAPON_RATIO:
			score += MONEY_BONUS
		if score > best_score:
			best = card_id
			best_score = score
	if best == null:
		return {"type": "endPhase"}
	return {"type": "buy", "cardId": best}


static func _choose_attack_phase(game: Dictionary, pi: int) -> Dictionary:
	for c in game["players"][pi]["hand"]:
		if GameData.card(c["cardId"])["type"] == "weapon":
			return {"type": "playCard", "uid": c["uid"]}
	return {"type": "endPhase"}


## 다음 조작 하나. 차례가 아니고 선택 대기 중도 아니면 null.
static func choose_action(game: Dictionary, pi: int) -> Variant:
	if game.is_empty() or game["phase"] == "gameOver" or game["phase"] == "setup":
		return null
	var pending = game.get("pending")
	if pending != null:
		if int(pending["playerIndex"]) != pi:
			return null
		return _choose_pending(game, pi)
	if pi != int(game["activeIndex"]):
		return null
	match game["phase"]:
		"action":
			return _choose_action_phase(game, pi)
		"buy":
			return _choose_buy_phase(game, pi)
		"attack":
			return _choose_attack_phase(game, pi)
	return null
