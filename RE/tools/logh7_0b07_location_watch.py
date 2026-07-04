#!/usr/bin/env python3
"""Read-only live watcher for 0x0b07 movement-visible state.

This complements logh7_0b07_apply_probe.py.  The apply probe proves that
NotifyMovedGrid reaches the scene event queue; this watcher records whether the
unit table, PLAYER_INFO location fields, or SelectGrid result state changes
around that event.  It installs Frida hooks and reads process memory only.
"""

from __future__ import annotations

import argparse
import csv
import importlib
import io
import json
import subprocess
import time
from collections import Counter
from pathlib import Path
from typing import Any


JS = r"""
var mod = Process.enumerateModules()[0];
var IMAGE = ptr('0x400000');
var SAMPLE_UNITS = __SAMPLE_UNITS__;
var SAMPLE_SLOTS = __SAMPLE_SLOTS__;
var lastMoveRecord = null;
function va(a){ return mod.base.add(ptr(a).sub(IMAGE)); }
function safe(fn, fallback){ try { return fn(); } catch(e){ return fallback; } }
function hex(v){
  if (v === null || v === undefined) return null;
  return safe(function(){ var p = ptr(v); return p.isNull() ? null : p.toString(); }, String(v));
}
function readPtr(a){ return safe(function(){ return ptr(a).readPointer(); }, ptr('0x0')); }
function readU8(a){ return safe(function(){ return ptr(a).readU8(); }, null); }
function readU16(a){ return safe(function(){ return ptr(a).readU16(); }, null); }
function readU32(a){ return safe(function(){ return ptr(a).readU32(); }, null); }
function readS32(a){ return safe(function(){ return ptr(a).readS32(); }, null); }
function readU32BE(a){ var lo = readU32(a); if (lo === null) return null; return ((((lo & 0xff) << 24) | ((lo & 0xff00) << 8) | ((lo >>> 8) & 0xff00) | ((lo >>> 24) & 0xff)) >>> 0); }
function argU32(ctx, n){ return safe(function(){ return ctx.esp.add(n * 4).readU32(); }, 0xffffffff); }
function argPtr(ctx, n){ return safe(function(){ return ctx.esp.add(n * 4).readPointer(); }, ptr('0x0')); }
function bytesHex(a, count){
  return safe(function(){
    var bytes = ptr(a).readByteArray(count);
    if (bytes === null) return null;
    return Array.prototype.map.call(new Uint8Array(bytes), function(b){ return ('0' + b.toString(16)).slice(-2); }).join('');
  }, null);
}
function gridPoint(v){
  if (v === null || v === undefined || v < 0 || v > 5000) return { x:null, y:null };
  return { x: v % 100, y: Math.trunc(v / 100) };
}
function isGridCell(v){ return v !== null && v !== undefined && v >= 0 && v < 5000; }

var clientBasePtr = va('0x007ccffc');
var dataRootPtr = va('0x007cd04c');
var selectState = va('0x009d2a30');
var selectResultPhase = va('0x009d2a7c');
var selectResultProgress = va('0x009d2a74');

function clientBase(){ return readPtr(clientBasePtr); }
function dataRoot(){ return readPtr(dataRootPtr); }

function nodeState(p){
  var node = ptr(p);
  if (node.isNull()) return null;
  return {
    ptr: hex(node),
    response28: readU32(node.add(0x28)),
    request2c: readS32(node.add(0x2c)),
    done34: readU8(node.add(0x34)),
    latch3c: readU8(node.add(0x3c)),
    timer44: readU32(node.add(0x44)),
    phase4c: readU32(node.add(0x4c))
  };
}

function recordUnitEntries(record){
  if (record === null || record === undefined) return null;
  var rec = ptr(record);
  if (rec.isNull()) return null;
  var count = readU8(rec.add(0x12));
  var entries = [];
  var limit = Math.max(0, Math.min(count || 0, 70, SAMPLE_UNITS));
  for (var i = 0; i < limit; i++) {
    // LAYOUT UNRESOLVED (see RE_CONFIRMED_0B07.layoutResolved=false). Three certainties say a CLEAN
    // record reads entries @0x14 LITTLE-ENDIAN: (1) the server fleet-move probe emits
    // buildNotifyMovedGridInner with entries @0x14 LE; (2) the message32 decipher FUN_00645db0 copies
    // the body VERBATIM (only the 8B outer header is ntohs/ntohl-swapped); (3) FUN_004ba2b0 case 0xb07
    // raw-copies 0x91 dwords to clientBase+0x437714. The journal #82 r2 capture was a DENSE/confounded
    // buffer (carried dwords the probe never sends) whose bytes matched intent (1,2597) only under
    // @0x13 BIG-ENDIAN. We therefore emit the primary (@0x14 LE) decode, the journal-#82 alternate
    // (@0x13 BE), and the raw bytes; a clean live A/B (server-emitted bytes vs clientBase+0x437714 in
    // one session) must settle which is canonical before any layout is promoted.
    var e13 = rec.add(0x13 + i * 8);
    var e14 = rec.add(0x14 + i * 8);
    // LIVE-CONFIRMED (clean A/B 2026-06-29, session abc-live-20260629): the record entry is @0x13
    // BIG-ENDIAN. A fresh single-0x0b07 capture (bee20-enter=1) decoded to the server intent
    // (unitId=1, cell=2597=2588+9) at @0x13 BE, while @0x14 LE gave garbage (65536/2427392). This
    // OVERTURNS the cycle-#2 (#89) static "verbatim->@0x14 LE" reversal; the live evidence wins.
    var unitId = readU32BE(e13);
    var position = readU32BE(e13.add(4));
    entries.push({
      index: i,
      unitId: unitId,
      position: position,
      positionPoint: gridPoint(position),
      rawEntry13: bytesHex(e13, 8),
      altLE14: { unitId: readU32(e14), cell: readU32(e14.add(4)), rawEntry14: bytesHex(e14, 8) }
    });
  }
  return {
    ptr: hex(rec),
    dword00: readU32(rec),
    dword04: readU32(rec.add(4)),
    mover08: readU32(rec.add(8)),
    dest0c: readU32(rec.add(0x0c)),
    half10: readU16(rec.add(0x10)),
    unitCount12: count,
    entries: entries,
    rawHead: bytesHex(rec, 0x40)
  };
}

function unitRecord(base, index){
  var row = ptr(base).add(index * 0x58);
  return {
    index: index,
    row: hex(row),
    id00: readU32(row),
    u04: readU32(row.add(0x04)),
    u08: readU32(row.add(0x08)),
    u0c: readU32(row.add(0x0c)),
    u10: readU32(row.add(0x10)),
    boats14: readU8(row.add(0x14)),
    u18: readU32(row.add(0x18)),
    u1c: readU32(row.add(0x1c)),
    u20: readU32(row.add(0x20)),
    u24: readU32(row.add(0x24)),
    u28: readU32(row.add(0x28)),
    u40: readU32(row.add(0x40)),
    u44: readU32(row.add(0x44)),
    u48: readU32(row.add(0x48)),
    raw58: bytesHex(row, 0x58)
  };
}

function unitsState(base){
  if (base.isNull()) return { count:null, samples:[] };
  var count = readU16(base.add(0x41a364));
  var samples = [];
  var limit = Math.max(0, Math.min(count || 0, SAMPLE_UNITS));
  var table = base.add(0x41a368);
  for (var i = 0; i < limit; i++) samples.push(unitRecord(table, i));
  return { count: count, table: hex(table), samples: samples };
}

function findUnitRecord(base, unitId){
  if (base.isNull() || unitId === null || unitId === undefined) return null;
  var count = readU16(base.add(0x41a364));
  var table = base.add(0x41a368);
  var limit = Math.max(0, Math.min(count || 0, 600));
  for (var i = 0; i < limit; i++) {
    var row = table.add(i * 0x58);
    if (readU32(row) === unitId) return unitRecord(table, i);
  }
  return null;
}

function characterState(base){
  if (base.isNull()) return null;
  var count = readU32(base.add(0x36a5dc));
  var samples = [];
  var limit = Math.max(0, Math.min(count || 0, SAMPLE_SLOTS));
  var table = base.add(0x36a8b4);
  for (var i = 0; i < limit; i++) {
    var row = table.add(i * 0x2d4);
    samples.push({
      index: i,
      row: hex(row),
      id00: readU32(row),
      spot1c: readU32(row.add(0x1c)),
      spotOwner20: readU32(row.add(0x20)),
      unit24: readU32(row.add(0x24)),
      raw64: bytesHex(row, 64)
    });
  }
  return {
    focusChar3584a0: readU32(base.add(0x3584a0)),
    count36a5dc: count,
    table: hex(table),
    samples: samples
  };
}

function playerSlot(slot, index){
  return {
    index: index,
    row: hex(slot),
    active00: readU8(slot),
    id24: readU32(slot.add(0x24)),
    field3cFromSource1c: readU32(slot.add(0x3c)),
    spotKey40FromSource20: readU32(slot.add(0x40)),
    spotAux44FromSource24: readU32(slot.add(0x44)),
    field48FromSource28: readU32(slot.add(0x48)),
    resolverCountA1: readU8(slot.add(0xa1)),
    resolverBase120: readU32(slot.add(0x120)),
    resolverBase124: readU32(slot.add(0x124)),
    seatCount270: readU8(slot.add(0x270)),
    together2f4: readU8(slot.add(0x2f4)),
    raw96: bytesHex(slot, 96)
  };
}

function playerInfoState(base){
  if (base.isNull()) return null;
  var focusId = readU32(base.add(0x3584a0));
  var table = base.add(0x0c);
  var pointer08 = readPtr(base.add(8));
  var active = [];
  var focusMatch = null;
  for (var i = 0; i < 592; i++) {
    var slot = table.add(i * 0x370);
    if (!readU8(slot)) continue;
    var item = playerSlot(slot, i);
    if (active.length < SAMPLE_SLOTS) active.push(item);
    if (focusMatch === null && item.id24 === focusId) focusMatch = item;
  }
  return {
    base: hex(table),
    pointerAtClientBase08: hex(pointer08),
    currentByPointer08: pointer08.isNull() ? null : playerSlot(pointer08, null),
    activeSample: active,
    focusMatch: focusMatch
  };
}

function findPlayerInfoById(base, unitOrCharId){
  if (base.isNull() || unitOrCharId === null || unitOrCharId === undefined) return null;
  var table = base.add(0x0c);
  for (var i = 0; i < 592; i++) {
    var slot = table.add(i * 0x370);
    if (!readU8(slot)) continue;
    if (readU32(slot.add(0x24)) === unitOrCharId) return playerSlot(slot, i);
  }
  return null;
}

function cellState(base, cell){
  if (base.isNull() || !isGridCell(cell)) return null;
  var cellValue = readU8(base.add(0x2c03cc + cell));
  var object = base.add(0x2c1755 + (cellValue || 0) * 3);
  return {
    cell: cell,
    point: gridPoint(cell),
    cellValue: cellValue,
    object0: readU8(object),
    object1: readU8(object.add(1)),
    object2: readU8(object.add(2))
  };
}

function uniqueCells(values){
  var out = [];
  var seen = {};
  for (var i = 0; i < values.length; i++) {
    var value = values[i];
    if (!isGridCell(value)) continue;
    var key = String(value);
    if (seen[key]) continue;
    seen[key] = true;
    out.push(value);
  }
  return out;
}

function targetState(base, record){
  var parsed = recordUnitEntries(record);
  if (base.isNull() || parsed === null) return { record: parsed, entries: [] };
  var entries = [];
  for (var i = 0; i < parsed.entries.length; i++) {
    var entry = parsed.entries[i];
    var unit = findUnitRecord(base, entry.unitId);
    var playerInfoByUnit = findPlayerInfoById(base, entry.unitId);
    var candidateCells = [entry.position, parsed.dest0c];
    if (unit !== null) {
      candidateCells.push(unit.u04, unit.u08, unit.u0c, unit.u10, unit.u40, unit.u44, unit.u48);
    }
    if (playerInfoByUnit !== null) {
      candidateCells.push(
        playerInfoByUnit.field3cFromSource1c,
        playerInfoByUnit.spotKey40FromSource20,
        playerInfoByUnit.spotAux44FromSource24,
        playerInfoByUnit.field48FromSource28
      );
    }
    entries.push({
      index: entry.index,
      unitId: entry.unitId,
      recordPosition: entry.position,
      recordPositionPoint: entry.positionPoint,
      unitRow: unit,
      playerInfoByUnitId: playerInfoByUnit,
      cells: uniqueCells(candidateCells).map(function(cell){ return cellState(base, cell); })
    });
  }
  return { record: parsed, entries: entries };
}

function selectStateSnapshot(){
  var raw = readS32(selectState.add(0x18));
  var raw2 = readS32(selectState.add(0x1c));
  return {
    p04Mode: readS32(selectState.add(0x04)),
    p0cPhase: readS32(selectState.add(0x0c)),
    p10TargetRaw: readS32(selectState.add(0x10)),
    p18SelectedX: raw,
    p1cSelectedY: raw2,
    p20Range: readS32(selectState.add(0x20)),
    p24ProjX: readS32(selectState.add(0x24)),
    p28ProjY: readS32(selectState.add(0x28))
  };
}

function snapshot(tag, extra){
  var base = clientBase();
  var root = dataRoot();
  var ownRaw = root.isNull() ? null : readS32(root.add(0x11178));
  return {
    tag: tag || 'snapshot',
    t: Date.now(),
    moduleBase: hex(mod.base),
    clientBase: hex(base),
    gridActive2a58f8: base.isNull() ? null : readU8(base.add(0x2a58f8)),
    fieldMode126711: base.isNull() ? null : readU8(base.add(0x126711)),
    ownCell11178: ownRaw,
    ownCellPoint: gridPoint(ownRaw),
    selectResult: {
      phase009d2a7c: readS32(selectResultPhase),
      progress009d2a74: readS32(selectResultProgress)
    },
    selectState: selectStateSnapshot(),
    units: unitsState(base),
    character: characterState(base),
    playerInfo: playerInfoState(base),
    target: targetState(base, lastMoveRecord),
    extra: extra || {}
  };
}

function emit(tag, extra){ send({ event: tag, state: snapshot(tag, extra || {}) }); }

try { Interceptor.attach(va('0x004bee20'), {
  onEnter:function(){ this.record = argPtr(this.context, 1); lastMoveRecord = this.record; emit('bee20-enter', { recordPtr: hex(this.record), record: recordUnitEntries(this.record) }); },
  onLeave:function(){ emit('bee20-leave', { recordPtr: hex(this.record) }); }
}); } catch(e) { send({ event:'hook-error', hook:'0x004bee20', error:String(e) }); }

try { Interceptor.attach(va('0x00517cd0'), {
  onEnter:function(){ var code = argU32(this.context, 1); if (code === 0xb07) { lastMoveRecord = argPtr(this.context, 2); emit('dispatch-b07', { code: code, recordPtr: hex(lastMoveRecord), record: recordUnitEntries(lastMoveRecord) }); } }
}); } catch(e) { send({ event:'hook-error', hook:'0x00517cd0', error:String(e) }); }

try { Interceptor.attach(va('0x00501e30'), {
  onEnter:function(){ var code = argU32(this.context, 1); if (code === 0x16) emit('enqueue-16', { code: code, targetPtr: hex(argPtr(this.context, 2)) }); }
}); } catch(e) { send({ event:'hook-error', hook:'0x00501e30', error:String(e) }); }

try { Interceptor.attach(va('0x005751b0'), {
  onEnter:function(){ this.node = this.context.ecx; this.param2 = argPtr(this.context, 1); emit('result-node-enter', { node: nodeState(this.node), param2: hex(this.param2) }); },
  onLeave:function(retval){ emit('result-node-leave', { retval: retval.toInt32(), node: nodeState(this.node), param2: hex(this.param2) }); }
}); } catch(e) { send({ event:'hook-error', hook:'0x005751b0', error:String(e) }); }

try { Interceptor.attach(va('0x004d6a80'), {
  onEnter:function(){ this.target = this.context.ecx; this.value = argU32(this.context, 1); emit('selectgrid-latch-enter', { target: nodeState(this.target), value: this.value }); },
  onLeave:function(){ emit('selectgrid-latch-leave', { target: nodeState(this.target), value: this.value }); }
}); } catch(e) { send({ event:'hook-error', hook:'0x004d6a80', error:String(e) }); }

rpc.exports = {
  snapshot:function(label){ return JSON.stringify(snapshot(label || 'poll', {})); }
};
"""


