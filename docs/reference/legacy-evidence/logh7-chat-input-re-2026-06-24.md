# In-World Chat / Command Input RE — LOGH VII Client

## Summary

This document records reverse-engineering findings on how the real LOGH VII client (`G7MTClient.exe`) opens the in-world chat input and command window, and how it sends `CommandGridChat 0x0f1c` and `CommandMoveGrid 0x0b01`.

**Status:** Research-only. No code modifications.

---

## 1. UI Reference Screenshots

From the original UI reference collection (`.omo/reference/toshichan.my.coocan.jp/`):

### 1.1 Chat Window (`e39b6b_chat.jpg`)
- A blue-bordered chat panel with a text input area at the bottom
- Scrollable message history area above
- Title bar shows system messages (e.g., "一部隊が離脱しました")
- **Observation:** Chat input appears to be a dedicated text-edit widget within the chat panel

### 1.2 Command Window (`c8858b_compnel1.jpg`)
- Title: "コマンドウィンドウ" (Command Window)
- Grid of command icons (12+ buttons)
- Right-side tabs: 旗艦/艦艇/司令官/要塞 (Flagship/Ship/Commander/Fortress)
- **Observation:** Command window is a separate modal panel, opened via UI button or hotkey

### 1.3 Strategic Map HUD (`74fcc3_strategy.jpg`)
- Bottom-right corner shows "ログ/チャット" (Log/Chat) tab
- Chat panel is integrated into the strategic map HUD
- **Observation:** Chat is always accessible from the strategic map via the bottom-right tab

---

## 2. Send-Side Opcode Dispatcher (`FUN_004b78a0`)

**VA:** `0x004b78a0`  
**Signature:** `uint __thiscall FUN_004b78a0(int param_1, char param_2, uint param_3, undefined4 param_4)`  
**Convention:** `ecx` = `this` (param_1)

This is the client's send-side opcode dispatcher. It maps an internal index (param_3) to the actual wire opcode (iVar1) and queues the message.

### 2.1 `CommandGridChat 0x0f1c` Mapping

From the decompiled switch statement:

```c
case 0x78:
    if (*(char *)(param_1 + 0x35837e) == '\0') goto LAB_004b8516;
    iVar1 = 0xf1c;        // CommandGridChat wire opcode
    ExceptionList = &local_10;
    break;
```

- **Internal index:** `0x78` (120)
- **Wire opcode:** `0x0f1c`
- **Gate:** `param_1 + 0x35837e` must be non-zero (client flag check)
- **Message size limit:** 65 bytes (from string table: `message_size[%d] is over than 65`)

### 2.2 `CommandMoveGrid 0x0b01` Mapping

From the decompiled switch statement:

```c
case 0x28:
    iVar1 = 0xb01;        // CommandMoveGrid wire opcode
    ExceptionList = &local_10;
    break;
```

- **Internal index:** `0x28` (40)
- **Wire opcode:** `0x0b01`
- **No gate** (unlike 0x78 which checks `0x35837e`)

### 2.3 Dispatcher Cases Near Chat/Command Range

```
case 0x72 -> 0x0f16  (unknown chat-related)
case 0x73 -> 0x0f17  (unknown chat-related)
case 0x74 -> 0x0f18  (unknown chat-related)
case 0x75 -> 0x0f19  (unknown chat-related)
case 0x76 -> 0x0f1a  (unknown chat-related)
case 0x77 -> 0x0f1b  (unknown chat-related)
case 0x78 -> 0x0f1c  CommandGridChat
case 0x79 -> 0x0f1d  (unknown chat-related)
case 0x7a -> 0x0f1e  (unknown chat-related)
```

The 0x0f1x range appears to be a contiguous block of chat-related opcodes.

---

## 3. Chat UI Functions

### 3.1 Chat Parts Texture Loader

Functions referencing `chat_parts.tga`:

