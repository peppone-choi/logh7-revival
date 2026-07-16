#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = [
#     "frida>=17.2",
#     "pillow>=11.3",
#     "pydantic>=2.11",
#     "pytest>=8.3",
#     "typer>=0.16",
# ]
# ///

# ─── How to run ───
# 1. Install uv: https://docs.astral.sh/uv/getting-started/installation/
# 2. Run: uv run --with frida --with pillow --with pydantic --with pytest --with typer python -m pytest tools/live/test_m3_multiclient_probe.py
# ──────────────────

from __future__ import annotations

import subprocess
from collections.abc import Callable
from pathlib import Path

import pytest

from tools.live import _m3_multiclient_probe as probe
from tools.live import m3_multiclient_support as support


SCRIPT = Path(__file__).with_name("_m3_multiclient_probe.py")


class FakeLobbyDriver:
    def __init__(self, geometries: tuple[tuple[int, int, int, int], ...]) -> None:
        self.geometries = iter(geometries)
        self.geometry_calls = 0
        self.clicks: list[tuple[int, int, int, str]] = []
        self.events: list[str] = []

    def foreground(self, _hwnd: int) -> None:
        self.events.append("foreground")

    def client_geometry(self, _hwnd: int) -> tuple[int, int, int, int]:
        self.events.append("geometry")
        self.geometry_calls += 1
        return next(self.geometries)

    def click_guarded(self, hwnd: int, x: int, y: int, label: str) -> None:
        self.events.append(f"click:{label}")
        self.clicks.append((hwnd, x, y, label))


class FakeProcess:
    pid = 71

    def poll(self) -> int | None:
        return None


class FakeScript:
    def load(self) -> None:
        return None


class FakeVisualExports:
    def __init__(self, events: list[str]) -> None:
        self.events = events
        self.fades = iter((0.75, 1.0, 1.0))

    def snap(self) -> dict[str, float]:
        fade = next(self.fades)
        self.events.append(f"fade:{fade}")
        return {"fade": fade}


class FakeVisualScript(FakeScript):
    def __init__(self, events: list[str]) -> None:
        self.exports_sync = FakeVisualExports(events)


class FakeSession:
    def __init__(self, script: FakeScript, visual_script: FakeVisualScript) -> None:
        self.scripts = iter((script, visual_script))
        self.sources: list[str] = []

    def create_script(self, source: str) -> FakeScript:
        self.sources.append(source)
        return next(self.scripts)


class FakeWorldDriver:
    def __init__(self, events: list[str]) -> None:
        self.events = events

    def client_geometry(self, _hwnd: int) -> tuple[int, int, int, int]:
        return (0, 0, 1024, 768)

    def mouse_click(self, _x: int, _y: int) -> None:
        return None

    def click_guarded(self, _hwnd: int, _x: int, _y: int, _label: str) -> None:
        return None

    def do_login(self, hwnd: int, account: str, password: str, phase: Path) -> None:
        assert (hwnd, account, password, phase.name) == (7, "inei00", "dummy", "phase")
        self.events.append("login")

    def foreground(self, _hwnd: int) -> None:
        self.events.append("foreground")

    def screenshot(self, _hwnd: int, _path: Path) -> None:
        self.events.append("screenshot")


def test_world_screenshot_rechecks_world_after_fade_and_nine_second_settle(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch,
) -> None:
    events: list[str] = []
    process = FakeProcess()
    script = FakeScript()
    visual_script = FakeVisualScript(events)
    session = FakeSession(script, visual_script)
    driver = FakeWorldDriver(events)

    def fake_popen(_argv: list[str], *, cwd: Path) -> FakeProcess:
        assert cwd == tmp_path
        return process

    def fake_load_module(_name: str) -> FakeWorldDriver:
        return driver

    def fake_attach(_pid: int) -> FakeSession:
        return session

    def fake_drive_lobby_entry(
        _driver: support.LobbyDriver, _hwnd: int, _pause: Callable[[float], None],
    ) -> None:
        return None

    def fake_probe(_client: support.LiveClient) -> tuple[support.ProbeSnapshot, bool]:
        events.append("probe")
        return support.ProbeSnapshot(frozenset({1}), 0, 0), True

    def fake_sleep(seconds: float) -> None:
        events.append(f"sleep:{seconds}")

    monkeypatch.setattr(probe.subprocess, "Popen", fake_popen)
    monkeypatch.setattr(probe, "load_live_module", fake_load_module)
    monkeypatch.setattr(probe.frida, "attach", fake_attach)
    monkeypatch.setattr(probe, "wait_hwnd", lambda _pid: 7)
    monkeypatch.setattr(probe, "drive_lobby_entry", fake_drive_lobby_entry)
    monkeypatch.setattr(probe, "probe_client", fake_probe)
    monkeypatch.setattr(probe.time, "monotonic", lambda: 0.0)
    monkeypatch.setattr(probe.time, "sleep", fake_sleep)
    config = support.HarnessConfig(
        tmp_path, tmp_path / "g7mtclient.exe",
        support.parse_account(support.ACCOUNT_A_RAW), support.parse_account(support.ACCOUNT_B_RAW),
    )
    custom_probe = tmp_path / "observer.js"
    custom_probe.write_text("custom observer", encoding="utf-8")

    client = probe._start_client(
        config, config.account_a, tmp_path / "phase", probe_js=custom_probe,
    )

    assert client.process.pid == process.pid
    assert session.sources[0] == "custom observer"
    assert events == [
        "login", "probe", "fade:0.75", "sleep:0.35", "probe", "fade:1.0", "sleep:9.0",
        "probe", "fade:1.0", "foreground", "screenshot",
    ]


