import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from test_logh7_transport_dispatch import IMAGE_BASE, SECTION_RAW, SECTION_RVA, SECTION_SIZE, _va_offset, _write_u16, _write_u32
from test_logh7_pipeline import REPO_ROOT, TOOL


def _fixture_client(path: Path) -> None:
    raw_size = SECTION_SIZE * 24
    data = bytearray(SECTION_RAW + raw_size)
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
    _write_u32(data, section + 8, raw_size)
    _write_u32(data, section + 12, SECTION_RVA)
    _write_u32(data, section + 16, raw_size)
    _write_u32(data, section + 20, SECTION_RAW)

    data[_va_offset(0x004BA457) : _va_offset(0x004BA457) + 91] = bytes.fromhex(
        "687c097700e8"
        "00000000"
        "8b0b83c404c745e8ffffffff898e18244300ff1568b666008bf889be"
        "b07e35008b8eac7e35003bf976048bc1eb0233c08986a87e35008b86"
        "182443008b8eb87e35003bc1"
    )
    data[_va_offset(0x004BA316) : _va_offset(0x004BA316) + 42] = bytes.fromhex(
        "8b450825ffff00003d010300008945c80f8f06020000"
        "0f84"
        "25010000"
        "05fffdffff83f8060f87"
        "ae390000"
    )
    data[_va_offset(0x00511AE0) : _va_offset(0x00511AE0) + 170] = bytes.fromhex(
        "817c247c0c0400000f85"
        "00000000"
        "8b8424e800000085c00f8f"
        "00000000"
        "8bbc248800000033c98a8f0a0300006a006aff6aff515a6a018bce"
        "e800000000508bcee80000000033d28a970b0300006a006aff6aff"
        "525b6a018bcee800000000508bcee80000000033c08a8712030000"
        "6a006aff6aff506a046a018bcee800000000508bcee800000000"
    )
    data[_va_offset(0x004C1949) : _va_offset(0x004C1949) + 58] = bytes.fromhex(
        "8b0d2c5e21028b490c6a36e8000000008d542430528bf06a006a008bce"
        "c74424680c040000c744246c00000000e800000000506a168bcee800000000"
    )
    path.write_bytes(bytes(data))


class Logh7InternalHandlersTests(unittest.TestCase):
    def test_indexes_post_handshake_internal_handler_evidence(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            temp_path = Path(temp)
            source = temp_path / "G7MTClient.exe"
            out = temp_path / "handlers.json"
            _fixture_client(source)

            result = subprocess.run(
                [sys.executable, str(TOOL), "post-handshake-handler-index", str(source), "--out", str(out)],
                cwd=REPO_ROOT,
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                check=False,
            )

            self.assertEqual(result.returncode, 0, result.stderr)
            index = json.loads(out.read_text(encoding="utf-8"))
            by_name = {entry["name"]: entry for entry in index["entries"]}
            self.assertEqual(
                by_name["internal-0x0300-dispatch-route"],
                {
                    "name": "internal-0x0300-dispatch-route",
                    "virtualAddressHex": "0x004ba316",
                    "internalHex": "0x0300",
                    "transportHex": "0x0030",
                    "pairedAckInternalHex": "0x0301",
                    "directHandlerVirtualAddressHex": None,
                    "routeConclusion": "queued request side; no direct 0x0300 payload handler in internal dispatch",
                    "evidence": "real internal dispatch around 0x004ba316",
                },
            )
            self.assertEqual(by_name["internal-0x0301-ack-handler"]["payloadReads"], ["body+0x00 dword"])
            self.assertEqual(
                by_name["internal-0x0301-ack-handler"]["stateWrites"],
                ["client+0x432418", "client+0x357eb0", "client+0x357ea8"],
            )
            self.assertEqual(by_name["internal-0x040c-phase4-builder"]["transportHex"], "0x0036")
            self.assertEqual(by_name["internal-0x040c-phase4-builder"]["serializedClientOffsets"][:3], ["0x30a", "0x30b", "0x312"])
            self.assertEqual(by_name["internal-0x040c-send-trigger"]["queuedInternalHex"], "0x040c")


if __name__ == "__main__":
    unittest.main()
