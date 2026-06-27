# LOGH VII 리바이벌 — 확장 로드맵 2026-06-23

> **작성일:** 2026-06-23
> **기반 문서:** `docs/logh7-mp-roadmap-2026-06-23.md` (존중 및 확장)
> **목표:** MP 서버 오픈을 중심으로 한 기존 로드맵을 전 게임 도메인으로 확장, 세분화

---

## 1. 상태 요약

| 항목 | 값 |
|------|-----|
| 서버 테스트 | test:server 1137 pass / 0 fail |
| Canonical SHA | c1523a5e (expected), 실행은 8a2a2c33 (autologin emp1 부트스트랩) |
| RE 커버리지 | deep-RE 277/945/10.6% (G7MTClient 277/6089=4.5%), lightdoc 18,485/18,485(100%) |
| C002 | 근본 미종결 (command-table category record count=0) |
| 0x0b07 클라 적용 | 와이어·디스패치·생존 입증, **라이브 측정 미실행** (M1 선결) |
| 리포 상태 | non-git (`.git` 비어 있음) |

---

## 2. 변경 요약 (기존 로드맵 대비)

| 변경 | 내용 |
|------|------|
| **마일스톤 수 확장** | 4개(M0/M1/M2/M-final) → 12개 (8개 병행 트랙 추가) |
| **C002 위치 재조정** | "함수RE 100% 완결·순수 구현만" 철회 → P1 병행 트랙 `M-C002`로 격리 |
| **0x0b07 라이브 측정** | M0 "확정 기반"에서 제거 → M1 critical path 3번으로 이관 |
| **소속 투영 승격** | "병행 분리" → M2 코어 (사용자 체감 "진영 나뉘어" 필수) |
| **전술맵/내정/갤럭시시뮬/리마스터/운영** | 기존 "MP 오픈 후 병행" 암시 항목을 독립 마일스톤으로 정식화 |
| **데이터 완성도** | 천체/rooms/institutions + 성계 위치 보정 + 출처 등급 확정을 `M-Content`로 통합 |

---

## 3. 마일스톤 상세

### 3.1 P0 — Critical Path (MP 서버 오픈 필수)

---

#### M0 — 현재: 확정된 기반

**상태:** 진행 중 (일부 항목 라이브 입증 완료, 일부는 코드/테스트만)

**목표:**
- 권위적 서버 기반 완성 및 검증
- 클라이언트 월드진입 라이브 입증
- 멀티플레이 핵심 메커니즘(세션/가시성/동시성) 확정
- 콘텐츠 데이터베이스 구축
- 함수 RE 인프라 구축
- C002 메커니즘 완전 규명(근본 미종결 상태 기록)

**산출물:**
- 서버 권위 게임 엔진 코드 완성 (test:server 1137 pass/0 fail)
- autologin 월드진입 풀체인 라이브 (0x7000→0x0f02)
- MP 메커니즘 라이브 확정: 동시세션가드 / distinct 함대 / 교차 가시성
- canon-801-07 2:2 진영 시나리오 기본 배선
- 와이어 프로토콜 양방향 옵코드맵 (recv 169행 + send)
- 0x0323/0x0b07/0x0313/0x0315/0x0b09/0x0b0a byte-correct
- 함수 전수 RE 캠페인 착수 (deep-RE 945/8896, lightdoc 100%)
- 라이브 월드진입 해결 (포그라운드 의존 스플래시)
- C002 6-레이어 서브시스템 완전 매핑 (근본 미종결)
- 한글화 완료 (String.txt cp949, .rsrc UTF-16LE, Pretendard 폰트)
- 데이터 전수 추출 (80성계/281행성/6요새/97인물/64함급/489초상화)
- 로그인→로비→세션→월드 로드 라이브 검증

**검증 기준:**
- test:server 1137 pass/0 fail
- autologin 월드진입 trace 0x7000→0x0f02 라이브
- 4클라 distinct unit 라이브
- 0x0323 15/15 필드 바이트레벨 검증
- coverage-report 산출 문서 기준 deep-RE 277/945/10.6%
- lightdoc 18,485/18,485(100%)

