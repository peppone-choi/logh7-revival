# LOGH VII 전체 리마스터 통합 로드맵

> 작성일: 2026-06-24 KST
> 기준: `docs/logh7-master-roadmap-2026-06-20.md`, `docs/logh7-loop-state.md`, `docs/logh7-gap-backlog.md`, `docs/logh7-inworld-backlog.md`, 6개 병렬 상태 감사 에이전트 보고 종합
> 상태: active — P0-02 C002 unblock이 전체 리마스터의 현재 핵심 게이트

---

## 1. 비전과 완료 기준

### 비전
실제 `G7MTClient.exe`를 켠 상태에서, 매뉴얼대로 플레이 가능한 은하영웅전설 VII를 완성한다. 서버가 권위 상태이고, 클라이언트가 이를 정확히 소비·렌더하며, 유저 입력이 자연스럽게 전달되는 전체 루프를 증거 기반으로 구축한다. HUD/UI/폰트/텍스처/모델 등 모든 시각 자산도 현대 해상도와 자연스러운 한국어로 리마스터한다.

### 전체 완료 기준 (exit criteria)
1. 실제 클라이언트에서 회원가입 → 로그인 → 로비 → 캐릭터 생성 → 월드 진입 → 전략 명령(이동/전투/내정) → 전술 전투 → 전투 종료 → 복귀의 전체 루프가 라이브 trace + 스크린샷으로 입증된다.
2. `0x0b01` 자연 송신과 `0x0b07` 서버 권위 응답이 실제 클라이언트에서 관측되고, 이동 결과가 함대 마커/셀 상태에 시각 반영된다.
3. 직무카드, 행성 내 장소/시설, 국가관리/인사/정치/보급/첩보/쿠데타 커맨드가 실제 UI 패널과 와이어 양방향으로 연결된다.
4. 80성계/281행성/6요새의 좌표·소속·분광형·행성 내 데이터가 필드별 P0/P1/P2/P3 출처 등급과 함께 문서화되고, 클라이언트에 정확히 투영된다.
5. HUD/UI/텍스처/폰트/모델 리마스터가 실제 클라이언트에서 무손상 렌더되고, 1920×1080 이상의 네이티브 레이아웃과 Pretendard 폰트가 전 화면에서 적용된다.
6. `G7MTClient.exe`의 모든 함수/데이터/와이어 소비처가 RE 커버리지 행렬에 기록되고, 함수 deep-RE가 핵심 게임플레이 경로를 모두 커버한다.
7. 한글 채팅 왕복, 풀스크린 필러, 런처/배포/모딩 인프라가 완성된다.

---

## 2. 현재 상태 요약 (2026-06-24)

### 완료된 것 (P0 검증됨)
- **암호/핸드셰이크/프로토콜 코어**: Blowfish-variant child codec, `0x0034→0x0035→0x0036`, message32 wrapping.
- **서버 권위 게임 엔진**: command-engine, world-state, combat, battle, economy, strategy, personnel, logistics, social, intel/coup/espionage, imperial titles, age drift 등 70+ 모듈.
- **서버 테스트**: `npm run test:server` **1146 pass / 0 fail**.
- **로그인 → 월드 진입 라이브**: autologin + 포그라운드 유지로 전략맵 + HUD 렌더 확인.
- **수신 데이터 바이트 검증**: `0x0323` 캐릭터 15/15 필드, `0x0313/0x0315` 5004B grid, `0x0b07` 580B 와이어 크기 정합.
- **성계 좌표/지형**: PDF page101 래스터 별점 중심 재추출, 80성계, 100×50 그리드, 회랑/통행불가 마스크.
- **리마스터 기초**: Pretendard 폰트, 로비 1920×1080 네이티브 레이아웃, 20개 HUD TGA 4x 업스케일 드롭인 라이브.
- **파일 RE**: 9패밀리 중 7 P0 완료 (PE, MsgDat, TCF, MDX scene-graph, images, audio, misc-config).
- **함수 RE 인프라**: triage → wave workflow, ledger sync, coverage report.