def test_help_is_available_without_starting_live_processes() -> None:
    completed = subprocess.run(  # noqa: S603
        ["uv", "run", str(SCRIPT), "--help"],  # noqa: S607
        check=False,
        capture_output=True,
        text=True,
    )

    assert completed.returncode == 0
    assert "two-client" in completed.stdout.lower()


def test_lobby_entry_waits_nine_seconds_and_refreshes_each_action_geometry() -> None:
    driver = FakeLobbyDriver(((10, 20, 1024, 768), (30, 40, 1024, 768)))
    pauses: list[float] = []

    callbacks = support.LobbyDriver(driver.foreground, driver.client_geometry, driver.click_guarded)
    support.drive_lobby_entry(callbacks, hwnd=7, pause=pauses.append)

    assert pauses == [9.0, 3.5, 1.2]
    assert driver.geometry_calls == 2
    assert driver.events == [
        "foreground", "geometry", "click:game-start",
        "foreground", "geometry", "click:character-card", "click:character-card-double-click",
    ]
    assert driver.clicks == [
        (7, 135, 211, "game-start"),
        (7, 685, 345, "character-card"),
        (7, 685, 345, "character-card-double-click"),
    ]


def test_lobby_entry_uses_native_fixed_coordinates_at_1920_width() -> None:
    driver = FakeLobbyDriver(((10, 20, 1924, 1051), (30, 40, 1924, 1051)))

    callbacks = support.LobbyDriver(driver.foreground, driver.client_geometry, driver.click_guarded)
    support.drive_lobby_entry(callbacks, hwnd=7, pause=lambda _seconds: None)

    assert driver.clicks == [
        (7, 583, 367, "game-start"),
        (7, 989, 491, "character-card"),
        (7, 989, 491, "character-card-double-click"),
    ]


def test_natural_move_steps_keep_legacy_coordinates_below_native_width() -> None:
    assert support.natural_move_steps(1028) == (
        ("authority-tab", (735, 580)),
        ("captain-card", (823, 482)),
        ("warp-command", (722, 282)),
        ("destination-cell", (512, 268)),
        ("confirm", (536, 487)),
    )


def test_native_confirm_click_targets_button_center_at_1920_width() -> None:
    assert support.natural_move_steps(1924) == (
        ("authority-tab", (1631, 892)),
        ("captain-card", (1719, 794)),
        ("warp-command", (1618, 594)),
        ("destination-cell", (833, 545)),
        ("confirm", (1018, 642)),
    )


def test_config_rejects_missing_executable(tmp_path: Path) -> None:
    with pytest.raises(probe.HarnessInputError, match="does not exist"):
        probe.HarnessConfig.parse(
            evidence_dir=tmp_path / "evidence",
            exe=tmp_path / "missing.exe",
            account_a="inei00:dummy:1:1",
            account_b="dummy:dummy:2:2",
        )


def test_harness_errors_keep_detail_string_and_accept_traceback() -> None:
    with pytest.raises(RuntimeError) as caught:
        raise RuntimeError("trace source")
    source_traceback = caught.value.__traceback__
    assert source_traceback is not None

    for error, detail in (
        (support.HarnessInputError("input detail"), "input detail"),
        (support.HarnessRuntimeError("runtime detail"), "runtime detail"),
    ):
        error.__traceback__ = source_traceback
        assert error.__traceback__ is source_traceback
        assert error.detail == detail
        assert str(error) == detail


