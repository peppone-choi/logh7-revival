#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = [
#     "frida>=17.2",
#     "pydantic>=2.11",
# ]
# ///

# ─── How to run ───
# 1. Install uv: https://docs.astral.sh/uv/getting-started/installation/
# 2. Import from tools.live.m3_multiclient_support; it has no live side effects.
# ──────────────────

from __future__ import annotations

import importlib
import json
import socket
import subprocess
import sys
import time
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from pathlib import Path
from types import ModuleType
from typing import Final, TextIO

import frida
from pydantic import BaseModel, ConfigDict


ACCOUNT_A_RAW: Final = "inei00:dummy:1:1"
ACCOUNT_B_RAW: Final = "dummy:dummy:2:2"
ROOT: Final = Path(__file__).resolve().parents[2]
LOBBY_REF: Final = (1024, 768)
GAME_START: Final = (125, 191)
CHAR_CARD: Final = (655, 305)
NATIVE_GAME_START: Final = (573, 347)
NATIVE_CHAR_CARD: Final = (959, 451)
LEGACY_MOVE_STEPS: Final = (
    ("authority-tab", (735, 580)),
    ("captain-card", (823, 482)),
    ("warp-command", (722, 282)),
    ("destination-cell", (512, 268)),
    ("confirm", (536, 487)),
)
NATIVE_MOVE_STEPS: Final = (
    ("authority-tab", (1631, 892)),
    ("captain-card", (1719, 794)),
    ("warp-command", (1618, 594)),
    ("destination-cell", (833, 545)),
    ("confirm", (1018, 656)),
)
RESULT_NAMES: Final = (
    "twoDirectProcesses", "bothWorld", "aMoveRequest", "bNotifyReceived",
    "bNotifyApplied", "reloginRetention", "restartRetention", "cleanup",
)


@dataclass(frozen=True, slots=True)
class HarnessInputError(Exception):
    detail: str

    def __str__(self) -> str:
        return self.detail


@dataclass(frozen=True, slots=True)
class HarnessRuntimeError(Exception):
    detail: str

    def __str__(self) -> str:
        return self.detail


@dataclass(frozen=True, slots=True)
class AccountSpec:
    account: str
    password: str
    character_id: int
    unit_id: int


@dataclass(frozen=True, slots=True)
class HarnessConfig:
    evidence_dir: Path
    exe: Path
    account_a: AccountSpec
    account_b: AccountSpec

    @classmethod
    def parse(
        cls, evidence_dir: Path, exe: Path, account_a: str, account_b: str,
    ) -> HarnessConfig:
        resolved = exe.resolve()
        if not resolved.is_file():
            raise HarnessInputError(f"executable does not exist: {resolved}")
        if resolved.name.lower() != "g7mtclient.exe":
            raise HarnessInputError(f"expected g7mtclient.exe: {resolved}")
        if account_a != ACCOUNT_A_RAW:
            raise HarnessInputError(f"account A must be {ACCOUNT_A_RAW}")
        if account_b != ACCOUNT_B_RAW:
            raise HarnessInputError(f"account B must be {ACCOUNT_B_RAW}")
        return cls(evidence_dir.resolve(), resolved, parse_account(account_a), parse_account(account_b))


@dataclass(frozen=True, slots=True)
class DirectLaunch:
    argv: tuple[str, ...]
    cwd: Path
    helper_or_overlay: bool = False


@dataclass(frozen=True, slots=True)
class ProbeSnapshot:
    registry_ids: frozenset[int]
    disp_b07: int
    lookup_misses: int


Fact = bool | int | str | None


@dataclass(frozen=True, slots=True)
class GateEvidence:
    passed: bool
    facts: Mapping[str, Fact]


class Character(BaseModel):
    model_config = ConfigDict(frozen=True)
    id: int
    power: int
    camp: int
    blood: int
    sex: int
    generated: int
    lastname: str
    firstname: str
    face: int
    ability8: tuple[int, ...]
    title: int
    rank: int
    charState: int
    age: int
    flagship: int
    cell: int


