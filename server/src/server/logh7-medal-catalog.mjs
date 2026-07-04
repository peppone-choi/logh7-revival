import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const SERVER_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PROJECT_ROOT = join(SERVER_ROOT, '..');
const DEFAULT_ROSTER_PATH = join(SERVER_ROOT, 'content', 'roster', 'medals.json');
const DEFAULT_MSGDAT_PATH = join(SERVER_ROOT, 'content', 'client', 'msgdat.json');
const DEFAULT_LOCALIZED_DAT_TABLES_PATH = join(
  SERVER_ROOT,
  'content',
  'extracted',
  'dat-tables.json',
);
const DEFAULT_INSTALLED_MEDAL_DIR = join(
  PROJECT_ROOT,
  '.omo',
  'work',
  'logh7-installed',
  'data',
  'image',
  'Medal',
);
const DEFAULT_EMBLEM_PATH = join(
  PROJECT_ROOT,
  'client-unity',
  'Assets',
  'ArtSource',
  'reference',
  'logh7-imperial-double-eagle-reference.jpg',
);

const MEDAL_ID_START = 767;
const MEDAL_ID_END = 818;
const EXPECTED_MEDAL_COUNT = MEDAL_ID_END - MEDAL_ID_START + 1;

export function loadMedalRoster(path = DEFAULT_ROSTER_PATH) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function loadMsgDat(path = DEFAULT_MSGDAT_PATH) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function loadLocalizedDatTables(path = DEFAULT_LOCALIZED_DAT_TABLES_PATH) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function buildMedalMiningCatalog({
  roster = loadMedalRoster(),
  msgdat = loadMsgDat(),
  localizedDatTables = loadLocalizedDatTables(),
  installedMedalDir = DEFAULT_INSTALLED_MEDAL_DIR,
  emblemReferencePath = DEFAULT_EMBLEM_PATH,
  rosterPath = 'server/content/roster/medals.json',
  msgdatPath = 'server/content/client/msgdat.json',
  localizedDatTablesPath = 'server/content/extracted/dat-tables.json',
  installedMedalDirLabel = '.omo/work/logh7-installed/data/image/Medal',
  emblemReferencePathLabel = 'client-unity/Assets/ArtSource/reference/logh7-imperial-double-eagle-reference.jpg',
} = {}) {
  validateRoster(roster);
  const jaRecords = getConstMsgMedalRecords(msgdat);
  const localizedRecords = getLocalizedDatTableMedalRecords(localizedDatTables);
  const assets = listInstalledMedalAssets(installedMedalDir);
  const emblem = describeFile(emblemReferencePath, emblemReferencePathLabel);

  const medals = roster.medals.map((medal) => {
    const jaRecord = jaRecords.get(medal.id) ?? null;
    const localizedRecord = localizedRecords.get(medal.id) ?? null;
    const assetPool = assets.byStem.get(medal.asset_hint) ?? [];
    return {
      bit: medal.bit,
      id: medal.id,
      faction: medal.faction,
      names: {
        ja: jaRecord?.text ?? medal.name_ja,
        ko: localizedRecord?.text ?? medal.name_ko,
        en: medal.name_en,
      },
      source: {
        roster: {
          path: rosterPath,
          nameJaMatchesMsgDat: jaRecord?.text === medal.name_ja,
          nameKoMatchesLocalizedTable: localizedRecord?.text === medal.name_ko,
        },
        japaneseMsgDat: jaRecord
          ? {
              path: msgdatPath,
              file: jaRecord.file,
              recordId: jaRecord.id,
            }
          : null,
        localizedDatTable: localizedRecord
          ? {
              path: localizedDatTablesPath,
              recordId: localizedRecord.id,
              encoding: localizedRecord.encoding ?? null,
            }
          : null,
      },
      originalAsset: {
        stem: medal.asset_hint,
        status: assetPool.length > 0 ? 'original-icon-pool-present' : 'missing-original-icon',
        mapping: 'asset-hint-only; per-medal runtime icon mapping still requires RE/live UI proof',
        files: assetPool.map(({ path, extension, sha256, byteSize, image }) => ({
          path,
          extension,
          sha256,
          byteSize,
          image,
        })),
      },
    };
  });

  const byFaction = summarizeFactions(medals);
  const pngAssets = assets.files.filter((asset) => asset.extension === '.png');
  const tgaAssets = assets.files.filter((asset) => asset.extension === '.tga');

  return {
    id: 'logh7-medal-mining-catalog',
    generatedAt: new Date().toISOString(),
    source: {
      rosterPath,
      japaneseMsgDatPath: msgdatPath,
      localizedDatTablesPath,
      installedMedalDir: installedMedalDirLabel,
      evidenceGrade: {
        medalNamesJa: 'P1-original-msgdat-constmsg-records-767-818',
        medalNamesKo: 'localized-cp949-dat-table-records-767-818',
        medalIconPool: 'P1-original-install-media-files',
        perMedalIconMapping: 'pending-runtime-or-static-RE',
        imperialEmblem: 'user-supplied-reference; exact-shape-remaster-only',
      },
      policy:
        'Mine medal list and images from original data first. Do not generate replacement medal art when original medal images are present; generated art is only a blocked fallback for missing data.',
    },
    summary: {
      medalCount: medals.length,
      expectedMedalCount: EXPECTED_MEDAL_COUNT,
      sourceIdRange: [MEDAL_ID_START, MEDAL_ID_END],
      factions: byFaction,
      japaneseMsgDatRecordCount: jaRecords.size,
      localizedDatTableRecordCount: localizedRecords.size,
      originalIconPool: {
        stemCount: assets.byStem.size,
        fileCount: assets.files.length,
        pngCount: pngAssets.length,
        tgaCount: tgaAssets.length,
        stems: [...assets.byStem.keys()].sort(),
      },
      generationPolicy: {
        imperialMedals: 'do-not-generate-while-original-m_f001-m_f015-icon-pool-exists',
        allianceMedals: 'do-not-generate-while-original-m_f001-m_f015-icon-pool-exists',
        fallbackCondition:
          'generation may be reconsidered only after mining proves a required original image is absent',
      },
    },
    imperialEmblem: {
      ...emblem,
      exactnessPolicy:
        'The supplied double-eagle crest is canonical reference for remastering. Preserve the full silhouette and internal structure; no simplified/generated substitute is acceptable.',
    },
    medals,
  };
}

