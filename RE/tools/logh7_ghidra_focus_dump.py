from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import Final

from tools.logh7_child_codec import _parse_pe_image


JsonValue = str | int | bool | list["JsonValue"] | dict[str, "JsonValue"]
JsonObject = dict[str, JsonValue]

SCRIPT_NAME: Final[str] = "Logh7FocusDump.java"
DEFAULT_PROJECT_NAME: Final[str] = "logh7-focus"
SCRIPT_SOURCE: Final[Path] = Path(__file__).with_name("ghidra_scripts") / SCRIPT_NAME
DEFAULT_PROJECT_DIR: Final[Path] = Path(tempfile.gettempdir()) / "logh7-ghidra-project"
DEFAULT_SCRIPT_DIR: Final[Path] = Path(".omo/ghidra/scripts")


@dataclass(frozen=True, slots=True)
class FocusFunction:
    label: str
    virtual_address: int
    why: str

    @property
    def virtual_address_hex(self) -> str:
        return f"0x{self.virtual_address:08x}"

    def to_json(self) -> JsonObject:
        return {
            "label": self.label,
            "virtualAddressHex": self.virtual_address_hex,
            "why": self.why,
        }


class GhidraHeadlessNotFoundError(RuntimeError):
    pass


FOCUS_FUNCTIONS: Final[tuple[FocusFunction, ...]] = (
    FocusFunction("postKeyMessageInputCall", 0x00612357, "message object input call before lobby handler"),
    FocusFunction("loginProcessorHandleMessage", 0x004AC700, "post-key lobby handler for inner 0x7001/0x7002"),
    FocusFunction("postKeyHandlerLookup", 0x00612343, "handler lookup immediately before message input"),
    FocusFunction("handlerLookupImplementation", 0x00612510, "handler map lookup implementation"),
    FocusFunction("genericMessageInput", 0x00402E30, "vtable 0x0066bfe8 input_from_stream for produced lobby message"),
    FocusFunction("genericPayloadReader", 0x00404610, "helper reached by generic message input before variable payload copy"),
    FocusFunction("streamReadBytes", 0x00610420, "stream byte-copy helper used for remaining message payload"),
    FocusFunction("keySetupWrapper", 0x006140C0, "inner 0x31 key/setup boundary"),
    FocusFunction("sessionSetupConstructor", 0x004AD780, "Claude full handler-map setup constructor"),
    FocusFunction("loginIdLookup", 0x0060FCC0, "FUN_0060fcc0: interprets param_5+4 as ID/table key for 0x7001"),
    FocusFunction("loginProcObjectGet", 0x004AB3E0, "FUN_004ab3e0: object fetched by 0x7001 handler"),
    FocusFunction("loginProc004ac900", 0x004AC900, "FUN_004ac900 used in 0x7001 handler"),
    FocusFunction("loginProc004ac960", 0x004AC960, "FUN_004ac960 used in 0x7001 handler"),
    FocusFunction("loginProc004ac4f0", 0x004AC4F0, "FUN_004ac4f0 callback in 0x7001 handler"),
    FocusFunction("messageDispatchPump", 0x00612270, "post-key recv pump: router->handler-lookup->parse->handle loop"),
    FocusFunction("transportRouter", 0x006130A0, "0x0030 router: inner==0x31 keysetup else store-pending(conn+0x24,flag+0x30)"),
    FocusFunction("handlerMapRegisterCb", 0x00612CB0, "map register/insert path reached via 0x612530"),
    FocusFunction("handlerMapFind612D80", 0x00612D80, "map find path reached via 0x612550"),
    FocusFunction("lobbyParseSystemLookup", 0x00446B10, "lobby name->code lookup (code=0x2000+idx), handler array this+0x34"),
    FocusFunction("ssParseSystemLookup", 0x0044F120, "SS login name->code lookup (code=0x200+idx), handler array this+0x24"),
    # g138: lobby parse-system vtable cluster (@0x0066cd48) + lobby conn setup / msg-system factory
    FocusFunction("lobbyVt_4465f0", 0x004465F0, "lobby parse-system vtable method"),
    FocusFunction("lobbyVt_446760", 0x00446760, "lobby parse-system vtable method"),
    FocusFunction("lobbyVt_446910", 0x00446910, "lobby parse-system vtable method"),
    FocusFunction("lobbyVt_446930", 0x00446930, "lobby parse-system vtable method"),
    FocusFunction("lobbyVt_4469f0", 0x004469F0, "lobby parse-system vtable method"),
    FocusFunction("lobbyVt_446a00", 0x00446A00, "lobby parse-system vtable method"),
    FocusFunction("lobbyVt_446a10", 0x00446A10, "lobby parse-system vtable method"),
    FocusFunction("lobbyVt_446a50", 0x00446A50, "lobby parse-system vtable method"),
    FocusFunction("lobbyVt_446ab0", 0x00446AB0, "lobby parse-system vtable method"),
    FocusFunction("lobbyVt_446be0", 0x00446BE0, "lobby parse-system vtable method"),
    FocusFunction("lobbyVt_4471f0", 0x004471F0, "lobby parse-system vtable method"),
    FocusFunction("lobbyVt_44d9a0", 0x0044D9A0, "lobby parse-system vtable method"),
    FocusFunction("lobbyConnSetup", 0x004AB440, "lobby connection setup reached via redirect FUN_004ab3e0"),
    FocusFunction("msgSystemFactory", 0x00612030, "message-system factory (conn+0x10 handler lookup target)"),
    FocusFunction("callbackReg_4aca80", 0x004ACA80, "redirect callback registration helper"),
    FocusFunction("callbackReg_4accf0", 0x004ACCF0, "redirect callback registration helper"),
    # g140: lobby connection-manager (FUN_004ab440, vtable @0x66df5c) connect/setup path
    FocusFunction("mgrConnect", 0x004AB5F0, "manager vtable[0x14]: connect to redirect IP/port (creates lobby conn + processor)"),
    FocusFunction("mgrSetType1", 0x004AE960, "manager vtable[0x10] called with arg 1 (likely sets conn type=1 = lobby 0x0020 payload)"),
    FocusFunction("mgrVt18", 0x004ABEC0, "manager vtable[0x18] (redirect registers callback here)"),
    FocusFunction("mgrVt1c", 0x004AB4C0, "manager vtable[0x1c]"),
    FocusFunction("mgrCtor0", 0x004AB4D0, "manager vtable[0x0]"),
    FocusFunction("mgrVt04", 0x004AE830, "manager vtable[0x4]"),
    # g145: lobby ParseSystem constructor (vtable @0x66cd18) — registers field34[idx] handlers (idx1=LobbyLoginOK 0x2001)
    FocusFunction("lobbyParseSystemCtor", 0x0043F0C0, "lobby ParseSystem ctor: inits field34 handler array + sub-arrays"),
    FocusFunction("lobbyParseSystemInit", 0x0043F130, "lobby ParseSystem real init: registers field34[idx] message handlers"),
    # g149: LobbyLoginOK (0x2001) deserializer chain — resolve exact body size/format
    FocusFunction("inputLobbyLoginOk", 0x0043F830, "Input_LobbyLoginOK::input_from_stream (field34[1] vtable 0x66cdb4 slot0)"),
    FocusFunction("inputLobbyLoginOkBase", 0x0043F7C0, "LobbyLoginOK base reader (sets debug callback, no stream read)"),
    # g151: LobbyLoginOK handler methods (vtable 0x66cdb4 slots 1 and 3) — what the 2-byte value drives
    FocusFunction("lobbyLoginOkVt1", 0x0043F860, "LobbyLoginOK handler vtable slot1"),
    FocusFunction("lobbyLoginOkVt3", 0x0043F8C0, "LobbyLoginOK handler vtable slot3"),
    # g152: GIN7 keysetup key-derivation chain (why ver1 login blob works but ver4 lobby blob fails)
    FocusFunction("gin7Keysetup", 0x00613AD0, "GIN7 keysetup: derives session cipher key from credential blob"),
    FocusFunction("gin7KeyStore", 0x00614810, "stores derived key (XOR 0x17 obfuscation per earlier RE)"),
)


