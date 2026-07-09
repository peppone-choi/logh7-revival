# LOGH VII 레포 재구조화 진행 — 2026-06-26 (핸드오프 #1 실행)

목표(사용자 확정): 루트 = **`server/`(레포) + `client/`(레포) + `docs/`** 만. server/·client/는 각각
**자가완결**(두 폴더 밖 런타임 의존 0) + **각각 별도 git 레포로 관리**. 나머지는 정리(이동/삭제),
참고 데이터·PDF(매뉴얼)는 `docs/`로. 루트 `.git`는 삭제 가능(6파일만 추적 = 무의미).

## 발견: 재구조화는 이미 부분 착수돼 있었음
이전 세션이 `server/`·`client/`를 각각 자체 `.git`+package.json+README(Owns/Does Not Own)로 스캐폴딩.
하지만 미완성이었음 — `server/`에 `src/` 없음(코드 미복사), node_modules 없음.

## server/ 자가완결 — ✅ 완료·검증
- `src/server/` → `server/src/server/` 복사(82 .mjs). **경로 수정 0**: 모든 content 경로가
  `new URL('../../content/...', import.meta.url)` 라 `server/src/server/`에서 `server/content`로 정확 해석.
- `src/server`는 **외부(node_modules) 의존성 0** — `node:` 빌트인만(`node:sqlite`). serve-auth는
  better-sqlite3/drizzle/nest 미사용(그건 src/app Nest 레이어 전용, 서버 코어 아님). → **server/ node_modules 불필요.**
- `content/`(105M, 1104파일) + `tests/server/`(84) 루트→server 동기화.
- **단독 기동 증명**: `cd server && node src/server/logh7-server.mjs serve-auth --port 47950 ...`
  → `listening on 127.0.0.1:47950 [signup registry: E:\logh7-revival\server\state\accounts.sqlite]`,
  admin HTTP 응답(JSON). (47900은 기존 서버 PID 점유 중이라 검증은 47950으로.)
