extends SceneTree
## 서버에 연결할 수 없을 때(주소가 틀렸거나 서버가 꺼짐) 오류를 알리고 로비로 돌아오는지 확인한다.
##   godot --headless --path godot -s res://tests/online_unreachable.gd

func _initialize() -> void:
	var main = load("res://scenes/main.tscn").instantiate()
	root.add_child(main)
	_run.call_deferred(main)


func _run(main) -> void:
	await process_frame
	main.session = main.online
	main.online.create_room("ws://127.0.0.1:1/ws", "나")
	main._show_waiting()
	var t0 := Time.get_ticks_msec()
	while main.session == main.online and Time.get_ticks_msec() - t0 < 15000:
		await process_frame
	if main.session == main.online or main._screen_key != "lobby" or main.online.active():
		printerr("연결 실패 처리 점검 실패: 로비로 돌아오지 않았습니다")
		quit(1)
		return
	main.online.create_room("http://잘못된주소", "나")
	await process_frame
	if main._screen_key != "lobby":
		printerr("잘못된 주소 형식 처리 실패")
		quit(1)
		return
	print("연결 실패 처리 점검 통과: %.1f초 안에 로비로 복귀, 잘못된 주소 거절" % ((Time.get_ticks_msec() - t0) / 1000.0))
	quit(0)
