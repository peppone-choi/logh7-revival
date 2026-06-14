import json
import struct
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from tools.tests.test_logh7_pipeline import REPO_ROOT


TOOL = REPO_ROOT / "tools" / "logh7_launcher_update_flow.py"

IMAGE_BASE = 0x00400000
TEXT_RVA = 0x1000
TEXT_RAW = 0x400
TEXT_SIZE = 0x400
RDATA_RVA = 0x2000
RDATA_RAW = 0x800
RDATA_SIZE = 0x800


def _w16(buf: bytearray, off: int, val: int) -> None:
    buf[off : off + 2] = val.to_bytes(2, "little")


def _w32(buf: bytearray, off: int, val: int) -> None:
    buf[off : off + 4] = val.to_bytes(4, "little")


class _Rdata:
    """Appends strings/import structures, tracking each item's RVA and VA."""

    def __init__(self) -> None:
        self.buf = bytearray()

    def _va(self, rva: int) -> int:
        return IMAGE_BASE + rva

    def put_cstr(self, text: str) -> int:
        rva = RDATA_RVA + len(self.buf)
        self.buf += text.encode("ascii") + b"\0"
        return self._va(rva)

    def put_import_by_name(self, name: str) -> int:
        rva = RDATA_RVA + len(self.buf)
        self.buf += b"\0\0" + name.encode("ascii") + b"\0"  # hint(0) + name
        if len(self.buf) & 1:
            self.buf += b"\0"
        return rva

    def put_u32_array(self, values: tuple[int, ...]) -> int:
        rva = RDATA_RVA + len(self.buf)
        for value in values:
            self.buf += struct.pack("<I", value)
        return rva

    def put_descriptor(self, oft_rva: int, name_rva: int, ft_rva: int) -> int:
        rva = RDATA_RVA + len(self.buf)
        self.buf += struct.pack("<IIIII", oft_rva, 0, 0, name_rva, ft_rva)
        self.buf += struct.pack("<IIIII", 0, 0, 0, 0, 0)  # null terminator
        return rva

    def iat_slot_va(self, ft_rva: int, index: int) -> int:
        return self._va(ft_rva + index * 4)


def _push(va: int) -> bytes:
    return b"\x68" + struct.pack("<I", va)


def _call_iat(slot_va: int) -> bytes:
    return b"\xff\x15" + struct.pack("<I", slot_va)


def _fixture_update_client(path: Path) -> None:
    rdata = _Rdata()
    server_address = rdata.put_cstr("SERVER_ADDRESS")
    server_port = rdata.put_cstr("SERVER_PORT")
    default_ip = rdata.put_cstr("202.8.80.179")
    client_path = rdata.put_cstr(".\\exe\\G7MTClient.exe")
    rdata.put_cstr("%sSERVER.INI")
    update_new = rdata.put_cstr("Gin7UpdateClient.new")

    name_gpps = rdata.put_import_by_name("GetPrivateProfileStringA")
    name_wpps = rdata.put_import_by_name("WritePrivateProfileStringA")
    name_proc = rdata.put_import_by_name("CreateProcessA")
    name_move = rdata.put_import_by_name("MoveFileA")
    dll_name = rdata.put_import_by_name("KERNEL32.dll")  # reuse cstr-with-hint padding
    dll_name_rva = dll_name + 2  # skip the 2-byte hint padding to reach the raw name

    thunks = (name_gpps, name_wpps, name_proc, name_move, 0)
    ft_rva = rdata.put_u32_array(thunks)
    oft_rva = rdata.put_u32_array(thunks)
    descriptor_rva = rdata.put_descriptor(oft_rva, dll_name_rva, ft_rva)

    slot_gpps = rdata.iat_slot_va(ft_rva, 0)
    slot_wpps = rdata.iat_slot_va(ft_rva, 1)
    slot_proc = rdata.iat_slot_va(ft_rva, 2)
    slot_move = rdata.iat_slot_va(ft_rva, 3)

    code = b"".join(
        [
            _push(server_address),
            _push(server_port),
            _call_iat(slot_gpps),       # ini-read SERVER_ADDRESS/SERVER_PORT
            _push(default_ip),          # hardcoded fallback default
            _push(client_path),
            _call_iat(slot_proc),       # process-launch G7MTClient.exe
            _push(update_new),
            _call_iat(slot_move),       # file-replace Gin7UpdateClient.new
            _push(server_address),
            _call_iat(slot_wpps),       # ini-write
            b"\xc3",                    # ret
        ]
    )
    assert len(code) <= TEXT_SIZE
    assert len(rdata.buf) <= RDATA_SIZE

    total = RDATA_RAW + RDATA_SIZE
    data = bytearray(total)
    data[:2] = b"MZ"
    _w32(data, 0x3C, 0x80)
    data[0x80:0x84] = b"PE\0\0"
    _w16(data, 0x84, 0x014C)  # machine x86
    _w16(data, 0x86, 2)       # two sections
    _w16(data, 0x94, 0xE0)    # size of optional header
    _w16(data, 0x96, 0x010F)
    optional = 0x98
    _w16(data, optional, 0x10B)            # PE32
    _w32(data, optional + 16, TEXT_RVA)    # AddressOfEntryPoint
    _w32(data, optional + 28, IMAGE_BASE)  # ImageBase
    _w32(data, optional + 92, 16)          # NumberOfRvaAndSizes
    _w32(data, optional + 96 + 8, descriptor_rva)      # DataDirectory[1].VirtualAddress
    _w32(data, optional + 96 + 12, 40)                 # DataDirectory[1].Size

    text_hdr = optional + 0xE0
    data[text_hdr : text_hdr + 8] = b".text\0\0\0"
    _w32(data, text_hdr + 8, TEXT_SIZE)
    _w32(data, text_hdr + 12, TEXT_RVA)
    _w32(data, text_hdr + 16, TEXT_SIZE)
    _w32(data, text_hdr + 20, TEXT_RAW)

    rdata_hdr = text_hdr + 40
    data[rdata_hdr : rdata_hdr + 8] = b".rdata\0\0"
    _w32(data, rdata_hdr + 8, RDATA_SIZE)
    _w32(data, rdata_hdr + 12, RDATA_RVA)
    _w32(data, rdata_hdr + 16, RDATA_SIZE)
    _w32(data, rdata_hdr + 20, RDATA_RAW)

    data[TEXT_RAW : TEXT_RAW + len(code)] = code
    data[RDATA_RAW : RDATA_RAW + len(rdata.buf)] = rdata.buf
    path.write_bytes(bytes(data))


