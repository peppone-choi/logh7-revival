from __future__ import annotations

from dataclasses import dataclass
from typing import Final


@dataclass(frozen=True, slots=True)
class RuntimePatchTargetSpec:
    name: str
    virtual_address: int
    role: str
    patch_strategy: str
    expected_hex: str
    evidence: str


PATCH_TARGET_SPECS: Final[tuple[RuntimePatchTargetSpec, ...]] = (
    RuntimePatchTargetSpec(
        name="keySetupWrapper",
        virtual_address=0x006140C0,
        role="child codec key setup wrapper that receives raw key bytes and length",
        patch_strategy="file-backed instrumentation guard",
        expected_hex="53558b6c240c56578b7c24188bf15755",
        evidence="g005-child-codec-key-flow.txt",
    ),
    RuntimePatchTargetSpec(
        name="keyStoreHelper",
        virtual_address=0x00614810,
        role="stores raw key bytes as xor 0x17 image at codec+0x04/codec+0x08",
        patch_strategy="file-backed instrumentation guard",
        expected_hex="53558be98b450485c0740950e84a4503",
        evidence="g005-child-codec-key-flow.txt",
    ),
    RuntimePatchTargetSpec(
        name="keyReadHelper",
        virtual_address=0x006148A0,
        role="reads stored key image and unmasks it for key comparison",
        patch_strategy="file-backed instrumentation guard",
        expected_hex="538bd9558b430485c075075d32c05bc2",
        evidence="g005-child-codec-key-flow.txt",
    ),
    RuntimePatchTargetSpec(
        name="childCodecEncode",
        virtual_address=0x00614100,
        role="child-codec encode entry that receives plaintext input buffer and output holder",
        patch_strategy="file-backed instrumentation guard",
        expected_hex="51538b5c24105556f6c307578be98bc3",
        evidence="g010-child-encode-disasm.txt",
    ),
    RuntimePatchTargetSpec(
        name="phase1ChildEncodePostCall",
        virtual_address=0x006452CC,
        role="phase1 caller point immediately after child-codec encode returns and before buffers are freed",
        patch_strategy="file-backed instrumentation guard",
        expected_hex="8b4c24148ad851e8933a000056e88d3a",
        evidence="g011-phase1-postcall-disasm.txt",
    ),
    RuntimePatchTargetSpec(
        name="phase3CompareCallsite",
        virtual_address=0x00645792,
        role="phase3 manager callsite that compares decoded encipher key against stored key",
        patch_strategy="file-backed instrumentation guard",
        expected_hex="ff5008663b6c241c74326814067c0068",
        evidence="g005-cipher-phase-disasm.txt",
    ),
    RuntimePatchTargetSpec(
        name="runtimeManagerGlobalStore",
        virtual_address=0x004AD94F,
        role="stores runtime manager global object pointer into 0x007c25f4",
        patch_strategy="file-backed instrumentation guard",
        expected_hex="892df4257c00558d4c2424c6453000c6",
        evidence="g044-runtime-manager-index.json",
    ),
    RuntimePatchTargetSpec(
        name="runtimeManagerGlobalClear",
        virtual_address=0x004ADB09,
        role="clears runtime manager global object pointer at 0x007c25f4",
        patch_strategy="file-backed instrumentation guard",
        expected_hex="c705f4257c0000000000896c2410c745",
        evidence="g044-runtime-manager-index.json",
    ),
    RuntimePatchTargetSpec(
        name="runtimeManagerDestructorEntry",
        virtual_address=0x004ADAA0,
        role="runtime manager virtual destructor wrapper entry before global clear body",
        patch_strategy="file-backed instrumentation guard",
        expected_hex="568bf1e818000000f644240801740956",
        evidence="g047-runtime-manager-clear-caller-index.json",
    ),
    RuntimePatchTargetSpec(
        name="runtimeManagerCleanupLoopEntry",
        virtual_address=0x004ADCE0,
        role="runtime manager cleanup loop entry with manager callback list and self-delete gate",
        patch_strategy="file-backed instrumentation guard",
        expected_hex="5556578b7c24108b6f248b75003bf574",
        evidence="g049-runtime-manager-cleanup-loop-index.json",
    ),
    RuntimePatchTargetSpec(
        name="runtimeManagerRegisteredCallback",
        virtual_address=0x004ADD60,
        role="registered cleanup callback invoked from manager callback-list cleanup",
        patch_strategy="file-backed instrumentation guard",
        expected_hex="558bec6aff683023660064a100000000",
        evidence="g049-runtime-manager-cleanup-loop-index.json",
    ),
    RuntimePatchTargetSpec(
        name="runtimeManagerStateEventCallback",
        virtual_address=0x004ADF60,
        role="sets manager+0x30 when cleanup callback flag argument is zero",
        patch_strategy="file-backed instrumentation guard",
        expected_hex="8b44240885c0750f8b4c2404b0018841",
        evidence="g053-runtime-manager-callback-gate-writers-summary.json",
    ),
    RuntimePatchTargetSpec(
        name="runtimeManagerStateFollowupCallback",
        virtual_address=0x004ADFD0,
        role="follow-up callback that sets manager+0x30 before member40 helper scheduling",
        patch_strategy="file-backed instrumentation guard",
        expected_hex="8b44240885c05675658b7424088b4e40",
        evidence="g053-runtime-manager-callback-gate-writers-summary.json",
    ),
    RuntimePatchTargetSpec(
        name="runtimeManagerFlagThreeDispatcher",
        virtual_address=0x004AC350,
        role="flag 3 state callback dispatcher gated by manager+0xaa and list manager+0x24",
        patch_strategy="file-backed instrumentation guard",
        expected_hex="83ec10535556578b7c24248a87aa0000",
        evidence="g055-runtime-manager-state-dispatcher-summary.json",
    ),
    RuntimePatchTargetSpec(
        name="runtimeManagerFlagZeroDispatcher",
        virtual_address=0x004AC2C0,
        role="flag 0 state callback dispatcher gated by manager+0xa8/+0xa9 and list manager+0x34",
        patch_strategy="file-backed instrumentation guard",
        expected_hex="5556578b7c24108b6f348b75003bf574",
        evidence="g055-runtime-manager-state-dispatcher-summary.json",
    ),
    RuntimePatchTargetSpec(
        name="runtimeManagerNestedCallbackWalker",
        virtual_address=0x004AB6A0,
        role="nested callback-list walker reached from runtime manager flag-zero dispatcher",
        patch_strategy="file-backed instrumentation guard",
        expected_hex="83ec145355568b7424248b4e1857e8ed",
        evidence="g057-runtime-manager-dispatcher-node-real-client-analysis-long.json",
    ),
    RuntimePatchTargetSpec(
        name="runtimeManagerStateTriggerCallback",
        virtual_address=0x004AC430,
        role="nested state trigger callback that sets manager+0xaa before member vtable call",
        patch_strategy="file-backed instrumentation guard",
        expected_hex="8b44240885c05355565775258b442414",
        evidence="g058-runtime-manager-nested-callback-real-client-analysis.json",
    ),
    RuntimePatchTargetSpec(
        name="stateTriggerMemberSlot14",
        virtual_address=0x00402880,
        role="member44 vtable slot 0x14 target called by runtime manager state trigger",
        patch_strategy="file-backed instrumentation guard",
        expected_hex="64a1000000006aff68f6a56500506489",
        evidence="g059-runtime-manager-state-trigger-real-client-analysis.json",
    ),
    RuntimePatchTargetSpec(
        name="stateTriggerMemberSlotDispatchCall",
        virtual_address=0x00402995,
        role="dispatch call inside member44 slot 0x14 effect path before cleanup tail",
        patch_strategy="file-backed instrumentation guard",
        expected_hex="e8c607000068287a74008d54242c52c7",
        evidence="g061-runtime-manager-member-slot-summary.json",
    ),
    RuntimePatchTargetSpec(
        name="stateTriggerMemberSlotSuccessTail",
        virtual_address=0x004029B8,
        role="success tail of member44 slot 0x14 effect path after pre-dispatch guard",
        patch_strategy="file-backed instrumentation guard",
        expected_hex="8b8c24d400000055e80bfa20008b0655",
        evidence="g061-runtime-manager-member-slot-summary.json",
    ),
    RuntimePatchTargetSpec(
        name="lowTransportQueueAppend",
        virtual_address=0x004B852B,
        role="low transport pending response queue append path for queued/paired internal codes",
        patch_strategy="file-backed instrumentation guard",
        expected_hex="8a450884c00f84db00000083fbff7517",
        evidence="g038-session-bootstrap-queue-schema.json",
    ),
    RuntimePatchTargetSpec(
        name="lowTransportQueueAppendStore",
        virtual_address=0x004B8552,
        role="low transport queue append store block with live edi/esi/ebx payload context",
        patch_strategy="file-backed instrumentation guard",
        expected_hex="8b87c07e35008d14408b4510898497cc",
        evidence="g038-session-bootstrap-queue-schema.json",
    ),
)
