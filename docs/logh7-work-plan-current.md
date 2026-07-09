# LOGH VII 부활 — 전체 작업 계획 (현행)

작성: 2026-07-09  
근거: `docs/logh7-restart-plan-2026-07-05.md`, `docs/logh7-roadmap-current.md`, `docs/logh7-requirements-current.md`, `docs/logh7-architecture-operations-current.md`, `docs/logh7-codex-harness-loop.md`, `docs/reference/legacy-evidence/**`, 현재 작업트리 상태

> **한 줄 요약:** 죽은 일본 MMO 클라이언트(`G7MTClient.exe`)를 리버스 엔지니어링하고, 원본 와이어를 이해하는 자체 권위 서버를 붙여 멀티플레이를 복원한다. Unity 재이식은 RE·플레이어블 루프 이후 장기 목표다.

---

## 1. 미션과 제품 경로

| 항목 | 결정 |
|---|---|
| 제품 클라이언트 | **원본 레거시 클라** (`G7MTClient.exe`) — 패치·주소 리다이렉트·한글화 포함 |
| 제품 서버 | **자체 구현 Node.js 권위 서버** — 0x0030 와이어 호환 |
| 원천 미디어 | archive.org CD `artifacts/logh7-cd/Logh7.bin|.cue` (hash 검증 필수) |
| 규칙 근거 | 공식 매뉴얼 PDF 5종 (`docs/reference/*.pdf`) |
| 장기 | RE 완료 후 Unity 재이식 가능 (`client-unity/`는 과거 삭제, 커밋 `dbf3b43` 복원) |
| 금지 | 라이브 증거 없는 완료 주장, 좌표·스탯 날조, 원본 자산 덮어쓰기, 추측 프로토콜 3회 고착 |

**2026-07-05 리셋 주의:** 이전 사이클 코드 경로 언급은 역사적 참고다. 발견(프로토콜·갤럭시·스키마)은 신뢰하되, 파일 경로·구현 존재 여부는 **현재 트리에서 재확인**한다. 이전 전체 스냅샷: `5bd249c`.

---

## 2. 현재 기준선 (2026-07-09 작업트리)

### 2.1 이미 있는 것

| 영역 | 상태 | 위치 |
|---|---|---|
| CD 원본 + ISO/InstallShield 추출 | 존재 | `artifacts/logh7-cd/`, `artifacts/logh7-install/` |
| 2004 공식 패치 스테이징 | 존재 | `artifacts/official-patch-staging/` |
| 지식 베이스·매뉴얼·legacy RE 증거 | 대량 보존 | `docs/`, `docs/reference/` |
| 이전 추출 content JSON | **참고 전용, 정본 아님** | `server/content/**` |
| 0x0030 봉투·프레임 스트림 | 구현 + 단위 테스트 | `logh7-envelope-0030`, `logh7-frame-stream`, `logh7-transport-0030` |
| child-codec (P/S, Blowfish형) | 구현 + 테스트 | `logh7-child-codec` |
| GIN7 자격증명 파싱 | 구현 + 테스트 | `logh7-gin7-credential` |
| 로그인 하니스 (0x0034→0x0035, phase1, 복호 트레이스) | 구현 + 테스트 | `logh7-login-harness-server` |
| 로그인 응답 프레임 빌더 (0x0031 key + 0x7001 redirect) | 구현 + 테스트 | `logh7-login-response` |
| 로비 로그인/세션·캐릭터 codec/store | 구현 + 테스트 | `logh7-lobby-*`, `logh7-character-*` |
| 월드 진입 레코드 (0x0204/0x0323/0x0325/0x0206) | 구현 + 테스트 | `logh7-world-records` |
| 권위 이동 0x0b07 / 채팅 0x0f1c | 구현 + 이중세션 테스트 | `logh7-world-session` |
| 통합 TCP 플레이어블 서버 | 구현 + 이중 부트 검증 | `logh7-playable-server` |
| 추출/감사 도구 | 다수 | `tools/extract/`, `tools/live/`, `tools/re/`, `tools/patch/` |
| 에이전트 팀 정의 | 6종 | `.claude/agents/`, `.codex/agents/` |

### 2.2 아직 없는 것 (핵심 갭)

