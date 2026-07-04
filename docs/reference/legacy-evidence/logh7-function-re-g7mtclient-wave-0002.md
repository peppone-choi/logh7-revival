# LOGH VII 함수 RE — G7MTClient 웨이브 0002 요약 (결정론 재생성)

생성: `tools/logh7_func_wave_doc.py` (합성 에이전트가 세션한도로 실패하여 out batch에서 직접 재생성). 배치 64~127.

- 문서화 함수: **101**
- confidence: P0-decompile=100, P3-inferred=1
- 서브시스템: strategic=40, network=39, battle=7, render=6, core=4, file=2, ui=2, crt=1

## 옵코드 → 함수 (이 웨이브)

- `0x0323`: FUN_0042a420
- `0x0400`: FUN_00492c10, FUN_0049ad60
- `0x0402`: FUN_00493850
- `0x040c`: FUN_0049eac0
- `0x0411`: FUN_00449190
- `0x0428`: FUN_0042f930
- `0x042f`: FUN_004a7f20
- `0x3f`: FUN_00573e50
- `0x63`: FUN_00573e50
- `0x64`: FUN_00573e50
- `0x6a`: FUN_00573e50
- `0x6b`: FUN_00573e50
- `0x6c`: FUN_00573e50
- `0x6d`: FUN_00573e50
- `0x6e`: FUN_00573e50
- `0x6f`: FUN_00573e50
- `0x70`: FUN_00573e50
- `0x71`: FUN_00573e50
- `0x72`: FUN_00573e50
- `0xc01`: FUN_00555c60
- `0xf0b`: FUN_004b6e00
- `0xf0c`: FUN_004b6e00

## 함수 표

