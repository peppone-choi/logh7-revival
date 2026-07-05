#!/usr/bin/env node
// LOGH VII 초상화 아틀라스(tcf) 디코더 — 카탈로그(portraits.json) + PNG 추출
//
// 포맷 지식 (이전 사이클 스냅샷 5bd249c 참고 + 이번 사이클 tcf.hed 구조 재해독):
// - 초상화 페이로드: 18바이트 헤더(+12 width u16 LE, +14 height u16 LE, +16 bpp u16 LE)
//   + 1024바이트 BGRA 팔레트(256색×4바이트) + bottom-up 8bpp 인덱스 픽셀. (스냅샷 지식 재사용)
// - tcf.hed 구조 (이번 재해독 — 이전 사이클은 "슬롯 테이블 공유"로 오해해 노이즈가 많았다):
//   1355개의 8바이트 슬롯 공간이 고정 베이스의 7개 섹션으로 나뉘고, 섹션마다 아틀라스 1개가 대응된다.
//   * pair 섹션(O군, 베이스 슬롯 0/200/350): 슬롯당 [offset u32 LE][size u32 LE] = 이미지 1장.
//   * triplet 섹션(G군, 베이스 슬롯 450/750/900/1200): 레코드가 24바이트(슬롯 3개)로
//     [off0][off1][off2][size0][size1][size2] = 얼굴 1개당 이미지 변형 3장.
//   각 섹션의 max(offset+size)가 대응 아틀라스 파일 크기와 정확히 일치한다(런타임 검증):
//   0→oem(158), 200→oam(108), 350→o(25, 희소), 450→gem(90얼굴×3), 750→gef(18×3), 900→gam(15×3), 1200→gaf(3×3).
// - 그룹 규칙(docs): O군(o/oam/oem)=원작 캐논 전용, G군(gaf/gam/gef/gem)=플레이어 생성용.
//
// 사용법: node logh7_decode_tcf_portraits.mjs [--face-root <dir>] [--out <json>] [--png-dir <dir>] [--no-png]

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { deflateSync } from 'node:zlib';

const REPO_ROOT = 'E:/logh7-revival';
const DEFAULT_FACE_ROOT = join(
  REPO_ROOT,
  'artifacts/logh7-install/____________s___/____/data/image/face',
);
const DEFAULT_OUT = join(REPO_ROOT, 'server/content/generated/portraits.json');
const DEFAULT_PNG_DIR = join(REPO_ROOT, 'server/content/generated/portraits');

const TCF_HEADER_BYTES = 18;
const TCF_PALETTE_BYTES = 1024;
const HED_SLOT_BYTES = 8;

// hed 섹션 테이블: 베이스 슬롯 + 레코드 스타일. 아틀라스 대응은 파일 크기 일치로 런타임 결정.
const HED_SECTIONS = [
  { baseSlot: 0, endSlot: 200, style: 'pair' },
  { baseSlot: 200, endSlot: 350, style: 'pair' },
  { baseSlot: 350, endSlot: 450, style: 'pair' },
  { baseSlot: 450, endSlot: 750, style: 'triplet' },
  { baseSlot: 750, endSlot: 900, style: 'triplet' },
  { baseSlot: 900, endSlot: 1200, style: 'triplet' },
  { baseSlot: 1200, endSlot: 1355, style: 'triplet' },
];

