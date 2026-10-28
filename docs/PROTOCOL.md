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
| `rejoin` | `room`, `token` | 새로고침·재접속. 예전에 받은 token 으로 같은 자리에 다시 앉는다 |
| `action` | `action` | 경기 조작. `action` 은 engine 의 applyMatchAction 에 그대로 넘어간다 |
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
