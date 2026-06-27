"""LOGH VII 유저 런처 — 클라이언트 전용(서버는 켜지 않는다).

유저가 서버를 켜진 않는다. 운영자가 start-server.bat 으로 서버를 미리 띄워두고,
유저는 이 런처(.bat 더블클릭 또는 .py / 빌드된 dist\\play-logh7.exe)로 클라만 띄운다.

동작:
  1) 서버(127.0.0.1:47900)가 listening 인지 소켓 접속으로 확인.
     - 꺼져 있으면 안내 메시지 출력 후 비정상 종료(운영자가 start-server.bat 실행 필요).
  2) 살아 있으면 canonical playable 클라 EXE 실행(자동 127.0.0.1:47900 리다이렉트).

테스트 하네스(ui_explorer / logh7_live_env.sh)와 **동일한** 단일 표준
tools/logh7_launch_config.py 에서 포트·EXE를 읽으므로 test == 정식 플레이 경로다.
"""
from __future__ import annotations

import socket
import subprocess
import sys
from pathlib import Path

# 저장소 루트를 import 경로에 추가(이 파일이 루트에 있으므로 부모가 루트).
# PyInstaller --onefile 로 동결되면 __file__ 이 임시 추출 경로가 되므로,
# 그 경우 sys._MEIPASS 안에 함께 번들된 tools 를 사용한다.
if getattr(sys, "frozen", False):
    REPO_ROOT = Path(getattr(sys, "_MEIPASS", Path(sys.executable).resolve().parent))
else:
    REPO_ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(REPO_ROOT))

from tools.logh7_client_exe import CLIENT_DIR, INSTALLED_CLIENT_EXE  # noqa: E402
from tools.logh7_launch_config import (  # noqa: E402
    PORT,
    resolve_playable_client_exe,
)

DETACHED_PROCESS = 0x00000008
CREATE_NEW_PROCESS_GROUP = 0x00000200
HOST = "127.0.0.1"


def server_is_listening(host: str, port: int, timeout: float = 1.5) -> bool:
    """소켓 접속 테스트로 서버 가동 여부 확인."""
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except OSError:
        return False


def main() -> int:
    print(f"[1/2] 서버 접속 확인 ({HOST}:{PORT})...")
    if not server_is_listening(HOST, PORT):
        sys.stderr.write(
            "\n[오류] 서버가 꺼져 있습니다. "
            "운영자가 start-server.bat 실행 필요.\n"
            f"        ({HOST}:{PORT} 에 접속할 수 없습니다.)\n\n"
        )
        return 1

    exe = resolve_playable_client_exe()
    if not exe.exists():
        sys.stderr.write(f"[오류] 클라 EXE를 찾을 수 없음: {exe}\n")
        return 1

    # ui_explorer 와 동일: playable EXE를 설치 디렉터리의 G7MTClient.exe 로 복사 후 실행
    # (클라가 같은 폴더의 리소스/INI를 참조하므로 in-place 실행이 정석).
    import shutil
    backup = CLIENT_DIR / "G7MTClient.exe.playbak"
    if INSTALLED_CLIENT_EXE.exists() and not backup.exists():
        shutil.copy2(INSTALLED_CLIENT_EXE, backup)
    if exe.resolve() != INSTALLED_CLIENT_EXE.resolve():
        shutil.copy2(exe, INSTALLED_CLIENT_EXE)

    print(f"[2/2] 클라 실행: {INSTALLED_CLIENT_EXE.name} (자동 {HOST}:{PORT} 접속)")
    subprocess.Popen(
        [str(INSTALLED_CLIENT_EXE)], cwd=str(CLIENT_DIR),
        creationflags=DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP,
    )

    print()
    print("=" * 60)
    print(" 클라가 떴습니다. BOTHTEC 스플래시(~30초) 후 로그인 화면.")
    print(" 창을 클릭해 포커스 → ID/PW 아무거나 입력(accept-any) → 로그인.")
    print(" 로비→새캐릭→세션→진영/초상화/이름→게임시작 으로 플레이하세요.")
    print("=" * 60)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
