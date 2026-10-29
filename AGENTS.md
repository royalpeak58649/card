# AI 작업자 안내

이 저장소를 처음 맡았다면 **`docs/HANDOFF.md` 를 먼저 끝까지 읽는다.** 구조·규칙·현재 상태·남은 일이 정리돼 있다.

핵심 규칙 요약:
- 사용자와 게임 문구는 한국어.
- 게임 상태는 JSON 직렬화 가능해야 한다. 모든 조작은 `engine/turn.js` 의 `applyAction` 하나로.
- 카드는 데이터(`engine/cards/*.js`), 효과는 `engine/effects.js` 의 op 조합.
- 무엇을 바꾸든 `npm test` 전부 통과. 카드 수치를 바꾸면 `docs/GAME_DESIGN.md` 도 갱신.
- 사용자가 정한 규칙(라운드 끝 판정, 출혈, 하윤·도윤 능력 등)은 `docs/HANDOFF.md` 6장 — 바꾸려면 먼저 묻는다.
