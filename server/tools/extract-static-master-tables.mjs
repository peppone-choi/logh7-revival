#!/usr/bin/env node
// LOGH VII — static master-table extractor / verifier for G7MTClient.exe
//
// Goal (dead-game revival): read-only attempt to recover the 4 static
// information master tables (0x0309 PowerDistribution, 0x030d UnitTroop,
// 0x030f Fighters, 0x0311 Arms) directly from the canonical client EXE.
//
// Method: pure byte-dump decode. NO launch / attach / patch. NO value
// fabrication. Fail-closed on lineage mismatch. The RVAs are resolved to
// file offsets strictly from the PE section headers (live is ground truth,
// Ghidra addrs may drift — so the file layout itself decides the mapping).
//
// Wire layouts are documented in
//   docs/reference/legacy-evidence/logh7-proto-info-records.md  (§0, §2b-2e)
//
// Usage:
//   node server/tools/extract-static-master-tables.mjs \
//     --exe "<abs path to canonical G7MTClient.exe>" \
//     [--out server/content/generated/logh7-static-master-tables.json]

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const CANON_SHA256 =
  '825635783a9fb663ae3b9a2ecf8d4b74df648322256c57ee32f6426c42a23f22';
const CANON_IMAGE_BASE = 0x00400000;
const CANON_PE_TIMESTAMP = 0x40779eb8; // sentinel from client-lineage-current.md

// Store globals (RVA = clientBase + off) + dispatch body size, per proto doc §0.
const TARGETS = [
  { code: 0x0309, name: 'PowerDistribution', rva: 0x4130a4, size: 0x55c },
  { code: 0x030d, name: 'UnitTroop', rva: 0x412f20, size: 0x184 },
  { code: 0x030f, name: 'Fighters', rva: 0x3f5ab4, size: 0x34 },
  { code: 0x0311, name: 'Arms', rva: 0x3f5902, size: 0x1b0 },
];

function parseArgs(argv) {
  const a = { out: null, exe: null };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--exe') a.exe = argv[++i];
    else if (argv[i] === '--out') a.out = argv[++i];
  }
  return a;
}

function parsePE(buf) {
  if (buf.readUInt16LE(0) !== 0x5a4d) throw new Error('not MZ');
  const peOff = buf.readUInt32LE(0x3c);
  if (buf.readUInt32LE(peOff) !== 0x00004550) throw new Error('bad PE sig');
  const coff = peOff + 4;
  const numSections = buf.readUInt16LE(coff + 2);
  const timeDate = buf.readUInt32LE(coff + 4);
  const optSize = buf.readUInt16LE(coff + 16);
  const opt = coff + 20;
  const magic = buf.readUInt16LE(opt);
  const imageBase = buf.readUInt32LE(opt + 28);
  const secOff = opt + optSize;
  const sections = [];
  for (let i = 0; i < numSections; i++) {
    const b = secOff + i * 40;
    const nm = buf.slice(b, b + 8).toString('latin1').replace(/\0+$/, '');
    sections.push({
      name: nm,
      // PE section header: VirtualSize @ +8, VirtualAddress @ +12,
      // SizeOfRawData @ +16, PointerToRawData @ +20.
      vsize: buf.readUInt32LE(b + 8),
      vaddr: buf.readUInt32LE(b + 12),
      rawsize: buf.readUInt32LE(b + 16),
      rawptr: buf.readUInt32LE(b + 20),
    });
  }
  return { magic, imageBase, timeDate, sections };
}

// RVA here is given relative to image base 0 in the doc (clientBase+off),
// i.e. it is already the true RVA. Resolve against section table.
function mapRva(sections, rva) {
  for (const s of sections) {
    const span = Math.max(s.vsize, s.rawsize);
    if (rva >= s.vaddr && rva < s.vaddr + span) {
      const delta = rva - s.vaddr;
      const inRaw = delta < s.rawsize; // raw-backed vs zero-init (BSS) tail
      return { section: s.name, fileOff: s.rawptr + delta, inRaw, section_obj: s };
    }
  }
  return { section: null, fileOff: null, inRaw: false };
}