VERDICT_MESSAGES = {
    "record-missing": "No 0x0b07 apply gate hit was observed during the watch window.",
    "dispatch-missing": "FUN_004bee20 ran, but FUN_00517cd0(0x0b07) was not observed.",
    "enqueue-missing": "FUN_00517cd0(0x0b07) ran, but FUN_00501e30(0x16) was not observed.",
    "result-node-missing": "0x0b07 reached the scene queue, but the SelectGrid result node did not run in the watch window.",
    "applied-no-location-change": "0x0b07 reached the result path, but watched unit/PLAYER_INFO/cell/SelectGrid state did not change.",
    "applied-transient-selectgrid-change": (
        "0x0b07 reached the result path and transient SelectGrid state changed, "
        "but unit/PLAYER_INFO/cell/own-cell location state did not."
    ),
    "applied-location-state-changed": "0x0b07 reached the result path and persistent unit/PLAYER_INFO/cell/own-cell state changed.",
}


# 0x0b07 NotifyMovedGrid record layout. The wire body is raw-copied verbatim (0x91 dwords = 0x244
# bytes) to clientBase+0x437714 by FUN_004ba2b0 case 0xb07, then consumed via FUN_004bee20 ->
# FUN_00517cd0(0xb07) -> event 0x16 -> FUN_005751b0.
#
# ENTRY LAYOUT IS UNRESOLVED. Three certainties say a clean record reads entries @0x14 LITTLE-ENDIAN:
# (1) server buildNotifyMovedGridInner writes entries @0x14 LE; (2) message32 decipher FUN_00645db0
# copies the body VERBATIM (only the 8B outer header is ntohs/ntohl-swapped); (3) FUN_004ba2b0 case
# 0xb07 raw-copies the body. BUT the journal #82 r2 capture (.omo/ui-explorer/0b07-location-watch-
# r2-20260629) was a DENSE/confounded buffer (carried dwords like 2312/2313/49 the probe never sends)
# whose bytes matched intent (1,2597) only under @0x13 BIG-ENDIAN. So @0x14 LE is the leading
# (server+transport-derived) hypothesis and @0x13 BE is the journal-#82 alternate; a clean live A/B
# must settle which is canonical before either is promoted.
MOVE_RECORD_COUNT_OFFSET = 0x12
MOVE_RECORD_PRIMARY_ENTRY_OFFSET = 0x13
MOVE_RECORD_ALT_ENTRY_OFFSET = 0x14
MOVE_RECORD_ENTRY_STRIDE = 8
MOVE_RECORD_MAX_UNITS = 70