**리스크:**
- C002 근본원인 미종결 (command-table category record count=0)
- 0x0b07 클라 적용 라이브 미측정 (디스패치 경로만 정적 RE)
- 0x0325 unit record 88B vs 네이티브 756B 불일치 (officer 필드 누락)
- 진영 분리 라이브 미실증 (하네스 클릭좌표 빗나감)
- 소속(faction) 맵/패널 미표시 (소비처 미확정)
- cross-client 유저 이동 부재 (relay 라이브 trace 부재)
- 리포 non-git 상태 (버전관리 복구 필요)
- 서버 localhost-only 바인드

**의존성:** 없음 (시작점)

---

#### M1 — 서버 권위 MP '관전/데모 이동' 오픈 (C002 불필요 경로)

**상태:** 미착수 (M0 일부 항목에서 이관)

**목표:**
- strict 인증을 운영 기본으로 고정하고 라이브 검증
- 0x0b07 서버푸시가 클라에 실제 적용·반영되는지 데모 입증
- 서버 운영 환경(LAN 바인드, 멀티계정) 구축
- 라이브 측정 evidence를 loop-state에 정식 등록

**산출물:**
- strict 인증 운영 표준화 (acceptAnyGin7=false + --account-db + scrypt verify)
- 서버 멀티계정 ops + LAN 바인드 (localhost→LAN)
- 0x0b07 클라 적용 라이브 측정 (4점 메모리 probe: 버퍼도착/+0x2a58f8 게이트값/0x16 enqueue/유닛셀 A·B)
- 0x0b07 서버푸시 데모 가시화 라이브 (self-push probe로 클라 적용·반영 검증)
- live20/21 문서화 (loop-state.md 정식 등록 + trace.jsonl 서버 SEND만 기록 명기)
- 4클라 strict 라이브 검증 (exact-credential 폼 로그인)
- fleet-render own-fleet 마커 case0 1회성 타이밍 확인

**검증 기준:**
- 4클라 strict 인증으로 로그인→월드진입 라이브
- 0x0b07 4점 메모리 probe 전부 측정값 기대범위 내
- self-push probe로 클라 이동 반영 확인 (trace + 스크린샷)
- loop-state.md에 live20/21 evidence 앵커 등록
- 서버 LAN 바인드 후 외부 연결 테스트

**리스크:**
- 0x0b07 클라 적용 측정 실패 (grid-active 게이트가 autologin 세션에서 set되지 않음)
- D3D8 클라 포그라운드 상실 시 루프 정지 (probe 동시 실행 필요)
- fleet-render own-fleet 마커 case0 1회성 타이밍으로 시각 반영 미확정
- strict 인증 4클라 E2E에서 예상치 못한 회귀
- LAN 바인드 시 Windows 방화벽/네트워크 설정 이슈

**의존성:** M0

**예상 effort:** 중대 규모 (M+M+M+S+S)

---

#### M2 — 진영 분리(2:2) + cross-client 이동 가시화 라이브 실증

**상태:** 미착수

**목표:**
- 진영 2:2 분리가 실클라에서 실제로 작동하도록 좌표 교정+라이브 실증
- 소속(faction)이 맵/패널에 표시되도록 투영
- cross-client 'A가 이동→B가 봄' 라이브 입증
- 4클라 end-to-end 전체 흐름 검증
- 영속성 round-trip 검증

**산출물:**
- 진영 분리 좌표 재교정 (alliance 라디오 좌표 핀, 1920×1080 캡처)
- 진영 reconcile 라이브 실증 (power3→alliance trace, conn powerId 1281 확인)
- 소속(faction) 맵/패널 투영 (맵 byte2 / 패널 iVar9+0xa 소비처 deep-RE 확정 후 투영)
- cross-client 유저-가시 이동 라이브 (C002 해결 또는 relay-originate 경로 신설)
- 라이브 4클라 2:2 E2E (진영분리+월드진입+서버권위 이동+전투+영속)
- 더티체킹 영속 long-run round-trip (4클라 재시작 후 상태 복구)
- 0x0325 네이티브 756B 레이아웃 RE → officer 필드 서버 배선

