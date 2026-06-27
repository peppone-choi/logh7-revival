# LOGH VII 부활 프로젝트 — 종합 상태 및 실행계획

> 작성일: 2026-06-19 · 갱신: 2026-06-20 · 근거: 영역별 실측(소스 정독 + 2026-06-20 기준 `npm run test:tools` 287 pass/0 fail, `npm run test:server` 1052 pass/0 fail, Playwright 3 pass + 라이브 핸드오프 대조)
> 본 문서는 5개 영역(서버 기반 / Phase B 캐논 / Phase C+D 확장·배포 / 현지화 / 라이브-게이트)의
> 측정값을 phase 가중으로 합산하고, 잔여를 blockedOn별로 분류해 동시성 최적 실행계획을 제시한다.

---

## (a) 종합 완성도

### 가중 합산 결과 — **종합 55%**

| 영역 | 측정 percentDone | phase 가중치 | 가중 기여 |
|---|---:|---:|---:|
| A. 서버 권위 코어 + Phase A 제로설정 (기반) | 62% | 0.25 | 15.5 |
| B. Phase B 캐논 갭 (경제/전투/인사/첩보/작전…) | 42% | 0.25 | 10.5 |
| C+D. 확장성(모딩/시나리오) + 배포(패키징/런처/폰트) | 68% | 0.20 | 13.6 |
| 현지화 (본문/모지바케/폰트/.rsrc) | 82% | 0.15 | 12.3 |
| 라이브-게이트 (실클라 1대 직렬 검증 백로그) | 22% | 0.15 | 3.3 |
| **합계** | | **1.00** | **55.2 ≈ 55%** |

### 2026-06-20 보정치

위 55%는 2026-06-19 영역별 가중 baseline이다. 이후 로비 네이티브 리마스터, 최신 playable EXE,
SQLite 계정 부트스트랩, `LOGH_POSTLOAD_UNIT_STREAM_WIRE=1`, `LOGH_PLAYER_FOCUS_CELL=1`, Pretendard
ClearType 패키지 동기화까지 반영한 개발 대시보드/마스터 로드맵 보정치는 **63%**다. 서버 오픈 판정은 아직
불가다. 이유는 자연 `0x0b01/0x0b07` 명령 루프와 HUD/콘텐츠 P0가 닫히지 않았기 때문이다.

최신 C002 차단점은 좌표나 성계 색상이 아니다. RE상 `FUN_004fd100`의 HUD mode/category gate,
`FUN_004f6600`의 선택목록 row hit-test, `FUN_004f6b00`의 category resolve, `FUN_004f5cb0`/`FUN_004f58c0`
명령 row dispatch가 모두 통과해야 `FUN_00581c80` SelectGrid factory로 간다. 다음 라이브 증거는
`tools/logh7_selectgrid_snapshot.py`의 `hudModeF4`, `hudState14e0`, selection row rect/gate,
`listSelected189`, command row rect를 기준으로 잡는다.

### 가중치 산정 근거

- **A 기반 0.25 / B 캐논 0.25**: 가장 무겁게 둔다. A(3계층+CQRS 클린 아키텍처)는 모든 후속 확장의 토대이고, B(13개 캐논 도메인)는 "플레이 가능한 은하영웅전설"의 게임플레이 본체다. 둘이 절반(0.50)을 차지.
- **C+D 0.20**: 확장성·배포는 "출하 가능성"의 핵심이나 구성요소가 대부분 완성되어 조립/배선만 남아 가치 대비 잔여 노력이 작다.
- **현지화 0.15**: 본문 번역이 사실상 완료(미번역 일본어 0건)되어 잔여가 손상 라벨 1건 + MFC 셸 .rsrc 트랙뿐. 가중은 중간.
- **라이브-게이트 0.15**: 진척률 자체는 낮으나(22%) "단일 실클라·스플래시 30초" 물리 제약 때문에 순수 코드 가중을 그대로 주면 과대평가된다. 검증 게이트로서 0.15.

> 해석: **"돌아가는 권위 서버"는 달성**(서버/도구/Playwright 테스트 그린·제로설정 부팅 라이브 확인). **"리아키텍처 완성 + 캐논 전 배선 + 실클라 검증된 플레이"는 절반 지점.** 남은 가치의 병목은 코드량이 아니라 **단일 실클라 라이브 검증 큐**다.

