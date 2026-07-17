from __future__ import annotations

"""Wine 실행 전에 LOGH VII 클라이언트·prefix·증거 lineage를 fail-closed로 검증한다.

기본 동작은 Wine을 실행하지 않는 preflight이다. ``--execute``를 명시한
경우에만 검증된 절대 경로의 Wine toolchain을 호출한다.
native Windows에서는 Wine 인자를 처리하지 않고 direct client harness로 위임한다.
"""

import argparse
import hashlib
import json
import os
import platform
import re
import stat
import struct
import subprocess
import sys
from dataclasses import asdict, dataclass
from pathlib import Path, PurePosixPath
from typing import Any, Iterable, Mapping, Sequence

from tools.live.lineage_guard import inspect_pe


REPO_ROOT = Path(__file__).resolve().parents[2]
PREFIX_MARKER_NAME = ".logh7-wine-prefix.json"
PREFIX_MARKER_SENTINEL = "LOGH7-WINE-PREFIX-V1"
EXECUTION_LOCK_NAME = ".logh7-wine-execution.lock"
EXECUTION_LOCK_SENTINEL = "LOGH7-WINE-EXECUTION-LOCK-V1"
LINEAGE_SENTINEL = "LOGH7-WINE-LINEAGE-V1"
RUNTIME_SUPPORT_SENTINEL = "LOGH7-WINE-RUNTIME-SUPPORT-V1"
DATA_TREE_SENTINEL = "LOGH7-DATA-TREE-MANIFEST-V1"
PROJECT_ID = "logh7-revival"
PREFIX_MODE_SYSTEM_ARCHITECTURES = {"win32": "win32", "wow64": "win64"}
PREFIX_MODE_WINEARCH = {"win32": "win32", "wow64": "wow64"}
SHA256_RE = re.compile(r"^[0-9a-f]{64}$")
RUN_ID_RE = re.compile(r"^\d{8}T\d{6}Z-[A-Za-z0-9][A-Za-z0-9._-]{3,63}$")
RUN9_REQUIRED_KINDS = (
    "client",
    "patch",
    "server",
    "seed",
    "world-entry",
    "movement",
    "relogin",
    "restart",
)
RUN9_PASS_OUTCOMES = frozenset({"pass", "passed"})
WINE_TOOL_BASENAMES = {
    "wine-bin": "wine",
    "wineboot-bin": "wineboot",
    "wineserver-bin": "wineserver",
}
WINE_ENV_ALLOWED_HOST_KEYS = (
    "AUDIODEV",
    "DBUS_SESSION_BUS_ADDRESS",
    "DISPLAY",
    "HOME",
    "LANG",
    "LC_ALL",
    "LC_CTYPE",
    "LOGNAME",
    "PATH",
    "PULSE_SERVER",
    "TEMP",
    "TMP",
    "TMPDIR",
    "USER",
    "WAYLAND_DISPLAY",
    "XAUTHORITY",
    "XDG_RUNTIME_DIR",
)
WINE_ENV_REMOVED_EXACT_KEYS = (
    "WINEARCH",
    "WINEDEBUG",
    "WINEDLLPATH",
    "WINEDLLOVERRIDES",
    "WINELOADER",
    "WINEPREFIX",
    "WINESERVER",
)
WINE_ENV_REMOVED_PREFIXES = ("DYLD_",)
CLIENT_ARG_ALLOWLIST: tuple[str, ...] = ()
RUNTIME_PROFILE_REQUIREMENTS: dict[str, frozenset[str]] = {
    "native": frozenset({"graphic-config"}),
    "1080p-dgvoodoo": frozenset(
        {"graphic-config", "d3d8", "dgvoodoo-config"}
    ),
}
RUNTIME_SINGLETON_PATHS = {
    "graphic-config": "GraphicConfig.txt",
    "d3d8": "D3D8.dll",
    "dgvoodoo-config": "dgVoodoo.conf",
}
CLIENT_REGISTRY_KEY = r"HKCU\Software\BOTHTEC\銀河英雄伝説VII\1.0"
CLIENT_REGISTRY_VALUE = "Install"
REGISTRY_BACKUP_NAME = ".logh7-client-registry-before.reg"
REGISTRY_RESTORED_NAME = ".logh7-client-registry-restored.reg"
EXPECTED_DATA_FILE_COUNT = 2185


@dataclass(frozen=True)
class Blocker:
    code: str
    detail: str
    path: str | None = None


@dataclass(frozen=True)
class VerifiedFile:
    role: str
    path: str
    sha256: str
    size: int


@dataclass(frozen=True)
class WineTool:
    role: str
    invoked_path: Path
    resolved_path: Path
    sha256: str
    size: int


@dataclass
class ExecutionLock:
    descriptor: int
    device: int
    inode: int
    path: Path
    payload: bytes
    owner: dict[str, Any]


@dataclass
class DriveLease:
    acquired_snapshot: list[dict[str, Any]]
    created_install_identity: tuple[int, int] | None
    discarded_mappings: dict[str, str]
    dosdevices: Path
    dosdevices_identity: tuple[int, int]
    drive_c: Path
    drive_c_identity: tuple[int, int]
    install_mapping: Path
    install_preexisted: bool
    install_root: Path
    initial_snapshot: list[dict[str, Any]]
    letter: str
    prefix: Path
    quarantined_mappings: dict[str, str]


def _wine_tool_snapshot(tool: WineTool) -> dict[str, Any]:
    return {
        "invokedPath": str(tool.invoked_path),
        "resolvedPath": str(tool.resolved_path),
        "sha256": tool.sha256,
        "size": tool.size,
    }


def _json_bytes(value: Any) -> bytes:
    return (
        json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True, separators=(",", ": "))
        + "\n"
    ).encode("utf-8")