| VA | Function | Hits |
|----|----------|------|
| `0x005148b0` | `FUN_005148b0` | 1 |
| `0x005159e0` | `FUN_005159e0` | 33 |
| `0x00516830` | `FUN_00516830` | 11 |
| `0x00518060` | `FUN_00518060` | 4 |

**Observation:** `FUN_005159e0` with 33 hits is likely the main chat UI renderer/manager.

### 3.2 Chat Text Buffer Function

| VA | Function | String |
|----|----------|--------|
| `0x00516bf0` | `FUN_00516bf0` | `CHAT_TEXTBUF_MAXSIZE over!!!` |

This function handles chat text buffer overflow. It is likely the text input handler or the chat message formatter.

### 3.3 String Table References

From `strings.tsv`:

```
0x00766f10    GlobalChat
0x00766ff8    [Output_GlobalChat::get_length] chat_size[%d] is over than 128.
0x0076703c    [Output_GlobalChat::output_to_stream] chat_size[%d] is over than 128.
0x00767084    chat[%d]=
0x00767090    _INF:GlobalChat#
0x007670f4    [Input_GlobalChat::input_from_stream] chat_size[%d] is over than 128.
0x00767330    CommandSpotUnicastChat
0x00767348    CommandSpotChat
0x00767358    CommandGridChat
0x00767f84    [Output_CommandGridChat::get_length] message_size[%d] is over than 65.
0x00767fcc    [Output_CommandGridChat::output_to_stream] message_size[%d] is over than 65.
0x00768028    _INF:CommandGridChat#
0x0076851c    [Input_CommandGridChat::input_from_stream] message_size[%d] is over than 65.
0x0076f88c    CommandSpotUnicastChat OK
0x0076f8a8    CommandSpotChat OK
0x0076f8bc    CommandGridChat OK
0x007709ac    GlobalChat OK
0x00785828    [TAB] Chat Focus ON,OFF
0x007863d4    /../data/image/chat/chat_parts.tga
0x007864b4    CHAT_TEXTBUF_MAXSIZE over!!!
```

**Key observations:**
- `GlobalChat` has a 128-byte size limit
- `CommandGridChat` has a 65-byte message size limit
- `[TAB] Chat Focus ON,OFF` suggests a tab key toggles chat focus

---

## 4. How to Open Chat / Command Input

### 4.1 Chat Input

**Evidence from RE:**
1. The string `[TAB] Chat Focus ON,OFF` at `0x00785828` strongly suggests the **Tab key** toggles chat focus
2. The chat panel is visible in the strategic map HUD (bottom-right "ログ/チャット" tab)
3. Chat input is a text-edit widget within the chat panel

**Reproducible method (inferred):**
- Press **Tab** to toggle chat focus ON
- Type message
- Press **Enter** to send (standard behavior, not yet RE-confirmed)
- Press **Tab** again to toggle chat focus OFF

**Warning:** The Enter key behavior for sending is not yet RE-confirmed. The actual send may require a specific UI button click or another key combination.

### 4.2 Command Window

**Evidence from screenshots:**
- The command window (`c8858b_compnel1.jpg`) is a separate modal panel
- It has command icons and category tabs

**Reproducible method (unknown):**
- The exact open method is not yet identified via RE
- Likely candidates:
  - A UI button click on the strategic map HUD
  - A hotkey (possibly a function key or letter key)
  - Right-click context menu on a fleet/unit

**RE needed:** Search for callers of the command window renderer (`FUN_005159e0` or related) to identify the open trigger.

---

## 5. Direct Function Call (for automation/testing)

### 5.1 `FUN_004b78a0` — Send Opcode

**VA:** `0x004b78a0`  
**Convention:** `__thiscall`, `ecx` = `this` pointer (client state object)  
**Parameters:**
- `param_1` (ecx/this): Client state pointer
- `param_2` (dl/char): Flag (0 = queue, 1 = immediate send?)
- `param_3` (uint): Internal opcode index (0x78 for CommandGridChat, 0x28 for CommandMoveGrid)
- `param_4` (undefined4): Message data pointer (for chat: text buffer; for move: grid coordinates)

