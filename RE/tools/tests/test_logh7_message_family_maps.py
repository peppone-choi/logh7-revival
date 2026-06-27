import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from tools.tests.test_logh7_pipeline import REPO_ROOT, TOOL


IMAGE_BASE = 0x00400000
SECTION_RVA = 0x00040000
SECTION_RAW = 0x400
SECTION_SIZE = 0x0C0000


def _write_u16(data: bytearray, offset: int, value: int) -> None:
    data[offset : offset + 2] = value.to_bytes(2, "little")


def _write_u32(data: bytearray, offset: int, value: int) -> None:
    data[offset : offset + 4] = value.to_bytes(4, "little")


def _va_offset(virtual_address: int) -> int:
    return SECTION_RAW + (virtual_address - IMAGE_BASE - SECTION_RVA)


def _mov_eax_ret(value: int) -> bytes:
    return b"\xb8" + value.to_bytes(4, "little") + b"\xc3"


def _mov_ax_ret(value: int) -> bytes:
    return b"\x66\xb8" + value.to_bytes(2, "little") + b"\xc3"


def _lookup_bytes(base: int, count: int) -> bytes:
    return bytes.fromhex("558bec83ec08894df88b450c25ffff00002d") + base.to_bytes(
        4, "little"
    ) + bytes.fromhex(
        "668945fc8b4df881e1ffff000083f9"
    ) + bytes([count]) + bytes.fromhex(
        "7c078b4508c700010000008b55fc81e2ffff00008b45088b4df88b5481048950088b45088338007507c70001000000eb0233c08be55dc20800"
    )


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

    families = [
        (0x0044EFF0, 0x0044F000, 0x0044F010, 0x0044F060, 0x108, 0x0200, 8),
        (0x004AA4C0, 0x004AA4D0, 0x004AA4E0, 0x004AA530, 0x41C, 0x0400, 0x43),
        (0x0048CCB0, 0x0048CCC0, 0x0048CCD0, 0x0048CD20, 0x74CC, 0x0F00, 0x20),
    ]
    for size_va, base_va, count_va, lookup_va, size, base, count in families:
        data[_va_offset(size_va) : _va_offset(size_va) + 6] = _mov_eax_ret(size)
        data[_va_offset(base_va) : _va_offset(base_va) + 5] = _mov_ax_ret(base)
        data[_va_offset(count_va) : _va_offset(count_va) + 6] = _mov_eax_ret(count)
        lookup = _lookup_bytes(base, count)
        data[_va_offset(lookup_va) : _va_offset(lookup_va) + len(lookup)] = lookup
    path.write_bytes(bytes(data))


class Logh7MessageFamilyMapTests(unittest.TestCase):
    def test_indexes_static_message_family_lookup_objects(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            temp_path = Path(temp)
            source = temp_path / "G7MTClient.exe"
            out = temp_path / "message-families.json"
            _fixture_client(source)

            result = subprocess.run(
                [sys.executable, str(TOOL), "message-family-index", str(source), "--out", str(out)],
                cwd=REPO_ROOT,
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                check=False,
            )

            self.assertEqual(result.returncode, 0, result.stderr)
            index = json.loads(out.read_text(encoding="utf-8"))
            by_name = {entry["name"]: entry for entry in index["families"]}
            self.assertEqual(by_name["session-bootstrap"]["baseInternalHex"], "0x0200")
            self.assertEqual(by_name["session-bootstrap"]["messageCount"], 8)
            self.assertEqual(by_name["session-bootstrap"]["lookupVirtualAddressHex"], "0x0044f060")
            self.assertIn("0x0205", by_name["session-bootstrap"]["trackedInternalHexes"])
            self.assertEqual(by_name["post-handshake"]["baseInternalHex"], "0x0400")
            self.assertEqual(by_name["post-handshake"]["messageCount"], 67)
            self.assertEqual(by_name["world-grid"]["baseInternalHex"], "0x0f00")
            self.assertEqual(by_name["world-grid"]["messageCount"], 32)
            self.assertIn("object+4+(internal-base)*4", index["lookupSemantics"])


if __name__ == "__main__":
    unittest.main()