def decode_move_record(
    raw: bytes | str,
    *,
    entry_offset: int = MOVE_RECORD_PRIMARY_ENTRY_OFFSET,
    byte_order: str = "big",
    max_units: int = MOVE_RECORD_MAX_UNITS,
) -> dict[str, Any]:
    """Decode a raw 0x0b07 NotifyMovedGrid record (clientBase+0x437714 bytes) off-line.

    Defaults to the LIVE-CONFIRMED layout: entries @0x13 BIG-ENDIAN. A clean live A/B
    (2026-06-29, session abc-live-20260629; fresh single-0x0b07 capture) decoded to the server
    intent (unitId=1, cell=2597) ONLY at @0x13 BE, while @0x14 LE gave garbage (65536/2427392).
    Pass ``entry_offset=0x14, byte_order="little"`` to reproduce the discredited static-only read.
    Mirrors the JS recordUnitEntries parser so the layout is unit-testable without a running client.
    """
    if isinstance(raw, str):
        raw = bytes.fromhex(raw)
    if len(raw) <= MOVE_RECORD_COUNT_OFFSET:
        return {"unitCount": None, "entries": []}
    count = raw[MOVE_RECORD_COUNT_OFFSET]
    limit = max(0, min(count, max_units))
    entries: list[dict[str, Any]] = []
    for i in range(limit):
        off = entry_offset + i * MOVE_RECORD_ENTRY_STRIDE
        if off + 8 > len(raw):
            break
        entries.append(
            {
                "index": i,
                "unitId": int.from_bytes(raw[off : off + 4], byte_order),
                "cell": int.from_bytes(raw[off + 4 : off + 8], byte_order),
                "rawEntry": raw[off : off + 8].hex(),
            }
        )
    return {"unitCount": count, "entries": entries, "entryOffset": entry_offset, "byteOrder": byte_order}