---

## (b) 잔여 인벤토리 — blockedOn별 그룹 (effort S/M/L · 우선순위)

> 분류 기준: **autonomous**=서버코드/데이터 단독 가능 · **workflow**=독립 병렬 에이전트 적합 · **live**=메인-직렬 실클라 필수 · **decision**=사용자 결정 대기.
> 우선순위 P0=즉시·블로커 / P1=다음 / P2=후순위.

### 그룹 1 — autonomous (서버 단독, 라이브 불요) — 지금 바로 가능

| # | 항목 | effort | 우선 | 비고 |
|---|---|:--:|:--:|---|
| AU-1 | **air-combat 엔진 연결**: battle-ops 0x040e `result:1` 하드코딩 → `computeAirCombat`/`canLaunchFighters` 분기(物資-10·fighters 갱신). opcode 라우팅은 이미 됨 | M | P0 | 가장 확실한 dead-engine 배선 |
| AU-2 | **surrender 서버판정 배선**: battle-engine 전투해소 루프에서 統率·사기로 `resolveSurrender` 호출(클라 opcode 부재→서버 내부판정) | M | P0 | 와이어 신설 X |
| AU-3 | **coup 표시필드 시드**: personnel.mjs:535 `coup_conduct` 리터럴 0 → `intel.applyCoupLoyalty` 누적값(coup@0x50·rebellion 0x0325@0x21 동일) byte-verify | M | P0 | 순수 S→C 레코드 필드 |
| AU-4 | **content 데이터 적용**: ship-stats 동맹12교정+偵察巡航艦, `content/initial-deployment.json` 신규, galaxy 17 항행불가주역 수정. 적대적검증 완료분만 적용 | M | P0 | 캐논 801-07 시나리오의 선행 데이터 게이트 |
| AU-5 | **A1c config 깊은 이관**: login-session/login-protocol 잔여 ~50개 `process.env.LOGH_*` → `config.*` + A5 composition root `createServer(config,deps)` | M | P1 | A3의 DI 전제 |
| AU-6 | **ability-xp 적립훅**: command-engine 커맨드 실행 시 CP 소비→`gainAbilityXp` + `command-cost` 적용 | M | P1 | 회귀주의 |
| AU-7 | **morale 지휘게이트 통합**: `canCommand`/`fleetMaxMorale`를 ChangeMode/Authority/Encourage 경로에 + 0x7fff clamp→maxMorale | M | P1 | 모듈 헤더가 회귀 위험 명시→회귀테스트 필수 |
| AU-8 | **operation-plan / age-drift / honors 틱 배선**: 30게임일 인사·작전 틱에 `applyAgeDrift`/掃討정산/`decoration_bits 0x0356` 연결(economy 게임클록 공용) | M | P1 | |
| AU-9 | **베이크인 클라 스테이징 배선**: logh7_player_runtime.py가 vanilla 대신 `G7MTClient.playable.exe` 스테이징(LOGH7Launcher.cs:773 하드코딩 교체) | M | P1 | 빌더 이미 재현가능 |
| AU-10 | **폰트 번들 + 런처 호출 배선**: 배포물 `fonts/`에 Pretendard 계열 TTF/OFL을 동봉하고 `ui_explorer`/패키지 경로에서 per-user 등록까지 확인. 런처 자동호출의 최종 UX만 남음 | S | P1 | OFL 동봉 완료 |
| AU-11 | **런처 env에 MODS/SCENARIO 추가**: SetServerEnv에 LOGH_MODS_DIR/LOGH_SCENARIO 2줄 → Phase C가 출하 부팅에 도달 | S | P1 | C↔D 연결 누락 |
| AU-12 | **player_runtime end-to-end 스테이징 테스트** 추가(필수 content 누락 검출) | M | P2 | |
| AU-13 | **#1301 손상 라벨 재추출**: '쟀ㅷ량' constmsg 원바이트 cp949 재추출(자동 지문교정 불가) | M | P2 | 적용은 라이브 노출 확인 후 |

### 그룹 2 — workflow (독립 병렬 에이전트 적합) — 백그라운드 트랙

