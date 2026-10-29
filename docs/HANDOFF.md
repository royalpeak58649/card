# 인수인계 문서 (AI 작업자용)

> 이 저장소를 이어받는 AI 를 위한 문서. 먼저 이 문서를 끝까지 읽고, 규칙·카드 수치는 `docs/GAME_DESIGN.md`,
> 서버↔화면 통신은 `docs/PROTOCOL.md` 를 본다. 이 문서와 코드가 다르면 **코드가 기준**이다.
> 마지막 갱신: 2026-10-29 (로비 복귀·도감·시작 가이드·피아노 BGM 반영)

---

## 1. 프로젝트 한눈에

- **무엇**: 메타버서스 위시 스타일의 1:1 온라인 덱빌딩 카드 게임 + 혼자 하는 모험 모드(캠페인).
- **사용자(기획자)** 가 규칙·진영·캐릭터 콘셉트를 정하고, AI 가 초안 설계·구현·밸런스 측정을 한다.
  사용자와는 **한국어**로 대화한다. 게임 안 모든 문구도 한국어.
- **기술**: Node 22, 순수 JavaScript(ES 모듈, 빌드 없음, 타입은 JSDoc), 외부 패키지는 `ws` 하나뿐. 브라우저 화면은 바닐라 JS.
- **배포**: 사용자가 Azure VM `40.76.104.201`에 Docker로 실행 중. 서버 쪽 compose는 게임의 `80:8080` 포트 매핑으로 HTTP 접속한다. GitHub 배포 구성은 .env의 GAME_PORT=80으로 HTTP 서비스를 유지하며, HTTPS는 https 프로필로 선택한다. 이번 변경의 서버 반영은 사용자가 git pull 후 컨테이너를 재빌드한다. 서버 접근 키는 사용자 PC에 있다.

### 지금 상태
| 영역 | 상태 |
|---|---|
| 대전 규칙 엔진 | 완료 |
| 진영 4개 · 캐릭터 12명 · 중립 카드 19종 | 완료, 밸런스 1차 조정됨 |
| 온라인 대전(방 코드) · AI 연습 | 완료 |
| 모의 실행 AI + 카드 가치 자동 조정 | 완료 |
| 모험 모드 "은빛 야수 소탕 작전"(5스테이지, 출혈) | 증강 19종·보상 선택 구현, 밸런스는 초기 수치 |
| Azure 배포 | 사용자 VM에서 HTTP 실행 확인. 이번 클라이언트·서버 변경은 아직 미반영 |
| 로비 복귀·도감·시작 안내·BGM | 구현 및 브라우저 확인 완료 |

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
`playCard {uid}` · `playAllMoney` · `buy {cardId}` · `upgrade {uid, mode:'temp'|'perm'}` · `endPhase` ·
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