RE_CONFIRMED_0B07 = {
    "recordLayout": {
        "recordLocation": "clientBase+0x437714",
        "copySite": "FUN_004ba2b0 case 0xb07 (0x91-dword verbatim copy of the wire body)",
        "size": 0x244,
        "headerSize": 0x14,
        "unitCountOffset": 0x12,
        "unitCountWidth": 1,
        "unitCountMax": 70,
        "layoutResolved": True,
        "primaryEntryOffset": 0x13,
        "primaryByteOrder": "big-endian",
        "altEntryOffset": 0x14,
        "altByteOrder": "little-endian",
        "unitEntryStride": 8,
        "unitEntryFields": {
            "unitId": 0,
            "positionOrCell": 4,
        },
        "note": (
            "Entry layout LIVE-RESOLVED = @0x13 BIG-ENDIAN. A clean A/B (2026-06-29, session "
            "abc-live-20260629) captured a fresh single fleet-move 0x0b07 (bee20-enter=1): the "
            "clientBase+0x437714 record decoded to server intent (unitId=1, cell=2597=2588+9) at "
            "@0x13 BE, while @0x14 LE gave garbage (65536/2427392). This OVERTURNS the cycle-#2 "
            "(#89) static reversal that had argued verbatim-transport -> @0x14 LE; the live "
            "evidence is authoritative. @0x14 LE is kept only as the discredited static-only alt. "
            "FUN_0044b460 remains a SEPARATE serialization registry, NOT on the 0x0b07 raw-copy path."
        ),
    },
    "consumerPath": [
        "FUN_004ba2b0 case 0xb07 copies 0x91 dwords (0x244) verbatim to clientBase+0x437714",
        "FUN_004bee20(clientBase, clientBase+0x437714) gates clientBase+0x2a58f8",
        "FUN_00517cd0(0xb07, record) enqueues deferred event 0x16",
        "FUN_00501e30(0x16, queue, record)",
        "FUN_005751b0 SelectGrid ReceiveResult FSM consumes event 0x16",
    ],
    "staticEffect": "selectgrid-result-fsm",
    "staticPersistentWriterKnown": False,
    "staticNote": (
        "The RE-confirmed 0x0b07 path is a SelectGrid result-control path. "
        "No persistent unit-table, PLAYER_INFO, cell/object, or own-cell writer is known on this path."
    ),
    "transportEvidence": (
        "message32 decipher FUN_00645db0 ntohs/ntohl-swaps only the 8-byte outer transport header "
        "and copies the message body RAW. The static inference that this implies @0x14 LE in the "
        "client record was REFUTED by the live A/B (the record reads @0x13 BE). The server<->client "
        "byte mapping (server buildNotifyMovedGridInner writes @0x14 LE in-memory; client record "
        "holds @0x13 BE) is therefore not a simple verbatim copy as #89 assumed -- an unresolved "
        "serialization/framing detail sits between them. OPEN: whether the on-wire frame already "
        "carries @0x13 BE (server functionally correct, data arrives) or a server-side fix is owed."
    ),
    "liveResolution": (
        "Clean A/B 2026-06-29 (session abc-live-20260629): fresh single fleet-move 0x0b07, watcher "
        "attached BEFORE the probe fired, bee20-enter=1. clientBase+0x437714 decoded to server "
        "intent (unitId=1, cell=2597) at @0x13 BE; @0x14 LE gave 65536/2427392. The earlier "
        "'dense/confounded buffer' explanation (#89) is refuted -- even a clean capture is @0x13 BE. "
        "verdictCode was applied-transient-selectgrid-change: data arrives correctly but only "
        "transient SelectGrid state changed, so visible relocation remains unproven (per #84)."
    ),
}


