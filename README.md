# 카드 대전

메타버서스 위시 스타일의 1:1 온라인 덱빌딩 카드 게임. 진영 시스템과 별 강화 시스템을 더한 커스텀 룰.

- 규칙과 카드 목록: [docs/GAME_DESIGN.md](docs/GAME_DESIGN.md)
- 서버↔클라이언트 통신 규격: [docs/PROTOCOL.md](docs/PROTOCOL.md)

## 실행

```bash
npm install
npm start            # http://localhost:8080
```

Docker 로 띄우기:

```bash
docker compose up -d --build   # 8080 포트
```

## 개발

```bash
npm test                       # 엔진·서버·클라이언트 문법 테스트
npm run sim -- --games 1000    # AI 끼리 대전시켜 승률 집계
```

## 구조

| 폴더 | 내용 |
|---|---|
| `engine/` | 순수 게임 로직. 서버와 브라우저가 같이 쓴다. 카드는 `engine/cards/` 에 데이터로 정의 |
| `server/` | HTTP(정적 파일) + WebSocket 방 관리. 판정은 전부 서버가 한다 |
| `client/` | 브라우저 화면(바닐라 JS) |
| `tools/sim.js` | 밸런스 시뮬레이터 |
| `test/` | `node:test` 테스트 |

## 진영·카드 추가

새 진영은 `engine/cards/section8.js` 를 본떠 파일을 하나 만들고 `engine/index.js` 에서 import 하면 된다.
카드 효과는 `engine/effects.js` 의 op 들을 조합한 데이터로 적는다.
