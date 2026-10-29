class_name MatchRules
extends RefCounted
## 경기 흐름(캐릭터 선택 → 입고 → 대전)과 플레이어별 화면 정보(view).
## JS 의 engine/match.js · view.js 를 옮긴 것이다.

const NEUTRAL_SEED_COUNT := 2
const DRAFT_SIZE := 4
const PILE_SIZE := 8
const SHARED_PILE_SIZE := 12


## players: [{ id, name }] 2명
static func create_match(seed: int, players: Array) -> Dictionary:
	var match_state := {
		"seed": seed,
		"rngState": seed & Rules.M32,
		"stage": "select",
		"players": [],
		"neutralIds": [],
		"picks": [
			{"characterId": null, "cardIds": null},
			{"characterId": null, "cardIds": null},
		],
		"game": null,
		"winner": null,
		"draw": false,
	}
	for p in players:
		match_state["players"].append({"id": p["id"], "name": p["name"]})
	var shuffled := Rules.shuffle_in_place(match_state, GameData.neutral_card_ids().duplicate())
	match_state["neutralIds"] = shuffled.slice(0, NEUTRAL_SEED_COUNT)
	return match_state


static func get_candidates(character_id: String) -> Array:
	return GameData.candidates(character_id)


## 경기 조작의 단일 입구. 성공하면 "", 실패하면 오류 문구(상태는 그대로).
## action: { type: selectCharacter, characterId } | { type: draft, cardIds } | { type: game, action }
static func apply_match_action(m: Dictionary, pi: int, action) -> String:
	Rules.error = ""
	if not action is Dictionary:
		return "잘못된 조작입니다"
	if pi != 0 and pi != 1:
		return "잘못된 플레이어 번호: %s" % str(pi)
	match action.get("type"):
		"selectCharacter":
			if m["stage"] != "select":
				return "캐릭터를 고를 수 없는 단계: %s" % m["stage"]
			if m["picks"][pi]["characterId"] != null:
				return "이미 캐릭터를 골랐습니다"
			if not GameData.has_character(action.get("characterId")):
				return "알 수 없는 캐릭터: %s" % str(action.get("characterId"))
			m["picks"][pi]["characterId"] = action["characterId"]
			if m["picks"][0]["characterId"] != null and m["picks"][1]["characterId"] != null:
				m["stage"] = "draft"
			return ""
		"draft":
			if m["stage"] != "draft":
				return "카드를 고를 수 없는 단계: %s" % m["stage"]
			var pick: Dictionary = m["picks"][pi]
			if pick["cardIds"] != null:
				return "이미 카드를 골랐습니다"
			var err := validate_draft(pick["characterId"], action.get("cardIds"))
			if err != "":
				return err
			pick["cardIds"] = (action["cardIds"] as Array).duplicate()
			if m["picks"][0]["cardIds"] != null and m["picks"][1]["cardIds"] != null:
				return _start_battle(m)
			return ""
		"game":
			if m["stage"] != "playing":
				return "대전 중이 아닙니다: %s" % m["stage"]
			var err := Rules.apply_action(m["game"], pi, action.get("action"))
			if err != "":
				return err
			if m["game"]["phase"] == "gameOver":
				m["stage"] = "finished"
				m["winner"] = m["game"]["winner"]
				m["draw"] = m["game"].get("draw") == true
			return ""
	return "알 수 없는 조작: %s" % str(action.get("type"))


static func validate_draft(character_id, card_ids) -> String:
	if not card_ids is Array or card_ids.size() != DRAFT_SIZE:
		return "카드는 정확히 %d종이어야 합니다" % DRAFT_SIZE
	var seen := {}
	for id in card_ids:
		if seen.has(id):
			return "같은 카드를 두 번 고를 수 없습니다"
		seen[id] = true
	var candidates := get_candidates(character_id)
	for id in card_ids:
		if not id in candidates:
			return "후보에 없는 카드: %s" % str(id)
	return ""


static func _start_battle(m: Dictionary) -> String:
	var players := []
	for i in 2:
		players.append({"id": m["players"][i]["id"], "name": m["players"][i]["name"],
			"characterId": m["picks"][i]["characterId"]})
	var game := Rules.create_game((int(m["rngState"]) ^ 0x9e3779b9) & Rules.M32, players)
	var chosen0: Array = m["picks"][0]["cardIds"]
	var chosen1: Array = m["picks"][1]["cardIds"]
	var shared := []
	for id in chosen0:
		if id in chosen1:
			shared.append(id)
	var seen := {}
	for card_id in m["neutralIds"] + chosen0 + chosen1:
		if seen.has(card_id):
			continue
		seen[card_id] = true
		Rules.add_market_pile(game, card_id, SHARED_PILE_SIZE if card_id in shared else PILE_SIZE)
	var err := Rules.start_game(game)
	if err != "":
		return err
	m["game"] = game
	m["stage"] = "playing"
	return ""


## viewer 기준으로 보여줄 경기 상태(복사본). 상대 손패·덱 순서·난수 상태를 숨긴다.
static func view_for(m: Dictionary, viewer: int) -> Dictionary:
	var view: Dictionary = m.duplicate(true)
	view.erase("seed")
	view.erase("rngState")
	if view["stage"] == "draft":
		for i in view["picks"].size():
			if i != viewer:
				view["picks"][i]["cardIds"] = null
	if view.get("game") != null:
		var g: Dictionary = view["game"]
		var own_pending = m["game"].get("pending")
		if own_pending != null and int(own_pending["playerIndex"]) == viewer:
			var option_cards := {}
			var zones := []
			for p in m["game"]["players"]:
				zones.append_array([p["hand"], p["drawPile"], p["discard"], p["inPlay"]])
			zones.append(m["game"]["trash"])
			for zone in zones:
				for c in zone:
					if c["uid"] in own_pending["options"]:
						option_cards[c["uid"]] = c["cardId"]
			g["pending"]["optionCards"] = option_cards
		g.erase("seed")
		g.erase("rngState")
		for i in g["players"].size():
			var player: Dictionary = g["players"][i]
			player["drawCount"] = player["drawPile"].size()
			player["drawPile"] = []
			if i != viewer:
				player["handCount"] = player["hand"].size()
				player["hand"] = []
		var pending = g.get("pending")
		if pending != null:
			pending.erase("ctx")
			pending.erase("rest")
			pending.erase("data")
			if int(pending["playerIndex"]) != viewer:
				g["pending"] = {"playerIndex": pending["playerIndex"], "prompt": pending["prompt"], "waiting": true}
	view["you"] = viewer
	return view
