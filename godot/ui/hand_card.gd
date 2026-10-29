class_name HandCard
extends Control
## 손패 카드 한 장. 마우스를 올리면 위로 솟고, 끌어서(드래그) 가운데 판에 놓으면 카드를 낸다.
## 그냥 누르면(끌지 않고) clicked 를 보내 카드 상세·강화 창을 연다.
## 끄는 동안에는 카드 복사본(유령)이 마우스를 따라다니고, 놓을 곳이 아니면 제자리로 튕겨 돌아간다.

signal clicked(uid: String)
## 놓은 위치(전역 좌표)를 알려 준다. 화면이 낼 수 있는 곳인지 판단한다.
signal dropped(uid: String, global_pos: Vector2)
signal drag_started(uid: String)
signal drag_ended(uid: String)

const DRAG_THRESHOLD := 10.0
const HOVER_RISE := 46.0

var uid := ""
var playable := false
var view: CardView
var ghost_layer: Control
var _pressed := false
var _dragging := false
var _press_pos := Vector2.ZERO
var _grab_offset := Vector2.ZERO
var _ghost: CardView
var _hover := false
var _rest_y := 0.0


static func make(card: Dictionary, card_size: Vector2, can_play: bool, show_star: bool, layer: Control) -> HandCard:
	var h := HandCard.new()
	h.uid = card["uid"]
	h.playable = can_play
	h.ghost_layer = layer
	h.custom_minimum_size = card_size
	h.size = card_size
	h.mouse_filter = Control.MOUSE_FILTER_STOP
	h.mouse_default_cursor_shape = Control.CURSOR_DRAG if can_play else Control.CURSOR_POINTING_HAND
	h.view = CardView.make(card["cardId"], {"uid": card["uid"], "upgraded": card.get("upgraded") == true,
		"large": true, "clickable": false, "star": show_star, "dim": not can_play})
	h.view.mouse_filter = Control.MOUSE_FILTER_IGNORE
	h.view.custom_minimum_size = card_size
	h.view.size = card_size
	h.add_child(h.view)
	h.tooltip_text = h.view.tooltip_text
	h.mouse_entered.connect(h._on_enter)
	h.mouse_exited.connect(h._on_exit)
	return h


func _on_enter() -> void:
	_hover = true
	if not _dragging:
		z_index = 5
		_tween_y(-HOVER_RISE)


func _on_exit() -> void:
	_hover = false
	if not _dragging:
		z_index = 0
		_tween_y(0.0)


func _tween_y(y: float) -> void:
	if not is_instance_valid(view):
		return
	var tw := create_tween()
	tw.tween_property(view, "position:y", y, 0.12).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)


func _gui_input(event: InputEvent) -> void:
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT:
		if event.pressed:
			_pressed = true
			_press_pos = event.global_position
			_grab_offset = event.global_position - view.global_position
			accept_event()
		elif _pressed:
			_pressed = false
			accept_event()
			if _dragging:
				_finish_drag(event.global_position)
			else:
				clicked.emit(uid)
	elif event is InputEventMouseMotion and _pressed:
		if not _dragging and playable and event.global_position.distance_to(_press_pos) > DRAG_THRESHOLD:
			_start_drag()
		if _dragging and is_instance_valid(_ghost):
			_ghost.global_position = event.global_position - _grab_offset
			# 위로 끌수록 살짝 커진다(내는 느낌)
			var lift := clampf((_press_pos.y - event.global_position.y) / 300.0, 0.0, 1.0)
			_ghost.scale = Vector2.ONE * (1.0 + 0.08 * lift)
			_ghost.rotation_degrees = clampf((event.global_position.x - _press_pos.x) / 40.0, -6.0, 6.0)
		accept_event()


func _start_drag() -> void:
	_dragging = true
	_ghost = CardView.make(view.card_id, {"upgraded": view.upgraded, "large": true, "clickable": false})
	_ghost.custom_minimum_size = view.size
	_ghost.size = view.size
	_ghost.pivot_offset = view.size / 2.0
	_ghost.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_ghost.top_level = true
	_ghost.z_index = 50
	_ghost.modulate = Color(1, 1, 1, 0.96)
	ghost_layer.add_child(_ghost)
	_ghost.global_position = view.global_position
	view.modulate = Color(1, 1, 1, 0.25)
	drag_started.emit(uid)


func _finish_drag(pos: Vector2) -> void:
	_dragging = false
	drag_ended.emit(uid)
	dropped.emit(uid, pos)


## 화면이 "낼 수 없는 곳"이라고 판단하면 부른다: 유령이 제자리로 날아가 사라진다.
func snap_back() -> void:
	if not is_instance_valid(_ghost):
		_restore()
		return
	var tw := _ghost.create_tween()
	tw.set_parallel(true)
	tw.tween_property(_ghost, "global_position", view.global_position, 0.18).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	tw.tween_property(_ghost, "rotation_degrees", 0.0, 0.18)
	tw.tween_property(_ghost, "scale", Vector2.ONE, 0.18)
	tw.chain().tween_callback(_restore)


## 낸 것으로 처리될 때: 유령을 가운데로 살짝 날려 보낸다(화면은 곧 다시 그려진다).
func fly_to(target: Vector2) -> void:
	if not is_instance_valid(_ghost):
		return
	var g := _ghost
	_ghost = null
	var tw := g.create_tween()
	tw.set_parallel(true)
	tw.tween_property(g, "global_position", target - g.size / 2.0, 0.14).set_ease(Tween.EASE_OUT)
	tw.tween_property(g, "scale", Vector2.ONE * 0.7, 0.14)
	tw.tween_property(g, "modulate:a", 0.0, 0.16)
	tw.chain().tween_callback(g.queue_free)


func _restore() -> void:
	if is_instance_valid(_ghost):
		_ghost.queue_free()
	_ghost = null
	if is_instance_valid(view):
		view.modulate = Color.WHITE
	if not _hover:
		z_index = 0
		_tween_y(0.0)


func _exit_tree() -> void:
	if is_instance_valid(_ghost):
		_ghost.queue_free()
