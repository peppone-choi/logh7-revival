from __future__ import annotations

from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from enum import StrEnum
from typing import Protocol, TypeAlias, assert_never

JsonScalar: TypeAlias = str | int | float | bool | None
JsonValue: TypeAlias = JsonScalar | list["JsonValue"] | dict[str, "JsonValue"]
JsonObject: TypeAlias = dict[str, JsonValue]


class InvalidTraceCodeError(Exception):
    def __init__(self, value: str) -> None:
        self.value = value
        super().__init__(f"invalid 16-bit trace code: {value}")


class InvalidSessionRowError(Exception):
    def __init__(self, row: int) -> None:
        self.row = row
        super().__init__(f"session row must be between 1 and 5: {row}")


class InvalidFactionError(Exception):
    def __init__(self, value: str) -> None:
        self.value = value
        super().__init__(f"invalid character faction: {value}")


class CharacterFaction(StrEnum):
    EMPIRE = "empire"
    ALLIANCE = "alliance"


class UiFlowDriver(Protocol):
    def click(self, x: int, y: int, *, label: str, settle: float) -> JsonObject: ...

    def text(self, value: str, *, label: str, settle: float) -> JsonObject: ...


@dataclass(frozen=True, slots=True)
class LoginSpec:
    account: str
    password: str


@dataclass(frozen=True, slots=True)
class CharacterFlowSpec:
    session_row: int
    faction: CharacterFaction
    lastname: str
    firstname: str
    flagship: str


@dataclass(frozen=True, slots=True)
class FlowRun:
    name: str
    reports: tuple[JsonObject, ...]
    account: str | None = None
    character: CharacterFlowSpec | None = None

    def to_json(self) -> JsonObject:
        payload: JsonObject = {"flow": self.name, "steps": len(self.reports), "reports": list(self.reports)}
        if self.account is not None:
            payload["account"] = self.account
        if self.character is not None:
            payload["character"] = {
                "sessionRow": self.character.session_row,
                "faction": self.character.faction.value,
                "lastname": self.character.lastname,
                "firstname": self.character.firstname,
                "flagship": self.character.flagship,
            }
        return payload


def parse_trace_code(value: str) -> int:
    try:
        code = int(value, 0)
    except ValueError as exc:
        raise InvalidTraceCodeError(value) from exc
    if code < 0 or code > 0xFFFF:
        raise InvalidTraceCodeError(value)
    return code


def normalize_code_hex(code: int) -> str:
    if code < 0 or code > 0xFFFF:
        raise InvalidTraceCodeError(str(code))
    return f"0x{code:04x}"


def parse_faction(value: str) -> CharacterFaction:
    try:
        return CharacterFaction(value)
    except ValueError as exc:
        raise InvalidFactionError(value) from exc


def trace_event_matches_code(event: Mapping[str, JsonValue], code: int) -> bool:
    return _json_value_matches_code(dict(event), code)


def matching_trace_events(events: Iterable[Mapping[str, JsonValue]], code: int) -> tuple[JsonObject, ...]:
    return tuple(dict(event) for event in events if trace_event_matches_code(event, code))


def run_login_flow(driver: UiFlowDriver, spec: LoginSpec, *, settle: float) -> FlowRun:
    reports = (
        driver.click(325, 333, label="login-account-field", settle=0.2),
        driver.text(spec.account, label="login-account-text", settle=0.2),
        driver.click(325, 360, label="login-password-field", settle=0.2),
        driver.text(spec.password, label="login-password-text", settle=0.2),
        driver.click(323, 389, label="login-submit", settle=settle),
    )
    return FlowRun(name="login", account=spec.account, reports=reports)