1. **실클라 라이브 로그인 성공 증거** (0x7001/0x0200 계열 세션 OK까지 E2E)
2. 캐릭터 작성/삭제/선택 **실클라 UI 검증**
3. 로비 → 월드 진입 권위 상태 푸시 (`0x031d/0x031f/0x0321/0x0323/0x0325` 등)
4. 전략맵 이동·명령·제안 루프
5. 전술맵·전투 엔진 최소판
6. 채팅/사회 기능 + 한글 입출력 검증
7. content JSON **정본 승격** (원천 해시 + 재생성 + 서버 소비)
8. EXE 함수 전수 RE 커버리지 추적 갱신
9. Docker Compose 운영 런타임 / 계정·보안 강화
10. 리마스터·모드 트랙 (플레이 가능 루프 이후 또는 병렬 저우선)

로드맵 판정 (`docs/logh7-roadmap-current.md`): 기능 게이트 중 서버 코드 존재는 **`login-transport` partial** 뿐. 캐릭터/월드/전략/전술/전투/채팅 게이트는 증거 문서는 있으나 제품 서버 구현 없음.

---

## 3. 소스 오브 트루스

| 우선순위 | 소스 | 역할 |
|---|---|---|
| P0 | `artifacts/logh7-cd/Logh7.bin|.cue` | CD 원본. md5 `bf87c6a8…` / `878418…` |
| P0 | 설치 트리 `artifacts/logh7-install/**` | EXE·data·MsgDat·MDX·Face TCF |
| P0 | Ghidra / 실클라 트레이스 | 프로토콜·상태 머신 근거 |
| P1 | `docs/reference/*.pdf` | 게임 규칙·성계도·커맨드 |
| P1 | `docs/reference/legacy-evidence/*` | 이전 사이클 RE·wire 사실 |
| P2 | `server/content/**` | 승격 전 참고 카탈로그 |
| 금지 | 날조 좌표·추정 스탯·문서에만 있는 “완료” | 정본 불가 |

**데이터 승격 5조건** (모두 충족 시에만 서버 입력):

1. 원천 파일이 현재 트리에 존재
2. 해시 또는 추출 방법이 기록됨
3. 재생성 스크립트가 현재 트리에서 실행됨
4. 생성 JSON의 깨진 참조 없음
5. 서버 테스트 또는 실클라가 해당 데이터를 **실제 소비**

---

## 4. 오케스트레이션 · 에이전트 · 스킬 · 도구

진입 스킬: **`logh7-orchestrator`**. Advisor가 분해·검증, Worker가 구현.

### 4.1 에이전트 파이프라인

```
extract-miner ─┐
re-analyst ────┼─▶ wire-engineer ─▶ server-dev ─▶ live-qa ─(버그)─▶ 담당 에이전트
localizer ─────┘                                        │
                                                        └─▶ localizer (인게임 한글)
```

| 에이전트 | 하는 일 | 필수 스킬 |
|---|---|---|
| **extract-miner** | CD/설치본 자산·테이블·문자열·갤럭시 후보 추출 → 정본 후보 JSON | (추출 스크립트), 필요시 pdf-ocr / smart-ocr |
| **re-analyst** | `G7MTClient.exe` Ghidra 정적 RE, 함수·구조체·오프셋 확정 | `binary-triage`, `rev-struct`, protocol-RE 보조 |
| **wire-engineer** | 프레이밍·암복호·opcode 코덱, 라운드트립 테스트 | `test-driven-development`, `protocol-reverse-engineering` |
| **server-dev** | 권위 서버 상태·디스패치·영속성 | `test-driven-development`, `verification-before-completion`, `karpathy-guidelines` |
| **localizer** | cp949/UTF-16 문자열, GDI 폰트, 채팅 인코딩, 군사 톤 번역 | `grammar-checker`, `humanize-korean`, `humanizer`, `style-guide` |
| **live-qa** | 실클라 기동, 로그인~월드 시나리오, 스크린샷/로그 | `verification-before-completion`, `systematic-debugging`, gstack(필요 시) |

### 4.2 프로젝트·글로벌 스킬 전부 매핑