def build_js(sample_units: int = 4, sample_slots: int = 8) -> str:
    return (
        JS.replace("__SAMPLE_UNITS__", str(max(1, min(int(sample_units), 32))))
        .replace("__SAMPLE_SLOTS__", str(max(1, min(int(sample_slots), 32))))
    )


def find_pid(image_name: str = "G7MTClient.exe") -> int | None:
    out = subprocess.run(
        ["tasklist", "/FI", f"IMAGENAME eq {image_name}", "/FO", "CSV", "/NH"],
        capture_output=True,
        text=True,
        timeout=10,
        check=False,
    ).stdout
    for row in csv.reader(io.StringIO(out)):
        if len(row) >= 2 and image_name.lower() in row[0].lower():
            return int(row[1])
    return None


def session_pid(session_dir: Path) -> int:
    state = json.loads((session_dir / "session.json").read_text(encoding="utf-8"))
    pid = int(state["clientPid"])
    if pid <= 0:
        raise ValueError(f"invalid clientPid in {session_dir / 'session.json'}: {pid}")
    return pid


def location_signature(state: dict[str, Any] | None) -> dict[str, Any]:
    if not state:
        return {}
    units = state.get("units") or {}
    player = state.get("playerInfo") or {}
    character = state.get("character") or {}
    return {
        "clientBase": state.get("clientBase"),
        "gridActive2a58f8": state.get("gridActive2a58f8"),
        "fieldMode126711": state.get("fieldMode126711"),
        "ownCell11178": state.get("ownCell11178"),
        "selectResult": state.get("selectResult"),
        "selectState": state.get("selectState"),
        "units": {
            "count": units.get("count"),
            "samples": [
                {k: row.get(k) for k in ("index", "id00", "u08", "u0c", "u10", "u40", "u44", "u48", "raw58")}
                for row in (units.get("samples") or [])
            ],
        },
        "character": {
            "focusChar3584a0": character.get("focusChar3584a0"),
            "count36a5dc": character.get("count36a5dc"),
            "samples": [
                {k: row.get(k) for k in ("index", "id00", "spot1c", "spotOwner20", "unit24", "raw64")}
                for row in (character.get("samples") or [])
            ],
        },
        "playerInfo": {
            "pointerAtClientBase08": player.get("pointerAtClientBase08"),
            "currentByPointer08": _player_location_fields(player.get("currentByPointer08")),
            "focusMatch": _player_location_fields(player.get("focusMatch")),
            "activeSample": [_player_location_fields(row) for row in (player.get("activeSample") or [])],
        },
        "target": target_signature(state.get("target")),
    }


