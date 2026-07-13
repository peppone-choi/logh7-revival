// LOGH7 .mdx/.mds 전수 파서 (2단계 해독)
// 포맷: LOGH7 자체 포맷 — 직렬화된 C++ 씬그래프 메모리 이미지 (Blizzard MDX 아님, 리틀엔디안)
// 근거: git 5bd249c server/src/server/logh7-mdx-catalog.mjs (0x58/0xE8 노드워크) +
//       docs/reference/legacy-evidence/logh7-model-data-extraction.md + tools/extract/mdx_recon.py 정찰 결과
// 사용: node tools/extract/mdx_parse_all.mjs [--root <model dir>] [--out <models.json>]
import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const HEADER_PAIR_COUNT = 10; // (ptr,count) 디스크립터 10쌍 @0x00
const NODE_STRIDE = 0xe8;     // 노드 디렉토리 레코드 크기
const DEFAULT_NODE_DIR = 0x58; // 대부분의 파일에서 노드 디렉토리 시작 오프셋
const NODE_MAPPING_STRIDE = 0xac;
const TRACK_DESCRIPTOR_STRIDE = 0x1c;
const TRACK_SAMPLE_FLOAT_STRIDE = 0x24;
const TRACK_SAMPLE_COMPACT_STRIDE = 0x08;
const TRACK_SAMPLE_LIMIT = 16;
const TRANSFORM_CHANNELS = ['Tx', 'Ty', 'Tz', 'Rx', 'Ry', 'Rz', 'Sx', 'Sy', 'Sz'];
const CHANNEL_DEFAULTS = [0, 0, 0, 0, 0, 0, 1, 1, 1];
const SCRIPT_PATH = fileURLToPath(import.meta.url);

const args = process.argv.slice(2);
const getArg = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
};
const ROOT = getArg('--root', 'E:/logh7-revival/artifacts/logh7-install/____________s___/____/data/model');
const OUT = getArg('--out', 'E:/logh7-revival/server/content/generated/models.json');

// cp932 디코더 (임베디드 소스경로에 일본어 디렉토리명 포함)
let sjisDecoder = null;
try { sjisDecoder = new TextDecoder('shift_jis'); } catch { /* ICU 미지원이면 latin1 폴백 */ }

function listModelFiles(root) {
  const out = [];
  const visit = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const p = join(dir, e.name);
      if (e.isDirectory()) visit(p);
      else if (/\.(mdx|mds)$/i.test(e.name)) out.push(p);
    }
  };
  visit(root);
  return out;
}

function parseHeader(buf) {
  const pairs = [];
  for (let s = 0; s < HEADER_PAIR_COUNT; s++) {
    pairs.push({ slot: s, stale_ptr: buf.readUInt32LE(s * 8), count: buf.readUInt32LE(s * 8 + 4) });
  }
  return pairs;
}

// 노드명 유효성: 선두가 인쇄가능 ASCII이고 NUL 종단 문자열이 식별자 형태
function readCString(buf, off, max = 96) {
  let end = off;
  while (end < buf.length && end < off + max && buf[end] !== 0) end++;
  return buf.subarray(off, end).toString('latin1');
}
function isPlausibleName(s) {
  return s.length >= 1 && s.length <= 64 && /^[\x21-\x7e][\x20-\x7e]*$/.test(s);
}

// 노드 디렉토리 시작 오프셋 결정: 0x58 우선, 실패 시 pair0 stale ptr 하위워드에서 유도(0xa0-0x58=0x48 보정), 그래도 실패면 스캔
function findNodeDirStart(buf, nodeCount) {
  if (DEFAULT_NODE_DIR + nodeCount * NODE_STRIDE <= buf.length) {
    return { start: DEFAULT_NODE_DIR, method: 'default_0x58' };
  }
  const candidates = [DEFAULT_NODE_DIR];
  const low = buf.readUInt32LE(0) & 0xffff;
  if (low >= 0x48) candidates.push(low - 0x48); // 정상파일 하위워드 0xa0 → 0x58 관계에서 유도
  candidates.push(low); // 유도식이 틀릴 경우 대비
  for (const c of candidates) {
    if (c + NODE_STRIDE > buf.length) continue;
    const n0 = readCString(buf, c);
    const n1 = nodeCount > 1 && c + NODE_STRIDE < buf.length ? readCString(buf, c + NODE_STRIDE) : null;
    if (isPlausibleName(n0) && (n1 === null || isPlausibleName(n1) || n1.length === 0)) return { start: c, method: c === DEFAULT_NODE_DIR ? 'default_0x58' : 'derived_from_pair0_ptr' };
  }
  // 최후: 파일 앞 0x400 바이트에서 stride 정합 스캔
  for (let c = 0x50; c < Math.min(0x400, buf.length - NODE_STRIDE); c += 4) {
    const n0 = readCString(buf, c);
    if (!isPlausibleName(n0)) continue;
    if (nodeCount <= 1) return { start: c, method: 'scan' };
    const n1 = readCString(buf, c + NODE_STRIDE);
    if (isPlausibleName(n1) || n1.length === 0) return { start: c, method: 'scan' };
  }
  return null;
}

