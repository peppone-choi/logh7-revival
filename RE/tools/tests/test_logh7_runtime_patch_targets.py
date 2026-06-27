import json
import subprocess
import sys
import unittest
from pathlib import Path

from tools.logh7_runtime_patch_targets import extract_runtime_patch_targets


REPO_ROOT = Path(__file__).resolve().parents[2]
CLIENT_EXE = REPO_ROOT / ".omo" / "work" / "logh7-installed" / "exe" / "G7MTClient.exe"
TOOL = REPO_ROOT / "tools" / "logh7_pipeline.py"


class Logh7RuntimePatchTargetTests(unittest.TestCase):
    def test_extracts_key_helper_patch_targets_from_real_client(self) -> None:
        targets = extract_runtime_patch_targets(CLIENT_EXE)

        by_name = {target.name: target for target in targets}
        self.assertEqual(
            set(by_name),
            {
                "keySetupWrapper",
                "keyStoreHelper",
                "keyReadHelper",
                "childCodecEncode",
                "phase1ChildEncodePostCall",
                "phase3CompareCallsite",
                "runtimeManagerGlobalStore",
                "runtimeManagerGlobalClear",
                "runtimeManagerDestructorEntry",
                "runtimeManagerCleanupLoopEntry",
                "runtimeManagerRegisteredCallback",
                "runtimeManagerStateEventCallback",
                "runtimeManagerStateFollowupCallback",
                "runtimeManagerFlagThreeDispatcher",
                "runtimeManagerFlagZeroDispatcher",
                "runtimeManagerNestedCallbackWalker",
                "runtimeManagerStateTriggerCallback",
                "stateTriggerMemberSlot14",
                "stateTriggerMemberSlotDispatchCall",
                "stateTriggerMemberSlotSuccessTail",
                "lowTransportQueueAppend",
                "lowTransportQueueAppendStore",
            },
        )
        self.assertEqual(by_name["keySetupWrapper"].virtual_address, 0x006140C0)
        self.assertEqual(by_name["keySetupWrapper"].file_offset, 0x002140C0)
        self.assertEqual(by_name["keySetupWrapper"].original_hex, "53558b6c240c56578b7c24188bf15755")
        self.assertEqual(by_name["keyStoreHelper"].virtual_address, 0x00614810)
        self.assertEqual(by_name["keyStoreHelper"].original_hex, "53558be98b450485c0740950e84a4503")
        self.assertEqual(by_name["keyReadHelper"].virtual_address, 0x006148A0)
        self.assertEqual(by_name["keyReadHelper"].original_hex, "538bd9558b430485c075075d32c05bc2")
        self.assertEqual(by_name["childCodecEncode"].virtual_address, 0x00614100)
        self.assertEqual(by_name["childCodecEncode"].original_hex, "51538b5c24105556f6c307578be98bc3")
        self.assertEqual(by_name["phase1ChildEncodePostCall"].virtual_address, 0x006452CC)
        self.assertEqual(by_name["phase1ChildEncodePostCall"].file_offset, 0x002452CC)
        self.assertEqual(by_name["phase1ChildEncodePostCall"].original_hex, "8b4c24148ad851e8933a000056e88d3a")
        self.assertEqual(by_name["phase3CompareCallsite"].virtual_address, 0x00645792)
        self.assertEqual(by_name["phase3CompareCallsite"].original_hex, "ff5008663b6c241c74326814067c0068")
        self.assertEqual(by_name["runtimeManagerGlobalStore"].virtual_address, 0x004AD94F)
        self.assertEqual(by_name["runtimeManagerGlobalStore"].file_offset, 0x000AD94F)
        self.assertEqual(by_name["runtimeManagerGlobalStore"].original_hex, "892df4257c00558d4c2424c6453000c6")
        self.assertIn("runtime manager global", by_name["runtimeManagerGlobalStore"].role)
        self.assertEqual(by_name["runtimeManagerGlobalClear"].virtual_address, 0x004ADB09)
        self.assertEqual(by_name["runtimeManagerGlobalClear"].file_offset, 0x000ADB09)
        self.assertEqual(by_name["runtimeManagerGlobalClear"].original_hex, "c705f4257c0000000000896c2410c745")
        self.assertIn("clears runtime manager global", by_name["runtimeManagerGlobalClear"].role)
        self.assertEqual(by_name["runtimeManagerDestructorEntry"].virtual_address, 0x004ADAA0)
        self.assertEqual(by_name["runtimeManagerDestructorEntry"].file_offset, 0x000ADAA0)
        self.assertEqual(by_name["runtimeManagerDestructorEntry"].original_hex, "568bf1e818000000f644240801740956")
        self.assertIn("virtual destructor wrapper entry", by_name["runtimeManagerDestructorEntry"].role)
        self.assertEqual(by_name["runtimeManagerCleanupLoopEntry"].virtual_address, 0x004ADCE0)
        self.assertEqual(by_name["runtimeManagerCleanupLoopEntry"].file_offset, 0x000ADCE0)
        self.assertEqual(by_name["runtimeManagerCleanupLoopEntry"].original_hex, "5556578b7c24108b6f248b75003bf574")
        self.assertIn("cleanup loop entry", by_name["runtimeManagerCleanupLoopEntry"].role)
        self.assertEqual(by_name["runtimeManagerRegisteredCallback"].virtual_address, 0x004ADD60)
        self.assertEqual(by_name["runtimeManagerRegisteredCallback"].file_offset, 0x000ADD60)
        self.assertEqual(by_name["runtimeManagerRegisteredCallback"].original_hex, "558bec6aff683023660064a100000000")
        self.assertIn("registered cleanup callback", by_name["runtimeManagerRegisteredCallback"].role)
        self.assertEqual(by_name["runtimeManagerStateEventCallback"].virtual_address, 0x004ADF60)
        self.assertEqual(by_name["runtimeManagerStateEventCallback"].file_offset, 0x000ADF60)
        self.assertEqual(by_name["runtimeManagerStateEventCallback"].original_hex, "8b44240885c0750f8b4c2404b0018841")
        self.assertIn("sets manager+0x30", by_name["runtimeManagerStateEventCallback"].role)
        self.assertEqual(by_name["runtimeManagerStateFollowupCallback"].virtual_address, 0x004ADFD0)
        self.assertEqual(by_name["runtimeManagerStateFollowupCallback"].file_offset, 0x000ADFD0)
        self.assertEqual(by_name["runtimeManagerStateFollowupCallback"].original_hex, "8b44240885c05675658b7424088b4e40")
        self.assertIn("follow-up callback", by_name["runtimeManagerStateFollowupCallback"].role)
        self.assertEqual(by_name["runtimeManagerFlagThreeDispatcher"].virtual_address, 0x004AC350)
        self.assertEqual(by_name["runtimeManagerFlagThreeDispatcher"].file_offset, 0x000AC350)
        self.assertEqual(by_name["runtimeManagerFlagThreeDispatcher"].original_hex, "83ec10535556578b7c24248a87aa0000")
        self.assertIn("flag 3 state callback dispatcher", by_name["runtimeManagerFlagThreeDispatcher"].role)
        self.assertEqual(by_name["runtimeManagerFlagZeroDispatcher"].virtual_address, 0x004AC2C0)
        self.assertEqual(by_name["runtimeManagerFlagZeroDispatcher"].file_offset, 0x000AC2C0)
        self.assertEqual(by_name["runtimeManagerFlagZeroDispatcher"].original_hex, "5556578b7c24108b6f348b75003bf574")
        self.assertIn("flag 0 state callback dispatcher", by_name["runtimeManagerFlagZeroDispatcher"].role)
        self.assertEqual(by_name["runtimeManagerNestedCallbackWalker"].virtual_address, 0x004AB6A0)
        self.assertEqual(by_name["runtimeManagerNestedCallbackWalker"].file_offset, 0x000AB6A0)
        self.assertEqual(by_name["runtimeManagerNestedCallbackWalker"].original_hex, "83ec145355568b7424248b4e1857e8ed")
        self.assertIn("nested callback-list walker", by_name["runtimeManagerNestedCallbackWalker"].role)
        self.assertEqual(by_name["runtimeManagerStateTriggerCallback"].virtual_address, 0x004AC430)
        self.assertEqual(by_name["runtimeManagerStateTriggerCallback"].file_offset, 0x000AC430)
        self.assertEqual(by_name["runtimeManagerStateTriggerCallback"].original_hex, "8b44240885c05355565775258b442414")
        self.assertIn("sets manager+0xaa", by_name["runtimeManagerStateTriggerCallback"].role)
        self.assertEqual(by_name["stateTriggerMemberSlot14"].virtual_address, 0x00402880)
        self.assertEqual(by_name["stateTriggerMemberSlot14"].file_offset, 0x00002880)
        self.assertEqual(by_name["stateTriggerMemberSlot14"].original_hex, "64a1000000006aff68f6a56500506489")
        self.assertIn("member44 vtable slot", by_name["stateTriggerMemberSlot14"].role)
        self.assertEqual(by_name["stateTriggerMemberSlotDispatchCall"].virtual_address, 0x00402995)
        self.assertEqual(by_name["stateTriggerMemberSlotDispatchCall"].file_offset, 0x00002995)
        self.assertEqual(by_name["stateTriggerMemberSlotDispatchCall"].original_hex, "e8c607000068287a74008d54242c52c7")
        self.assertIn("dispatch call", by_name["stateTriggerMemberSlotDispatchCall"].role)
        self.assertEqual(by_name["stateTriggerMemberSlotSuccessTail"].virtual_address, 0x004029B8)
        self.assertEqual(by_name["stateTriggerMemberSlotSuccessTail"].file_offset, 0x000029B8)
        self.assertEqual(by_name["stateTriggerMemberSlotSuccessTail"].original_hex, "8b8c24d400000055e80bfa20008b0655")
        self.assertIn("success tail", by_name["stateTriggerMemberSlotSuccessTail"].role)
        self.assertEqual(by_name["lowTransportQueueAppend"].virtual_address, 0x004B852B)
        self.assertEqual(by_name["lowTransportQueueAppend"].file_offset, 0x000B852B)
        self.assertEqual(by_name["lowTransportQueueAppend"].original_hex, "8a450884c00f84db00000083fbff7517")
        self.assertIn("pending response queue", by_name["lowTransportQueueAppend"].role)
        self.assertEqual(by_name["lowTransportQueueAppendStore"].virtual_address, 0x004B8552)
        self.assertEqual(by_name["lowTransportQueueAppendStore"].file_offset, 0x000B8552)
        self.assertEqual(by_name["lowTransportQueueAppendStore"].original_hex, "8b87c07e35008d14408b4510898497cc")
        self.assertIn("store block", by_name["lowTransportQueueAppendStore"].role)
        self.assertEqual(by_name["keySetupWrapper"].patch_strategy, "file-backed instrumentation guard")

    def test_writes_runtime_patch_targets_from_pipeline_cli(self) -> None:
        out = REPO_ROOT / ".omo" / "ulw-loop" / "evidence" / "g005-runtime-patch-targets-cli-test.json"

        result = subprocess.run(
            [sys.executable, str(TOOL), "runtime-patch-targets", str(CLIENT_EXE), "--out", str(out)],
            cwd=REPO_ROOT,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=False,
        )

        self.assertEqual(result.returncode, 0, result.stderr)
        index = json.loads(out.read_text(encoding="utf-8"))
        self.assertEqual(index["purpose"], "guarded file-backed instrumentation targets for non-debugger runtime key extraction")
        self.assertEqual(index["targets"][0]["name"], "keySetupWrapper")
        self.assertEqual(index["targets"][0]["fileOffsetHex"], "0x002140c0")
        by_name = {target["name"]: target for target in index["targets"]}
        self.assertEqual(by_name["runtimeManagerGlobalStore"]["virtualAddressHex"], "0x004ad94f")
        self.assertEqual(by_name["runtimeManagerGlobalStore"]["fileOffsetHex"], "0x000ad94f")
        self.assertEqual(by_name["runtimeManagerGlobalClear"]["virtualAddressHex"], "0x004adb09")
        self.assertEqual(by_name["runtimeManagerGlobalClear"]["fileOffsetHex"], "0x000adb09")
        self.assertEqual(by_name["runtimeManagerDestructorEntry"]["virtualAddressHex"], "0x004adaa0")
        self.assertEqual(by_name["runtimeManagerDestructorEntry"]["fileOffsetHex"], "0x000adaa0")
        self.assertEqual(by_name["runtimeManagerCleanupLoopEntry"]["virtualAddressHex"], "0x004adce0")
        self.assertEqual(by_name["runtimeManagerCleanupLoopEntry"]["fileOffsetHex"], "0x000adce0")
        self.assertEqual(by_name["runtimeManagerRegisteredCallback"]["virtualAddressHex"], "0x004add60")
        self.assertEqual(by_name["runtimeManagerRegisteredCallback"]["fileOffsetHex"], "0x000add60")
        self.assertEqual(by_name["runtimeManagerStateEventCallback"]["virtualAddressHex"], "0x004adf60")
        self.assertEqual(by_name["runtimeManagerStateEventCallback"]["fileOffsetHex"], "0x000adf60")
        self.assertEqual(by_name["runtimeManagerStateFollowupCallback"]["virtualAddressHex"], "0x004adfd0")
        self.assertEqual(by_name["runtimeManagerStateFollowupCallback"]["fileOffsetHex"], "0x000adfd0")
        self.assertEqual(by_name["runtimeManagerFlagThreeDispatcher"]["virtualAddressHex"], "0x004ac350")
        self.assertEqual(by_name["runtimeManagerFlagThreeDispatcher"]["fileOffsetHex"], "0x000ac350")
        self.assertEqual(by_name["runtimeManagerFlagZeroDispatcher"]["virtualAddressHex"], "0x004ac2c0")
        self.assertEqual(by_name["runtimeManagerFlagZeroDispatcher"]["fileOffsetHex"], "0x000ac2c0")
        self.assertEqual(by_name["runtimeManagerNestedCallbackWalker"]["virtualAddressHex"], "0x004ab6a0")
        self.assertEqual(by_name["runtimeManagerNestedCallbackWalker"]["fileOffsetHex"], "0x000ab6a0")
        self.assertEqual(by_name["runtimeManagerStateTriggerCallback"]["virtualAddressHex"], "0x004ac430")
        self.assertEqual(by_name["runtimeManagerStateTriggerCallback"]["fileOffsetHex"], "0x000ac430")
        self.assertEqual(by_name["stateTriggerMemberSlot14"]["virtualAddressHex"], "0x00402880")
        self.assertEqual(by_name["stateTriggerMemberSlot14"]["fileOffsetHex"], "0x00002880")
        self.assertEqual(by_name["stateTriggerMemberSlotDispatchCall"]["virtualAddressHex"], "0x00402995")
        self.assertEqual(by_name["stateTriggerMemberSlotDispatchCall"]["fileOffsetHex"], "0x00002995")
        self.assertEqual(by_name["stateTriggerMemberSlotSuccessTail"]["virtualAddressHex"], "0x004029b8")
        self.assertEqual(by_name["stateTriggerMemberSlotSuccessTail"]["fileOffsetHex"], "0x000029b8")
        self.assertEqual(by_name["lowTransportQueueAppend"]["virtualAddressHex"], "0x004b852b")
        self.assertEqual(by_name["lowTransportQueueAppend"]["fileOffsetHex"], "0x000b852b")
        self.assertEqual(by_name["lowTransportQueueAppendStore"]["virtualAddressHex"], "0x004b8552")
        self.assertEqual(by_name["lowTransportQueueAppendStore"]["fileOffsetHex"], "0x000b8552")
        self.assertEqual(index["probePlan"]["codeCave"]["virtualAddressHex"], "0x0066acd5")
        self.assertEqual(index["probePlan"]["codeCave"]["fileOffsetHex"], "0x0026acd5")
        self.assertGreaterEqual(index["probePlan"]["codeCave"]["lengthBytes"], 256)
        self.assertEqual(index["probePlan"]["imports"]["CreateFileA"], "0x0066b1d0")
        self.assertEqual(index["probePlan"]["imports"]["WriteFile"], "0x0066b1c4")
        self.assertEqual(index["probePlan"]["imports"]["SetFilePointer"], "0x0066b2cc")
        self.assertEqual(index["probePlan"]["imports"]["CloseHandle"], "0x0066b1dc")


if __name__ == "__main__":
    unittest.main()