def target_signature(target: dict[str, Any] | None) -> dict[str, Any] | None:
    if target is None:
        return None
    record = target.get("record") or {}
    return {
        "record": {
            k: record.get(k)
            for k in ("ptr", "dword00", "dword04", "mover08", "dest0c", "half10", "unitCount12", "entries")
        },
        "entries": [
            {
                "index": entry.get("index"),
                "unitId": entry.get("unitId"),
                "recordPosition": entry.get("recordPosition"),
                "unitRow": _unit_location_fields(entry.get("unitRow")),
                "playerInfoByUnitId": _player_location_fields(entry.get("playerInfoByUnitId")),
                "cells": entry.get("cells") or [],
            }
            for entry in (target.get("entries") or [])
        ],
    }


def _unit_location_fields(row: dict[str, Any] | None) -> dict[str, Any] | None:
    if row is None:
        return None
    return {
        k: row.get(k)
        for k in ("index", "id00", "u04", "u08", "u0c", "u10", "u40", "u44", "u48", "raw58")
    }


def _player_location_fields(row: dict[str, Any] | None) -> dict[str, Any] | None:
    if row is None:
        return None
    return {
        k: row.get(k)
        for k in (
            "index",
            "id24",
            "field3cFromSource1c",
            "spotKey40FromSource20",
            "spotAux44FromSource24",
            "field48FromSource28",
            "seatCount270",
            "raw96",
        )
    }