function main() {
  const args = parseArgs(process.argv.slice(2));
  const faceRoot = resolve(args.faceRoot);
  const hedPath = join(faceRoot, 'tcf.hed');
  if (!existsSync(hedPath)) {
    console.error(`tcf.hed 없음: ${hedPath}`);
    process.exit(1);
  }
  const hedBytes = readFileSync(hedPath);

  // 1) 섹션별 이미지 참조 목록 구성
  const sections = HED_SECTIONS.map((section) => ({
    ...section,
    images: parseSectionImages(hedBytes, section),
  }));

  // 2) 아틀라스 파일 나열 + 섹션↔아틀라스 매핑 (max(offset+size) == 파일 크기)
  const atlasFiles = readdirSync(faceRoot, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.toLowerCase().endsWith('.tcf'))
    .map((e) => {
      const bytes = readFileSync(join(faceRoot, e.name));
      return { name: e.name, bytes };
    });

  for (const section of sections) {
    section.maxEnd = Math.max(...section.images.map((im) => im.offset + im.size));
    const matches = atlasFiles.filter((a) => a.bytes.length === section.maxEnd);
    if (matches.length !== 1) {
      console.error(
        `섹션 base=${section.baseSlot} maxEnd=${section.maxEnd} 아틀라스 매칭 실패 (후보 ${matches.length}개)`,
      );
      process.exit(1);
    }
    section.atlas = matches[0];
  }
  // 일대일 매핑 검증
  const mapped = new Set(sections.map((s) => s.atlas.name));
  if (mapped.size !== atlasFiles.length) {
    console.error(`섹션↔아틀라스 매핑이 일대일이 아님: ${[...mapped].join(',')}`);
    process.exit(1);
  }

  if (!args.noPng) mkdirSync(resolve(args.pngDir), { recursive: true });

  const sourceRootRel = normalizePath(relative(REPO_ROOT, faceRoot));
  const atlases = [];
  const portraits = [];
  const failures = [];

  // 3) 섹션별 디코드
  for (const section of sections) {
    const { name, bytes } = section.atlas;
    const group = inferGroup(name);
    let decodedCount = 0;

    for (const image of section.images) {
      const payload = bytes.subarray(image.offset, image.offset + image.size);
      const decoded = decodePortrait(payload);
      if (decoded.status !== 'decoded') {
        failures.push({ atlas: name, faceIndex: image.faceIndex, variant: image.variant, status: decoded.status });
        continue;
      }

      const stem = basename(name, '.tcf');
      const id =
        section.style === 'triplet'
          ? `${stem}-f${String(image.faceIndex).padStart(3, '0')}-v${image.variant}`
          : `${stem}-f${String(image.faceIndex).padStart(3, '0')}`;
      const entry = {
        id,
        atlas: name,
        group,
        faceIndex: image.faceIndex, // hed 섹션 내 얼굴 인덱스 (face ID 인코딩의 인덱스부)
        ...(section.style === 'triplet' ? { variant: image.variant } : {}),
        width: decoded.width,
        height: decoded.height,
        provenance: {
          file: `${sourceRootRel}/${name}`,
          offset: image.offset,
          size: image.size,
          hed: `${sourceRootRel}/tcf.hed`,
          hedSlot: image.slot,
          format:
            'tcf: 18B header(w@12,h@14,bpp@16 u16LE) + 1024B BGRA palette + bottom-up 8bpp indices',
        },
      };

      if (!args.noPng) {
        const pngPath = join(resolve(args.pngDir), `${id}.png`);
        writeFileSync(pngPath, encodeRgbaToPng(decoded.rgba, decoded.width, decoded.height));
        entry.png = normalizePath(relative(REPO_ROOT, pngPath));
      }

      portraits.push(entry);
      decodedCount += 1;
    }

    atlases.push({
      file: name,
      group,
      bytes: bytes.length,
      sha1: sha1(bytes),
      hedSection: { baseSlot: section.baseSlot, style: section.style },
      faceCount: new Set(section.images.map((im) => im.faceIndex)).size,
      imageCount: section.images.length,
      decodedCount,
      provenance: { file: `${sourceRootRel}/${name}` },
    });
  }

  atlases.sort((a, b) => a.file.localeCompare(b.file));

  // 4) 카탈로그 작성
  const catalog = {
    id: 'logh7-portraits',
    generatedAt: new Date().toISOString(),
    generator: 'tools/extract/logh7_decode_tcf_portraits.mjs',
    provenance: {
      sourceRoot: sourceRootRel,
      hed: {
        file: `${sourceRootRel}/tcf.hed`,
        sha1: sha1(hedBytes),
        slotCount: hedBytes.length / HED_SLOT_BYTES,
        sections: sections.map((s) => ({
          baseSlot: s.baseSlot,
          style: s.style,
          atlas: s.atlas.name,
          imageCount: s.images.length,
        })),
        format:
          'pair 섹션: 슬롯당 [offset u32LE][size u32LE]; triplet 섹션: 24B 레코드 [off0][off1][off2][size0][size1][size2] = 얼굴당 변형 3장; 섹션 베이스 슬롯 0/200/350=pair(O군), 450/750/900/1200=triplet(G군)',
      },
      groupRule: 'O군(o/oam/oem)=원작 캐논 전용, G군(gaf/gam/gef/gem)=플레이어 생성용',
    },
    atlasCount: atlases.length,
    atlases,
    portraitCount: portraits.length,
    groupTotals: countBy(portraits, (p) => p.group),
    failureCount: failures.length,
    failures,
    portraits,
  };

  mkdirSync(dirname(resolve(args.out)), { recursive: true });
  writeFileSync(resolve(args.out), `${JSON.stringify(catalog, null, 2)}\n`, 'utf8');
  console.log(
    JSON.stringify(
      {
        out: normalizePath(relative(REPO_ROOT, resolve(args.out))),
        portraitCount: catalog.portraitCount,
        groupTotals: catalog.groupTotals,
        failureCount: catalog.failureCount,
        atlases: atlases.map((a) => `${a.file}: faces=${a.faceCount} images=${a.imageCount} decoded=${a.decodedCount}`),
      },
      null,
      2,
    ),
  );
}

