import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SERVER_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const REPO_ROOT = join(SERVER_ROOT, '..');
const DEFAULT_FACE_ROOT = join(REPO_ROOT, '.omo', 'work', 'logh7-installed', 'data', 'image', 'Face');

const TCF_HEADER_BYTES = 18;
const TCF_PALETTE_BYTES = 1024;
const TCF_HED_SLOT_BYTES = 8;
const TCF_WIDTH_OFFSET = 12;
const TCF_HEIGHT_OFFSET = 14;
const TCF_BPP_OFFSET = 16;

export function catalogTcfPortraitDirectory({
  faceRoot = DEFAULT_FACE_ROOT,
  workspaceRoot = REPO_ROOT,
  failureSampleLimit = 16,
} = {}) {
  const absoluteRoot = resolve(faceRoot);
  const sourceRoot = normalizePath(relative(workspaceRoot, absoluteRoot));
  if (!existsSync(absoluteRoot)) {
    return {
      id: 'logh7-face-portrait-catalog',
      sourceRoot,
      status: 'missing',
      archives: [],
    };
  }

  const hedPath = join(absoluteRoot, 'tcf.hed');
  if (!existsSync(hedPath)) {
    return {
      id: 'logh7-face-portrait-catalog',
      sourceRoot,
      status: 'hed-missing',
      archives: [],
    };
  }

  const slots = readTcfHedSlots(hedPath);
  const usedSlots = slots.filter((slot) => slot.size > 0);
  const archives = listCurrentTcfArchives(absoluteRoot).map((archivePath) =>
    catalogArchivePortraits(archivePath, absoluteRoot, usedSlots, failureSampleLimit),
  );

  return {
    id: 'logh7-face-portrait-catalog',
    sourceRoot,
    status: 'present',
    storage: '18-byte header + 1024-byte BGRA palette + bottom-up 8-bit indices',
    hed: {
      path: 'tcf.hed',
      slotCount: slots.length,
      usedSlotCount: usedSlots.length,
      zeroSlotCount: slots.length - usedSlots.length,
    },
    archiveCount: archives.length,
    archives,
    totals: summarizeArchives(archives),
  };
}

export function catalogArchivePortraits(archivePath, faceRoot, usedSlots, failureSampleLimit = 16) {
  const bytes = readFileSync(archivePath);
  const portraits = [];
  const failureCounts = new Map();
  const failureSamples = [];
  let outsideArchiveCount = 0;

  for (const slot of usedSlots) {
    if (slot.offset + slot.size > bytes.length) {
      outsideArchiveCount += 1;
      continue;
    }

    const payload = bytes.subarray(slot.offset, slot.offset + slot.size);
    const decoded = decodeTcfPortraitPayload(payload);
    if (decoded.status === 'decoded') {
      portraits.push({
        slot: slot.slot,
        offset: slot.offset,
        size: slot.size,
        headerHex: decoded.headerHex,
        width: decoded.width,
        height: decoded.height,
        bitsPerPixel: decoded.bitsPerPixel,
        expectedSize: decoded.expectedSize,
        extraBytes: decoded.extraBytes,
        paletteSha1: decoded.paletteSha1,
        indicesSha1: decoded.indicesSha1,
        rgbaSha1: decoded.rgbaSha1,
        rgbaSampleHex: decoded.rgbaSampleHex,
      });
    } else {
      increment(failureCounts, decoded.status);
      if (failureSamples.length < failureSampleLimit) {
        failureSamples.push({
          slot: slot.slot,
          offset: slot.offset,
          size: slot.size,
          status: decoded.status,
          width: decoded.width,
          height: decoded.height,
          bitsPerPixel: decoded.bitsPerPixel,
          expectedSize: decoded.expectedSize,
          missingBytes: decoded.missingBytes,
        });
      }
    }
  }

  return {
    path: normalizePath(relative(faceRoot, archivePath)),
    name: basename(archivePath),
    group: inferArchiveGroup(basename(archivePath)),
    size: bytes.length,
    sha1: sha1(bytes),
    eligibleSlotCount: usedSlots.length,
    decodedCount: portraits.length,
    outsideArchiveCount,
    failureCounts: Object.fromEntries([...failureCounts.entries()].sort(([left], [right]) => left.localeCompare(right))),
    failureSamples,
    portraits,
  };
}

