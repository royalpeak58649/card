# 카드 대전 — Godot 이식판

웹판(바닐라 JS + Node 서버)을 **Godot 4.7 + GDScript** 로 옮기는 중인 프로젝트다.
규칙 엔진과 AI 를 GDScript 로 다시 써서 서버 없이 혼자(AI 연습) 플레이할 수 있다.

## 지금 되는 것 (1단계)

- 로비 → 플레이 가이드 → 캐릭터 선택(12명) → 거래소 입고(추천 구성 적용·강화 미리보기) → 대전 → 결과 → 다시 하기/로비
- 대전: 행동·구매·공격 단계, 카드 사용, 재화/무기 모두 내기, 구매, 빚 갚기, 캐릭터 능력 발동,
  ★ 강화 비교(일시·영구), 선택형 효과 창(제거·버리기·가져오기·순서 정하기·별 사용 등), 버린 더미 보기, 기록
- AI: 웹판과 같은 모의 실행 AI. 판단은 별도 스레드에서 계산하고, 상단 'AI 속도'(느림·보통·빠름·매우 빠름)로 한 행동씩 보여 준다.
- 엔진에는 모험 모드 진행(캠페인·보스·증강)도 옮겨 두었다. 화면은 다음 단계.

## 아직 안 된 것 (다음 단계 후보)

1. 모험 모드 화면(스테이지 지도·보스 소개·증강 3택 보상)
2. 온라인 대전(방 코드) — Godot WebSocket 클라이언트로 기존 Node 서버에 붙이거나 Godot 서버로 새로 구성
3. 도감, BGM(「별의 돌격」 MP3 재사용 가능), 카드 일러스트·애니메이션
4. 모바일 세로 화면 배치

## 폴더

| 경로 | 내용 |
|---|---|
| `engine/` | 순수 규칙. `rules.gd`(상태·효과·선택·차례·증강 적용), `match_rules.gd`(선택→입고→대전, view), `campaign_rules.gd`(모험), `ai_basic.gd`·`ai_smart.gd`(AI), `game_data.gd`(데이터 읽기) |
| `data/game_data.json` | 카드·캐릭터·진영·증강·캠페인·AI 가치·추천 구성. **JS 엔진에서 내보낸 것**이다 |
| `ui/` | 화면. `main.gd`(로비·선택·입고), `battle_screen.gd`(대전), `card_view.gd`(카드), `session.gd`(AI 연습 진행), `ui_kit.gd`(테마), `dialogs.gd`, `settings.gd`(자동 로드) |
| `tests/` | `cross_check.gd`(JS 와 단계별 비교), `sim.gd`(AI 대전), `ui_smoke.gd`(화면 자동 진행·스크린샷) |
| `tools/` | `export_data.mjs`(데이터 내보내기), `make_trace.mjs`(교차 검증 기록 만들기) |
| `fonts/` | Pretendard(OFL-1.1). 웹 내보내기에서도 한글이 보이도록 글꼴을 넣었다 |

## 원칙 (웹판과 같다)

- 게임 상태는 JSON 으로 바꿀 수 있는 Dictionary/Array 만 쓰고, 키 이름도 웹판과 같다. 그래서 웹판 서버와 상태를 주고받을 수 있다.
- 모든 조작은 `Rules.apply_action(game, player, action)` 하나로. 실패하면 오류 문구(한국어)를 돌려주고 상태를 통째로 되돌린다.
  GDScript 에 예외가 없어서 내부에서는 `Rules.fail()` 로 표시하고 호출한 쪽이 `Rules.failed()` 를 확인한다.
- 난수는 `Rules.next_random`(mulberry32) 만. 웹판과 **같은 시드면 같은 결과**가 나온다.
- 카드는 데이터. 수치·효과는 `engine/cards/*.js` 를 고친 뒤 `node godot/tools/export_data.mjs` 로 다시 내보낸다.
  새 효과 op 가 필요하면 `rules.gd` 의 `_run_op`(·`_handle_choice`)에도 같은 동작을 넣는다.

## 실행

Godot 4.7(표준판, .NET 아님)로 `godot/project.godot` 를 연다. F5 로 실행.

## 검증

저장소 루트에서:

```bash
npm ci
node godot/tools/export_data.mjs                                   # 데이터 갱신(카드 수치를 바꿨을 때)
node godot/tools/make_trace.mjs --games 60 --campaigns 8            # JS 기준 기록 만들기 → godot/tests/trace.json
godot --headless --path godot --import                              # 처음 한 번(가져오기)
godot --headless --path godot -s res://tests/cross_check.gd         # 조작마다 오류·상태·화면 정보·AI 선택이 JS 와 같은지
godot --headless --path godot -s res://tests/sim.gd -- --games 20   # AI 끼리 끝까지 도는지, 판단 시간
xvfb-run godot --path godot -s res://tests/ui_smoke.gd -- --shots /tmp/shots   # 화면 자동 진행 + 스크린샷
```

`cross_check` 는 JS 엔진이 남긴 기록을 같은 순서로 다시 적용해 **조작 하나하나의 오류 문구·상태 해시·가려진 화면 해시·AI 가 고른 조작**을 비교한다.
기록에는 일부러 넣은 잘못된 조작과 무작위 조작, 모의 실행 AI·규칙 기반 AI 경기, 모험 모드 5스테이지(보스·출혈·증강)가 섞여 있다.

## 내보내기

`export_presets.cfg` 에 Web·Windows 설정이 있다. 편집기에서 내보내기 템플릿을 받은 뒤 `프로젝트 → 내보내기`.
웹은 스레드 없는 빌드(`thread_support=false`)라 AI 판단을 한 프레임 뒤 바로 계산한다.
