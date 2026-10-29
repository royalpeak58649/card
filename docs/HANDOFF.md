# 인수인계 문서 (AI 작업자용)

> 이 저장소를 이어받는 AI 를 위한 문서. 먼저 이 문서를 끝까지 읽고, 규칙·카드 수치는 `docs/GAME_DESIGN.md`,
> 서버↔화면 통신은 `docs/PROTOCOL.md` 를 본다. 이 문서와 코드가 다르면 **코드가 기준**이다.
> 마지막 갱신: 2026-10-30 (Asia/Seoul, 작업 이관용 상태·재개 절차 갱신)

## 0. 이번 이관에서 먼저 볼 내용

### 저장소와 재개 방법

- GitHub: https://github.com/royalpeak58649/card
- 인계 브랜치: `main`. 별도 작업 브랜치나 필수 외부 워커 없이 이 저장소만으로 이어갈 수 있다.
- 현재 작업 환경 경로: `/home/ubuntu/projects/card`. 다른 환경에서는 아래처럼 새로 받는다.

```bash
git clone https://github.com/royalpeak58649/card.git
cd card
git switch main
git pull --ff-only origin main
npm ci
npm test
npm start
# 브라우저: http://localhost:8080
```

기존 체크아웃에서는 먼저 `git status --short --branch`로 로컬 변경을 확인한 뒤 업데이트한다.
기준 런타임은 Dockerfile의 Node 22이며, 이번 인계 검증 환경은 Node 24.22.1 / npm 11.19.1이다.
별도 빌드·DB·API 키 없이 실행된다. 기본 의존성은 `ws`이고 `package-lock.json`을 사용한다.
먼저 `AGENTS.md` → 이 문서 전체 → 작업에 해당하는 `GAME_DESIGN.md` / `PROTOCOL.md`를 읽는다.

### 이관 시점의 작업 상태

- 직전 공개 커밋은 `12534ac`(무기 모두 내기). 이후 로컬에 있던 **강화 효과 비교·AI 진행 속도 설정**은 `911bd8c`에 보존하고 이 문서와 함께 인계한다. 상세 구현은 13장.
- 손패의 ★를 눌러 기본/강화 효과를 비교한 뒤 일시·영구 강화를 확정한다. AI 연습·모험에서 속도를 변경하고 상대 행동을 순서대로 볼 수 있다.
- 변경 위치: `client/battle.js`, `client/battle.css`(비교·상대 행동), `client/aiSpeed.js`, `engine/aiSpeed.js`(속도), `client/app.js`, `client/lobby.js`, `client/style.css`(연결·설정), `server/index.js`, `server/rooms.js`(행동별 진행), `test/server.test.js`(회귀 검증), `docs/PROTOCOL.md`.
- 카드·캐릭터 수치와 AI의 판단 정책은 바뀌지 않았다. 기본 시작 덱은 돌 7장·권총 3장이다.
- 이번 요청은 **현재 작업 보존 및 문서 인계**다. 다음 기능이나 밸런스 조정은 새로 확정되지 않았다. 아래 남은 일은 후보이며, 사용자 고정 규칙은 6장을 따른다.
- **GitHub 반영과 Azure 배포는 별개다.** Azure VM의 최신 실행 버전은 이번에 확인하지 않았으며, 이번 작업으로 VM에 접속하거나 컨테이너를 재배포하지 않았다.

### 검증 기록과 다시 확인할 항목

