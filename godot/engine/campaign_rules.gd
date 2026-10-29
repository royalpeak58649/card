class_name CampaignRules
extends RefCounted
## 모험 모드 흐름. JS 의 engine/campaign.js 와 augments.js(보상 추첨)를 옮긴 것이다.

const NEUTRAL_SEED_COUNT := 2
const PILE_SIZE := 8
const MAX_ENEMY_ACTIONS := 3000


static func roll_augment_choices(campaign: Dictionary) -> Array:
	var roll := Rules.random_int(campaign, 10000)
	var rarity := 1 if roll < 9200 else (2 if roll < 9980 else 3)
	var pool := []
	for a in GameData.augments():
		if int(a["rarity"]) == rarity and not a["id"] in campaign["augments"]:
			pool.append(a["id"])
	return Rules.shuffle_in_place(campaign, pool).slice(0, 3)


static func create_stage_match(campaign: Dictionary) -> Dictionary:
	var cdef := GameData.campaign(campaign["campaignId"])
	var stage: Dictionary = cdef["stages"][campaign["stageIndex"]]
	var boss := GameData.character(stage["bossId"])
	var seed := Rules.random_int(campaign, 1 << 31)
	var m := {
		"seed": seed,
		"rngState": seed & Rules.M32,
		"stage": "select",
		"players": [{"id": "p0", "name": campaign["playerName"]}, {"id": "p1", "name": boss["name"]}],
		"neutralIds": [],
		"picks": [
			{"characterId": null, "cardIds": null},
			{"characterId": stage["bossId"], "cardIds": []},
		],
		"game": null,
		"winner": null,
		"draw": false,
	}
	var shuffled := Rules.shuffle_in_place(campaign, GameData.neutral_card_ids().duplicate())
	m["neutralIds"] = shuffled.slice(0, NEUTRAL_SEED_COUNT)
	return m


static func create_campaign(seed: int, campaign_id: String, player_name := "플레이어") -> Dictionary:
	var c := {
		"campaignId": campaign_id,
		"seed": seed,
		"rngState": seed & Rules.M32,
		"stageIndex": 0,
		"status": "battle",
		"augments": [],
		"augmentChoices": [],
		"history": [],
		"playerName": player_name,
		"match": null,
	}
	c["match"] = create_stage_match(c)
	return c


## 모험 조작의 단일 입구(플레이어 0번만). 성공하면 "", 실패하면 오류 문구.
static func apply_campaign_action(c: Dictionary, action) -> String:
	Rules.error = ""
	if not action is Dictionary:
		return "잘못된 조작입니다"
	var m: Dictionary = c["match"]
	match action.get("type"):
		"selectCharacter":
			if c["status"] != "battle":
				return "캐릭터를 고를 수 없는 상태: %s" % c["status"]
			if m["stage"] != "select":
				return "캐릭터를 고를 수 없는 단계: %s" % m["stage"]
			if not action.get("characterId") in GameData.all_character_ids():
				return "알 수 없는 캐릭터: %s" % str(action.get("characterId"))
			m["picks"][0]["characterId"] = action["characterId"]
			m["stage"] = "draft"
			return ""
		"draft":
			if c["status"] != "battle":
				return "카드를 고를 수 없는 상태: %s" % c["status"]
			if m["stage"] != "draft":
				return "카드를 고를 수 없는 단계: %s" % m["stage"]
			if m["picks"][0]["characterId"] == null:
				return "먼저 캐릭터를 골라야 합니다"
			var err := MatchRules.validate_draft(m["picks"][0]["characterId"], action.get("cardIds"))
			if err != "":
				return err
			m["picks"][0]["cardIds"] = (action["cardIds"] as Array).duplicate()
			return _start_battle(c)
		"game":
			if c["status"] != "battle":
				return "대전 중이 아닙니다: %s" % c["status"]
			if m["stage"] != "playing":
				return "대전 중이 아닙니다: %s" % m["stage"]
			var err := Rules.apply_action(m["game"], 0, action.get("action"))
			if err != "":
				return err
			settle(c)
			return ""
		"chooseAugment":
			if c["status"] != "stageWon" or not action.get("augmentId") in c["augmentChoices"]:
				return "제시된 증강 중 하나를 고르세요"
			c["augments"].append(action["augmentId"])
			c["augmentChoices"] = []
			return ""
		"nextStage":
			if c["status"] != "stageWon":
				return "다음 스테이지로 갈 수 없는 상태: %s" % c["status"]
			if not c["augmentChoices"].is_empty():
				return "먼저 증강을 고르세요"
			c["stageIndex"] = int(c["stageIndex"]) + 1
			c["match"] = create_stage_match(c)
			c["status"] = "battle"
			return ""
		"restart":
			if c["status"] != "lost" and c["status"] != "cleared":
				return "다시 시작할 수 없는 상태: %s" % c["status"]
			c["stageIndex"] = 0
			c["augments"] = []
			c["augmentChoices"] = []
			c["history"] = []
			c["match"] = create_stage_match(c)
			c["status"] = "battle"
			return ""
	return "알 수 없는 조작: %s" % str(action.get("type"))