### 진행 중 / 블록된 것
| 항목 | 상태 | 근거 |
|---|---|---|
| **C002: 자연 전략 명령 `0x0b01`** | 🔴 blocked | unit-list 위젯 0x67 미생성, latch loop 미등록, 명령메뉴 rowCount=0. 함수RE는 100% 완결, 구현/라이브가 남음. |
| **0x0b07 클라 실제 적용/시각 반영** | 🟡 미측정 | 와이어·디스패치·생존은 입증. 4점 메모리 probe + fleet-render 마커 가시화 필요. |
| **직무카드/행성내장소 UI** | 🔴 blocked by C002 | 와이어·텍스처·번역 준비됨. 패널 오픈은 C002 미구동으로 차단. |
| **전술맵 풀 렌더** | 🟡 blocked | 서버푸시 `0x42f`로 모드전환 UI 출현. mode byte/전술 pool 활성화 미완. |
| **cross-client 유저-기원 이동** | 🔴 blocked | relay fanout 코드 존재. 2클 라이브 trace 부재. |
| **소속(faction) 맵/패널 표시** | 🔴 blocked | 데이터 80/80 보유. 맵/패널 소비처 RE 미확정. |
| **한글 채팅 송신** | 🔴 blocked | 클라 cp932 디코드 손상. code-cave 설계됨, 빌드/라이브 미완. |
| **전 화면 네이티브 리마스터** | 🟡 in_progress | 로비만 live verified. charsel/gamemenu/window-dialog/soukan-hud는 바이트검증만. |
| **bulk 텍스처/모델 리마스터** | 🟡 in_progress | HUD 20/724개만. 배경/성운/함선/전투기 미시작. |
| **함수 deep-RE** | 🟡 10.8% | G7MTClient 294/6089, setup 0%. 핵심 게임플레이 경로 우선 필요. |
| **git 버전 관리** | 🔴 blocked | `.git/` 존재하나 non-repository. init 필요. |

---

## 3. 마일스톤

### M0 — 기반 정리 (foundation)
**목표**: 루프 엔지니어링을 위한 상태/문서/버전 관리 기반 확립.
- [ ] `docs/logh7-remaster-roadmap-2026-06-24.md` 완성 (본 문서).
- [ ] `git init` 및 최소 커밋 구조 확립 (`.gitignore` 갱신 포함).
- [ ] `docs/logh7-loop-state.md`를 본 로드맵과 동기화, P0 큐 재정렬.
- [ ] 함수/파일 RE 커버리지 행렬 동기화 (`tools/logh7_func_coverage_report.py`).
- 완료 증거: `git log`, 갱신된 `docs/logh7-loop-state.md`, coverage 행렬 최신화.

### M1 — 전략 플레이 게이트 해금 (strategic play gate)
**목표**: 실제 클라이언트에서 함대 선택 → 이동 명령 → `0x0b01` 송신 → 서버 `0x0b07` 응답 → 클라이언트 적용의 전체 루프를 라이브로 입증.
- [ ] `c002-force-scene-setup.json` 적용 후 unit-list 위젯 0x67 생성 라이브 검증.
- [ ] `PLAYER_INFO+0x270` officer count 채움, `+0xb00` latch, 명령메뉴 rowCount>0 실측.
- [ ] 자연 또는 구동 `0x0b01 → 0x0b07` 최초 trace 캡처.
- [ ] `0x0b07` 4점 메모리 probe로 클라 상태 변화 입증.
- [ ] own-fleet 마커 렌더 (fleet-render case0 타이밍/별도 cave) 라이브.
- [ ] `/grid <cell>` 채팅 폴팩 end-to-end 라이브 검증.
- 완료 증거: `.omo/ui-explorer/` 라이브 세션, `docs/logh7-loop-state.md` P0-02/P0-04 done, trace에 `0x0b01/0x0b07` 쌍.

### M2 — 매뉴얼 콘텐츠 완성 (manual content)
**목표**: 80성계/281행성/6요새/캐논 캐릭터/시나리오 초기 배치를 출처 등급별로 확정하고 와이어에 배선.
- [ ] 80성계 소속(faction) 출처 등급 확정 및 클라이언트 투영 소비처 RE.
- [ ] 행성/천체 데이터: 이름, 소속 성계, 궤도, 인구/경제, 특수 천체, 요새 연결 분리 저장.
- [ ] `0x031d` StaticInformationBase, `0x031f` ResponseInformationBase, `0x0321` ResponseInformationInstitution 라이브 패널 캡처 및 빌더 갱신.
- [ ] 시작 세션: 진영, 원수, 요직, 함대, 주둔지, 수도, 승리 조건 매뉴얼 기준 고정.
- [ ] 미구현 매뉴얼 커맨드 전체 목록을 `Command*`/`Notify*` 와이어 상태와 연결.
- 완료 증거: `content/galaxy.json`/`content/planet-economy.json` provenance 태그, 라이브 정보 패널 스크린샷, `docs/logh7-world-data-mining-status.md` 갱신.

