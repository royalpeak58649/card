# 카드 대전

메타버서스 위시 스타일의 1:1 온라인 덱빌딩 카드 게임. 진영 시스템과 별 강화 시스템을 더한 커스텀 룰.

- 규칙과 카드 목록: [docs/GAME_DESIGN.md](docs/GAME_DESIGN.md)
- 서버↔클라이언트 통신 규격: [docs/PROTOCOL.md](docs/PROTOCOL.md)
- 작업 인계·최신 상태·재개 절차: [docs/HANDOFF.md](docs/HANDOFF.md)

## 실행

```bash
npm install
npm start            # http://localhost:8080
```

Docker 로 띄우기:

```bash
docker compose up -d --build   # 8080 포트
docker compose --profile tunnel up -d --build   # + 공개 HTTPS 주소(Cloudflare 임시 터널)
docker compose logs tunnel | grep trycloudflare  # 주소 확인
```

## Azure VM 배포(IP로 HTTP 접속)

Azure VM의 NSG에서 TCP 22·80을 허용한다. 프로젝트 폴더의 `.env`에 `GAME_PORT=80`을 넣으면 compose 파일을 직접 수정하지 않고 80번 포트로 서비스할 수 있다. `.env`는 Git에서 제외된다.

```bash
cd ~/card
# .env에 기존 설정이 있으면 GAME_PORT 항목만 추가/수정한다.
printf 'GAME_PORT=80\n' > .env
git pull --ff-only origin main
docker compose up -d --build game
curl -I --retry 10 --retry-all-errors --retry-delay 2 --max-time 5 http://127.0.0.1/
```

기존에 `docker-compose.yml`의 포트를 직접 수정했다면 먼저 백업한 뒤 `git restore docker-compose.yml`로 복원하고 업데이트한다. 이후에는 `git pull --ff-only origin main`과 `docker compose up -d --build game`만 실행하면 된다. 재시작 시 메모리에 있는 진행 중인 방은 초기화된다.

## Azure VM 배포(도메인 + HTTPS)

Azure VM의 NSG에서 TCP 22·80·443을 허용하고, 도메인의 A 레코드를 VM의 공인 IP로 지정한다. VM에 SSH로 접속한 뒤 Docker를 설치하고 저장소를 받아 실행한다.

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl git
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER"
newgrp docker

git clone https://github.com/royalpeak58649/card.git
cd card
printf 'DOMAIN=game.example.com\nGAME_BIND=127.0.0.1\nGAME_PORT=8080\n' > .env   # 실제 도메인으로 변경
docker compose --profile https up -d --build
docker compose ps
docker compose logs -f --tail=100 game caddy
```

`DOMAIN`의 DNS가 VM을 가리키고 80/443이 외부에서 접근 가능하면 Caddy가 인증서를 자동 발급한다. 브라우저에서 `https://game.example.com`으로 접속하고, WebSocket은 같은 HTTPS 주소의 `/ws`를 자동으로 사용한다. 배포 후 업데이트는 다음처럼 한다.

```bash
git pull --ff-only origin main
docker compose --profile https up -d --build
```

문제 확인에는 `docker compose ps`, `docker compose logs game`, `docker compose logs caddy`, `curl -I https://game.example.com`을 사용한다.

## 로비 · 도감 · BGM

- 상단 메뉴에서 언제든 로비로 돌아갈 수 있다. 진행 중이면 확인 후 방을 종료하며 온라인 상대도 로비로 이동한다.
- 도감에서 카드의 기본·강화 효과, 캐릭터, 보스, 증강을 검색한다. 카드에는 진영·종류 필터를 사용할 수 있다.
- 캐릭터별 AI 추천 입고 구성 2개를 카드 선택 화면에서 적용할 수 있다. 구성 적용 후 직접 수정하거나 확정한다. 조합과 운영법은 [추천 구성 문서](docs/RECOMMENDATIONS.md)에 정리돼 있다.
- 구매단계의 ‘재화 모두 내기’와 공격단계의 ‘무기 모두 내기’를 사용할 수 있다. 무기는 손패 순서대로 내며, 선택 효과가 나오면 선택을 마친 뒤 다시 누른다.
- 손패의 ★를 누르면 현재 효과와 강화 후 효과를 비교한다. 비교 화면에서 일시·영구 강화를 선택하면 별을 사용한다. PC는 손패 옆, 모바일은 손패 아래에 표시한다.
- AI 연습·모험은 상단 ‘AI 속도’에서 느림·보통·빠름·매우 빠름을 고른다. 기본은 보통이며 행동과 카드 효과를 하나씩 보여준다. 매우 빠름은 기존 속도이고, 선택한 속도는 저장된다.
- 각 모드 시작 전에 규칙과 모드 설명을 확인한다. 상단 플레이 가이드에서도 다시 볼 수 있다.
- 오리지널 피아노 BGM 「별의 돌격」(138 BPM, 약 56초)이 첫 클릭 후 반복 재생된다. 음악 켜기·끄기와 볼륨은 저장되며, 다른 탭을 보는 동안에는 일시 정지한다.
- BGM은 외부 샘플 없이 합성한 곡이다. 재생성: `node tools/makeBgm.js /path/to/ffmpeg` (libmp3lame 필요).

## 개발

```bash
npm test                                   # 엔진·서버·클라이언트 테스트
npm run sim -- --games 3000                # AI 끼리 대전시켜 승률 집계 (기본: 모의 실행 AI, 코어 수만큼 병렬)
npm run sim -- --games 3000 --ai basic     # 규칙 기반 AI 로 비교
npm run tune -- --chars all --iters 12 --games 120 --write   # 캐릭터별 카드 가치 재조정(약 50분)
node tools/recommend.js                    # 캐릭터별 추천 구성 비교·검증 결과 생성
npm run campaign-sim -- --games 200        # 증강 포함 스테이지별 승률(앞선 보상 무작위 선택)
npm run campaign-sim -- --games 200 --no-augments # 증강 없이 비교
```

### 모험 모드

- `engine/augments.js` — 모험 증강 19종. 보상 등급 확률 1성 92% / 2성 7.8% / 3성 0.2%, 승리 후 3개 중 1개 선택.
- `engine/campaign.js` — 캠페인 진행(스테이지 → 캐릭터·입고 → 보스전 → 다음 스테이지 / 실패 시 처음부터).
- `engine/campaigns/*.js` — 캠페인 정의(스테이지·보스). 보스는 `enemy: true` 캐릭터로 `engine/cards/*.js` 에 정의.
- 보스 전용 규칙: `startDeck`(시작 덱), `ability.noBuy`(구매 불가), 차례 시작 시 `gainRandomCard`.

### AI

- `engine/aiSmart.js` — 모의 실행 AI. 할 수 있는 조작마다 상태를 복사해 그 차례 끝까지 굴려 보고,
  준 피해·얻은 카드 가치·별·방어·빚을 점수로 매겨 고른다. 서버의 AI 대전 상대와 시뮬레이터가 쓴다.
- `engine/aiValues.js` — 캐릭터별 카드 가치. `npm run tune` 이 자기 대전(SPSA)으로 조정해 `TUNED` 에 써 넣는다.
  카드·캐릭터를 바꾸면 다시 조정해야 밸런스 수치를 믿을 수 있다.
- `engine/ai.js` — 규칙 기반 AI. 모의 실행 안에서 남은 차례를 빠르게 굴리는 기본 정책으로 쓰인다.

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
