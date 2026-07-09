# LOGH VII — 갭 백로그 (2026-06-19, logh7-gap-audit 워크플로 + 세션 진행 반영)

> 9개 도메인 병렬 갭 감사(10에이전트) → 35 마스터 태스크. **criticalPath = 무유저 구동 + 플레이가능을 막는 순서.**
> 등급 P0(클라/와이어 확정)/P1(매뉴얼)/P2(IV-EX)/P3(절차). 라이브검증은 `tools/logh7_ui_explorer.py`.

## CriticalPath (상태)
1. **T01 create-character 월드진입** — ✅ **해결(세션)**: "0x2009 미발신"은 회귀가 아니라 **스플래시(BOTHTEC/MPS) 미경과 중 클릭**. 드라이브 전 로비 대기(~30s)하면 월드 진입 정상(기본·cave 클라 모두 0x0f02 확인). → 하니스에 splash-wait 베이크 필요(잔여 S).
2. **T02 cave 0x0b01 라이브** — 🟡 **대부분 확정(세션)**: cave 클라가 월드 진입 + **카메라가 셀로 센터(대조: 기본클라=빈원점, cave=셀 이동)** → cur 채워짐 라이브증명(Front 3 수정). 잔여 = 실제 outbound 0x0b01(이동 move-UI 제스처 = T16).
3. **T16 command-table admission** — 자연 0x0b01 writer(함대선택→이동모드 DAT_009d2a3c 1→2 전이) RE. T02의 마지막 조각.
4. **T03 전략 틱 루프** — 무유저 갤럭시 진행 엔진 (현재 NPC틱은 worldRelay>0 게이트=접속필수).
5. **T04 전략 함대 시드** — upsertFleet/moveFleet 호출처 0 → 전략 함대 생성·배치·이동 배선.
6. **T05 진영 시작 배치** — ✅ **완료(세션)**: fleetCell 진영-인식(제국=오딘/spot70/cell2587, 동맹=하이네센/spot7/cell2111; galaxy projection+grid 정규화로 도출). 753테스트. 잔여 = cave --cell-mem 동기화(T07).
7. **T06 갤럭시 인접 그래프** — galaxy.json에 edge/neighbor 추가(전략 라우팅용).
8. **T11 사령관 의사결정 AI** — 카논 8능력치/계급/직위로 적탐색·교전·방어·증원.
9. **T12 성계 소유권 변동** — conquerSystem/setSystemOwner 배선(영토전쟁 진행).

## 테마 (구조적 패턴)
- **라이브검증 절벽** → T01 해결로 해제됨(이제 실클라 검증 가능).
- **무유저 갤럭시 0%** — 전략틱·전략함대·소유변동·사령관AI·인접그래프 전부 부재(T03/04/06/11/12). "유저 없이 돌아가는 전쟁"의 핵심 블록.
- **0x0337 3중충돌** (T08) — base-economy NotifyBaseParameter vs battle ResponseTacticsCharacter vs 클라 2404B. 즉시 격리 가능.
- **구현됐으나 미배선/게이트OFF** — 작위·봉토·진급, defines, 경제/함선, 0x0323 mixed-endian.
- **폰트/리소스 한글화 미완** — face-name=MS UI Gothic, .rsrc 일본판과 동일, 패처 0건(T14/T15).

## 도메인별 태스크 (35)
**인월드 명령/함대**: T02·T05(✅)·T07(cave 동적셀)·T16·T21(0x0400왕복)
**전략 NPC AI(무유저)**: T03·T04·T06·T11·T12·T22(주기 broadcast)
**UI 값 표시**: T09(0x0323 mixed-endian)·T10(0x031f 스칼라 25개 offset 라이브핀)·T20(창고/수송 시드)
**컨텐츠 배선**: T13(작위/봉토/진급 라우팅)·T19(경제/함선 게이트 검증)·T35(직위 권한카드)
**폰트**: T14(face-name 교체)·T29(텍스트-shim DLL)·T30(ClearType)
**현지화**: T15(.rsrc 패처+메뉴 한글화)·T31(신규번역)
**리마스터/해상도**: T23(로비/와이드 라이브검증)·T24(build 배선)·T25(PathA config)·T26(텍스처 업스케일)
**모딩**: T17(face-atlas 슬롯)·T18(defines 소비)·T27(mod 매니저)·T28(시나리오 로딩)·T32(매니페스트)
**서버 정합/RE**: T08(0x0337)·T33(stat 라벨)·T34(등급 태그)