| 스킬 | 언제 쓰는가 |
|---|---|
| `logh7-orchestrator` | logh7 작업 시작·분해·라우팅 |
| `binary-triage` | EXE/패치 바이너리 첫 조사 |
| `rev-struct` | 메모리 접근 패턴으로 구조체 복원 |
| `protocol-reverse-engineering` | PCAP·opcode·프레이밍 해독 |
| `test-driven-development` | codec/서버 기능 구현 전 테스트 먼저 |
| `verification-before-completion` | 완료 주장 전 테스트·라이브 증거 확인 |
| `systematic-debugging` | 라이브/테스트 실패 근본원인 |
| `karpathy-guidelines` | 과설계 금지, 최소 변경 |
| `grammar-checker` | 한글 문서·번역 교정 |
| `humanize-korean` / `humanizer` / `humanize` | AI 번역투 제거, 자연스러운 군사 톤 |
| `style-guide` | 용어·어조 일관성 (진영/계급/커맨드 용어집) |
| `stop-slop` | 영문 문서/커밋 메시지 군더더기 제거 |
| `check-work` | 슬라이스 종료 시 독립 검증 |
| `pdf-ocr-extraction` / `smart-ocr` | 매뉴얼 표·성계도 OCR |
| `image-upscaling` | 리마스터 업스케일 (원본 fallback 유지) |
| `game-assets` / `game-3d-assets` / `meshyai` | 승인된 프로토타입 아트만 (정본 대체 금지) |
| `game-engine` | 브라우저 디버그 시각화 참고용만 |
| `gstack` (+ review/ship/office-hours 등) | 웹/대시보드 QA, 리뷰, 배포 루프 |
| `design` / `execute-plan` / `pr-babysit` | 큰 설계 문서·PR 플랜 실행 |
| `office-hours` / `plan-ceo-review` / `plan-eng-review` | 범위·아키텍처 재검토 시 |
| Unity 계열 스킬 | **장기 Unity 재이식 단계만** |

### 4.3 고정 감사 게이트 (매 루프 갱신)

| 게이트 | 명령 | 산출 |
|---|---|---|
| 데이터 재해독 | `node tools/extract/audit_data_decode.mjs` | `server/content/generated/logh7-data-decode-audit.json` |
| 문서/PDF 요구사항 | `node tools/extract/audit_docs_requirements.mjs` | `logh7-docs-requirements-audit.json` |
| EXE 함수 RE 커버리지 | `node tools/extract/audit_exe_re_coverage.mjs` | `logh7-exe-re-coverage-audit.json` |
| UI 좌표 | `node tools/extract/audit_ui_coordinates.mjs` | `logh7-ui-coordinate-audit.json` |
| 갤럭시 출처 | `node tools/extract/audit_galaxy_provenance.mjs` | 관련 감사 JSON |

### 4.4 증거·포렌식 툴체인 (아키텍처 문서)

- **정적 RE:** Ghidra (정본), capa / FLOSS / YARA / DIE / binwalk (후보 분류)
- **런타임:** Frida, x64dbg, ProcDump — **진단·의미 확정 전용**, 제품 런타임 금지
- **네트워크:** Npcap + Wireshark/tshark, 프로젝트 capture 스크립트 (`tools/live/`)
- **데이터:** Sleuth Kit CLI, bulk carve, hash inventory
- **문서:** Poppler / PyMuPDF / pdfplumber / OpenCV / OCR 스킬
- **패치:** `tools/patch/exe-patch.mjs` (해시·롤백·dry-run 필수)

### 4.5 운영 규칙

- **CodeGraph** (`.codegraph/` 존재 시) 위치·호출경로 질문 시 먼저
- **Blocked-Loop:** 같은 증상 3회 실패 또는 새 증거 없는 조사 2회 → 축 전환 + 블로커 리포트
- **완료 게이트:** 구현 + 테스트 + **실클라 라이브 증거** + 리뷰 + docs 갱신
- 코드 주석 **한글** (캐논 일본어·바이너리 오프셋은 원문)
- Advisor/Worker: 완료 보고를 믿지 말고 **diff·테스트·라이브 산출물로 직접 검증**

---

## 5. 마일스톤 로드맵 (실행 순서)

각 마일스톤은 `계획 → RE/문서 근거 → 최소 구현(TDD) → 단위/통합 테스트 → 실클라 라이브 → docs 갱신` 루프를 탄다.

---

### M0. 환경·원천 고정

