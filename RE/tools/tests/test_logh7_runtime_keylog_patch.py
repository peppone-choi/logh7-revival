import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
CLIENT_EXE = REPO_ROOT / ".omo" / "work" / "logh7-installed" / "exe" / "G7MTClient.exe"
TOOL = REPO_ROOT / "tools" / "logh7_pipeline.py"
TEXT_SECTION_CHARACTERISTICS_OFFSET = 0x244


class Logh7RuntimeKeylogPatchTests(unittest.TestCase):
    def test_writes_guarded_key_store_logging_patch_from_pipeline_cli(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            patched = Path(temp) / "G7MTClient.keylog.exe"
            metadata = Path(temp) / "keylog-patch.json"

            result = subprocess.run(
                [
                    sys.executable,
                    str(TOOL),
                    "runtime-keylog-patch",
                    str(CLIENT_EXE),
                    "--out",
                    str(patched),
                    "--manifest-out",
                    str(metadata),
                ],
                cwd=REPO_ROOT,
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                check=False,
            )

            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertTrue(patched.is_file())
            patch = json.loads(metadata.read_text(encoding="utf-8"))
            self.assertEqual(patch["source"], str(CLIENT_EXE))
            self.assertEqual(patch["destination"], str(patched))
            self.assertEqual(patch["logPath"], "logh7_keylog.bin")
            self.assertEqual(patch["hook"]["target"], "keyStoreHelper")
            self.assertEqual(patch["hook"]["virtualAddressHex"], "0x00614810")
            self.assertEqual(patch["hook"]["fileOffsetHex"], "0x00214810")
            self.assertEqual(patch["hook"]["originalHex"], "53558be98b4504")
            self.assertEqual(patch["hook"]["returnAddressHex"], "0x00614817")
            self.assertEqual(patch["trampoline"]["virtualAddressHex"], "0x0066acd5")
            self.assertEqual(patch["trampoline"]["fileOffsetHex"], "0x0026acd5")
            self.assertLessEqual(patch["trampoline"]["lengthBytes"], 811)
            self.assertEqual(patch["trampoline"]["sectionCharacteristicsBeforeHex"], "0x60000020")
            self.assertEqual(patch["trampoline"]["sectionCharacteristicsAfterHex"], "0xe0000020")
            self.assertTrue(patch["trampoline"]["requiresWritableSection"])
            self.assertEqual(patch["recordFormat"]["magic"], "4b4c4732")
            self.assertEqual(patch["recordFormat"]["recordBytes"], 92)
            self.assertIn("returnAddress", patch["recordFormat"]["layout"])
            self.assertEqual(patch["recordFormat"]["keyBytes"], 64)

            raw = patched.read_bytes()
            self.assertEqual(raw[0x214810], 0xE9)
            self.assertEqual(
                raw[TEXT_SECTION_CHARACTERISTICS_OFFSET : TEXT_SECTION_CHARACTERISTICS_OFFSET + 4],
                bytes.fromhex("200000e0"),
            )
            self.assertIn(b"logh7_keylog.bin\x00", raw[0x26ACD5 : 0x26ACD5 + 811])
            self.assertIn(b"KLG2", raw[0x26ACD5 : 0x26ACD5 + 811])

    def test_writes_guarded_key_setup_logging_patch_from_pipeline_cli(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            patched = Path(temp) / "G7MTClient.keysetup.exe"
            metadata = Path(temp) / "keysetup-patch.json"

            result = subprocess.run(
                [
                    sys.executable,
                    str(TOOL),
                    "runtime-keysetup-log-patch",
                    str(CLIENT_EXE),
                    "--out",
                    str(patched),
                    "--manifest-out",
                    str(metadata),
                ],
                cwd=REPO_ROOT,
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                check=False,
            )

            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertTrue(patched.is_file())
            patch = json.loads(metadata.read_text(encoding="utf-8"))
            self.assertEqual(patch["logPath"], "logh7_keylog.bin")
            self.assertEqual(patch["hook"]["target"], "keySetupWrapper")
            self.assertEqual(patch["hook"]["virtualAddressHex"], "0x006140c0")
            self.assertEqual(patch["hook"]["fileOffsetHex"], "0x002140c0")
            self.assertEqual(patch["hook"]["originalHex"], "53558b6c240c56")
            self.assertEqual(patch["hook"]["returnAddressHex"], "0x006140c7")
            self.assertEqual(patch["recordFormat"]["recordBytes"], 92)
            self.assertEqual(patch["trampoline"]["sectionCharacteristicsBeforeHex"], "0x60000020")
            self.assertEqual(patch["trampoline"]["sectionCharacteristicsAfterHex"], "0xe0000020")
            self.assertTrue(patch["trampoline"]["requiresWritableSection"])
            self.assertEqual(patch["recordFormat"]["events"]["2"], "keySetupWrapperEntry")
            self.assertEqual(patch["recordFormat"]["copyPolicy"], "copyUpTo64KeyBytes")

            raw = patched.read_bytes()
            self.assertEqual(raw[0x2140C0], 0xE9)
            self.assertEqual(
                raw[TEXT_SECTION_CHARACTERISTICS_OFFSET : TEXT_SECTION_CHARACTERISTICS_OFFSET + 4],
                bytes.fromhex("200000e0"),
            )
            self.assertIn(b"logh7_keylog.bin\x00", raw[0x26ACD5 : 0x26ACD5 + 811])
            self.assertIn(b"KLG2", raw[0x26ACD5 : 0x26ACD5 + 811])

    def test_writes_guarded_key_read_logging_patch_from_pipeline_cli(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            patched = Path(temp) / "G7MTClient.keyread.exe"
            metadata = Path(temp) / "keyread-patch.json"

            result = subprocess.run(
                [
                    sys.executable,
                    str(TOOL),
                    "runtime-keyread-log-patch",
                    str(CLIENT_EXE),
                    "--out",
                    str(patched),
                    "--manifest-out",
                    str(metadata),
                ],
                cwd=REPO_ROOT,
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                check=False,
            )

            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertTrue(patched.is_file())
            patch = json.loads(metadata.read_text(encoding="utf-8"))
            self.assertEqual(patch["hook"]["target"], "keyReadHelper")
            self.assertEqual(patch["hook"]["virtualAddressHex"], "0x006148a0")
            self.assertEqual(patch["hook"]["fileOffsetHex"], "0x002148a0")
            self.assertEqual(patch["hook"]["originalHex"], "538bd9558b4304")
            self.assertEqual(patch["recordFormat"]["events"]["3"], "keyReadHelperEntry")
            self.assertEqual(patch["recordFormat"]["copyPolicy"], "storedImageCopyUpTo64KeyBytes")

            raw = patched.read_bytes()
            self.assertEqual(raw[0x2148A0], 0xE9)
            self.assertEqual(
                raw[TEXT_SECTION_CHARACTERISTICS_OFFSET : TEXT_SECTION_CHARACTERISTICS_OFFSET + 4],
                bytes.fromhex("200000e0"),
            )
            self.assertIn(b"logh7_keylog.bin\x00", raw[0x26ACD5 : 0x26ACD5 + 811])
            self.assertIn(b"KLG2", raw[0x26ACD5 : 0x26ACD5 + 811])

    def test_writes_guarded_child_encode_entry_trace_patch_from_pipeline_cli(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            patched = Path(temp) / "G7MTClient.childencode.exe"
            metadata = Path(temp) / "child-encode-patch.json"

            result = subprocess.run(
                [
                    sys.executable,
                    str(TOOL),
                    "runtime-child-encode-log-patch",
                    str(CLIENT_EXE),
                    "--out",
                    str(patched),
                    "--manifest-out",
                    str(metadata),
                ],
                cwd=REPO_ROOT,
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                check=False,
            )

            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertTrue(patched.is_file())
            patch = json.loads(metadata.read_text(encoding="utf-8"))
            self.assertEqual(patch["hook"]["target"], "childCodecEncode")
            self.assertEqual(patch["hook"]["virtualAddressHex"], "0x00614100")
            self.assertEqual(patch["hook"]["fileOffsetHex"], "0x00214100")
            self.assertEqual(patch["hook"]["originalHex"], "51538b5c2410")
            self.assertEqual(patch["recordFormat"]["magic"], "434c4732")
            self.assertEqual(patch["recordFormat"]["recordBytes"], 176)
            self.assertEqual(patch["recordFormat"]["events"]["4"], "childCodecEncodeEntry")
            self.assertEqual(patch["recordFormat"]["copyPolicy"], "inputAndStoredKeyImageCopyUpTo64Bytes")

            raw = patched.read_bytes()
            self.assertEqual(raw[0x214100], 0xE9)
            self.assertEqual(
                raw[TEXT_SECTION_CHARACTERISTICS_OFFSET : TEXT_SECTION_CHARACTERISTICS_OFFSET + 4],
                bytes.fromhex("200000e0"),
            )
            self.assertIn(b"logh7_child_codec_trace.bin\x00", raw[0x26ACD5 : 0x26ACD5 + 811])
            self.assertIn(b"CLG2", raw[0x26ACD5 : 0x26ACD5 + 811])
            self.assertIn(bytes.fromhex("68b0000000"), raw[0x26ACD5 : 0x26ACD5 + 811])
            self.assertNotIn(bytes.fromhex("6a80"), raw[0x26ACD5 : 0x26ACD5 + 811])

    def test_writes_guarded_child_encode_postcall_trace_patch_from_pipeline_cli(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            patched = Path(temp) / "G7MTClient.childpost.exe"
            metadata = Path(temp) / "child-post-patch.json"

            result = subprocess.run(
                [
                    sys.executable,
                    str(TOOL),
                    "runtime-child-encode-post-log-patch",
                    str(CLIENT_EXE),
                    "--out",
                    str(patched),
                    "--manifest-out",
                    str(metadata),
                ],
                cwd=REPO_ROOT,
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                check=False,
            )

            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertTrue(patched.is_file())
            patch = json.loads(metadata.read_text(encoding="utf-8"))
            self.assertEqual(patch["hook"]["target"], "phase1ChildEncodePostCall")
            self.assertEqual(patch["hook"]["virtualAddressHex"], "0x006452cc")
            self.assertEqual(patch["hook"]["fileOffsetHex"], "0x002452cc")
            self.assertEqual(patch["hook"]["originalHex"], "8b4c24148ad8")
            self.assertEqual(patch["recordFormat"]["events"]["5"], "childCodecEncodePostCall")
            self.assertEqual(patch["recordFormat"]["copyPolicy"], "outputCopyUpTo64Bytes")

            raw = patched.read_bytes()
            self.assertEqual(raw[0x2452CC], 0xE9)
            self.assertIn(b"logh7_child_codec_trace.bin\x00", raw[0x26ACD5 : 0x26ACD5 + 811])
            self.assertIn(b"CLG2", raw[0x26ACD5 : 0x26ACD5 + 811])

    def test_writes_guarded_queue_append_trace_patch_from_pipeline_cli(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            patched = Path(temp) / "G7MTClient.queueappend.exe"
            metadata = Path(temp) / "queue-append-patch.json"

            result = subprocess.run(
                [
                    sys.executable,
                    str(TOOL),
                    "runtime-queue-append-log-patch",
                    str(CLIENT_EXE),
                    "--out",
                    str(patched),
                    "--manifest-out",
                    str(metadata),
                ],
                cwd=REPO_ROOT,
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                check=False,
            )

            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertTrue(patched.is_file())
            patch = json.loads(metadata.read_text(encoding="utf-8"))
            self.assertEqual(patch["logPath"], "logh7_queue_append.bin")
            self.assertEqual(patch["hook"]["target"], "lowTransportQueueAppendStore")
            self.assertEqual(patch["hook"]["virtualAddressHex"], "0x004b8552")
            self.assertEqual(patch["hook"]["fileOffsetHex"], "0x000b8552")
            self.assertEqual(patch["hook"]["originalHex"], "8b87c07e35008d1440")
            self.assertEqual(patch["recordFormat"]["magic"], "514c4731")
            self.assertEqual(patch["recordFormat"]["recordBytes"], 32)
            self.assertIn("queuedInternalCode", patch["recordFormat"]["layout"])
            self.assertIn("payloadOrContextPointer", patch["recordFormat"]["layout"])

            raw = patched.read_bytes()
            self.assertEqual(raw[0x0B8552], 0xE9)
            self.assertEqual(
                raw[TEXT_SECTION_CHARACTERISTICS_OFFSET : TEXT_SECTION_CHARACTERISTICS_OFFSET + 4],
                bytes.fromhex("200000e0"),
            )
            self.assertIn(b"logh7_queue_append.bin\x00", raw[0x26ACD5 : 0x26ACD5 + 811])
            self.assertIn(b"QLG1", raw[0x26ACD5 : 0x26ACD5 + 811])

    def test_writes_guarded_queue_entry_trace_patch_from_pipeline_cli(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            patched = Path(temp) / "G7MTClient.queueentry.exe"
            metadata = Path(temp) / "queue-entry-patch.json"

            result = subprocess.run(
                [
                    sys.executable,
                    str(TOOL),
                    "runtime-queue-entry-log-patch",
                    str(CLIENT_EXE),
                    "--out",
                    str(patched),
                    "--manifest-out",
                    str(metadata),
                ],
                cwd=REPO_ROOT,
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                check=False,
            )

            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertTrue(patched.is_file())
            patch = json.loads(metadata.read_text(encoding="utf-8"))
            self.assertEqual(patch["logPath"], "logh7_queue_entry.bin")
            self.assertEqual(patch["hook"]["target"], "lowTransportQueueAppend")
            self.assertEqual(patch["hook"]["virtualAddressHex"], "0x004b852b")
            self.assertEqual(patch["hook"]["fileOffsetHex"], "0x000b852b")
            self.assertEqual(patch["hook"]["originalHex"], "8a450884c00f84db000000")
            self.assertEqual(patch["hook"]["skipTargetHex"], "0x004b8611")
            self.assertEqual(patch["recordFormat"]["magic"], "51454731")
            self.assertEqual(patch["recordFormat"]["recordBytes"], 32)
            self.assertIn("transportFlag", patch["recordFormat"]["layout"])
            self.assertIn("branchPolicy", patch["recordFormat"]["layout"])

            raw = patched.read_bytes()
            self.assertEqual(raw[0x0B852B], 0xE9)
            self.assertIn(b"logh7_queue_entry.bin\x00", raw[0x26ACD5 : 0x26ACD5 + 811])
            self.assertIn(b"QEG1", raw[0x26ACD5 : 0x26ACD5 + 811])

    def test_writes_guarded_child_schedule_trace_patch_from_pipeline_cli(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            patched = Path(temp) / "G7MTClient.childschedule.exe"
            metadata = Path(temp) / "child-schedule-patch.json"

            result = subprocess.run(
                [
                    sys.executable,
                    str(TOOL),
                    "runtime-child-schedule-log-patch",
                    str(CLIENT_EXE),
                    "--out",
                    str(patched),
                    "--manifest-out",
                    str(metadata),
                ],
                cwd=REPO_ROOT,
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                check=False,
            )

            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertTrue(patched.is_file())
            patch = json.loads(metadata.read_text(encoding="utf-8"))
            self.assertEqual(patch["hook"]["target"], "childCodecEncode")
            self.assertEqual(patch["recordFormat"]["events"]["6"], "childCodecEncodeScheduleEntry")
            self.assertEqual(patch["recordFormat"]["copyPolicy"], "inputCopyAndScheduledPArrayHeadCopy")

            raw = patched.read_bytes()
            self.assertEqual(raw[0x214100], 0xE9)
            self.assertIn(b"logh7_child_codec_trace.bin\x00", raw[0x26ACD5 : 0x26ACD5 + 811])
            self.assertIn(b"CLG2", raw[0x26ACD5 : 0x26ACD5 + 811])

    def test_reads_klg2_records_from_pipeline_cli(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            keylog = Path(temp) / "logh7_keylog.bin"
            metadata = Path(temp) / "keylog-records.json"
            key = b"{A4C13748-0159-4c54-AEB3-1D68575761B3}"
            record = bytearray(92)
            record[:4] = b"KLG2"
            record[4] = 1
            record[8:28] = (
                0x006140EF.to_bytes(4, "little")
                + 0x05432980.to_bytes(4, "little")
                + 0x0019FC34.to_bytes(4, "little")
                + len(key).to_bytes(4, "little")
                + len(key).to_bytes(4, "little")
            )
            record[28 : 28 + len(key)] = key
            keylog.write_bytes(record)

            result = subprocess.run(
                [
                    sys.executable,
                    str(TOOL),
                    "runtime-keylog-read",
                    str(keylog),
                    "--out",
                    str(metadata),
                ],
                cwd=REPO_ROOT,
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                check=False,
            )

            self.assertEqual(result.returncode, 0, result.stderr)
            parsed = json.loads(metadata.read_text(encoding="utf-8"))
            self.assertEqual(parsed["recordBytes"], 92)
            self.assertEqual(parsed["records"][0]["magic"], "KLG2")
            self.assertEqual(parsed["records"][0]["returnAddressHex"], "0x006140ef")
            self.assertEqual(parsed["records"][0]["helperReturn"], "keySetupWrapper.storeKeyReturn")
            self.assertEqual(parsed["records"][0]["keyAscii"], key.decode("ascii"))

    def test_reads_key_setup_entry_klg2_records_from_pipeline_cli(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            keylog = Path(temp) / "logh7_keylog.bin"
            metadata = Path(temp) / "keylog-records.json"
            keylog.write_bytes(
                b"".join(
                    _klg2_fixture(return_address, b"session-key-16!!")
                    for return_address in (0x00645483, 0x0061285C, 0x00612D0B)
                )
            )

            result = subprocess.run(
                [
                    sys.executable,
                    str(TOOL),
                    "runtime-keylog-read",
                    str(keylog),
                    "--out",
                    str(metadata),
                ],
                cwd=REPO_ROOT,
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                check=False,
            )

            self.assertEqual(result.returncode, 0, result.stderr)
            parsed = json.loads(metadata.read_text(encoding="utf-8"))
            self.assertEqual(parsed["records"][0]["eventName"], "keySetupWrapperEntry")
            self.assertEqual(parsed["records"][0]["returnAddressHex"], "0x00645483")
            self.assertEqual(parsed["records"][0]["helperReturn"], "phase2InboundApply.returnAfterKeySetup")
            self.assertEqual(parsed["records"][0]["keyAscii"], "session-key-16!!")
            self.assertEqual(parsed["records"][1]["helperReturn"], "loginGuidKeySetup.returnAfterKeySetup")
            self.assertEqual(parsed["records"][2]["helperReturn"], "loginSessionKeySetup.returnAfterKeySetup")
            self.assertEqual(_klg2_fixture(0x00614180, b"stored", event=3)[4], 3)

    def test_reads_child_encode_clg2_records_from_pipeline_cli(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            trace = Path(temp) / "logh7_child_codec_trace.bin"
            metadata = Path(temp) / "child-trace-records.json"
            payload = bytes.fromhex("3412000008000000474d0000")
            stored_key = bytes.fromhex("315ab37d3a44955490c29ba1abdb3f89")
            record = bytearray(176)
            record[:4] = b"CLG2"
            record[4] = 4
            record[8:48] = (
                0x006451B0.to_bytes(4, "little")
                + 0x054820B0.to_bytes(4, "little")
                + 0x0019FA00.to_bytes(4, "little")
                + len(payload).to_bytes(4, "little")
                + 0x0019FB00.to_bytes(4, "little")
                + 0x0019FB04.to_bytes(4, "little")
                + len(payload).to_bytes(4, "little")
                + 0x05483C10.to_bytes(4, "little")
                + len(stored_key).to_bytes(4, "little")
                + len(stored_key).to_bytes(4, "little")
            )
            record[48 : 48 + len(payload)] = payload
            record[112 : 112 + len(stored_key)] = stored_key
            trace.write_bytes(record)

            result = subprocess.run(
                [
                    sys.executable,
                    str(TOOL),
                    "runtime-child-trace-read",
                    str(trace),
                    "--out",
                    str(metadata),
                ],
                cwd=REPO_ROOT,
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                check=False,
            )

            self.assertEqual(result.returncode, 0, result.stderr)
            parsed = json.loads(metadata.read_text(encoding="utf-8"))
            self.assertEqual(parsed["recordBytes"], 176)
            self.assertEqual(parsed["records"][0]["eventName"], "childCodecEncodeEntry")
            self.assertEqual(parsed["records"][0]["callerHex"], "0x006451b0")
            self.assertEqual(parsed["records"][0]["callerLabel"], "phase1OutboundEncode.callChildCodecEncode")
            self.assertEqual(parsed["records"][0]["inputLength"], len(payload))
            self.assertEqual(parsed["records"][0]["bufferHex"], payload.hex())
            self.assertEqual(parsed["records"][0]["storedKeyImageHex"], stored_key.hex())
            self.assertEqual(parsed["records"][0]["storedKeyRawXor17Hex"], "264da46a2d53824387d58cb6bccc289e")

    def test_reads_child_encode_postcall_clg2_records_from_pipeline_cli(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            trace = Path(temp) / "logh7_child_codec_trace.bin"
            metadata = Path(temp) / "child-post-records.json"
            output = bytes.fromhex("58e61d2b098f243a0c7793ea83d0da949e413ff0b6e676c3")
            record = bytearray(176)
            record[:4] = b"CLG2"
            record[4] = 5
            record[8:48] = (
                0x006452CC.to_bytes(4, "little")
                + (0).to_bytes(4, "little")
                + 0x053A3BD0.to_bytes(4, "little")
                + len(output).to_bytes(4, "little")
                + 0x053A21A8.to_bytes(4, "little")
                + 0x0019FDDC.to_bytes(4, "little")
                + len(output).to_bytes(4, "little")
                + 0x053A4000.to_bytes(4, "little")
                + len(output).to_bytes(4, "little")
                + (1).to_bytes(4, "little")
            )
            record[48 : 48 + len(output)] = output
            trace.write_bytes(record)

            result = subprocess.run(
                [
                    sys.executable,
                    str(TOOL),
                    "runtime-child-trace-read",
                    str(trace),
                    "--out",
                    str(metadata),
                ],
                cwd=REPO_ROOT,
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                check=False,
            )

            self.assertEqual(result.returncode, 0, result.stderr)
            parsed = json.loads(metadata.read_text(encoding="utf-8"))
            self.assertEqual(parsed["records"][0]["eventName"], "childCodecEncodePostCall")
            self.assertEqual(parsed["records"][0]["callerLabel"], "phase1OutboundEncode.returnAfterChildCodecEncode")
            self.assertEqual(parsed["records"][0]["outputHex"], output.hex())
            self.assertEqual(parsed["records"][0]["outputLength"], len(output))
            self.assertEqual(parsed["records"][0]["returnValue"], 1)

    def test_reads_child_encode_schedule_clg2_records_from_pipeline_cli(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            trace = Path(temp) / "logh7_child_codec_trace.bin"
            metadata = Path(temp) / "child-schedule-records.json"
            payload = bytes.fromhex("828400108e901f21bafe36f8233b5d26ec250a1d00000001")
            stored_key = b"{A4C13748-0159-4c54-AEB3-1D68575761B3}"
            p_head = bytes.fromhex("4ec2c357dea86107f606a55a24d2be57")
            record = bytearray(176)
            record[:4] = b"CLG2"
            record[4] = 6
            record[8:48] = (
                0x00614100.to_bytes(4, "little")
                + 0x054820B0.to_bytes(4, "little")
                + 0x0019FA00.to_bytes(4, "little")
                + len(payload).to_bytes(4, "little")
                + 0x0019FB00.to_bytes(4, "little")
                + 0x0019FB04.to_bytes(4, "little")
                + (len(payload) + len(stored_key)).to_bytes(4, "little")
                + 0x05483C10.to_bytes(4, "little")
                + (72).to_bytes(4, "little")
                + len(p_head).to_bytes(4, "little")
            )
            record[48 : 48 + len(payload)] = payload
            record[48 + len(payload) : 48 + len(payload) + len(stored_key)] = stored_key
            record[112 : 112 + len(p_head)] = p_head
            trace.write_bytes(record)

            result = subprocess.run(
                [
                    sys.executable,
                    str(TOOL),
                    "runtime-child-trace-read",
                    str(trace),
                    "--out",
                    str(metadata),
                ],
                cwd=REPO_ROOT,
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                check=False,
            )

            self.assertEqual(result.returncode, 0, result.stderr)
            parsed = json.loads(metadata.read_text(encoding="utf-8"))
            self.assertEqual(parsed["records"][0]["eventName"], "childCodecEncodeScheduleEntry")
            self.assertEqual(parsed["records"][0]["scheduledPArrayPointerHex"], "0x05483c10")
            self.assertEqual(parsed["records"][0]["scheduledPArrayBytes"], 72)
            self.assertEqual(parsed["records"][0]["scheduledPArrayHeadHex"], p_head.hex())
            self.assertEqual(parsed["records"][0]["scheduleInputHex"], payload.hex())
            self.assertEqual(parsed["records"][0]["scheduleStoredKeyImageHex"], stored_key.hex())


def _klg2_fixture(return_address: int, key: bytes, event: int = 2) -> bytes:
    record = bytearray(92)
    record[:4] = b"KLG2"
    record[4] = event
    record[8:28] = (
        return_address.to_bytes(4, "little")
        + 0x05432980.to_bytes(4, "little")
        + 0x0019FC34.to_bytes(4, "little")
        + len(key).to_bytes(4, "little")
        + len(key).to_bytes(4, "little")
    )
    record[28 : 28 + len(key)] = key
    return bytes(record)


if __name__ == "__main__":
    unittest.main()
