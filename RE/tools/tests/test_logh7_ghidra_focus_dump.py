import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from tools.logh7_ghidra_focus_dump import (
    FOCUS_FUNCTIONS,
    build_focus_plan,
    build_headless_command,
    build_process_command,
    write_focus_script,
)
from tools.tests.test_logh7_pipeline import REPO_ROOT


CLIENT_EXE = REPO_ROOT / ".omo" / "work" / "logh7-installed" / "exe" / "G7MTClient.exe"


class Logh7GhidraFocusDumpTests(unittest.TestCase):
    @unittest.skipUnless(CLIENT_EXE.exists(), "installed G7MTClient.exe is required")
    def test_builds_focus_plan_for_installed_client(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            temp_path = Path(temp)
            plan = build_focus_plan(
                CLIENT_EXE,
                project_dir=temp_path / "project",
                output_path=temp_path / "focus.json",
                script_dir=temp_path / "scripts",
                environ={},
            )

        self.assertEqual(plan["binary"]["imageBaseHex"], "0x00400000")
        self.assertEqual(plan["binary"]["sha256Bytes"], 32)
        addresses = {item["virtualAddressHex"] for item in plan["focusFunctions"]}
        self.assertIn("0x00612357", addresses)
        self.assertIn("0x004ac700", addresses)
        self.assertIn("0x004ad780", addresses)
        self.assertIn("available", plan["headless"])
        self.assertIn("analyzeHeadless", plan["headless"]["commandPreview"])

    def test_writes_headless_ghidra_script_with_focus_addresses(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            script = write_focus_script(Path(temp))
            content = script.read_text(encoding="utf-8")

        self.assertEqual(script.name, "Logh7FocusDump.java")
        self.assertIn("class Logh7FocusDump extends GhidraScript", content)
        self.assertIn("DecompInterface", content)
        self.assertIn("getCalledFunctions", content)
        self.assertIn("0x004ac700", " ".join(item.virtual_address_hex for item in FOCUS_FUNCTIONS))

    def test_builds_headless_command_from_explicit_path(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            temp_path = Path(temp)
            headless = temp_path / "analyzeHeadless.bat"
            command = build_headless_command(
                headless,
                binary=CLIENT_EXE,
                project_dir=temp_path / "project",
                project_name="logh7-focus",
                script_dir=temp_path / "scripts",
                output_path=temp_path / "focus.json",
            )

        self.assertEqual(command[0], str(headless))
        self.assertIn("-postScript", command)
        self.assertIn("Logh7FocusDump.java", command)
        self.assertIn("0x00612357:postKeyMessageInputCall", command)
        self.assertIn("0x004ac700:loginProcessorHandleMessage", command)

    def test_builds_process_command_for_existing_project(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            temp_path = Path(temp)
            command = build_process_command(
                temp_path / "analyzeHeadless.bat",
                project_dir=temp_path / "project",
                project_name="logh7-focus",
                script_dir=temp_path / "scripts",
                output_path=temp_path / "focus.json",
            )

        self.assertIn("-process", command)
        self.assertNotIn("-import", command)
        self.assertIn("G7MTClient.exe", command)
        self.assertIn("0x006140c0:keySetupWrapper", command)

    @unittest.skipUnless(CLIENT_EXE.exists(), "installed G7MTClient.exe is required")
    def test_plan_cli_writes_json_and_script(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            temp_path = Path(temp)
            plan_path = temp_path / "plan.json"
            result = subprocess.run(
                [
                    sys.executable,
                    "-m",
                    "tools.logh7_ghidra_focus_dump",
                    "plan",
                    str(CLIENT_EXE),
                    "--project-dir",
                    str(temp_path / "project"),
                    "--script-dir",
                    str(temp_path / "scripts"),
                    "--out",
                    str(plan_path),
                ],
                cwd=REPO_ROOT,
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                check=False,
            )

            self.assertEqual(result.returncode, 0, result.stderr)
            plan = json.loads(plan_path.read_text(encoding="utf-8"))
            self.assertEqual(plan["script"]["name"], "Logh7FocusDump.java")
            self.assertTrue((temp_path / "scripts" / "Logh7FocusDump.java").exists())
            self.assertEqual(plan["focusFunctions"][0]["virtualAddressHex"], "0x00612357")


if __name__ == "__main__":
    unittest.main()