**검증 기준:**
- 4클라 2:2 진영 분리 라이브 (2제국+2동맹, trace powerId 확인)
- alliance 라디오 좌표 캡처→재교정→conn powerId 1281 확인
- faction 색이 맷/패널에 표시 (스크린샷)
- cross-client 이동 라이브 (클라A 이동→클라B에서 마커 확인, trace)
- 4클라 E2E 60초+ 무크래시
- 재시작 후 상태 복구 확인

**리스크:**
- C002 미해결 시 cross-client 유저 이동 불가 (relay-originate 경로 신설 필요)
- faction 소비처 deep-RE 실패 (맵 byte2가 spectral·faction 겸용인지 미확정)
- 4클라 E2E에서 동일성/인증/세션 관련 예상치 못한 상호작용
- 0x0325 officer 필드 누락이 교차가시성 품질에 영향 (미검증)
- 더티체킹 long-run에서 SQLite 영속 버그

**의존성:** M1

**예상 effort:** 최대 규모 (M+M+XL+L+S)

---

#### M-final — MP 서버 오픈 (배포)

**상태:** 미착수

**목표:**
- 단일 커맨드로 배포 가능한 패키지 구성
- 버전관리 복구
- 데모 MP 또는 유저 기원 MP 범위 명시 배포

**산출물:**
- 패키징 단일 커맨드 (player_runtime CLI + D3D8.dll + Pretendard TTF + install-pretendard.ps1 동봉)
- git 버전관리 복구 (git init 및 초기 커밋)
- P0-05 필러박스 dgVoodoo (stretched_4_3 + 와이드 스크린샷 라이브, 선택)
- 배포 문서 (데모 MP vs 유저 기원 MP 범위 한정 명기)
- 런처 자동 배선 (어드민 포트, 폰트 설치, 서버/클라이언트 환경변수)

**검증 기준:**
- 단일 CLI 커맨드로 서버+클라이언트+런처 전부 기동
- git rev-parse --git-dir 성공
- 배포물 압축→해제→실행 1회성 검증
- 데모/유저기원 범위 문서 포함 확인

**리스크:**
- C002 미해결 시 '유저 기원 인터랙티브 MP' 범위 한정 배포 필요
- 패키징 시 EXE/리소스/폰트 의존성 누락
- dgVoodoo 호환성 이슈
- 배포물 문서화 부족으로 사용자 혼란

**의존성:** M2

**예상 effort:** 중간 규모 (L+S)

---

### 3.2 P1 — 병행 트랙 (MP 게이트 아님, 코어 게임플레이 완성)

---

#### M-C002 — 유저 기원 in-world 명령 활성화 (병행 트랙)

**상태:** 블로커 (근본 미종결)

**목표:**
- 실클라 마우스로 직접 in-world 명령(0x0b01) 송신 가능
- cross-client 유저 기원 이동의 게이트 해제
- 6-레이어 서브시스템 end-to-end 작동

**산출물:**
- C002 유저 기원 0x0b01 직접 송신 (6-레이어 서브시스템 구성: ①패널위젯→②catGate→③officer데이터→④함대선택→⑤명령메뉴→⑥dispatch)
- 패널 위젯 구성 RE+fix (FUN_0054e570→FUN_004ff3c0, autologin 월드 트리거)
- 0x0325 네이티브 756B 레이아웃 RE (officer 필드 0x24c/0x250)
- catGate→선택→메뉴→dispatch positive-control 검증
- command-table category record count=0 근본 해결

**검증 기준:**
- 실클라 마우스 좌클릭→0x0b01 송신 trace 확인
- 명령 메뉴 row가 실제로 표시되고 클릭 가능
- dispatch 후 서버가 0x0b01 수신→0x0b07 broadcast
- cross-client 이동 가시화 (클라B가 클라A 이동 확인)

**리스크:**
- 근본원인 미종결 (command-table category record count=0)
- 6-레이어 구성이 복수 컴포넌트 동시 구현 필요 (effort XL)
- 패널 위젯 구성이 autologin 월드에서 미실행하는 이유 미확정
- 0x0325 756B 레이아웃 RE 실패
- mode 배타성(mode2↔mode0)으로 인한 오염 위험