- 2026-10-30 `npm test`: **296개 통과, 실패·취소·건너뜀 0개**(약 12초). 엔진·캠페인·클라이언트 문법·실제 WebSocket 서버 회귀 테스트 포함.
- 2026-10-30 실제 Chromium 재검증 통과: 강화 가능 86종 비교, 미리보기 시 조작 전송 없음, 제이스 영구 비용·일시/영구 강화·별 부족, PC·390px 모바일 가로 넘침 없음, AI 행동별 전송·속도 저장·새로고침 재접속·로비 복귀·모험 속도 설정. 모험 보상 화면은 이 검증에 포함되지 않는다.
- 각 장의 과거 검증 기록은 당시 결과다. `npm test`만으로 실제 화면 렌더링까지 검증되는 것은 아니다.
- 브라우저 확인 도구와 스크린샷은 이전 환경의 `/tmp/card-browser`에 있었으며 저장소 의존성이 아니다. 새 담당자는 브라우저를 직접 열거나 Playwright를 별도 설치해 다음 절차로 재확인한다.
  1. AI 연습 시작 → 캐릭터·입고 확정 → 손패 ★ → 현재/강화 효과 비교. 미리보기만으로 별이 줄지 않고, 강화 확정 때만 별이 감소하는지 확인한다.
  2. 제이스 영구 강화 ★3, 일반 캐릭터 ★4, 별 부족, 한 차례 일시 강화 3장 제한을 확인한다.
  3. AI 차례에 느림·보통·빠름·매우 빠름 변경 → 행동·효과 표시 → 새로고침 재접속 → 로비 복귀 → 모험 시작 후 속도 저장을 확인한다.
  4. PC와 폭 390px 모바일에서 비교 설명이 잘리지 않고 가로 넘침이 없는지 확인한다.
  5. 모험 승리 → 증강 3개 중 하나 선택 → 다음 전투 → 보유 증강 표시를 확인한다. 이 보상 화면의 최신 브라우저 검증은 아직 남아 있다.

### 다음 담당자의 우선 작업

1. 최신 `main`을 받은 뒤 전체 테스트와 위 핵심 화면을 확인한다.
2. 사용자가 서버 반영을 요청하면 README의 Azure 배포 절차를 따른다. 기존 `.env`는 보존하고 `GAME_PORT=80` 항목만 추가/수정한다. VM의 프로젝트 경로는 먼저 확인한다. 업데이트는 `git pull --ff-only origin main` → `docker compose up -d --build game` → HTTP/로그/실제 대전 확인 순서다. 재시작하면 메모리의 진행 중인 방은 초기화된다. SSH 키는 사용자 PC에 있다.
3. 모험 증강 보상 화면 검증 후 증강 포함/미포함 시뮬레이션 표본을 늘려 난이도를 평가한다(8장). 7장의 캐릭터 승률은 이전 시작 덱 기준이며 현재 덱의 수치로 해석하지 않는다.
4. Section 8 하향은 사용자 판단 대기다. 임의로 조정하지 않는다. AI 상대 차례 예측 개선과 도메인 HTTPS는 선택 과제다.

다음 담당자에게 아래 문장을 그대로 전달해도 된다.

> `royalpeak58649/card`의 최신 `main`을 받아 `AGENTS.md`와 `docs/HANDOFF.md`를 먼저 읽고 이어서 작업해 주세요. 강화 비교·AI 속도 설정까지 구현되어 있고 전체 테스트는 296개 통과했습니다. GitHub 업데이트와 Azure 배포 상태를 구분하고, 우선 실행·핵심 화면을 확인해 주세요. 모험 증강 보상 화면의 최신 브라우저 검증과 현재 시작 덱 기준 밸런스 재측정이 남아 있습니다. 다음 기능 및 수치 변경은 사용자와 범위를 정해 주세요.

---

## 1. 프로젝트 한눈에

- **무엇**: 메타버서스 위시 스타일의 1:1 온라인 덱빌딩 카드 게임 + 혼자 하는 모험 모드(캠페인).
- **사용자(기획자)** 가 규칙·진영·캐릭터 콘셉트를 정하고, AI 가 초안 설계·구현·밸런스 측정을 한다.
  사용자와는 **한국어**로 대화한다. 게임 안 모든 문구도 한국어.
- **기술**: Node 22, 순수 JavaScript(ES 모듈, 빌드 없음, 타입은 JSDoc), 외부 패키지는 `ws` 하나뿐. 브라우저 화면은 바닐라 JS.
- **배포**: 이전 기록상 사용자 Azure VM `40.76.104.201`에 Docker로 HTTP 실행을 확인했다. 서버 쪽 compose는 게임의 `80:8080` 포트 매핑으로 HTTP 접속한다. GitHub 배포 구성은 .env의 GAME_PORT=80으로 HTTP 서비스를 유지하며, HTTPS는 https 프로필로 선택한다. 2026-10-30 이관 작업에서는 VM의 최신 버전을 확인하거나 재배포하지 않았다. 서버 접근 키는 사용자 PC에 있다.