def write_focus_script(script_dir: Path) -> Path:
    script_dir.mkdir(parents=True, exist_ok=True)
    destination = script_dir / SCRIPT_NAME
    destination.write_text(SCRIPT_SOURCE.read_text(encoding="utf-8"), encoding="utf-8")
    return destination


def build_headless_command(
    headless: Path,
    *,
    binary: Path,
    project_dir: Path,
    project_name: str,
    script_dir: Path,
    output_path: Path,
) -> list[str]:
    focus_args = [f"{item.virtual_address_hex}:{item.label}" for item in FOCUS_FUNCTIONS]
    return [
        str(headless),
        str(project_dir),
        project_name,
        "-import",
        str(binary),
        "-overwrite",
        "-scriptPath",
        str(script_dir),
        "-postScript",
        SCRIPT_NAME,
        str(output_path),
        *focus_args,
    ]


def build_process_command(
    headless: Path,
    *,
    project_dir: Path,
    project_name: str,
    script_dir: Path,
    output_path: Path,
) -> list[str]:
    focus_args = [f"{item.virtual_address_hex}:{item.label}" for item in FOCUS_FUNCTIONS]
    return [
        str(headless),
        str(project_dir),
        project_name,
        "-process",
        "G7MTClient.exe",
        "-scriptPath",
        str(script_dir),
        "-postScript",
        SCRIPT_NAME,
        str(output_path),
        *focus_args,
    ]