def test_config_rejects_wrong_account_contract(tmp_path: Path) -> None:
    exe = tmp_path / "g7mtclient.exe"
    exe.touch()

    with pytest.raises(probe.HarnessInputError, match="account A"):
        probe.HarnessConfig.parse(
            evidence_dir=tmp_path / "evidence",
            exe=exe,
            account_a="wrong:dummy:1:1",
            account_b="dummy:dummy:2:2",
        )


def test_cli_fails_closed_for_missing_executable(tmp_path: Path) -> None:
    completed = subprocess.run(  # noqa: S603
        ["uv", "run", str(SCRIPT), str(tmp_path / "evidence"), "--exe", str(tmp_path / "missing.exe")],  # noqa: S607
        check=False,
        capture_output=True,
        text=True,
    )

    assert completed.returncode != 0
    assert "does not exist" in completed.stderr


def test_cli_fails_closed_for_wrong_account_before_live_start(tmp_path: Path) -> None:
    exe = tmp_path / "g7mtclient.exe"
    exe.touch()

    completed = subprocess.run(  # noqa: S603
        ["uv", "run", str(SCRIPT), str(tmp_path / "evidence"), "--exe", str(exe),
         "--account-a", "wrong:dummy:1:1"],  # noqa: S607
        check=False,
        capture_output=True,
        text=True,
    )

    assert completed.returncode != 0
    assert "account A" in completed.stderr


def test_seed_store_is_written_once_with_stable_characters(tmp_path: Path) -> None:
    store_path = tmp_path / "store.json"

    probe.write_seed_store_once(store_path)

    store = support.read_store(store_path)
    assert store.accounts["inei00"][0].id == 1
    assert store.accounts["inei00"][0].flagship == 1
    assert store.accounts["dummy"][0].id == 2
    assert store.accounts["dummy"][0].flagship == 2
    with pytest.raises(probe.HarnessInputError, match="already exists"):
        probe.write_seed_store_once(store_path)


def test_direct_launch_uses_same_absolute_executable_and_cwd(tmp_path: Path) -> None:
    exe = (tmp_path / "g7mtclient.exe").resolve()

    launch_a = probe.direct_launch(exe)
    launch_b = probe.direct_launch(exe)

    assert launch_a.argv == (str(exe),)
    assert launch_b.argv == launch_a.argv
    assert launch_a.cwd == exe.parent
    assert launch_b.cwd == exe.parent
    assert launch_a.helper_or_overlay is False


def test_observer_gate_requires_notify_registry_and_clean_lookup() -> None:
    before = support.ProbeSnapshot(
        registry_ids=frozenset({1, 2}), disp_b07=0, lookup_misses=3,
    )
    after = support.ProbeSnapshot(
        registry_ids=frozenset({1, 2}), disp_b07=1, lookup_misses=3,
    )

    result = probe.observer_gate(before, after, mover_unit_id=1, both_alive=True)

    assert result.passed is True
    assert result.facts["notifyDelta"] == 1
    assert result.facts["moverRegistered"] is True


def test_observer_gate_rejects_dispatch_for_unknown_mover() -> None:
    before = support.ProbeSnapshot(
        registry_ids=frozenset({2}), disp_b07=0, lookup_misses=0,
    )
    after = support.ProbeSnapshot(
        registry_ids=frozenset({2}), disp_b07=1, lookup_misses=1,
    )

    result = probe.observer_gate(before, after, mover_unit_id=1, both_alive=True)

    assert result.passed is False
    assert result.facts["moverRegistered"] is False
    assert result.facts["lookupMissDelta"] == 1


def test_retention_gate_requires_new_pid_world_and_matching_cell() -> None:
    passed = probe.retention_gate(
        expected_cell=2388,
        stored_cell=2388,
        previous_pid=10,
        current_pid=11,
        world_active=True,
    )
    failed = probe.retention_gate(
        expected_cell=2388,
        stored_cell=2588,
        previous_pid=10,
        current_pid=10,
        world_active=True,
    )

    assert passed.passed is True
    assert failed.passed is False


def test_result_contract_contains_every_m3_gate() -> None:
    assert tuple(probe.initial_results()) == (
        "twoDirectProcesses",
        "bothWorld",
        "aMoveRequest",
        "bNotifyReceived",
        "bNotifyApplied",
        "reloginRetention",
        "restartRetention",
        "cleanup",
    )
