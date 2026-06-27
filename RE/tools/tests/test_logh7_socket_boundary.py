import json
import subprocess
import sys
import unittest

from tools.logh7_socket_boundary import build_socket_boundary_index
from tools.tests.test_logh7_pipeline import REPO_ROOT, TOOL


CLIENT_EXE = REPO_ROOT / ".omo" / "work" / "logh7-installed" / "exe" / "G7MTClient.exe"


class Logh7SocketBoundaryTests(unittest.TestCase):
    def test_indexes_winsock_ordinals_and_recv_callsites_from_real_client(self) -> None:
        index = build_socket_boundary_index(CLIENT_EXE)

        by_name = {entry["name"]: entry for entry in index["winsockImports"]}
        self.assertEqual(by_name["recv"]["ordinal"], 14)
        self.assertEqual(by_name["recv"]["iatHex"], "0x0066b6b0")
        self.assertEqual(by_name["recvfrom"]["ordinal"], 15)
        self.assertEqual(by_name["recvfrom"]["iatHex"], "0x0066b6c8")
        self.assertEqual(by_name["send"]["ordinal"], 19)
        self.assertEqual(by_name["send"]["iatHex"], "0x0066b6c4")
        self.assertEqual(by_name["connect"]["ordinal"], 4)
        self.assertEqual(by_name["connect"]["iatHex"], "0x0066b6cc")

        recv_sites = {site["virtualAddressHex"]: site for site in index["directCallsites"]["recv"]}
        self.assertEqual(set(recv_sites), {"0x00611aa5", "0x00611ba5", "0x00611bf6", "0x006454d1", "0x00645992", "0x00645e2b"})
        self.assertEqual(recv_sites["0x006454d1"]["role"], "phase2 inbound raw parameter receive before child-codec decode")
        self.assertEqual(recv_sites["0x00645992"]["role"], "phase3 inbound raw parameter receive before child-codec decode")
        self.assertEqual(recv_sites["0x00645e2b"]["role"], "phase4 or post-login inbound chunk receive")
        self.assertEqual(index["directCallsites"]["send"], [])
        self.assertEqual(index["nextRuntimeProbe"], "hook recv callsites 0x006454d1 and 0x00645992 after call return")

    def test_writes_socket_boundary_index_from_pipeline_cli(self) -> None:
        out = REPO_ROOT / ".omo" / "ulw-loop" / "evidence" / "g064-socket-boundary-index-cli-test.json"

        result = subprocess.run(
            [sys.executable, str(TOOL), "socket-boundary-index", str(CLIENT_EXE), "--out", str(out)],
            cwd=REPO_ROOT,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=False,
        )

        self.assertEqual(result.returncode, 0, result.stderr)
        index = json.loads(out.read_text(encoding="utf-8"))
        self.assertEqual(index["source"], str(CLIENT_EXE))
        self.assertEqual(index["winsockImports"][0]["dll"], "WS2_32.dll")
        self.assertEqual(index["directCallsites"]["recv"][3]["virtualAddressHex"], "0x006454d1")


if __name__ == "__main__":
    unittest.main()