// ---- decoders (only used when a target is raw-backed) --------------------
function decodeArms(blob) {
  // arms[27][8] u16 LE (hit/spread matrix). 27*8*2 = 432 = 0x1b0.
  const rows = [];
  for (let r = 0; r < 27; r++) {
    const row = [];
    for (let c = 0; c < 8; c++) row.push(blob.readUInt16LE((r * 8 + c) * 2));
    rows.push(row);
  }
  return rows;
}
function decodeFighters(blob) {
  // count u8 @0x00, cap<=4, stride 0x0c. {kind u16, airbattle u16, antiship u16, defence u16, cruising f32}
  const count = blob.readUInt8(0);
  const out = [];
  for (let i = 0; i < Math.min(count, 4); i++) {
    const o = 4 + i * 0x0c;
    out.push({
      kind: blob.readUInt16LE(o + 0x00),
      airbattle: blob.readUInt16LE(o + 0x02),
      antiship: blob.readUInt16LE(o + 0x04),
      defence: blob.readUInt16LE(o + 0x06),
      cruising: blob.readFloatLE(o + 0x08),
    });
  }
  return { count, entries: out };
}
function decodeUnitTroop(blob) {
  // count u8 @0x00, cap<=16, stride 0x18.
  const count = blob.readUInt8(0);
  const out = [];
  for (let i = 0; i < Math.min(count, 16); i++) {
    const o = 4 + i * 0x18;
    out.push({
      kind: blob.readUInt16LE(o + 0x00),
      type: blob.readUInt8(o + 0x02),
      category: blob.readUInt8(o + 0x03),
      achievement: blob.readUInt16LE(o + 0x04),
      practice: blob.readUInt16LE(o + 0x06),
      practice_cost: blob.readUInt16LE(o + 0x08),
      resources: blob.readUInt16LE(o + 0x0a),
      speed: blob.readFloatLE(o + 0x0c),
      offence: blob.readUInt16LE(o + 0x10),
      defence: blob.readUInt16LE(o + 0x12),
      tailStat: blob.readUInt16LE(o + 0x14),
    });
  }
  return { count, entries: out };
}
function decodePowerDistribution(blob) {
  // fixed 0x55c blob; float/u8/u16 curve regions per proto doc §2e.
  const f = (o) => blob.readFloatLE(o);
  const move = [];
  for (let i = 0; i < 11; i++) move.push(f(0x00 + i * 4));
  const warp = [blob.readUInt8(0x2c), blob.readUInt8(0x2d)];
  const sensor = [];
  for (let i = 0; i < 4; i++) sensor.push(f(0x30 + i * 4));
  const shield = [];
  for (let a = 0; a < 11; a++) {
    const fill = [];
    for (let b = 0; b < 9; b++) fill.push(f(0x40 + (a * 9 + b) * 4));
    shield.push(fill);
  }
  const beam = [];
  for (let a = 0; a < 14; a++) {
    const fill = [];
    for (let b = 0; b < 20; b++) fill.push(blob.readUInt16LE(0x1cc + (a * 20 + b) * 2));
    beam.push(fill);
  }
  const gunBase = 0x1cc + 14 * 20 * 2;
  const gun = [];
  for (let a = 0; a < 11; a++) {
    const fill = [];
    for (let b = 0; b < 16; b++) fill.push(blob.readUInt16LE(gunBase + (a * 16 + b) * 2));
    gun.push(fill);
  }
  return { move, warp, sensor, shield, beam, gun };
}
const DECODERS = {
  0x0309: decodePowerDistribution,
  0x030d: decodeUnitTroop,
  0x030f: decodeFighters,
  0x0311: decodeArms,
};

