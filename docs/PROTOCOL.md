# 서버 ↔ 클라이언트 통신 규격 (v1)

- 연결: 같은 서버의 HTTP 로 클라이언트 파일을 받고, WebSocket `ws(s)://<host>/ws` 로 접속한다.
- 모든 메시지는 JSON 텍스트 한 덩어리. 필드 `t` 가 종류.
- 판정은 전부 서버가 한다. 클라이언트는 받은 `view` 를 그리기만 하고, 조작은 `action` 으로 보낸다.

## 클라이언트 → 서버

| t | 필드 | 설명 |
|---|---|---|
| `create` | `name` | 새 방을 만들고 0번 플레이어로 들어간다 |
| `join` | `room`, `name` | 방 코드로 1번 플레이어로 들어간다 |
| `vsAi` | `name` | AI 상대 방을 만들고 0번 플레이어로 들어간다(1번은 AI) |
| `campaign` | `campaignId`, `name` | 모험 모드 방을 만들고 0번으로 들어간다(1번은 보스 AI). 조작은 `action` 으로 같은 방식 |
| `rejoin` | `room`, `token` | 새로고침·재접속. 예전에 받은 token 으로 같은 자리에 다시 앉는다 |
| `action` | `action` | 경기 조작. `action` 은 engine 의 applyMatchAction 에 그대로 넘어간다 |
| `leave` | — | 방을 종료하고 참가자 모두 로비로 이동한다. 대기·대전·모험에서 공통 |
| `ping` | — | 연결 유지. 서버는 `pong` 으로 답한다 |

`action` 예시:
```json
{ "t": "action", "action": { "type": "selectCharacter", "characterId": "hayun" } }
{ "t": "action", "action": { "type": "draft", "cardIds": ["s8_supplyOrder", "s8_logistics", "s8_opFunds", "s8_budget"] } }
{ "t": "action", "action": { "type": "game", "action": { "type": "playCard", "uid": "c12" } } }
{ "t": "action", "action": { "type": "game", "action": { "type": "playAllMoney" } } }
{ "t": "action", "action": { "type": "game", "action": { "type": "buy", "cardId": "rifle" } } }
{ "t": "action", "action": { "type": "game", "action": { "type": "upgrade", "uid": "c12", "mode": "temp" } } }
{ "t": "action", "action": { "type": "game", "action": { "type": "endPhase" } } }
{ "t": "action", "action": { "type": "game", "action": { "type": "choose", "selection": ["c3"] } } }
```

## 서버 → 클라이언트

| t | 필드 | 설명 |
|---|---|---|
| `joined` | `room`, `you`, `token` | 방에 들어갔다. `you` 는 0 또는 1. `token` 은 localStorage 에 저장해 rejoin 에 쓴다 |
| `state` | `view`, `opponent` | 상태가 바뀔 때마다. `view` = engine 의 `viewFor(match, you)`. `opponent` = `{ name, connected, isAi }` 또는 아직 없으면 `null` |
| `error` | `message` | 잘못된 요청·조작. 한국어 문장 |
| `left` | `message?` | 방 종료 확인. 클라이언트는 저장된 세션과 현재 화면 상태를 지우고 로비로 이동한다 |
| `pong` | — | ping 응답 |

## view 의 주요 필드 (engine/view.js 참고)

- `view.stage`: `'select'` → `'draft'` → `'playing'` → `'finished'`
- `view.you`: 내 번호
- `view.players[i]`: `{ id, name }`
- `view.picks[i]`: `{ characterId, cardIds }` — draft 중 상대 cardIds 는 `null`
- `view.neutralIds`: 이번 경기 중립 카드 2종
- `view.winner`: 끝났으면 승자 번호
- `view.game` (playing 이후):
  - `phase`: `'action' | 'buy' | 'attack' | 'gameOver'`, `activeIndex`, `turn`, `firstPlayerIndex`
  - `players[i]`: `hp, maxHp, stars, defense, actions, buys, coins, characterId, hand(내 것만), handCount(상대), drawCount, discard, inPlay`
  - `market`: `{ [cardId]: { count, bought } }`
  - `turnState`: `{ attackDamage, moneyPlayed, weaponsPlayed, tempUpgrades, starsSpent, ... }`
  - `pending`: 내 선택이면 `{ playerIndex, kind, prompt, options, min, max, optionCards }`, 상대 선택이면 `{ playerIndex, prompt, waiting: true }`
  - `log`: `{ turn, p, type, cardId?, mode? }[]`
  - `trash`

카드 이름·효과 문구·종류·구매가는 클라이언트가 `/engine/index.js` 의 `getCardDef(cardId)` 로 직접 얻는다(서버가 engine 폴더를 정적 파일로 제공). 캐릭터는 `getCharacter(id)`, 후보 카드는 `getCandidates(characterId)`, 현재 구매가는 `getPurchasePrice` 대신 view 로는 계산이 어려우므로 클라이언트에서 아래 규칙으로 표시만 한다: 기본가 + (surchargeFirst 가 있고 bought < surchargeFirst 면 +1) − marketDiscount(내 차례일 때) − 첫 무기 할인(하윤, 이번 차례 무기 미구매 시). 실제 판정은 서버.

## 모험 모드

- 시작: `{ "t": "campaign", "campaignId": "silverbeast", "name": "나" }`
- `state` 메시지에 `campaign` 필드가 붙는다(`view` 는 지금 스테이지 경기, 형식은 일반 대전과 같음):
  `{ campaignId, name, description, stageIndex, stageCount, status, augments, augmentChoices, history, stages: [{ name, intro, bossId, bossName, bossMaxHp, cleared }] }`
- `status`: `'battle'`(스테이지 진행 중) → `'stageWon'` / `'cleared'`(마지막 스테이지 승리) / `'lost'`(패배·무승부)
- 조작(`action`):
  - 스테이지 안: `selectCharacter`, `draft`, `game` — 일반 대전과 같다(플레이어는 항상 0번, 선공)
  - `{ "type": "chooseAugment", "augmentId": "field_rations" }` — `stageWon` 에서 서버가 제시한 증강 하나 선택
  - `{ "type": "nextStage" }` — `stageWon` 에서 증강 선택을 마친 뒤 다음 스테이지로
  - `{ "type": "restart" }` — `lost`·`cleared` 에서 1스테이지부터 다시
- 보스 차례는 서버가 조작 직후 바로 진행한다.

- `augments` 는 보유 증강 id 배열, `augmentChoices` 는 미선택 후보 id 배열(선택 후 빈 배열)이다. 증강 이름·등급·문구는 `/engine/index.js` 의 `getAugment(id)` 로 읽는다.
- 보유 증강은 다음 전투의 `players[0].augmentIds` 에 반영한다. 후보는 서버에서 한 번 확정하며 재접속 시 유지한다.

명시적 `leave`는 방과 해당 방의 모든 소켓 세션을 삭제하므로 이전 토큰으로 재접속할 수 없다. 다른 참가자에게는 상대 퇴장 안내를 보낸다. 네트워크 단절은 기존처럼 자리를 유지하여 `rejoin`할 수 있다.