def _state_event(event: dict[str, Any]) -> dict[str, Any] | None:
    state = event.get("state")
    return state if isinstance(state, dict) else None


def _first_index(events: list[dict[str, Any]], names: set[str]) -> int | None:
    for index, event in enumerate(events):
        if event.get("event") in names:
            return index
    return None


def _first_state_for_event(events: list[dict[str, Any]], name: str) -> dict[str, Any] | None:
    for event in events:
        if event.get("event") == name:
            state = _state_event(event)
            if state is not None:
                return state
    return None


def _last_state_before(events: list[dict[str, Any]], index: int | None) -> dict[str, Any] | None:
    upper = len(events) if index is None else index
    for event in reversed(events[:upper]):
        state = _state_event(event)
        if state is not None:
            return state
    return None


def _last_state(events: list[dict[str, Any]]) -> dict[str, Any] | None:
    for event in reversed(events):
        state = _state_event(event)
        if state is not None:
            return state
    return None


def _changed_sections(before: dict[str, Any], after: dict[str, Any]) -> list[str]:
    return [key for key in sorted(set(before) | set(after)) if before.get(key) != after.get(key)]


def movement_change_flags(before_state: dict[str, Any] | None, after_state: dict[str, Any] | None) -> dict[str, Any]:
    before = location_signature(before_state)
    after = location_signature(after_state)
    before_target = before.get("target") or {}
    after_target = after.get("target") or {}
    before_entries = before_target.get("entries") or []
    after_entries = after_target.get("entries") or []
    before_by_unit = {entry.get("unitId"): entry for entry in before_entries}
    after_by_unit = {entry.get("unitId"): entry for entry in after_entries}
    unit_ids = sorted(
        {unit_id for unit_id in set(before_by_unit) | set(after_by_unit) if unit_id is not None},
        key=lambda value: str(value),
    )
    entry_diffs = []
    unit_row_changed = False
    player_info_changed = False
    cell_object_changed = False
    for unit_id in unit_ids:
        before_entry = before_by_unit.get(unit_id) or {}
        after_entry = after_by_unit.get(unit_id) or {}
        unit_changed = before_entry.get("unitRow") != after_entry.get("unitRow")
        player_changed = before_entry.get("playerInfoByUnitId") != after_entry.get("playerInfoByUnitId")
        cells_changed = before_entry.get("cells") != after_entry.get("cells")
        unit_row_changed = unit_row_changed or unit_changed
        player_info_changed = player_info_changed or player_changed
        cell_object_changed = cell_object_changed or cells_changed
        entry_diffs.append(
            {
                "unitId": unit_id,
                "unitRowChanged": unit_changed,
                "playerInfoChanged": player_changed,
                "cellObjectChanged": cells_changed,
                "recordPositionBefore": before_entry.get("recordPosition"),
                "recordPositionAfter": after_entry.get("recordPosition"),
            }
        )

    select_grid_state_changed = (
        before.get("selectResult") != after.get("selectResult")
        or before.get("selectState") != after.get("selectState")
    )
    own_cell_changed = before.get("ownCell11178") != after.get("ownCell11178")
    return {
        "unitIds": unit_ids,
        "unitRowChanged": unit_row_changed,
        "playerInfoChanged": player_info_changed,
        "cellObjectChanged": cell_object_changed,
        "selectGridStateChanged": select_grid_state_changed,
        "ownCellChanged": own_cell_changed,
        "entryDiffs": entry_diffs,
        "anyPersistentLocationChanged": unit_row_changed or player_info_changed or cell_object_changed,
        "anyWatchedStateChanged": (
            unit_row_changed
            or player_info_changed
            or cell_object_changed
            or select_grid_state_changed
            or own_cell_changed
        ),
    }