**의존성:** M0

**예상 effort:** XL

**비고:** "데모/관전 MP"의 게이트는 아니나 "유저 기원 인터랙티브 MP"의 게이트. 목표 정의 핵심 동사 "(유저가)내며"를 닫는 트랙.

---

#### M-RE — 함수 전수 RE 캠페인 완결 (병행 트랙)

**상태:** 진행 중 (10.6%)

**목표:**
- 클라이언트 전체 함수 100% RE 커버리지
- coverage 행렬 동기화
- 미확정 opcode 클라 파서 RE

**산출물:**
- 함수 전수 deep-RE 8896 전부 완료
- coverage-report 재실행 (ledger 294 반영, 277→294 동기화)
- wave3 verifier partial 16건 정정
- G7Start/Gin7/setup 잔여 바이너리 RE
- 와이어 미확정 opcode 배선 (coup/intel/espionage/relations)

**검증 기준:**
- deep-RE 8896/8896 (100%)
- coverage-report G7MTClient 294/6089 반영
- wave3 verifier 16건 정정 완료
- 미확정 opcode 목록 0건

**리스크:**
- effort XL (8896 함수 전수)
- 세션한도로 인한 ledger_sync 중단
- wave3 verifier partial 16건 정정의 복잡도
- 미확정 opcode 클라 파서 배선 불가

**의존성:** M0

**예상 effort:** XL

---

#### M-Battle — 전술맵 풀 진입/전투/퇴장 (병행 트랙)

**상태:** 부분 (NotifyChangeMode 0x42f placeholder, 전술데이터 불완전)

**목표:**
- 클라이언트가 실제로 전술맵에 진입·조작·퇴장 가능
- 배틀 setup 테이블 풀 구현
- 전투 fire loop 완전화

**산출물:**
- P1.1 NotifyChangeMode spawn-pose seeding (0x42f full participant pose array)
- P1.2 Battle-setup data tables (PositionUnit, UnitShip, FillShield/BeamGun)
- P1.3 Battle entry orchestration (0xb06/0x411→open field+push tables+0x42f+0xf1f)
- P1.4 AirBattle 0x40e/0x428 + Confusion 0x43d/0x43e
- P1.5 Turn/Reverse/Stop 0x401/0x403/0x40a
- P1.6 Destruction + morale hardening
- P1.7 Battle teardown (exit back to strategic)
- P1.8 Live verification (probe + crash-catcher + screenshot)

**검증 기준:**
- test:server 전투 관련 테스트 추가 통과
- probe로 클라 전술맵 진입 확인 (client+0x126718 active flag)
- 함대 전투 60초+ 무크래시
- 스크린샷으로 전술맵 렌더 확인

**리스크:**
- NotifyChangeMode pose seeding 실패 시 함선 원점 스폰
- battle-setup 테이블 부족 시 전술맵 empty
- 전투 퇴장 시 클라 crash
- live verification 시 D3D8 stall/crash
- placeholder 전술데이터 불완전

**의존성:** M0

**예상 effort:** XL

---

#### M-Internal — 내정·전략·소셜 전체 구현 (병행 트랙)

**상태:** 부분 (P2.1-P2.4, P3.1-P3.3, P4.1-P4.3, P5.1-P5.3 중 일부만 구현)

**목표:**
- 내정(경제/인사/시설) 전체 데이터 모델 서버 구현
- 전략/물류/시설 커맨드 구현
- 소셜/채팅/계정 기능 구현
- 간단정보(0x12xx) 델타 싱크

**산출물:**
- P2.1 Static master tables (0x309/0x30b/0x30d/0x30f/0x311)
- P2.2 Personnel card catalog (0x305/0x307/0x34f)
- P2.3 Per-base economy/facilities (0x321/0x327/0x329)
- P2.4 Fleet/outfit org (0x32b/0x32d/0x32f/0x331)
- P3.1 Card appointment/dismiss/resign
- P3.2 Rank up/down + create outfit
- P3.3 Char-info notify builders (0x356/0x358/0x43a/0x43b)
- P4.1 SupplyFuel/Search (0xb02/0x240/0xa9c)
- P4.2 Load/Unload troop + Reorganization + CarryingInOut
- P4.3 MoveBase/MovedBase + LeaveOutGrid + institutions
- P5.1 Simple-info 0x12xx pump
- P5.2 Chat siblings + settings
- P5.3 Account/character entry + mail