| # | 항목 | effort | 우선 | 비고 |
|---|---|:--:|:--:|---|
| WF-1 | **A2 L2 코덱 추출**: build*Inner/parse* ~150개 → `src/server/codec/`로 기계적 이동 + re-export shim + `codec/offsets.mjs`. 매 이동 테스트그린 | L | P0 | A3와 command-engine 공유→**worktree 격리 필수** |
| WF-2 | **현지화 .rsrc UTF-16LE 트랙**: MFC 셸 P1 116건(va_offset 4B 정렬 후 ko 채움, %1/&X 보존) + logh7_rsrc_patch.py를 빌드스택에 배선 | M+S | P1 | content/localization+tools만 건드림(src/server 무충돌). 검증 꼬리만 live큐 |
| WF-3 | **캐논 801-07 시작 시나리오 합성**: 갤럭시(80성계)·로스터·함선스탯 추출 데이터로 content/initial-deployment 시나리오 JSON | L | P1 | AU-4 데이터 적용 후. content-verify 적대적 검증 필요 |

### 그룹 3 — live (메인-직렬 실클라 필수) — 라이브 큐

> 공통 제약: 실클라 1대 · 스플래시 ~30초 대기 · D3D8 블라인드클릭(shot+Read 캘리브). **순서 의존: 월드진입 언락 → 월드내 커맨드 캡처 → 렌더검증.**

| # | 항목 | effort | 우선 | 선행 autonomous 상태 |
|---|---|:--:|:--:|---|
| LV-1 | **HUD command-admission 스냅샷**: `tools/logh7_selectgrid_snapshot.py`로 `hudModeF4`, `hudState14e0`, selection row rect/gate, `listSelected189`, command row rect를 live capture | M | P0 | terrain/source+0x320 재시도보다 먼저. C002 최신 blocker |
| LV-2 | **자연 SelectGrid factory 진입 확인**: 선택목록 row hit→category resolve→command row→`FUN_00581c80` 호출을 hook 없이 스냅샷+trace로 확인 | L | P0 | current cell/focus/unit은 증명됨. 자연 HUD mode/category transition 미확인 |
| LV-3 | **실 0x0b01→0x0b07 authoritative loop**: SelectGrid 진입 뒤 유효 payload `0x0b01` 송신과 서버 `0x0b07` 권위 응답 확인 | L | P0 | LV-1/LV-2 후. 이전 terrain/code-cave 단독 검증은 보류 |
| LV-4 | **0x0900 정치 planId 캡처**: 演説/煽動/警戒出動/武力鎮圧/分列行進 각 planId→effect(支持率/治安) 매핑표 | M | P1 | 완료(strategy 라우팅·adjustApproval 순수모듈) |
| LV-5 | **0x040e 공중전 body 판별자 캡처**: 邀撃/對艦/着艦 sub-action 오프셋 | M | P1 | 완료(battle-ops 라우팅·computeAirCombat) — AU-1 후 confirm |
| LV-6 | **0x0f13/0x0f14 쿠데타 order-type 캡처**: 叛意/謀議/説得/参加 판별 필드 오프셋 | M | P1 | 완료(social 파싱·intel 순수모듈) |
| LV-7 | **첩보 5종 C→S opcode 관측**: 클라가 실제 발신하는 opcode 식별(별도/0x0900류/서버내정 판별) | M | P1 | 완료(intel 순수모듈) — 관측 전 와이어 배선 불가 |
| LV-8 | **베이크인 클라 통합 부팅 검증**: menufix+dlgfix+earlygrid+font-face+font-cleartype+lobby-res+lobby-native-layout 1920×1080 묶음→로비→월드 회귀 | L | P1 | 로비 네이티브 배치 라이브 확인, 전 화면·다른 해상도 리마스터는 계속 |
| LV-9 | **폰트 렌더 인클라 확인**: Pretendard 단일 전역 face(0x77402c) + ClearType quality(4→5) + 미설치 폴백 | S | P1 | 완료(font-face.json·font-cleartype.json·install-pretendard.ps1) — LV-8에 배칭 |
| LV-10 | **한글 깨짐 라벨 노출 확인**: 사기값/사기치/재고량/#1301/揚陸艦이 실제 깨져 보이는지(노출 확인 후에만 교정 적용) | S | P1 | 거의 완료(추출툴 근본수정) |
| LV-11 | **한글 UI/채팅 왕복(P0-03)**: 실클라 2개 한글 송수신 trace+shot | M | P2 | 완료(cp949·폰트·인코더 검증) |
| LV-12 | **무유저 전략시뮬 관측(LOGH_STRAT_SIM=1)**: 자율 진영전쟁 틱 broadcast 클라 반영 | M | P2 | 완료(strategic-sim.mjs+틱+테스트) |
| LV-13 | **전 화면 네이티브 UI 리마스터**: 설정/캐릭터/세션/월드 패널을 시스템 해상도 기준 좌표와 텍스처로 재배치 | M | P2 | 로비만 완료. 필러박스/4:3 보존은 진단용으로 강등 |