export function decodeTcfPortraitPayload(payload) {
  const decoded = decodeTcfPortraitImage(payload);
  if (decoded.status !== 'decoded') {
    return decoded;
  }

  return {
    status: decoded.status,
    headerHex: decoded.headerHex,
    width: decoded.width,
    height: decoded.height,
    bitsPerPixel: decoded.bitsPerPixel,
    expectedSize: decoded.expectedSize,
    extraBytes: decoded.extraBytes,
    paletteSha1: sha1(decoded.palette),
    indicesSha1: sha1(decoded.indices),
    rgbaSha1: sha1(decoded.rgba),
    rgbaSampleHex: decoded.rgba.subarray(0, Math.min(decoded.rgba.length, 16)).toString('hex'),
  };
}

export function decodeTcfPortraitImage(payload) {
  const headerHex = payload.subarray(0, Math.min(payload.length, TCF_HEADER_BYTES)).toString('hex');
  if (payload.length < TCF_HEADER_BYTES) {
    return {
      status: 'header-too-short',
      headerHex,
      expectedSize: TCF_HEADER_BYTES,
      missingBytes: TCF_HEADER_BYTES - payload.length,
    };
  }

  const width = payload.readUInt16LE(TCF_WIDTH_OFFSET);
  const height = payload.readUInt16LE(TCF_HEIGHT_OFFSET);
  const bitsPerPixel = payload.readUInt16LE(TCF_BPP_OFFSET);
  const expectedPixelBytes = width * height;
  const expectedSize = TCF_HEADER_BYTES + TCF_PALETTE_BYTES + expectedPixelBytes;

  if (width <= 0 || height <= 0) {
    return { status: 'invalid-dimensions', headerHex, width, height, bitsPerPixel, expectedSize };
  }

  if (bitsPerPixel !== 8) {
    return { status: 'unsupported-bpp', headerHex, width, height, bitsPerPixel, expectedSize };
  }

  if (payload.length < TCF_HEADER_BYTES + TCF_PALETTE_BYTES) {
    return {
      status: 'palette-too-short',
      headerHex,
      width,
      height,
      bitsPerPixel,
      expectedSize,
      missingBytes: TCF_HEADER_BYTES + TCF_PALETTE_BYTES - payload.length,
    };
  }

  if (payload.length < expectedSize) {
    return {
      status: 'truncated-pixel-data',
      headerHex,
      width,
      height,
      bitsPerPixel,
      expectedSize,
      missingBytes: expectedSize - payload.length,
    };
  }

  const palette = payload.subarray(TCF_HEADER_BYTES, TCF_HEADER_BYTES + TCF_PALETTE_BYTES);
  const indices = payload.subarray(TCF_HEADER_BYTES + TCF_PALETTE_BYTES, expectedSize);
  const rgba = decodeTcfIndexedBgraToRgba({ palette, indices, width, height });

  return {
    status: 'decoded',
    headerHex,
    width,
    height,
    bitsPerPixel,
    expectedSize,
    extraBytes: payload.length - expectedSize,
    palette,
    indices,
    rgba,
  };
}

export function decodeTcfIndexedBgraToRgba({ palette, indices, width, height }) {
  if (palette.length < TCF_PALETTE_BYTES) {
    throw new Error(`palette must contain ${TCF_PALETTE_BYTES} bytes`);
  }
  if (indices.length < width * height) {
    throw new Error(`indices must contain ${width * height} bytes`);
  }

  const rgba = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const sourceRow = height - 1 - y;
    for (let x = 0; x < width; x += 1) {
      const paletteIndex = indices[sourceRow * width + x];
      const paletteOffset = paletteIndex * 4;
      const targetOffset = (y * width + x) * 4;
      rgba[targetOffset] = palette[paletteOffset + 2];
      rgba[targetOffset + 1] = palette[paletteOffset + 1];
      rgba[targetOffset + 2] = palette[paletteOffset];
      rgba[targetOffset + 3] = palette[paletteOffset + 3];
    }
  }
  return rgba;
}