**검증 기준:**
- 각 phase별 테스트 추가 통과 (P2.1→P5.3)
- builder round-trip 검증
- dispatch size 정확성 확인
- live probe로 내정 패널 데이터 표시 확인

**리스크:**
- 와이어 레이아웃 PROVISIONAL (0x031f 스칼라 25개, 0x0321 스칼라명)
- builder dispatch size 초과/미달 시 클라 throw
- 내정 데이터 복잡도로 인한 테스트 부담
- P3 인사 엔진의 outfit seat 테이블 복잡성

**의존성:** M0

**예상 effort:** XL (P2→P5 전체)

---

### 3.3 P2 — 병행 트랙 (콘텐츠·시뮬·리마스터·운영)

---

#### M-Content — 콘텐츠 데이터 완성 및 보정 (병행 트랙)

**상태:** 부분 (80성계/281행성/6요새/97인물/64함급 보유, 천체/rooms/institutions 0)

**목표:**
- 콘텐츠 데이터 완성도 100%
- 성계 위치 항행불가주역 회피
- 천체/행성/소속 데이터 출처 등급 확정
- 시작 세션 시나리오 고정

**산출물:**
- 천체 astronomy 0/80 복구
- rooms 0 복구
- institutions 0 복구
- 행성 렌더링 (전략+전술맵) RE/라이브 확인
- 성계 위치 보정 (항행불가주역 회피, T37 페잔 적용)
- 80성계 소속 출처 등급별 확정
- 행성/천체 데이터 필드별 출처 등급 확정
- 시작 세션: 진영/원수/요직/함대/주둔지/수도/승리조건 매뉴얼 기준 고정

**검증 기준:**
- galaxy.json 모든 성계가 항행가능 셀에 배치
- canonCol/canonRow 출처 문서화
- 시나리오 시작 세션 데이터 검증
- 행성 렌더링 라이브 확인 (스크린샷)

**리스크:**
- MDX 위치 없음 (Null_galaxy.mdx = 템플릿, 트랜스폼 전부 0)
- galaxy.json 투영이 항행불가 셀에 배치
- 천체/rooms/institutions 데이터 원본 부재
- 행성 렌더링 미표시 시 와이어/데이터 추가 배선 필요

**의존성:** M0

**예상 effort:** L (M×3 + S×2)

---

#### M-GalaxySim — 무유저 전략 갤럭시 시뮬 완성 (병행 트랙)

**상태:** 부분 (strategicTick 코어 구현, 배선/검증 미완)

**목표:**
- 유저 없이 진영전쟁이 자율 진행되는 전략 시뮬
- NPC 함대 AI가 자율적으로 이동/교전
- 성계 소유권이 전투 결과에 따라 변동
- 경제/인구/세수가 틱마다 갱신

**산출물:**
- 무유저 갤럭시 시뮬 완성 (strategicTick + seedStrategicFleets + decideStrategicOrder + resolveStrategicBattle)
- 전략 함대 시드 배선 (upsertFleet/moveFleet)
- 갤럭시 인접 그래프 (galaxy.json edge/neighbor)
- 사령관 의사결정 AI (카논 8능력치/계급/직위)
- 성계 소유권 변동 (conquerSystem/setSystemOwner)
- 주기 broadcast (0x12xx simple-info pump)
- 경제/전투사망 통합 (strategicTick에 economy/combat-death)
- NPC AI 행동 (자율 이동/교전/방어/증원)

**검증 기준:**
- strategicTick 1회 실행 후 world-state 변경 확인
- NPC 함대 이동 trace (0x0b07 broadcast)
- 성계 소유권 변동 로그
- 경제 틱 후 세수/국고 변경 확인
- 주기 broadcast 메시지 수 제한 확인