class Store(BaseModel):
    model_config = ConfigDict(frozen=True)
    accounts: Mapping[str, tuple[Character, ...]]
    nextId: int


class RegistryEntry(BaseModel):
    model_config = ConfigDict(frozen=True)
    id: int


class RegistryPayload(BaseModel):
    model_config = ConfigDict(frozen=True)
    activeCount: int
    entries: tuple[RegistryEntry, ...]


class SnapshotPayload(BaseModel):
    model_config = ConfigDict(frozen=True)
    dispCounts: Mapping[str, int]
    lookupMisses: int


@dataclass(frozen=True, slots=True)
class LobbyDriver:
    foreground: Callable[[int], None]
    client_geometry: Callable[[int], tuple[int, int, int, int]]
    click_guarded: Callable[[int, int, int, str], object]


def drive_lobby_entry(driver: LobbyDriver, hwnd: int, pause: Callable[[float], None]) -> None:
    pause(9.0)
    driver.foreground(hwnd)
    origin_x, origin_y, width, height = driver.client_geometry(hwnd)
    game_x, game_y = NATIVE_GAME_START if width >= 1800 else (
        int(GAME_START[0] * width / LOBBY_REF[0]),
        int(GAME_START[1] * height / LOBBY_REF[1]),
    )
    driver.click_guarded(hwnd, origin_x + game_x, origin_y + game_y, "game-start")
    pause(3.5)
    driver.foreground(hwnd)
    origin_x, origin_y, width, height = driver.client_geometry(hwnd)
    card_x, card_y = NATIVE_CHAR_CARD if width >= 1800 else (
        int(CHAR_CARD[0] * width / LOBBY_REF[0]),
        int(CHAR_CARD[1] * height / LOBBY_REF[1]),
    )
    card_x += origin_x
    card_y += origin_y
    driver.click_guarded(hwnd, card_x, card_y, "character-card")
    pause(1.2)
    driver.click_guarded(hwnd, card_x, card_y, "character-card-double-click")


def natural_move_steps(width: int) -> tuple[tuple[str, tuple[int, int]], ...]:
    return NATIVE_MOVE_STEPS if width >= 1800 else LEGACY_MOVE_STEPS


def parse_account(raw: str) -> AccountSpec:
    fields = raw.split(":")
    if len(fields) != 4 or not fields[0] or not fields[1]:
        raise HarnessInputError(f"invalid account spec: {raw!r}")
    try:
        character_id, unit_id = int(fields[2]), int(fields[3])
    except ValueError as error:
        raise HarnessInputError(f"invalid account numeric fields: {raw!r}") from error
    if character_id <= 0 or unit_id <= 0:
        raise HarnessInputError(f"account ids must be positive: {raw!r}")
    return AccountSpec(fields[0], fields[1], character_id, unit_id)


def direct_launch(exe: Path) -> DirectLaunch:
    resolved = exe.resolve()
    return DirectLaunch((str(resolved),), resolved.parent)


def _character(account: AccountSpec, *, power: int, cell: int) -> Character:
    return Character(
        id=account.character_id, power=power, camp=power, blood=1, sex=0, generated=1,
        lastname="Reinhard" if power == 2 else "Yang", firstname="Lohengramm" if power == 2 else "Wenli",
        face=305419896 + account.character_id, ability8=(80, 75, 70, 65, 60, 55, 50, 45),
        title=0, rank=13, charState=1, age=20, flagship=account.unit_id, cell=cell,
    )


def write_seed_store_once(path: Path) -> None:
    if path.exists():
        raise HarnessInputError(f"store already exists: {path}")
    path.parent.mkdir(parents=True, exist_ok=True)
    store = Store(
        accounts={
            "inei00": (_character(parse_account(ACCOUNT_A_RAW), power=2, cell=2588),),
            "dummy": (_character(parse_account(ACCOUNT_B_RAW), power=3, cell=2597),),
        },
        nextId=3,
    )
    path.write_text(store.model_dump_json(indent=2), encoding="utf-8")