function parseNodes(buf, start, count) {
  const nodes = [];
  for (let i = 0; i < count; i++) {
    const off = start + i * NODE_STRIDE;
    if (off + NODE_STRIDE > buf.length) break;
    const name = readCString(buf, off);
    nodes.push({
      index: i,
      offset: off,
      name: isPlausibleName(name) ? name : null,
      mappingVirtualAddress: buf.readUInt32LE(off + 0x88),
      mappingCount: buf.readUInt32LE(off + 0x8c),
      parentIndex: buf.readInt32LE(off + 0x90),
      trackDataEndVirtualAddress: buf.readUInt32LE(off + 0x94),
    });
  }
  return nodes;
}

function relocateVirtualAddress(buf, virtualAddress, baseVirtualAddress, size = 0) {
  if (virtualAddress < baseVirtualAddress) return null;
  const offset = virtualAddress - baseVirtualAddress;
  if (!Number.isSafeInteger(offset) || offset < 0 || offset + size > buf.length) return null;
  return offset;
}

function finiteOrNull(value) {
  return Number.isFinite(value) ? value : null;
}

function parseTrackSamples(buf, offset, count, kind) {
  const stride = kind < 0 ? TRACK_SAMPLE_COMPACT_STRIDE : TRACK_SAMPLE_FLOAT_STRIDE;
  const encoding = kind < 0 ? 'compact_8' : 'float_36';
  if (!Number.isSafeInteger(count) || count <= 0 || count > Math.floor((buf.length - offset) / stride)) {
    return null;
  }
  const samples = [];
  for (let index = 0; index < Math.min(count, TRACK_SAMPLE_LIMIT); index += 1) {
    const sampleOffset = offset + index * stride;
    if (kind < 0) {
      samples.push({
        index,
        fileOffset: sampleOffset,
        value: finiteOrNull(buf.readFloatLE(sampleOffset)),
        time: buf.readUInt16LE(sampleOffset + 4),
        interpolation: buf.readUInt16LE(sampleOffset + 6),
      });
    } else {
      samples.push({
        index,
        fileOffset: sampleOffset,
        value: finiteOrNull(buf.readFloatLE(sampleOffset)),
        time: finiteOrNull(buf.readFloatLE(sampleOffset + 4)),
        interpolation: buf.readInt32LE(sampleOffset + 8),
      });
    }
  }
  return { stride, encoding, samples };
}

