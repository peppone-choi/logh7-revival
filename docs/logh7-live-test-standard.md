# LOGH VII 라이브 테스트 단일 표준 (일원화) — 2026-06-26

사용자: "테스트용 접속 루트가 여러 개… 접속 env도… 전부 일원화해. 너무 복잡하다."
→ **유일한 라이브 테스트 경로**. 이외 변종/포트/세션/env는 전부 폐기(사용 금지).

## 유일 경로 = `tools/logh7_live_env.sh`

```
bash tools/logh7_live_env.sh start    # 서버+클라 기동(클린)
#   → 사람이 직접 로그인: ID/PW 아무거나(accept-any). 로비→새캐릭→세션→진영/초상화/이름→게임시작.
bash tools/logh7_live_env.sh wait --code 0x0f02 --timeout 50
bash tools/logh7_live_env.sh shot --label X
bash tools/logh7_live_env.sh trace
bash tools/logh7_live_env.sh stop     # 항상 — canonical SHA 복원검증
```

## 고정 표준 (절대 불변)
| 항목 | 값 | 이유 |
|---|---|---|
| 포트 | **47900** | 클라 리다이렉트가 `COMMANDLINE_BOOTSTRAP_PORT=47900` 하드코딩. **다른 포트=클라가 빈 47900 보고 NO DATA**(최근 47901~47905 실패 근본) |
| 세션 | `.omo/ui-explorer/live` | 단일. 누적 상태/혼선 제거 |
| EXE | canonical playable **`992dc7e2`** (ui_explorer 기본) | manual login. autologin 변종 전부 폐기 |
| 디스플레이 | windowed(로그인) → 게임이 자동 풀스크린 | 사용자 사양 |
| 인증 | accept-any-GIN7 (dev-test 기본) | 자격 무관 통과. strict(signup) 필요 시만 별도 |
| 로그인 | **사람이 직접**(`--no-login`) | 자동 클릭은 D3D8 포커스 의존이라 신뢰불가 |
| 프로세스 정리 | `G7MTClient.exe`만 kill | node 절대 안 죽임(워크플로/하네스 보호) |

## 폐기(사용 금지) — 혼선 원인이었음
- 포트: 47901/47902/47903/47904/47905 (전부 클라 47900 미스매치).
- 세션: live-real-login / live-state / live-state2/3/4 / live-manual (누적 상태).
- EXE: autologin.emp1 / autologin-bootstrap-emp1 / autologin.all1/2 / c002-setup / m1-c002-v2/v3 등 변종 전부.
- 산발 `--env ...` 수기 나열 → 표준 1세트(wrapper ENVS)로 고정.

## 근본 교훈
최근 라이브 실패는 "포그라운드 락"이 아니라 **포트 47905≠클라 47900 미스매치**였음. 일원화(47900 고정)가 해결.

## 서버/클라 분리 — 운영자 vs 유저 (2026-06-26)
사용자: "유저가 서버를 켜진 않잖아." → 서버 기동과 클라 기동을 완전히 분리.
모두 동일 단일 표준 `tools/logh7_launch_config.py`(포트 47900 / 표준 ENV / canonical playable EXE)를 읽으므로 test == 정식 플레이 경로 불변.

| 역할 | 실행 | 동작 |
|---|---|---|
| **운영자/호스트** | `start-server.bat` (→ `start_server.py`) | Node 인증 서버만(클라 없이) 47900 에 포그라운드 기동, 자기 콘솔 유지. `serve-auth --host 127.0.0.1 --port 47900 --trace .omo/ui-explorer/live/trace.jsonl` + 표준 ENV. 종료=Ctrl+C |
| **유저(엔드유저)** | **`dist\play-logh7.exe`** (= 새 표준) 또는 `play-logh7.bat`/`play_logh7.py` | (1) 47900 소켓 접속 테스트 → 꺼져 있으면 "서버가 꺼져 있습니다. 운영자가 start-server.bat 실행 필요" 출력 후 비정상 종료. (2) 살아 있으면 canonical playable 클라만 실행(자동 47900 리다이렉트). **서버는 절대 켜지 않음** |
| **테스트 하네스** | `tools/logh7_live_env.sh` / `ui_explorer` | 변경 없음 — 동일 config 사용 |

유저 표준 = **`dist\play-logh7.exe`** (클라 전용, 47900 접속). 빌드: 저장소 루트에서 `python -m PyInstaller --onefile --name play-logh7 play_logh7.py` (tools 네임스페이스 패키지라 `--paths . --collect-submodules tools` 권장).

## 삭제 후보(유저가 나중에 prune — 자동 삭제하지 않음)
- `.omo/work/logh7-installed/exe/` 의 autologin EXE 변종: `G7MTClient.autologin.emp1.exe`, `*.autologin-bootstrap-emp1.exe`, `*.autologin.all1/all2.exe`, `*.c002-setup.exe`, `*.m1-c002-v2/v3.exe` 등 (위 "폐기" 목록의 변종 전부). canonical playable 하나만 표준.
- 구 per-session 런처/세션 디렉터리: `live-real-login`, `live-state`, `live-state2/3/4`, `live-manual` 등.
- 구 `play_logh7.py`의 "서버+클라 올인원" 동작 — 이제 클라 전용으로 대체됨(서버 기동 코드 제거). `start-server.bat`/`start_server.py`가 서버 역할 인계.
- (선택) `keep_foreground.py` 등 autologin/포그라운드 우회 보조 스크립트 — 클라 전용 표준에선 불필요.