def _sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _normalise_sha256(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    lowered = value.strip().lower()
    return lowered if SHA256_RE.fullmatch(lowered) else None


def _code_token(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", value.lower()).strip("_")


def _parse_integer(value: Any, label: str) -> int:
    if isinstance(value, bool):
        raise ValueError(f"{label} must be an integer")
    if isinstance(value, int):
        return value
    if isinstance(value, str):
        return int(value, 0)
    raise ValueError(f"{label} must be an integer or 0x-prefixed string")


def _is_within(path: Path, parent: Path) -> bool:
    try:
        path.relative_to(parent)
        return True
    except ValueError:
        return False


def _resolve_manifest_path(manifest_path: Path, raw_path: Any) -> Path | None:
    if not isinstance(raw_path, str) or not raw_path.strip():
        return None
    candidate = Path(raw_path).expanduser()
    if not candidate.is_absolute():
        candidate = manifest_path.parent / candidate
    return candidate.resolve(strict=False)


def _manifest_layout_path(manifest_path: Path, raw_path: Any) -> Path | None:
    """manifest path가 가리키는 lexical layout과 resolved target을 분리한다."""

    if not isinstance(raw_path, str) or not raw_path.strip():
        return None
    candidate = Path(raw_path).expanduser()
    if not candidate.is_absolute():
        candidate = manifest_path.parent / candidate
    return Path(os.path.abspath(os.path.normpath(str(candidate))))


def _load_json(path: Path, role: str, blockers: list[Blocker]) -> Mapping[str, Any] | None:
    code_role = _code_token(role)
    if not path.is_file():
        blockers.append(Blocker(f"{code_role}_missing", f"{role} JSON file is missing", str(path)))
        return None
    try:
        loaded = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as error:
        blockers.append(Blocker(f"{code_role}_invalid_json", str(error), str(path)))
        return None
    if not isinstance(loaded, dict):
        blockers.append(Blocker(f"{code_role}_invalid_shape", "top level must be an object", str(path)))
        return None
    return loaded


def _record_file(
    files: list[VerifiedFile],
    role: str,
    path: Path,
    expected_sha256: Any,
    blockers: list[Blocker],
) -> str | None:
    code_role = _code_token(role)
    expected = _normalise_sha256(expected_sha256)
    if expected is None:
        blockers.append(Blocker(f"{code_role}_invalid_sha256", "expected SHA-256 must be 64 lowercase hex", str(path)))
        return None
    if not path.is_file():
        blockers.append(Blocker(f"{code_role}_missing", "required file is missing", str(path)))
        return None
    try:
        actual = _sha256_file(path)
        size = path.stat().st_size
    except OSError as error:
        blockers.append(Blocker(f"{code_role}_unreadable", str(error), str(path)))
        return None
    files.append(VerifiedFile(role=role, path=str(path), sha256=actual, size=size))
    if actual != expected:
        blockers.append(
            Blocker(
                f"{code_role}_sha256_mismatch",
                f"expected {expected}, found {actual}",
                str(path),
            )
        )
    return actual


def _validate_wine_tool(
    raw_path: str | None,
    role: str,
    blockers: list[Blocker],
    files: list[VerifiedFile],
) -> WineTool | None:
    code_role = _code_token(role)
    if not raw_path:
        blockers.append(Blocker(f"{code_role}_unset", f"{role} must be set to an absolute path"))
        return None
    candidate = Path(raw_path)
    if not candidate.is_absolute():
        blockers.append(
            Blocker(
                f"{code_role}_not_absolute",
                "bare and relative Wine commands are forbidden",
                raw_path,
            )
        )
        return None
    invoked = Path(os.path.abspath(os.path.normpath(str(candidate))))
    expected_basename = WINE_TOOL_BASENAMES.get(role)
    if expected_basename is None or invoked.name != expected_basename:
        blockers.append(
            Blocker(
                f"{code_role}_invoked_name_mismatch",
                f"{role} must be invoked with lexical basename {expected_basename!r}",
                str(invoked),
            )
        )
        return None
    try:
        resolved = invoked.resolve(strict=True)
    except (OSError, RuntimeError) as error:
        code = f"{code_role}_broken_symlink" if invoked.is_symlink() else f"{code_role}_missing"
        blockers.append(Blocker(code, str(error), str(invoked)))
        return None
    if not resolved.is_file():
        blockers.append(Blocker(f"{code_role}_missing", "Wine tool does not exist", str(invoked)))
        return None
    if not os.access(resolved, os.X_OK):
        blockers.append(
            Blocker(
                f"{code_role}_not_executable",
                "Wine tool target is not executable",
                str(invoked),
            )
        )
        return None
    actual = _sha256_file(resolved)
    files.append(
        VerifiedFile(
            role=role,
            path=str(resolved),
            sha256=actual,
            size=resolved.stat().st_size,
        )
    )
    return WineTool(
        role=role,
        invoked_path=invoked,
        resolved_path=resolved,
        sha256=actual,
        size=resolved.stat().st_size,
    )


def _prefix_marker_payload(repo_root: Path, run_id: str) -> dict[str, Any]:
    return {
        "exclusive": True,
        "project": PROJECT_ID,
        "repoRoot": str(repo_root),
        "runId": run_id,
        "schemaVersion": 1,
        "sentinel": PREFIX_MARKER_SENTINEL,
    }


def prepare_prefix_marker(prefix: Path, repo_root: Path, run_id: str) -> Path:
    """Wine을 호출하지 않고 새 run 전용 prefix만 원자적으로 claim한다."""

    if prefix.exists() and not prefix.is_dir():
        raise ValueError("Wine prefix path exists but is not a directory")
    prefix.mkdir(parents=True, exist_ok=True, mode=0o700)
    marker = prefix / PREFIX_MARKER_NAME
    if marker.exists():
        existing = json.loads(marker.read_text(encoding="utf-8"))
        if existing != _prefix_marker_payload(repo_root, run_id):
            raise ValueError("Wine prefix marker belongs to another run or repository")
        return marker
    unexpected = [entry.name for entry in prefix.iterdir()]
    if unexpected:
        raise ValueError("unmarked non-empty Wine prefix may be shared")
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL
    flags |= getattr(os, "O_CLOEXEC", 0)
    payload = _json_bytes(_prefix_marker_payload(repo_root, run_id))
    try:
        descriptor = os.open(marker, flags, 0o600)
    except FileExistsError as error:
        raise ValueError(
            "Wine prefix marker appeared during exclusive claim; inspect it before retrying"
        ) from error
    created_stat = os.fstat(descriptor)
    try:
        view = memoryview(payload)
        while view:
            written = os.write(descriptor, view)
            if written <= 0:
                raise OSError("short write while creating Wine prefix marker")
            view = view[written:]
        os.fsync(descriptor)
    except BaseException:
        try:
            current_stat = os.lstat(marker)
            if (current_stat.st_dev, current_stat.st_ino) == (
                created_stat.st_dev,
                created_stat.st_ino,
            ):
                os.unlink(marker)
        except OSError:
            pass
        raise
    finally:
        os.close(descriptor)
    return marker


def _execution_lock_payload(repo_root: Path, run_id: str) -> dict[str, Any]:
    return {
        "pid": os.getpid(),
        "project": PROJECT_ID,
        "repoRoot": str(repo_root),
        "runId": run_id,
        "schemaVersion": 1,
        "sentinel": EXECUTION_LOCK_SENTINEL,
    }


def _pid_is_alive(pid: int) -> bool:
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    return True


def _existing_execution_lock_blocker(
    lock_path: Path,
    repo_root: Path,
    run_id: str,
) -> Blocker:
    try:
        existing = json.loads(lock_path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as error:
        return Blocker(
            "wineprefix_execution_lock_invalid",
            f"existing lock is unreadable or malformed and must not be auto-removed: {error}",
            str(lock_path),
        )
    if not isinstance(existing, dict):
        return Blocker(
            "wineprefix_execution_lock_invalid",
            "existing lock is not an object and must not be auto-removed",
            str(lock_path),
        )
    expected_identity = {
        "project": PROJECT_ID,
        "repoRoot": str(repo_root),
        "runId": run_id,
        "schemaVersion": 1,
        "sentinel": EXECUTION_LOCK_SENTINEL,
    }
    if any(existing.get(key) != value for key, value in expected_identity.items()):
        return Blocker(
            "wineprefix_execution_lock_foreign",
            "existing lock belongs to another run/repository; automatic break is forbidden",
            str(lock_path),
        )
    pid = existing.get("pid")
    if not isinstance(pid, int) or isinstance(pid, bool) or pid <= 0:
        return Blocker(
            "wineprefix_execution_lock_invalid",
            "existing lock PID is invalid; automatic break is forbidden",
            str(lock_path),
        )
    if _pid_is_alive(pid):
        return Blocker(
            "wineprefix_execution_lock_held",
            f"execution lock is held by active PID {pid}",
            str(lock_path),
        )
    return Blocker(
        "wineprefix_execution_lock_stale",
        f"execution lock owner PID {pid} is not alive; manual evidence-backed cleanup is required",
        str(lock_path),
    )


def acquire_execution_lock(
    prefix: Path,
    repo_root: Path,
    run_id: str,
) -> tuple[ExecutionLock | None, Blocker | None, dict[str, Any]]:
    prefix = prefix.resolve(strict=False)
    repo_root = repo_root.resolve(strict=False)
    lock_path = prefix / EXECUTION_LOCK_NAME
    marker_path = prefix / PREFIX_MARKER_NAME
    expected_marker = _prefix_marker_payload(repo_root, run_id)
    try:
        marker = json.loads(marker_path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as error:
        blocker = Blocker(
            "wineprefix_execution_lock_marker_invalid",
            f"prefix marker cannot be revalidated before lock acquisition: {error}",
            str(marker_path),
        )
        return None, blocker, {"path": str(lock_path), "state": "blocked"}
    if marker != expected_marker:
        blocker = Blocker(
            "wineprefix_execution_lock_marker_changed",
            "prefix marker changed after preflight",
            str(marker_path),
        )
        return None, blocker, {"path": str(lock_path), "state": "blocked"}

    owner = _execution_lock_payload(repo_root, run_id)
    payload = _json_bytes(owner)
    flags = os.O_RDWR | os.O_CREAT | os.O_EXCL
    flags |= getattr(os, "O_CLOEXEC", 0)
    try:
        descriptor = os.open(lock_path, flags, 0o600)
    except FileExistsError:
        blocker = _existing_execution_lock_blocker(lock_path, repo_root, run_id)
        return None, blocker, {
            "path": str(lock_path),
            "state": "blocked",
        }
    except OSError as error:
        blocker = Blocker(
            "wineprefix_execution_lock_create_failed",
            str(error),
            str(lock_path),
        )
        return None, blocker, {"path": str(lock_path), "state": "blocked"}

    created_stat = os.fstat(descriptor)
    try:
        view = memoryview(payload)
        while view:
            written = os.write(descriptor, view)
            if written <= 0:
                raise OSError("short write while creating execution lock")
            view = view[written:]
        os.fsync(descriptor)
    except BaseException as error:
        try:
            current_stat = os.lstat(lock_path)
            if (current_stat.st_dev, current_stat.st_ino) == (
                created_stat.st_dev,
                created_stat.st_ino,
            ):
                os.unlink(lock_path)
        except OSError:
            pass
        os.close(descriptor)
        blocker = Blocker(
            "wineprefix_execution_lock_write_failed",
            str(error),
            str(lock_path),
        )
        return None, blocker, {"path": str(lock_path), "state": "blocked"}

    lock = ExecutionLock(
        descriptor=descriptor,
        device=created_stat.st_dev,
        inode=created_stat.st_ino,
        owner=owner,
        path=lock_path,
        payload=payload,
    )
    return lock, None, {
        "owner": owner,
        "path": str(lock_path),
        "state": "acquired",
    }


def release_execution_lock(lock: ExecutionLock) -> dict[str, Any]:
    result: dict[str, Any] = {
        "owner": lock.owner,
        "path": str(lock.path),
        "released": False,
        "state": "release-failed",
    }
    try:
        current_stat = os.lstat(lock.path)
        expected_identity = (lock.device, lock.inode)
        current_identity = (current_stat.st_dev, current_stat.st_ino)
        if current_identity != expected_identity:
            result["error"] = "lock path inode changed; foreign replacement was preserved"
            return result
        if lock.path.read_bytes() != lock.payload:
            result["error"] = "lock payload changed; foreign content was preserved"
            return result
        final_stat = os.lstat(lock.path)
        if (final_stat.st_dev, final_stat.st_ino) != expected_identity:
            result["error"] = "lock inode changed during release; replacement was preserved"
            return result
        os.unlink(lock.path)
        result["released"] = True
        result["state"] = "released"
        return result
    except OSError as error:
        result["error"] = str(error)
        return result
    finally:
        try:
            os.close(lock.descriptor)
        except OSError as error:
            result["released"] = False
            result["state"] = "release-failed"
            result["closeError"] = str(error)


def _validate_prefix(
    raw_prefix: str | None,
    repo_root: Path,
    run_id: str,
    blockers: list[Blocker],
    files: list[VerifiedFile],
    *,
    prepare: bool,
    home: Path | None = None,
) -> tuple[Path | None, Path | None]:
    if not raw_prefix:
        blockers.append(Blocker("wineprefix_unset", "WINEPREFIX must be explicitly set"))
        return None, None
    candidate = Path(raw_prefix).expanduser()
    if not candidate.is_absolute():
        blockers.append(
            Blocker(
                "wineprefix_not_absolute",
                "WINEPREFIX must be an absolute path",
                raw_prefix,
            )
        )
        return None, None
    prefix = candidate.resolve(strict=False)
    default_prefix = ((home or Path.home()) / ".wine").resolve(strict=False)
    unsafe = False
    if prefix == default_prefix:
        blockers.append(
            Blocker(
                "default_wineprefix_forbidden",
                "default ~/.wine must never be used",
                str(prefix),
            )
        )
        unsafe = True
    if prefix == repo_root or _is_within(prefix, repo_root):
        blockers.append(
            Blocker(
                "repo_internal_wineprefix_forbidden",
                "Wine prefix must live outside the repository",
                str(prefix),
            )
        )
        unsafe = True
    if unsafe:
        return prefix, None

    marker = prefix / PREFIX_MARKER_NAME
    if prepare:
        try:
            marker = prepare_prefix_marker(prefix, repo_root, run_id)
        except (OSError, ValueError, json.JSONDecodeError) as error:
            blockers.append(Blocker("wineprefix_prepare_failed", str(error), str(prefix)))
            return prefix, None
    if not prefix.is_dir():
        blockers.append(
            Blocker(
                "wineprefix_missing",
                "run-specific Wine prefix directory is missing",
                str(prefix),
            )
        )
        return prefix, None
    marker_payload = _load_json(marker, "wineprefix_marker", blockers)
    if marker_payload is None:
        return prefix, None
    expected_marker = _prefix_marker_payload(repo_root, run_id)
    if dict(marker_payload) != expected_marker:
        blockers.append(
            Blocker(
                "wineprefix_shared_or_foreign",
                "prefix marker does not match this exact repository and run",
                str(marker),
            )
        )
        return prefix, None
    marker_sha = _sha256_file(marker)
    files.append(
        VerifiedFile(
            role="wineprefix-marker",
            path=str(marker),
            sha256=marker_sha,
            size=marker.stat().st_size,
        )
    )
    return prefix, marker


def inspect_prefix_architecture(
    prefix: Path,
    *,
    prefix_mode: str = "win32",
) -> dict[str, Any]:
    """marker 검증이 끝난 prefix의 Wine architecture header를 읽는다."""

    system_reg = prefix / "system.reg"
    result: dict[str, Any] = {
        "detectedArch": None,
        "expectedArch": PREFIX_MODE_SYSTEM_ARCHITECTURES.get(prefix_mode),
        "prefixMode": prefix_mode,
        "state": "uninitialized",
        "systemReg": str(system_reg),
        "systemRegSha256": None,
    }
    drive_c = prefix / "drive_c"
    dosdevices = prefix / "dosdevices"
    c_mapping = dosdevices / "c:"
    result["layout"] = {
        "cMapping": str(c_mapping),
        "dosdevices": str(dosdevices),
        "driveC": str(drive_c),
        "present": False,
        "verified": False,
    }
    layout_invalid = False
    directory_presence: dict[Path, bool] = {}
    try:
        for directory in (drive_c, dosdevices):
            try:
                current = os.lstat(directory)
            except FileNotFoundError:
                directory_presence[directory] = False
                continue
            directory_presence[directory] = True
            result["layout"]["present"] = True
            if stat.S_ISLNK(current.st_mode) or not stat.S_ISDIR(current.st_mode):
                layout_invalid = True
        if layout_invalid:
            result["layout"]["error"] = (
                "drive_c and dosdevices must be real directories inside the prefix"
            )
        elif all(directory_presence.get(path, False) for path in (drive_c, dosdevices)):
            if not (c_mapping.exists() or c_mapping.is_symlink()):
                pass
            elif not c_mapping.is_symlink():
                layout_invalid = True
                result["layout"]["error"] = "dosdevices/c: must be a symlink to drive_c"
            else:
                try:
                    c_target = c_mapping.resolve(strict=True)
                    expected_c_target = drive_c.resolve(strict=True)
                except (OSError, RuntimeError) as error:
                    layout_invalid = True
                    result["layout"]["error"] = str(error)
                else:
                    if c_target != expected_c_target:
                        layout_invalid = True
                        result["layout"]["error"] = (
                            "dosdevices/c: must resolve to this prefix's drive_c"
                        )
                    else:
                        result["layout"]["verified"] = True
    except OSError as error:
        layout_invalid = True
        result["layout"]["error"] = str(error)

    try:
        system_reg_stat = os.lstat(system_reg)
    except FileNotFoundError:
        if layout_invalid:
            result["state"] = "invalid"
        return result
    if stat.S_ISLNK(system_reg_stat.st_mode) or not stat.S_ISREG(system_reg_stat.st_mode):
        result["state"] = "invalid"
        result["systemRegError"] = "system.reg must be a regular file inside the prefix"
        return result

    result["state"] = "initialized"
    data = system_reg.read_bytes()
    result["systemRegSha256"] = _sha256_bytes(data)
    # Wine이 쓰는 header는 파일 앞부분에 단 한 번 나와야 한다.
    header_lines = data.decode("utf-8", errors="replace").splitlines()[:64]
    architecture_lines = [line for line in header_lines if line.startswith("#arch=")]
    if len(architecture_lines) == 1:
        result["detectedArch"] = architecture_lines[0].removeprefix("#arch=")
    if layout_invalid:
        result["state"] = "invalid"
    elif result["layout"]["verified"] is not True:
        result["state"] = "incomplete"
    return result


def inspect_dosdevices(prefix: Path) -> list[dict[str, Any]]:
    dosdevices = prefix / "dosdevices"
    if not dosdevices.is_dir():
        return []
    entries: list[dict[str, Any]] = []
    for path in sorted(dosdevices.iterdir(), key=lambda item: item.name.casefold()):
        entry: dict[str, Any] = {
            "name": path.name,
            "path": str(path),
            "rawTarget": None,
            "resolvedTarget": None,
            "state": "invalid",
        }
        if path.is_symlink():
            try:
                entry["rawTarget"] = os.readlink(path)
                entry["resolvedTarget"] = str(path.resolve(strict=True))
                entry["state"] = "symlink"
            except (OSError, RuntimeError) as error:
                entry["error"] = str(error)
        entries.append(entry)
    return entries


def _drive_snapshot_manifest(
    snapshot: Sequence[Mapping[str, Any]],
) -> list[dict[str, Any]]:
    return sorted(
        (
            {
                "name": str(entry.get("name", "")),
                "rawTarget": entry.get("rawTarget"),
                "state": str(entry.get("state", "invalid")),
            }
            for entry in snapshot
        ),
        key=lambda entry: entry["name"].casefold(),
    )


def _restore_quarantined_drive_mappings(
    dosdevices: Path,
    mappings: Mapping[str, str],
) -> list[str]:
    errors: list[str] = []
    for name, raw_target in mappings.items():
        mapping = dosdevices / name
        if mapping.exists() or mapping.is_symlink():
            try:
                if mapping.is_symlink() and os.readlink(mapping) == raw_target:
                    continue
            except OSError as error:
                errors.append(f"{name!r}: {error}")
                continue
            errors.append(f"{name!r}: mapping path occupied; foreign mapping preserved")
            continue
        try:
            os.symlink(raw_target, mapping)
        except OSError as error:
            errors.append(f"{name}: {error}")
    return errors


def _real_directory_identity(path: Path) -> tuple[int, int]:
    current = os.lstat(path)
    if stat.S_ISLNK(current.st_mode) or not stat.S_ISDIR(current.st_mode):
        raise ValueError(f"{path} must be a real directory, not a symlink")
    return current.st_dev, current.st_ino


def _revalidate_directory_identity(
    path: Path,
    expected: tuple[int, int],
) -> dict[str, Any] | None:
    try:
        if _real_directory_identity(path) != expected:
            return {
                "code": "wineprefix_layout_directory_changed",
                "path": str(path),
            }
    except (OSError, ValueError) as error:
        return {
            "code": "wineprefix_layout_directory_changed",
            "error": str(error),
            "path": str(path),
        }
    return None


def acquire_runtime_drive_lease(
    prefix: Path,
    drive: Mapping[str, Any],
    *,
    restoration_snapshot: Sequence[Mapping[str, Any]] | None = None,
) -> tuple[DriveLease | None, dict[str, Any] | None]:
    letter = str(drive.get("letter", "")).upper()
    install_root = Path(str(drive.get("hostRoot", ""))).resolve(strict=False)
    dosdevices = prefix / "dosdevices"
    drive_c = prefix / "drive_c"
    try:
        dosdevices_identity = _real_directory_identity(dosdevices)
        drive_c_identity = _real_directory_identity(drive_c)
    except (OSError, ValueError) as error:
        return None, {
            "code": "wineprefix_layout_directory_invalid",
            "error": str(error),
        }
    acquired_snapshot = inspect_dosdevices(prefix)
    initial_snapshot = (
        [dict(entry) for entry in restoration_snapshot]
        if restoration_snapshot is not None
        else [dict(entry) for entry in acquired_snapshot]
    )
    acquired_by_name = {
        entry["name"].casefold(): entry for entry in acquired_snapshot
    }
    initial_manifest_by_name = {
        entry["name"].casefold(): entry
        for entry in _drive_snapshot_manifest(initial_snapshot)
    }
    acquired_manifest_by_name = {
        entry["name"].casefold(): entry
        for entry in _drive_snapshot_manifest(acquired_snapshot)
    }
    install_mapping = dosdevices / letter.lower()
    c_mapping = dosdevices / "c:"
    if c_mapping.exists() or c_mapping.is_symlink():
        try:
            if not c_mapping.is_symlink() or c_mapping.resolve(strict=True) != (prefix / "drive_c").resolve(strict=True):
                return None, {
                    "code": "wine_dosdevice_c_mapping_invalid",
                    "mapping": str(c_mapping),
                }
        except (OSError, RuntimeError) as error:
            return None, {
                "code": "wine_dosdevice_c_mapping_invalid",
                "error": str(error),
                "mapping": str(c_mapping),
            }

    install_preexisted = install_mapping.exists() or install_mapping.is_symlink()
    if (
        restoration_snapshot is not None
        and install_preexisted
        and letter.lower() not in initial_manifest_by_name
    ):
        return None, {
            "code": "wine_dosdevice_install_mapping_appeared_during_initialization",
            "mapping": str(install_mapping),
        }
    if install_preexisted:
        try:
            if not install_mapping.is_symlink() or install_mapping.resolve(strict=True) != install_root:
                return None, {
                    "code": "wine_dosdevice_install_mapping_failed",
                    "error": "declared install drive maps to a different host root",
                    "mapping": str(install_mapping),
                }
        except (OSError, RuntimeError) as error:
            return None, {
                "code": "wine_dosdevice_install_mapping_failed",
                "error": str(error),
                "mapping": str(install_mapping),
            }

    protected_names = {"c:", letter.lower()}
    for name, expected in initial_manifest_by_name.items():
        if name in protected_names:
            continue
        if acquired_manifest_by_name.get(name) != expected:
            return None, {
                "code": "wine_dosdevice_initial_mapping_changed",
                "expected": expected,
                "mapping": acquired_manifest_by_name.get(name),
            }
    initial_c = initial_manifest_by_name.get("c:")
    acquired_c = acquired_manifest_by_name.get("c:")
    if initial_c is not None and acquired_c != initial_c:
        return None, {
            "code": "wine_dosdevice_c_mapping_changed",
            "expected": initial_c,
            "mapping": acquired_c,
        }
    if initial_c is None and acquired_c is not None:
        initial_snapshot.append(dict(acquired_by_name["c:"]))

    quarantined_mappings: dict[str, str] = {}
    discarded_mappings: dict[str, str] = {}
    removed_mappings: dict[str, str] = {}
    quarantine_candidates = [
        entry
        for entry in acquired_snapshot
        if entry["name"].casefold() not in protected_names
    ]
    for entry in quarantine_candidates:
        name = str(entry["name"])
        mapping = dosdevices / name
        if re.fullmatch(r"[a-z]:{1,2}", name.casefold()) is None or not mapping.is_symlink():
            restore_errors = _restore_quarantined_drive_mappings(
                dosdevices,
                removed_mappings,
            )
            return None, {
                "code": "wine_dosdevice_unexpected_mapping",
                "mapping": entry,
                "restoreErrors": restore_errors,
            }
        try:
            raw_target = os.readlink(mapping)
            os.unlink(mapping)
            removed_mappings[name] = raw_target
            expected = initial_manifest_by_name.get(name.casefold())
            observed = acquired_manifest_by_name.get(name.casefold())
            if expected is not None and expected == observed:
                quarantined_mappings[name] = raw_target
            else:
                discarded_mappings[name] = raw_target
        except OSError as error:
            restore_errors = _restore_quarantined_drive_mappings(
                dosdevices,
                removed_mappings,
            )
            return None, {
                "code": "wine_dosdevice_host_mapping_quarantine_failed",
                "error": str(error),
                "mapping": str(mapping),
                "restoreErrors": restore_errors,
            }

    created_identity: tuple[int, int] | None = None
    try:
        if not install_preexisted:
            os.symlink(str(install_root), install_mapping)
            created = os.lstat(install_mapping)
            created_identity = (created.st_dev, created.st_ino)
    except OSError as error:
        restore_errors = _restore_quarantined_drive_mappings(
            dosdevices,
            removed_mappings,
        )
        return None, {
            "code": "wine_dosdevice_install_mapping_failed",
            "error": str(error),
            "mapping": str(install_mapping),
            "restoreErrors": restore_errors,
        }
    lease = DriveLease(
        acquired_snapshot=acquired_snapshot,
        created_install_identity=created_identity,
        discarded_mappings=discarded_mappings,
        dosdevices=dosdevices,
        dosdevices_identity=dosdevices_identity,
        drive_c=drive_c,
        drive_c_identity=drive_c_identity,
        install_mapping=install_mapping,
        install_preexisted=install_preexisted,
        install_root=install_root,
        initial_snapshot=initial_snapshot,
        letter=letter,
        prefix=prefix,
        quarantined_mappings=quarantined_mappings,
    )
    return lease, None


def revalidate_runtime_drive_lease(
    lease: DriveLease,
    *,
    require_c: bool,
) -> dict[str, Any] | None:
    for path, expected in (
        (lease.dosdevices, lease.dosdevices_identity),
        (lease.drive_c, lease.drive_c_identity),
    ):
        invalid = _revalidate_directory_identity(path, expected)
        if invalid is not None:
            return invalid
    dosdevices = lease.dosdevices
    for mapping_group, changed_code in (
        (
            lease.quarantined_mappings,
            "wine_dosdevice_quarantined_mapping_changed",
        ),
        (
            lease.discarded_mappings,
            "wine_dosdevice_ephemeral_mapping_changed",
        ),
    ):
        for name, expected_target in mapping_group.items():
            mapping = dosdevices / name
            if not (mapping.exists() or mapping.is_symlink()):
                continue
            try:
                if not mapping.is_symlink() or os.readlink(mapping) != expected_target:
                    return {
                        "code": changed_code,
                        "mapping": str(mapping),
                    }
                os.unlink(mapping)
            except OSError as error:
                return {
                    "code": "wine_dosdevice_host_mapping_quarantine_failed",
                    "error": str(error),
                    "mapping": str(mapping),
                }
    try:
        if (
            not lease.install_mapping.is_symlink()
            or lease.install_mapping.resolve(strict=True) != lease.install_root
        ):
            return {
                "code": "wine_dosdevice_install_mapping_changed",
                "mapping": str(lease.install_mapping),
            }
    except (OSError, RuntimeError) as error:
        return {
            "code": "wine_dosdevice_install_mapping_changed",
            "error": str(error),
            "mapping": str(lease.install_mapping),
        }
    c_mapping = lease.prefix / "dosdevices" / "c:"
    if require_c or c_mapping.exists() or c_mapping.is_symlink():
        try:
            expected_c = (lease.prefix / "drive_c").resolve(strict=True)
            if not c_mapping.is_symlink() or c_mapping.resolve(strict=True) != expected_c:
                return {
                    "code": "wine_dosdevice_c_mapping_invalid",
                    "mapping": str(c_mapping),
                }
        except (OSError, RuntimeError) as error:
            return {
                "code": "wine_dosdevice_c_mapping_invalid",
                "error": str(error),
                "mapping": str(c_mapping),
            }
    allowed_names = {"c:", lease.letter.lower()}
    try:
        unexpected = [
            entry
            for entry in inspect_dosdevices(lease.prefix)
            if entry["name"].lower() not in allowed_names
        ]
    except OSError as error:
        return {
            "code": "wine_dosdevice_snapshot_failed",
            "error": str(error),
            "path": str(dosdevices),
        }
    if unexpected:
        return {
            "code": "wine_dosdevice_unexpected_mapping",
            "mappings": unexpected,
        }
    return None


def release_runtime_drive_lease(lease: DriveLease) -> dict[str, Any]:
    result: dict[str, Any] = {"released": False, "state": "release-failed"}
    errors: list[str] = []
    for path, expected in (
        (lease.dosdevices, lease.dosdevices_identity),
        (lease.drive_c, lease.drive_c_identity),
    ):
        invalid = _revalidate_directory_identity(path, expected)
        if invalid is not None:
            result["errors"] = [invalid]
            result["postSnapshot"] = []
            return result
    if lease.created_install_identity is not None:
        try:
            current = os.lstat(lease.install_mapping)
            if (current.st_dev, current.st_ino) != lease.created_install_identity:
                errors.append("install mapping inode changed; foreign mapping preserved")
            else:
                os.unlink(lease.install_mapping)
        except OSError as error:
            errors.append(str(error))
    for name, expected_target in lease.discarded_mappings.items():
        mapping = lease.dosdevices / name
        if not (mapping.exists() or mapping.is_symlink()):
            continue
        try:
            if not mapping.is_symlink() or os.readlink(mapping) != expected_target:
                errors.append(
                    f"{name!r}: ephemeral mapping changed; foreign mapping preserved"
                )
            else:
                os.unlink(mapping)
        except OSError as error:
            errors.append(f"{name!r}: {error}")
    errors.extend(
        _restore_quarantined_drive_mappings(
            lease.prefix / "dosdevices",
            lease.quarantined_mappings,
        )
    )
    try:
        post_snapshot = inspect_dosdevices(lease.prefix)
        result["postSnapshot"] = post_snapshot
    except OSError as error:
        errors.append(str(error))
        result["postSnapshot"] = []
        post_snapshot = []
    expected_manifest = _drive_snapshot_manifest(lease.initial_snapshot)
    observed_manifest = _drive_snapshot_manifest(post_snapshot)
    snapshot_matches = observed_manifest == expected_manifest
    result["snapshotMatchesInitial"] = snapshot_matches
    if not snapshot_matches:
        result["snapshotMismatch"] = {
            "expected": expected_manifest,
            "observed": observed_manifest,
        }
        errors.append("dosdevices snapshot differs from the execution baseline")
    if errors:
        result["errors"] = errors
        return result
    result["released"] = True
    result["state"] = "released"
    return result


def _release_runtime_drive_lease_safely(lease: DriveLease) -> dict[str, Any]:
    try:
        return release_runtime_drive_lease(lease)
    except BaseException as error:
        return {
            "error": {
                "message": str(error),
                "type": type(error).__name__,
            },
            "postSnapshot": [],
            "released": False,
            "state": "release-failed",
        }


def _validate_prefix_architecture(
    prefix: Path,
    blockers: list[Blocker],
    files: list[VerifiedFile],
    *,
    execute: bool,
    initialize_prefix: bool,
    prefix_mode: str,
) -> dict[str, Any]:
    try:
        architecture = inspect_prefix_architecture(prefix, prefix_mode=prefix_mode)
    except OSError as error:
        blockers.append(
            Blocker(
                "wineprefix_architecture_unreadable",
                str(error),
                str(prefix / "system.reg"),
            )
        )
        return {
            "detectedArch": None,
            "expectedArch": PREFIX_MODE_SYSTEM_ARCHITECTURES.get(prefix_mode),
            "initializationPlanned": initialize_prefix,
            "prefixMode": prefix_mode,
            "state": "invalid",
            "systemReg": str(prefix / "system.reg"),
            "systemRegSha256": None,
        }
    architecture["initializationPlanned"] = initialize_prefix
    system_reg = Path(architecture["systemReg"])
    system_reg_sha = architecture.get("systemRegSha256")
    if system_reg_sha is not None and system_reg.is_file():
        files.append(
            VerifiedFile(
                role="wineprefix-system-reg",
                path=str(system_reg),
                sha256=system_reg_sha,
                size=system_reg.stat().st_size,
            )
        )
    if architecture["state"] == "invalid":
        architecture["initializationRequired"] = False
        layout = architecture.get("layout")
        blockers.append(
            Blocker(
                "wineprefix_layout_invalid",
                str(
                    layout.get("error", "unsafe prefix layout")
                    if isinstance(layout, dict)
                    else architecture.get(
                        "systemRegError",
                        "unsafe prefix architecture metadata",
                    )
                ),
                str(prefix),
            )
        )
        return architecture
    if architecture["state"] == "uninitialized":
        architecture["initializationRequired"] = True
        if execute and not initialize_prefix:
            blockers.append(
                Blocker(
                    "wineprefix_uninitialized_requires_init",
                    "an uninitialized prefix requires --initialize-prefix before execution",
                    str(prefix),
                )
            )
        return architecture
    detected = architecture.get("detectedArch")
    expected = PREFIX_MODE_SYSTEM_ARCHITECTURES.get(prefix_mode)
    if detected != expected:
        if prefix_mode == "win32" and detected == "win64":
            code = "wineprefix_win64_forbidden"
            detail = (
                "existing Wine prefix is win64; select --prefix-mode wow64 "
                "only for a verified WoW64 Wine runtime"
            )
        else:
            code = "wineprefix_architecture_mismatch"
            detail = (
                f"prefix mode {prefix_mode!r} requires exactly one #arch={expected} "
                "header in the first 64 system.reg lines"
            )
        blockers.append(
            Blocker(
                code,
                detail,
                str(system_reg),
            )
        )
    if architecture["state"] == "incomplete":
        architecture["initializationRequired"] = True
        if execute and not initialize_prefix:
            blockers.append(
                Blocker(
                    "wineprefix_incomplete_requires_init",
                    "an incomplete prefix requires --initialize-prefix before execution",
                    str(prefix),
                )
            )
        return architecture
    architecture["initializationRequired"] = False
    return architecture


def _verify_sentinels(
    client_path: Path,
    raw_sentinels: Any,
    blockers: list[Blocker],
) -> list[dict[str, Any]]:
    if not isinstance(raw_sentinels, list) or not raw_sentinels:
        blockers.append(Blocker("lineage_sentinels_missing", "working.sentinels must be a non-empty array"))
        return []
    try:
        client_bytes = client_path.read_bytes()
    except OSError as error:
        blockers.append(Blocker("client_unreadable", str(error), str(client_path)))
        return []
    checked: list[dict[str, Any]] = []
    for index, entry in enumerate(raw_sentinels):
        if not isinstance(entry, dict):
            blockers.append(Blocker("lineage_sentinel_invalid", f"sentinel #{index} must be an object"))
            continue
        try:
            offset = _parse_integer(entry.get("offset"), f"sentinel #{index} offset")
            raw_hex = entry.get("hex")
            if not isinstance(raw_hex, str) or len(raw_hex) == 0 or len(raw_hex) % 2:
                raise ValueError("hex must contain a non-empty even number of characters")
            expected = bytes.fromhex(raw_hex)
        except (ValueError, TypeError) as error:
            blockers.append(Blocker("lineage_sentinel_invalid", f"sentinel #{index}: {error}"))
            continue
        if offset < 0 or offset + len(expected) > len(client_bytes):
            blockers.append(Blocker("lineage_sentinel_out_of_range", f"sentinel #{index} exceeds file bounds"))
            continue
        actual = client_bytes[offset : offset + len(expected)]
        matched = actual == expected
        checked.append(
            {
                "actualHex": actual.hex(),
                "expectedHex": expected.hex(),
                "matched": matched,
                "offset": offset,
            }
        )
        if not matched:
            blockers.append(
                Blocker(
                    "client_sentinel_mismatch",
                    f"offset 0x{offset:x}: expected {expected.hex()}, found {actual.hex()}",
                    str(client_path),
                )
            )
    return checked


def _validate_lineage_destination_uniqueness(
    destinations: Sequence[tuple[str, Path]],
    blockers: list[Blocker],
) -> None:
    for left_index, (left_role, left_path) in enumerate(destinations):
        for right_role, right_path in destinations[left_index + 1 :]:
            if left_path == right_path:
                blockers.append(
                    Blocker(
                        "lineage_artifact_destination_reused",
                        f"{left_role} and {right_role} use the same path",
                        str(left_path),
                    )
                )
                continue
            if not left_path.is_file() or not right_path.is_file():
                continue
            try:
                aliases = os.path.samefile(left_path, right_path)
            except OSError as error:
                blockers.append(
                    Blocker(
                        "lineage_artifact_samefile_check_failed",
                        f"{left_role} vs {right_role}: {error}",
                    )
                )
                continue
            if aliases:
                blockers.append(
                    Blocker(
                        "lineage_artifact_inode_reused",
                        f"{left_role} and {right_role} resolve to the same inode",
                        f"{left_path} | {right_path}",
                    )
                )


def validate_lineage(
    manifest_path: Path,
    client_path: Path,
    blockers: list[Blocker],
    files: list[VerifiedFile],
) -> dict[str, Any]:
    result: dict[str, Any] = {
        "complete": False,
        "manifest": str(manifest_path),
        "sentinels": [],
    }
    manifest = _load_json(manifest_path, "lineage_manifest", blockers)
    if manifest is None:
        return result
    manifest_sha = _sha256_file(manifest_path)
    files.append(
        VerifiedFile(
            role="lineage-manifest",
            path=str(manifest_path),
            sha256=manifest_sha,
            size=manifest_path.stat().st_size,
        )
    )
    result["manifestSha256"] = manifest_sha
    if manifest.get("schemaVersion") != 1:
        blockers.append(
            Blocker(
                "lineage_schema_unsupported",
                "schemaVersion must equal 1",
                str(manifest_path),
            )
        )
    if manifest.get("project") != PROJECT_ID:
        blockers.append(
            Blocker(
                "lineage_project_mismatch",
                f"project must equal {PROJECT_ID}",
                str(manifest_path),
            )
        )
    if manifest.get("sentinel") != LINEAGE_SENTINEL:
        blockers.append(
            Blocker(
                "lineage_manifest_sentinel_mismatch",
                f"sentinel must equal {LINEAGE_SENTINEL}",
                str(manifest_path),
            )
        )
    if manifest.get("lineageStatus") != "complete":
        blockers.append(
            Blocker(
                "lineage_incomplete",
                "lineageStatus must equal complete",
                str(manifest_path),
            )
        )

    canonical = manifest.get("canonical")
    working = manifest.get("working")
    if not isinstance(canonical, dict) or not isinstance(working, dict):
        blockers.append(
            Blocker(
                "lineage_endpoints_missing",
                "canonical and working objects are required",
                str(manifest_path),
            )
        )
        return result
    canonical_path = _resolve_manifest_path(manifest_path, canonical.get("path"))
    working_path = _resolve_manifest_path(manifest_path, working.get("path"))
    if canonical_path is None or working_path is None:
        blockers.append(
            Blocker(
                "lineage_endpoint_path_invalid",
                "canonical.path and working.path are required",
                str(manifest_path),
            )
        )
        return result
    result["canonicalPath"] = str(canonical_path)
    result["workingPath"] = str(working_path)
    if working_path != client_path:
        blockers.append(
            Blocker(
                "client_path_lineage_mismatch",
                f"CLIENT_EXE resolves to {client_path}, manifest working.path resolves to {working_path}",
                str(client_path),
            )
        )
    if canonical_path == working_path:
        blockers.append(
            Blocker(
                "canonical_in_place_forbidden",
                "canonical and working paths must differ",
                str(client_path),
            )
        )
    elif canonical_path.exists() and working_path.exists():
        try:
            if os.path.samefile(canonical_path, working_path):
                blockers.append(
                    Blocker(
                        "canonical_hardlink_forbidden",
                        "canonical and working files must not be hardlinks",
                        str(client_path),
                    )
                )
        except OSError as error:
            blockers.append(Blocker("lineage_samefile_check_failed", str(error), str(client_path)))

    canonical_sha = _record_file(
        files,
        "canonical-client",
        canonical_path,
        canonical.get("sha256"),
        blockers,
    )
    working_sha = _record_file(
        files,
        "working-client",
        working_path,
        working.get("sha256"),
        blockers,
    )
    result["canonicalSha256"] = canonical_sha
    result["workingSha256"] = working_sha
    if canonical.get("readOnly") is not True:
        blockers.append(
            Blocker(
                "canonical_readonly_contract_missing",
                "canonical.readOnly must be true",
                str(canonical_path),
            )
        )
    write_bits = stat.S_IWUSR | stat.S_IWGRP | stat.S_IWOTH
    if canonical_path.is_file() and canonical_path.stat().st_mode & write_bits:
        blockers.append(
            Blocker(
                "canonical_is_writable",
                "canonical client must have no write permission bits",
                str(canonical_path),
            )
        )
    if working.get("workingCopy") is not True:
        blockers.append(
            Blocker(
                "working_copy_contract_missing",
                "working.workingCopy must be true",
                str(working_path),
            )
        )

    if working_path.is_file():
        try:
            pe = inspect_pe(working_path)
            expected_timestamp = _parse_integer(working.get("peTimestamp"), "working.peTimestamp")
            expected_image_base = _parse_integer(working.get("imageBase"), "working.imageBase")
            result["pe"] = pe
            if pe["timestamp"] != expected_timestamp:
                blockers.append(
                    Blocker(
                        "client_pe_timestamp_mismatch",
                        f"expected 0x{expected_timestamp:08x}, found 0x{pe['timestamp']:08x}",
                        str(working_path),
                    )
                )
            if pe["imageBase"] != expected_image_base:
                blockers.append(
                    Blocker(
                        "client_image_base_mismatch",
                        f"expected 0x{expected_image_base:x}, found 0x{pe['imageBase']:x}",
                        str(working_path),
                    )
                )
        except (OSError, ValueError, struct.error) as error:
            blockers.append(Blocker("client_pe_invalid", str(error), str(working_path)))
        result["sentinels"] = _verify_sentinels(
            working_path,
            working.get("sentinels"),
            blockers,
        )

    stages = manifest.get("stages")
    if not isinstance(stages, list) or not stages:
        blockers.append(
            Blocker(
                "lineage_stages_missing",
                "at least one lineage stage is required",
                str(manifest_path),
            )
        )
        return result
    stage_ids: set[str] = set()
    previous_sha = _normalise_sha256(canonical.get("sha256"))
    protected_paths = {canonical_path, working_path}
    destinations: list[tuple[str, Path]] = [
        ("canonical", canonical_path),
        ("working", working_path),
    ]
    backup_paths: set[Path] = set()
    rollback_paths: set[Path] = set()
    stage_receipts: list[dict[str, Any]] = []
    for index, stage in enumerate(stages):
        if not isinstance(stage, dict):
            blockers.append(Blocker("lineage_stage_invalid", f"stage #{index} must be an object"))
            continue
        stage_id = stage.get("id")
        if not isinstance(stage_id, str) or not stage_id.strip() or stage_id in stage_ids:
            blockers.append(
                Blocker(
                    "lineage_stage_id_invalid",
                    f"stage #{index} id must be unique and non-empty",
                )
            )
            stage_id = f"invalid-{index}"
        stage_ids.add(stage_id)
        input_sha = _normalise_sha256(stage.get("inputSha256"))
        output_sha = _normalise_sha256(stage.get("outputSha256"))
        if input_sha is None or output_sha is None:
            blockers.append(
                Blocker(
                    "lineage_stage_hash_invalid",
                    f"stage {stage_id} hashes must be SHA-256",
                )
            )
        if previous_sha is not None and input_sha != previous_sha:
            blockers.append(
                Blocker(
                    "lineage_stage_chain_broken",
                    f"stage {stage_id} input does not match prior output",
                )
            )
        previous_sha = output_sha

        receipt = stage.get("receipt")
        backup = stage.get("backup")
        rollback = stage.get("rollback")
        if not isinstance(receipt, dict) or not isinstance(backup, dict) or not isinstance(rollback, dict):
            blockers.append(
                Blocker(
                    "lineage_stage_artifacts_missing",
                    f"stage {stage_id} requires receipt, backup, and rollback objects",
                )
            )
            continue
        receipt_path = _resolve_manifest_path(manifest_path, receipt.get("path"))
        backup_path = _resolve_manifest_path(manifest_path, backup.get("path"))
        rollback_path = _resolve_manifest_path(manifest_path, rollback.get("path"))
        if receipt_path is None or backup_path is None or rollback_path is None:
            blockers.append(
                Blocker(
                    "lineage_stage_artifact_path_invalid",
                    f"stage {stage_id} artifact paths are required",
                )
            )
            continue
        _record_file(
            files,
            f"lineage-stage-{stage_id}-receipt",
            receipt_path,
            receipt.get("sha256"),
            blockers,
        )
        backup_sha = _record_file(
            files,
            f"lineage-stage-{stage_id}-backup",
            backup_path,
            backup.get("sha256"),
            blockers,
        )
        rollback_sha = _record_file(
            files,
            f"lineage-stage-{stage_id}-rollback",
            rollback_path,
            rollback.get("sha256"),
            blockers,
        )
        destinations.extend(
            (
                (f"stage:{stage_id}:backup", backup_path),
                (f"stage:{stage_id}:rollback", rollback_path),
            )
        )
        for role, artifact_path, seen in (
            ("backup", backup_path, backup_paths),
            ("rollback", rollback_path, rollback_paths),
        ):
            destination_reused = (
                artifact_path in protected_paths
                or artifact_path in backup_paths
                or artifact_path in rollback_paths
            )
            if destination_reused:
                blockers.append(
                    Blocker(
                        "lineage_artifact_destination_reused",
                        (
                            f"stage {stage_id} {role} path must be distinct from "
                            "canonical, working, backup, and rollback paths"
                        ),
                        str(artifact_path),
                    )
                )
            seen.add(artifact_path)
        if input_sha is not None and backup_sha is not None and backup_sha != input_sha:
            blockers.append(
                Blocker(
                    "lineage_backup_not_input",
                    f"stage {stage_id} backup must hash to the stage input",
                    str(backup_path),
                )
            )
        if input_sha is not None and rollback_sha is not None and rollback_sha != input_sha:
            blockers.append(
                Blocker(
                    "lineage_rollback_not_input",
                    f"stage {stage_id} rollback must hash to the stage input",
                    str(rollback_path),
                )
            )
        stage_receipts.append(
            {
                "backup": str(backup_path),
                "id": stage_id,
                "inputSha256": input_sha,
                "outputSha256": output_sha,
                "receipt": str(receipt_path),
                "rollback": str(rollback_path),
            }
        )
    _validate_lineage_destination_uniqueness(destinations, blockers)
    expected_working_sha = _normalise_sha256(working.get("sha256"))
    if previous_sha != expected_working_sha:
        blockers.append(
            Blocker(
                "lineage_final_hash_mismatch",
                "last stage output must equal working.sha256",
                str(manifest_path),
            )
        )
    result["stages"] = stage_receipts
    lineage_prefixes = ("lineage_", "canonical_", "client_", "working_")
    result["complete"] = not any(
        blocker.code.startswith(lineage_prefixes) for blocker in blockers
    )
    return result


def _runtime_support_file_snapshot(
    *,
    layout_path: Path,
    resolved_path: Path,
    role: str,
    provenance: str,
) -> dict[str, Any]:
    return {
        "layoutPath": str(layout_path),
        "path": str(resolved_path),
        "provenance": provenance,
        "role": role,
        "sha256": _sha256_file(resolved_path),
        "size": resolved_path.stat().st_size,
    }


def _data_tree_digest(entries: Sequence[Mapping[str, Any]]) -> str:
    digest = hashlib.sha256()
    for entry in entries:
        digest.update(
            (
                f"{entry['path']}\0{entry['size']}\0{entry['sha256']}\n"
            ).encode("utf-8")
        )
    return digest.hexdigest()


def _capture_data_tree(data_root: Path) -> tuple[list[dict[str, Any]], list[str]]:
    entries: list[dict[str, Any]] = []
    problems: list[str] = []
    if not data_root.is_dir():
        return entries, ["data root is missing or not a directory"]
    for current_raw, directory_names, file_names in os.walk(data_root, followlinks=False):
        current = Path(current_raw)
        directory_names.sort()
        file_names.sort()
        for directory_name in list(directory_names):
            directory = current / directory_name
            try:
                mode = directory.lstat().st_mode
            except OSError as error:
                problems.append(f"{directory.relative_to(data_root).as_posix()}: {error}")
                directory_names.remove(directory_name)
                continue
            if stat.S_ISLNK(mode) or not stat.S_ISDIR(mode):
                problems.append(
                    f"{directory.relative_to(data_root).as_posix()}: non-regular directory"
                )
                directory_names.remove(directory_name)
        for file_name in file_names:
            path = current / file_name
            relative = path.relative_to(data_root).as_posix()
            try:
                file_stat = path.lstat()
                if not stat.S_ISREG(file_stat.st_mode):
                    problems.append(f"{relative}: non-regular file")
                    continue
                entries.append(
                    {
                        "layoutPath": str(path),
                        "path": relative,
                        "resolvedPath": str(path.resolve(strict=True)),
                        "sha256": _sha256_file(path),
                        "size": file_stat.st_size,
                    }
                )
            except (OSError, RuntimeError) as error:
                problems.append(f"{relative}: {error}")
    entries.sort(key=lambda entry: str(entry["path"]))
    return entries, problems


def _validate_data_inventory(
    *,
    runtime_manifest_path: Path,
    raw_inventory: Any,
    data_root: Path,
    run_id: str,
    blockers: list[Blocker],
    files: list[VerifiedFile],
) -> dict[str, Any]:
    result: dict[str, Any] = {
        "entries": [],
        "fileCount": None,
        "manifest": None,
        "root": str(data_root),
        "totalBytes": None,
        "treeSha256": None,
        "verified": False,
    }
    if not isinstance(raw_inventory, dict):
        blockers.append(
            Blocker(
                "runtime_support_data_inventory_invalid",
                "dataInventory must contain path and sha256",
                str(runtime_manifest_path),
            )
        )
        return result
    inventory_layout_path = _manifest_layout_path(
        runtime_manifest_path, raw_inventory.get("path")
    )
    if inventory_layout_path is None:
        blockers.append(
            Blocker(
                "runtime_support_data_inventory_path_invalid",
                "dataInventory.path is required",
                str(runtime_manifest_path),
            )
        )
        return result
    inventory_path = inventory_layout_path.resolve(strict=False)
    result["manifest"] = str(inventory_path)
    inventory_document = _load_json(
        inventory_path, "runtime_support_data_inventory", blockers
    )
    actual_manifest_sha = _record_file(
        files,
        "runtime-support-data-inventory",
        inventory_path,
        raw_inventory.get("sha256"),
        blockers,
    )
    if inventory_document is None or actual_manifest_sha is None:
        return result
    result["manifestSha256"] = actual_manifest_sha
    result["manifestSize"] = inventory_path.stat().st_size
    if inventory_document.get("schemaVersion") != 1:
        blockers.append(
            Blocker(
                "runtime_support_data_inventory_schema_unsupported",
                "data inventory schemaVersion must equal 1",
                str(inventory_path),
            )
        )
    if inventory_document.get("sentinel") != DATA_TREE_SENTINEL:
        blockers.append(
            Blocker(
                "runtime_support_data_inventory_sentinel_mismatch",
                f"data inventory sentinel must equal {DATA_TREE_SENTINEL}",
                str(inventory_path),
            )
        )
    if inventory_document.get("project") != PROJECT_ID:
        blockers.append(
            Blocker(
                "runtime_support_data_inventory_project_mismatch",
                f"data inventory project must equal {PROJECT_ID}",
                str(inventory_path),
            )
        )
    if inventory_document.get("runId") != run_id:
        blockers.append(
            Blocker(
                "runtime_support_data_inventory_run_id_mismatch",
                "data inventory runId must equal the requested run ID",
                str(inventory_path),
            )
        )
    inventory_root = _resolve_manifest_path(inventory_path, inventory_document.get("root"))
    if inventory_root != data_root:
        blockers.append(
            Blocker(
                "runtime_support_data_inventory_root_mismatch",
                f"data inventory root must resolve to {data_root}",
                str(inventory_path),
            )
        )
    provenance = inventory_document.get("provenance")
    if not isinstance(provenance, dict) or any(
        not isinstance(provenance.get(key), str) or not provenance[key].strip()
        for key in ("source", "method")
    ):
        blockers.append(
            Blocker(
                "runtime_support_data_inventory_provenance_invalid",
                "data inventory provenance requires source and method",
                str(inventory_path),
            )
        )
        result["provenance"] = {}
    else:
        result["provenance"] = {
            "method": provenance["method"].strip(),
            "source": provenance["source"].strip(),
        }

    declared_entries = inventory_document.get("files")
    if not isinstance(declared_entries, list):
        blockers.append(
            Blocker(
                "runtime_support_data_inventory_entries_missing",
                "data inventory files must be an array",
                str(inventory_path),
            )
        )
        return result
    normalized_entries: list[dict[str, Any]] = []
    seen_paths: set[str] = set()
    for index, entry in enumerate(declared_entries):
        if not isinstance(entry, dict):
            blockers.append(
                Blocker(
                    "runtime_support_data_inventory_entry_invalid",
                    f"data entry #{index} must be an object",
                    str(inventory_path),
                )
            )
            continue
        raw_relative = entry.get("path")
        relative = PurePosixPath(raw_relative) if isinstance(raw_relative, str) else None
        valid_relative = (
            relative is not None
            and raw_relative == relative.as_posix()
            and not relative.is_absolute()
            and raw_relative not in {"", "."}
            and ".." not in relative.parts
        )
        expected_hash = _normalise_sha256(entry.get("sha256"))
        expected_size = entry.get("size")
        if not valid_relative or raw_relative in seen_paths:
            blockers.append(
                Blocker(
                    "runtime_support_data_inventory_path_invalid",
                    f"data entry #{index} path must be unique normalized relative POSIX",
                    str(inventory_path),
                )
            )
            continue
        seen_paths.add(raw_relative)
        if expected_hash is None or (
            not isinstance(expected_size, int)
            or isinstance(expected_size, bool)
            or expected_size < 0
        ):
            blockers.append(
                Blocker(
                    "runtime_support_data_inventory_entry_invalid",
                    f"data entry {raw_relative!r} requires exact size and SHA-256",
                    str(inventory_path),
                )
            )
            continue
        normalized_entries.append(
            {"path": raw_relative, "sha256": expected_hash, "size": expected_size}
        )
    if normalized_entries != sorted(normalized_entries, key=lambda entry: entry["path"]):
        blockers.append(
            Blocker(
                "runtime_support_data_inventory_not_sorted",
                "data inventory entries must be sorted by relative path",
                str(inventory_path),
            )
        )
    declared_count = inventory_document.get("fileCount")
    declared_total = inventory_document.get("totalBytes")
    declared_tree_sha = _normalise_sha256(inventory_document.get("treeSha256"))
    calculated_declared_tree_sha = _data_tree_digest(normalized_entries)
    if declared_count != EXPECTED_DATA_FILE_COUNT or declared_count != len(normalized_entries):
        blockers.append(
            Blocker(
                "runtime_support_data_inventory_count_mismatch",
                (
                    f"expected complete {EXPECTED_DATA_FILE_COUNT}-file inventory; "
                    f"declared {declared_count}, parsed {len(normalized_entries)}"
                ),
                str(inventory_path),
            )
        )
    calculated_total = sum(entry["size"] for entry in normalized_entries)
    if declared_total != calculated_total:
        blockers.append(
            Blocker(
                "runtime_support_data_inventory_total_bytes_mismatch",
                f"declared {declared_total}, calculated {calculated_total}",
                str(inventory_path),
            )
        )
    if declared_tree_sha is None or declared_tree_sha != calculated_declared_tree_sha:
        blockers.append(
            Blocker(
                "runtime_support_data_inventory_tree_digest_mismatch",
                f"declared {declared_tree_sha}, calculated {calculated_declared_tree_sha}",
                str(inventory_path),
            )
        )

    actual_entries, actual_problems = _capture_data_tree(data_root)
    for problem in actual_problems:
        blockers.append(
            Blocker(
                "runtime_support_data_tree_nonregular_or_unreadable",
                problem,
                str(data_root),
            )
        )
    actual_contract_entries = [
        {"path": entry["path"], "sha256": entry["sha256"], "size": entry["size"]}
        for entry in actual_entries
    ]
    if actual_contract_entries != normalized_entries:
        blockers.append(
            Blocker(
                "runtime_support_data_tree_mismatch",
                "actual data tree has missing, extra, size-changed, or hash-changed files",
                str(data_root),
            )
        )
    actual_total = sum(entry["size"] for entry in actual_entries)
    actual_tree_sha = _data_tree_digest(actual_contract_entries)
    result.update(
        {
            "entries": actual_entries,
            "fileCount": len(actual_entries),
            "totalBytes": actual_total,
            "treeSha256": actual_tree_sha,
        }
    )
    result["verified"] = not any(
        blocker.code.startswith("runtime_support_data_") for blocker in blockers
    )
    return result


def validate_runtime_support_manifest(
    manifest_path: Path,
    client_path: Path,
    run_id: str,
    blockers: list[Blocker],
    files: list[VerifiedFile],
) -> dict[str, Any]:
    """실행 CWD, data anchor, 선택 renderer sidecar를 exact hash로 묶는다."""

    working_directory = client_path.parent
    installed_root = working_directory.parent
    data_root = installed_root / "data"
    result: dict[str, Any] = {
        "dataRoot": str(data_root),
        "files": [],
        "installedRoot": str(installed_root),
        "manifest": str(manifest_path),
        "profile": None,
        "verified": False,
        "workingDirectory": str(working_directory),
    }
    manifest = _load_json(manifest_path, "runtime_support_manifest", blockers)
    if manifest is None:
        return result
    try:
        manifest_sha = _sha256_file(manifest_path)
        manifest_size = manifest_path.stat().st_size
    except OSError as error:
        blockers.append(
            Blocker("runtime_support_manifest_unreadable", str(error), str(manifest_path))
        )
        return result
    files.append(
        VerifiedFile(
            role="runtime-support-manifest",
            path=str(manifest_path),
            sha256=manifest_sha,
            size=manifest_size,
        )
    )
    result["manifestSha256"] = manifest_sha
    result["manifestSize"] = manifest_size

    if manifest.get("schemaVersion") != 1:
        blockers.append(
            Blocker(
                "runtime_support_schema_unsupported",
                "schemaVersion must equal 1",
                str(manifest_path),
            )
        )
    if manifest.get("project") != PROJECT_ID:
        blockers.append(
            Blocker(
                "runtime_support_project_mismatch",
                f"project must equal {PROJECT_ID}",
                str(manifest_path),
            )
        )
    if manifest.get("runId") != run_id:
        blockers.append(
            Blocker(
                "runtime_support_run_id_mismatch",
                "runId must equal the requested isolated run ID",
                str(manifest_path),
            )
        )
    if manifest.get("sentinel") != RUNTIME_SUPPORT_SENTINEL:
        blockers.append(
            Blocker(
                "runtime_support_sentinel_mismatch",
                f"sentinel must equal {RUNTIME_SUPPORT_SENTINEL}",
                str(manifest_path),
            )
        )

    profile = manifest.get("profile")
    result["profile"] = profile if isinstance(profile, str) else None
    requirements = RUNTIME_PROFILE_REQUIREMENTS.get(profile) if isinstance(profile, str) else None
    if requirements is None:
        blockers.append(
            Blocker(
                "runtime_support_profile_unsupported",
                f"profile must be one of {sorted(RUNTIME_PROFILE_REQUIREMENTS)}",
                str(manifest_path),
            )
        )
        requirements = frozenset()

    provenance = manifest.get("provenance")
    if not isinstance(provenance, dict):
        blockers.append(
            Blocker(
                "runtime_support_provenance_invalid",
                "provenance must be an object with non-empty source and method strings",
                str(manifest_path),
            )
        )
        provenance_receipt: dict[str, str] = {}
    else:
        provenance_receipt = {}
        for key in ("source", "method"):
            value = provenance.get(key)
            if not isinstance(value, str) or not value.strip():
                blockers.append(
                    Blocker(
                        "runtime_support_provenance_invalid",
                        f"provenance.{key} must be a non-empty string",
                        str(manifest_path),
                    )
                )
            else:
                provenance_receipt[key] = value.strip()
    result["provenance"] = provenance_receipt

    drive = manifest.get("drive")
    drive_receipt: dict[str, Any] = {
        "hostRoot": str(installed_root),
        "letter": None,
        "windowsInstallRoot": None,
    }
    if not isinstance(drive, dict):
        blockers.append(
            Blocker(
                "runtime_support_drive_invalid",
                "drive must declare letter, hostRoot, and windowsInstallRoot",
                str(manifest_path),
            )
        )
    else:
        raw_letter = drive.get("letter")
        letter = raw_letter.upper() if isinstance(raw_letter, str) else None
        drive_host_root = _resolve_manifest_path(manifest_path, drive.get("hostRoot"))
        windows_install_root = drive.get("windowsInstallRoot")
        if letter is None or re.fullmatch(r"[D-Y]:", letter) is None:
            blockers.append(
                Blocker(
                    "runtime_support_drive_letter_invalid",
                    "drive.letter must be one dedicated letter from D: through Y:",
                    str(manifest_path),
                )
            )
        if drive_host_root != installed_root:
            blockers.append(
                Blocker(
                    "runtime_support_drive_host_root_mismatch",
                    f"drive.hostRoot must resolve to {installed_root}",
                    str(manifest_path),
                )
            )
        expected_windows_root = f"{letter}\\" if letter is not None else None
        if windows_install_root != expected_windows_root:
            blockers.append(
                Blocker(
                    "runtime_support_drive_windows_root_mismatch",
                    f"drive.windowsInstallRoot must equal {expected_windows_root!r}",
                    str(manifest_path),
                )
            )
        drive_receipt = {
            "hostRoot": str(drive_host_root) if drive_host_root else None,
            "letter": letter,
            "windowsInstallRoot": windows_install_root,
        }
    result["drive"] = drive_receipt

    declared_root = _resolve_manifest_path(manifest_path, manifest.get("installedRoot"))
    if declared_root is None or declared_root != installed_root:
        blockers.append(
            Blocker(
                "runtime_support_installed_root_mismatch",
                f"installedRoot must resolve to {installed_root}",
                str(manifest_path),
            )
        )
    client_relative_path = manifest.get("clientRelativePath")
    expected_client_relative = client_path.relative_to(installed_root).as_posix()
    result["clientRelativePath"] = (
        client_relative_path if isinstance(client_relative_path, str) else None
    )
    if client_relative_path != expected_client_relative:
        blockers.append(
            Blocker(
                "runtime_support_client_relative_path_mismatch",
                f"clientRelativePath must equal {expected_client_relative}",
                str(manifest_path),
            )
        )
    relative_parts = Path(expected_client_relative).parts
    supported_client_layout = (
        len(relative_parts) == 2
        and relative_parts[0].casefold() in {"working", "exe"}
        and relative_parts[1].casefold() == "g7mtclient.exe".casefold()
    )
    if not supported_client_layout:
        blockers.append(
            Blocker(
                "runtime_support_client_layout_unsupported",
                (
                    "working client must use the lineage working layout "
                    "<installedRoot>/working/G7MTClient.exe or legacy launcher exe layout"
                ),
                str(client_path),
            )
        )

    result["dataInventory"] = _validate_data_inventory(
        runtime_manifest_path=manifest_path,
        raw_inventory=manifest.get("dataInventory"),
        data_root=data_root,
        run_id=run_id,
        blockers=blockers,
        files=files,
    )

    raw_entries = manifest.get("files")
    if not isinstance(raw_entries, list) or not raw_entries:
        blockers.append(
            Blocker(
                "runtime_support_files_missing",
                "files must be a non-empty array",
                str(manifest_path),
            )
        )
        return result

    entries_by_role: dict[str, list[Mapping[str, Any]]] = {}
    for index, raw_entry in enumerate(raw_entries):
        if not isinstance(raw_entry, dict) or not isinstance(raw_entry.get("role"), str):
            blockers.append(
                Blocker(
                    "runtime_support_file_invalid",
                    f"file #{index} must be an object with a string role",
                    str(manifest_path),
                )
            )
            continue
        role = raw_entry["role"]
        if role not in RUNTIME_SINGLETON_PATHS:
            blockers.append(
                Blocker(
                    "runtime_support_file_role_unsupported",
                    f"unsupported runtime file role {role!r}",
                    str(manifest_path),
                )
            )
            continue
        entries_by_role.setdefault(role, []).append(raw_entry)

    for role in requirements:
        entries = entries_by_role.get(role, [])
        required_count_ok = len(entries) == 1
        if not required_count_ok:
            blockers.append(
                Blocker(
                    "runtime_support_required_role_missing_or_duplicate",
                    f"profile {profile!r} requires {role!r} exactly once",
                    str(manifest_path),
                )
            )
    for role in RUNTIME_SINGLETON_PATHS:
        if len(entries_by_role.get(role, [])) > 1:
            blockers.append(
                Blocker(
                    "runtime_support_required_role_missing_or_duplicate",
                    f"role {role!r} may occur at most once",
                    str(manifest_path),
                )
            )
    dgvoodoo_roles = {"d3d8", "dgvoodoo-config"}
    present_dgvoodoo_roles = {
        role for role in dgvoodoo_roles if entries_by_role.get(role)
    }
    if present_dgvoodoo_roles and present_dgvoodoo_roles != dgvoodoo_roles:
        blockers.append(
            Blocker(
                "runtime_support_dgvoodoo_pair_incomplete",
                "D3D8.dll and dgVoodoo.conf must be declared as an inseparable pair",
                str(manifest_path),
            )
        )

    snapshots: list[dict[str, Any]] = []
    seen_layout_paths: set[Path] = set()
    for role in sorted(entries_by_role):
        for index, entry in enumerate(entries_by_role[role]):
            layout_path = _manifest_layout_path(manifest_path, entry.get("path"))
            if layout_path is None:
                blockers.append(
                    Blocker(
                        "runtime_support_file_path_invalid",
                        f"{role} entry #{index} requires path",
                        str(manifest_path),
                    )
                )
                continue
            if layout_path in seen_layout_paths:
                blockers.append(
                    Blocker(
                        "runtime_support_file_path_duplicate",
                        f"runtime path is declared more than once for role {role}",
                        str(layout_path),
                    )
                )
            seen_layout_paths.add(layout_path)
            resolved_path = layout_path.resolve(strict=False)
            if role in RUNTIME_SINGLETON_PATHS:
                expected_path = working_directory / RUNTIME_SINGLETON_PATHS[role]
                if resolved_path != expected_path.resolve(strict=False):
                    blockers.append(
                        Blocker(
                            "runtime_support_layout_mismatch",
                            f"{role} must resolve to {expected_path}",
                            str(layout_path),
                        )
                    )
            expected_hash = _normalise_sha256(entry.get("sha256"))
            expected_size = entry.get("size")
            file_provenance = entry.get("provenance")
            if expected_hash is None:
                blockers.append(
                    Blocker(
                        "runtime_support_file_invalid_sha256",
                        "sha256 must be 64 lowercase hex",
                        str(layout_path),
                    )
                )
            if (
                not isinstance(expected_size, int)
                or isinstance(expected_size, bool)
                or expected_size < 0
            ):
                blockers.append(
                    Blocker(
                        "runtime_support_file_invalid_size",
                        "size must be a non-negative integer",
                        str(layout_path),
                    )
                )
            if not isinstance(file_provenance, str) or not file_provenance.strip():
                blockers.append(
                    Blocker(
                        "runtime_support_file_provenance_invalid",
                        "each runtime file requires a non-empty provenance string",
                        str(layout_path),
                    )
                )
                file_provenance = "invalid"
            if not resolved_path.is_file():
                blockers.append(
                    Blocker(
                        "runtime_support_file_missing",
                        f"required runtime file for role {role} is missing",
                        str(layout_path),
                    )
                )
                continue
            try:
                snapshot = _runtime_support_file_snapshot(
                    layout_path=layout_path,
                    resolved_path=resolved_path,
                    role=role,
                    provenance=file_provenance.strip(),
                )
            except OSError as error:
                blockers.append(
                    Blocker("runtime_support_file_unreadable", str(error), str(layout_path))
                )
                continue
            files.append(
                VerifiedFile(
                    role=f"runtime-support-{role}",
                    path=str(resolved_path),
                    sha256=snapshot["sha256"],
                    size=snapshot["size"],
                )
            )
            if expected_hash is not None and snapshot["sha256"] != expected_hash:
                blockers.append(
                    Blocker(
                        "runtime_support_file_sha256_mismatch",
                        f"expected {expected_hash}, found {snapshot['sha256']}",
                        str(layout_path),
                    )
                )
            if isinstance(expected_size, int) and snapshot["size"] != expected_size:
                blockers.append(
                    Blocker(
                        "runtime_support_file_size_mismatch",
                        f"expected {expected_size}, found {snapshot['size']}",
                        str(layout_path),
                    )
                )
            snapshots.append(snapshot)

    manifest_layout_path = _manifest_layout_path(manifest_path, str(manifest_path))
    if manifest_layout_path is not None:
        snapshots.append(
            {
                "layoutPath": str(manifest_layout_path),
                "path": str(manifest_path),
                "provenance": "runtime-support-contract",
                "role": "runtime-support-manifest",
                "sha256": manifest_sha,
                "size": manifest_size,
            }
        )
    result["files"] = sorted(
        snapshots,
        key=lambda item: (str(item["role"]), str(item["layoutPath"])),
    )
    result["verified"] = not any(
        blocker.code.startswith("runtime_support_") for blocker in blockers
    )
    return result


def _has_passing_run9_outcome(document: Mapping[str, Any]) -> bool:
    values = [document[key] for key in ("verdict", "status") if key in document]
    return bool(values) and all(
        isinstance(value, str) and value.strip().lower() in RUN9_PASS_OUTCOMES
        for value in values
    )


def validate_run9_index(
    index_path: Path | None,
    mode: str,
    blockers: list[Blocker],
    files: list[VerifiedFile],
) -> dict[str, Any]:
    result: dict[str, Any] = {"index": str(index_path) if index_path else None, "verified": False}
    if index_path is None:
        if mode == "regression":
            blockers.append(Blocker("run9_evidence_required", "regression mode requires a run9 evidence index"))
        return result
    index = _load_json(index_path, "run9_evidence", blockers)
    if index is None:
        return result
    index_sha = _sha256_file(index_path)
    files.append(
        VerifiedFile(
            role="run9-evidence-index",
            path=str(index_path),
            sha256=index_sha,
            size=index_path.stat().st_size,
        )
    )
    result["sha256"] = index_sha
    if index.get("schemaVersion") != 1 or index.get("project") != PROJECT_ID:
        blockers.append(
            Blocker(
                "run9_evidence_contract_mismatch",
                "run9 index schemaVersion/project mismatch",
                str(index_path),
            )
        )
    index_run_id = index.get("runId")
    if not isinstance(index_run_id, str) or not index_run_id.strip():
        blockers.append(
            Blocker(
                "run9_evidence_run_id_invalid",
                "run9 index requires a non-empty runId",
                str(index_path),
            )
        )
        index_run_id = None
    result["runId"] = index_run_id
    if not _has_passing_run9_outcome(index):
        blockers.append(
            Blocker(
                "run9_evidence_outcome_not_pass",
                "run9 index verdict or status must be pass/passed",
                str(index_path),
            )
        )
    artifacts = index.get("artifacts")
    if not isinstance(artifacts, list):
        blockers.append(Blocker("run9_evidence_artifacts_missing", "artifacts must be an array", str(index_path)))
        return result
    by_kind: dict[str, list[Mapping[str, Any]]] = {}
    for artifact in artifacts:
        if not isinstance(artifact, dict) or not isinstance(artifact.get("kind"), str):
            blockers.append(
                Blocker(
                    "run9_evidence_artifact_invalid",
                    "each artifact requires a string kind",
                    str(index_path),
                )
            )
            continue
        by_kind.setdefault(artifact["kind"], []).append(artifact)
    for kind in RUN9_REQUIRED_KINDS:
        entries = by_kind.get(kind, [])
        if len(entries) != 1:
            blockers.append(
                Blocker(
                    "run9_evidence_kind_missing_or_duplicate",
                    f"kind {kind} must occur exactly once",
                    str(index_path),
                )
            )
            continue
        artifact = entries[0]
        artifact_path = _resolve_manifest_path(index_path, artifact.get("path"))
        if artifact_path is None:
            blockers.append(
                Blocker(
                    "run9_evidence_artifact_path_invalid",
                    f"kind {kind} requires a path",
                    str(index_path),
                )
            )
            continue
        _record_file(files, f"run9-{kind}", artifact_path, artifact.get("sha256"), blockers)
        artifact_document = _load_json(
            artifact_path,
            f"run9_{kind}_artifact",
            blockers,
        )
        if artifact_document is None:
            continue
        semantic_errors: list[str] = []
        if artifact_document.get("schemaVersion") != 1:
            semantic_errors.append("schemaVersion must equal 1")
        if artifact_document.get("project") != PROJECT_ID:
            semantic_errors.append(f"project must equal {PROJECT_ID}")
        if artifact_document.get("runId") != index_run_id:
            semantic_errors.append("runId must equal the index runId")
        if artifact_document.get("kind") != kind:
            semantic_errors.append(f"kind must equal {kind}")
        if not _has_passing_run9_outcome(artifact_document):
            semantic_errors.append("verdict or status must be pass/passed")
        if semantic_errors:
            blockers.append(
                Blocker(
                    "run9_artifact_semantic_mismatch",
                    f"{kind}: {'; '.join(semantic_errors)}",
                    str(artifact_path),
                )
            )
    result["requiredKinds"] = list(RUN9_REQUIRED_KINDS)
    result["verified"] = not any(blocker.code.startswith("run9_") for blocker in blockers)
    return result


def _wine_environment(
    prefix: Path,
    *,
    initialize: bool,
    prefix_mode: str = "win32",
) -> dict[str, str]:
    environment = {
        key: os.environ[key]
        for key in WINE_ENV_ALLOWED_HOST_KEYS
        if key in os.environ
    }
    environment["WINEPREFIX"] = str(prefix)
    if initialize:
        environment["WINEARCH"] = PREFIX_MODE_WINEARCH[prefix_mode]
    return environment


def _wine_environment_policy_receipt(prefix_mode: str) -> dict[str, Any]:
    initialization_arch = PREFIX_MODE_WINEARCH.get(prefix_mode)
    return {
        "allowedHostKeys": list(WINE_ENV_ALLOWED_HOST_KEYS),
        "forcedKeys": {"WINEPREFIX": "run-specific absolute prefix"},
        "initOnlyKeys": {"WINEARCH": initialization_arch},
        "prefixMode": prefix_mode,
        "removedExactKeys": list(WINE_ENV_REMOVED_EXACT_KEYS),
        "removedPrefixes": list(WINE_ENV_REMOVED_PREFIXES),
        "strategy": "allowlist",
    }


def _validate_client_arguments(
    client_args: Sequence[str],
    blockers: list[Blocker],
) -> tuple[str, ...]:
    allowed = set(CLIENT_ARG_ALLOWLIST)
    safe_arguments = tuple(
        argument
        for argument in client_args
        if isinstance(argument, str) and argument in allowed
    )
    if len(safe_arguments) != len(client_args):
        blockers.append(
            Blocker(
                "client_arguments_not_allowed",
                (
                    "client arguments are deny-by-default for the current launcher contract; "
                    f"rejected argument count={len(client_args) - len(safe_arguments)}"
                ),
            )
        )
    return safe_arguments


def _wine_install_path(path: Path, installed_root: Path, drive_letter: str) -> str:
    """manifest 전용 drive 안의 Windows-visible path만 생성한다."""

    relative = path.resolve(strict=False).relative_to(installed_root.resolve(strict=True))
    suffix = str(PurePosixPath(relative.as_posix())).replace("/", "\\")
    return f"{drive_letter}\\" + suffix if suffix != "." else f"{drive_letter}\\"


def _decode_registry_output(payload: bytes) -> str:
    if payload.startswith((b"\xff\xfe", b"\xfe\xff")):
        return payload.decode("utf-16", errors="replace")
    for encoding in ("utf-8", "cp932", "utf-16le"):
        try:
            return payload.decode(encoding)
        except UnicodeDecodeError:
            continue
    return payload.decode("utf-8", errors="replace")


def _extract_registry_install_value(payload: bytes) -> str | None:
    text = _decode_registry_output(payload).replace("\x00", "")
    pattern = re.compile(
        rf"^\s*{re.escape(CLIENT_REGISTRY_VALUE)}\s+REG_SZ\s+(.*?)\s*$",
        flags=re.IGNORECASE | re.MULTILINE,
    )
    match = pattern.search(text)
    return match.group(1) if match else None


def _registry_value_sha256(value: str) -> str:
    return _sha256_bytes(value.encode("utf-8"))


def _command_plan(
    wine_bin: WineTool,
    wineboot_bin: WineTool,
    wineserver_bin: WineTool,
    prefix: Path,
    client_exe: Path,
    client_args: Sequence[str],
    *,
    initialize_prefix: bool,
    initialize_first: bool,
    prefix_mode: str,
    client_timeout_seconds: int,
    runtime_support: Mapping[str, Any],
    lineage_snapshot: Sequence[Mapping[str, Any]],
) -> list[dict[str, Any]]:
    expected_prefix_architecture = PREFIX_MODE_SYSTEM_ARCHITECTURES[prefix_mode]
    common_env = {"WINEPREFIX": str(prefix)}
    version_command = {
        "argv": [str(wine_bin.invoked_path), "--version"],
        "cwd": None,
        "environment": common_env,
        "expectedPrefixArchitecture": expected_prefix_architecture,
        "id": "wine-version",
        "timeoutSeconds": 30,
        "toolSnapshot": _wine_tool_snapshot(wine_bin),
    }
    commands: list[dict[str, Any]] = []
    if initialize_prefix:
        initialize_command = {
            "argv": [str(wineboot_bin.invoked_path), "-u"],
            "cwd": None,
            "environment": {
                "WINEARCH": PREFIX_MODE_WINEARCH[prefix_mode],
                "WINEPREFIX": str(prefix),
            },
            "expectedPrefixArchitecture": expected_prefix_architecture,
            "prefixMode": prefix_mode,
            "id": "wineboot-init",
            "timeoutSeconds": 120,
            "toolSnapshot": _wine_tool_snapshot(wineboot_bin),
        }
        if initialize_first:
            commands.extend((initialize_command, version_command))
        else:
            commands.extend((version_command, initialize_command))
    else:
        commands.append(version_command)
    installed_root = Path(str(runtime_support["installedRoot"]))
    drive = runtime_support["drive"]
    drive_letter = str(drive["letter"])
    expected_install = str(drive["windowsInstallRoot"])
    registry_backup = prefix / "drive_c" / REGISTRY_BACKUP_NAME
    registry_backup_windows = f"C:\\{REGISTRY_BACKUP_NAME}"
    registry_restored = prefix / "drive_c" / REGISTRY_RESTORED_NAME
    registry_restored_windows = f"C:\\{REGISTRY_RESTORED_NAME}"
    client_windows_path = _wine_install_path(client_exe, installed_root, drive_letter)
    registry_base = {
        "cwd": None,
        "environment": common_env,
        "expectedInstall": expected_install,
        "registryKey": CLIENT_REGISTRY_KEY,
        "registryValue": CLIENT_REGISTRY_VALUE,
        "timeoutSeconds": 30,
        "toolSnapshot": _wine_tool_snapshot(wine_bin),
    }
    commands.extend(
        (
            {
                **registry_base,
                "allowedReturnCodes": [0, 1],
                "argv": [str(wine_bin.invoked_path), "reg", "query", CLIENT_REGISTRY_KEY],
                "id": "registry-key-query-before",
            },
            {
                **registry_base,
                "allowedReturnCodes": [0, 1],
                "argv": [
                    str(wine_bin.invoked_path),
                    "reg",
                    "query",
                    CLIENT_REGISTRY_KEY,
                    "/v",
                    CLIENT_REGISTRY_VALUE,
                ],
                "id": "registry-install-query-before",
            },
            {
                **registry_base,
                "argv": [
                    str(wine_bin.invoked_path),
                    "reg",
                    "export",
                    CLIENT_REGISTRY_KEY,
                    registry_backup_windows,
                ],
                "backupPath": str(registry_backup),
                "condition": "registry-key-existed-before",
                "id": "registry-export-before",
            },
            {
                **registry_base,
                "argv": [
                    str(wine_bin.invoked_path),
                    "reg",
                    "add",
                    CLIENT_REGISTRY_KEY,
                    "/v",
                    CLIENT_REGISTRY_VALUE,
                    "/t",
                    "REG_SZ",
                    "/d",
                    expected_install,
                    "/f",
                ],
                "id": "registry-install-set",
            },
            {
                **registry_base,
                "argv": [
                    str(wine_bin.invoked_path),
                    "reg",
                    "query",
                    CLIENT_REGISTRY_KEY,
                    "/v",
                    CLIENT_REGISTRY_VALUE,
                ],
                "id": "registry-install-query-active",
            },
        )
    )
    commands.append(
        {
            "argv": [str(wine_bin.invoked_path), client_windows_path, *client_args],
            "cwd": str(client_exe.parent),
            "environment": common_env,
            "id": "client",
            "runtimeSupportSnapshot": [
                *list(runtime_support.get("files", [])),
                *list(lineage_snapshot),
            ],
            "runtimeWorkingDirectory": runtime_support.get("workingDirectory"),
            "runtimeDataInventory": runtime_support.get("dataInventory"),
            "timeoutSeconds": client_timeout_seconds,
            "toolSnapshot": _wine_tool_snapshot(wine_bin),
        }
    )
    restore_base = {**registry_base, "alwaysRun": True}
    commands.extend(
        (
            {
                **restore_base,
                "allowedReturnCodes": [0, 1],
                "argv": [
                    str(wine_bin.invoked_path),
                    "reg",
                    "delete",
                    CLIENT_REGISTRY_KEY,
                    "/f",
                ],
                "condition": "registry-key-was-absent",
                "id": "registry-key-delete-restore",
            },
            {
                **restore_base,
                "allowedReturnCodes": [0, 1],
                "argv": [
                    str(wine_bin.invoked_path),
                    "reg",
                    "delete",
                    CLIENT_REGISTRY_KEY,
                    "/f",
                ],
                "condition": "registry-key-existed-before",
                "id": "registry-key-delete-before-import",
            },
            {
                **restore_base,
                "argv": [
                    str(wine_bin.invoked_path),
                    "reg",
                    "import",
                    registry_backup_windows,
                ],
                "backupPath": str(registry_backup),
                "condition": "registry-key-existed-before",
                "id": "registry-import-restore",
            },
            {
                **restore_base,
                "argv": [
                    str(wine_bin.invoked_path),
                    "reg",
                    "export",
                    CLIENT_REGISTRY_KEY,
                    registry_restored_windows,
                ],
                "backupPath": str(registry_restored),
                "condition": "registry-key-existed-before",
                "id": "registry-export-restored",
            },
            {
                **restore_base,
                "allowedReturnCodes": [0, 1],
                "argv": [str(wine_bin.invoked_path), "reg", "query", CLIENT_REGISTRY_KEY],
                "id": "registry-key-query-restored",
            },
            {
                **restore_base,
                "allowedReturnCodes": [0, 1],
                "argv": [
                    str(wine_bin.invoked_path),
                    "reg",
                    "query",
                    CLIENT_REGISTRY_KEY,
                    "/v",
                    CLIENT_REGISTRY_VALUE,
                ],
                "id": "registry-install-query-restored",
            },
        )
    )
    commands.append(
        {
            "argv": [str(wineserver_bin.invoked_path), "-k"],
            "cwd": None,
            "environment": common_env,
            "id": "wineserver-cleanup",
            "timeoutSeconds": 30,
            "toolSnapshot": _wine_tool_snapshot(wineserver_bin),
        }
    )
    return commands


def _revalidate_command_tool(command: Mapping[str, Any]) -> dict[str, Any] | None:
    snapshot = command.get("toolSnapshot")
    if not isinstance(snapshot, dict):
        return {
            "code": "wine_tool_snapshot_missing",
            "expected": None,
            "mismatches": ["toolSnapshot"],
            "observed": None,
        }
    argv = command.get("argv")
    if not isinstance(argv, list) or not argv:
        return {
            "code": "wine_tool_argv_missing",
            "expected": snapshot,
            "mismatches": ["argv"],
            "observed": None,
        }
    invoked = Path(os.path.abspath(os.path.normpath(str(argv[0]))))
    observed: dict[str, Any] = {
        "executable": False,
        "invokedPath": str(invoked),
        "resolvedPath": None,
        "sha256": None,
        "size": None,
    }
    mismatches: list[str] = []
    if str(invoked) != snapshot.get("invokedPath"):
        mismatches.append("invokedPath")
    try:
        resolved = invoked.resolve(strict=True)
        observed["resolvedPath"] = str(resolved)
        if not resolved.is_file():
            mismatches.append("fileType")
        else:
            observed["executable"] = os.access(resolved, os.X_OK)
            observed["size"] = resolved.stat().st_size
            observed["sha256"] = _sha256_file(resolved)
    except (OSError, RuntimeError) as error:
        observed["error"] = {
            "errno": error.errno if isinstance(error, OSError) else None,
            "message": str(error),
            "type": type(error).__name__,
        }
        mismatches.append("resolution")
    if observed["resolvedPath"] != snapshot.get("resolvedPath"):
        mismatches.append("resolvedPath")
    if observed["sha256"] != snapshot.get("sha256"):
        mismatches.append("sha256")
    if observed["size"] != snapshot.get("size"):
        mismatches.append("size")
    if observed["executable"] is not True:
        mismatches.append("executable")
    if not mismatches:
        return None
    return {
        "code": "wine_tool_changed_after_preflight",
        "expected": snapshot,
        "mismatches": sorted(set(mismatches)),
        "observed": observed,
    }


def _revalidate_runtime_support(command: Mapping[str, Any]) -> dict[str, Any] | None:
    snapshots = command.get("runtimeSupportSnapshot")
    expected_cwd = command.get("runtimeWorkingDirectory")
    observed_cwd = command.get("cwd")
    if not isinstance(snapshots, list) or not snapshots:
        return {
            "code": "runtime_support_snapshot_missing",
            "expected": None,
            "mismatches": ["runtimeSupportSnapshot"],
            "observed": None,
        }
    mismatches: list[str] = []
    observed_files: list[dict[str, Any]] = []
    if observed_cwd != expected_cwd:
        mismatches.append("workingDirectory")
    for index, expected in enumerate(snapshots):
        if not isinstance(expected, dict):
            mismatches.append(f"file[{index}].snapshot")
            continue
        role = str(expected.get("role", f"file-{index}"))
        layout_path = Path(str(expected.get("layoutPath", "")))
        observed: dict[str, Any] = {
            "layoutPath": str(layout_path),
            "path": None,
            "role": role,
            "sha256": None,
            "size": None,
        }
        try:
            resolved = layout_path.resolve(strict=True)
            observed["path"] = str(resolved)
            if resolved.is_file():
                observed["sha256"] = _sha256_file(resolved)
                observed["size"] = resolved.stat().st_size
            else:
                mismatches.append(f"{role}.fileType")
        except (OSError, RuntimeError) as error:
            observed["error"] = {
                "errno": error.errno if isinstance(error, OSError) else None,
                "message": str(error),
                "type": type(error).__name__,
            }
            mismatches.append(f"{role}.resolution")
        for field in ("path", "sha256", "size"):
            if observed[field] != expected.get(field):
                mismatches.append(f"{role}.{field}")
        observed_files.append(observed)
    expected_data = command.get("runtimeDataInventory")
    observed_data: dict[str, Any] | None = None
    if not isinstance(expected_data, dict) or expected_data.get("verified") is not True:
        mismatches.append("dataInventory.snapshot")
    else:
        data_root = Path(str(expected_data.get("root", "")))
        actual_entries, data_problems = _capture_data_tree(data_root)
        actual_contract = [
            {"path": entry["path"], "sha256": entry["sha256"], "size": entry["size"]}
            for entry in actual_entries
        ]
        expected_contract = [
            {"path": entry["path"], "sha256": entry["sha256"], "size": entry["size"]}
            for entry in expected_data.get("entries", [])
            if isinstance(entry, dict)
        ]
        observed_data = {
            "fileCount": len(actual_entries),
            "problems": data_problems,
            "root": str(data_root),
            "totalBytes": sum(entry["size"] for entry in actual_entries),
            "treeSha256": _data_tree_digest(actual_contract),
        }
        if data_problems:
            mismatches.append("dataInventory.nonregularOrUnreadable")
        if actual_contract != expected_contract:
            mismatches.append("dataInventory.entries")
        for field in ("fileCount", "totalBytes", "treeSha256"):
            if observed_data[field] != expected_data.get(field):
                mismatches.append(f"dataInventory.{field}")
        manifest_path = Path(str(expected_data.get("manifest", "")))
        try:
            manifest_sha = _sha256_file(manifest_path)
            manifest_size = manifest_path.stat().st_size
        except OSError:
            manifest_sha = None
            manifest_size = None
        observed_data["manifestSha256"] = manifest_sha
        observed_data["manifestSize"] = manifest_size
        if manifest_sha != expected_data.get("manifestSha256"):
            mismatches.append("dataInventory.manifestSha256")
        if manifest_size != expected_data.get("manifestSize"):
            mismatches.append("dataInventory.manifestSize")
    if not mismatches:
        return None
    return {
        "code": "runtime_support_changed_after_preflight",
        "expected": snapshots,
        "mismatches": sorted(set(mismatches)),
        "observed": {"dataInventory": observed_data, "files": observed_files},
    }


def _registry_command_condition(
    command: Mapping[str, Any],
    registry_state: Mapping[str, Any],
) -> tuple[bool, str | None]:
    condition = command.get("condition")
    mutation_attempted = registry_state.get("mutationAttempted") is True
    key_existed = registry_state.get("keyExistedBefore")
    if command.get("alwaysRun") and not mutation_attempted:
        return False, "registry mutation was not attempted"
    if condition == "registry-key-existed-before":
        return key_existed is True, "registry key did not exist before the transaction"
    if condition == "registry-key-was-absent":
        return key_existed is False, "registry key existed before the transaction"
    if command.get("alwaysRun") and str(command.get("id", "")).startswith("registry-"):
        return mutation_attempted, "registry mutation was not attempted"
    return True, None


def _prefix_mode_from_commands(commands: Sequence[Mapping[str, Any]]) -> str:
    expected_architecture = next(
        (
            command.get("expectedPrefixArchitecture")
            for command in commands
            if command.get("expectedPrefixArchitecture") is not None
        ),
        "win32",
    )
    return "wow64" if expected_architecture == "win64" else "win32"


def _inspect_cleanup_without_drive_lease(
    prefix: Path,
    *,
    prefix_mode: str,
) -> dict[str, Any]:
    try:
        architecture = inspect_prefix_architecture(prefix, prefix_mode=prefix_mode)
    except OSError as error:
        return {
            "error": str(error),
            "state": "failed",
        }
    expected_architecture = PREFIX_MODE_SYSTEM_ARCHITECTURES[prefix_mode]
    cleanup_layout: dict[str, Any] = {
        "dosdevicesEntries": [],
        "dosdevicesPresent": False,
        "driveCPresent": False,
        "safe": True,
    }
    for key, path in (
        ("driveCPresent", prefix / "drive_c"),
        ("dosdevicesPresent", prefix / "dosdevices"),
    ):
        try:
            current = os.lstat(path)
        except FileNotFoundError:
            continue
        except OSError as error:
            cleanup_layout["error"] = str(error)
            cleanup_layout["safe"] = False
            continue
        cleanup_layout[key] = True
        if stat.S_ISLNK(current.st_mode) or not stat.S_ISDIR(current.st_mode):
            cleanup_layout["error"] = f"{path} is not a real prefix directory"
            cleanup_layout["safe"] = False
    if cleanup_layout["dosdevicesPresent"] and cleanup_layout["safe"]:
        try:
            entries = sorted(
                path.name for path in (prefix / "dosdevices").iterdir()
            )
        except OSError as error:
            cleanup_layout["error"] = str(error)
            cleanup_layout["safe"] = False
        else:
            cleanup_layout["dosdevicesEntries"] = entries
            if entries:
                cleanup_layout["safe"] = False
    architecture_safe = architecture.get("state") == "uninitialized" or (
        architecture.get("state") == "incomplete"
        and architecture.get("detectedArch") == expected_architecture
    )
    verified = cleanup_layout["safe"] is True and architecture_safe
    return {
        "cleanupLayout": cleanup_layout,
        "prefixArchitecture": architecture,
        "state": "verified" if verified else "failed",
    }


def _execute_commands_inner(
    commands: Sequence[Mapping[str, Any]],
    prefix: Path,
    drive: Mapping[str, Any],
    drive_guard: dict[str, Any],
) -> tuple[list[dict[str, Any]], dict[str, Any], dict[str, Any]]:
    results: list[dict[str, Any]] = []
    non_cleanup_failed = False
    registry_state: dict[str, Any] = {
        "installExistedBefore": None,
        "installValueBeforeSha256": None,
        "keyExistedBefore": None,
        "mutationAttempted": False,
        "restored": False,
    }
    drive_guard["registryState"] = registry_state
    registry_backup_identity: tuple[int, int] | None = None
    registry_backup_path = prefix / "drive_c" / REGISTRY_BACKUP_NAME
    registry_restored_identity: tuple[int, int] | None = None
    registry_restored_path = prefix / "drive_c" / REGISTRY_RESTORED_NAME
    stale_registry_paths = [
        path
        for path in (registry_backup_path, registry_restored_path)
        if path.exists() or path.is_symlink()
    ]
    if stale_registry_paths:
        blocked = {
            "code": "registry_backup_path_preexists",
            "paths": [str(path) for path in stale_registry_paths],
        }
        return (
            [{"id": "registry-transaction", "launchBlocked": blocked, "returnCode": None}],
            {"state": "not-acquired"},
            {**registry_state, "state": "blocked"},
        )
    try:
        execution_initial_snapshot = inspect_dosdevices(prefix)
    except OSError as error:
        blocked = {
            "code": "wine_dosdevice_snapshot_failed",
            "error": str(error),
            "path": str(prefix / "dosdevices"),
        }
        return (
            [{"id": "runtime-drive-snapshot", "launchBlocked": blocked, "returnCode": None}],
            {"blocked": blocked, "state": "blocked"},
            {**registry_state, "state": "blocked"},
        )
    drive_lease: DriveLease | None = None
    cleanup_prefix_mode = _prefix_mode_from_commands(commands)
    drive_receipt: dict[str, Any] = {"state": "not-acquired"}
    drive_released = False
    for command in commands:
        cleanup_without_lease = False
        command_id = str(command["id"])
        should_run, skip_reason = _registry_command_condition(command, registry_state)
        always_run = command.get("alwaysRun") is True
        if not should_run or (
            non_cleanup_failed and not always_run and command_id != "wineserver-cleanup"
        ):
            results.append(
                {
                    "id": command_id,
                    "reason": skip_reason or "earlier non-cleanup command failed",
                    "skipped": True,
                }
            )
            continue
        if drive_lease is None and command_id != "wineboot-init":
            try:
                drive_lease, drive_blocked = acquire_runtime_drive_lease(
                    prefix,
                    drive,
                    restoration_snapshot=execution_initial_snapshot,
                )
            except Exception as error:
                drive_lease = None
                drive_blocked = {
                    "code": "wine_dosdevice_lease_acquisition_failed",
                    "error": str(error),
                    "type": type(error).__name__,
                }
            if drive_lease is None:
                cleanup_inspection = (
                    _inspect_cleanup_without_drive_lease(
                        prefix,
                        prefix_mode=cleanup_prefix_mode,
                    )
                    if command_id == "wineserver-cleanup"
                    else {"state": "failed"}
                )
                if cleanup_inspection.get("state") == "verified":
                    cleanup_without_lease = True
                    drive_receipt = {
                        "cleanupWithoutLease": cleanup_inspection,
                        "state": "cleanup-only",
                    }
                else:
                    results.append(
                        {
                            "id": "runtime-drive-prepare",
                            "launchBlocked": drive_blocked,
                            "returnCode": None,
                        }
                    )
                    results.append(
                        {
                            "id": command_id,
                            "reason": "runtime drive lease acquisition failed",
                            "skipped": True,
                        }
                    )
                    drive_receipt = {
                        "blocked": drive_blocked,
                        "cleanupWithoutLease": cleanup_inspection,
                        "state": "blocked",
                    }
                    non_cleanup_failed = True
                    continue
            if drive_lease is not None:
                drive_guard["lease"] = drive_lease
                drive_receipt = {
                    "acquiredSnapshot": drive_lease.acquired_snapshot,
                    "discardedMappings": dict(sorted(drive_lease.discarded_mappings.items())),
                    "initialSnapshot": drive_lease.initial_snapshot,
                    "installDrive": drive_lease.letter,
                    "installMapping": str(drive_lease.install_mapping),
                    "installRoot": str(drive_lease.install_root),
                    "quarantinedMappings": dict(sorted(drive_lease.quarantined_mappings.items())),
                    "state": "acquired",
                }
        argv = [str(value) for value in command["argv"]]
        executable = Path(argv[0])
        launch_blocked: dict[str, Any] | None = None
        if not executable.is_absolute():
            launch_blocked = {
                "code": "wine_command_executable_not_absolute",
                "path": str(executable),
            }
        initialize = command_id == "wineboot-init"
        command_prefix_mode = str(command.get("prefixMode", "win32"))
        environment = _wine_environment(
            prefix,
            initialize=initialize,
            prefix_mode=command_prefix_mode,
        )
        if environment.get("WINEPREFIX") != str(prefix):
            launch_blocked = {
                "code": "wineprefix_environment_drift",
                "expected": str(prefix),
                "observed": environment.get("WINEPREFIX"),
            }
        if launch_blocked is None:
            try:
                launch_blocked = _revalidate_command_tool(command)
            except Exception as error:
                launch_blocked = {
                    "code": "wine_tool_revalidation_failed",
                    "error": str(error),
                    "type": type(error).__name__,
                }
        if launch_blocked is None and drive_lease is not None:
            try:
                drive_revalidation = revalidate_runtime_drive_lease(
                    drive_lease,
                    require_c=not initialize and command_id != "wineserver-cleanup",
                )
            except Exception as error:
                drive_revalidation = {
                    "code": "wine_dosdevice_revalidation_failed",
                    "error": str(error),
                    "type": type(error).__name__,
                }
            if command_id == "wineserver-cleanup":
                drive_receipt["cleanupRevalidation"] = (
                    {"state": "verified"}
                    if drive_revalidation is None
                    else {"blocked": drive_revalidation, "state": "failed"}
                )
                if drive_revalidation is not None:
                    launch_blocked = drive_revalidation
                    non_cleanup_failed = True
            else:
                launch_blocked = drive_revalidation
                if command_id == "client":
                    drive_receipt["clientRevalidation"] = (
                        {"state": "verified"}
                        if drive_revalidation is None
                        else {"blocked": drive_revalidation, "state": "failed"}
                    )
        if launch_blocked is None and command_id == "client":
            try:
                launch_blocked = _revalidate_runtime_support(command)
            except Exception as error:
                launch_blocked = {
                    "code": "runtime_support_revalidation_failed",
                    "error": str(error),
                    "type": type(error).__name__,
                }
        if launch_blocked is not None:
            if cleanup_without_lease:
                drive_receipt["state"] = "release-failed"
            results.append(
                {
                    "id": command_id,
                    "launchBlocked": launch_blocked,
                    "returnCode": None,
                    "stderrSha256": _sha256_bytes(b""),
                    "stdoutSha256": _sha256_bytes(b""),
                    "timedOut": False,
                }
            )
            if command_id != "wineserver-cleanup":
                non_cleanup_failed = True
            continue
        if command_id == "registry-install-set":
            registry_state["mutationAttempted"] = True
        try:
            completed = subprocess.run(
                argv,
                cwd=command.get("cwd"),
                env=environment,
                capture_output=True,
                check=False,
                timeout=int(command["timeoutSeconds"]),
            )
            stdout = completed.stdout or b""
            stderr = completed.stderr or b""
            result: dict[str, Any] = {
                "id": command_id,
                "returnCode": completed.returncode,
                "stderrSha256": _sha256_bytes(stderr),
                "stdoutSha256": _sha256_bytes(stdout),
                "timedOut": False,
            }
            if cleanup_without_lease:
                cleanup_after = _inspect_cleanup_without_drive_lease(
                    prefix,
                    prefix_mode=cleanup_prefix_mode,
                )
                cleanup_receipt = drive_receipt["cleanupWithoutLease"]
                cleanup_receipt["postCleanup"] = cleanup_after
                cleanup_verified = cleanup_after.get("state") == "verified"
                cleanup_receipt["state"] = (
                    "verified" if cleanup_verified else "failed"
                )
                drive_receipt["state"] = (
                    "released" if cleanup_verified else "release-failed"
                )
                result["cleanupWithoutLeaseVerified"] = cleanup_verified
                if not cleanup_verified:
                    non_cleanup_failed = True
            allowed_codes = command.get("allowedReturnCodes", [0])
            return_code_allowed = completed.returncode in allowed_codes
            if command_id == "wine-version":
                result["versionText"] = stdout.decode("utf-8", errors="replace").strip()
            if command_id in {"wineboot-init", "wine-version"} and completed.returncode == 0:
                expected_architecture = str(
                    command.get("expectedPrefixArchitecture", "win32")
                )
                inspected_prefix_mode = (
                    "wow64" if expected_architecture == "win64" else "win32"
                )
                try:
                    architecture_after = inspect_prefix_architecture(
                        prefix,
                        prefix_mode=inspected_prefix_mode,
                    )
                except OSError as error:
                    architecture_after = {
                        "detectedArch": None,
                        "error": str(error),
                        "expectedArch": expected_architecture,
                        "prefixMode": inspected_prefix_mode,
                        "state": "invalid",
                        "systemReg": str(prefix / "system.reg"),
                        "systemRegSha256": None,
                    }
                architecture_verified = (
                    architecture_after.get("detectedArch") == expected_architecture
                    and architecture_after.get("state") == "initialized"
                )
                result["architectureAfter"] = architecture_after
                result["architectureVerified"] = architecture_verified
                if not architecture_verified:
                    non_cleanup_failed = True
            if command_id == "registry-key-query-before" and return_code_allowed:
                registry_state["keyExistedBefore"] = completed.returncode == 0
                result["registryState"] = "present" if completed.returncode == 0 else "absent"
            elif command_id == "registry-install-query-before" and return_code_allowed:
                install_existed = completed.returncode == 0
                registry_state["installExistedBefore"] = install_existed
                result["registryState"] = "present" if install_existed else "absent"
                if install_existed:
                    before_value = _extract_registry_install_value(stdout)
                    if before_value is None:
                        result["registryParsed"] = False
                        non_cleanup_failed = True
                    else:
                        registry_state["installValueBefore"] = before_value
                        registry_state["installValueBeforeSha256"] = _registry_value_sha256(before_value)
                        result["registryParsed"] = True
                        result["valueSha256"] = registry_state["installValueBeforeSha256"]
                if install_existed and registry_state.get("keyExistedBefore") is not True:
                    result["registryStateCoherent"] = False
                    non_cleanup_failed = True
            elif command_id == "registry-export-before" and completed.returncode == 0:
                try:
                    backup_stat = registry_backup_path.stat()
                    registry_backup_identity = (backup_stat.st_dev, backup_stat.st_ino)
                    registry_state["backup"] = {
                        "path": str(registry_backup_path),
                        "sha256": _sha256_file(registry_backup_path),
                        "size": backup_stat.st_size,
                    }
                    result["backup"] = registry_state["backup"]
                except OSError as error:
                    result["backupError"] = str(error)
                    non_cleanup_failed = True
            elif command_id == "registry-export-restored" and completed.returncode == 0:
                try:
                    restored_stat = registry_restored_path.stat()
                    registry_restored_identity = (restored_stat.st_dev, restored_stat.st_ino)
                    restored_sha = _sha256_file(registry_restored_path)
                    expected_sha = registry_state.get("backup", {}).get("sha256")
                    exact = restored_sha == expected_sha
                    registry_state["restoredExport"] = {
                        "exactMatch": exact,
                        "path": str(registry_restored_path),
                        "sha256": restored_sha,
                        "size": restored_stat.st_size,
                    }
                    result["restoredExport"] = registry_state["restoredExport"]
                    if not exact:
                        non_cleanup_failed = True
                except OSError as error:
                    result["backupError"] = str(error)
                    non_cleanup_failed = True
            elif command_id == "registry-install-query-active":
                active_value = _extract_registry_install_value(stdout) if completed.returncode == 0 else None
                active_verified = active_value == command.get("expectedInstall")
                result["registryVerified"] = active_verified
                if active_value is not None:
                    result["valueSha256"] = _registry_value_sha256(active_value)
                if not active_verified:
                    non_cleanup_failed = True
            elif command_id == "registry-key-query-restored":
                restored = return_code_allowed and (
                    (completed.returncode == 0) == registry_state.get("keyExistedBefore")
                )
                registry_state["keyRestored"] = restored
                result["registryRestored"] = restored
                if not restored:
                    non_cleanup_failed = True
            elif command_id == "registry-install-query-restored":
                before_existed = registry_state.get("installExistedBefore")
                restored_value = _extract_registry_install_value(stdout) if completed.returncode == 0 else None
                restored = return_code_allowed and (
                    (before_existed is False and completed.returncode == 1)
                    or (
                        before_existed is True
                        and completed.returncode == 0
                        and restored_value == registry_state.get("installValueBefore")
                    )
                )
                registry_state["installRestored"] = restored
                result["registryRestored"] = restored
                if restored_value is not None:
                    result["valueSha256"] = _registry_value_sha256(restored_value)
                if not restored:
                    non_cleanup_failed = True
            results.append(result)
            if not return_code_allowed and command_id != "wineserver-cleanup":
                non_cleanup_failed = True
        except subprocess.TimeoutExpired as error:
            stdout = error.stdout or b""
            stderr = error.stderr or b""
            results.append(
                {
                    "id": command_id,
                    "returnCode": None,
                    "stderrSha256": _sha256_bytes(stderr),
                    "stdoutSha256": _sha256_bytes(stdout),
                    "timedOut": True,
                }
            )
            if command_id != "wineserver-cleanup":
                non_cleanup_failed = True
            if cleanup_without_lease:
                drive_receipt["state"] = "release-failed"
        except OSError as error:
            results.append(
                {
                    "id": command_id,
                    "launchError": {
                        "errno": error.errno,
                        "filename": str(error.filename) if error.filename is not None else None,
                        "message": str(error),
                        "type": type(error).__name__,
                    },
                    "returnCode": None,
                    "stderrSha256": _sha256_bytes(b""),
                    "stdoutSha256": _sha256_bytes(b""),
                    "timedOut": False,
                }
            )
            if command_id != "wineserver-cleanup":
                non_cleanup_failed = True
            if cleanup_without_lease:
                drive_receipt["state"] = "release-failed"
        except Exception as error:
            results.append(
                {
                    "id": command_id,
                    "launchError": {
                        "message": str(error),
                        "type": type(error).__name__,
                    },
                    "returnCode": None,
                    "stderrSha256": _sha256_bytes(b""),
                    "stdoutSha256": _sha256_bytes(b""),
                    "timedOut": False,
                }
            )
            non_cleanup_failed = True
            if cleanup_without_lease:
                drive_receipt["state"] = "release-failed"
    registry_state["restored"] = (
        registry_state.get("mutationAttempted") is True
        and registry_state.get("keyRestored") is True
        and registry_state.get("installRestored") is True
        and (
            registry_state.get("keyExistedBefore") is False
            or registry_state.get("restoredExport", {}).get("exactMatch") is True
        )
    ) or registry_state.get("mutationAttempted") is False
    if registry_backup_identity is not None and (
        registry_state["restored"] or registry_state.get("mutationAttempted") is False
    ):
        try:
            current = os.lstat(registry_backup_path)
            if (current.st_dev, current.st_ino) != registry_backup_identity:
                raise OSError("registry backup inode changed; foreign file preserved")
            os.unlink(registry_backup_path)
            registry_state["backupRemoved"] = True
        except OSError as error:
            registry_state["backupRemoved"] = False
            registry_state["backupCleanupError"] = str(error)
    if registry_restored_identity is not None and registry_state["restored"]:
        try:
            current = os.lstat(registry_restored_path)
            if (current.st_dev, current.st_ino) != registry_restored_identity:
                raise OSError("restored registry export inode changed; foreign file preserved")
            os.unlink(registry_restored_path)
            registry_state["restoredExportRemoved"] = True
        except OSError as error:
            registry_state["restoredExportRemoved"] = False
            registry_state["restoredExportCleanupError"] = str(error)
    if drive_lease is not None and not drive_released:
        drive_guard["releaseAttempted"] = True
        drive_release = _release_runtime_drive_lease_safely(drive_lease)
        drive_receipt["release"] = drive_release
        if drive_release.get("released") is not True:
            non_cleanup_failed = True
    if drive_lease is not None:
        drive_receipt["state"] = (
            "released"
            if drive_receipt.get("release", {}).get("released")
            else "release-failed"
        )
    registry_state["executionFailed"] = non_cleanup_failed
    registry_state["state"] = (
        "restored"
        if registry_state["restored"] and not non_cleanup_failed
        else "restore-failed" if not registry_state["restored"] else "failed"
    )
    return results, drive_receipt, registry_state


def _emergency_restore_registry(
    commands: Sequence[Mapping[str, Any]],
    prefix: Path,
    lease: DriveLease | None,
    registry_state: Mapping[str, Any],
) -> dict[str, Any]:
    result: dict[str, Any] = {
        "attempted": registry_state.get("mutationAttempted") is True,
        "restored": registry_state.get("mutationAttempted") is not True,
        "results": [],
        "state": "not-required",
    }
    if result["attempted"] is not True:
        result["state"] = "restored"
        return result
    if lease is None:
        result["error"] = "runtime drive lease is unavailable"
        result["state"] = "restore-failed"
        return result
    try:
        drive_blocked = revalidate_runtime_drive_lease(lease, require_c=True)
    except Exception as error:
        drive_blocked = {
            "code": "wine_dosdevice_revalidation_failed",
            "error": str(error),
            "type": type(error).__name__,
        }
    if drive_blocked is not None:
        result["blocked"] = drive_blocked
        result["state"] = "restore-failed"
        return result

    key_existed = registry_state.get("keyExistedBefore")
    install_existed = registry_state.get("installExistedBefore")
    if not isinstance(key_existed, bool) or not isinstance(install_existed, bool):
        result["error"] = "pre-mutation registry state is incomplete"
        result["state"] = "restore-failed"
        return result
    command_by_id = {str(command.get("id")): command for command in commands}
    restore_ids = (
        [
            "registry-key-delete-before-import",
            "registry-import-restore",
            "registry-export-restored",
            "registry-key-query-restored",
            "registry-install-query-restored",
        ]
        if key_existed
        else [
            "registry-key-delete-restore",
            "registry-key-query-restored",
            "registry-install-query-restored",
        ]
    )
    completed_by_id: dict[str, subprocess.CompletedProcess[bytes]] = {}
    for command_id in restore_ids:
        try:
            drive_blocked = revalidate_runtime_drive_lease(lease, require_c=True)
        except Exception as error:
            drive_blocked = {
                "code": "wine_dosdevice_revalidation_failed",
                "error": str(error),
                "type": type(error).__name__,
            }
        if drive_blocked is not None:
            result["blocked"] = drive_blocked
            break
        command = command_by_id.get(command_id)
        if command is None:
            result["error"] = f"missing emergency rollback command: {command_id}"
            break
        try:
            tool_blocked = _revalidate_command_tool(command)
        except Exception as error:
            tool_blocked = {
                "code": "wine_tool_revalidation_failed",
                "error": str(error),
                "type": type(error).__name__,
            }
        if tool_blocked is not None:
            result["blocked"] = tool_blocked
            break
        argv = [str(value) for value in command["argv"]]
        try:
            completed = subprocess.run(
                argv,
                cwd=command.get("cwd"),
                env=_wine_environment(prefix, initialize=False),
                capture_output=True,
                check=False,
                timeout=int(command["timeoutSeconds"]),
            )
        except Exception as error:
            result["results"].append(
                {
                    "id": command_id,
                    "launchError": {
                        "message": str(error),
                        "type": type(error).__name__,
                    },
                    "returnCode": None,
                }
            )
            break
        stdout = completed.stdout or b""
        stderr = completed.stderr or b""
        command_result = {
            "id": command_id,
            "returnCode": completed.returncode,
            "stderrSha256": _sha256_bytes(stderr),
            "stdoutSha256": _sha256_bytes(stdout),
        }
        result["results"].append(command_result)
        if completed.returncode not in command.get("allowedReturnCodes", [0]):
            break
        completed_by_id[command_id] = completed

    key_query = completed_by_id.get("registry-key-query-restored")
    install_query = completed_by_id.get("registry-install-query-restored")
    key_restored = key_query is not None and ((key_query.returncode == 0) == key_existed)
    restored_install = (
        _extract_registry_install_value(install_query.stdout or b"")
        if install_query is not None and install_query.returncode == 0
        else None
    )
    install_restored = install_query is not None and (
        (install_existed is False and install_query.returncode == 1)
        or (
            install_existed is True
            and install_query.returncode == 0
            and restored_install == registry_state.get("installValueBefore")
        )
    )
    exact_export = not key_existed
    restored_export_path: Path | None = None
    if key_existed:
        restored_command = command_by_id.get("registry-export-restored")
        backup = registry_state.get("backup")
        if isinstance(restored_command, Mapping):
            raw_path = restored_command.get("backupPath")
            if isinstance(raw_path, str):
                restored_export_path = Path(raw_path)
        if isinstance(backup, Mapping) and restored_export_path is not None:
            try:
                exact_export = (
                    restored_export_path.is_file()
                    and not restored_export_path.is_symlink()
                    and _sha256_file(restored_export_path) == backup.get("sha256")
                )
            except OSError:
                exact_export = False

    restored = key_restored and install_restored and exact_export
    result["keyRestored"] = key_restored
    result["installRestored"] = install_restored
    result["restoredExportExact"] = exact_export
    result["restored"] = restored
    result["state"] = "restored" if restored else "restore-failed"

    backup = registry_state.get("backup")
    cleanup_candidates: list[tuple[Path, str | None]] = []
    if isinstance(backup, Mapping):
        raw_backup_path = backup.get("path")
        if isinstance(raw_backup_path, str):
            cleanup_candidates.append((Path(raw_backup_path), backup.get("sha256")))
    if (
        restored_export_path is not None
        and isinstance(backup, Mapping)
        and "registry-export-restored" in completed_by_id
    ):
        cleanup_candidates.append((restored_export_path, backup.get("sha256")))
    if restored:
        cleanup_errors: list[str] = []
        for path, expected_sha in cleanup_candidates:
            try:
                current = os.lstat(path)
                if stat.S_ISLNK(current.st_mode) or not stat.S_ISREG(current.st_mode):
                    raise OSError("registry rollback artifact is not a regular file")
                if not isinstance(expected_sha, str) or _sha256_file(path) != expected_sha:
                    raise OSError("registry rollback artifact hash changed")
                os.unlink(path)
            except OSError as error:
                cleanup_errors.append(f"{path}: {error}")
        if cleanup_errors:
            result["cleanupErrors"] = cleanup_errors
            result["state"] = "restore-failed"
            result["restored"] = False
    else:
        preserved_artifacts: list[dict[str, Any]] = []
        for path, expected_sha in cleanup_candidates:
            artifact: dict[str, Any] = {
                "expectedSha256": expected_sha,
                "path": str(path),
                "state": "missing",
            }
            try:
                current = os.lstat(path)
                artifact["state"] = (
                    "regular"
                    if stat.S_ISREG(current.st_mode) and not stat.S_ISLNK(current.st_mode)
                    else "unsafe"
                )
                artifact["size"] = current.st_size
                if artifact["state"] == "regular":
                    artifact["sha256"] = _sha256_file(path)
            except OSError as error:
                artifact["error"] = str(error)
            preserved_artifacts.append(artifact)
        result["preservedArtifacts"] = preserved_artifacts
    return result


def _emergency_stop_wineserver(
    commands: Sequence[Mapping[str, Any]],
    prefix: Path,
    lease: DriveLease | None,
) -> dict[str, Any]:
    result: dict[str, Any] = {
        "attempted": False,
        "state": "failed",
    }
    command = next(
        (
            candidate
            for candidate in commands
            if candidate.get("id") == "wineserver-cleanup"
        ),
        None,
    )
    if command is None:
        result["error"] = "wineserver cleanup command is missing"
        return result
    if lease is not None:
        try:
            drive_blocked = revalidate_runtime_drive_lease(lease, require_c=False)
        except BaseException as error:
            drive_blocked = {
                "code": "wine_dosdevice_revalidation_failed",
                "error": str(error),
                "type": type(error).__name__,
            }
        if drive_blocked is not None:
            result["blocked"] = drive_blocked
            return result
    else:
        cleanup_inspection = _inspect_cleanup_without_drive_lease(
            prefix,
            prefix_mode=_prefix_mode_from_commands(commands),
        )
        result["preCleanup"] = cleanup_inspection
        if cleanup_inspection.get("state") != "verified":
            result["blocked"] = {
                "code": "wineprefix_cleanup_without_lease_unsafe",
            }
            return result
    try:
        tool_blocked = _revalidate_command_tool(command)
    except BaseException as error:
        tool_blocked = {
            "code": "wine_tool_revalidation_failed",
            "error": str(error),
            "type": type(error).__name__,
        }
    if tool_blocked is not None:
        result["blocked"] = tool_blocked
        return result

    argv = [str(value) for value in command["argv"]]
    result["attempted"] = True
    try:
        completed = subprocess.run(
            argv,
            cwd=command.get("cwd"),
            env=_wine_environment(prefix, initialize=False),
            capture_output=True,
            check=False,
            timeout=int(command["timeoutSeconds"]),
        )
    except BaseException as error:
        result["launchError"] = {
            "message": str(error),
            "type": type(error).__name__,
        }
        return result
    stdout = completed.stdout or b""
    stderr = completed.stderr or b""
    result.update(
        {
            "returnCode": completed.returncode,
            "stderrSha256": _sha256_bytes(stderr),
            "stdoutSha256": _sha256_bytes(stdout),
        }
    )
    post_blocked: dict[str, Any] | None = None
    if lease is not None:
        try:
            post_blocked = revalidate_runtime_drive_lease(lease, require_c=False)
        except BaseException as error:
            post_blocked = {
                "code": "wine_dosdevice_revalidation_failed",
                "error": str(error),
                "type": type(error).__name__,
            }
    else:
        post_cleanup = _inspect_cleanup_without_drive_lease(
            prefix,
            prefix_mode=_prefix_mode_from_commands(commands),
        )
        result["postCleanup"] = post_cleanup
        if post_cleanup.get("state") != "verified":
            post_blocked = {
                "code": "wineprefix_cleanup_without_lease_changed",
            }
    if post_blocked is not None:
        result["postCleanupBlocked"] = post_blocked
    verified = (
        completed.returncode in command.get("allowedReturnCodes", [0])
        and post_blocked is None
    )
    result["state"] = "verified" if verified else "failed"
    return result


def _execute_commands(
    commands: Sequence[Mapping[str, Any]],
    prefix: Path,
    drive: Mapping[str, Any],
) -> tuple[list[dict[str, Any]], dict[str, Any], dict[str, Any]]:
    drive_guard: dict[str, Any] = {"lease": None, "releaseAttempted": False}
    try:
        return _execute_commands_inner(commands, prefix, drive, drive_guard)
    except BaseException as error:
        lease = drive_guard.get("lease")
        registry_state = drive_guard.get("registryState")
        registry_receipt = (
            dict(registry_state)
            if isinstance(registry_state, dict)
            else {"restored": False}
        )
        try:
            emergency_rollback = _emergency_restore_registry(
                commands,
                prefix,
                lease if isinstance(lease, DriveLease) else None,
                registry_receipt,
            )
        except BaseException as rollback_error:
            emergency_rollback = {
                "attempted": True,
                "error": str(rollback_error),
                "restored": False,
                "state": "restore-failed",
                "type": type(rollback_error).__name__,
            }
        registry_receipt["emergencyRollback"] = emergency_rollback
        registry_receipt["restored"] = emergency_rollback.get("restored") is True
        registry_receipt["executionFailed"] = True
        registry_receipt["state"] = (
            "failed"
            if registry_receipt.get("restored") is True
            else "restore-failed"
        )
        try:
            emergency_wineserver = _emergency_stop_wineserver(
                commands,
                prefix,
                lease if isinstance(lease, DriveLease) else None,
            )
        except BaseException as cleanup_error:
            emergency_wineserver = {
                "attempted": True,
                "error": str(cleanup_error),
                "state": "failed",
                "type": type(cleanup_error).__name__,
            }
        drive_receipt: dict[str, Any] = {
            "emergencyWineserverCleanup": emergency_wineserver,
            "state": "not-acquired",
        }
        if isinstance(lease, DriveLease) and drive_guard.get("releaseAttempted") is not True:
            drive_guard["releaseAttempted"] = True
            release = _release_runtime_drive_lease_safely(lease)
            drive_receipt = {
                "emergencyWineserverCleanup": emergency_wineserver,
                "release": release,
                "state": (
                    "released"
                    if release.get("released") is True
                    and emergency_wineserver.get("state") == "verified"
                    else "release-failed"
                ),
            }
        elif not isinstance(lease, DriveLease):
            drive_receipt["state"] = (
                "released"
                if emergency_wineserver.get("state") == "verified"
                else "release-failed"
            )
        return (
            [
                {
                    "id": "runtime-execution",
                    "launchError": {
                        "message": str(error),
                        "type": type(error).__name__,
                    },
                    "interrupted": isinstance(error, KeyboardInterrupt),
                    "returnCode": None,
                    "stderrSha256": _sha256_bytes(b""),
                    "stdoutSha256": _sha256_bytes(b""),
                    "timedOut": False,
                }
            ],
            drive_receipt,
            registry_receipt,
        )


def _deduplicate_files(files: Iterable[VerifiedFile]) -> list[dict[str, Any]]:
    unique: dict[tuple[str, str], VerifiedFile] = {}
    for item in files:
        unique[(item.role, item.path)] = item
    return [asdict(unique[key]) for key in sorted(unique)]


def _wine_toolchain_receipt(tools: Iterable[WineTool | None]) -> dict[str, Any]:
    present = sorted((tool for tool in tools if tool is not None), key=lambda tool: tool.role)
    return {tool.role: _wine_tool_snapshot(tool) for tool in present}


def _sorted_blockers(blockers: Iterable[Blocker]) -> list[dict[str, Any]]:
    return [
        {key: value for key, value in asdict(blocker).items() if value is not None}
        for blocker in sorted(blockers, key=lambda item: (item.code, item.path or "", item.detail))
    ]


def create_preflight_receipt(
    *,
    repo_root: Path,
    wine_bin_raw: str | None = None,
    wineboot_bin_raw: str | None = None,
    wineserver_bin_raw: str | None = None,
    wineprefix_raw: str | None = None,
    run_id: str,
    client_exe: Path,
    lineage_manifest: Path,
    runtime_support_manifest: Path | None = None,
    run9_evidence: Path | None,
    mode: str,
    prefix_mode: str = "win32",
    prepare_prefix: bool = False,
    execute: bool = False,
    initialize_prefix: bool = False,
    client_args: Sequence[str] = (),
    client_timeout_seconds: int = 300,
    home: Path | None = None,
) -> dict[str, Any]:
    if sys.platform not in {"darwin", "linux"}:
        native_windows = sys.platform == "win32"
        return {
            "blockedReasons": _sorted_blockers(
                [
                    Blocker(
                        "wine_adapter_not_applicable_on_native_windows"
                        if native_windows
                        else "wine_adapter_unsupported_host",
                        "native Windows uses the direct client harness; Wine was not started"
                        if native_windows
                        else f"unsupported host platform: {sys.platform}",
                        "tools/logh7_ui_explorer.py" if native_windows else None,
                    )
                ]
            ),
            "commands": [],
            "environment": {
                "hostArchitecture": platform.machine(),
                "hostPlatform": sys.platform,
                "repoRoot": str(repo_root),
                "runtimeMode": "native-windows" if native_windows else "unsupported",
            },
            "execution": [],
            "fullPassEligible": False,
            "mode": mode,
            "overallVerdict": "blocked",
            "preflightOnly": True,
            "runId": run_id,
            "schemaVersion": 1,
            "status": "blocked",
            "verdictCeiling": (
                "native-windows-delegation-required"
                if native_windows
                else "unsupported-host"
            ),
            "wineToolchain": {},
        }
    blockers: list[Blocker] = []
    files: list[VerifiedFile] = []
    if not repo_root.is_absolute():
        blockers.append(Blocker("repo_root_not_absolute", "REPO_ROOT must be absolute", str(repo_root)))
    repo_root = repo_root.resolve(strict=False)
    if not repo_root.is_dir():
        blockers.append(Blocker("repo_root_missing", "REPO_ROOT must be an existing directory", str(repo_root)))
    if not RUN_ID_RE.fullmatch(run_id):
        blockers.append(
            Blocker(
                "run_id_invalid",
                "RUN_ID must be <YYYYMMDD>T<HHMMSS>Z-<4+ safe suffix characters>",
                run_id,
            )
        )
    if mode not in {"regression", "recovery-baseline"}:
        blockers.append(Blocker("mode_invalid", "mode must be regression or recovery-baseline", mode))
    expected_prefix_architecture = PREFIX_MODE_SYSTEM_ARCHITECTURES.get(prefix_mode)
    if expected_prefix_architecture is None:
        blockers.append(
            Blocker(
                "wineprefix_mode_invalid",
                f"prefix_mode must be one of {sorted(PREFIX_MODE_SYSTEM_ARCHITECTURES)}",
                prefix_mode,
            )
        )
    if not client_exe.is_absolute():
        blockers.append(
            Blocker(
                "client_exe_not_absolute",
                "CLIENT_EXE must be absolute",
                str(client_exe),
            )
        )
    client_exe = client_exe.resolve(strict=False)
    if not lineage_manifest.is_absolute():
        blockers.append(
            Blocker(
                "lineage_manifest_not_absolute",
                "LINEAGE_MANIFEST must be absolute",
                str(lineage_manifest),
            )
        )
    lineage_manifest = lineage_manifest.resolve(strict=False)
    if runtime_support_manifest is None:
        blockers.append(
            Blocker(
                "runtime_support_manifest_missing",
                "RUNTIME_SUPPORT_MANIFEST is required in Wine mode",
            )
        )
    else:
        if not runtime_support_manifest.is_absolute():
            blockers.append(
                Blocker(
                    "runtime_support_manifest_not_absolute",
                    "RUNTIME_SUPPORT_MANIFEST must be absolute",
                    str(runtime_support_manifest),
                )
            )
        runtime_support_manifest = runtime_support_manifest.resolve(strict=False)
    if run9_evidence is not None:
        if not run9_evidence.is_absolute():
            blockers.append(
                Blocker(
                    "run9_evidence_not_absolute",
                    "RUN9_EVIDENCE must be absolute",
                    str(run9_evidence),
                )
            )
        run9_evidence = run9_evidence.resolve(strict=False)

    wine_bin = _validate_wine_tool(wine_bin_raw, "wine-bin", blockers, files)
    wineboot_bin = _validate_wine_tool(wineboot_bin_raw, "wineboot-bin", blockers, files)
    wineserver_bin = _validate_wine_tool(wineserver_bin_raw, "wineserver-bin", blockers, files)
    if wine_bin and wineboot_bin and wineserver_bin:
        parents = {
            wine_bin.resolved_path.parent,
            wineboot_bin.resolved_path.parent,
            wineserver_bin.resolved_path.parent,
        }
        if len(parents) != 1:
            blockers.append(
                Blocker(
                    "wine_toolchain_distribution_mismatch",
                    "Wine tools must resolve to the same distribution bin directory",
                )
            )

    prefix, marker = _validate_prefix(
        wineprefix_raw,
        repo_root,
        run_id,
        blockers,
        files,
        prepare=prepare_prefix,
        home=home,
    )
    prefix_architecture: dict[str, Any] = {
        "detectedArch": None,
        "expectedArch": expected_prefix_architecture,
        "initializationPlanned": initialize_prefix,
        "initializationRequired": None,
        "prefixMode": prefix_mode,
        "state": "unverified",
        "systemReg": None,
        "systemRegSha256": None,
    }
    if (
        prefix is not None
        and marker is not None
        and expected_prefix_architecture is not None
    ):
        prefix_architecture = _validate_prefix_architecture(
            prefix,
            blockers,
            files,
            execute=execute,
            initialize_prefix=initialize_prefix,
            prefix_mode=prefix_mode,
        )
    lineage = validate_lineage(lineage_manifest, client_exe, blockers, files)
    runtime_support = (
        validate_runtime_support_manifest(
            runtime_support_manifest,
            client_exe,
            run_id,
            blockers,
            files,
        )
        if runtime_support_manifest is not None
        else {"manifest": None, "verified": False}
    )
    run9 = validate_run9_index(run9_evidence, mode, blockers, files)
    safe_client_args = _validate_client_arguments(client_args, blockers)
    client_arguments_valid = len(safe_client_args) == len(client_args)
    if mode == "recovery-baseline" and not lineage.get("complete"):
        blockers.append(
            Blocker(
                "recovery_baseline_requires_complete_lineage",
                "recovery-baseline is forbidden until lineage is complete",
            )
        )

    command_plan: list[dict[str, Any]] = []
    if (
        marker is not None
        and wine_bin is not None
        and wineboot_bin is not None
        and wineserver_bin is not None
        and prefix is not None
        and expected_prefix_architecture is not None
        and client_arguments_valid
        and runtime_support.get("verified") is True
    ):
        command_plan = _command_plan(
            wine_bin=wine_bin,
            wineboot_bin=wineboot_bin,
            wineserver_bin=wineserver_bin,
            prefix=prefix,
            client_exe=client_exe,
            client_args=safe_client_args,
            initialize_prefix=initialize_prefix,
            initialize_first=(
                initialize_prefix
                and prefix_architecture.get("state") in {"uninitialized", "incomplete"}
            ),
            prefix_mode=prefix_mode,
            client_timeout_seconds=client_timeout_seconds,
            runtime_support=runtime_support,
            lineage_snapshot=[
                {
                    "layoutPath": item.path,
                    "path": item.path,
                    "provenance": "validated-client-lineage",
                    "role": item.role,
                    "sha256": item.sha256,
                    "size": item.size,
                }
                for item in files
                if item.role == "lineage-manifest"
                or item.role in {"canonical-client", "working-client"}
                or item.role.startswith("lineage-stage-")
            ],
        )

    receipt: dict[str, Any] = {
        "blockedReasons": _sorted_blockers(blockers),
        "clientArgumentPolicy": {
            "allowedArguments": list(CLIENT_ARG_ALLOWLIST),
            "strategy": "deny-by-default",
        },
        "clientLineage": lineage,
        "commands": command_plan,
        "environment": {
            "hostArchitecture": platform.machine(),
            "hostPlatform": sys.platform,
            "pythonVersion": platform.python_version(),
            "prefixArchitecture": prefix_architecture,
            "repoRoot": str(repo_root),
            "runtimeMode": "wine",
            "wineEnvironmentPolicy": _wine_environment_policy_receipt(prefix_mode),
            "winePrefix": str(prefix) if prefix else None,
            "winePrefixMarker": str(marker) if marker else None,
        },
        "execution": [],
        "executionLock": {
            "path": str(prefix / EXECUTION_LOCK_NAME) if prefix else None,
            "state": "not-requested" if not execute else "pending",
        },
        "files": _deduplicate_files(files),
        "fullPassEligible": False,
        "mode": mode,
        "overallVerdict": "blocked" if blockers else "not-evaluated",
        "preflightOnly": not execute,
        "run9Baseline": run9,
        "runtimeSupport": runtime_support,
        "driveIsolation": {"state": "not-executed"},
        "registryTransaction": {"state": "not-executed"},
        "runId": run_id,
        "schemaVersion": 1,
        "status": "blocked" if blockers else "ready",
        "verdictCeiling": "recovery-baseline-only" if mode == "recovery-baseline" else "preflight-only",
        "wineToolchain": _wine_toolchain_receipt(
            (wine_bin, wineboot_bin, wineserver_bin)
        ),
    }
    if execute and not blockers:
        assert prefix is not None
        execution_lock, lock_blocker, lock_receipt = acquire_execution_lock(
            prefix,
            repo_root,
            run_id,
        )
        receipt["executionLock"] = lock_receipt
        if execution_lock is None:
            assert lock_blocker is not None
            receipt["blockedReasons"] = _sorted_blockers([lock_blocker])
            receipt["overallVerdict"] = "blocked"
            receipt["status"] = "blocked"
            return receipt
        try:
            current_client_sha = _sha256_file(client_exe)
            if current_client_sha != lineage.get("workingSha256"):
                runtime_blocker = Blocker(
                    "client_changed_after_preflight",
                    f"expected {lineage.get('workingSha256')}, found {current_client_sha}",
                    str(client_exe),
                )
                receipt["blockedReasons"] = _sorted_blockers([runtime_blocker])
                receipt["overallVerdict"] = "blocked"
                receipt["status"] = "blocked"
                return receipt
            try:
                architecture_before_execute = inspect_prefix_architecture(
                    prefix,
                    prefix_mode=prefix_mode,
                )
            except OSError as error:
                runtime_blocker = Blocker(
                    "wineprefix_architecture_unreadable_after_preflight",
                    str(error),
                    str(prefix / "system.reg"),
                )
                receipt["blockedReasons"] = _sorted_blockers([runtime_blocker])
                receipt["overallVerdict"] = "blocked"
                receipt["status"] = "blocked"
                return receipt
            initial_state = prefix_architecture.get("state")
            architecture_drift = (
                initial_state == "initialized"
                and (
                    architecture_before_execute.get("detectedArch")
                    != expected_prefix_architecture
                    or architecture_before_execute.get("state") != "initialized"
                )
            ) or (
                initial_state in {"uninitialized", "incomplete"}
                and architecture_before_execute.get("state") != initial_state
            )
            if architecture_drift:
                runtime_blocker = Blocker(
                    "wineprefix_architecture_changed_after_preflight",
                    "prefix architecture changed after preflight; refusing Wine invocation",
                    str(prefix),
                )
                receipt["blockedReasons"] = _sorted_blockers([runtime_blocker])
                receipt["environment"]["prefixArchitectureBeforeExecute"] = (
                    architecture_before_execute
                )
                receipt["overallVerdict"] = "blocked"
                receipt["status"] = "blocked"
                return receipt
            execution, drive_receipt, registry_receipt = _execute_commands(
                command_plan,
                prefix,
                runtime_support["drive"],
            )
            receipt["execution"] = execution
            receipt["driveIsolation"] = drive_receipt
            receipt["registryTransaction"] = registry_receipt
            failed = (
                drive_receipt.get("state") != "released"
                or registry_receipt.get("state") != "restored"
                or any(
                    item.get("timedOut")
                    or item.get("launchError") is not None
                    or item.get("launchBlocked") is not None
                    or item.get("architectureVerified") is False
                    or (
                        item.get("returnCode") not in (0, None)
                        and not item.get("skipped")
                        and item.get("returnCode")
                        not in next(
                            (
                                command.get("allowedReturnCodes", [0])
                                for command in command_plan
                                if command.get("id") == item.get("id")
                            ),
                            [0],
                        )
                    )
                    for item in execution
                )
            )
            receipt["status"] = "failed" if failed else "executed"
            receipt["overallVerdict"] = "fail" if failed else "not-evaluated"
        finally:
            lock_release = release_execution_lock(execution_lock)
            receipt["executionLock"]["release"] = lock_release
            receipt["executionLock"]["state"] = lock_release["state"]
            if lock_release.get("released") is not True:
                receipt["status"] = "failed"
                receipt["overallVerdict"] = "fail"
    return receipt


def write_receipt(path: Path, receipt: Mapping[str, Any]) -> None:
    path = path.resolve(strict=False)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_bytes(_json_bytes(receipt))
    os.replace(temporary, path)


def receipt_exit_code(receipt: Mapping[str, Any]) -> int:
    return 2 if receipt.get("status") == "blocked" else 1 if receipt.get("status") == "failed" else 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Fail-closed LOGH VII Wine live-QA preflight and launcher",
    )
    parser.add_argument("--repo-root", type=Path, default=REPO_ROOT)
    parser.add_argument("--wine-bin", required=True)
    parser.add_argument("--wineboot-bin", required=True)
    parser.add_argument("--wineserver-bin", required=True)
    parser.add_argument("--wine-prefix", required=True)
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--client-exe", required=True, type=Path)
    parser.add_argument("--lineage-manifest", required=True, type=Path)
    parser.add_argument("--runtime-support-manifest", required=True, type=Path)
    parser.add_argument("--run9-evidence", type=Path)
    parser.add_argument("--mode", choices=("regression", "recovery-baseline"), default="regression")
    parser.add_argument("--prepare-prefix", action="store_true")
    parser.add_argument("--execute", action="store_true")
    parser.add_argument("--initialize-prefix", action="store_true")
    parser.add_argument("--prefix-mode", choices=("win32", "wow64"), default="win32")
    parser.add_argument("--client-arg", action="append", default=[])
    parser.add_argument("--client-timeout-seconds", type=int, default=300)
    parser.add_argument("--receipt", type=Path)
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    if sys.platform not in {"darwin", "linux"}:
        if sys.platform == "win32":
            sys.stderr.write(
                "native Windows에서는 Wine 어댑터를 사용하지 않습니다. "
                "tools/logh7_ui_explorer.py 또는 tools/live/_m3_multiclient_probe.py를 실행하세요.\n"
            )
        else:
            sys.stderr.write(f"지원하지 않는 host platform입니다: {sys.platform}\n")
        return 2
    args = build_parser().parse_args(argv)
    if args.client_timeout_seconds < 1:
        raise SystemExit("--client-timeout-seconds must be positive")
    receipt = create_preflight_receipt(
        repo_root=args.repo_root,
        wine_bin_raw=args.wine_bin,
        wineboot_bin_raw=args.wineboot_bin,
        wineserver_bin_raw=args.wineserver_bin,
        wineprefix_raw=args.wine_prefix,
        run_id=args.run_id,
        client_exe=args.client_exe,
        lineage_manifest=args.lineage_manifest,
        runtime_support_manifest=args.runtime_support_manifest,
        run9_evidence=args.run9_evidence,
        mode=args.mode,
        prefix_mode=args.prefix_mode,
        prepare_prefix=args.prepare_prefix,
        execute=args.execute,
        initialize_prefix=args.initialize_prefix,
        client_args=args.client_arg,
        client_timeout_seconds=args.client_timeout_seconds,
    )
    receipt_path = args.receipt or (
        args.repo_root
        / "_workspace"
        / PROJECT_ID
        / "runs"
        / args.run_id
        / "p0-wine-preflight-receipt.json"
    )
    write_receipt(receipt_path, receipt)
    sys.stdout.buffer.write(_json_bytes(receipt))
    return receipt_exit_code(receipt)


if __name__ == "__main__":
    raise SystemExit(main())
