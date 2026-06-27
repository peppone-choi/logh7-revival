#!/usr/bin/env bash
# LOGH VII 통합 라이브 테스트 환경 — 단일 표준(일원화).
# 매번 다른 세션/포트/EXE/env로 인한 플래키·재현불가·포그라운드락 누적을 제거한다.
# 사용: tools/logh7_live_env.sh <start|login|shot|trace|wait|stop|info|create> [extra args]
# 로그인은 사람이 직접(수동) — 자동 클릭은 D3D8 포커스 의존이라 신뢰불가.
set -u
cd "$(dirname "$0")/.." || exit 1

# ── 고정 표준(절대 바꾸지 말 것; 바꾸면 일원화 깨짐) ──
SESSION=".omo/ui-explorer/live"        # 단일 세션 디렉터리
# PORT 는 아래에서 단일 config(logh7_launch_config.py)로부터 읽는다.
# canonical playable EXE(992dc7e2)는 ui_explorer 기본값 사용(--patched-exe 미지정).
# 표준 서버 env(월드/전략/시드). accept-any는 사람이 직접 로그인하므로 자격 무관 통과.
# ── 단일 표준 SOURCE OF TRUTH = tools/logh7_launch_config.py ──
# ENVS 는 그 파일에서 동적으로 생성한다(하드코딩 드리프트 방지). cmd_start 도 동일 config를
# 자동 주입하므로 ENVS 미전달이어도 동일하지만, 명시 일관성+가독성 위해 전달한다.
PORT="$(python -c 'from tools.logh7_launch_config import PORT; print(PORT)')"
mapfile -t ENVS < <(python -c 'from tools.logh7_launch_config import standard_env_cli_args; print("\n".join(standard_env_cli_args()))')
UX() { python -m tools.logh7_ui_explorer --session "$SESSION" "$@"; }

cmd="${1:-}"; shift || true
case "$cmd" in
  start)
    # 클린 슬레이트: 게임 프로세스만 정리(node는 절대 건드리지 않음 — 워크플로/하네스 보호).
    taskkill //IM G7MTClient.exe //F >/dev/null 2>&1; sleep 1
    # 창모드 로그인(사용자 사양: 로그인만 창모드, 이후 게임이 자동 풀스크린).
    # --no-login: 자동 클릭 로그인을 끔(사람이 직접 로그인). 좌표/포커스 플래키 회피.
    UX start --port "$PORT" --no-login --display-mode windowed "${ENVS[@]}" "$@"
    echo ">>> 창을 포커스하고 직접 로그인: ID/PW 아무거나(accept-any). 로비→새캐릭→세션→진영/초상화/이름→게임시작."
    ;;
  login)  echo "로그인은 사람이 직접. (자동 로그인은 신뢰불가라 비표준.)";;
  wait)   UX wait-trace "$@";;
  shot)   UX shot "$@";;
  trace)  UX trace "$@";;
  info)   UX info "$@";;
  create) UX create-character "$@";;
  stop)   UX stop "$@";;   # 항상 stop으로 종료 → canonical EXE SHA(992dc7e2) 복원검증.
  *) echo "usage: $0 <start|wait|shot|trace|info|create|stop> [args]"; exit 1;;
esac
