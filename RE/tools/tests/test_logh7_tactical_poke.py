import unittest

import tools.logh7_tactical_poke as tactical_poke


class Logh7TacticalPokeTests(unittest.TestCase):
    def test_raw_probe_reports_raw_hex_and_both_endians(self) -> None:
        original_read = tactical_poke._read_process_memory

        def fake_read(process: int, address: int, size: int) -> bytes:
            self.assertEqual(process, 123)
            self.assertEqual(address, 0x1000)
            return bytes.fromhex("0001aabb")[:size]

        try:
            tactical_poke._read_process_memory = fake_read
            probe = tactical_poke._raw_probe(123, 0x1000, 4)
        finally:
            tactical_poke._read_process_memory = original_read

        self.assertEqual(probe["addressHex"], "0x00001000")
        self.assertEqual(probe["rawHex"], "0001aabb")
        self.assertEqual(probe["u16le"], 0x0100)
        self.assertEqual(probe["u16be"], 0x0001)
        self.assertEqual(probe["u32le"], 0xbbaa0100)
        self.assertEqual(probe["u32be"], 0x0001aabb)

    def test_read_state_keeps_legacy_counts_but_exposes_raw_endian_probes(self) -> None:
        original_read = tactical_poke._read_process_memory
        client = 0x10000000
        memory = {
            client + tactical_poke.GRID_ACTIVE_OFFSET: bytes.fromhex("01"),
            client + tactical_poke.MODE_BYTE_OFFSET: bytes.fromhex("02"),
            client + tactical_poke.GRID_SELECTOR_DWORD_OFFSET: bytes.fromhex("00000100"),
            client + tactical_poke.MODE_SELECTOR_OFFSET: bytes.fromhex("01"),
            client + tactical_poke.PREVIOUS_MODE_OFFSET: bytes.fromhex("02"),
            client + tactical_poke.WORLD_ACTIVE_OFFSET: bytes.fromhex("01000100"),
            client + tactical_poke.TRANSITION_GATE_OFFSET: bytes.fromhex("00"),
            client + tactical_poke.TRANSITION_FLOAT_OFFSET: bytes.fromhex("0000803f"),
            client + tactical_poke.TRANSITION_MODE_OFFSET: bytes.fromhex("02000000"),
            client + tactical_poke.TACTICAL_POOL_OFFSET: bytes.fromhex("00000000"),
            client + tactical_poke.TACTICS_INFO_OFFSET: bytes.fromhex("0c00"),
            client + tactical_poke.TACTICS_INFO_OFFSET + 4: bytes.fromhex("01000000"),
            client + tactical_poke.TACTICS_INFO_OFFSET + 12: bytes.fromhex("02000000"),
            client + tactical_poke.UNIT_COUNT_OFFSET: bytes.fromhex("0001"),
            client + tactical_poke.UNIT_COUNT_OFFSET + 4: bytes.fromhex("00000001"),
            client + tactical_poke.UNIT_COUNT_OFFSET + 8: bytes.fromhex("01000000"),
        }

        def fake_read(process: int, address: int, size: int) -> bytes:
            self.assertEqual(process, 456)
            try:
                data = memory[address]
            except KeyError as exc:
                raise AssertionError(f"unexpected read 0x{address:08x} size {size}") from exc
            return data[:size]

        try:
            tactical_poke._read_process_memory = fake_read
            state = tactical_poke._read_state(456, client)
        finally:
            tactical_poke._read_process_memory = original_read

        self.assertEqual(state["gridActiveFlag"], 1)
        self.assertEqual(state["modeByte"], 2)
        self.assertEqual(state["modeByteProbe"]["rawHex"], "02")
        self.assertEqual(state["gridSelectorDword35f358Probe"]["rawHex"], "00000100")
        self.assertEqual(state["gridSelectorDword35f358Probe"]["u32le"], 0x00010000)
        self.assertEqual(state["modeSelector35f35a"], 1)
        self.assertEqual(state["previousMode358382"], 2)
        self.assertEqual(state["worldActive2a58f8"], 1)
        self.assertEqual(state["worldActive2a58f8Probe"]["rawHex"], "01000100")
        self.assertEqual(state["transitionGate357e84"], 0)
        self.assertEqual(state["transitionFloat357e88Probe"]["rawHex"], "0000803f")
        self.assertEqual(state["transitionFloat357e88Probe"]["f32le"], 1.0)
        self.assertEqual(state["transitionMode357e8cProbe"]["u32le"], 2)
        self.assertEqual(state["poolHead"], 0)
        self.assertEqual(state["tacticsInfoCount"], 12)
        self.assertEqual(state["tacticsInfoCountProbe"]["u16le"], 12)
        self.assertEqual(state["tacticsInfoFirstRecord0Probe"]["u32le"], 1)
        self.assertEqual(state["tacticsInfoFirstRecord8Probe"]["u32le"], 2)
        self.assertEqual(state["unitTableCount"], 256)
        self.assertEqual(state["unitTableCountProbe"]["rawHex"], "0001")
        self.assertEqual(state["unitTableCountProbe"]["u16le"], 256)
        self.assertEqual(state["unitTableCountProbe"]["u16be"], 1)
        self.assertEqual(state["unitTableFirstRecord0Probe"]["u32be"], 1)
        self.assertEqual(state["unitTableFirstRecord4Probe"]["u32le"], 1)

    def test_probe_uses_read_only_process_handle(self) -> None:
        calls: list[tuple[str, int]] = []
        original_open_read = tactical_poke._open_process_read
        original_open_rw = tactical_poke._open_process_rw
        original_read = tactical_poke._read_process_memory
        original_read_state = tactical_poke._read_state

        def fake_open_read(pid: int) -> int:
            calls.append(("read", pid))
            return 777

        def fake_open_rw(pid: int) -> int:
            raise AssertionError(f"probe unexpectedly requested RW handle for pid {pid}")

        def fake_read(process: int, address: int, size: int) -> bytes:
            self.assertEqual((process, address, size), (777, tactical_poke.CLIENT_OBJECT_POINTER_VA, 4))
            return (0x10000000).to_bytes(4, "little")

        def fake_read_state(process: int, client: int) -> dict[str, object]:
            self.assertEqual((process, client), (777, 0x10000000))
            return {"modeByte": 2, "poolHead": 0}

        try:
            tactical_poke._open_process_read = fake_open_read
            tactical_poke._open_process_rw = fake_open_rw
            tactical_poke._read_process_memory = fake_read
            tactical_poke._read_state = fake_read_state
            state = tactical_poke.probe(1234)
        finally:
            tactical_poke._open_process_read = original_open_read
            tactical_poke._open_process_rw = original_open_rw
            tactical_poke._read_process_memory = original_read
            tactical_poke._read_state = original_read_state

        self.assertEqual(calls, [("read", 1234)])
        self.assertEqual(state["pid"], 1234)
        self.assertEqual(state["interpretation"], "mode strategic (2); tactical pool gated off")

    def test_poke_still_uses_rw_process_handle(self) -> None:
        calls: list[tuple[str, int]] = []
        original_open_rw = tactical_poke._open_process_rw
        original_read = tactical_poke._read_process_memory
        original_read_state = tactical_poke._read_state
        original_write = tactical_poke._write_process_memory

        def fake_open_rw(pid: int) -> int:
            calls.append(("rw", pid))
            return 888

        def fake_read(process: int, address: int, size: int) -> bytes:
            self.assertEqual((process, address, size), (888, tactical_poke.CLIENT_OBJECT_POINTER_VA, 4))
            return (0x10000000).to_bytes(4, "little")

        read_states = iter([
            {"modeByte": 2, "poolHead": 0},
            {"modeByte": 0, "poolHead": 0},
        ])

        def fake_read_state(process: int, client: int) -> dict[str, object]:
            self.assertEqual((process, client), (888, 0x10000000))
            return next(read_states)

        writes: list[tuple[int, int, bytes]] = []

        def fake_write(process: int, address: int, data: bytes) -> int:
            writes.append((process, address, data))
            return len(data)

        try:
            tactical_poke._open_process_rw = fake_open_rw
            tactical_poke._read_process_memory = fake_read
            tactical_poke._read_state = fake_read_state
            tactical_poke._write_process_memory = fake_write
            result = tactical_poke.poke(5678)
        finally:
            tactical_poke._open_process_rw = original_open_rw
            tactical_poke._read_process_memory = original_read
            tactical_poke._read_state = original_read_state
            tactical_poke._write_process_memory = original_write

        self.assertEqual(calls, [("rw", 5678)])
        self.assertEqual(writes, [(888, 0x10000000 + tactical_poke.MODE_BYTE_OFFSET, b"\x00")])
        self.assertTrue(result["ok"])


if __name__ == "__main__":
    unittest.main()