### 지금 상태
| 영역 | 상태 |
|---|---|
| 대전 규칙 엔진 | 완료 |
| 진영 4개 · 캐릭터 12명 · 중립 카드 19종 | 완료, 밸런스 1차 조정됨 |
| 온라인 대전(방 코드) · AI 연습 | 완료 |
| 모의 실행 AI + 카드 가치 자동 조정 | 완료 |
| 모험 모드 "은빛 야수 소탕 작전"(5스테이지, 출혈) | 증강 19종·보상 선택 구현, 밸런스는 초기 수치 |
| Azure 배포 | 이전 HTTP 실행 확인 기록 있음. 이번 변경의 VM 반영 여부는 미확인, 이번 이관에서 재배포하지 않음 |
| 로비 복귀·도감·시작 안내·BGM | 구현 및 브라우저 확인 완료 |
| 강화 비교·AI 진행 속도 | 구현, 전체 테스트·실제 Chromium 재검증 완료(2026-10-30) |

---

## 2. 실행 · 테스트 · 도구

```bash
npm install
npm start                                   # http://localhost:8080 (PORT 환경변수로 변경)
npm test                                    # node:test 전체 (약 1분)
npm run sim -- --games 3000                 # AI 끼리 대전, 캐릭터·카드별 승률 (코어 수만큼 병렬)
npm run sim -- --games 3000 --ai basic      # 규칙 기반 AI 로 비교
npm run tune -- --chars all --iters 12 --games 120 --write   # 캐릭터별 AI 카드 가치 재조정 (약 50분)
npm run tune -- --chars jin,gemini --iters 12 --games 120 --write   # 일부 캐릭터만
npm run campaign-sim -- --games 200         # 모험 모드 스테이지별 플레이어 승률
docker compose up -d --build                # 8080 포트로 배포
```

**완료 기준**: 무엇을 바꾸든 `npm test` 전부 통과. 화면을 바꿨으면 브라우저로 직접 확인한다
(이전 작업에서는 Playwright 헤드리스 크롬으로 실제 클릭하며 스크린샷을 찍어 확인했다).

---

## 3. 구조

```
engine/            순수 게임 로직. 서버와 브라우저가 같은 코드를 쓴다(서버가 /engine/* 로 정적 제공)
  index.js         진입점. 카드·진영·캠페인 등록 import 와 공개 함수 export
  state.js         createGame, drawCards, getPurchasePrice, addMarketPile
  turn.js          applyAction(모든 조작의 단일 입구), 차례 진행, 공격 해결, 라운드 끝 판정
  effects.js       카드 효과 op 들(registerOp), runEffects(큐 방식)
  choices.js       선택 대기(pending) 요청·해결
  conditions.js    조건 평가 evalCond, 통계 getStat
  characters.js    진영·캐릭터 등록
  match.js         대전 흐름(캐릭터 선택 → 입고 → 대전)
  view.js          플레이어별로 보여줄 정보 가리기(viewFor)
  campaign.js      모험 모드 흐름
  augments.js      증강 데이터·보상 등급 추첨·전투 적용
  rng.js           시드 난수(상태를 game.rngState 에 저장)
  ai.js            규칙 기반 AI(빠름, 모의 실행 안에서 기본 정책으로 쓰임)
  aiSmart.js       모의 실행 AI(실제 AI 상대·시뮬레이터가 씀)
  aiValues.js      캐릭터별 카드 가치 표(TUNED 는 tools/tune.js 가 자동으로 다시 씀)
  cards/           basic · section8 · neuro · ligand · vincent · neutral · silverbeast(적)
  campaigns/       silverbeast.js (캠페인 정의)
server/            HTTP 정적 파일 + WebSocket 방(rooms.js 는 네트워크와 분리된 순수 로직)
client/            app.js(화면 전환) lobby.js draft.js(선택·입고) battle.js(대전) campaign.js(모험 모드) cards.js net.js
tools/             sim.js tune.js campaignSim.js match.js(한 판 진행 공용)
test/              *.test.js (node:test)
docs/              GAME_DESIGN.md(규칙·카드 표) PROTOCOL.md(통신 규격) HANDOFF.md(이 문서)
```

---

## 4. 반드시 지킬 규칙(엔진)

1. **게임 상태는 JSON 직렬화 가능해야 한다.** 함수·클래스·Map/Set·undefined 를 상태에 넣지 않는다.
   서버가 상태를 그대로 저장·전송하고, 선택 대기 중 "남은 효과"도 데이터로 저장된다.