def classify_watch_events(events: list[dict[str, Any]]) -> dict[str, Any]:
    counts = Counter(str(event.get("event")) for event in events)
    first_apply_index = _first_index(events, {"bee20-enter", "dispatch-b07", "enqueue-16", "result-node-enter"})
    before_state = _first_state_for_event(events, "bee20-enter") or _last_state_before(events, first_apply_index)
    after_state = _last_state(events)
    before_sig = location_signature(before_state)
    after_sig = location_signature(after_state)
    changed_sections = _changed_sections(before_sig, after_sig)
    movement_flags = movement_change_flags(before_state, after_state)
    persistent_location_changed = bool(
        movement_flags["anyPersistentLocationChanged"] or movement_flags["ownCellChanged"]
    )
    watched_state_changed = bool(movement_flags["anyWatchedStateChanged"])

    if counts["bee20-enter"] == 0:
        code = "record-missing"
    elif counts["dispatch-b07"] == 0:
        code = "dispatch-missing"
    elif counts["enqueue-16"] == 0:
        code = "enqueue-missing"
    elif counts["result-node-enter"] == 0:
        code = "result-node-missing"
    elif persistent_location_changed:
        code = "applied-location-state-changed"
    elif watched_state_changed:
        code = "applied-transient-selectgrid-change"
    else:
        code = "applied-no-location-change"

    return {
        "verdictCode": code,
        "verdict": VERDICT_MESSAGES[code],
        "reEvidence": RE_CONFIRMED_0B07,
        "knownConsumerEffect": RE_CONFIRMED_0B07["staticEffect"],
        "staticPersistentWriterKnown": RE_CONFIRMED_0B07["staticPersistentWriterKnown"],
        "eventCounts": dict(counts),
        "locationStateChanged": persistent_location_changed,
        "watchedStateChanged": watched_state_changed,
        "changedSections": changed_sections,
        **movement_flags,
        "baselineState": before_state,
        "finalState": after_state,
    }


def run_watch(
    *,
    pid: int,
    seconds: float,
    interval: float,
    sample_units: int,
    sample_slots: int,
    timeline_out: Path | None,
) -> dict[str, Any]:
    frida = importlib.import_module("frida")
    session = frida.attach(pid)
    script = session.create_script(build_js(sample_units=sample_units, sample_slots=sample_slots))
    events: list[dict[str, Any]] = []
    timeline_handle = None

    def record(event: dict[str, Any]) -> None:
        events.append(event)
        if timeline_handle is not None:
            timeline_handle.write(json.dumps(event, ensure_ascii=False, sort_keys=True) + "\n")
            timeline_handle.flush()

    def on_message(message: dict[str, Any], data: bytes | None) -> None:
        payload = message.get("payload")
        if isinstance(payload, dict):
            record(payload)
        else:
            record({"event": "frida-message", "message": message, "dataLength": 0 if data is None else len(data)})

    try:
        if timeline_out is not None:
            timeline_out.parent.mkdir(parents=True, exist_ok=True)
            timeline_handle = timeline_out.open("w", encoding="utf-8")
        script.on("message", on_message)
        script.load()
        rpc = script.exports_sync
        started = time.time()
        while time.time() - started < seconds:
            state = json.loads(rpc.snapshot("poll"))
            record({"event": "poll", "state": state})
            time.sleep(max(0.1, interval))
        state = json.loads(rpc.snapshot("final-poll"))
        record({"event": "final-poll", "state": state})
    finally:
        try:
            script.unload()
        finally:
            try:
                session.detach()
            finally:
                if timeline_handle is not None:
                    timeline_handle.close()

    return {
        "pid": pid,
        "seconds": seconds,
        "interval": interval,
        "sampleUnits": sample_units,
        "sampleSlots": sample_slots,
        "events": len(events),
        "timelineOut": str(timeline_out) if timeline_out is not None else None,
        **classify_watch_events(events),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--seconds", type=float, default=30.0)
    parser.add_argument("--interval", type=float, default=0.5)
    parser.add_argument("--pid", type=int)
    parser.add_argument("--image-name", default="G7MTClient.exe")
    parser.add_argument("--session", type=Path, help="ui_explorer session dir; used when --pid is omitted")
    parser.add_argument("--sample-units", type=int, default=4)
    parser.add_argument("--sample-slots", type=int, default=8)
    parser.add_argument("--out", type=Path)
    parser.add_argument("--timeline-out", type=Path)
    args = parser.parse_args()

    pid = args.pid
    if pid is None and args.session is not None:
        pid = session_pid(args.session)
    if pid is None:
        pid = find_pid(args.image_name)
    if not pid:
        print(json.dumps({"error": "no pid", "imageName": args.image_name}, indent=1))
        return 1

    timeline_out = args.timeline_out
    if timeline_out is None and args.out is not None:
        timeline_out = args.out.with_suffix(".jsonl")
    result = run_watch(
        pid=pid,
        seconds=args.seconds,
        interval=args.interval,
        sample_units=args.sample_units,
        sample_slots=args.sample_slots,
        timeline_out=timeline_out,
    )
    encoded = json.dumps(result, ensure_ascii=False, indent=1)
    if args.out is not None:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(encoded + "\n", encoding="utf-8")
    print(encoded)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
