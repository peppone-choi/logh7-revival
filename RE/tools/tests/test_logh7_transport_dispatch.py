import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from test_logh7_pipeline import REPO_ROOT, TOOL


IMAGE_BASE = 0x00400000
SECTION_RVA = 0x000B0000
SECTION_RAW = 0x400
SECTION_SIZE = 0x10000
JUMP_TABLE_VA = 0x004B864C


def _write_u16(data: bytearray, offset: int, value: int) -> None:
    data[offset : offset + 2] = value.to_bytes(2, "little")


def _write_u32(data: bytearray, offset: int, value: int) -> None:
    data[offset : offset + 4] = value.to_bytes(4, "little")


def _va_offset(virtual_address: int) -> int:
    return SECTION_RAW + (virtual_address - IMAGE_BASE - SECTION_RVA)


def _handler_bytes(*, ebx: int | None, esi: int | str, side_effect: bool = False, gated: bool = True) -> bytes:
    body = bytearray.fromhex("8a877e83350084c00f8400000000") if gated else bytearray()
    if side_effect:
        body.extend(bytes.fromhex("ff1568b666008987ac7e3500"))
    if ebx is not None:
        body.extend(b"\xbb" + ebx.to_bytes(4, "little"))
    if isinstance(esi, int):
        body.extend(b"\xbe" + esi.to_bytes(4, "little"))
    else:
        body.extend(bytes.fromhex("8bf3"))
    body.extend(bytes.fromhex("e900000000"))
    return bytes(body)


def _fixture_client(path: Path) -> None:
    data = bytearray(SECTION_RAW + SECTION_SIZE)
    data[:2] = b"MZ"
    _write_u32(data, 0x3C, 0x80)
    data[0x80:0x84] = b"PE\0\0"
    _write_u16(data, 0x84, 0x014C)
    _write_u16(data, 0x86, 1)
    _write_u16(data, 0x94, 0xE0)
    _write_u16(data, 0x96, 0x010F)
    optional = 0x98
    _write_u16(data, optional, 0x10B)
    _write_u32(data, optional + 28, IMAGE_BASE)
    section = optional + 0xE0
    data[section : section + 8] = b".text\0\0\0"
    _write_u32(data, section + 8, SECTION_SIZE)
    _write_u32(data, section + 12, SECTION_RVA)
    _write_u32(data, section + 16, SECTION_SIZE)
    _write_u32(data, section + 20, SECTION_RAW)

    handlers = {
        0x0001: (0x004B7700, _handler_bytes(ebx=0x0201, esi=0x0200, gated=False)),
        0x0003: (0x004B7780, _handler_bytes(ebx=0x0206, esi=0x0205, gated=False)),
        0x0004: (0x004B7800, _handler_bytes(ebx=0x0204, esi=0x0203)),
        0x0013: (0x004B7900, _handler_bytes(ebx=0x0F01, esi=0x0F00)),
        0x0014: (0x004B7A00, _handler_bytes(ebx=0x0F03, esi=0x0F02)),
        0x0030: (0x004B7D6D, _handler_bytes(ebx=0x0301, esi=0x0300, side_effect=True)),
        0x0034: (0x004B7E26, _handler_bytes(ebx=None, esi=0x0405)),
        0x0035: (0x004B7E3E, _handler_bytes(ebx=None, esi=0x0406)),
        0x0036: (0x004B7E56, _handler_bytes(ebx=0x040C, esi="ebx")),
    }
    for code, (target, body) in handlers.items():
        _write_u32(data, _va_offset(JUMP_TABLE_VA + (code - 1) * 4), target)
        data[_va_offset(target) : _va_offset(target) + len(body)] = body
    path.write_bytes(bytes(data))


class Logh7TransportDispatchTests(unittest.TestCase):
    def test_indexes_post_handshake_transport_dispatch_entries(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            temp_path = Path(temp)
            source = temp_path / "G7MTClient.exe"
            out = temp_path / "dispatch.json"
            _fixture_client(source)

            result = subprocess.run(
                [
                    sys.executable,
                    str(TOOL),
                    "transport-dispatch-index",
                    str(source),
                    "--out",
                    str(out),
                ],
                cwd=REPO_ROOT,
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                check=False,
            )

            self.assertEqual(result.returncode, 0, result.stderr)
            index = json.loads(out.read_text(encoding="utf-8"))
            by_code = {entry["transportHex"]: entry for entry in index["entries"]}
            self.assertEqual(by_code["0x0001"]["internalHex"], "0x0200")
            self.assertEqual(by_code["0x0001"]["pairedInternalHex"], "0x0201")
            self.assertIsNone(by_code["0x0001"]["stateGate"])
            self.assertEqual(by_code["0x0003"]["internalHex"], "0x0205")
            self.assertEqual(by_code["0x0003"]["pairedInternalHex"], "0x0206")
            self.assertIsNone(by_code["0x0003"]["stateGate"])
            self.assertEqual(by_code["0x0004"]["internalHex"], "0x0203")
            self.assertEqual(by_code["0x0004"]["pairedInternalHex"], "0x0204")
            self.assertEqual(by_code["0x0004"]["stateGate"], "cipher-enabled flag at client offset 0x35837e")
            self.assertEqual(by_code["0x0013"]["internalHex"], "0x0f00")
            self.assertEqual(by_code["0x0013"]["pairedInternalHex"], "0x0f01")
            self.assertEqual(by_code["0x0014"]["internalHex"], "0x0f02")
            self.assertEqual(by_code["0x0014"]["pairedInternalHex"], "0x0f03")
            self.assertEqual(by_code["0x0030"]["internalHex"], "0x0300")
            self.assertEqual(by_code["0x0030"]["pairedInternalHex"], "0x0301")
            self.assertEqual(by_code["0x0030"]["sideEffects"], ["stores timestamp/gettick result at client+0x357eac"])
            self.assertEqual(by_code["0x0036"]["internalHex"], "0x040c")
            self.assertEqual(by_code["0x0036"]["pairedInternalHex"], "0x040c")
            self.assertEqual(by_code["0x0036"]["stateGate"], "cipher-enabled flag at client offset 0x35837e")


if __name__ == "__main__":
    unittest.main()