### 그룹 4 — decision (사용자 결정 대기)

| # | 항목 | effort | 비고 |
|---|---|:--:|---|
| DC-1 | **Pretendard 전역 face 출하 확정**: `font-face.json`과 `font-cleartype.json`은 DEFAULT_STACK에 포함됨. 남은 결정은 JP 박싱/대체 shim DLL을 추가로 갈지 여부 | S | LV-9 검증과 묶임 |
| DC-2 | **relations 사교커맨드 처리**: 夜会/狩猟/会談 클라 opcode 부재 확정 → 서버 AI 트리거만 쓸지/커스텀 opcode 신설할지 | S | |
| DC-3 | **src/server 모노레포 분리 시점**: 별도 git(클라전용화) 전환 시점 | S | dev 안정화 후 |
| DC-4 | **Pretendard TTF 번들링 라이선스/방식 최종확인**: OFL 동봉 완료. 남은 결정은 일반 런처에서 폰트 등록을 어느 시점에 호출할지 | S | DC-1·LV-9와 묶임 |

---

## (c) 동시성 최적 실행계획 — "가장 빠르고 정확한" 토폴로지

### 핵심 원리

1. **물리 제약 = 실클라 1대**: 라이브 항목은 본질적으로 직렬. 따라서 라이브를 **메인 스레드가 직렬 소진**하는 동안 **autonomous/workflow를 백그라운드에서 최대 병렬화**해 벽시계 시간을 압축한다.
2. **파일 소유권 격리(loop-engineering 규칙)**: A2(codec)와 A3(핸들러 레지스트리)는 둘 다 command-engine을 건드린다 → **worktree 격리** 또는 **A2 머지 후 A3** 순차.
3. **선행 의존 게이트**: 정치/공중전/쿠데타 opcode 캡처(LV-4~7)는 **월드 진입+커맨드 발신**을 전제 → **LV-1(HUD command-admission 스냅샷)이 라이브 큐 맨 앞**.

### 토폴로지 다이어그램