**리스크:**
- 무유저 갤럭시 코어 구현은 되었으나 배선/검증 미완
- strategicTick에 economy/combat-death 통합 검증 부재
- NPC AI 복잡도 (8능력치/계급/직위 종합)
- 성계 소유변동의 브로드캐스트 퍼포먼스
- 주기 broadcast 과다로 인한 네트워크 부하

**의존성:** M0

**예상 effort:** XL

---

#### M-Remaster — 리마스터·현지화 마무리 (병행 트랙)

**상태:** 부분 (로비 리마스터 완료, 나머지 미착수)

**목표:**
- 전 게임 화면 시스템 해상도 기준 좌표/텍스처 재배치
- 한국어 텍스트 품질 향상
- 그래픽 품질 향상 (업스케일/필터링)
- 런처 자동화

**산출물:**
- 전 화면 네이티브 리마스터 (로비 외 설정/캐릭터/세션/월드 패널)
- 텍스처 업스케일 (AI .tga 업스케일/DXVK 래퍼)
- CJK/Latin/JP 혼용 문구 잘림 없이 표시
- 어색한 한국어 문구 재검수
- 채팅 cp932 code-cave 인코딩
- constmsg mojibake 5종 수정
- P0-05 필러박스 dgVoodoo (선택)
- 런처 폰트/서버/어드민 자동 배선

**검증 기준:**
- 로비 외 1개 화면 네이티브 리마스터 라이브
- 텍스처 업스케일 전후 비교 스크린샷
- 한국어 문구 100% 검수
- 채팅 한글 송신 라이브 (cp932 문제 해결 후)
- 런처 자동 배선 확인

**리스크:**
- 전 화면 리마스터 effort 대비 효과 (로비만 검증됨)
- 텍스처 업스케일 AI 도구 부재
- 채팅 cp932 code-cave가 폰트렌더 공유로 일본어 회귀
- dgVoodoo 호환성 이슈
- CJK 혼용 잘림은 클라 GDI 한계

**의존성:** M0

**예상 effort:** L

---

#### M-Ops — 운영·모딩·배포 인프라 (병행 트랙)

**상태:** 부분 (서버 스냅샷 SQLite, 어드민 API 미구현)

**목표:**
- 운영/관측 인프라 구축
- 모딩 생태계 기반 마련
- 배포/운영 자동화

**산출물:**
- 어드민 관측 API (인메모리 월드 상태 HTTP 노출)
- 세션 상태 대시보드 연결
- 로비 공지 실클라 표시 확인
- 게임 세션 상태 어드민 API
- AWS/Docker 운영용 설정 분리
- 서버 스냅샷 저장소 SQLite 기본 고정
- 모딩 스캐폴드 완성 (mod-loader, content-caps, 예제 mod)
- 초상화 슬롯 신규 생성 (TCF 패커)
- 전 요소 데이터 주도 (카탈로그 ~600 메시지)

**검증 기준:**
- 어드민 API /admin/session-state 응답 확인
- 로비 공지 실클라 표시 스크린샷
- 모드 로드 순서/conflict 검증
- TCF 패커 라운드트립 검증
- Docker 빌드 성공

**리스크:**
- 어드민 API 보안 (비밀번호/키 노출 위험)
- 모딩 스캐폴드 복잡도
- AWS/Docker 설정 분리의 유지보수 부담
- TCF 패커 라운드트립 검증 미완

**의존성:** M0

**예상 effort:** L

---

## 4. Critical Path 종합 (의존성 그래프)

```
M0 (현재 기반)
│
├─→ M1 (strict 인증 + 0x0b07 라이브 측정 + 관전 데모)
│   │
│   ├─→ M2 (진영 2:2 + cross-client 가시화)
│   │   │
│   │   └─→ M-final (배포)
│   │
│   └─→ [병행] M-C002 (유저 기원 명령 — M2 cross-client의 게이트)
│
├─→ [병행] M-RE (함수 전수 RE)
├─→ [병행] M-Battle (전술맵)
├─→ [병행] M-Internal (내정·전략·소셜)
├─→ [병행] M-Content (콘텐츠 데이터)
├─→ [병행] M-GalaxySim (무유저 갤럭시 시뮬)
├─→ [병행] M-Remaster (리마스터·현지화)
└─→ [병행] M-Ops (운영·모딩·배포)
```

