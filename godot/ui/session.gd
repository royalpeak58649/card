class_name GameSession
extends Node
## AI 연습 한 판 또는 모험 모드를 진행한다. 플레이어는 0번, AI(모험에서는 보스)는 1번.
## 사람의 조작은 act() 로 엔진에 넘기고, AI 차례는 설정한 속도로 한 행동씩 진행한다.
## AI 판단(모의 실행)은 화면이 멈추지 않도록 별도 스레드에서 상태 복사본으로 계산한다.

signal changed
signal toast(message: String)
## AI 가 조작 하나를 마쳤을 때(화면이 상대 행동을 강조 표시하는 데 쓴다)
signal ai_acted(action: Dictionary)

const HUMAN := 0
const AI := 1

var match_state: Dictionary = {}
## 모험 모드 상태(연습이면 빈 Dictionary). match_state 는 campaign.match 를 가리킨다.
var campaign: Dictionary = {}
var rng := RandomNumberGenerator.new()
var _thread: Thread
var _thinking := false
var _generation := 0
var _timer: SceneTreeTimer


func _ready() -> void:
	rng.randomize()
	UiKit.settings().ai_speed_changed.connect(func(_s): _schedule_ai())


func _exit_tree() -> void:
	_generation += 1
	_join_thread()


func start_vs_ai(player_name: String) -> void:
	_generation += 1
	_join_thread()
	campaign = {}
	match_state = MatchRules.create_match(rng.randi_range(0, 0x7fffffff), [
		{"id": "p0", "name": player_name},
		{"id": "p1", "name": "AI"},
	])
	_ai_setup_step()
	changed.emit()


func start_campaign(campaign_id: String, player_name: String) -> void:
	_generation += 1
	_join_thread()
	campaign = CampaignRules.create_campaign(rng.randi_range(0, 0x7fffffff), campaign_id, player_name)
	match_state = campaign["match"]
	changed.emit()


func is_campaign() -> bool:
	return not campaign.is_empty()


## 모험 모드 화면 정보(JS campaignView 와 같은 모양)
func campaign_view() -> Dictionary:
	return CampaignRules.campaign_view(campaign) if is_campaign() else {}


func campaign_status() -> String:
	return campaign.get("status", "") if is_campaign() else ""


func stage() -> String:
	return match_state.get("stage", "")


func game() -> Dictionary:
	var g = match_state.get("game")
	return g if g != null else {}


func view() -> Dictionary:
	return MatchRules.view_for(match_state, HUMAN)


## 지금 AI 가 행동할 차례인가
func ai_turn() -> bool:
	if stage() != "playing" or (is_campaign() and campaign["status"] != "battle"):
		return false
	var g := game()
	var pending = g.get("pending")
	return (int(pending["playerIndex"]) == AI) if pending != null else (int(g["activeIndex"]) == AI)


func human_can_act() -> bool:
	return stage() == "playing" and not ai_turn() and game()["phase"] != "gameOver"


func is_thinking() -> bool:
	return _thinking


## 사람의 조작. 성공하면 "".
func act(action: Dictionary) -> String:
	var err := ""
	if is_campaign():
		err = CampaignRules.apply_campaign_action(campaign, action)
		# 다음 스테이지·처음부터 다시는 경기 상태를 새로 만든다.
		match_state = campaign["match"]
	else:
		err = MatchRules.apply_match_action(match_state, HUMAN, action)
	if err != "":
		toast.emit(err)
		return err
	_ai_setup_step()
	changed.emit()
	_schedule_ai()
	return ""


## 사람의 대전 조작(type: game)
func act_game(action: Dictionary) -> String:
	return act({"type": "game", "action": action})


## 캐릭터 선택·입고 단계의 AI 조작(즉시)
func _ai_setup_step() -> void:
	if is_campaign():
		return
	var picks: Array = match_state["picks"]
	if match_state["stage"] == "select" and picks[AI]["characterId"] == null:
		var ids := GameData.all_character_ids()
		MatchRules.apply_match_action(match_state, AI, {"type": "selectCharacter", "characterId": ids[rng.randi_range(0, ids.size() - 1)]})
	if match_state["stage"] == "draft" and picks[AI]["cardIds"] == null:
		var cands := MatchRules.get_candidates(picks[AI]["characterId"]).duplicate()
		for i in range(cands.size() - 1, 0, -1):
			var j := rng.randi_range(0, i)
			var t = cands[i]
			cands[i] = cands[j]
			cands[j] = t
		MatchRules.apply_match_action(match_state, AI, {"type": "draft", "cardIds": cands.slice(0, MatchRules.DRAFT_SIZE)})


func _schedule_ai() -> void:
	if not ai_turn() or _thinking or _timer != null:
		return
	var gen := _generation
	var t := get_tree().create_timer(UiKit.settings().ai_delay())
	_timer = t
	t.timeout.connect(func():
		if _timer == t:
			_timer = null
		if gen == _generation:
			_start_thinking())


func _start_thinking() -> void:
	if not ai_turn() or _thinking:
		return
	_join_thread()
	_thinking = true
	changed.emit()
	var copy := game().duplicate(true)
	var gen := _generation
	if OS.has_feature("web"):
		# 웹(스레드 없는 빌드)에서는 한 프레임 뒤에 바로 계산한다.
		await get_tree().process_frame
		_finish_thinking(gen, AiSmart.choose_action(copy, AI))
		return
	_thread = Thread.new()
	_thread.start(func():
		var action = AiSmart.choose_action(copy, AI)
		_finish_thinking.call_deferred(gen, action))


func _finish_thinking(gen: int, action) -> void:
	_join_thread()
	_thinking = false
	if gen != _generation or not ai_turn():
		changed.emit()
		return
	if action == null:
		push_warning("AI 가 조작을 고르지 못했습니다")
		changed.emit()
		return
	var err := _apply_ai(action)
	if err != "":
		# 있을 수 없는 일이지만 멈추지 않도록 규칙 기반 AI 로 한 번 더 시도한다.
		push_warning("AI 조작 실패: %s" % err)
		var fallback = AiBasic.choose_action(game(), AI)
		if fallback != null:
			_apply_ai(fallback)
	ai_acted.emit(action)
	changed.emit()
	_schedule_ai()


## 연습은 경기 조작으로, 모험은 서버의 runEnemy 처럼 엔진에 직접 적용한 뒤 결과를 반영한다.
func _apply_ai(action: Dictionary) -> String:
	if is_campaign():
		var err := Rules.apply_action(game(), AI, action)
		CampaignRules.settle(campaign)
		return err
	return MatchRules.apply_match_action(match_state, AI, {"type": "game", "action": action})


func _join_thread() -> void:
	if _thread != null and _thread.is_started():
		_thread.wait_to_finish()
	_thread = null


## 로비로 나갈 때: 진행 중인 AI 결과를 버린다.
func stop() -> void:
	_generation += 1
	_timer = null
	_join_thread()
	_thinking = false
	match_state = {}
	campaign = {}