def build_focus_plan(
    binary: Path,
    *,
    project_dir: Path,
    output_path: Path,
    script_dir: Path,
    environ: Mapping[str, str] | None = None,
) -> JsonObject:
    raw = binary.read_bytes()
    image = _parse_pe_image(raw)
    headless = find_ghidra_headless(environ)
    command_head = headless if headless is not None else Path("analyzeHeadless")
    command = build_headless_command(
        command_head,
        binary=binary,
        project_dir=project_dir,
        project_name=DEFAULT_PROJECT_NAME,
        script_dir=script_dir,
        output_path=output_path,
    )
    return {
        "binary": {
            "path": str(binary),
            "sha256": hashlib.sha256(raw).hexdigest(),
            "sha256Bytes": 32,
            "imageBaseHex": f"0x{image.image_base:08x}",
        },
        "script": {
            "name": SCRIPT_NAME,
            "sourcePath": str(SCRIPT_SOURCE),
            "scriptDir": str(script_dir),
        },
        "project": {
            "directory": str(project_dir),
            "name": DEFAULT_PROJECT_NAME,
            "disposable": True,
        },
        "headless": {
            "available": headless is not None,
            "path": "" if headless is None else str(headless),
            "commandPreview": " ".join(command),
        },
        "focusFunctions": [item.to_json() for item in FOCUS_FUNCTIONS],
        "nextUse": "run commandPreview, then inspect function decompiledC for 0x7001/0x7002 stream reads",
    }


def find_ghidra_headless(environ: Mapping[str, str] | None = None) -> Path | None:
    env = os.environ if environ is None else environ
    for candidate in _environment_candidates(env):
        if candidate.exists():
            return candidate
    for name in ("analyzeHeadless", "analyzeHeadless.bat"):
        found = shutil.which(name)
        if found is not None:
            return Path(found)
    for candidate in _known_install_candidates():
        if candidate.exists():
            return candidate
    return None


def run_focus_dump(
    binary: Path,
    *,
    project_dir: Path,
    script_dir: Path,
    output_path: Path,
    environ: Mapping[str, str] | None = None,
) -> int:
    headless = find_ghidra_headless(environ)
    if headless is None:
        raise GhidraHeadlessNotFoundError("Ghidra analyzeHeadless was not found")
    project_dir.mkdir(parents=True, exist_ok=True)
    write_focus_script(script_dir)
    project_file = project_dir / f"{DEFAULT_PROJECT_NAME}.gpr"
    if project_file.exists():
        command = build_process_command(
            headless,
            project_dir=project_dir,
            project_name=DEFAULT_PROJECT_NAME,
            script_dir=script_dir,
            output_path=output_path,
        )
    else:
        command = build_headless_command(
            headless,
            binary=binary,
            project_dir=project_dir,
            project_name=DEFAULT_PROJECT_NAME,
            script_dir=script_dir,
            output_path=output_path,
        )
    completed = subprocess.run(command, check=False)
    return completed.returncode


def _environment_candidates(environ: Mapping[str, str]) -> tuple[Path, ...]:
    candidates: list[Path] = []
    explicit = environ.get("GHIDRA_HEADLESS")
    if explicit:
        candidates.append(Path(explicit))
    for key in ("GHIDRA_HOME", "GHIDRA_INSTALL_DIR"):
        root = environ.get(key)
        if root:
            candidates.extend(_headless_under_root(Path(root)))
    return tuple(candidates)


def _headless_under_root(root: Path) -> tuple[Path, ...]:
    support = root / "support"
    return (
        support / "analyzeHeadless.bat",
        support / "analyzeHeadless",
    )


def _known_install_candidates() -> tuple[Path, ...]:
    roots = (
        Path("C:/"),
        Path("C:/tools"),
        Path("C:/Program Files"),
        Path.home() / "AppData" / "Local" / "Programs" / "Ghidra",
        Path.home() / "AppData" / "Local" / "Programs",
    )
    candidates: list[Path] = []
    for root in roots:
        if not root.exists():
            continue
        candidates.extend(root.glob("ghidra*/support/analyzeHeadless.bat"))
        candidates.extend(root.glob("Ghidra*/support/analyzeHeadless.bat"))
        candidates.extend(root.glob("ghidra*/support/analyzeHeadless"))
        candidates.extend(root.glob("Ghidra*/support/analyzeHeadless"))
    return tuple(candidates)


def _write_json(path: Path, payload: JsonObject) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Prepare or run a focused Ghidra dump for LOGH VII.")
    sub = parser.add_subparsers(dest="command", required=True)
    plan = sub.add_parser("plan")
    plan.add_argument("binary", type=Path)
    plan.add_argument("--project-dir", type=Path, default=DEFAULT_PROJECT_DIR)
    plan.add_argument("--script-dir", type=Path, default=DEFAULT_SCRIPT_DIR)
    plan.add_argument("--out", type=Path, required=True)
    run = sub.add_parser("run")
    run.add_argument("binary", type=Path)
    run.add_argument("--project-dir", type=Path, default=DEFAULT_PROJECT_DIR)
    run.add_argument("--script-dir", type=Path, default=DEFAULT_SCRIPT_DIR)
    run.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()

    if args.command == "plan":
        write_focus_script(args.script_dir)
        payload = build_focus_plan(
            args.binary,
            project_dir=args.project_dir,
            output_path=args.out.with_suffix(".focus.json"),
            script_dir=args.script_dir,
        )
        _write_json(args.out, payload)
        print(f"wrote {args.out}")
        return 0
    try:
        return run_focus_dump(
            args.binary,
            project_dir=args.project_dir,
            script_dir=args.script_dir,
            output_path=args.out,
        )
    except GhidraHeadlessNotFoundError as error:
        print(str(error), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