function parseTrack(buf, {
  channelIndex,
  trackIndex,
  trackCount,
  descriptorTableOffset,
  baseVirtualAddress,
}) {
  const channel = TRANSFORM_CHANNELS[channelIndex];
  if (trackIndex === -1) {
    return {
      ok: true,
      track: {
        channel,
        trackIndex,
        descriptorOffset: null,
        keyDataOffset: null,
        keyCount: 0,
        keyEncoding: 'channel_default',
        descriptorKind: null,
        defaultValue: CHANNEL_DEFAULTS[channelIndex],
        keys: [],
        keysTruncated: false,
      },
    };
  }
  if (trackIndex < -1 || trackIndex >= trackCount) {
    return { ok: false, error: `${channel} 트랙 인덱스 범위 오류: ${trackIndex}/${trackCount}` };
  }

  const descriptorOffset = descriptorTableOffset + trackIndex * TRACK_DESCRIPTOR_STRIDE;
  if (descriptorOffset < 0 || descriptorOffset + TRACK_DESCRIPTOR_STRIDE > buf.length) {
    return { ok: false, error: `${channel} 트랙 디스크립터 범위 오류: 0x${descriptorOffset.toString(16)}` };
  }
  const keyVirtualAddress = buf.readUInt32LE(descriptorOffset);
  const keyCount = buf.readUInt32LE(descriptorOffset + 4);
  const descriptorKind = buf.readInt32LE(descriptorOffset + 8);
  if (descriptorKind >= 0 && descriptorKind !== channelIndex) {
    return { ok: false, error: `${channel} 트랙 종류 불일치: ${descriptorKind}` };
  }
  const keyDataOffset = relocateVirtualAddress(buf, keyVirtualAddress, baseVirtualAddress);
  if (keyDataOffset === null) {
    return { ok: false, error: `${channel} 키 데이터 VA 재배치 실패: 0x${keyVirtualAddress.toString(16)}` };
  }
  const parsed = parseTrackSamples(buf, keyDataOffset, keyCount, descriptorKind);
  if (parsed === null) {
    return { ok: false, error: `${channel} 키 데이터 범위 오류: 0x${keyDataOffset.toString(16)} count=${keyCount}` };
  }
  const defaultValue = keyCount === 1 ? parsed.samples[0]?.value ?? null : null;
  return {
    ok: true,
    track: {
      channel,
      trackIndex,
      descriptorOffset,
      keyDataOffset,
      keyCount,
      keyEncoding: parsed.encoding,
      descriptorKind,
      defaultValue,
      keys: parsed.samples,
      keysTruncated: keyCount > parsed.samples.length,
    },
  };
}

function parseModelLocalTransform(buf, node, context) {
  if (node.mappingCount === 0) return { transform: null, unavailable: 'node_mapping_count_zero' };
  if (node.mappingCount !== 1) {
    return { transform: null, unavailable: `unsupported_mapping_count:${node.mappingCount}` };
  }
  const mappingRecordOffset = relocateVirtualAddress(
    buf,
    node.mappingVirtualAddress,
    context.baseVirtualAddress,
    NODE_MAPPING_STRIDE,
  );
  if (mappingRecordOffset === null) {
    return { transform: null, unavailable: 'mapping_va_relocation_failed' };
  }

  const trackIndices = TRANSFORM_CHANNELS.map((_, index) => buf.readInt32LE(mappingRecordOffset + 4 + index * 4));
  const tracks = [];
  for (let channelIndex = 0; channelIndex < TRANSFORM_CHANNELS.length; channelIndex += 1) {
    const parsed = parseTrack(buf, {
      channelIndex,
      trackIndex: trackIndices[channelIndex],
      trackCount: context.trackCount,
      descriptorTableOffset: context.descriptorTableOffset,
      baseVirtualAddress: context.baseVirtualAddress,
    });
    if (!parsed.ok) return { transform: null, unavailable: parsed.error };
    tracks.push(parsed.track);
  }

  const values = tracks.map((track) => track.defaultValue);
  const isStatic = values.every((value) => Number.isFinite(value));
  const transform = {
    mappingRecordOffset,
    trackIndices,
    staticTrsStatus: isStatic ? 'static' : 'animated',
    translation: isStatic ? values.slice(0, 3) : null,
    rotation: isStatic ? values.slice(3, 6) : null,
    scale: isStatic ? values.slice(6, 9) : null,
  };
  if (!isStatic) transform.tracks = tracks;
  return {
    transform,
    unavailable: null,
  };
}