def run_create_character_flow(driver: UiFlowDriver, spec: CharacterFlowSpec, *, settle: float) -> FlowRun:
    # ★1920×1080 라이브 캘리브레이션(2026-06-22, noauto EXE 로비/캐릭생성 폼 좌표).
    #   기존 좌표는 ~1024×768 기준이라 1920 창에서 전부 빗나갔다. 핵심 두 군데:
    #   ① 첫 클릭은 "새 캐릭터 작성"(155,305)이다 — 이전 (128,258)은 "게임 시작" 버튼이라
    #      디폴트 캐릭터(char1)로 월드 직행해 0x1008 이 안 떴다(=4클라 "같은 캐릭터" 근본원인).
    #   ② 등록 확인 다이얼로그의 "결정" 버튼=(1015,591). 이전 (571,438)은 버튼 밖이라
    #      8단계 폼 완주가 영영 막혔다(메모리 "예/아니오 다이얼로그 버그"의 실체=좌표 오차).
    #   화면 순서: 세션선택 → 진영 → 성별(기본 남) → 출신(기본) → 이름 → 나이/생일(기본)
    #            → 얼굴(좌상단) → 능력치(기본) → 기함 → 확인 → "결정" 다이얼로그.
    row_x, row_y = _session_row_point(spec.session_row)
    reports: list[JsonObject] = [
        driver.click(155, 305, label="create-menu-new-character", settle=settle),
        driver.click(row_x, row_y, label=f"session-row-{spec.session_row}-first-click", settle=0.4),
        driver.click(row_x, row_y, label=f"session-row-{spec.session_row}-second-click", settle=max(settle, 2.0)),
    ]
    faction_x, faction_y = _faction_point(spec.faction)
    reports.extend(
        [
            driver.click(faction_x, faction_y, label=f"faction-{spec.faction.value}", settle=settle),
            driver.click(766, 581, label="faction-next", settle=settle),
            driver.click(766, 581, label="gender-next", settle=settle),
            driver.click(766, 581, label="origin-next", settle=settle),
            driver.click(640, 313, label="lastname-click", settle=0.3),
            driver.text(spec.lastname, label="lastname-text", settle=settle),
            driver.click(640, 393, label="firstname-click", settle=0.3),
            driver.text(spec.firstname, label="firstname-text", settle=settle),
            driver.click(766, 581, label="name-next", settle=settle),
            driver.click(766, 581, label="birth-next", settle=settle),
            driver.click(431, 297, label="portrait-pick", settle=0.3),
            driver.click(766, 581, label="portrait-next", settle=settle),
            driver.click(766, 581, label="abilities-next", settle=settle),
            driver.click(665, 468, label="flagship-click", settle=0.3),
            driver.text(spec.flagship, label="flagship-text", settle=settle),
            driver.click(766, 581, label="flagship-next", settle=settle),
            driver.click(783, 602, label="register", settle=max(settle, 2.0)),
            driver.click(1015, 591, label="confirm-register-decide", settle=max(settle, 8.0)),
        ]
    )
    return FlowRun(name="create-character", character=spec, reports=tuple(reports))


def _session_row_point(row: int) -> tuple[int, int]:
    if row < 1 or row > 5:
        raise InvalidSessionRowError(row)
    # 1920×1080 세션선택 박스: row1 중심 (880,343), 행 간격 ~100px.
    return 880, 343 + ((row - 1) * 100)


def _faction_point(faction: CharacterFaction) -> tuple[int, int]:
    match faction:
        case CharacterFaction.EMPIRE:
            return 598, 313
        case CharacterFaction.ALLIANCE:
            return 598, 429
        case unreachable:
            assert_never(unreachable)


def _json_value_matches_code(value: JsonValue, code: int) -> bool:
    match value:
        case bool() | None | float():
            return False
        case int() as number:
            return number == code
        case str() as text:
            return _text_matches_code(text, code)
        case list() as items:
            return any(_json_value_matches_code(item, code) for item in items)
        case dict() as item:
            return any(_json_value_matches_code(child, code) for child in item.values())
        case unreachable:
            assert_never(unreachable)


def _text_matches_code(text: str, code: int) -> bool:
    if not text.lower().startswith("0x"):
        return False
    try:
        parsed = int(text, 16)
    except ValueError:
        return False
    return parsed == code
