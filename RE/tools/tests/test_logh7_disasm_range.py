from __future__ import annotations

import json
import subprocess
import sys
import unittest
from pathlib import Path


CLIENT_EXE = Path(".omo/ghidra/bin/G7MTClient.exe")


class Logh7DisasmRangeTests(unittest.TestCase):
    def test_disassembles_known_camera_selection_helper_range(self) -> None:
        from tools.logh7_disasm_range import disassemble_range

        instructions = disassemble_range(CLIENT_EXE, start_va=0x004F6EE0, size=0x40)

        self.assertEqual(instructions[0].address, 0x004F6EE0)
        self.assertEqual(instructions[0].mnemonic, "push")
        self.assertEqual(instructions[0].op_str, "ebx")
        self.assertTrue(any(ins.mnemonic == "call" and ins.op_str == "0x4f6f20" for ins in instructions))

    def test_cli_json_outputs_address_and_call_target(self) -> None:
        result = subprocess.run(
            [
                sys.executable,
                "tools/logh7_disasm_range.py",
                str(CLIENT_EXE),
                "--range",
                "0x004f6ee0:+0x40",
                "--json",
            ],
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=False,
        )

        self.assertEqual(result.returncode, 0, result.stderr)
        payload = json.loads(result.stdout)
        self.assertEqual(payload["range"]["startVa"], "0x004f6ee0")
        self.assertTrue(any(row["opStr"] == "0x4f6f20" for row in payload["instructions"]))

    def test_finds_absolute_memory_references_in_known_command_renderer(self) -> None:
        from tools.logh7_disasm_range import find_absolute_memory_references

        references = find_absolute_memory_references(
            CLIENT_EXE,
            start_va=0x0057BBC0,
            size=0x140,
            targets=frozenset({0x00C9EABC, 0x00C9EAC0}),
        )

        self.assertTrue(any(ref.address == 0x0057BC87 and ref.target_va == 0x00C9EABC for ref in references))
        self.assertTrue(any(ref.address == 0x0057BC95 and ref.target_va == 0x00C9EAC0 for ref in references))


if __name__ == "__main__":
    unittest.main()