- **테스트(cwd=server/)**: 1147 tests = **1128 pass / 1 fail / 18 skip**.
  - 1 fail = `월드 진입 0x0f02 ... 새 세션은 최근 생성 캐릭` = **캐릭선택 버그(핸드오프 #3, 루트에서도 동일 실패=기존 버그)**.
  - 18 skip = "client exe not present"(server는 클라 EXE 미소유 = 설계대로 graceful skip).
  - `logh7-galaxy-star-extraction.test.mjs` 제거 — `.omo/work/galaxy-extract/` 런타임 의존(추출-프로비넌스 테스트는
    dev워크스페이스 소속, server 패키지 책임 밖). server 런타임은 `.omo` 무의존(content/galaxy.json 사용).

## client/ 자가완결 — ✅ 확인
- `client/vendor/logh7-installed/`(466M): 실 설치 트리(exe/G7MTClient.exe, G7Start, Gin7UpdateClient, BootFirst, LOGH7Launcher).
- `client/dist/logh7-client/`: 완전 플레이 패키지(은하영웅전설7.exe 런처·업데이트.exe·exe/G7MTClient.exe·data/image·model·MsgDat·sound·fonts·SERVER.INI·GraphicConfig.txt·DSETUP).
- `tools/package_client.py` 기본 소스 = `client/vendor/logh7-installed`(`LOGH7_CLIENT_SOURCE` override), **부모 워크스페이스 미참조**.
- → 자가완결. 실제 게임 구동 라이브검증은 라이브하네스+수동로그인으로 추후(별도).

## docs/ 참고자료
- 매뉴얼 PDF → `docs/reference/`: gin7manual.pdf(3.1M)·gin7manual-saved-starchart.pdf(p101 星系図)·gin7manual-alt.pdf.

## 남은 결정(비가역) — 사용자 확인 대기
루트 dev/RE 워크스페이스 = **`.omo`(17G Ghidra 인덱스+RE 작업, RE 권위)** + `tools/`(RE·라이브 드라이버) +
루트 잔여(node_modules 306M·src/app Nest·tests dup·build·.codegraph·.bkit·.omc·misc 등).
**긴장**: 사용자가 동시에 지시한 **전체 RE/리마스터 루프 캠페인**은 `.omo`+`tools/`+라이브하네스가 **필수**.
"루트 3폴더 엄수"와 "캠페인 유지"가 충돌 → 워크스페이스 보존 방식 확인 후 삭제 진행.

## 실행 결과 (2026-06-26)
사용자 결정: dev/RE 워크스페이스 = **`RE/`** 폴더로, `.omo` 아래 레퍼런스는 `docs/`로.
- **`RE/` 생성 + 워크스페이스 이동**(같은 볼륨 rename): tools·content·tests·src·node_modules·dist·drizzle·mods·
  artifacts·fonts·misc·skills·g001-*·run_g001_*.sh·play_logh7·start_server·package.json·package-lock·tsconfig·
  .debug-journal.md·DESIGN.md·.env*. (RE/에서 `node src/server/...`·`tools/...`·`content/...` 상대경로 정합.)
- **레퍼런스 → docs/**: 매뉴얼 PDF 3종 `docs/reference/`, UI 카탈로그 134장 `.omo/reference` → `docs/reference/ui-catalog/`.
- **순수 캐시 삭제**: build·__pycache__·.ruff_cache·test-results·.codegraph.
- **루트 `.git` 삭제**(사용자 승인). server/·client/는 각자 `.git` 보유 = 별도 레포 확인.
- **루트 현재**: server/ client/ docs/ RE/ + (보류)`.omo`·`logh7-runtime` + dot-하네스(.bkit/.claude/.codex/.omc) + AGENTS.md/README.md/.gitignore/.gitattributes.

### .omo 처리 (확정: 루트 유지)
PID 15788(잔류 라이브 서버) 정지 후 `logh7-runtime`은 RE/로 이동 완료. 단 **`.omo`는 (1) 다른 프로세스가
여전히 핸들 점유(Ghidra/하네스 추정), (2) RE/로 옮기면 redex/tools/docs의 수백 개 `.omo/...` 절대·상대
경로가 깨짐**(핸드오프가 경고한 "수백 참조 갱신" 위험) → **루트 유지가 합리적**. .omo는 숨김 dot-dir라
가시 클러터가 아니고, RE/tools는 기존 `E:/logh7-revival/.omo` 절대경로로 그대로 참조. RE/ 워크스페이스의
"RE 데이터 루트"로 .omo를 둔다(이동 시 path-reconciliation 전용 작업 필요).

### 캠페인 working-tree (확정)
- **서버 캐논 = `server/`** (자가완결·검증·사용자 관리 레포). 서버 코드 변경은 `server/src/server`에서,
  검증은 `cd server && node --test tests/server/*.test.mjs`.
- **RE/live 도구 = `RE/tools`** + 루트 `.omo`(RE 데이터). 라이브/redex 작업은 여기서, 필요 시 점진적 경로 정합.
- RE/의 src/tests/content는 이주 시점 스냅샷(캐논은 server/). drift 방지 위해 서버 작업은 server/에서 수행.

### 후속(소): RE/로 옮긴 라이브 하네스 경로 재정합(`tools/logh7_live_env.sh` 등은 이제 `cd RE`서 실행),
루트 README/AGENTS를 신 레이아웃으로 갱신. 캐릭선택 버그(핸드오프 #3, server 1 fail)는 다음 작업.

## 두 레포 정리 + 유저 exe (2026-06-26)
- **prune**: server/.omo(82M·미소유)·server/.omc·server/docs(빈), client/.omc·client/docs(빈),
  client/dist/check-client(462M·검증용 중복) 삭제.
- **`client/play-logh7.exe`(7.2M) 빌드**: 자가완결 thin 런처(PyInstaller --onefile, `client/play-logh7.py`).
  frozen 시 sys.executable 기준 `dist/logh7-client/` 해석 → **표준 원본 exe 시퀀스**(사용자 확정):
  ① `Gin7UpdateClient.exe`(업데이트 확인·적용) 종료 후 ② `G7Start.exe`(원본 런처→exe/G7MTClient.exe, 47900 로그인).
  **커스텀 런처 은하영웅전설7.exe/업데이트.exe는 미사용**(표준 아님 — 사용자 지적). 업데이터 비0 종료 시 로그인 계속.
  패키지 G7MTClient.exe = 47900 패치 확인됨. `--check` 통과(두 표준 exe 경로해석, 게임 미실행).

## play-logh7.exe 마무리 + 신규 캠페인 항목 (2026-06-26)
- **에러 해결(WinError 740)**: `Gin7UpdateClient.exe`가 requireAdministrator → 비상승 `subprocess.call` 거부.
  → play-logh7.exe를 **`--uac-admin`**으로 빌드(manifest requireAdministrator=1 확인) = 실행 시 UAC 1회 자동 상승.
- **아이콘**: `G7Start.exe`의 RT_GROUP_ICON 추출(pefile, 32×32 RGBA) → `client/play-logh7.ico` → `--icon` 빌드.
- 최종 play-logh7.exe = 게임 아이콘 + UAC 자동상승 + (①Gin7UpdateClient ②G7Start) 순차. size 7.1M.

## 신규 캠페인 작업 (사용자 제기, 로드맵 편입)
1. **업데이터/스타터 RE + 한글화** — `Gin7UpdateClient.exe`·`G7Start.exe` 둘 다 일본어 .rsrc(다이얼로그/문자열)
   + 미완 RE(g7start 29%·gin7update 22%). 유저 대면 update→login 흐름의 일부라 한글화·RE 필요.
   → 백그라운드 워크플로 `logh7-localize-launchers`로 RE+한글화 표면+한국어 초안 추진(per-exe 문서).
2. **업데이터 update 대상 서버 설정** — Gin7UpdateClient가 어떤 서버(SERVER.INI [UPDATE] 4787 / 매니페스트
   URL)를 잡는지 RE + 설정 방법 확정(운영자가 update 서버 지정, 미가동 시 graceful no-op).

## 루트 top-level 크기(분류용)
.omo 17G · artifacts 409M · node_modules 306M · .omc 200M · fonts 143M · content 105M(→server 중복) ·
.codegraph 42M · .bkit 17M · build 9.6M · tools 8.1M · dist 7.1M · logh7-runtime 4.4M · src 1.5M · tests 1.3M(→server 중복).
