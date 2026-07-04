# LOGH7Launcher.exe — 전수 RE (P0, IL 디컴파일 확정)

업데이트: 2026-06-22. 소스: `ilspycmd 8.2.0.7535`로 `client/vendor/logh7-installed/LOGH7Launcher.exe` 디컴파일 → `.omo/re-audit/bin-aux/launcher-decompiled/LOGH7Launcher.decompiled.cs`. 이로써 `docs/logh7-file-re-coverage.md` 갭 #2(“CIL method bodies not disassembled”)를 **추론→P0**로 승격한다. 이 런처는 **우리 리바이벌 런처**(.NET, BOTHTEC 오리지널 아님)이며 플레이 부팅 경로를 게이팅한다.

## 진입점 `LOGH7Launcher.Main(string[] args)` [STAThread]

1. `RuntimePaths.Create(AppDomain.BaseDirectory)` → `Validate()`(ClientExe/ServerEntry/node.exe 존재 강제) → LogDir 생성.
2. 인자 분기(대소문자 무시, `HasArg`):
   - `--check`: launcher.log에 "check ok" 쓰고 0 반환.
   - `--signup-smoke`: `RunSignupSmoke`(자동화). 계정 `smoke<ticks>`/비번 `Smoke17` 생성→`admin exists` 검증→트랜스크립트 stdout. 실패 시 throw.
   - `--signup`: `ShowSignup` WinForms 다이얼로그(계정 ID/비밀번호 등록).
3. (일반 부팅) `ConfigureWindows(paths)` 실행(아래).
4. 포트 `127.0.0.1:47900`이 닫혀 있으면 `StartServer` + `WaitForServer`(최대 12초, 150ms 폴링; 서버 조기 종료 시 throw).
5. `--server-smoke`면 여기서 0 반환.
6. `StartClient`(G7MTClient.exe, cwd=`exe/`, UseShellExecute=false).
   - `--client-smoke`면 `WaitForClientSmoke`(5초 생존 확인) 후 클라 kill, 0 반환.
   - 아니면 `client.WaitForExit()` → 클라 종료코드 반환.
7. finally: 런처가 띄운 서버면 `KillProcess`.
8. 예외: 자동화 모드(`IsAutomationMode`=check/server-smoke/client-smoke/signup-smoke 중 하나)면 stderr+코드1, 아니면 MessageBox.

## `ConfigureWindows(paths)` — 환경 셋업 (실행마다)

- 레지스트리 `HKCU\Software\BOTHTEC\銀河英雄伝説VII\1.0` `Install`=설치 루트.
- 레지스트리 `HKCU\...\AppCompatFlags\Layers`에 **ClientExe와 G7Start.exe** 둘 다 `"~ DISABLEDXMAXIMIZEDWINDOWEDMODE HIGHDPIAWARE"` 설정(전체화면/고DPI 호환).
- `String.txt`가 있고 `String.txt.original` 백업이 없으면 백업 1회 복사.
- `InstallFonts`: `tools/packaging/install-pretendard.ps1`이 번들되고 `fonts/`에 ttf/otf가 있으면 PowerShell로 설치(타임아웃 60s). 기본은 실패 무시; `LOGH_FONT_INSTALL_STRICT∈{1,true,yes,on}`이면 실패 시 throw.

## `StartServer(paths)` + `SetServerEnv` — 정규 서버 런치

명령행(node):
```
<NodeExe> <ServerEntry> serve-auth --host 127.0.0.1 --port 47900 \
  --admin-host 127.0.0.1 --admin-port 47910 \
  --client-exe <ClientExe> --trace <TracePath> --account-db <AccountDb>
```
`SetServerEnv`가 Process.Start **이전에** 설정하는 정규 환경변수(= logh7-live 스킬의 검증 플래그와 정합):
`LOGH_ACCOUNT_DB`, `LOGH_LOBBY_OK_FORMAT=message32`, `LOGH_LOBBY_RICH_CHARACTERS=1`, `LOGH_LOBBY_EARLY_OK=1`, `LOGH_SS_FORMAT=message32`, `LOGH_WORLD_PLAYER=1`, `LOGH_STRAT_GRID=1`, `LOGH_STRAT_TERRAIN=1`, `LOGH_STRAT_FLEET=1`, `LOGH_STRAT_GALAXY=1`, `LOGH_STRAT_GRID_EARLY=1`, `LOGH_TACTICS_UNIT=1`, `LOGH_GRID_ENTER=1`, `LOGH_POSTLOAD_RICH_CHARACTER=1`, `LOGH_CONTENT_DB=1`, `LOGH_KO_NAMES=1`, `LOGH_SCENARIO=<RuntimeRoot>/content/scenarios/canon-801-07.json`, `LOGH_ADMIN_HOST=127.0.0.1`, `LOGH_ADMIN_PORT=47910`.
서버 stdout/stderr는 `logh7-runtime/logs/server.log`로 라인 기록.

## 회원가입 경로

`RegisterAccount`: 계정 검증(1~32 printable ASCII), 비번 검증(1~8 printable ASCII) → `RunAdminCommand`로 `<node> <ServerEntry> admin create <account> --password-stdin --account-db <db>`(비번은 stdin, 15s 타임아웃). 에러는 `LocalizeAdminError`로 한글화(account already exists / invalid label / limit reached 등). 검증은 `admin exists`.

## `RuntimePaths` 레이아웃 (설치 루트 기준)

- `exe/G7MTClient.exe`(ClientExe), `G7Start.exe`(LegacyLauncherExe)
- `logh7-runtime/src/server/logh7-server.mjs`(ServerEntry)
- `logh7-runtime/state/accounts.json`(AccountDb), `.../state`(StateDir)
- `logh7-runtime/logs/{server,launcher}.log`, `logh7-runtime/traces/live-trace.jsonl`
- `exe/String.txt`(+`.original` 백업), `fonts/`(Pretendard), `tools/packaging/install-pretendard.ps1`
- NodeExe 탐색: `LOGH7_NODE` env → `logh7-runtime/node/node.exe` → PATH → `"node.exe"` 폴백.

## 상수/임계값 (P0)

- 게임 포트 47900, 관리 포트 47910, 호스트 127.0.0.1.
- WaitForServer 12s, WaitForClientSmoke 5s, admin 명령 15s, 폰트 설치 60s.

## 남은 것

- IL 레벨 완전(메서드 바디 전부 디컴파일). 추가 RE 불필요. 단 `G7Start.exe`(레거시 DX9 런처, native, Ghidra 인덱스 있음)는 함수 RE 캠페인에서 별도 처리.