2. **모든 조작은 `applyAction(game, playerIndex, action)` 하나로.** 실패하면 Error 를 던지고 상태를 통째로 복원한다
   (시작할 때 JSON 스냅샷 → 실패 시 복원, game 객체 참조는 유지). 그래서 **실패한 조작 뒤에는 `game.players[i]` 같은
   하위 객체를 다시 읽어야 한다**(테스트에서 자주 실수하는 지점).
   - `setAtomic(false)` 는 AI 모의 실행(버리는 복사본)에서만 쓴다.
3. **카드는 코드가 아니라 데이터.** 효과는 `{ op, ... }` 목록이고, 새 기능이 필요할 때만 op 를 추가한다.
4. **난수는 `engine/rng.js` 로만**(시드 고정 → 같은 seed 면 같은 결과). `Math.random` 금지.
5. 낸 카드 수 카운터(`moneyPlayed`·`weaponsPlayed`·`actionsPlayed`·`upgradedPlayed`)는 **효과 실행 전에** 올라간다
   ("이번 차례 행동카드 3장 이상" 은 방금 낸 카드도 센다).
6. 피해는 즉시 들어가지 않고 `turnState.attackDamage` 에 쌓였다가 **공격단계가 끝날 때 한 번에** 들어간다
   (행동카드 피해도 마찬가지). 보너스·방어·출혈도 그때 계산된다.

### 차례 순서
`[차례 시작: 별 +1(선공 첫 차례 제외), 캐릭터 startTriggers] → 행동단계 → 구매단계 → 공격단계 → [공격 해결 → endTriggers → 정리(5장 뽑기) → 후공 차례 끝이면 라운드 끝 판정]`

### 조작 종류(`action.type`)
`playCard {uid}` · `playAllMoney` · `playAllWeapons` · `buy {cardId}` · `upgrade {uid, mode:'temp'|'perm'}` · `endPhase` ·
`choose {selection}` · `payDebt {amount?}` · `activateAbility`

### 효과 op 목록(`engine/effects.js`)
- 자원: `gainCoins` `gainCoinsPerStat{stat,per,max}` `draw` `gainActions` `gainBuys` `gainStars` `heal`
- 피해: `damage` `damagePerStat{stat,per,max,plus}` `addAttackBonus{flat,perWeapon,perAction,perStat:{stat,per},cap,cond}` `debtToDamage{max,per}`
- 카드 이동(선택 대기 발생): `trashFromHand` `discardFromHand{thenIfAny}` `retrieveFromDiscard{to}` `trashFromDiscard` `gainFromMarket{filter,maxCost,to,debt}` `exchangeForWeapon` `reorderTop{trashUpTo}` `freeUpgrade` `payStars{n,then}`
- 기타: `gainCard` `gainRandomCard{pool,n,to}`(거래소 무관) `addMod{key,n}`(이번 차례 보정: marketDiscount·weaponBuyRefund·actionDamageBonus·firstWeaponDiscount·ignoreDebt) `addEndTrigger{cond,effects}` `trashSelfAtCleanup` `addDefense{n|perStat,max}` `opponentMillTop` `gainDebt` `reduceDebt` `clearDebt` `transferDebt{max}` `applyBleed{timing:'now'|'afterAttack'}`
- 특수(runEffects 가 직접 처리): `if{cond,then,else}` `repeatPrevAction`

### 조건·통계(`engine/conditions.js`)
- 조건: `{stat, gte/lte/eq}` `{handHasNoType}` `{opponentHpAtMostHalf}` `{not}` `{all}` `{any}`
- 통계(`getStat`): turnState 의 숫자 필드 전부(actionsPlayed, starsSpent, defenseGained, damageDealt …) +
  `boughtWeapons` `stars` `upgradedOwned` `maxSameAction` `debt` `debtHalf` `bleed` `oppBleed`

### 캐릭터 `ability` 키
`attackBonuses[]` `startTriggers[]` `endTriggers[]` `activeAbility{effects,maxUses,oncePerGame,minOwnTurn,text}` `permUpgradeCost`
`maxStars` `opponentActionStar{threshold,stars}` `doubleFirstCostlyAction{minOwnTurn}` `extraDrawIfDebt` `noBuy`
그 밖의 캐릭터 필드: `maxHp` `cardIds`(전용 카드 3장) `abilityText` `enemy`(적 전용) `startDeck`(시작 덱 교체)

---