static func _start_battle(c: Dictionary) -> String:
	var m: Dictionary = c["match"]
	var stage: Dictionary = GameData.campaign(c["campaignId"])["stages"][c["stageIndex"]]
	var game := Rules.create_game((int(m["rngState"]) ^ 0x9e3779b9) & Rules.M32, [
		{"id": "p0", "name": m["players"][0]["name"], "characterId": m["picks"][0]["characterId"]},
		{"id": "p1", "name": m["players"][1]["name"], "characterId": stage["bossId"]},
	])
	# 모험 모드에서는 플레이어가 항상 선공이다.
	game["firstPlayerIndex"] = 0
	game["activeIndex"] = 0
	var seen := {}
	for card_id in m["neutralIds"] + m["picks"][0]["cardIds"]:
		if seen.has(card_id):
			continue
		seen[card_id] = true
		Rules.add_market_pile(game, card_id, PILE_SIZE)
	Rules.apply_augments(game, c["augments"])
	var err := Rules.start_game(game)
	if err != "":
		return err
	m["game"] = game
	m["stage"] = "playing"
	return ""


## 대전이 끝났으면 결과를 반영한다.
static func settle(c: Dictionary) -> void:
	var m: Dictionary = c["match"]
	var game = m.get("game")
	if game == null or game["phase"] != "gameOver" or m["stage"] == "finished":
		return
	m["stage"] = "finished"
	m["winner"] = game["winner"]
	m["draw"] = game.get("draw") == true
	var result := "draw" if game.get("draw") == true else ("win" if game["winner"] == 0 else "lose")
	c["history"].append({"stageIndex": c["stageIndex"], "characterId": m["picks"][0]["characterId"],
		"result": result, "turns": game["turn"]})
	if result == "win":
		var stages: Array = GameData.campaign(c["campaignId"])["stages"]
		c["status"] = "cleared" if int(c["stageIndex"]) >= stages.size() - 1 else "stageWon"
		if c["status"] == "stageWon":
			c["augmentChoices"] = roll_augment_choices(c)
	else:
		c["status"] = "lost"


## 플레이어(0번) 기준으로 보여줄 모험 상태. JS campaignView 와 같은 모양.
static func campaign_view(c: Dictionary) -> Dictionary:
	var cdef := GameData.campaign(c["campaignId"])
	var status: String = c["status"]
	var stages := []
	var stage_list: Array = cdef["stages"]
	for i in stage_list.size():
		var stage: Dictionary = stage_list[i]
		var boss := GameData.character(stage["bossId"])
		stages.append({
			"name": stage["name"],
			"intro": stage["intro"],
			"bossId": stage["bossId"],
			"bossName": boss["name"],
			"bossMaxHp": boss["maxHp"],
			"cleared": i < int(c["stageIndex"]) or (i == int(c["stageIndex"]) and (status == "stageWon" or status == "cleared")),
		})
	return {
		"campaignId": c["campaignId"],
		"name": cdef["name"],
		"description": cdef["description"],
		"stageIndex": c["stageIndex"],
		"stageCount": stage_list.size(),
		"status": status,
		"augments": c["augments"].duplicate(true),
		"augmentChoices": c["augmentChoices"].duplicate(),
		"history": c["history"].duplicate(true),
		"stages": stages,
		"match": MatchRules.view_for(c["match"], 0),
	}