| addr | name | conv | subsystem | conf | 목적(요약) |
|---|---|---|---|---|---|
| 0x00405ea0 | FUN_00405ea0 | cdecl (3 stack | network | P0 | Serializes a CommandGenerateCharacterCharge record (the player's new-created-character payload) into a human-readable 'key=value,' |
| 0x00407260 | FUN_00407260 | cdecl (3 expli | strategic | P0 | Serializes a CommandGenerateCharacterCharge character-generation record (the param_1 struct) into a human-readable INF text dump.  |
| 0x00410690 | FUN_00410690 | cdecl (3 stack | core | P0 | Debug/text serializer that pretty-prints a ResponseStaticInformationPowerDistribution ("_INF:ResponseStaticInformationPowerDistrib |
| 0x00412770 | FUN_00412770 | cdecl (3 stack | core | P0 | Debug/text serializer that pretty-prints a ResponseStaticInformationUnitTroop ("_INF:ResponseStaticInformationUnitTroop#") record  |
| 0x00412d70 | FUN_00412d70 | cdecl (3 expli | battle | P0 | Debug/diagnostic serializer for an INF 'ResponseStaticInformationFighters' record. It reads a leading count byte at *param_1, then |
| 0x0041aff0 | FUN_0041aff0 | cdecl (3 stack | core | P0 | Debug/text serializer that pretty-prints a ResponseInformationWarehouse ("_INF:ResponseInformationWarehouse#") record (base supply |
| 0x0041b990 | FUN_0041b990 | cdecl (3 expli | network | P0 | Debug serializer/dumper for an 'INF ResponseInformationPackage' record. It dumps the package-information response structure at par |
| 0x0041c330 | FUN_0041c330 | cdecl | strategic | P0 | Human-readable text serializer (debug-dump) for an outfit/training-card information record. It walks an array of fixed-size (0x1c  |
| 0x0041cba0 | FUN_0041cba0 | cdecl (two exp | network | P0 | Deserializes (parses) the wire payload of a ResponseInformationOutfitParty message from a stream reader into the output struct par |
| 0x0041d7f0 | FUN_0041d7f0 | cdecl (no ecx= | network | P0 | Parses an ASCII text wire record for ResponseInformationOutfitParty (a fleet/party loadout description) from the buffer at param_2 |
| 0x00422620 | FUN_00422620 | cdecl (param_1 | battle | P0 | Debug/trace text dumper for a parsed 'ResponseTacticsInformationUnitShip' wire record (tactical/battle unit-ship information). It  |
| 0x004247b0 | FUN_004247b0 | cdecl (caller- | battle | P0 | Diagnostic/text dumper for a 'ResponseTacticsInformationBase' (INF) battle record. It emits a header '_INF:ResponseTacticsInformat |
| 0x00425c20 | FUN_00425c20 | cdecl (3 expli | strategic | P0 | Serializes an in-memory 'INF ResponseInformationObstacle' record (the strategic-map obstacle table for a star system) into a human |
| 0x00427160 | FUN_00427160 | cdecl (declare | network | P0 | Input_ResponseCardCharacter::input_from_stream — deserializes a ResponseCardCharacter message: an array of InformationCharacter re |
| 0x00427f30 | FUN_00427f30 | cdecl (caller- | network | P0 | Input_ResponseCardCharacter::input_from_stream — a hand-written text/CSV-style deserializer that parses a flat ASCII record (param |
| 0x0042a420 | FUN_0042a420 | cdecl (caller- | network | P0 | C++ deserializer Input_InformationDisplayCharacter::input_from_stream. It reads a complete 'display character' info record out of  |
| 0x0042af80 | FUN_0042af80 | cdecl (undefin | network | P0 | Input_InformationDisplayCharacter::input_from_stream — a text/CSV-style deserializer that parses one 'display character' info reco |
| 0x0042f930 | FUN_0042f930 | cdecl | strategic | P0 | Debug/diagnostic dumper for a NotifyChangeFlagShip (旗艦変更通知) record. It walks the struct pointed to by param_1 and emits a labeled  |
| 0x004301d0 | FUN_004301d0 | cdecl (Ghidra: | network | P0 | Deserializes a large composite 'Information' record off a binary stream into the destination struct at param_1 by repeatedly invok |
| 0x00431460 | FUN_00431460 | cdecl (param_1 | network | P0 | Text-stream deserializer that fills a large 'InformationCharacter' (and fused 'InformationSession') record from a comma/brace-deli |
| 0x00438a20 | FUN_00438a20 | cdecl (3 stack | strategic | P0 | Debug/log dump builder for an INF:NotifyBaseParameter message record (행성/기지 경제 파라미터). Emits a structured text description by calli |
| 0x0043aaa0 | FUN_0043aaa0 | cdecl (3 expli | strategic | P0 | Serializes a 'CommandSpeciallyRankUp' (INF — special promotion) strategic-command record into the game's text/INF dump format. It  |
| 0x0043b000 | FUN_0043b000 | cdecl (3 expli | strategic | P0 | Debug text serializer that dumps an 'INF:CommandRankDown' command record to a writer callback. It emits a fixed sequence of labele |
| 0x0043ce50 | FUN_0043ce50 | cdecl (3 expli | strategic | P0 | Text serializer/dumper for the 'CommandSpeciallyRankUp' strategic command structure (special/exceptional promotion command). It em |
| 0x0043d540 | FUN_0043d540 | cdecl (registe | strategic | P0 | Debug/text-serializes a 'CommandRankDown' (INF CommandRankDown) wire-record into key=value lines via FUN_00439da0. Emits header, t |
| 0x0043fd60 | FUN_0043fd60 | cdecl (effecti | network | P0 | Deserializes a 'LobbyResponseInformationCharge' (charged-character / session information) wire record off an mtStreamInputBuffer t |
| 0x00441750 | FUN_00441750 | cdecl (no this | network | P0 | Parses an ASCII text-protocol 'LobbyResponseInformationCharacter' message from a stream into a fixed-layout record array. It first |
| 0x00449190 | FUN_00449190 | cdecl (caller- | strategic | P3? | Diagnostic/text dumper for an INF 'CommandSwitchMode' strategic record (the client-side serialize-to-text of the mode-switch comma |
| 0x0044af80 | FUN_0044af80 | cdecl (3 stack | strategic | P0 | Debug/log serializer that dumps a strategic 'CommandSwitchMode' (INF) command record to a text sink. It emits a fixed header ("_IN |
| 0x00450260 | FUN_00450260 | cdecl (caller- | network | P0 | Debug/diagnostic text serializer ('dumper') for a TransactionInformationMailBegin info-record ("_INF:TransactionInformationMailBeg |
| 0x004526f0 | FUN_004526f0 | cdecl (3 stack | network | P0 | Diagnostic/debug text serializer for the 'INF CommandExchangeMailAddress' info record. It walks a fixed-layout C struct describing |
| 0x00454120 | FUN_00454120 | cdecl (param_1 | network | P0 | Human-readable text dumper/serializer of an account / character-entry information record (the surrounding string table is the 'Res |
| 0x004555c0 | FUN_004555c0 | cdecl (3 stack | network | P0 | Serializes a CommandMessengerStatus record (a player's lobby/messenger status: display name, rank, ladder, card list, outfits, cha |
| 0x00457a30 | FUN_00457a30 | cdecl (varargs | network | P0 | Textual debug-dump serializer for the ResponseInformationAccount (account information) message. It walks an in-memory account stru |
| 0x00458520 | FUN_00458520 | cdecl (single  | network | P0 | This is Output_SimpleInformationCharacter::get_length(). It computes the serialized wire byte-length of a SimpleInformationCharact |
| 0x004596d0 | FUN_004596d0 | cdecl (3 expli | network | P0 | Diagnostic/debug pretty-printer for a 'CommandMessenger' (INF CommandMessenger) record. It serializes the record field-by-field to |
| 0x00459c80 | FUN_00459c80 | thiscall (ecx  | network | P0 | Computes the serialized wire byte-length of an outgoing Output_InformationMail message and validates every embedded field length,  |
| 0x0045bf50 | FUN_0045bf50 | cdecl (stack:  | network | P0 | INF/debug serializer that dumps a CommandSendMail message structure to a text log. It opens with the literal '_INF:CommandSendMail |
| 0x0045dac0 | FUN_0045dac0 | cdecl (args on | network | P0 | Diagnostic/trace dumper that serializes an INF (information) 'CommandReadMail' command record into a labeled, human-readable text  |
| 0x0045ef90 | FUN_0045ef90 | cdecl (args on | network | P0 | Diagnostic/trace dumper that serializes an INF 'CommandDeleteMail' command record into labeled human-readable text. Structurally i |
| 0x00463f30 | FUN_00463f30 | cdecl (3 expli | network | P0 | Text serializer/dumper for the parsed 'INF:CommandReplyOrderSuggestMail' info record. It walks a fully-parsed in-memory struct (pa |
| 0x00467420 | FUN_00467420 | cdecl (3 expli | network | P0 | Diagnostic/debug pretty-printer for a 'TransactionInformationMailBegin' (INF TransactionInformationMailBegin) record. Structurally |
| 0x0046a1b0 | FUN_0046a1b0 | cdecl (3 expli | network | P0 | Human-readable text dump (debug serializer) of the CommandExchangeMailAddress (INF) message structure. It walks the message struct |
| 0x0046c030 | FUN_0046c030 | cdecl | strategic | P0 | Human-readable text serializer (debug-dump) for a player/account profile information record (Ghidra label string '_INF:CommandDele |
| 0x0046d960 | FUN_0046d960 | cdecl (3 expli | network | P0 | Serializes a CommandMessengerStatus record (param_1) into a human-readable INF text dump with nested sub-records. It emits a heade |
| 0x00470770 | FUN_00470770 | cdecl (3 expli | network | P0 | Debug/serialization dump formatter for the 'INF CommandMessengerConnection' record. It walks an elaborate structure pointed to by  |
| 0x00472890 | FUN_00472890 | cdecl | network | P0 | Debug/text serializer that dumps a parsed CommandMessenger info-record (the struct at param_1) field-by-field to a caller-supplied |
| 0x00472e40 | FUN_00472e40 | cdecl (two exp | network | P0 | C++ 역직렬화 루틴 Input_InformationMail::input_from_stream — 클라이언트가 서버 와이어 스트림에서 'InformationMail'(메일/정보) 레코드 전체를 param_1 구조체로 읽어들인다. pa |
| 0x004740e0 | FUN_004740e0 | cdecl (caller- | network | P0 | Deserializes a nested 'InformationMail' / 'SimpleInformationCharacter' record from a comma- and brace-delimited ASCII text stream  |
| 0x00475a30 | FUN_00475a30 | cdecl (param_1 | network | P0 | Debug/text serializer ('INF dump') for a CommandSendMail wire record. It walks the entire mail-command struct pointed to by param_ |
| 0x00477a90 | FUN_00477a90 | cdecl (3 expli | strategic | P0 | Debug/diagnostic dumper that serializes a player/character info record (the structure pointed to by param_1, identical layout to t |
| 0x00479450 | FUN_00479450 | cdecl (3 expli | strategic | P0 | Debug/diagnostic dumper byte-for-byte identical in logic to FUN_00477a90, differing only in the leading header label string ('_INF |
| 0x00481db0 | FUN_00481db0 | thiscall-via-f | render | P0 | C++ constructor for a ~0x2a4-byte (169-dword) composite object containing a fixed array of 52 (0x34) homogeneous sub-objects/widge |
| 0x00484c20 | FUN_00484c20 | cdecl (param_1 | network | P0 | ResponseInformationMessengerStatus::input_from_stream — 서버가 ASCII 텍스트로 직렬화한 '메신저/세션 정보' 응답 스트림(param_2가 가리키는 버퍼+0xc부터)을 파싱해 param_ |
| 0x00485fc0 | FUN_00485fc0 | cdecl (2 stack | network | P0 | Composite stream deserializer 'Input_SimpleInformationSession::input_from_stream' (the canonical session/lobby session-info record |
| 0x00487260 | FUN_00487260 | cdecl (param_1 | network | P0 | C++ method Input_InformationMail::input_from_stream — a text-stream deserializer that parses a comma/brace-delimited ASCII record  |
| 0x00488bb0 | FUN_00488bb0 | cdecl (3 stack | network | P0 | Textual debug-dump / serializer for the 'INF NotifyInformationMail' message structure. It walks the in-memory mail record pointed  |
| 0x0048c040 | FUN_0048c040 | cdecl (caller- | network | P0 | Debug/diagnostic serializer that pretty-prints (dumps) the contents of an 'INF NotifyCommandMail' message structure to a writer si |
| 0x0048edc0 | FUN_0048edc0 | cdecl | strategic | P0 | Debug-text serializer ("dump") for a CommandDeleteOutfit command record. It walks a fixed struct pointed to by param_1 and emits a |
| 0x00491a90 | FUN_00491a90 | cdecl (param_1 | strategic | P0 | Debug/log serializer (text dumper) for the CommandDeleteOutfit ('出撃艦隊編成削除' / fleet-outfit deletion) command record. It walks the r |
| 0x00492c10 | FUN_00492c10 | cdecl (param_1 | strategic | P0 | Debug/trace text serializer for a CommandMoveShip wire record (the '_INF:CommandMoveShip#' dump). It prints the header (time / wai |
| 0x00493850 | FUN_00493850 | cdecl (param_1 | strategic | P0 | Debug/trace text serializer for a CommandParallelMoveShip wire record (the '_INF:CommandParallelMoveShip#' dump). Byte-for-byte st |
| 0x00495b70 | FUN_00495b70 | cdecl (3 expli | strategic | P0 | Debug serializer/dumper for an 'INF CommandControl' record (ship subsystem-power / damage-control command). It emits scalar fields |
| 0x00496050 | FUN_00496050 | cdecl (3 expli | strategic | P0 | Debug/diagnostic serializer for an INF (information) 'CommandFileFleet' record. It walks the record pointed to by param_1 and emit |
| 0x00499a00 | FUN_00499a00 | cdecl (3 expli | strategic | P0 | Debug text serializer that dumps an 'INF:CommandMoveFortress' command record to a writer callback. It emits labeled scalar fields  |
| 0x0049ad60 | FUN_0049ad60 | cdecl (3 expli | strategic | P0 | Text serializer / debug-dump for the CommandMoveShip command record. Emits the '_INF:CommandMoveShip#' header then the scalar fiel |
| 0x0049bd40 | FUN_0049bd40 | cdecl (3 expli | strategic | P0 | Text serializer / debug-dump for the CommandParallelMoveShip command record. Structurally identical to FUN_0049ad60 but for the Pa |
| 0x0049eac0 | FUN_0049eac0 | cdecl (param_1 | battle | P0 | Debug/trace text serializer for a CommandControl wire record (the '_INF:CommandControl#' dump) — the per-ship subsystem power-allo |
| 0x0049f120 | FUN_0049f120 | cdecl (param_1 | strategic | P0 | Serializes a 'CommandFileFleet' strategic-fleet command record (the INF:CommandFileFleet log/debug dump) into a text sink. It walk |
| 0x004a3b30 | FUN_004a3b30 | cdecl (registe | strategic | P0 | Debug/text-serializes a 'CommandMoveFortress' (INF CommandMoveFortress) wire-record into key=value lines via FUN_00439da0. Emits h |
| 0x004a7100 | FUN_004a7100 | cdecl (registe | strategic | P0 | Debug/text-serializes a 'NotifyControl' (INF NotifyControl) wire-record struct into key=value lines by repeatedly calling the vari |
| 0x004a7f20 | FUN_004a7f20 | cdecl (param_1 | strategic | P0 | Debug/trace text serializer for a NotifyChangeMode wire record (the '_INF:NotifyChangeMode#' dump). NotifyChangeMode (0x042f) is t |
| 0x004b6000 | FUN_004b6000 | fastcall (ecx= | core | P0 | Constructor / initializer for the CWorldMngClient world-manager client object (the giant client-side world/strategic/tactics state |
| 0x004b6e00 | FUN_004b6e00 | fastcall (sing | strategic | P0 | Per-frame strategic-map motion/hit-test tick. When the strategic widget is active (this+0x126718 != 0) and a time interval has ela |
| 0x004c32a0 | FUN_004c32a0 | thiscall (ecx= | battle | P0 | Imports the tactical battlefield ('TacticsFieldImport'): from the giant world-state object (param_1, base of huge per-field tables |
| 0x004d3bd0 | FUN_004d3bd0 | fastcall (para | strategic | P0 | 전략맵(은하맵) 천체 렌더 서브시스템 전체를 초기화/구축한다. (1) 여러 스프라이트/렌더 빌더 풀을 리셋(FUN_004cb040/FUN_004cd380/FUN_004ce450/FUN_004cb7c0/FUN_004cd8c0)하고, ( |
| 0x004e2e30 | FUN_004e2e30 | fastcall (ecx  | battle | P0 | Loads the battle EFFECT-layer particle/3D model resources and weapon/explosion BMP textures into a render-resource object. It firs |
| 0x004eac60 | FUN_004eac60 | cdecl | crt | P0 | Multibyte-to-wide string converter that decodes a narrow (char*) string into a freshly-allocated UTF-16 (wchar) buffer under the J |
| 0x004eb100 | FUN_004eb100 | cdecl (no regi | render | P0 | Core UTF-16 string layout-and-render routine of the GDI/D3D text engine. Given a wide-character string (param_8) it walks each cod |
| 0x004ede60 | FUN_004ede60 | fastcall (ecx  | battle | P0 | Loads and registers the battle/tactical FIELD-layer 2D sprite/texture resources into a render-resource object at fixed member offs |
| 0x004f34f0 | FUN_004f34f0 | fastcall (ecx= | file | P0 | Writes the GraphicConfig.txt settings file to disk. It builds the output path by inlined strcpy of the module/base directory strin |
| 0x005123b0 | FUN_005123b0 | cdecl (no-arg) | ui | P0 | In-world (tactical/strategic battlefield) HUD / status-window layout constructor. It allocates and configures the entire on-screen |
| 0x0051bfa0 | FUN_0051bfa0 | __fastcall (ec | render | P0 | Constructs/initializes the opening (title/intro) scene object. It zeroes the first 4 members, then loads 4 TGA logo textures via F |
| 0x00551610 | FUN_00551610 | cdecl (3 expli | strategic | P0 | Debug serializer/dumper for an 'INF CommandCompletenessSupply' record. It walks the supply-completion structure pointed to by para |
| 0x00551dd0 | FUN_00551dd0 | cdecl (3 stack | strategic | P0 | Byte-for-byte duplicate of FUN_005567f0: the debug/log dump builder for an INF:CommandReorganization (함대 재편성) record. Identical fi |
| 0x00552cd0 | FUN_00552cd0 | cdecl | strategic | P0 | Debug/text serializer that dumps a parsed CommandSupplement (supply/resupply) info-record (param_1) field-by-field to a caller-sup |
| 0x00553700 | FUN_00553700 | cdecl (3 expli | strategic | P0 | Text serializer / debug-dump for the CommandCarryingInOut strategic command record (와이어 INF dump). It walks the command struct poi |
| 0x00554770 | FUN_00554770 | cdecl (caller- | strategic | P0 | Debug/diagnostic text serializer ('dumper') for an in-memory CommandAssignment info-record ("_INF:CommandAssignment# "). It walks  |
| 0x00555c60 | FUN_00555c60 | cdecl (param_1 | strategic | P0 | Debug/trace text serializer for a CommandCompletenessSupply wire record (the '_INF:CommandCompletenessSupply#' info dump). It walk |
| 0x005567f0 | FUN_005567f0 | cdecl (3 stack | strategic | P0 | Debug/log dump builder for an INF:CommandReorganization (함대 재편성) message record. Emits a structured text description of the record |
| 0x00557b80 | FUN_00557b80 | cdecl (3 expli | strategic | P0 | Text/log serializer ('describe' / dump method) for an INF CommandSupplement (補給命令 = supply command) record. It emits a labeled, br |
| 0x005588c0 | FUN_005588c0 | cdecl | strategic | P0 | Debug-text serializer ("dump") for a CommandCarryingInOut command record (base cargo/troop load/unload command). Structurally iden |
| 0x00559eb0 | FUN_00559eb0 | cdecl (3 expli | strategic | P0 | Text-dump / serializer for an INF:CommandAssignment record (strategic logistics/assignment command). Walks the fixed+variable layo |
| 0x00563c20 | FUN_00563c20 | cdecl (2 expli | network | P0 | Deserializer for the wire record 'Input_NotifySimpleInformationOrderSuggestCharacter' (str_ref 's__Input_NotifySimpleInformationOr |
| 0x005647a0 | FUN_005647a0 | cdecl (two sta | network | P0 | Parses an Input_NotifySimpleInformationOrderSuggestCharacter wire record from a textual/CSV-style stream into the destination stru |
| 0x00572170 | FUN_00572170 | thiscall | ui | P0 | Constructor for a 'TextDialog' UI object specialized as TARGET_TEXT_SELECT (text-selection dialog). ecx(this)=param_1 is the objec |
| 0x00573e50 | FUN_00573e50 | thiscall (ecx  | strategic | P0 | Strategy-map 'target select' confirm/commit handler. It is the per-frame or per-confirm driver of a multi-step strategic order-bui |
| 0x00592c30 | FUN_00592c30 | thiscall (ecx  | file | P0 | Resolves and loads the TGA face-portrait texture for a character whose face is identified by the numeric ID param_2, choosing the  |
| 0x005db950 | FUN_005db950 | fastcall (ecx= | render | P0 | Direct3D8 framework Initialize3DEnvironment routine (DirectX 8 sample framework CD3DApplication::Initialize3DEnvironment). It sele |
| 0x005dcd90 | FUN_005dcd90 | thiscall | render | P0 | DXUT/Direct3D-sample style error display dispatcher. ecx(this)=param_1 is the D3D application/framework object. Given an error cod |
| 0x005e2860 | FUN_005e2860 | cdecl (single  | render | P0 | Texture/material resource loader for a model-material descriptor. Given a material record (param_1) it derives a texture-format/us |

## verifier 적발 (영속)

```json
[
 {
  "batch": 64,
  "outPath": "E:/logh7-revival/.omo/re-audit/functions/G7MTClient/out/batch-0064.json",
  "verdict": "partial",
  "hallucinations": [
   "category=\"builder\" + subsystem=\"network\" contradicts the doc's own prose (\"This is the debug/inspection (logging) counterpart ... not a network builder\"). FUN_00463f30 has 0 callers and just formats fields through a printf-style sink (FUN_00439da0). It is a text serializer/debug dumper, not a network message builder; tagging it network/builder overstates its role.",
   "confidence=\"P0-decompile\" is mildly overstated: the meanings assigned to the five short literal data refs (0x0075ef60 '%d', 0x0075ef6c opener, 0x0075edfc separator, 0x0075eed0 closer, 0x0075ede0 terminator) are explicitly self-labeled 'Inferred'/'positional usage' inside key_data_refs, i.e. inference not decompiled string content, so the overall P0 grade is too strong for those parts."
  ],
  "paramErrors": [],
  "offsetErrors": [
   "param_1 field map claims per-outfit base 'name-len@+0x65 then name chars@+0x66'. The C body reads the per-outfit base name length from *(byte *)(puVar2 + 0x19) = BYTE 0x64 (0x19*4), not 0x65. The token 0x65 appears nowhere in the decompilation (all other 35 offset tokens cited do appear). Name chars at +0x66 is correct; the length offset 0x65 is wrong (should be 0x64)."
  ],
  "note": "Single-function batch (FUN_00463f30, INF:CommandReplyOrderSuggestMail text dumper). Cross-checked out/batch-0064.json against work/batch-0064.jsonl decompile and `python -m tools.logh7_redex func 0x00463f30 / 0x00439da0`. STRONG points: all 27 key_data_refs addresses exist in the C body (no hallucinated DAT_/string addrs); signature, void return, cdecl, and callee FUN_00439da0 = variadic printf fo"
 },
 {
  "batch": 65,
  "outPath": "E:/logh7-revival/.omo/re-audit/functions/G7MTClient/out/batch-0065.json",
  "verdict": "partial",
  "hallucinations": [
   "NO hallucinated addresses: all 26 key_data_refs VAs resolve to real .rdata. However, TWO format-fragment MEANINGS are wrong (verified by reading actual bytes from .omo/ghidra/bin/G7MTClient.exe via PE va2off):",
   "key_data_refs 0x0075edfc: maker claims 'opening/indent token (e.g. brace { or newline-indent)'. ACTUAL bytes = 'id=' (a literal field LABEL printed before *param_1, NOT a brace/indent). Wrong primary meaning.",
   "key_data_refs 0x0075ef6c: maker claims 'separator (e.g. , or field delimiter ... used between sibling fields and to open block prefixes'. ACTUAL bytes = '{' (open-brace). The header emits '_INF:CommandSendMail# { { id= %d,' so 0x0075ef6c opens blocks, it is NOT a comma/separator. Roles of brace vs separator are swapped.",
   "Minor: 0x0075ede0 claimed 'record terminator/closing token' is literally '\\n' (newline, the final emit) and 0x0075eed0 '},' and 0x0075ef60 '%d,' are roughly right but stated with hedged guesses ('e.g.') rather than the actual byte values, indicating the unnamed DAT_ fragments were inferred, not read."
  ],
  "paramErrors": [
   "No missing parameters: signature is (param_1,param_2,param_3) = 3 params, all 3 documented; redex EXACT-confirms cdecl void(undefined4*,int,undefined4*). param meanings (record*, sink, ctx) and the param_3 transient-cursor reuse note are accurate.",
   "Prose offset mislabel in param_1 meaning: SECOND character block described as 'through +0x250 (face puVar2[0x92], begin_session_age puVar2[0x93], card puVar2[0x94])'. puVar2[0x92] = +0x248 (not +0x250); +0x250 is puVar2[0x94] = card. The face offset for block 2 is +0x248, mislabeled as +0x250."
  ],
  "offsetErrors": [
   "Block-2 face offset: maker wrote +0x250 for face puVar2[0x92]; correct is +0x248 (0x92*4). +0x250 is the trailing card (puVar2[0x94]).",
   "All other offsets verified correct: rank@+0x2c (param_1+0xb), ladder@+0x2e, card-len@+0x30 (param_1+0xc), outfit-count@+0x52, face@+0x124 (puVar2[0x49]), bsa@+0x128, card@+0x12c, 2nd-block@+0x130 (puVar2[0x4c]), time@+0x254 (puVar2[0x95]), subject-len@+0x258 +
```
