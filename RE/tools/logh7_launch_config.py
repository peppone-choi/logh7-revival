"""LOGH VII 라이브 접속 단일 표준(SINGLE SOURCE OF TRUTH).

테스트 하네스(ui_explorer / logh7_live_env.sh)와 사용자 런처(play-logh7.bat /
play_logh7.py)가 **모두** 이 한 파일에서 포트·서버 ENV·canonical playable EXE 경로를
읽는다. 이로써 "테스트 접속 루트"와 "유저가 실제로 켜서 노는 루트"가 완전히 동일해진다.

표준 근거: docs/logh7-live-test-standard.md
- PORT=47900 은 클라 리다이렉트 패치(login-commandline-bootstrap)에 하드코딩됨.
  다른 포트면 클라가 빈 47900을 보고 "NO DATA"/미접속.
- canonical playable EXE = SHA 992dc7e2 (설치/빌드된 playable). autologin 변종 아님.
- 표준 ENV 는 테스트와 플레이가 동일하게 쓰는 게임플레이 활성 플래그.
"""
from __future__ import annotations

from collections import OrderedDict
from pathlib import Path
from typing import Final

from tools.logh7_client_exe import (
    CANONICAL_PLAYABLE_EXE,
    INSTALLED_CLIENT_EXE,
    REPO_ROOT,
    canonical_playable_sha256,
)

# ── 고정 표준(절대 불변; 바꾸면 일원화가 깨진다) ──
PORT: Final[int] = 47900

# 표준 서버 ENV(게임플레이 활성화). 테스트와 플레이가 동일. 순서 보존을 위해 OrderedDict.
# accept-any 라서 사람이 직접 ID/PW 아무거나로 로그인 가능.
STANDARD_SERVER_ENV: Final["OrderedDict[str, str]"] = OrderedDict(
    (
        ("LOGH_ACCEPT_ANY_GIN7", "1"),
        ("LOGH_LOBBY_OK_FORMAT", "message32"),
        ("LOGH_LOBBY_EARLY_OK", "1"),
        ("LOGH_SS_FORMAT", "message32"),
        ("LOGH_STRAT_GALAXY", "1"),
        ("LOGH_STRAT_GRID_EARLY", "1"),
        ("LOGH_STRAT_TERRAIN", "1"),
        ("LOGH_WORLD_PLAYER", "1"),
        ("LOGH_POSTLOAD_PLAYER_RECORD", "1"),
        ("LOGH_FULL_UNIT_LOCATION", "1"),
        ("LOGH_GRID_ENTER", "1"),
        ("LOGH_SEED_CANON_NPCS", "1"),  # 캐논 NPC 위계(자동황제 픽스)
    )
)


def standard_server_env() -> "OrderedDict[str, str]":
    """표준 ENV의 복사본(호출자가 변형해도 원본 불변)."""
    return OrderedDict(STANDARD_SERVER_ENV)


def standard_env_cli_args() -> list[str]:
    """`--env KEY=VAL` 형태의 ui_explorer CLI 인자 리스트(테스트 sh/bat 공용)."""
    args: list[str] = []
    for key, value in STANDARD_SERVER_ENV.items():
        args.extend(("--env", f"{key}={value}"))
    return args


def resolve_playable_client_exe() -> Path:
    """접속에 쓸 canonical playable EXE(설치된 playable). autologin 변종 아님.

    빌드 산출물(.omo/.../G7MTClient.playable.exe)이 있으면 그것을, 없으면 설치본을 반환.
    ui_explorer 와 동일한 선택 로직(choose_ui_explorer_launch 의 CANONICAL_PLAYABLE 경로).
    """
    if CANONICAL_PLAYABLE_EXE.exists():
        return CANONICAL_PLAYABLE_EXE
    return INSTALLED_CLIENT_EXE


def playable_client_sha256() -> str:
    return canonical_playable_sha256()


__all__ = [
    "PORT",
    "REPO_ROOT",
    "STANDARD_SERVER_ENV",
    "standard_server_env",
    "standard_env_cli_args",
    "resolve_playable_client_exe",
    "playable_client_sha256",
]
