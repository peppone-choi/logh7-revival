from __future__ import annotations

import shutil
import subprocess
from pathlib import Path
from typing import Final


REPO_ROOT: Final = Path(__file__).resolve().parents[1]
PROJECT_ROOT: Final = REPO_ROOT.parent
LAUNCHER_SOURCE: Final = REPO_ROOT / "tools" / "launcher" / "LOGH7Launcher.cs"
FONT_INSTALLER_SOURCE: Final = REPO_ROOT / "tools" / "packaging" / "install-pretendard.ps1"
FONT_SOURCE_DIR: Final = REPO_ROOT / "fonts"
CANON_SERVER_ROOT: Final = PROJECT_ROOT / "server"
SERVER_SOURCE_DIR: Final = (
    CANON_SERVER_ROOT / "src" / "server"
    if (CANON_SERVER_ROOT / "src" / "server").exists()
    else REPO_ROOT / "src" / "server"
)
CONTENT_SOURCE_DIR: Final = (
    CANON_SERVER_ROOT / "content"
    if (CANON_SERVER_ROOT / "content").exists()
    else REPO_ROOT / "content"
)
DGVOODOO_EXTRACTED_DIR: Final = REPO_ROOT / ".omo" / "work" / "dgVoodoo2_87_2"
INSTALLED_EXE_DIR: Final = REPO_ROOT / ".omo" / "work" / "logh7-installed" / "exe"
PLAYER_LAUNCHER_EXE: Final = "LOGH7Launcher.exe"
RUNTIME_ROOT: Final = "logh7-runtime"
DGVOODOO_WINDOWED_DEFAULTS: Final[dict[str, str]] = {
    "FullScreenMode": "false",
    "ScalingMode": "centered",
    "Resampling": "pointsampled",
    "WindowedAttributes": "",
    "FullscreenAttributes": "fullscreensize",
    "WatermarkDisplayDuration": "1",
    "3DfxWatermark": "false",
    "3DfxSplashScreen": "false",
    "dgVoodooWatermark": "false",
    "Filtering": "appdriven",
    "Antialiasing": "off",
    "RTTexturesForceScaleAndMSAA": "false",
    "SmoothedDepthSampling": "false",
}
RUNTIME_CONTENT_FILES: Final[tuple[str, ...]] = (
    "content/logh7-content.db",
    "content/galaxy.json",
    "content/ship-stats.json",
    "content/character-roster.json",
    "content/planet-economy.json",
    "content/fortresses.json",
    "content/names/systems-ko.json",
    "content/names/planets-ko.json",
    "content/roster/ability-seed.json",
    "content/roster/characters.json",
    "content/roster/face-name-map.json",
    "content/roster/face-pool.json",
    "content/roster/ivex-reference.json",
    "content/roster/ivex-stats.json",
    "content/roster/manual-roster.json",
    "content/roster/ranks.json",
    "content/scenarios/canon-801-07.json",
    "content/manual/org-posts.json",
    "content/manual/strategy-commands.json",
    "content/manual/unit-types-deployments.json",
    "content/manual/ship-units.json",
    "content/client/msgdat.json",
    "content/client/schema.json",
    "content/extracted/all-names.json",
)


class PlayerRuntimeError(RuntimeError):
    pass


def write_player_runtime_files(destination: Path) -> list[dict[str, str]]:
    runtime = destination / RUNTIME_ROOT
    written: list[dict[str, str]] = []
    written.extend(_copy_server(runtime))
    written.extend(_copy_content(runtime))
    written.extend(_copy_launcher_source(runtime))
    written.extend(_copy_font_runtime(destination))
    written.extend(_copy_dgvoodoo_runtime(destination))
    written.extend(_write_file_layout_note(destination))
    written.extend(_write_runtime_note(runtime))
    written.append(_compile_launcher(destination))
    return written


def player_launcher_manifest() -> dict[str, str]:
    return {
        "exe": PLAYER_LAUNCHER_EXE,
        "clientExe": "exe/G7MTClient.exe",
        "serverEntry": f"{RUNTIME_ROOT}/src/server/logh7-server.mjs",
        "stateDir": f"{RUNTIME_ROOT}/state",
        "accountDb": f"{RUNTIME_ROOT}/state/accounts.sqlite",
        "worldStateDb": f"{RUNTIME_ROOT}/state/world-state.sqlite",
        "signupCommand": f"{PLAYER_LAUNCHER_EXE} --signup",
        "signupSmokeCommand": f"{PLAYER_LAUNCHER_EXE} --signup-smoke",
        "adminUrl": "http://127.0.0.1:47910/admin/session-state",
        "mode": "local-authoritative-server-plus-client",
    }