```
                          ┌──────────────────────── 시작 (now) ────────────────────────┐
                          │                                                             │
   [백그라운드 병렬 — 독립 파일군, 동시 기동 가능]                  [메인 스레드 — 직렬]
   ────────────────────────────────────────────                  ─────────────────────────
   트랙 W1 (worktree-A) ── WF-1 A2 codec 추출 (L)                  라이브 큐 (실클라 1대)
       │  매 이동 테스트그린, command-engine 격리                      │
       └─► 머지 → A3 핸들러 레지스트리(별 작업) 해금                    ├─ LV-1 HUD command-admission 스냅샷 ★게이트★
                                                                       │      └─(선택/명령 admission)→ 월드내 커맨드 발신 가능
   트랙 W2 (worktree-B) ── WF-2 .rsrc 116건 + 패처 배선 (M+S)         ├─ LV-2 SelectGrid factory 자연 진입
       │  content/localization+tools만, src/server 무충돌               ├─ LV-3 실 0x0b01→0x0b07 authoritative loop
       └─► 검증 꼬리는 라이브 큐 LV-10로                                 │
                                                                       │   [opcode 캡처 배치 — 월드진입 선행]
   트랙 A1 (메인 저장소, src/server) ── 자율 서버배선                    ├─ LV-4 0x0900 정치 planId
       ├─ AU-1 air-combat 엔진연결 (M)                                  ├─ LV-5 0x040e 공중전 판별자
       ├─ AU-2 surrender 서버판정 (M)                                   ├─ LV-6 0x0f13 쿠데타 order-type
       ├─ AU-3 coup 표시필드 시드 (M)                                   └─ LV-7 첩보 opcode 관측
       └─ AU-4 content 데이터 적용 (M) ──► WF-3 시나리오 합성 해금          │
                                                                       │   [렌더검증 배치 — 1빌드에 배칭]
   트랙 A2 (메인 저장소, 별 파일) ── 배포 조립                          ├─ LV-8 베이크인 통합부팅
       ├─ AU-9 베이크인 스테이징 배선                                    ├─ LV-9 폰트 렌더(배칭)
       ├─ AU-10 폰트 번들+호출                                          ├─ LV-10 한글 깨짐 라벨 노출
      ├─ AU-11 런처 env MODS/SCENARIO                                  └─ LV-13 네이티브 UI 리마스터(레터박스 금지)
       └─ (A1c config 이관 AU-5는 A2 codec와 충돌주의→순차)              │
                                                                       │   [후순위]
   [사용자 결정 — 비동기 대기, 블로커 아님]                              ├─ LV-11 한글 왕복(멀티클라)
       DC-1 Pretendard 출하 / DC-2 relations / DC-3 분리 / DC-4 TTF       └─ LV-12 무유저 시뮬 관측
```

### 동시 실행 슬롯 (지금 동시에 띄울 수 있는 것)

