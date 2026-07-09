# 은영전 VII 리마스터 통합 로드맵 — 2026-06-26 (재구조화 후 전면 재작성)

이전 `logh7-remaster-roadmap-2026-06-25.md`를 대체. 2026-06-26 레포 재구조화
(`docs/logh7-repo-restructure-2026-06-26.md`) + 캐릭선택 서버 해결(반전) + 런처 RE/한글화
+ 6-25 게임 상태전환 결정적 RE(`docs/logh7-game-state-change-re-2026-06-25.md`)를 반영해 재정렬.

근거 문서: `logh7-loop-state.md`, `logh7-completion-matrix-2026-06-25.md`,
`logh7-outstanding-work-2026-06-25.md`, `logh7-client-state-journal.md`(#0~#5),
`logh7-galaxy-terrain-investigation-2026-06-25.md`, `logh7-real-game-behavior-2026-06-25.md`.

---

## 0. 캐논 작업처 (재구조화 확정 — 2026-06-26)

- **서버 캐논 = `server/`** (자가완결 별도 레포). 코드=`server/src/server/`(82 .mjs, 외부 의존 0),
  콘텐츠/위치권위=`server/content/galaxy.json`·`server/content/roster/`,
  테스트=`cd server && node --test tests/server/*.test.mjs` (현재 **1147: 1129 pass / 0 fail / 18 skip**).
- **클라 캐논 = `client/`** (자가완결 별도 레포). 실설치트리=`client/vendor/logh7-installed/`,
  플레이패키지=`client/dist/logh7-client/`(exe/G7MTClient.exe·data/image·model·MsgDat),
  유저 런처=`client/play-logh7.exe`(게임아이콘+UAC자동상승+①Gin7UpdateClient ②G7Start).
- **dev/RE 도구 = `RE/tools`** + 루트 `.omo`(Ghidra 인덱스 17G·RE 작업, 절대경로 `E:/logh7-revival/.omo` 참조).
- **라이브 검증**은 메인 직렬(RE/ 기준 경로, stop 시 SHA 복원 필수). 서버 구현은 워크플로/에이전트 병렬.

## 1. 사용자 정의 "진짜 게임" (합격 기준) — [[logh7-real-game-behavior-2026-06-25]]

1. **autologin 금지** — 검증은 실클라 **수동 로그인** → 캐릭생성 → 월드.
2. **로그인만 창모드(테두리), 이후 풀스크린.** (게임이 네이티브로 수행 — #1 라이브 확인됨.)
3. **캐릭터 = 초상화 여러 개 + 이름 다르게 → 별개 캐릭.** (서버 레이어 RESOLVED, 라이브 미확정.)
4. **캐논 NPC 시드 → 플레이어 하급사관(자동황제 금지).** O군 초상화=매뉴얼 문서화 인물만.
5. 모든 라이브 테스트는 `docs/logh7-client-state-journal.md` 기록(전진/정체/회귀).

## 2. 증거 기반 현 상태 (2026-06-26)

**이미 됨(서버/데이터 강함, pillar A ~76%):**
- 와이어 90%(11레코드 중 10 바이트검증, 양방향 옵코드맵; 0x030b 빌더만 부재).
- 인증/세션가드/회원가입(strict `--account-db`)·월드스테이트·NPC AI·자율 전략 시뮬·전투/지상전.
- 캐릭생성(서버) "한 캐릭터만" 버그 = **테스트 헬퍼 버그였음 → RESOLVED**(프로덕션 .mjs 무변경, 영속 length===2 입증). **라이브 미확정.**
- 캐논 NPC 위계 시드 라이브 작동(0x0323 ×26, 자동황제 픽스 #2 실증).
- 상태전환 결정적 RE 완료(AXIS1 씬KIND=로컬invoke만 / AXIS2 로드트리거 0x0f1f·0x0b09/0x0b0a·0x0b07=**서버푸시 가능**).
- 런처(Gin7UpdateClient·G7Start) RE+한글화 표면 + play-logh7.exe 빌드.

**미해결 = 플레이어-대면 상호작용 + 환경(pillar B ~40%):**
- 🔴 **라이브 월드진입 환경 플래키**(저널 #4/#5) — 반복 SetForegroundWindow 포그라운드 락 추정.
  모든 라이브 데모가 월드 도달을 전제로 함 → **현재 단일 최대 실증 블로커**(코드 아님, 환경).
- 🔴 **C002 전략 클릭 명령(0x0b01)** — RE·경로배제 100% 완결. 남은 건 순수 구현:
  함대선택 hit-test rect + 명령 카탈로그 빌더(`FUN_004f5cb0`) + 명령 row 클릭. mode2 자연 미충족.
- 🔴 **0x7000 credential 빈값 결함**(저널 #3) — strict 로그인 시 account 라벨이 클라 credential에 안 담김(클라 입력 RE).
- 🟡 **전술맵/직무패널/拠点패널 시각 해금** — 서버 데이터 경로 작동, 클라 mode/패널오픈 게이트(AXIS2/C002 종속).
- 🟡 **갤럭시 특수지형 데이터 부재** — galaxy.json에 plasma/sargasso 셀 미인코딩(회랑만 부분). 수동 큐레이션 필요.
- 🟡 **리마스터** — HUD/UI TGA 6%(20/662)·모델 0%(0/406 MDX). AI 초해상 바이너리 부재 → 외부 업스케일러 필요.

## 3. 마일스톤 (범위=전체)

- **M0 기반/재구조화** — ✅ done(server/client/ 자가완결 별도 레포, 테스트 1129:0, RE 행렬 ~11%).
- **M1 실플레이 게이트(현재 집중)** — §1 5조건. 핵심=라이브 월드진입 신뢰화 + 실 credential + 별개캐릭 라이브.
- **M2 상태전환/맵전환(AXIS2)** — 0x0f1f/0x0b09·0x0b0a 서버푸시로 전략↔전술 시각전환 실증(클릭/패치 불요).
- **M3 인월드 상호작용(C002)** — 함대선택+명령메뉴 빌더 구현 → 0x0b01 라이브. 직무/拠点패널 오픈.
- **M4 전투/전술 렌더** — 완전 전술 시드 데이터 → 배틀필드 렌더(현재 모드전환 UI 패널까지).
- **M5 콘텐츠/캐논** — NPC 로스터 정제(rank 클램프·명 unmask)·매뉴얼 11 JSON 배선·특수지형 큐레이션·작위/직위.
- **M6 리마스터/한글화/배포** — HUD/UI/모델 텍스처·로그인버튼 배경·채팅 cp932 픽스·런처 .rsrc 한글·풀스크린 필러.
- **M7 전수 RE** — G7MTClient 5.7%→임계경로 우선(C002 잔여·credential 빌드 경로).

## 4. P0 게이트 큐 (재정렬)

| id | 상태 | 항목 | 캐논 작업처 | 다음 증거 |
|---|---|---|---|---|
| G0 | **next(1순위)** | 라이브 월드진입 신뢰화 | RE/tools, client/ | 환경 리셋 후 단일 세션: autologin-bootstrap-emp1 + `keep_foreground.py`(연속 SetForeground 금지·1회 홀드) → `0x0f02` trace. 포그라운드 락 회피 절차 확립 |
| G1 | next | 상태전환 라이브 실증(AXIS2) | server/, RE/tools | 월드 도달 후 라이브 `worldbase+0x3579cc` 읽어 레버선택 → 서버 **0x0f1f(byte0=1)** 푸시 → `+0x357e88=0x3f800000`·`+0x126711` 변화 + 전/후 스크린샷 |
| G2 | next | 별개캐릭 라이브 확정 | client/(라이브) | 수동 로그인 → 2×0x1008(이름 다르게) → 0x2004 picker 2 distinct 카드 + 월드 최근캐릭 스폰(저널 기록) |
| G3 | blocked→active | C002 명령 서브시스템 구현 | RE/tools→client patch | 함대선택 hit-test rect + 명령카탈로그 빌더(`FUN_004f5cb0`) populate → 명령 row 클릭 → `FUN_005737d0` → 0x0b01 라이브 |
| G4 | next | strict credential 빈값 픽스 | RE/tools, client | 클라 0x7000 credential 빌드 경로 RE(account/pw 버퍼 출처) → strict `--account-db` 로그인 trace account≠null |

## 5. Critical Path & 병렬 트랙

**Critical path(직렬, 메인 라이브):** G0(월드진입 신뢰화) → G1(AXIS2 상태전환 실증) → G2(별개캐릭) → G3(C002).
G1이 "며칠째 전략맵 정체"의 결정적 돌파 — C002(클릭)는 상태전환과 **decoupled**라 G1이 먼저 시각 진전을 만든다.

**병렬(워크플로/에이전트, server/ 무충돌):**
- M5 콘텐츠: NPC 로스터 정제(rank 클램프·canon명 unmask) · 매뉴얼 11 JSON 배선 · 특수지형 수동 큐레이션(galaxy.json `terrain` 필드 신설).
- M6 리마스터: HUD/UI TGA bulk 업스케일 · 채팅 cp932 송신 픽스 code-cave · 런처 .rsrc 한글.
- M7 RE: C002 명령빌더 잔여 deep-RE · 0x7000 credential 빌드 경로.
- 와이어: 0x030b(함선클래스) 빌더 추가.

## 6. 단일 최대 게이트 + "막히면 우회"

**단일 최대 게이트 = G0(라이브 월드진입 환경 신뢰화).** C002가 아니라 **라이브 구동 환경**이
현재 진짜 병목 — 모든 시각 실증(G1~G3)이 월드 도달을 전제하는데 저널 #4/#5에서 포그라운드 락으로 전면 실패.
코드/RE는 준비됨(상태전환 레버·Frida invoke 하네스·full-flow 세션1 실증). 실증만 환경복구 대기.

**막히면 우회:**
- G0 라이브가 계속 플래키 → 서버/콘텐츠/리마스터 병렬 트랙(§5)으로 전진(데이터 경로는 이미 동작, 라이브 무관).
- G3 C002가 깊으면 → G1(AXIS2 서버푸시 상태전환)으로 시각 진전 확보(클릭 불요). C002는 별도 deep-RE 웨이브.
- 라이브 자체가 막히면 → 서버 테스트(1129:0)로 회귀 가드하며 데이터/와이어/콘텐츠 완성도 끌어올림.

## 7. 즉시 다음 행동 (구체적, 캐논 경로/명령)

1. **환경 리셋(재부팅/락 타임아웃) 후 단일 클린 세션** — logh7-live 스킬: autologin-bootstrap-emp1 +
   `keep_foreground.py`(연속 SetForegroundWindow 금지, 1회 홀드 ~35s) → `0x0f02` 도달 → 저널 #6 기록.
   (G0. 포그라운드 락 회피가 핵심 — 첫 세션 47900만 성공한 원인.)
2. **G1 상태전환 라이브** — 월드 도달 즉시 `worldbase+0x3579cc` 1-watch로 레버선택 →
   `server/src/server` env로 **0x0f1f(byte0=1)** 푸시(또는 0xb09+0xb0a) → `+0x357e88`/`+0x126711` 변화 + 전/후 shot.
   `docs/logh7-game-state-change-re-2026-06-25.md` §AXIS2 절차.
3. **병렬: NPC 로스터 정제 워크플로** — `server/content/roster/canon-character-posts.json` 소스로
   rank 클램프(현재 title만)·canon명 unmask·O군=매뉴얼인물 한정 → `cd server && node --test tests/server/*.test.mjs` 무회귀.
4. **병렬: 특수지형 수동 큐레이션** — `server/content/galaxy.json`에 `terrain`(`"plasma"|"sargasso"|null`) 필드 신설,
   매뉴얼 §6.1 + 회랑 사이 빈영역 기준. 0x0315 빌더가 byte1∉{1,3} 내려보내 항행불능 처리(자동 추출 소스 없음 확정).
5. **병렬: G4 credential RE** — RE/tools redex로 클라 0x7000 credential 빌드 경로(account/pw 버퍼 출처) 추적 →
   strict `--account-db` 로그인 trace account≠null 목표(저널 #3 빈값 결함 해소).