| ID | 작업 | 담당 | 완료 조건 |
|---|---|---|---|
| M0.1 | CD BIN/CUE 존재·hash 검증 | extract-miner | md5 일치, 매니페스트 기록 |
| M0.2 | ISO + InstallShield 추출 경로 재확인 | extract-miner | `artifacts/logh7-cd/iso-root`, install 트리 사용 가능 |
| M0.3 | 공식 패치 자산 목록 고정 | extract-miner | `official-patch-staging` README와 추출 일치 |
| M0.4 | 소스 루트 인벤토리 | extract-miner | roots JSON + inventory 스크립트 통과 |
| M0.5 | 데이터 디코드 감사 재실행 | extract-miner | `logh7-data-decode-audit.json` 갱신, reviewQueue 정리 착수 |

---

### M1. 프로토콜 재확정 + 실클라 로그인

**목표:** 원본 클라이언트가 자체 서버에 붙어 로그인 핸드셰이크를 통과한다.

| ID | 작업 | 담당 | 근거 문서 |
|---|---|---|---|
| M1.1 | 0x0034/0x0035/0x0036 handshake 라이브 트레이스 재수집 | live-qa + re-analyst | `logh7-0030-protocol.md` |
| M1.2 | child-codec 테이블·endian·padding RE 재확인 | re-analyst + wire-engineer | Ghidra `FUN_00614460` 등 |
| M1.3 | inner 0x0031 key-setup 후 **로그인 OK 메시지** body 확정 | re-analyst + wire-engineer | 0x7001/0x7002, 0x0200 SSLoginOK |
| M1.4 | 서버: 로그인 성공 응답 + 세션 토큰/리다이렉트 | server-dev | `logh7-login-response.mjs` 확장 |
| M1.5 | 클라 접속 주소 패치 또는 로컬 리다이렉트 절차 문서화 | server-dev + live-qa | `tools/patch/`, live harness |
| M1.6 | **실클라 로그인 성공** 스크린샷 + 서버 JSONL 트레이스 | live-qa | 증거 디렉터리 고정 |

**이전 사이클 지식 (재구현 시 참고):**

- Transport: TCP `[u16 BE len][u16 BE 0x0030][child-codec body]`
- Body: checksum + id + innerLen + inner; inner code BE
- 로그인 inner `0x7000` GIN7 자격증명; 성공 후보 `0x7001` / 세션 `0x0200` 계열
- familyBase: SS=`0x200`, Lobby=`0x2000`

**블로커 이력:** 짧은 0x7001 body는 message 생성까지 가도 stream read 부족으로 실패할 수 있음 → Ghidra decompile 필드 오프셋 충족 필수.

---

### M2. 캐릭터 작성 / 삭제 / 선택

| ID | 작업 | 담당 | 근거 |
|---|---|---|---|
| M2.1 | 0x0323 캐릭터 레코드 layout 재확정 | re-analyst + wire-engineer | `logh7-character-record-wire.md` |
| M2.2 | 작성/삭제/선택 C→S / S→C opcode codec + 테스트 | wire-engineer | `logh7-character-creation-wire.md` |
| M2.3 | 서버 캐릭터 스토어 영속성 (원자적 저장, fail-closed) | server-dev | `logh7-character-store` |
| M2.4 | face ID: G-group 플레이어 얼굴만 허용 (TCF 카탈로그) | extract-miner + server-dev | face/TCF 증거 |
| M2.5 | 진영 서버 분리 규칙 (manual p8) | server-dev | `session-offline-rules` |
| M2.6 | 실클라 UI로 작성·목록·삭제·선택 검증 | live-qa | 스크린샷 |

규칙 요약:

- 캐릭터 생성은 **게임 클라 내부만** (웹/런처 생성 금지)
- parentage `blood`/social-class `@+0xd4` 등 레코드 필드 누락 금지
- preseed/placeholder 캐릭터는 QA 증거로 인정 안 함

---

### M3. 로비 → 월드 진입

| ID | 작업 | 담당 | 근거 |
|---|---|---|---|
| M3.1 | 로비 opcode `0x2000–0x200b` 재배선 | wire-engineer | protocol-master, login-protocol |
| M3.2 | 월드 진입 시 정적/동적 info 레코드 순서 확정 | re-analyst | info-records-wire |
| M3.3 | 서버 preload: `0x031d`, `0x031f`, `0x0321` → 이후 `0x0f03` 등 | server-dev | requirements §World |
| M3.4 | 캐릭터 `0x0323`, 유닛/함대 `0x0325` 권위 푸시 | server-dev | character/unit wire |
| M3.5 | 갤럭시 RLE 맵 `0x0315` (100×50, cell=systemId) | wire-engineer + server-dev | loop-state KEYSTONE |
| M3.6 | 2계정 동시 진입·가시성 스모크 | live-qa | 멀티 세션 |