## 신규 concern (사용자 2026-06-19, 백로그 추가)
- **T36 행성 렌더링 (전략+전술맵)** — 전략맵은 성계 마커(0x0313/0x0315)만; **성계 내 행성 + 전술맵 행성/지형 렌더**가 표시되는지 RE/라이브 확인 + 미표시면 데이터·와이어 배선. severity=high, effort=M.
- **T37 성계 위치 보정 (항행불가주역)** — projection(cx/cy→grid)이 일부 성계를 **항행불가/회랑 셀에 배치**(원래 Task#2). galaxy.json `is_corridor`/회랑 구조를 반영해 충돌·금지셀 회피하도록 buildStrategicGalaxyGrid 정규화 보정 + 좌표 provenance 문서화. severity=high, effort=M. (T05 수도셀도 이 보정 후 재검토.)

## 닫힘 (2026-06-19 세션)
- ✅ **T05** 진영 시작배치 (fleetCell 진영-인식, 제국 cell2587/동맹 cell2111)
- ✅ **T01** 월드진입 (스플래시 타이밍 해결)
- 🟡 **T02** cave 카메라 센터 라이브확정 (잔여=정적detour 0x0b01 needsLive)
- ✅ **T14** 폰트 face/품질 — **전체 텍스트 단일 전역 "MS UI Gothic"@0x77402c → "Pretendard" 16B 교체** + 두 `CreateFontA` quality `4→5` ClearType 보정. `font-face.json`/`font-cleartype.json` 바이트검증. needsLive=라이브 한글렌더 최종 눈검수.
- ✅ **T15** .rsrc 패처 — RT_MENU/DIALOG/STRING 재직렬화 도구 + 22 한글 UI문자열(PE는 UTF-16LE). `logh7_rsrc_patch.py`. needsLive=라이브 메뉴.
- 🟡 **T07** cave 동적셀 — immediate(38B)·cell-mem deref(46B) 빌드가능; **full scan(112B)은 48B cave 초과 → 섹션 필요(needsSection)**. RE체인 capstone검증.
- ✅ **T17** face-atlas 슬롯 — 슬롯한계 RE + 바이트패치 + G-aware tcf packer. needsLive.
- ✅ **T24/T25** 그래픽 빌드배선 — `--remaster-res` opt-in(기본OFF) + `--pathA`. needsLive=1920×1080.
- ✅ **T26** 텍스처 업스케일 — `logh7_upscale_textures.py`(무침습, 651 .tga중 470+가 8bit 팔레트). needsLive.
- ✅ 해상도 감지(--detect)/프리셋(--list 18종)/lobby-res(8/8)/워터마크off
- 🔄 **galaxy-sim 워크플로 실행중**(T03/04/06/11/12/22) — 서버 **788테스트** 그린(+35)

**needsLive 배치(로비서 확인가능, 월드 무관)**: 폰트(맑은고딕)·rsrc(메뉴한글)·lobby-res·widescreen — galaxy-sim 완료 후 한 클라에 묶어 라이브 시각검증.

## MDX 조사 결론 (T37 관련)
- `Null_galaxy.mdx` = **위치 없는 템플릿**: 79항성 + 분광형(G19/M21/K17/F8/A7/B5/O2) + 카논순서만, **트랜스폼 전부 0**(위치는 런타임/시나리오, 원본서버와 소실). → 위치 MDX재import 불가.
- 항행불가 오배치 = **그리드 투영 문제**(buildStrategicGalaxyGrid가 is_corridor 무시). 위치소스 후보=galaxy_all.bmp(星系図 비트맵). MDX 분광형은 galaxy.json 병합 가능(권위 개선).

## 닫힘 (2026-06-20 세션 — Phase B 감사 + 첩보/쿠데타/연령 배선)

⚠️ **backlog stale 정정**: 아래 도메인은 "미구현 추정"으로 적혀 있었으나 **실제로는 모듈+테스트 구현 완료**
(2026-06-20 감사: 전 Phase B 도메인이 [모듈+테스트] 보유). 미래 작업은 재구현이 아니라 **배선/검증**을 겨냥할 것.
- ✅ **B4 전투 未実装 항목**: `logh7-air-combat.mjs`(戦闘艇 공중전 §3.1)·`logh7-combat-death.mjs`(戦死 §3.2)·
  battle-engine morale(艦隊最大士気 0x33b/0x33f)·`logh7-surrender.mjs`(항복권고) — 전부 구현+테스트.
  (잔여: air-combat가 command-engine/battle 흐름에 미배선 — wiring만 남음.)
- ✅ **B5 명예**: `logh7-imperial-titles.mjs`(작위 공작~제국기사·封土 授与/直轄·fiefIncome·validateGrant*,
  login-session 배선+테스트)·`logh7-honors.mjs`(叙勲은 캐논상 未実装→사다리 법칙3 SKIP, 의도적)·
  `logh7-age-drift.mjs`(연령 드리프트). rank-ladder 법칙2(爵位 타이브레이커) 구현.
- ✅ **B6 첩보&쿠데타 (이번 세션 완성)**: `logh7-intel.mjs`(espionage roll+叛乱충성 프리미티브)+
  `logh7-coup.mjs`(叛意/謀議/説得/参加/叛乱/査閲 + 완전승리 게이트, +10테스트)+`logh7-espionage.mjs`
  (체포매트릭스 逮捕許可→執行命令→逮捕命令 + 침투 潜入/情報/破壊/脱出 + 煽動/監視/襲撃, +9테스트). 와이어는
  클라 opcode 미확정이라 미배선(로직·테스트 완비).
- ✅ **B5 age-drift 배선 (이번 세션)**: world-state 캐릭터 abilities[8]+age + applyMonthlyAgeDrift +
  createStrategicSim 월간 훅(무유저 갤럭시서 인물 성장/쇠퇴, +5통합테스트).
- ✅ **B1 경제**: `logh7-economy.mjs`(세금→국고, LOGH_ECONOMY opt-in, 계수 P3).
- ✅ **무유저 갤럭시 코어(T03/04/06/11/12)**: strategic-sim이 buildStrategicGraph(인접)·strategicTick·
  seedStrategicFleets·decideStrategicOrder·resolveStrategicBattle 보유(backlog "0%" 정정).

**진짜 잔여(배선/검증 위주)**: air-combat→battle 흐름 배선 · intel/coup/espionage 와이어(opcode 확정 시) ·
strategicTick에 economy/combat-death 통합 검증 · Phase A2(codec 추출)/A3(CQRS) 구조 리팩터 · 인-월드 입력
(DirectInput 주입, 별도 인프라 — [[logh7-inworld-input-blocked-2026-06-20]]).
- ✅ **서버 1008테스트** (2026-06-20).
