"""LOGH VII 서버 기동 — 운영자/호스트 전용(유저용 아님).

유저는 서버를 켜지 않는다. 이 스크립트는 호스트(운영자)가 자기 콘솔에서
Node 인증 서버만(클라이언트 없이) 띄워 계속 살려두는 용도다. 단일 표준
tools/logh7_launch_config.py 에서 포트·표준 ENV 를 읽으므로 테스트 하네스
(ui_explorer / logh7_live_env.sh)와 동일한 서버 접속 루트가 된다.

종료: 이 창에서 Ctrl+C.
"""
from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

# 저장소 루트를 import 경로에 추가(이 파일이 루트에 있으므로 부모가 루트).
REPO_ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(REPO_ROOT))

from tools.logh7_launch_config import (  # noqa: E402
    PORT,
    standard_server_env,
)


def main() -> int:
    server_env = dict(os.environ)
    server_env.update(standard_server_env())  # 단일 표준 ENV

    trace_path = REPO_ROOT / ".omo/ui-explorer/live/trace.jsonl"
    trace_path.parent.mkdir(parents=True, exist_ok=True)

    cmd = [
        "node", "src/server/logh7-server.mjs", "serve-auth",
        "--host", "127.0.0.1", "--port", str(PORT),
        "--trace", str(trace_path),
    ]

    print("=" * 60)
    print(f" LOGH VII 인증 서버 (운영자 전용) — 포트 {PORT}")
    print(" 이 창을 열어둔 채로 유지하세요. 종료는 Ctrl+C.")
    print(f" trace: {trace_path}")
    print("=" * 60)
    print()

    # 포그라운드 실행(자기 콘솔 점유, 계속 살아있음).
    proc = subprocess.run(cmd, cwd=str(REPO_ROOT), env=server_env)
    return proc.returncode


if __name__ == "__main__":
    raise SystemExit(main())