**갤럭시 정본 규칙 (절대):**

- 이름 수 권위: constmsg 등 **85 성계**
- 좌표 권위: 매뉴얼 성계도 **80 점** (P2)
- 좌표 미확정 5성계: `coord=null`, **날조 금지**, 그리드 마커에서 제외
- 위치는 원래 **서버 RLE 맵**으로 전달됨 (클라 정적 테이블 없음)

---

### M4. 전략맵 · 커맨드 · 제안

| ID | 작업 | 담당 | 근거 |
|---|---|---|---|
| M4.1 | 전략맵 wire: 그리드/기지/선택/이동 | wire-engineer | `logh7-strategic-map-wire.md`, input-wire |
| M4.2 | opcode emit-map 전수 대비 구현 상태 갱신 | re-analyst | `logh7-opcode-reference`, emit-map |
| M4.3 | 매뉴얼 81 전략 커맨드 카탈로그 승격·소비 | extract-miner + server-dev | `strategy-commands.json` |
| M4.4 | fixed-CP 명령 최소 엔진 (variable-CP는 unresolved 유지) | server-dev | strategy-command-rules |
| M4.5 | 이동 서버권위 (`CommandMoveShip 0x0400` / Notify / `0x0b07` 계열) | server-dev | moveship-wire, restart-plan |
| M4.6 | 제안·인사·보급·생산 중 직무별 최소 1커맨드 | server-dev | requirements Jobs |
| M4.7 | C002 등 UI→커맨드 미도달 이슈 재조사 | re-analyst + live-qa | 기지 리스크 |
| M4.8 | 전략맵 라이브 QA (이동·패널·소유 표시) | live-qa | 스크린샷 |

---

### M5. 전술맵 · 전투

| ID | 작업 | 담당 | 근거 |
|---|---|---|---|
| M5.1 | 전술 seed / tactics data opcodes (`0x337` 등) | wire-engineer | `logh7-tactics-data`, tactical-seed |
| M5.2 | 전투 C→S: Move/Turn/Warp/Attack/Shoot/Fight | wire-engineer | proto-battle-* |
| M5.3 | 서버 전투 엔진 최소판 (판정·데미지·파괴 통지) | server-dev | battle-core/fire |
| M5.4 | 함대 작전·퇴각(WARP-max)·타임아웃 | server-dev | fleetops, manual energy |
| M5.5 | NO DATA 없는 전술 패널 렌더 검증 | live-qa | 실클라 |

공식: CP/전투/경제 수식은 **교차출처 확정 전 정본 승격 금지** (formula provenance guard).

---

### M6. 채팅 · 사회 · 한글화

| ID | 작업 | 담당 | 근거 |
|---|---|---|---|
| M6.1 | 채팅 wire (전체/함대/동진영 등 채널) | wire-engineer | social-account, tactical-chat |
| M6.2 | 인코딩: 클라 소비 경로별 분리 (cp932 해저드 주의) | localizer + re-analyst | chat-input RE, korean-name RE |
| M6.3 | `String.txt` cp949 + GDI charset 패치 | localizer | localization-audit |
| M6.4 | `.rsrc` 메뉴/대화 UTF-16LE 패치 | localizer | exe-patch manifest |
| M6.5 | 폰트 슬롯 (`CreateFontA` 경로) 가독성 | localizer + live-qa | font RE |
| M6.6 | 번역 품질: 군사·정치 레지스터 + humanize | localizer | humanize-korean 파이프 |
| M6.7 | 로그인→로비→채팅 한글 표시 라이브 | live-qa | 스크린샷 |

1차 한글 범위: 런처·로그인/로비·첫 플레이 루프·커맨드/직무/제안·메뉴·에러 메시지.  
번역 완료 = **해당 화면 라이브 증명**까지.

---

### M7. 전체 회귀 · 운영

최종 라이브 시나리오 (모두 로그+스크린샷):