def _copy_server(runtime: Path) -> list[dict[str, str]]:
    target = runtime / "src" / "server"
    if target.exists():
        shutil.rmtree(target)
    shutil.copytree(SERVER_SOURCE_DIR, target, ignore=shutil.ignore_patterns("__pycache__", "*.pyc"))
    return [{"path": _archive_path(path, runtime), "reason": "local Node.js authoritative server runtime"}
            for path in _files(target)]


def _copy_content(runtime: Path) -> list[dict[str, str]]:
    target_root = runtime / "content"
    if target_root.exists():
        shutil.rmtree(target_root)

    written: list[dict[str, str]] = []
    for rel in RUNTIME_CONTENT_FILES:
        source = _content_source(rel)
        if not source.exists():
            raise PlayerRuntimeError(f"required runtime content is missing: {source}")
        target = runtime / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, target)
        written.append({"path": _archive_path(target, runtime), "reason": "server content runtime"})
    return written


def _content_source(rel: str) -> Path:
    path = Path(rel)
    parts = path.parts
    if not parts or parts[0] != "content":
        raise PlayerRuntimeError(f"runtime content path must be under content/: {rel}")
    return CONTENT_SOURCE_DIR.joinpath(*parts[1:])


def _copy_launcher_source(runtime: Path) -> list[dict[str, str]]:
    target = runtime / "launcher" / "LOGH7Launcher.cs"
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(LAUNCHER_SOURCE, target)
    return [{"path": _archive_path(target, runtime), "reason": "player launcher source"}]


def _copy_font_runtime(destination: Path) -> list[dict[str, str]]:
    written: list[dict[str, str]] = []
    installer_target = destination / "tools" / "packaging" / "install-pretendard.ps1"
    installer_target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(FONT_INSTALLER_SOURCE, installer_target)
    written.append({"path": installer_target.relative_to(destination).as_posix(), "reason": "Pretendard per-user font installer"})

    if FONT_SOURCE_DIR.exists():
        fonts_target = destination / "fonts"
        _copy_tree_skip_identical(FONT_SOURCE_DIR, fonts_target)
        written.extend(
            {"path": path.relative_to(destination).as_posix(), "reason": "Pretendard font payload"}
            for path in _files(fonts_target)
        )
    return written


def _copy_tree_skip_identical(source: Path, target: Path) -> None:
    target.mkdir(parents=True, exist_ok=True)
    for path in _files(source):
        rel = path.relative_to(source)
        out = target / rel
        out.parent.mkdir(parents=True, exist_ok=True)
        if out.exists() and out.stat().st_size == path.stat().st_size:
            continue
        shutil.copy2(path, out)


def _copy_dgvoodoo_runtime(destination: Path) -> list[dict[str, str]]:
    exe_target = destination / "exe"
    exe_target.mkdir(parents=True, exist_ok=True)
    dll_source = DGVOODOO_EXTRACTED_DIR / "MS" / "x86" / "D3D8.dll"
    conf_source = INSTALLED_EXE_DIR / "dgVoodoo.conf"
    if not dll_source.exists():
        dll_source = INSTALLED_EXE_DIR / "D3D8.dll"
    if not conf_source.exists():
        conf_source = DGVOODOO_EXTRACTED_DIR / "dgVoodoo.conf"
    if not dll_source.exists():
        raise PlayerRuntimeError(f"required dgVoodoo D3D8.dll is missing: {dll_source}")
    if not conf_source.exists():
        raise PlayerRuntimeError(f"required dgVoodoo.conf is missing: {conf_source}")
    written: list[dict[str, str]] = []
    for source in (dll_source, conf_source):
        target = exe_target / source.name
        if source.resolve() != target.resolve():
            shutil.copy2(source, target)
        if target.name.casefold() == "dgvoodoo.conf":
            _patch_dgvoodoo_windowed_defaults(target)
        written.append({"path": target.relative_to(destination).as_posix(), "reason": "dgVoodoo D3D8 fullscreen/remaster runtime"})
    return written