export function writeMedalMiningCatalog(path, catalog) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(catalog, null, 2)}\n`);
}

function validateRoster(roster) {
  if (!Array.isArray(roster?.medals)) {
    throw new TypeError('medal roster must contain medals array');
  }
  if (roster.medals.length !== EXPECTED_MEDAL_COUNT) {
    throw new Error(`expected ${EXPECTED_MEDAL_COUNT} medals, got ${roster.medals.length}`);
  }
  roster.medals.forEach((medal, index) => {
    const expectedId = MEDAL_ID_START + index;
    if (medal.id !== expectedId || medal.bit !== index) {
      throw new Error(`medal index ${index} expected id ${expectedId}/bit ${index}`);
    }
    for (const field of ['name_ja', 'name_ko', 'name_en', 'faction', 'asset_hint']) {
      if (typeof medal[field] !== 'string' || medal[field].length === 0) {
        throw new TypeError(`medal ${expectedId} missing string field ${field}`);
      }
    }
  });
}

function getConstMsgMedalRecords(msgdat) {
  const records = msgdat?.files?.['constmsg.dat']?.records;
  return getRecordRange(records, (record) => ({
    id: record.id,
    text: record.text,
    file: 'constmsg.dat',
  }));
}

function getLocalizedDatTableMedalRecords(localizedDatTables) {
  const records = localizedDatTables?.datTables?.[0]?.records;
  return getRecordRange(records, (record) => ({
    id: record.id,
    text: record.text,
    encoding: record.encoding,
  }));
}

function getRecordRange(records, mapRecord) {
  const found = new Map();
  for (let id = MEDAL_ID_START; id <= MEDAL_ID_END; id += 1) {
    const record = records?.[id] ?? records?.[String(id)];
    if (record && record.id === id && typeof record.text === 'string') {
      found.set(id, mapRecord(record));
    }
  }
  return found;
}

function listInstalledMedalAssets(dir) {
  const files = existsSync(dir)
    ? readdirSync(dir)
        .filter((name) => /^m_f\d{3}\.(png|tga)$/i.test(name))
        .sort()
        .map((name) => {
          const absPath = join(dir, name);
          const extension = extname(name).toLowerCase();
          const image =
            extension === '.png' ? readPngDimensions(absPath) : readTgaDimensions(absPath);
          return {
            stem: basename(name, extension),
            path: relative(PROJECT_ROOT, absPath).replaceAll('\\', '/'),
            extension,
            byteSize: statSync(absPath).size,
            sha256: sha256File(absPath),
            image,
          };
        })
    : [];

  const byStem = new Map();
  for (const file of files) {
    const existing = byStem.get(file.stem) ?? [];
    existing.push(file);
    byStem.set(file.stem, existing);
  }
  return { files, byStem };
}

function describeFile(path, label) {
  if (!existsSync(path)) {
    return { path: label, exists: false };
  }
  return {
    path: label,
    exists: true,
    byteSize: statSync(path).size,
    sha256: sha256File(path),
    image: readJpegDimensions(path),
  };
}

function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function readPngDimensions(path) {
  const buf = readFileSync(path);
  if (buf.length < 24 || buf.toString('ascii', 1, 4) !== 'PNG') {
    return null;
  }
  return {
    format: 'png',
    width: buf.readUInt32BE(16),
    height: buf.readUInt32BE(20),
  };
}

function readTgaDimensions(path) {
  const buf = readFileSync(path);
  if (buf.length < 18) {
    return null;
  }
  return {
    format: 'tga',
    width: buf.readUInt16LE(12),
    height: buf.readUInt16LE(14),
    bitsPerPixel: buf.readUInt8(16),
  };
}

function readJpegDimensions(path) {
  const buf = readFileSync(path);
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) {
    return null;
  }
  let offset = 2;
  while (offset + 9 < buf.length) {
    if (buf[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = buf[offset + 1];
    const length = buf.readUInt16BE(offset + 2);
    if (marker >= 0xc0 && marker <= 0xc3) {
      return {
        format: 'jpeg',
        width: buf.readUInt16BE(offset + 7),
        height: buf.readUInt16BE(offset + 5),
      };
    }
    offset += 2 + length;
  }
  return { format: 'jpeg' };
}

function summarizeFactions(medals) {
  const summary = {};
  for (const medal of medals) {
    const faction = (summary[medal.faction] ??= {
      count: 0,
      idRange: [medal.id, medal.id],
      bitRange: [medal.bit, medal.bit],
    });
    faction.count += 1;
    faction.idRange[1] = medal.id;
    faction.bitRange[1] = medal.bit;
  }
  return summary;
}