class Logh7LauncherUpdateFlowTests(unittest.TestCase):
    def test_classifies_ini_override_launch_and_update_replacement(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            _fixture_update_client(root / "Gin7UpdateClient.exe")
            out = root / "launcher-update-flow.json"

            result = subprocess.run(
                [sys.executable, str(TOOL), str(root), "--out", str(out)],
                cwd=REPO_ROOT,
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                check=False,
            )

            self.assertEqual(result.returncode, 0, result.stderr)
            flow = json.loads(out.read_text(encoding="utf-8"))

            self.assertEqual(flow["summary"]["scannedBinaries"], 1)
            self.assertEqual(flow["summary"]["missingBinaries"], 2)
            self.assertTrue(flow["summary"]["serverIniOverride"])
            self.assertTrue(flow["summary"]["processLaunch"])
            self.assertTrue(flow["summary"]["updateFileReplacement"])

            entry = flow["binaries"][0]
            self.assertEqual(entry["path"], "Gin7UpdateClient.exe")
            self.assertEqual(entry["role"], "update-client")

            policy = entry["serverAddressPolicy"]
            self.assertTrue(policy["iniOverridesHardcoded"])
            self.assertEqual(policy["addressKey"], "SERVER_ADDRESS")
            self.assertEqual(policy["portKey"], "SERVER_PORT")
            self.assertEqual(policy["hardcodedDefault"], "202.8.80.179")
            self.assertIn("GetPrivateProfileStringA", "".join(policy["iniReadImports"]))

            launch = entry["clientLaunch"]
            self.assertTrue(launch["launchesClient"])
            self.assertEqual(launch["clientPath"], ".\\exe\\G7MTClient.exe")
            self.assertEqual(len(launch["createProcessVaHexes"]), 1)

            update = entry["updateReplacement"]
            self.assertTrue(update["replacesUpdateFiles"])
            self.assertEqual(update["replacementFile"], "Gin7UpdateClient.new")

    def test_missing_directory_reports_all_binaries_missing(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            out = root / "flow.json"
            result = subprocess.run(
                [sys.executable, str(TOOL), str(root), "--out", str(out)],
                cwd=REPO_ROOT,
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                check=False,
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            flow = json.loads(out.read_text(encoding="utf-8"))
            self.assertEqual(flow["summary"]["scannedBinaries"], 0)
            self.assertEqual(flow["summary"]["missingBinaries"], 3)
            self.assertFalse(flow["summary"]["serverIniOverride"])


if __name__ == "__main__":
    unittest.main()
