# LOGH VII 전체 구현 완성도 매트릭스 2026-06-26 v2 (자율트랙 1–5 반영)

전신 `logh7-completion-matrix-2026-06-26.md`(Phase 0, server 1147 시점). 이 v2는 **Phase 0 이후
실행된 자율 트랙 1–5**(loop-state 27–47행, server **1057→1172 / 1154 pass / 0 fail / 18 skip**)를 반영해
변동 서브시스템만 재산정한다. `%`는 증거 기반 추정(W=리마스터 플레이가능 게임 기준 중요도 1–5).

근거 문서(이번 추가분): `logh7-faction-projection-2026-06-26.md`, `logh7-unit-0325-officer-2026-06-26.md`,
`logh7-operations-server-2026-06-26.md`, `logh7-wire-030b-builder-2026-06-26.md`,
`logh7-c002-deep-re-2026-06-26-{A,B}.md`, `logh7-state-transition-0f1f-push-2026-06-26.md`,
`logh7-npc-roster-refine-2026-06-26.md`, `logh7-galaxy-special-terrain-2026-06-26.md`,
`logh7-mdx-position-verify-2026-06-26.md`, `logh7-repo-restructure-2026-06-26.md`.
캐논: 서버=`server/src/server`, 위치권위=`server/content/galaxy.json`, RE=`.omo/ghidra/export/`.

## v2 변동 요약 (Phase0 matrix → v2)

Phase0 매트릭스는 server 1147 시점 작성. 자율 트랙 1–5가 그 뒤 실행돼 아래 갭을 닫았다.

| 서브시스템 | W | Phase0 % | v2 % | Δ(v2) | 근거(자율트랙) |
|---|---|---|---|---|---|
| 와이어 프로토콜/코덱 | 5 | 90 | **97** | +7 | **0x030b 빌더 "부재"=stale 정정**: `buildStaticInformationUnitShipInner`(info-records-static.mjs:276) 이미 존재·클라 파서(case 0x30b, stride0x8c×200=0x6d64) 독립 재RE 교차검증 일치. **와이어 11/11 빌더 전부 존재**. 잔여=옵코드 커버리지(전수 디코드 아닌 핵심 11) (트랙3) |
| 진영 표시(faction) | 3 | 50 | **62** | +12 | **진짜 갭 수정**: 함대 push 시 사령관 0x0323(power@0x04) 동반 push 안 해 수신클라 char-table 엔트리 부재→소비처 FUN_004ef0d0가 `iVar10==0`이면 마커 자체 미렌더였음. `logh7-faction-projection.mjs`+syncMultiplayerFleets로 0x0323을 0x0325보다 먼저 동반 push. +5 오라클. **단 라이브 색렌더=함대가시화 선결(미실증)이라 <70** (트랙4) |
| 0x0325 officer/unit 배선 | 3 | (없음) | **60** | NEW | 0x0325 element stride 0x58(88B) 이중파서 확정, officer=troop_units(@B+0x14 count cap10, @B+0x18 u32[]) + commander@B+0x08. `fleetOfficerProjection`로 worldState 함대 boats/commander 투영(엔티티 없으면 빈값=날조금지). 잔여 B+0x44~0x54 미심볼(P3)·캐논 officer 명부 부재 (트랙5) |
| 작전(作戦) | 3 | (없음) | **55** | NEW | 스텁이던 占領/防衛/掃討 결과정산 구현: `evaluateOperationOutcome`(full/partial/none, 掃討 격침×+1, SWEEP_RANGE_LY=400)·`recordSweepKill`·tickOperationsIfDue evaluation. 規則 P1·수치 P2. 잔여=정산→功績 적립·점령상태 world-state 공급·발령 opcode/CP 미확정(off-default) (트랙5) |
| 캐논 NPC 로스터 시드 | 4 | 68 | **74** | +6 | rank 클램프(wireRank→clampRankId 1..14, 사다리밖 누수 차단)+캐논명 unmask(manualDocumented=manual-roster 70명만 캐논명, 나머지 "Character N" 마스크=추측명 P0승격 금지). content-adapter/pack/login-session 배선. +가드 오라클. 잔여=라이브 (트랙1) |
| 전략 명령 UI(C002) | 5 | 30 | **32** | +2 | 근본 **정밀화**: `FUN_004b68f0` iVar7 기본=2(mode2), `if(param_1[0x35f35a]!=0) iVar7=1`(mode0). **0x35f35a=0x0317(ResponseInformationGrid) grid dword byte[2]로 간접기록**(직접 write 0건 설명), ctor zero-init=기본 mode2. 캐논서버 0x0317 미발신→mode2 고정 정합. **★우회후보 식별=서버 `buildInformationGridInner`(0x0317) 의도적 emit(코드무수정)**, 단 라이브 probe로 실값 상충해소 선결. 클릭확정 자체는 미실증이라 ≤35 (트랙2/3) |
| 맵 전환(전략↔전술) | 3 | 50 | **53** | +3 | 0x0f1f 빌더 byte-correct 재확정(`buildNotifyTacticsInner` byte0=1→FUN_004c1b20→+0x357e88=0x3f800000·+0x357e8c=2 load-arm). 단독 lever `LOGH_STATE_TRANSITION_PROBE`(off-default, deferredBattle 배타). +2 오라클. 라이브 미실증 (트랙2) |
| 콘텐츠 데이터(갤럭시 등) | 4 | 72 | **73** | +1 | galaxy 특수천체 bh3/ns3 식별(개수 P1, 노드↔성계 매핑 부재→셀좌표 P3 미주입=추측금지)·0x0315 빌더 bh/ns impassable 인코딩 추가(off-default)·plasma/sargasso 확정(매뉴얼 p30-32). 위치권위=galaxy.json은 MDX 적대검증으로 재확정 (트랙4/Phase0) |
| 클라 RE 커버리지 | 3 | 16 | **17** | +1 | +C002 9함수 deep-RE 완결(`FUN_004b68f0` mode 디스패처 단일상류근본 0x35f35a 확정)·런처 2진 RE. deep ~15%(C002), G7MTClient 여전히 ~5.7% (트랙2) |