## 5. 자주 하는 작업

### 카드·캐릭터 추가/수정
1. `engine/cards/<진영>.js` 의 데이터 수정(카드마다 `text`·`upgradedText`·`effects`·`upgradedEffects` 필수,
   행동카드는 `actionCost`, 행동카드가 피해를 주면 `dealsDamage: true`). 새 진영 파일이면 `engine/index.js` 에 import.
2. 필요한 op 가 없으면 `effects.js` 에 추가 + 테스트.
3. 테스트 추가(`test/<진영>.test.js`), `npm test`.
4. **밸런스를 보려면**: 바뀐 카드의 AI 가치를 `engine/aiValues.js` 의 `TUNED` 에서 지운 뒤
   `npm run tune -- --chars <해당 캐릭터들> --write` → `npm run sim -- --games 3000 --seed 2026` 과 `--seed 9090` 두 번.
   ⚠️ 가치를 지우지 않으면 AI 가 바뀐 카드를 예전 가치로 평가해서 승률이 틀리게 나온다(실제로 겪은 문제).
5. `docs/GAME_DESIGN.md` 의 표도 같이 고친다.

### 모험 모드 보스·스테이지
- 보스는 `enemy: true` 캐릭터(`engine/cards/silverbeast.js`). `startDeck`, `ability.noBuy`, `startTriggers` 의 `gainRandomCard` 로 매 차례 카드 획득.
  얻는 카드 목록(pool)에 `stone` 을 섞어 성장 속도를 조절한다.
- 스테이지 정의는 `engine/campaigns/silverbeast.js`. 측정은 `npm run campaign-sim`.
- `allCharacterIds()`·`allFactionIds()` 는 기본으로 적을 빼고 돌려준다(`true` 를 넘기면 포함).

---

## 6. 사용자가 정한 규칙(바꾸지 말 것, 바꾸려면 먼저 물어볼 것)

- **승패**: 체력이 0 이하가 돼도 바로 끝나지 않고 **후공 차례가 끝날 때(라운드 끝)** 판정. 한쪽만 0 이하면 상대 승,
  둘 다 0 이하면 체력이 높은 쪽 승, 같으면 무승부(무승부는 AI 가 정하고 사용자에게 알림). 체력은 음수까지 내려간다.
- **기본 시작 덱**: 돌 7장 + 권총 3장(총 10장). 2026-10-29 사용자 요청으로 변경. 보스의 전용 `startDeck`은 별도 정의.
- **별**: 매 차례 +1(최대 5, 아스트라 7). ★1 일시 강화(한 차례 최대 3장), ★4 영구 강화(제이스 ★3). 기본 공급 카드는 강화 불가.
- **무기 할증**: 처음 구매되는 2장은 +1원, 두 플레이어 합산으로 센다.
- **기본 무기 이름**: 권총(0원·1)·소총(5원·3)·돌격소총(8원·5).
- **하윤**: 패시브가 아니라 발동형(내 5번째 차례부터, 경기 중 2번). **각 플레이어 자기 기준 5번째 차례**.
- **도윤**: 이번 차례 무기를 내지 않았을 때만 차례 끝 방어 +2.
- **빚(빈센트 공화국)**: 빚이 있으면 구매 불가, 구매단계에 원으로 갚는다. 카드 효과로 "얻는" 건 가능.
- **모험 모드**: 덱은 매판 새로, 보스는 고정 덱 + 매 차례 자동 획득, 출혈은 중첩 안 됨, 지면 1스테이지부터 다시, 체력은 매 스테이지 회복.
- **출혈**: 출혈 중 피해를 입으면 +1 추가 피해 후 사라짐, 그 피해에 행동카드 피해가 섞이면 +2.
- **밸런스 성향**: 사용자는 "너무 강해지지 않게"를 원한다(다음 모드 출시 때 기준점이 흔들리지 않도록).
  버프는 소폭으로, 50%를 넘기지 않는 선을 지켰다. Section 8(강진·하윤 약 60%)은 **사용자가 "일단 두고 보자"** 고 했다.

---

## 7. 현재 밸런스 (모의 실행 AI, 6000판)

