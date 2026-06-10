import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from test_logh7_pipeline import REPO_ROOT, TOOL
from test_logh7_transport_dispatch import _fixture_client, _va_offset, _write_u32


INTERNAL_TABLE_VA = 0x004BDE7C
TRANSPORT_QUEUE_APPEND_VA = 0x004B852B


def _write_session_handler(data: bytearray, virtual_address: int, marker: int, flag_offset: int) -> None:
    body = bytearray()
    body.extend(b"\x68" + marker.to_bytes(4, "little"))
    body.extend(bytes.fromhex("8a03"))
    body.extend(bytes.fromhex("8886") + flag_offset.to_bytes(4, "little"))
    body.extend(bytes.fromhex("c6867583350001"))
    body.extend(b"\xc3")
    data[_va_offset(virtual_address) : _va_offset(virtual_address) + len(body)] = body


def _write_transport_queue_append(data: bytearray) -> None:
    body = bytearray()
    body.extend(bytes.fromhex("8a450884c00f84db000000"))
    body.extend(bytes.fromhex("83fbff7517"))
    body.extend(bytes.fromhex("8b87c07e3500"))
    body.extend(bytes.fromhex("8d148500000000"))
    body.extend(bytes.fromhex("8b4510"))
    body.extend(bytes.fromhex("898497cc7e3500"))
    body.extend(bytes.fromhex("8b87c07e3500"))
    body.extend(bytes.fromhex("053b750400"))
    body.extend(bytes.fromhex("8d0c40"))
    body.extend(bytes.fromhex("89348f"))
    body.extend(bytes.fromhex("8b87c07e3500"))
    body.extend(bytes.fromhex("8d148500000000"))
    body.extend(bytes.fromhex("899c97c87e3500"))
    body.extend(bytes.fromhex("8b87c07e3500"))
    body.extend(bytes.fromhex("85c0754e"))
    body.extend(bytes.fromhex("8bb7cc7e3500"))
    body.extend(bytes.fromhex("a1f4257c00"))
    body.extend(bytes.fromhex("8b48448b40408b11"))
    body.extend(bytes.fromhex("56"))
    body.extend(bytes.fromhex("33f6"))
    body.extend(bytes.fromhex("668bb7c47e3500"))
    body.extend(bytes.fromhex("c745fc00000000"))
    body.extend(bytes.fromhex("5650ff5218"))
    body.extend(bytes.fromhex("8b8fc07e3500"))
    body.extend(bytes.fromhex("41"))
    body.extend(bytes.fromhex("8bc1"))
    body.extend(bytes.fromhex("83f864"))
    data[_va_offset(TRANSPORT_QUEUE_APPEND_VA) : _va_offset(TRANSPORT_QUEUE_APPEND_VA) + len(body)] = body


def _fixture_session_client(path: Path) -> None:
    _fixture_client(path)
    data = bytearray(path.read_bytes())
    _write_u32(data, _va_offset(INTERNAL_TABLE_VA), 0x004BA347)
    _write_u32(data, _va_offset(INTERNAL_TABLE_VA + (0x0205 - 0x0200) * 4), 0x004BA3AF)
    _write_session_handler(data, 0x004BA347, 0x007709FC, 0x35F252)
    _write_session_handler(data, 0x004BA3AF, 0x007709D8, 0x358384)
    _write_transport_queue_append(data)
    path.write_bytes(bytes(data))


class Logh7SessionBootstrapTests(unittest.TestCase):
    def test_indexes_session_bootstrap_transports_and_internal_handlers(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            temp_path = Path(temp)
            source = temp_path / "G7MTClient.exe"
            out = temp_path / "session-bootstrap.json"
            _fixture_session_client(source)

            result = subprocess.run(
                [
                    sys.executable,
                    str(TOOL),
                    "session-bootstrap-index",
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
            by_transport = {entry["transportHex"]: entry for entry in index["transportResponses"]}
            self.assertEqual(by_transport["0x0001"]["internalHex"], "0x0200")
            self.assertEqual(by_transport["0x0001"]["pairedInternalHex"], "0x0201")
            self.assertEqual(by_transport["0x0001"]["messageName"], "SSLoginOK")
            self.assertEqual(by_transport["0x0003"]["internalHex"], "0x0205")
            self.assertEqual(by_transport["0x0003"]["pairedInternalHex"], "0x0206")
            self.assertEqual(by_transport["0x0003"]["messageName"], "SSGameLoginOK")
            by_internal = {entry["internalHex"]: entry for entry in index["internalHandlers"]}
            self.assertEqual(by_internal["0x0200"]["stringAddressHex"], "0x007709fc")
            self.assertIn("client+0x35f252", by_internal["0x0200"]["stateWrites"])
            self.assertEqual(by_internal["0x0205"]["stringAddressHex"], "0x007709d8")
            self.assertIn("client+0x358384", by_internal["0x0205"]["stateWrites"])
            queue_schema = index["transportQueueSchema"]
            self.assertEqual(queue_schema["appendVirtualAddressHex"], "0x004b852b")
            self.assertEqual(queue_schema["runtimeManagerGlobalHex"], "0x007c25f4")
            self.assertEqual(queue_schema["countField"], "client+0x357ec0")
            self.assertEqual(queue_schema["entryStrideBytes"], 12)
            self.assertEqual(
                queue_schema["entryFields"],
                [
                    {"offset": 0, "field": "queuedInternalCode"},
                    {"offset": 4, "field": "pairedInternalCode"},
                    {"offset": 8, "field": "payloadOrContextPointer"},
                ],
            )
            self.assertEqual(queue_schema["maxQueuedEntries"], 100)
            self.assertEqual(queue_schema["firstEntryNotification"], "calls runtime manager vtable+0x18")
            self.assertEqual(
                index["nextTracePoint"],
                "instrument or emulate runtime-manager-backed queue append for low transport responses",
            )


if __name__ == "__main__":
    unittest.main()