| 슬롯 | 주체 | 작업 | 충돌 회피 |
|---|---|---|---|
| **S1** | 백그라운드 워크플로 (worktree-A) | WF-1 A2 codec 추출 | A3와 command-engine 공유 → 격리 |
| **S2** | 백그라운드 워크플로 (worktree-B) | WF-2 .rsrc 116건 + 패처 배선 | content/localization+tools만 |
| **S3** | 자율 에이전트 (메인 src/server) | AU-1/2/3 (air-combat·surrender·coup) | 각각 battle-ops/battle-engine/personnel 다른 파일 |
| **S4** | 자율 에이전트 (메인, content+tools) | AU-4 content 적용 → WF-3 시나리오 | content/*·tools만 |
| **S5** | 자율 에이전트 (메인, 배포 도구) | AU-9/10/11 배포 조립 | tools/launcher·packaging만 |
| **메인** | logh7-live 직렬 | LV-1(HUD admission) → LV-2/3 → LV-4~7 → LV-8~10 | 실클라 1대 (병렬 불가) |

> 충돌 주의 1: **AU-5(A1c config) ↔ WF-1(A2 codec)** 는 login-session/command-engine import 경로를 함께 건드릴 수 있음 → **A2 머지 후 AU-5** 순차 권장.
> 충돌 주의 2: **AU-6/7(ability-xp·morale)** 은 command-engine 커맨드 경로 회귀 위험 → AU-1~4 안정화 후 별도 증분.

---

## (d) 다음 액션 권고 — 당장 병렬로 시작할 6개

지금 즉시(서로 다른 파일군이라 충돌 없이) 동시 기동:

1. **[메인-직렬 라이브 #1] LV-1 HUD command-admission 스냅샷** — 라이브 큐 맨 앞. taskkill node 선행 → 스플래시 ~30초 대기 → 월드진입 → selection row/category/command row snapshot → SelectGrid factory 자연 진입 여부 판정. **이게 풀리면 정치/공중전/쿠데타 캡처(LV-4~7)의 월드내 커맨드 발신 전제가 충족**되어 라이브 큐 전체가 풀린다.
2. **[워크플로 S1, worktree-A] WF-1 A2 codec 추출** — build*Inner/parse* → src/server/codec/ 기계적 이동 + offsets.mjs. command-engine 격리하여 A3 해금.
3. **[워크플로 S2, worktree-B] WF-2 현지화 .rsrc 116건** — va_offset 정렬 후 ko 채움 + 패처 빌드 배선. src/server 무충돌.
4. **[자율 S3] AU-1+AU-2+AU-3** — air-combat 엔진연결 / surrender 서버판정 / coup 표시필드 시드. 라이브 불요·dead-engine 3건을 한 번에 배선(byte-verify로 충분).
5. **[자율 S4] AU-4 content 데이터 적용** — 적대적검증 완료분(ship-stats 12교정·initial-deployment·galaxy 17수정)을 적용 → WF-3 캐논 801-07 시나리오 합성 해금.
6. **[자율 S5] AU-9+AU-10+AU-11 배포 조립** — 베이크인 클라 스테이징 + 폰트 번들/호출 + 런처 env(MODS/SCENARIO). C가 출하 부팅에 도달하게 만들어 LV-8 통합검증 준비.

> 비동기: 사용자 결정 4건(DC-1~4)은 블로커가 아니므로 위 6트랙 진행과 무관하게 대기. DC-1(Pretendard 출하)·DC-4(TTF)는 LV-9 렌더검증 직전까지만 답하면 됨.

---

## 부록 — 영역별 1줄 요약

- **A 기반 62%**: 서버 테스트 1052 pass·제로설정 부팅·A4 SQLite 영속성 완료. 잔여=A1c env→config 단일화 미완·A2 codec/·A3 CQRS 미착수.
- **B 캐논 42%**: 13도메인 순수로직 100%·73테스트. 그러나 배선 ~15%(economy만 부분배선, 나머지 dead-engine), 라이브검증 0.
- **C+D 68%**: 모드/시나리오 로더 배선+28테스트(C 데이터표면 완성). 최신 클라이언트 패키지는 playable EXE·String.txt·MsgDat·Pretendard 폰트를 포함하지만 서버/어드민 런타임은 분리되어 있음. 잔여=런처 env/서버 배포 조립.
- **현지화 82%**: 본문 4580/4639 한글·미번역 일본어 0·모지바케 추출버그 근본수정. `font-face`는 기본 빌드스택 포함, Pretendard 배포/등록 경로 확보. 잔여=#1301 손상 1건·MFC .rsrc 116건·JP 박싱/런처 자동등록 최종확인.
- **라이브-게이트 22%**: 월드진입·0x0b01 메커니즘·cave 안전위치·다색렌더·한글라벨 증명됨. 잔여 13건 전부 blockedOn=live(선행 autonomous는 대부분 완료).

---

## 2026-06-21 최신 C002 blocker 정정

- `login-commandline-bootstrap` canonical 경로는 port `47900`으로 고정된다. 다른 포트 live run은 로그인 성공으로 세지 않는다.
- 최신 실클라 세션 `.omo/ui-explorer/session-g006-c002-mode-activation-20260621g/`는 전략 HUD까지 도달했고,
  `FUN_004fd100`의 네 mode activation hit-test return site가 모두 자연 호출됨을 확인했다.
- 그러나 `hudMode2Primary`, `hudMode4Primary`, `hudMode2Fallback`, `hudMode6Fallback` 모두
  `FUN_005015f0` return low byte가 0이고 target `gate05=0`이다.
- trace에는 `0x0b09/0x0b0a`까지 있지만 입력 뒤 native `0x0b01`/`0x0b07`은 없다.
- 따라서 전면 서버 오픈 기준의 C002는 아직 fail이다. 다음 우선순위는 서버 payload 추가가 아니라
  `FUN_004fd7a0`/HUD mode object lifecycle에서 target 활성화가 왜 자연 발생하지 않는지 찾는 RE다.

## 2026-06-21 최신 C002 blocker 정정 v2

- `tools/logh7_hud_mode_lifecycle.py`가 canonical `G7MTClient.exe`에서 HUD mode lifecycle
  anchors를 JSON으로 고정했다.
- 네 mode activation hit-test는 `HUD+0x14/+0x18/+0x28/+0x24` pre-activation 검사이며,
  성공 branch만 `FUN_004fd7a0(2/4/6,1)`로 들어간다.
- `FUN_004fd7a0`은 mode table `DAT_006703c0`을 적용하고 `FUN_005024b0(1)`로 owner
  activation을 건다.
- 다음 live 타깃은 `FUN_004fc4e0/FUN_004fc4a0/FUN_004fd560/FUN_004fd7a0/FUN_005024b0`.
  서버 payload 변형이나 직접 gate forcing 반복은 C002를 푸는 경로가 아니다.