def read_store(path: Path) -> Store:
    return Store.model_validate_json(path.read_text(encoding="utf-8"))


def store_cell(path: Path, account: AccountSpec) -> int:
    character = next(item for item in read_store(path).accounts[account.account]
                     if item.id == account.character_id)
    return character.cell


def observer_gate(
    before: ProbeSnapshot, after: ProbeSnapshot, *, mover_unit_id: int, both_alive: bool,
) -> GateEvidence:
    notify_delta = after.disp_b07 - before.disp_b07
    miss_delta = after.lookup_misses - before.lookup_misses
    registered = mover_unit_id in before.registry_ids
    return GateEvidence(
        both_alive and notify_delta > 0 and registered and miss_delta == 0,
        {"notifyDelta": notify_delta, "lookupMissDelta": miss_delta, "moverRegistered": registered,
         "bothAlive": both_alive},
    )


def retention_gate(
    *, expected_cell: int, stored_cell: int, previous_pid: int, current_pid: int, world_active: bool,
) -> GateEvidence:
    fresh_pid = current_pid != previous_pid
    return GateEvidence(
        expected_cell == stored_cell and fresh_pid and world_active,
        {"expectedCell": expected_cell, "storeCell": stored_cell, "previousPid": previous_pid,
         "currentPid": current_pid, "freshPid": fresh_pid, "worldActive": world_active},
    )


def initial_results() -> Mapping[str, GateEvidence]:
    return {name: GateEvidence(False, {}) for name in RESULT_NAMES}


def load_live_module(name: str) -> ModuleType:
    root = str(ROOT)
    if root not in sys.path:
        sys.path.insert(0, root)
    return importlib.import_module(name)


class LiveClient:
    __slots__ = ("account", "process", "hwnd", "session", "script")

    def __init__(self, account: AccountSpec, process: subprocess.Popen[bytes], hwnd: int,
                 session: frida.core.Session, script: frida.core.Script) -> None:
        self.account = account
        self.process = process
        self.hwnd = hwnd
        self.session = session
        self.script = script

    @property
    def alive(self) -> bool:
        return self.process.poll() is None


class LiveServer:
    __slots__ = ("process", "log")

    def __init__(self, process: subprocess.Popen[bytes], log: TextIO) -> None:
        self.process = process
        self.log = log


def wait_hwnd(pid: int) -> int:
    driver = load_live_module("tools.live.logh7_agent_drive")
    deadline = time.monotonic() + 30
    while time.monotonic() < deadline:
        try:
            return int(driver.find_client_hwnd(expected_pid=pid))
        except RuntimeError:
            time.sleep(0.25)
    raise HarnessRuntimeError(f"client window not found for pid {pid}")


def probe_client(client: LiveClient) -> tuple[ProbeSnapshot, bool]:
    snap = SnapshotPayload.model_validate(client.script.exports_sync.snapshot())
    registry = RegistryPayload.model_validate(client.script.exports_sync.dumpregistry())
    return ProbeSnapshot(
        frozenset(entry.id for entry in registry.entries), snap.dispCounts.get("0xb07", 0),
        snap.lookupMisses,
    ), registry.activeCount > 0


def write_probe_snapshot(path: Path, snapshot: ProbeSnapshot) -> None:
    payload = {"registryIds": sorted(snapshot.registry_ids), "dispB07": snapshot.disp_b07,
               "lookupMisses": snapshot.lookup_misses}
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def port_closed() -> bool:
    with socket.socket() as probe_socket:
        probe_socket.settimeout(0.4)
        return probe_socket.connect_ex(("127.0.0.1", 47900)) != 0


def gate_json(gate: GateEvidence) -> Mapping[str, bool | Mapping[str, Fact]]:
    return {"pass": gate.passed, "facts": gate.facts}


def trace_count(path: Path) -> int:
    return len(path.read_text(encoding="utf-8", errors="replace").splitlines()) if path.exists() else 0


def terminate_process(process: subprocess.Popen[bytes]) -> None:
    if process.poll() is None:
        process.terminate()
        try:
            process.wait(timeout=8)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=8)