1. 클라 실행  
2. 로그인  
3. 캐릭터 작성  
4. 캐릭터 삭제  
5. 기존 캐릭터 선택  
6. 로비/월드 진입  
7. 전략맵 이동·명령  
8. 제안/인사/생산/보급  
9. 전술 진입  
10. 전투·결과  
11. 채팅/사회  
12. 한글 UI/채팅  
13. (선택) 리마스터 자산  
14. 종료 후 서버 상태 재로드  

운영 목표:

- Docker Compose 서비스 런타임 (Node 직접 실행은 개발 전용)
- 계정: 웹 가입 + 클라 로그인, scrypt 해시, 세션, 관리자 분리
- 수천 동접 목표 아키텍처: 인메모리 권위 + 비동기 DB 영속성

---

### MR. 리마스터 (병렬, 가역)

| 원칙 | 내용 |
|---|---|
| 원본 fallback | 항상 R0 유지, 덮어쓰기 금지 |
| provenance | R1 업스케일 / R2 수작 / R3 생성 라벨 필수 |
| 범위 | 2D·3D·텍스처·효과·사운드·UI·초상·가독성 |
| 스킬 | `image-upscaling` 우선; game-assets/3d는 프로토타입만 |
| 완료 | remaster manifest + 원본 해시 + 실클라 깨짐 없음 |

메달/문장/함선 썸네일 등 기존 mining 문서는 `docs/reference/remaster-art/` 참고.

---

### MP. 공식 2004 패치 스택 (클로즈드 베타 전)

근거: `docs/reference/legacy-evidence/logh7-2004-official-patch-stack.md`

- 시간순 적용, 이후 공지가 이전을 수정
- 최소 범위: 커맨드/제안 동사, 캐릭터 삭제·추첨 쿨다운, 일일 군수, 평가 포인트, 행성 점령, 워프 연료/CP, 정찰 영속, 전술 퇴각, 타임아웃, 손상함 표시, 달력, 수리/반전, UI 라벨
- Wayback/CDX 검증 (`artifacts/gineiden-archive/` 활용), 캐시는 `E:\logh7-revival` only

---

### MM. 모드 기반 (나중)

- Layer A: 데이터/시나리오 팩  
- Layer B: 로컬라이즈/텍스처 팩  
- Layer C: 가드된 클라 패치 팩  
공개 모드 마켓은 **플레이 가능 루프 이후**.

---

### MX. 네이티브 확장 (복원 이후)

예: 동맹 최고평의회 의장 선거 등 원작에 없는 서버 권위 시스템.  
기존 command/notify 표면으로 먼저 표현 → 새 패킷은 RE 증명 후에만.

---

## 6. 데이터·콘텐츠 트랙 (전 마일스톤 병행)

서버가 서빙해야 할 패밀리 (모두 초기엔 `suspect-cross-check-required`):

| 패밀리 | 주요 원천 | 즉시 주의 |
|---|---|---|
| systems / stars / planets / grids | 매뉴얼 성계도, RLE wire, constmsg | 5 미좌표 성계 날조 금지 |
| characters / roster / faces | TCF, 0x0323, 매뉴얼 | 오리지널 로스터 숨은 표 미확정 |
| fleets / ships / hardpoints | MDX, ship-stats manual | combat formula 미추론 |
| commands / operations / logistics / ranks | manual JSON | variable CP unresolved |
| economy / formulas | manual + RE | formula promotion blocked |
| UI text / MsgDat / String.txt | 클라 data | 한글 경로 분리 |
| models / effects / sounds | install data | remaster 분리 |

숨은 데이터 워치리스트 (매 스캔 보고, 정본 아님):

- `systemPositions` / 성계 위치  
- `originalCharacterRoster` / 오리지널 캐릭터 로스터  

---

## 7. EXE 전수 RE 트랙

완료 정의 (함수 단위):

1. 주소 + 디컴파일 또는 라이브 경로
2. wire / data / UI / render / state 소비 분류
3. 서버로 옮긴 기능은 테스트 또는 라이브 증거
4. 미해석은 크기·도메인 backlog 유지

우선 함수 군 (legacy evidence 기준):

- 네트 라우터 `0x006130a0`, 봉투 `0x00645db0`, key `0x00613ad0` / `0x006140c0`
- 디스패치 `FUN_004ba2b0`, size-table `FUN_004b8b00`
- 갤럭시 RLE `FUN_004abbb0`, 역인덱스 `FUN_004c8bc0`
- 캐릭터 스탯 파서 `FUN_00419300` (클라)
- 로그인 `LoginProcessorImp` / lobby parse