**C002 Critical-Path 판정:**
- 데모/관전 MP (M0→M1→M2→M-final): **C002 불필요** — 서버푸시/relay 우회 가능
- 유저 기원 인터랙티브 MP: **C002 필요** — M-C002 또는 M2 cross-client 경로에 포함

---

## 5. 레퍼런스 활용 계획

### 5.1 원본 UI 레퍼런스 134장

- **위치:** `docs/logh7-original-ui-reference-2026-06-23.md` + `.omo/reference/CATALOG.md`
- **활용 마일스톤:** M-Remaster, M-Content, M-Battle
- **구체적 활용:**
  - C002 타겟: en004 넷마블한국판MP "유닛선택→커맨드윈도우 좌클릭" (M-C002 6-레이어 구성 참조)
  - stay.jpg: 拠点선택 패널이 支配陣営名/統治者名/守備隊長명 실제표시 (M-Content 기지정보 패널 구현 참조)
  - uu3: 집무실+인물초상화+직무카드 (M-Internal P3 인사 엔진 참조)
  - compnel1-3: 커맨드윈도우 (M-C002 명령메뉴 구성 참조)
  - 86성계(원본) vs 우리 80: 성계 누락 6개 식별 (M-Content galaxy 보정)

### 5.2 함수 RE 커버리지 매트릭스

- **위치:** `docs/logh7-function-re-coverage-matrix.md`
- **활용 마일스톤:** M-RE, M-C002, M-Battle
- **구체적 활용:**
  - wave3 verifier partial 16건 정정 (M-RE)
  - coverage-report 재실행으로 277→294 동기화 (M-RE)
  - G7MTClient 웨이브3 startBatch=128 재개 (M-RE)
  - C002 command-table `record+0x14` 정렬·원샷 promote 타이밍 (M-C002)

### 5.3 gin7manual PDF (101p)

- **위치:** `content/galaxy.json` 출처 + `docs/logh7-manual-canon.md`
- **활용 마일스톤:** M-Content, M-GalaxySim, M-Battle
- **구체적 활용:**
  - 星系図 p101: 캐논 항성 dot 정밀추출 + Y-flip (M-Content 성계 위치)
  - 능력치 8종/계급14/진급/함선시스템 (M-GalaxySim 사령관 AI)
  - 플라즈마/사르가소 impassable (M-Content 항행불가주역)
  - 시작 세션 시나리오 (M-Content canon-801-07)

### 5.4 와이어 양방향 옵코드맵

- **위치:** `docs/logh7-inworld-multiplayer-protocol.md` + redex 인덱스
- **활용 마일스톤:** M-C002, M-Battle, M-Internal, M-RE
- **구체적 활용:**
  - coup/intel/espionage/relations 미확정 opcode 배선 (M-RE)
  - 0x0b01→0x0b07 왕복 구조 (M-C002)
  - 전투 opcode (0x405/0x406/0x40f/0x42a/0x42f) (M-Battle)
  - 내정 opcode (0x30xx/0x32xx/0x12xx) (M-Internal)

---

## 6. 다음 행동 (즉시 실행 권장)

### 6.1 Critical Path 1번: strict 인증 운영 표준화 + 4클라 라이브 검증
- `acceptAnyGin7=false` + `--account-db` + scrypt verify를 운영 기본으로 고정
- exact-credential 폼 로그인을 4클라로 라이브 검증 (현재 미검증)
- 동시에 서버 LAN 바인드(현 localhost only) 확인
- **effort:** M
- **마일스톤:** M1

### 6.2 Critical Path 3번: 0x0b07 클라 적용 라이브 측정 probe 구축
- canonical SHA 컨텍스트에서 4점 메모리 probe 구축
  - 버퍼 도착 (580B)
  - `+0x2a58f8` grid-active 게이트값
  - 0x16 ring enqueue
  - 유닛테이블 셀 또는 own-cell A·B
- **이전 self-push '소비 입증'은 라이브 미측정이므로 이 측정이 데모 MP의 실제 선결**
- live20/21을 `loop-state.md`에 정식 등록하되 trace.jsonl이 서버 SEND만 기록함을 명기
- **effort:** M
- **마일스톤:** M1

