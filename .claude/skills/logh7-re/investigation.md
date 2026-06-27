The user wants a complete RE trace of the 0x0b07 NotifyMovedGrid consumption path in LOGH VII G7MTClient.exe. I need to trace from the dispatcher through enqueue to the actual dequeue consumer that applies the data to world state.

Key functions to investigate:
1. FUN_004ba2b0 (dispatcher) - case 0x0b07
2. FUN_004bee20 (consumer entry) - copies to buffer and calls FUN_00517cd0
3. FUN_00517cd0 - enqueues event based on DAT_02215e2c value
4. FUN_00501e30 (enqueue)
5. FUN_00501ed0 (dequeue)
6. Need to find who calls dequeue and applies the data

From the decompiles I've gathered:
- Dispatcher 0x004ba2b0 case 0xb07: copies payload to DAT_00437714 + local_18 (mainState+0x437714), calls FUN_004bee20
- FUN_004bee20: checks *(param_1 + 0x2a58f8) != 0, then calls FUN_00517cd0(0xb07, param_2)
- FUN_00517cd0: checks *DAT_02215e2c (1/2/3), allocates event object via FUN_0050cf40(0x42/0x6f/0x56), then calls FUN_00501e30(0x16, ...)
- FUN_00501e30: enqueues event opcode 0x16 into event queue

Now I need to find:
1. Where event 0x16 is dequeued and consumed
2. What memory offsets are modified
3. State gates required
4. Difference from 0x0b01 path

Let me search for where event 0x16 is consumed.