**Usage for CommandGridChat:**
```
ecx = client_state_ptr
param_2 = 0 (or 1 for immediate)
param_3 = 0x78
param_4 = pointer_to_chat_message_buffer
```

**Usage for CommandMoveGrid:**
```
ecx = client_state_ptr
param_2 = 0
param_3 = 0x28
param_4 = pointer_to_move_data
```

**Crash risk:** HIGH. Calling this directly without proper client state initialization (especially the `0x35837e` gate for chat) will likely crash or be ignored. The `this` pointer must be the correct client state object.

### 5.2 Gate Check for Chat

```c
if (*(char *)(param_1 + 0x35837e) == '\0') goto LAB_004b8516;  // skip send
```

The chat send is gated by `param_1 + 0x35837e`. This flag must be non-zero.

---

## 6. Trace Expectations

### 6.1 Chat Send Trace

If chat is successfully opened and a message sent:

```
1. Client UI: Tab key pressed -> chat focus ON
2. Client UI: Text entered in chat input widget
3. Client: FUN_00516bf0 (text buffer processing)
4. Client: FUN_004b78a0 called with param_3=0x78, param_4=message_ptr
5. Client: Gate check param_1+0x35837e != 0
6. Client: iVar1 = 0x0f1c (CommandGridChat)
7. Wire: 0x0f1c message sent to server
8. Server: Receives CommandGridChat, broadcasts to grid
```

### 6.2 Command Move Trace

If command window is opened and a move command issued:

```
1. Client UI: Command window opened (method TBD)
2. Client UI: Move command selected, target grid clicked
3. Client: FUN_004b78a0 called with param_3=0x28, param_4=grid_data
4. Client: iVar1 = 0x0b01 (CommandMoveGrid)
5. Wire: 0x0b01 message sent to server
6. Server: Receives CommandMoveGrid, processes movement
```

---

## 7. Open Questions / Next Steps

1. **Chat open method:** Confirm Tab key behavior via live client trace (`ui_explorer key --hw` with Tab key)
2. **Chat send key:** Confirm Enter key sends the message (or identify the actual send trigger)
3. **Command window open:** Identify the exact trigger (button click, hotkey, right-click menu) via RE of command window renderer callers
4. **Chat focus flag:** Determine what sets `param_1 + 0x35837e` (the chat send gate)
5. **Direct call safety:** Assess crash risk of calling `FUN_004b78a0` directly from a code cave or external tool

---

## 8. Evidence Summary

| Claim | Evidence | Confidence |
|-------|----------|------------|
| `CommandGridChat` = opcode `0x0f1c` | `FUN_004b78a0` case 0x78 -> iVar1=0x0f1c | **P0** (RE-confirmed) |
| `CommandMoveGrid` = opcode `0x0b01` | `FUN_004b78a0` case 0x28 -> iVar1=0xb01 | **P0** (RE-confirmed) |
| Chat send gated by `0x35837e` | `FUN_004b78a0` case 0x78 gate check | **P0** (RE-confirmed) |
| Tab key toggles chat focus | String `[TAB] Chat Focus ON,OFF` at 0x00785828 | **P1** (inferred from string) |
| Chat message limit = 65 bytes | String `message_size[%d] is over than 65` | **P0** (RE-confirmed) |
| Command window = separate modal | Screenshot `c8858b_compnel1.jpg` | **P0** (visual) |
| Chat UI renderer = `FUN_005159e0` | 33 references to `chat_parts.tga` | **P1** (inferred) |

---

*Document written: 2026-06-24*  
*Method: Static RE via Ghidra decompile index (`tools/logh7_redex.py`) + UI reference screenshots*