| 캐릭터 | 승률 | 캐릭터 | 승률 |
|---|---|---|---|
| 돌격대장 강진 | 60.5% | 진 | 46.1% |
| 보급관 하윤 | 59.6% | 라임 | 44.1% |
| 방어선 지휘관 도윤 | 53.2% | 제미니아노 | 43.6% |
| 별지기 아스트라 | 52.8% | 솔 | 43.2% |
| 에코 | 51.7% | 아르거스 | 41.8% |
| 제이스 | 50.6% | 엘레나 | 41.3% |

위 승률은 이전 시작 덱(돌 6장·권총 4장)으로 측정한 참고값이며 현재 시작 덱에서는 재측정하지 않았다.

선공 승률 약 51%. 모험 모드(증강 없음) 스테이지별 플레이어 승률 대략 90 / 80 / 65 / 55 / 40%.

AI 의 한계: 상대 차례는 예측하지 않는다(방어 가치는 근사). 모의 실행 중 이번 차례 내 뽑기를 미리 보는 셈이라
사람 상대로는 약간 유리하다(밸런스 측정에선 양쪽 같아서 공정).

---

## 8. 남은 일 (우선순위 순)

1. **모험 모드 증강 검증·밸런스** — 구현됨. 1성 92% / 2성 7.8% / 3성 0.2%로 **보상 화면 등급을 한 번** 추첨한 뒤 동일 등급 3개 중 선택.
   `campaign.augments`·`augmentChoices`는 id 배열. 승리 시 후보 확정 → `chooseAugment` → `nextStage` → 전투 시작 때 적용.
   중복·선택 생략은 거절하고 재시작 시 초기화. 5스테이지 진행에서는 각 등급에 6종 이상 있어 후보 3개가 유지된다.
   `engine/augments.js`에 1성 7종·2성 6종·3성 6종. 기존 캐릭터·카드 정의는 변경하지 않으며 전투 플레이어 `augmentIds`로 적용.
   - 2026-10-29 검증: 신규 증강 12개 테스트, 캠페인·방·에코 포함 집중 테스트 33개 통과. 모든 클라이언트 파일 `node --check` 통과. 임시 DOM 환경에서 3등급 선택·다음 스테이지·보유 표시 흐름도 통과(브라우저 렌더링 검증은 아님).
   - 권한 변경 후 전체 테스트 통과. 최신 실행은 285개 통과(퇴장 회귀 테스트 포함).
   - Playwright Chromium 실제 브라우저에서 데스크톱·390px 모바일 로비, 도감 검색·카테고리, 시작 설명, 캐릭터 선택·입고·전투·로비 복귀, 대기 방·모험 진입 확인. 두 브라우저의 방 종료·세션 초기화, 진영 필터, 음소거·볼륨 저장 및 MP3 스테레오 디코딩·재생도 정상. 증강 결과 화면의 최신 브라우저 검증은 별도 확인 필요.
   - 증강 포함 시뮬레이션(seed 2026, 스테이지당 20판): 승률 95/90/80/85/70%. 작은 표본이며 보스 수치는 그대로다.
     기본 `campaign-sim`은 앞선 보상 무작위 선택 표본, `--no-augments`로 미적용 비교. 실제 연속 클리어 확률과 다르다.
   - 다음 환경에서 `npm test`, 모바일·데스크톱 보상 선택/다음 전투/보유 효과 화면을 확인한 뒤 더 많은 판으로 난이도를 조정한다.
2. Section 8 하향 검토(사용자 판단 대기).
3. Azure VM에 이번 변경 반영. HTTPS가 필요하면 실제 도메인 DNS와 Caddy 설정 연결.
4. (선택) AI 가 상대 차례를 1수 예측하도록 개선.

---

## 9. 작업 방식 메모(이전 AI 가 하던 방식)

- 큰 기능은 **엔진 기능 → 데이터 → 테스트 → 화면 → 시뮬레이션** 순서로. 진영·캐릭터는 먼저 초안 표를 사용자에게 보여주고 진행.
- 결정이 필요한 애매한 규칙은 구현 전에 사용자에게 짧게 객관식으로 묻는다(예: 출혈 중첩, 패배 처리).
- 이전에는 별도의 DeepSeek 워커(사용자 InstaBox 머신의 Docker 컨테이너, `/data/home/deepseek-worker`)에
  작업을 나눠 맡겼다. 워커는 이 저장소(별칭 `card`)를 클론해 `worker/<id>` 브랜치로 올린다. 이 저장소의 일부는 아니며,
  없어도 작업할 수 있다. 워커 결과는 반드시 직접 테스트·검토 후 병합할 것(단계 제한으로 중간에 끊기거나 테스트 코드 실수가 잦았다).