function main() {
  const args = parseArgs(process.argv);
  if (!args.exe) {
    console.error('ERROR: --exe <abs path to canonical G7MTClient.exe> required');
    process.exit(2);
  }
  const buf = fs.readFileSync(args.exe);
  const sha = crypto.createHash('sha256').update(buf).digest('hex');
  const pe = parsePE(buf);

  // --- fail-closed lineage gate ---
  const lineageOk =
    sha === CANON_SHA256 &&
    pe.imageBase === CANON_IMAGE_BASE &&
    pe.timeDate === CANON_PE_TIMESTAMP;
  if (!lineageOk) {
    console.error('FAIL-CLOSED: lineage mismatch');
    console.error(`  sha256    got=${sha} want=${CANON_SHA256}`);
    console.error(`  imageBase got=0x${pe.imageBase.toString(16)} want=0x${CANON_IMAGE_BASE.toString(16)}`);
    console.error(`  timeDate  got=0x${pe.timeDate.toString(16)} want=0x${CANON_PE_TIMESTAMP.toString(16)}`);
    process.exit(3);
  }

  const catalog = {
    _schema: 'logh7-static-master-tables/v1',
    _source: {
      exe: 'G7MTClient.exe (canonical lineage node 825635…)',
      sha256: sha,
      imageBase: `0x${pe.imageBase.toString(16)}`,
      peTimestamp: `0x${pe.timeDate.toString(16)}`,
    },
    _method: 'pe-section-map + byte-dump-decode (read-only, no launch/patch, no fabrication)',
    _layoutSpec: 'docs/reference/legacy-evidence/logh7-proto-info-records.md §0,§2b-2e',
    _sections: pe.sections.map((s) => ({
      name: s.name,
      vaddr: `0x${s.vaddr.toString(16)}`,
      vsize: `0x${s.vsize.toString(16)}`,
      rawptr: `0x${s.rawptr.toString(16)}`,
      rawsize: `0x${s.rawsize.toString(16)}`,
    })),
    tables: {},
  };

  for (const t of TARGETS) {
    const m = mapRva(pe.sections, t.rva);
    const rec = {
      code: `0x${t.code.toString(16).padStart(4, '0')}`,
      storeGlobalRva: `0x${t.rva.toString(16)}`,
      bodySize: `0x${t.size.toString(16)} (${t.size}B)`,
      section: m.section,
      fileOffset: m.fileOff == null ? null : `0x${m.fileOff.toString(16)}`,
      rawBacked: m.inRaw,
    };
    if (m.inRaw && m.fileOff + t.size <= buf.length) {
      const blob = buf.slice(m.fileOff, m.fileOff + t.size);
      const nonzero = blob.reduce((n, b) => n + (b ? 1 : 0), 0);
      rec.nonzeroBytes = `${nonzero}/${t.size}`;
      rec.rawHexHead = blob.slice(0, 32).toString('hex');
      if (nonzero === 0) {
        rec.status = 'raw-backed-but-all-zero';
        rec.decoded = null;
      } else {
        rec.status = 'extracted';
        rec.decoded = DECODERS[t.code](blob);
      }
    } else {
      // Beyond raw-backed data (or past EOF): zero-init BSS store buffer.
      rec.status = 'not-in-exe-bss-zerofill';
      rec.decoded = null;
      rec.note =
        'RVA falls in the zero-init (BSS) tail of .data — a runtime receive ' +
        'buffer the client fills from the server record, not static data. ' +
        'No table bytes exist in the on-disk EXE.';
    }
    catalog.tables[t.name] = rec;
  }

  const anyExtracted = Object.values(catalog.tables).some((r) => r.status === 'extracted');
  catalog._verdict = anyExtracted
    ? 'partial: see per-table status'
    : 'NONE-IN-CLIENT: all 4 store globals are BSS zero-fill; tables are server-sourced (proto doc §6). Not recoverable from client EXE.';

  const outPath = args.out
    ? path.resolve(args.out)
    : path.resolve('server/content/generated/logh7-static-master-tables.json');
  fs.writeFileSync(outPath, JSON.stringify(catalog, null, 2) + '\n');
  console.log(`lineage OK (sha256 ${sha.slice(0, 12)}…, imageBase 0x${pe.imageBase.toString(16)})`);
  for (const [k, r] of Object.entries(catalog.tables)) {
    console.log(`  ${r.code} ${k.padEnd(18)} ${r.section} off=${r.fileOffset} rawBacked=${r.rawBacked} -> ${r.status}`);
  }
  console.log(`verdict: ${catalog._verdict}`);
  console.log(`wrote ${outPath}`);
}

main();