### M3 — 인월드 시스템 통합 (in-world systems)
**목표**: 직무카드, 행성 내 장소, 국가관리/인사/정치/보급/첩보/쿠데타 커맨드를 실제 UI와 와이어로 연결.
- [ ] 직무카드 `0x1200/0x1201/0x120f` 패널 라이브 오픈 및 렌더 확인.
- [ ] 행성 내 장소/시설 UI (`data/image/shokumu_card/*.tga`) 드롭인 및 렌더.
- [ ] 인사/요직 카드 `0x0704~0x070b`, `0x0356`, `0x0358` 라이브 적용.
- [ ] 정치/보급/사교/전투 ops 커맨드 라우팅 및 라이브 검증.
- [ ] 첩보/쿠데타/페잔 관련 opcode(`0x0f13/0x0f14` 등) 실제 클라 캡처 후 배선.
- 완료 증거: 실제 클라이언트에서 직무/시설/커맨드 패널 스크린샷, 관련 opcode trace.

### M4 — 전투/전술 완성 (battle/tactical)
**목표**: 전략 → 전술 맵 전환 → 전투 → 결과 → 복귀 전체 루프 라이브 입증.
- [ ] `0x42f` 모드전환 후 mode byte `2→0` 자연 경로 RE/강제 및 전술 pool 활성화.
- [ ] 완전 전술 데이터 푸시(`0x349/0x33b/0x341/0x343/0x0f1f`) 후 풀 3D 전투 렌더.
- [ ] 사격/교전(`0x0405/0x0406/0x0407`) 라이브 round-trip.
- [ ] 전투 종료/사상자/항복/전술 → 전략 복귀.
- [ ] cross-client 2:2 전투 E2E.
- 완료 증거: 전술맵 스크린샷, `0x0405~0x0407` trace, 전투 종료 후 전략맵 복귀 스크린샷.

### M5 — 리마스터/현지화/배포 완성 (remaster/localize/ship)
**목표**: 모든 시각 자산과 텍스트를 현대 기준으로 리마스터하고 배포.
- [ ] 전 화면 네이티브 레이아웃 (charsel, gamemenu, window-dialog, soukan-hud, 설정) live 검증.
- [ ] bulk HUD/UI/배경/성운/함선/전투기 텍스처 업스케일 드롭인.
- [ ] .rsrc 패처를 빌드 스택에 배선, 로그인/메뉴 한글 live 검증.
- [ ] 한글 채팅 cp949 code-cave 패치 빌드 및 2클 왕복 라이브.
- [ ] CJK/Latin/JP 혼용 렌더 검증, Pretendard 클린 호스트 렌더 확인.
- [ ] 런처/어드민/폰트 설치 자동 배선, LAN 바인드, AWS/Docker 운영 설정 분리.
- [ ] 모드 매니저, 시나리오 로딩, 매니페스트 완성.
- 완료 증거: 1920×1080 전 화면 스크린샷 세트, 배포 패키지, `npm test` 전체 통과, 실클 한글 왕복 trace.

### M6 — 전수 RE 완결 (full RE coverage)
**목표**: 클라이언트의 모든 바이너리/데이터/함수/와이어 소비처를 문서화.
- [ ] G7MTClient 함수 deep-RE 핵심 게임플레이 경로 완료 (opcode dispatch, strategic, battle, UI, input).
- [ ] setup, Gin7UpdateClient, G7Start, BootFirst, LOGH7Launcher 잔여 함수 RE.
- [ ] MDX polygon mesh geometry, VIX consumer, `g7sw.dat` runtime reader, sound index binder 등 파일 RE 잔여 갭.
- [ ] 모든 wire record의 클라이언트 파서 offset/필드/제약 문서화.
- 완료 증거: `docs/logh7-function-re-coverage-matrix.md` 100% 핵심 경로, `docs/logh7-file-re-coverage.md` 잔여 갭 0, `docs/logh7-info-records-wire.md` 완결.

---

## 4. P0 블로커/게이트 (즉시 집중)