// 임베디드 소스경로 추출: cp932 허용 바이트 시퀀스를 스티칭 후 확장자 필터
function extractSourceRefs(buf) {
  const lwo = new Set(); const images = new Set();
  let start = -1;
  const flush = (end) => {
    if (start === -1) return;
    if (end - start >= 6) {
      const raw = buf.subarray(start, end);
      let s;
      if (sjisDecoder) { try { s = sjisDecoder.decode(raw); } catch { s = raw.toString('latin1'); } }
      else s = raw.toString('latin1');
      const m = s.match(/(?:[A-Za-z]:)?[^\x00"<>|]*?\.(lwo|bmp|tga|png|jpg|dds)\b/gi);
      if (m) for (const ref of m) {
        if (/\.lwo$/i.test(ref)) lwo.add(ref); else images.add(ref);
      }
    }
    start = -1;
  };
  for (let i = 0; i < buf.length; i++) {
    const b = buf[i];
    // ASCII 인쇄가능 + cp932 리드/트레일 바이트 대역 허용
    const ok = (b >= 0x20 && b <= 0x7e) || (b >= 0x81 && b <= 0xfc);
    if (ok) { if (start === -1) start = i; }
    else flush(i);
  }
  flush(buf.length);
  return { lwo: [...lwo].sort(), images: [...images].sort() };
}

// 노드명 규약 분류 (docs 규약: ENGINE/GUN/BEAM/LASER/MISSILE/RAILGUN/FF|FR|FL|RR|RL_NN=하드포인트,
// '<obj>:LayerN'=메시, star_NN_분광형/bh_NN/ns_NN=갤럭시 천체)
function classifyNode(name) {
  if (name === null) return 'unreadable';
  if (/^(ENGINE|GUN|BEAM|LASER|MISSILE|RAILGUN)_?\d+/i.test(name)) return 'hardpoint_weapon_or_engine';
  if (/^(FF|FR|FL|RR|RL)_?\d+/i.test(name)) return 'hardpoint_position';
  if (/^star_\d+/i.test(name)) return 'galaxy_star';
  if (/^bh_\d+/i.test(name)) return 'galaxy_blackhole';
  if (/^ns_\d+/i.test(name)) return 'galaxy_neutron_star';
  if (/:Layer\d+/i.test(name)) return 'mesh_layer';
  return 'other';
}

const files = listModelFiles(ROOT);
const records = []; const failures = [];
for (const path of files) {
  const rel = relative(ROOT, path).split('\\').join('/');
  try {
    const buf = readFileSync(path);
    if (buf.length < HEADER_PAIR_COUNT * 8) throw new Error(`파일이 헤더보다 작음 (${buf.length}B)`);
    const header = parseHeader(buf);
    const nodeCount = header[0].count; // pair0 count = 씬그래프 노드 수 (샘플 검증 근거)
    const dir = findNodeDirStart(buf, nodeCount);
    let nodes = []; let nodeDirInfo = null; let warn = null;
    if (dir) {
      nodes = parseNodes(buf, dir.start, nodeCount);
      nodeDirInfo = { start: dir.start, method: dir.method };
      const bad = nodes.filter((n) => n.name === null).length;
      if (bad > 0) warn = `노드 ${bad}/${nodes.length}개 이름 판독 실패`;
    } else {
      warn = '노드 디렉토리 시작 오프셋 미발견 — 노드 목록 생략';
    }
    const refs = extractSourceRefs(buf);
    const nodeSummary = {};
    for (const n of nodes) {
      const c = classifyNode(n.name);
      nodeSummary[c] = (nodeSummary[c] ?? 0) + 1;
    }
    const formatVariant = rel.toLowerCase().endsWith('.mds') ? 'mds_high_detail' : 'mdx_standard';
    let transformStatus = 'invalid';
    let variantUnsupported = null;
    let baseVirtualAddress = null;
    let descriptorTableOffset = null;
    let trackKeyDataOffset = null;
    let transforms = nodes.map(() => ({ transform: null, unavailable: 'node_directory_unavailable' }));
    if (formatVariant === 'mds_high_detail') {
      transformStatus = 'variant_unsupported';
      variantUnsupported = 'mds_high_detail';
      transforms = nodes.map(() => ({ transform: null, unavailable: 'mds_high_detail_relocator_unsupported' }));
    } else if (dir !== null) {
      baseVirtualAddress = header[0].stale_ptr - dir.start;
      descriptorTableOffset = relocateVirtualAddress(
        buf,
        header[2].stale_ptr,
        baseVirtualAddress,
        header[2].count * TRACK_DESCRIPTOR_STRIDE,
      );
      const lastNode = nodes.at(-1);
      trackKeyDataOffset = lastNode === undefined
        ? null
        : relocateVirtualAddress(buf, lastNode.trackDataEndVirtualAddress, baseVirtualAddress);
      if (nodes.every((node) => node.mappingCount === 0)) {
        transformStatus = 'unmapped';
        transforms = nodes.map(() => ({ transform: null, unavailable: 'node_mapping_count_zero' }));
      } else if (descriptorTableOffset !== null) {
        const context = {
          baseVirtualAddress,
          descriptorTableOffset,
          trackCount: header[2].count,
        };
        transforms = nodes.map((node) => parseModelLocalTransform(buf, node, context));
        transformStatus = transforms.every((item) => item.transform !== null) ? 'mapped' : 'invalid';
      } else {
        transforms = nodes.map(() => ({ transform: null, unavailable: 'track_descriptor_table_relocation_failed' }));
      }
    }
    const transformErrors = [...new Set(transforms.map((item) => item.unavailable).filter(Boolean))];
    if (transformStatus === 'invalid' && transformErrors.length > 0) {
      warn = [warn, `모델 로컬 변환 판독 실패: ${transformErrors.join(', ')}`].filter(Boolean).join('; ');
    }
    records.push({
      path: rel,
      format_variant: formatVariant,
      size: buf.length,
      sha1: createHash('sha1').update(buf).digest('hex'),
      sha256: createHash('sha256').update(buf).digest('hex'),
      category: rel.includes('/') ? rel.slice(0, rel.indexOf('/')) : '(root)',
      header_pairs: header.map((p) => ({ slot: p.slot, count: p.count, unknown_stale_ptr: p.stale_ptr })),
      node_count: nodeCount,
      node_directory: nodeDirInfo,
      node_class_summary: nodeSummary,
      transform_status: transformStatus,
      ...(variantUnsupported === null ? {} : { variantUnsupported }),
      relocation_base_virtual_address: baseVirtualAddress,
      track_descriptor_table_offset: descriptorTableOffset,
      track_key_data_offset: trackKeyDataOffset,
      transform_unavailable_reasons: transformErrors,
      nodes: nodes.map((n, index) => ({
        index: n.index,
        name: n.name,
        class: classifyNode(n.name),
        parentIndex: n.parentIndex,
        model_local_transform: transforms[index].transform,
        ...(transforms[index].unavailable === null
          ? {}
          : { transform_unavailable_reason: transforms[index].unavailable }),
      })),
      source_lwo_refs: refs.lwo,
      texture_refs: refs.images,
      warning: warn,
    });
  } catch (err) {
    failures.push({ path: rel, error: String(err.message ?? err) });
  }
}

const out = {
  id: 'logh7-models',
  generatedAt: new Date().toISOString(),
  generator: {
    path: 'tools/extract/mdx_parse_all.mjs',
    sha256: createHash('sha256')
      .update(readFileSync(SCRIPT_PATH, 'utf8').replace(/\r\n/g, '\n'))
      .digest('hex'),
  },
  sourceRoot: ROOT,
  format: 'LOGH7 자체 포맷: 직렬화된 C++ 씬그래프 메모리 이미지. MDX는 node+0x88 매핑과 slot2 트랙을 재배치하며, 좌표는 모델 로컬이다. 전술/전략 월드 위치로 사용하지 않는다.',
  transform_schema: {
    coordinate_space: 'model_local',
    channel_order: TRANSFORM_CHANNELS,
    node_stride: NODE_STRIDE,
    mapping_record_stride: NODE_MAPPING_STRIDE,
    track_descriptor_stride: TRACK_DESCRIPTOR_STRIDE,
    key_sample_limit: TRACK_SAMPLE_LIMIT,
    key_encodings: {
      compact_8: TRACK_SAMPLE_COMPACT_STRIDE,
      float_36: TRACK_SAMPLE_FLOAT_STRIDE,
    },
    authority: 'G7MTClient FUN_005ec5d0 채널 소비 순서와 MDX 재배치 로더',
  },
  counts: {
    total_files: files.length,
    parsed: records.length,
    failed: failures.length,
    mdx: records.filter((r) => r.format_variant === 'mdx_standard').length,
    mds: records.filter((r) => r.format_variant === 'mds_high_detail').length,
    total_nodes: records.reduce((a, r) => a + r.nodes.length, 0),
    mapped_mdx_files: records.filter((r) => r.transform_status === 'mapped').length,
    unmapped_mdx_files: records.filter((r) => r.transform_status === 'unmapped').length,
    mapped_mdx_nodes: records
      .filter((r) => r.transform_status === 'mapped')
      .reduce((sum, record) => sum + record.nodes.length, 0),
    unmapped_mdx_nodes: records
      .filter((r) => r.transform_status === 'unmapped')
      .reduce((sum, record) => sum + record.nodes.length, 0),
    variant_unsupported_nodes: records
      .filter((r) => r.transform_status === 'variant_unsupported')
      .reduce((sum, record) => sum + record.nodes.length, 0),
    unique_lwo_sources: new Set(records.flatMap((r) => r.source_lwo_refs)).size,
    unique_texture_refs: new Set(records.flatMap((r) => r.texture_refs)).size,
  },
  failures,
  files: records,
};
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, `${JSON.stringify(out, null, 1)}\n`, 'utf8');
console.log(JSON.stringify({ out: OUT, ...out.counts }, null, 2));