// 섹션에서 이미지 참조(offset/size/faceIndex/variant) 추출
function parseSectionImages(hedBytes, { baseSlot, endSlot, style }) {
  const images = [];
  const readU32 = (slot, half) => hedBytes.readUInt32LE(slot * HED_SLOT_BYTES + half * 4);

  if (style === 'pair') {
    for (let slot = baseSlot; slot < endSlot && (slot + 1) * HED_SLOT_BYTES <= hedBytes.length; slot += 1) {
      const offset = readU32(slot, 0);
      const size = readU32(slot, 1);
      if (size === 0) continue; // 미사용 인덱스 (희소 섹션)
      images.push({ slot, faceIndex: slot - baseSlot, variant: 0, offset, size });
    }
    return images;
  }

  // triplet: 슬롯 3개 = 레코드 1개 = 이미지 3장
  for (let slot = baseSlot; slot + 3 <= endSlot && (slot + 3) * HED_SLOT_BYTES <= hedBytes.length; slot += 3) {
    const words = [0, 1, 2, 3, 4, 5].map((k) => readU32(slot + (k >> 1), k & 1));
    const offsets = words.slice(0, 3);
    const sizes = words.slice(3, 6);
    const faceIndex = (slot - baseSlot) / 3;
    for (let v = 0; v < 3; v += 1) {
      if (sizes[v] === 0) continue;
      images.push({ slot, faceIndex, variant: v, offset: offsets[v], size: sizes[v] });
    }
  }
  return images;
}

// 초상화 페이로드 디코드 → RGBA (top-down)
function decodePortrait(payload) {
  if (payload.length < TCF_HEADER_BYTES) return { status: 'header-too-short' };
  const width = payload.readUInt16LE(12);
  const height = payload.readUInt16LE(14);
  const bpp = payload.readUInt16LE(16);
  if (width <= 0 || height <= 0) return { status: 'invalid-dimensions' };
  if (bpp !== 8) return { status: `unsupported-bpp-${bpp}` };
  const expected = TCF_HEADER_BYTES + TCF_PALETTE_BYTES + width * height;
  if (payload.length < expected) return { status: 'truncated' };

  const palette = payload.subarray(TCF_HEADER_BYTES, TCF_HEADER_BYTES + TCF_PALETTE_BYTES);
  const indices = payload.subarray(TCF_HEADER_BYTES + TCF_PALETTE_BYTES, expected);

  // bottom-up 인덱스 → top-down RGBA, 팔레트는 BGRA 순서
  const rgba = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const srcRow = height - 1 - y;
    for (let x = 0; x < width; x += 1) {
      const p = indices[srcRow * width + x] * 4;
      const t = (y * width + x) * 4;
      rgba[t] = palette[p + 2];
      rgba[t + 1] = palette[p + 1];
      rgba[t + 2] = palette[p];
      rgba[t + 3] = palette[p + 3];
    }
  }
  return { status: 'decoded', width, height, rgba };
}

// 최소 PNG 인코더 (RGBA8, 필터 0, zlib deflate)
function encodeRgbaToPng(rgba, width, height) {
  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (1 + width * 4);
    raw[rowStart] = 0; // 필터 타입 None
    rgba.copy(raw, rowStart + 1, y * width * 4, (y + 1) * width * 4);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // 비트 깊이
  ihdr[9] = 6; // 컬러 타입: RGBA

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function pngChunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function inferGroup(name) {
  const first = name[0]?.toLowerCase();
  if (first === 'o') return 'O';
  if (first === 'g') return 'G';
  return 'unknown';
}

function countBy(items, keyFn) {
  const counts = {};
  for (const item of items) counts[keyFn(item)] = (counts[keyFn(item)] ?? 0) + 1;
  return counts;
}

function sha1(bytes) {
  return createHash('sha1').update(bytes).digest('hex');
}

function normalizePath(path) {
  return path.split('\\').join('/');
}

function parseArgs(argv) {
  const args = { faceRoot: DEFAULT_FACE_ROOT, out: DEFAULT_OUT, pngDir: DEFAULT_PNG_DIR, noPng: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--face-root') args.faceRoot = argv[++i];
    else if (argv[i] === '--out') args.out = argv[++i];
    else if (argv[i] === '--png-dir') args.pngDir = argv[++i];
    else if (argv[i] === '--no-png') args.noPng = true;
    else throw new Error(`알 수 없는 인자: ${argv[i]}`);
  }
  return args;
}

main();