도구: Ghidra headless, `tools/re/Logh7ExportSelectedDecomp.java`, `audit_exe_re_coverage.mjs`

---

## 8. 즉시 다음 작업 (우선순위 큐)

지금 당장 착수 순서:

1. **M1.3–M1.6** — 로그인 OK body 확정 → 서버 응답 완성 → **실클라 로그인 증거**  
   (현재 최상위 블로커; 이후 전부 전부 게이트)
2. **M0.5** — content audit reviewQueue 상위 정리 (로그인 병행 가능)
3. **M2** — 캐릭터 codec 실클라 검증 (로그인 직후)
4. **M3** — 월드 진입 + 갤럭시 RLE 80마커
5. **M4 최소** — 이동 + 채팅 권위 처리 (인월드 MP 첫 가치)
6. **M6 병행** — 로그인/로비 문자열만이라도 한글 라이브

오케스트레이터 마일스톤 대응:

| 오케스트레이터 | 이 문서 |
|---|---|
| 1 CD 추출 + 정본 카탈로그 | M0 + §6 |
| 2 프로토콜 재확정 | M1.1–M1.3 |
| 3 로그인 서버 실클라 성공 | M1.4–M1.6 |
| 4 로비 → 월드 | M2–M3 |
| 5 인월드 MP | M4–M5 + 채팅 |
| 6 한글화 인게임 | M6 |

---

## 9. 완료 판정 체크리스트 (슬라이스마다)

- [ ] 근거: RE 주소 또는 매뉴얼/와이어 문서 링크
- [ ] 테스트: `npm test` (server) 또는 해당 도구 테스트 통과 출력 보존
- [ ] 라이브: 실클라 스크린샷 또는 JSONL 트레이스 (해당 시)
- [ ] 데이터: 승격 5조건 또는 “참고 전용” 명시
- [ ] 패치: EXE 변경 시 hash·manifest·rollback
- [ ] docs: roadmap/loop-state 또는 본 문서 갱신
- [ ] 금지: 완료 주장에 단위 테스트만 있는 경우 거절

---

## 10. 주요 참고 문서 인덱스

| 문서 | 용도 |
|---|---|
| `docs/logh7-restart-plan-2026-07-05.md` | 리셋 후 미션·마일스톤 |
| `docs/logh7-roadmap-current.md` | Phase 0–7 현행 로드맵 |
| `docs/logh7-requirements-current.md` | 제품 요구·증거 정책 (역사 로그 포함) |
| `docs/logh7-architecture-operations-current.md` | 아키·툴체인·provenance |
| `docs/logh7-codex-harness-loop.md` | 에이전트 루프·감사 게이트 |
| `docs/logh7-document-index-current.md` | 라우팅 인덱스 |
| `docs/reference/legacy-evidence/logh7-protocol-master.md` | 인월드 ~167 opcode 마스터 |
| `docs/reference/legacy-evidence/logh7-0030-protocol.md` | 로그인 transport 상세 |
| `docs/reference/legacy-evidence/logh7-character-*-wire.md` | 캐릭터 wire |
| `docs/reference/legacy-evidence/logh7-proto-battle-*.md` | 전투 계열 |
| `docs/reference/legacy-evidence/logh7-2004-official-patch-stack.md` | 공식 패치 백로그 |
| `docs/logh7-loop-state.md` | 갤럭시 5실종 등 확정 판결 포함 저널 |

---

## 11. 한 장 요약

```
원본 CD/EXE  ──RE──▶  wire codec  ──▶  권위 서버  ──▶  실클라 검증
     │                    │                │               │
  추출 카탈로그      TDD 라운드트립    상태·영속성     스크린샷/트레이스
  매뉴얼 OCR         opcode 맵        멀티플레이       한글 표시
```

**지금 해야 할 일의 본질:**  
“서버를 대충 만들기”가 아니라, **죽은 클라가 기대하는 바이트를 다시 말해 주는 서버**를 만드는 것.  
모든 스킬·에이전트·감사 도구는 그 바이트의 근거를 모으고, 구현하고, 실클라로 증명하기 위해 쓴다.

---

*이 문서는 실행 백로그다. 슬라이스 완료 시 섹션 2 기준선과 섹션 8 우선순위 큐를 갱신한다.*