- 커밋은 기능 단위로, 메시지는 한국어. `main` 에는 테스트가 전부 통과한 상태만 올린다.

## 10. 로비 복귀 · 도감 · 시작 안내 · BGM

- 공통 메뉴는 `client/app.js`가 앱 외부에 한 번 생성하여 화면 갱신 중에도 음악과 메뉴 상태를 유지한다. 대전은 정적 import로 렌더링하여 늦게 도착한 동적 import가 로비를 덮어쓰지 않게 했다.
- `leave`/`left` 메시지: 서버에서 방 및 모든 참가자의 세션을 지우고 클라이언트에서 localStorage·화면 상태 초기화. 네트워크 단절은 기존 재접속을 유지한다. 명시적 퇴장은 경기 승패 판정을 바꾸지 않고 방을 종료한다.
- `client/dialogs.js`: 키보드 지원 native dialog, 퇴장 확인, 공통 규칙 및 모드별 시작 설명. `client/codex.js`: 엔진 등록 데이터를 읽는 카드 92종·캐릭터 12명·보스 5종·증강 19종 도감. 카드 수치 변경 없음.
- `client/music.js`: 첫 사용자 클릭 후 HTML Audio 재생, 음소거·볼륨 저장, 탭 비활성 시 일시 정지. `client/audio/star-charge.mp3`는 「별의 돌격」, D minor, 138 BPM, 32마디/약 56초의 합성 피아노 전투곡. 외부 샘플 없음. 생성 소스는 `tools/makeBgm.js`, 실행 시 MP3 인코더가 있는 ffmpeg 필요. 앱 실행에는 ffmpeg가 필요 없다.

- 2026-10-29 GitHub 업데이트 준비: compose는 GAME_BIND/GAME_PORT 환경변수 지원(기본 0.0.0.0:8080), Caddy는 https 프로필 선택 실행. Azure HTTP는 .env에 GAME_PORT=80. 입고 화면 중립 카드 옆에 이름·종류·가격·효과를 표시하며 강화 미리보기와 연동, PC·모바일 브라우저 확인 완료.


## 11. 캐릭터별 AI 추천 입고 구성

- `client/recommendationData.js`에 플레이 가능 캐릭터 12명 × 2개 구성(각 4종)을 저장한다. 시작 덱은 돌 7장·권총 3장 기준이다. `client/recommendations.js`가 입고 화면에 운영법·카드 이름·펼쳐 보는 효과·적용 버튼을 표시한다.
- 적용은 `state.draftSelection`만 바꾼다. 사용자는 직접 수정하거나 기존 확정 버튼으로 제출한다. 이미 제출한 상태에서는 적용을 막으며, 번호는 확정적인 성능 순위가 아니다.
- `tools/recommend.js`는 실제 `createMatch`의 중립 2종·입고 공유 더미 12장 규칙을 사용한다. 캐릭터별 70개 조합 × basic 12판 → 후보 6개 × smart 24판(다른 구성을 찾기 위해 에코는 3개 추가) → 선정한 2개 × 별도 시드 smart 96판. 보고서에 기록된 평가 총 14,184판. 검증 결과로 다시 선정하지 않는다.
- 운영법과 평가 조건: `docs/RECOMMENDATIONS.md`. 원본 수치: `docs/recommendation-results.json`. 새 평가: `node tools/recommend.js --out /tmp/card-recommendations-fresh.json`. 출력 파일이 있으면 완료한 캐릭터를 건너뛰므로 카드/능력/AI가 바뀐 뒤에는 반드시 새 파일을 사용한다. 데이터가 바뀌면 추천과 설명도 재검토한다.
- 모의 실행 AI는 상대 차례를 예측하지 않고 자신의 덱 순서를 활용할 수 있다. 기존 AI 가치표는 그대로다. 1차 비교는 기본 AI라 좋은 조합을 놓칠 수 있고, 검증 수치가 사람 상대·모험 모드 승률을 뜻하지 않는다. 보스·증강에 맞춘 추천은 아니다. 엔진·카드·능력·AI 수치 변경 없음.
- 검증: 전체 `npm test` 289개 통과. Playwright 실제 Chromium에서 12명·24개 추천 적용, 수동 수정, 효과 펼치기, 확정 전 전송 없음, 확정 시 단일 전송, 제출 후 비활성화, AI 대전 시작, PC·390px 모바일 가로 넘침 없음 확인. 기존 중립 카드 기본/강화 효과 표시도 재확인.

