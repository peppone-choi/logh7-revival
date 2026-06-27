import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from tools.logh7_runtime_manager import build_runtime_manager_index

from tools.tests.test_logh7_pipeline import REPO_ROOT, TOOL


CLIENT_EXE = REPO_ROOT / ".omo" / "work" / "logh7-installed" / "exe" / "G7MTClient.exe"


class Logh7RuntimeManagerTests(unittest.TestCase):
    def test_indexes_runtime_manager_global_lifecycle_from_real_client(self) -> None:
        index = build_runtime_manager_index(CLIENT_EXE)

        self.assertEqual(index["runtimeManagerGlobalHex"], "0x007c25f4")
        self.assertEqual(index["constructor"]["globalStoreVirtualAddressHex"], "0x004ad94f")
        self.assertEqual(index["constructor"]["storedRegister"], "ebp")
        self.assertEqual(index["constructor"]["allocationCallVirtualAddressHex"], "0x00612570")
        self.assertEqual(index["constructor"]["allocationSizeHex"], "0x00007530")
        self.assertEqual(index["constructor"]["postRegisterCallbacks"][0]["callbackVirtualAddressHex"], "0x004adeb0")
        self.assertEqual(index["destructor"]["globalClearVirtualAddressHex"], "0x004adb09")
        self.assertEqual(index["destructor"]["wrapperVirtualAddressHex"], "0x004adaa0")
        self.assertEqual(index["destructor"]["bodyVirtualAddressHex"], "0x004adac0")
        self.assertEqual(index["destructor"]["directBodyCalls"][0]["callVirtualAddressHex"], "0x004adaa3")
        self.assertEqual(index["destructor"]["directBodyCalls"][0]["targetVirtualAddressHex"], "0x004adac0")
        self.assertEqual(index["destructor"]["preClearShutdownCall"]["callVirtualAddressHex"], "0x004adb01")
        self.assertEqual(index["destructor"]["preClearShutdownCall"]["targetVirtualAddressHex"], "0x00403c50")
        self.assertEqual(index["vtableBindings"][0]["vtableVirtualAddressHex"], "0x0066e0fc")
        self.assertEqual(index["vtableBindings"][0]["slot0VirtualAddressHex"], "0x004adaa0")
        self.assertEqual(index["cleanupLoop"]["entryVirtualAddressHex"], "0x004adce0")
        self.assertEqual(index["cleanupLoop"]["listHeadOffsetHex"], "0x00000024")
        self.assertEqual(index["cleanupLoop"]["callbackPointerOffsetHex"], "0x00000010")
        self.assertEqual(index["cleanupLoop"]["selfDeleteGateOffsetHex"], "0x00000032")
        self.assertEqual(index["cleanupLoop"]["virtualDestructorCallVirtualAddressHex"], "0x004add4e")
        self.assertEqual(index["cleanupLoop"]["virtualDestructorReturnAddressHex"], "0x004add50")
        self.assertEqual(index["cleanupLoop"]["registeredCallbackVirtualAddressHex"], "0x004add60")
        self.assertEqual(index["cleanupLoop"]["registeredCallbackPushVirtualAddressHex"], "0x004ad97b")
        self.assertEqual(index["registeredCallbackGate"]["callbackVirtualAddressHex"], "0x004add60")
        self.assertEqual(index["registeredCallbackGate"]["stateGateOffsetHex"], "0x00000030")
        self.assertEqual(index["registeredCallbackGate"]["gateReadVirtualAddressHex"], "0x004add81")
        self.assertEqual(index["registeredCallbackGate"]["zeroBranchVirtualAddressHex"], "0x004add8e")
        self.assertEqual(index["registeredCallbackGate"]["constructorZeroVirtualAddressHex"], "0x004ad95a")
        self.assertEqual(index["registeredCallbackGate"]["callbackResetVirtualAddressHex"], "0x004addb0")
        self.assertEqual(index["registeredCallbackGate"]["member40HelperCalls"][0]["targetVirtualAddressHex"], "0x006122c0")
        self.assertEqual(index["registeredCallbackGate"]["member40HelperCalls"][1]["targetVirtualAddressHex"], "0x006122a0")
        self.assertEqual(index["registeredCallbackGate"]["member40HelperCalls"][2]["targetVirtualAddressHex"], "0x006122b0")
        self.assertEqual(index["registeredCallbackGate"]["directSetToOneCandidates"], [])
        self.assertEqual(index["registeredCallbackGate"]["stateSetters"][0]["callbackVirtualAddressHex"], "0x004adf60")
        self.assertEqual(index["registeredCallbackGate"]["stateSetters"][0]["setVirtualAddressHex"], "0x004adf6e")
        self.assertEqual(index["registeredCallbackGate"]["stateSetters"][0]["stateValue"], 1)
        self.assertEqual(index["registeredCallbackGate"]["stateSetters"][0]["flagArgument"], "[esp+0x08]")
        self.assertEqual(index["registeredCallbackGate"]["stateSetters"][1]["callbackVirtualAddressHex"], "0x004adfd0")
        self.assertEqual(index["registeredCallbackGate"]["stateSetters"][1]["setVirtualAddressHex"], "0x004adfe3")
        self.assertEqual(index["registeredCallbackGate"]["stateSetters"][1]["member40HelperCalls"][0]["targetVirtualAddressHex"], "0x00612510")
        self.assertEqual(index["registeredCallbackGate"]["stateClearers"][0]["setVirtualAddressHex"], "0x004adc12")
        dispatcher = index["registeredCallbackGate"]["stateCallbackDispatcher"]
        self.assertEqual(dispatcher["entryVirtualAddressHex"], "0x004ac350")
        self.assertEqual(dispatcher["callbackInvokeVirtualAddressHex"], "0x004ac3bf")
        self.assertEqual(dispatcher["returnAddressAfterCallbackHex"], "0x004ac3c1")
        self.assertEqual(dispatcher["stateCallbackListOffsetHex"], "0x00000024")
        self.assertEqual(dispatcher["activeGateOffsetHex"], "0x000000aa")
        self.assertEqual(dispatcher["payloadFlagLiteral"], 3)
        self.assertEqual(dispatcher["payloadFlagStoreVirtualAddressHex"], "0x004ac3a4")
        self.assertEqual(dispatcher["runtimeObservation"], "G054 observed returnAddress=0x004ac3c1 flagArg=3")
        self.assertEqual(index["dispatchTailPrerequisite"]["dispatchTailVirtualAddressHex"], "0x004b78ef")
        self.assertEqual(index["dispatchTailPrerequisite"]["appendEntryVirtualAddressHex"], "0x004b852b")
        member_slot = index["stateTriggerMemberSlotEffect"]
        self.assertEqual(member_slot["entryVirtualAddressHex"], "0x00402880")
        self.assertEqual(member_slot["thisRegister"], "ecx")
        self.assertEqual(member_slot["allocationCallVirtualAddressHex"], "0x004028a5")
        self.assertEqual(member_slot["allocationVtableSlotHex"], "0x00000008")
        self.assertEqual(member_slot["allocatedHandleWriteOffsetHex"], "0x00000006")
        self.assertEqual(member_slot["arg1StackOffsetAfterPrologueHex"], "0x000000d4")
        self.assertEqual(member_slot["arg2StackOffsetAfterPrologueHex"], "0x000000d8")
        self.assertEqual(member_slot["arg3StackOffsetAfterPrologueHex"], "0x000000dc")
        self.assertEqual(member_slot["observedArg2LiteralHex"], "0x00007000")
        self.assertEqual(member_slot["stringFormatCallVirtualAddressHex"], "0x004028ed")
        self.assertEqual(member_slot["formatStringVirtualAddressHex"], "0x0075e888")
        self.assertEqual(member_slot["scratchStringBuilderCallVirtualAddressHex"], "0x00402920")
        self.assertEqual(member_slot["payloadObjectInitCallVirtualAddressHex"], "0x00402964")
        self.assertEqual(member_slot["globalArgumentReadVirtualAddressHex"], "0x00402969")
        self.assertEqual(member_slot["globalArgumentVirtualAddressHex"], "0x0066bfe4")
        self.assertEqual(member_slot["dispatchCallVirtualAddressHex"], "0x00402995")
        self.assertEqual(member_slot["dispatchCallTargetHex"], "0x00403160")
        self.assertEqual(member_slot["successJumpVirtualAddressHex"], "0x004028d6")
        self.assertEqual(member_slot["successTargetVirtualAddressHex"], "0x004029b8")
        self.assertEqual(member_slot["returnVirtualAddressHex"], "0x004029e5")
        self.assertEqual(member_slot["returnBytes"], 12)
        self.assertEqual(
            index["nextTracePoint"],
            "instrument state trigger member slot 0x00402880 return/effects or 0x004ac430 payload-2 path",
        )

    def test_pipeline_writes_runtime_manager_index(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            out = Path(temp) / "runtime-manager.json"

            result = subprocess.run(
                [
                    sys.executable,
                    str(TOOL),
                    "runtime-manager-index",
                    str(CLIENT_EXE),
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
            self.assertEqual(index["destructor"]["globalClearValue"], 0)
            self.assertEqual(index["destructor"]["entryKind"], "virtual-destructor-wrapper")
            self.assertEqual(index["cleanupLoop"]["role"], "manager callback-list cleanup and optional self-delete")
            self.assertEqual(index["registeredCallbackGate"]["runtimeObservation"], "G051 observed callbackState30=0")
            self.assertEqual(index["registeredCallbackGate"]["stateSetters"][0]["registeredPushVirtualAddressHex"], "0x004ad9c1")
            self.assertEqual(index["stateTriggerMemberSlotEffect"]["entryVirtualAddressHex"], "0x00402880")


if __name__ == "__main__":
    unittest.main()