### 6.3 Critical Path 4번: 진영선택 화면 캡처 → alliance 라디오 좌표 재교정 + 소속 투영 RE
- 캐릭생성 진영선택 화면을 1920×1080에서 캡처해 동맹 라디오 좌표를 핀 (현 598,429 빗나감)
- 재교정 좌표로 4클라 2:2 생성 → `conn powerId 1281` + `world-nation-reconciled` trace 수집
- 병행으로 faction 색 소비처(맵 byte2 / 패널 iVar9+0xa) deep-RE 진행
- **effort:** M
- **마일스톤:** M2

### 6.4 병행 트랙: 함수 RE 웨이브3 재개
- G7MTClient 웨이브3 startBatch=128부터 재개
- ledger_sync 결정론 복구 (세션한도 대응)
- wave3 verifier partial 16건 정정
- **effort:** M
- **마일스톤:** M-RE

### 6.5 병행 트랙: 0x0325 네이티브 756B 레이아웃 RE
- officer 필드 0x24c/0x250 위치 확정
- C002 레이어3(직무패널 데이터) + MP 교차가시성 품질 영향 평가
- **effort:** M
- **마일스톤:** M-C002, M2

---

## 7. 정직성 고지

**과대주장 정정 (기존 로드맵에서 하향된 항목):**
- 0x0b07 "클라 소비 입증" → 와이어 크기 일치 + 디스패치 경로 정적 RE + 무크래시 생존으로 하향. 클라측 실제 소비/적용·시각 반영은 라이브 미측정.
- C002 "함수RE 100% 완결·입력 우회 전수 배제·순수 구현만 잔존" → 철회. 근본 블로커가 command send 이전이며 근본원인 열림.
- canonical SHA c1523a5e 라이브 증거 맥락 → 실행 EXE는 8a2a2c33 (autologin emp1 부트스트랩 변종). c1523a5e는 expectedSha이며 stop 시 복원 검증.
- 클라 RE 커버리지 → coverage-report 산출 문서 기준 277/945/10.6%. ledger 294는 wave3 +17이 coverage 도구로 미재산출.

**라이브 미검증 (코드/테스트만 존재):**
- 0x0b07 클라 적용/시각 반영, 0x0b01→0x0b07 4클라 왕복 trace, strict 모드 4클라 E2E, exact-cred 폼 로그인, 진영 분리(동맹 2명 실현), 소속(faction) 맵/패널 표시, cross-client 유저-가시 이동, 더티체킹 long-run 영속 round-trip, NPC 함대전 4클라 재검증, P0-05 필러박스, 서버 LAN 바인드.

**추측 / P3 (원본 서버데이터 아님):**
- 전투/피해/지상전 공식, planet-economy 전체, canon-801-07 fleet.commander 대부분 0, supply=100, plasma storm 셀, command-range 상한/충전속도, 0x0325 슬롯 시맨틱, NotifyMovedGrid header dword0-3.

**PROVISIONAL:**
- 0x031f base 스칼라 ~25개 NAME↔offset, 0x0321 institution/spot 스칼라명, 분광형 이름별 등급, 0x0325 officer 필드 누락의 교차가시성 영향, `+0x2a58f8` grid-active 게이트가 autologin 자연 세션서 set되는 조건.

**미확정 (deep-RE 필요):**
- faction 색 소비처 (맵 0x0313 byte2가 spectral·faction 겸용인지 / 패널 owner iVar9+0xa faction-색 해석)
- C002 command-table `record+0x14` 정렬·원샷 promote 타이밍
- fleet-render own-fleet case0 1회성 타이밍
- cross-client relay-originate 경로 (C002 외 대안 존재 여부)

---

> **생성:** 기존 `docs/logh7-mp-roadmap-2026-06-23.md` 존중 + 확장. 12개 마일스톤, 8개 병행 트랙 추가, 정직성 고지 유지.
> **이어가기 시작점:** 이 문서 + `docs/logh7-mp-roadmap-2026-06-23.md` + `docs/SESSION-HANDOFF-2026-06-23.md` + `docs/logh7-loop-state.md`