## 12. 무기 일괄 내기 · 강화 증원 요청 확인

- 공격단계의 ‘무기 모두 내기’는 `playAllWeapons` 조작 하나로 서버에 요청한다. 손패 순서대로 기존 `playCard` 처리를 호출하므로 강화·무기 수 보너스·캐릭터 능력을 개별 사용과 동일하게 계산한다.
- 유성 낙하 등 선택형 효과가 생기면 즉시 멈춘다. 선택 해결 뒤 버튼을 다시 눌러 나머지를 낸다. 공격 종료는 별도 버튼이다. 선택 대기·상대 차례에는 비활성화하고 손에 무기가 없으면 숨긴다.
- 사용자 보고 ‘일시 강화 증원 요청으로 손패가 5장 증가’는 에코 모험 플레이였다. 에코의 내 4번째 차례 이후 첫 행동력 비용 1 카드 두 번 발동으로 3장 × 2 = 6장 뽑고 사용 카드 1장이 빠져 순증 5장이다. 기본+강화 중복 실행 버그가 아니므로 강화 처리와 능력은 변경하지 않았다.
- `test/play-all-weapons.test.js`: 개별 사용과 동일한 피해·강화·강진 보너스, 연속 선택 중단/재사용, 잘못된 차례·단계 거절, 일반 강화 증원 요청 3장/에코 6장 회귀 검증. 전체 테스트 293개 통과. 실제 Chromium에서 PC·390px 모바일 버튼·선택·재사용·단일 메시지 전송·로그·자동 차례 종료 없음 확인.

## 13. 강화 비교 · AI 진행 속도

- 손패 ★는 현재 효과·강화 후 효과와 일시/영구 강화 버튼을 연다. 비교만으로는 조작을 보내지 않는다. PC에서는 손패 옆, 1000px 이하에서는 아래에 배치하여 가로 스크롤에 설명이 잘리지 않는다. 별 부족·일시 강화 3장 제한·제이스 영구 비용을 기존 규칙대로 표시한다. 겹친 손패의 별 버튼을 왼쪽으로 옮겨 다음 카드가 가리지 않게 했다.
- `engine/aiSpeed.js`에 느림(1400ms)·보통(850ms, 기본)·빠름(350ms)·매우 빠름(0ms, 기존 속도) 정의. `client/aiSpeed.js`는 공통 메뉴에서 설정하고 서버 확인 값을 localStorage에 저장한다. 새 AI 연습·모험에도 저장값을 전달한다.
- 실제 서버는 `RoomManager({ deferAi: true })`로 전투 AI를 미룬다. `stepAi`는 기존 `chooseSmartAction`의 판단을 한 번만 적용하고, 서버의 방별 단일 타이머가 각 행동 후 `viewFor`/`campaignView`로 가려진 상태를 보낸다. 캐릭터·입고 선택은 즉시 진행. `veryFast`는 한 차례를 모아서 처리한다. RoomManager 기본 동기 실행과 시뮬레이터는 유지한다.
- 모험의 한 행동도 기존 `applyAction`과 `settle`로 처리하여 라운드 끝 판정·증강 보상 확정을 유지한다. AI 대기 중 속도 변경은 타이머를 교체하고, 연결 끊김/퇴장/서버 종료 시 취소한다. 재접속 시 현재 속도로 이어서 진행한다. 이전 소켓의 늦은 close는 새 연결의 진행을 취소하지 않는다.
- 화면 중앙에 상대의 사용·구매·강화·능력·단계 전환을 표시하고 해당 카드의 기본/강화 효과를 함께 보여 준다. 카드 수치와 AI 판단 정책은 변경하지 않았다.
- 검증: 전체 `npm test` 296개 통과. WebSocket 테스트로 AI 연습·모험의 행동별 전송, 속도 변경, 잘못된 설정 거절, 재접속·퇴장 타이머 취소 확인. 실제 Chromium에서 강화 가능 86종 비교, 미리보기 시 전송 없음, 제이스 비용·일시/영구 확정·별 부족, PC·390px 모바일(가로 넘침 없음) 확인.