def _patch_dgvoodoo_windowed_defaults(conf: Path) -> None:
    lines = conf.read_text(encoding="utf-8", errors="replace").splitlines()
    seen: set[str] = set()
    patched: list[str] = []
    for line in lines:
        stripped = line.lstrip()
        matched = next(
            (
                key
                for key in DGVOODOO_WINDOWED_DEFAULTS
                if stripped.startswith(key) and "=" in stripped
            ),
            None,
        )
        if matched is None:
            patched.append(line)
            continue
        prefix = line[: len(line) - len(stripped)]
        patched.append(f"{prefix}{matched:<36} = {DGVOODOO_WINDOWED_DEFAULTS[matched]}")
        seen.add(matched)
    for key, value in DGVOODOO_WINDOWED_DEFAULTS.items():
        if key not in seen:
            patched.append(f"{key:<36} = {value}")
    conf.write_text("\n".join(patched) + "\n", encoding="utf-8")


def _write_runtime_note(runtime: Path) -> list[dict[str, str]]:
    target = runtime / "LOGH7-RUNTIME.txt"
    target.write_text(
        "LOGH VII local runtime\n\n"
        "LOGH7Launcher.exe preflights exe/G7MTClient.exe, starts this Node.js server runtime, "
        "and then launches the game client.\n"
        "Run LOGH7Launcher.exe --client-preflight to check Windows Application Control / "
        "Smart App Control before starting the server.\n"
        "Server state and traces are written under logh7-runtime/state, logs, and traces.\n",
        encoding="utf-8",
        newline="\r\n",
    )
    return [{"path": _archive_path(target, runtime), "reason": "player runtime note"}]


def _write_file_layout_note(destination: Path) -> list[dict[str, str]]:
    target = destination / "LOGH7-FILE-LAYOUT.txt"
    target.write_text(
        "LOGH VII distribution layout\n\n"
        "Client package:\n"
        "- LOGH7Launcher.exe\n"
        "- LOGH7Launcher.exe --client-preflight for fast Windows Application Control checks\n"
        "- diagnose-appcontrol.ps1 for SHA/signature/CodeIntegrity evidence collection\n"
        "- exe/G7MTClient.exe and legacy client data\n"
        "- exe/D3D8.dll and exe/dgVoodoo.conf\n"
        "- fonts/ and tools/packaging/install-pretendard.ps1\n\n"
        "Server/admin package:\n"
        "- logh7-runtime/src/server/\n"
        "- logh7-runtime/content/\n"
        "- logh7-runtime/state/accounts.sqlite\n"
        "- logh7-runtime/state/world-state.sqlite\n"
        "- logh7-runtime/logs/ and logh7-runtime/traces/\n\n"
        "This local bundle keeps both sides together only for single-machine development smoke tests.\n"
        "Release packaging must emit separate client and server archives; the player should not need the original LOGH VII installer.\n",
        encoding="utf-8",
        newline="\r\n",
    )
    return [{"path": target.relative_to(destination).as_posix(), "reason": "server/client package boundary note"}]


def _compile_launcher(destination: Path) -> dict[str, str]:
    out = destination / PLAYER_LAUNCHER_EXE
    command = (
        "$ErrorActionPreference = 'Stop'; "
        f"Add-Type -Path '{_ps_quote(LAUNCHER_SOURCE)}' "
        f"-OutputAssembly '{_ps_quote(out)}' "
        "-OutputType WindowsApplication "
        "-ReferencedAssemblies 'System.Windows.Forms','System.Drawing'"
    )
    result = subprocess.run(
        ["powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command],
        cwd=REPO_ROOT,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    if result.returncode != 0:
        raise PlayerRuntimeError(result.stderr.strip() or result.stdout.strip() or "launcher compile failed")
    return {"path": PLAYER_LAUNCHER_EXE, "reason": "compiled player launcher executable"}


def _files(root: Path) -> tuple[Path, ...]:
    return tuple(path for path in sorted(root.rglob("*"), key=lambda item: item.as_posix().casefold()) if path.is_file())


def _archive_path(path: Path, runtime: Path) -> str:
    return f"{RUNTIME_ROOT}/{path.relative_to(runtime).as_posix()}"


def _ps_quote(path: Path) -> str:
    return str(path).replace("'", "''")