다른 서브시스템(인증·월드스테이트·캐릭생성·전투·경제·자율시뮬·전략맵렌더·전술렌더·직무/拠点패널·한글화·런처RE·HUD/모델 리마스터)은 Phase0 값 유지(이번 트랙 무변동).

## 4대 기둥(pillar) 재산정 (v2)

- **A. 서버/시뮬 로직: ~80%** (Phase0 ~78 → +2). 와이어 11/11 빌더 전부 존재(97%)·faction 투영 배선·officer 0x0325 배선·작전 결과정산·NPC 정제가 추가 마감. server 1172 / 0 fail. 잔여=경제 수치 권위·작전→功績/점령상태 메인배선.
- **B. 플레이어 대면 경험(로그인→행동→시각): ~46%** (Phase0 ~45 → +1). C002 근본이 0x35f35a(0x0317 byte[2])로 정밀화되고 **서버 buildInformationGridInner 우회후보**가 생겼으나 **전부 라이브 미실증**이라 소폭. 입력 신뢰성·C002 클릭확정 여전히 핵심 게이트.
- **C. 콘텐츠/캐논 완성도: ~60%** (Phase0 ~58 → +2). NPC rank클램프·캐논명 unmask·작전 規則·특수천체/지형 확정. 잔여=officer 명부 부재·작전 수치 P2·NPC 라이브 정제.
- **D. 리마스터/에셋: ~9%** (무변동). HUD 6% TGA·모델 0% MDX·외부 업스케일러 부재.

## 전체 추정 (2) — v2

- **동작 로직(서버+시뮬+RE 메커니즘, 라이브 무관): ~74%** (Phase0 ~72 → +2)
  서버 1172/0fail. 와이어 11/11·faction/officer/작전 배선·C002 단일상류근본(0x35f35a) 결정적 확정이 메커니즘 완성도를 끌어올림. 클라 RE 커버리지(17%)·C002 클릭확정·전술 데이터 완전성이 잔여.
- **리마스터된 플레이가능 게임(실유저 end-to-end 체감): ~45%** (Phase0 ~44 → +1)
  서버측 게이트(faction 렌더·상태전환·officer)가 RE/배선상 닫혔으나 **모두 라이브 미실증**이라 체감은 소폭. (1) C002 클릭 상호작용 미실증, (2) 0x0f1f/0x0317 서버푸시 라이브 미실증, (3) 입력 신뢰성(첫글자 씹힘), (4) 캐릭선택·faction색 라이브 미확정, (5) 리마스터 9%가 체감 게이트.

## 최대 게이트(single biggest gate) — v2

**라이브 실증 환경(G0 월드진입 신뢰화) — C002가 아님.** Phase0/로드맵 판정 유지·강화:
이번 트랙 1–5가 **서버측 갭(faction 렌더·officer·작전·0x0f1f/0x0317 우회·NPC)을 전부 RE/배선 레벨에서 닫았고
server 1172/0fail로 회귀가드까지 완료**했으나, **그 효과의 시각 실증은 단 한 건도 라이브로 확인되지 않았다**.
모든 시각 진전(faction 색·맵전환·C002 클릭·별개캐릭)이 **월드 도달을 전제**하는데 저널 #4/#5에서
포그라운드 락으로 전면 실패 중. 따라서 단일 최대 게이트=**G0 라이브 월드진입 환경 신뢰화**(코드 아닌 환경).
차순위=C002 클릭확정(클릭 상호작용 한정 게이트)·클라 RE(17%)·리마스터(9%).