export function writeTcfPortraitCatalog(path, catalog) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(catalog, null, 2)}\n`, 'utf8');
}

export function encodeRgbaToBmp24({ rgba, width, height }) {
  if (rgba.length < width * height * 4) {
    throw new Error(`rgba must contain ${width * height * 4} bytes`);
  }

  const rowStride = Math.ceil((width * 3) / 4) * 4;
  const pixelBytes = rowStride * height;
  const headerBytes = 14 + 40;
  const output = Buffer.alloc(headerBytes + pixelBytes);

  output.write('BM', 0, 2, 'ascii');
  output.writeUInt32LE(output.length, 2);
  output.writeUInt32LE(headerBytes, 10);
  output.writeUInt32LE(40, 14);
  output.writeInt32LE(width, 18);
  output.writeInt32LE(height, 22);
  output.writeUInt16LE(1, 26);
  output.writeUInt16LE(24, 28);
  output.writeUInt32LE(0, 30);
  output.writeUInt32LE(pixelBytes, 34);
  output.writeInt32LE(2835, 38);
  output.writeInt32LE(2835, 42);

  for (let y = 0; y < height; y += 1) {
    const sourceY = height - 1 - y;
    const targetRow = headerBytes + y * rowStride;
    for (let x = 0; x < width; x += 1) {
      const sourceOffset = (sourceY * width + x) * 4;
      const targetOffset = targetRow + x * 3;
      output[targetOffset] = rgba[sourceOffset + 2];
      output[targetOffset + 1] = rgba[sourceOffset + 1];
      output[targetOffset + 2] = rgba[sourceOffset];
    }
  }

  return output;
}

export function exportTcfPortraitBmps({
  catalog,
  faceRoot = DEFAULT_FACE_ROOT,
  outDir,
  limitPerArchive = 3,
  workspaceRoot = REPO_ROOT,
} = {}) {
  if (!catalog || catalog.status !== 'present') {
    throw new Error('catalog must be present');
  }
  if (!outDir) {
    throw new Error('outDir is required');
  }

  const absoluteFaceRoot = resolve(faceRoot);
  const absoluteOutDir = resolve(outDir);
  mkdirSync(absoluteOutDir, { recursive: true });

  const outputs = [];
  for (const archive of catalog.archives) {
    const archivePath = join(absoluteFaceRoot, archive.path);
    const archiveBytes = readFileSync(archivePath);
    const selected = limitPerArchive === null ? archive.portraits : archive.portraits.slice(0, limitPerArchive);
    for (const portrait of selected) {
      const payload = archiveBytes.subarray(portrait.offset, portrait.offset + portrait.size);
      const decoded = decodeTcfPortraitImage(payload);
      if (decoded.status !== 'decoded') {
        continue;
      }

      const fileName = `${basename(archive.path, '.tcf')}-slot${String(portrait.slot).padStart(4, '0')}-${decoded.width}x${decoded.height}.bmp`;
      const outputPath = join(absoluteOutDir, fileName);
      const bmp = encodeRgbaToBmp24({ rgba: decoded.rgba, width: decoded.width, height: decoded.height });
      writeFileSync(outputPath, bmp);
      outputs.push({
        archive: archive.path,
        slot: portrait.slot,
        width: decoded.width,
        height: decoded.height,
        path: normalizePath(relative(workspaceRoot, outputPath)),
        size: bmp.length,
        sha1: sha1(bmp),
      });
    }
  }

  return {
    id: 'logh7-tcf-portrait-bmp-export',
    sourceCatalog: catalog.id,
    sourceRoot: catalog.sourceRoot,
    outDir: normalizePath(relative(workspaceRoot, absoluteOutDir)),
    limitPerArchive,
    outputCount: outputs.length,
    outputs,
  };
}

function readTcfHedSlots(path) {
  const bytes = readFileSync(path);
  const slots = [];
  for (let offset = 0; offset + TCF_HED_SLOT_BYTES <= bytes.length; offset += TCF_HED_SLOT_BYTES) {
    slots.push({
      slot: offset / TCF_HED_SLOT_BYTES,
      offset: bytes.readUInt32LE(offset),
      size: bytes.readUInt32LE(offset + 4),
    });
  }
  return slots;
}

function listCurrentTcfArchives(root) {
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.tcf'))
    .map((entry) => join(root, entry.name))
    .sort((left, right) => basename(left).localeCompare(basename(right)));
}

function inferArchiveGroup(name) {
  const first = name[0]?.toLowerCase();
  if (first === 'o') return 'O-group-canon';
  if (first === 'g') return 'G-group-player';
  return 'unknown';
}

function summarizeArchives(archives) {
  const totals = {
    decodedCount: 0,
    outsideArchiveCount: 0,
    failureCounts: {},
  };
  for (const archive of archives) {
    totals.decodedCount += archive.decodedCount;
    totals.outsideArchiveCount += archive.outsideArchiveCount;
    for (const [status, count] of Object.entries(archive.failureCounts)) {
      totals.failureCounts[status] = (totals.failureCounts[status] ?? 0) + count;
    }
  }
  totals.failureCounts = Object.fromEntries(
    Object.entries(totals.failureCounts).sort(([left], [right]) => left.localeCompare(right)),
  );
  return totals;
}

function increment(counts, key) {
  counts.set(key, (counts.get(key) ?? 0) + 1);
}

function sha1(bytes) {
  return createHash('sha1').update(bytes).digest('hex');
}

function normalizePath(path) {
  return path.split('\\').join('/');
}