1. **C002 전략 명령 서브시스템 unblock** — M1의 핵심. 함수RE는 완결, 구현/라이브만 남음.
2. **0x0b07 클라이언트 적용 시각 반영** — M1. 와이어 크기 정합은 확인, 메모리/렌더 적용 미확인.
3. **소속(faction) 맵/패널 소비처 RE** — M2. 데이터는 보유, 어디에 표시되는지 미확정.
4. **전술 mode byte/전술 pool 활성화** — M4. `0x42f`는 UI까지만.
5. **한글 채팅 cp949 code-cave** — M5. 송신 인코딩 문제.
6. **git 초기화** — M0. 버전 관리 부재.

---

## 5. 데이터 등급 정책

| 등급 | 정의 | 취급 규칙 |
|---|---|---|
| **P0** | 클라이언트 파서/와이어/라이브로 직접 확정 | 기본값으로 사용, 수정 시 RE 재확인 |
| **P1** | 설치본/공식 자산/매뉴얼에서 복원, 소비자 family 확인 | 사용 가능, 출처 기록 필수 |
| **P2** | 매뉴얼/웹/IV-EX 후보, 일부 검증 | `provenance` 태그 필수, 기본값 승격 시 별도 검증 |
| **P3** | 재구성/추론/플레이스홀더 | 절대 원본 서버 데이터라고 주장하지 않음, `placeholder`/`inferred` 태그 필수 |

---

## 6. 스킬 / (서브)에이전트 / 스웜 활용 계획

### 프로젝트 스킬 (필수)
- `logh7-re`: Ghidra redex 쿼리로 함수/오프셋/소비처 확인. 모든 wire/패치 변경 전 호출.
- `logh7-wire`: 클라이언트 파서 기준 byte-exact record 빌더 구현/검증.
- `logh7-live`: `tools/logh7_ui_explorer.py`로 실제 클라이언트 구동, trace/스크린샷 확보.
- `logh7-patch`: EXE 패치 인코드→바이트검증→빌드→라이브 검증.
- `logh7-extract`: MDX/TCF/BMP/PDF에서 성계/행성/초상화/텍스처 복구.
- `logh7-localize`: 한글화, 폰트, .rsrc, 자연스러운 한국어 humanizer.

### 서브에이전트 / 스웜
- **logh7-loop 워크플로우**: `explorer → maker → tester → verifier` 결정론 루프. 각 P0 항목당 1사이클.
- **함수 RE 웨이브 스웜**: `logh7-func-re-wave.js`로 G7MTClient/setup 등 잔여 함수 배치 병렬 RE.
- **도메인별 explore swarm**: 6개 영역(문서/RE/서버/컨텐츠/UI/인월드) 병렬 감사 → 정기 재실행.
- **live verification swarm**: C002, 0x0b07, 전술맵, 채팅 등 라이브 항목은 별도 에이전트가 trace/스크린샷을 병렬 검증.

### 활용 원칙
- 모든 완료 주장은 `logh7-live` trace 또는 `logh7-re` VA/offset 증거로 뒷받침.
- maker와 verifier는 반드시 분리. 동일 에이전트가 자기 완료를 인정하지 않음.
- 50% 이상 context 사용 시 증거/로그를 디스크에 영속하고 요약 갱신.

---

## 7. 다음 즉시 행동

1. **M0**: `git init` 및 `.gitignore` 갱신 (`.omc/`, `.ruff_cache/` 추가).
2. **M1**: `c002-force-scene-setup.json` 라이브 적용 → unit-list 위젯 0x67 생성 확인.
3. **M1**: `tools/logh7_c002_cmdmenu_probe.py`로 catGate/rowCount/0x0b01 경로 측정.
4. **M2**: 소속(faction) 표시 소비처 RE 시작 (`logh7-re`로 group-1 진영명 접근자 xref).
5. **M0**: `docs/logh7-loop-state.md` P0 큐를 본 로드맵 기준으로 재정렬.

---

## 8. 참조 문서

- `docs/logh7-master-roadmap-2026-06-20.md`
- `docs/logh7-loop-state.md`
- `docs/logh7-loop-engineering.md`
- `docs/logh7-gap-backlog.md`
- `docs/logh7-inworld-backlog.md`
- `docs/logh7-c002-mechanism-complete-2026-06-23.md`
- `docs/logh7-live-world-entry-2026-06-23.md`
- `docs/logh7-file-re-coverage.md`
- `docs/logh7-function-re-coverage-matrix.md`
- `docs/logh7-coordinate-provenance.md`
- `docs/logh7-strategic-map-wire.md`
- `docs/logh7-info-records-wire.md`
- `docs/logh7-graphics-remaster.md`
- `docs/logh7-font-remaster.md`
