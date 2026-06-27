const ROOM_NAME_RE = /執務室|会議室|居室|中央広場|公園|宇宙港|邸宅|教室|拘禁室|寝室|受付|ロビー|広場|士官クラブ|酒場|自宅|大広間|猟場/u;

const nonEmptyString = (value) => typeof value === 'string' && value.length > 0;
const asNumberOrNull = (value) => (Number.isFinite(Number(value)) ? Number(value) : null);
const STELLAR_CLASSES = new Set(['O', 'B', 'A', 'F', 'G', 'K', 'M']);

export const INFERRED_CONTENT_PROVENANCE = Object.freeze({
  systems: 'content/galaxy.json manual star-chart annotations',
  planetPositions: 'content/galaxy.json orbit order, deterministic local polar slots',
  institutions: 'content/extracted/all-names.json institutions + content/manual/org-posts.json',
  rooms: 'content/client/schema.json facilities matched to constmsg.dat room/spot labels',
});

export function characterDisplayName(character = {}) {
  const keys = process.env.LOGH_KO_NAMES === '1'
    ? ['nameKo', 'name_ko', 'nameKr', 'name_kr', 'nameRomaji', 'name_romaji', 'name', 'name_ja']
    : ['name', 'name_ja', 'nameKo', 'name_ko', 'nameRomaji', 'name_romaji'];
  for (const key of keys) {
    if (nonEmptyString(character[key])) return character[key];
  }
  return null;
}

export function normalizeMapRect(rect) {
  if (!Array.isArray(rect) || rect.length < 4) return null;
  const nums = rect.slice(0, 4).map(asNumberOrNull);
  return nums.every((n) => n !== null) ? nums : null;
}

function sourceList(value) {
  if (value == null) return [];
  if (Array.isArray(value)) return value.filter((v) => v != null).map(String);
  return [String(value)];
}

function normalizeProvenanceEntry(entry) {
  if (entry == null || typeof entry !== 'object' || Array.isArray(entry)) return null;
  return { ...entry, source: sourceList(entry.source) };
}

function normalizeSystemProvenance(system) {
  const out = {};
  const provenance = system.provenance;
  if (provenance != null && typeof provenance === 'object' && !Array.isArray(provenance)) {
    for (const [key, entry] of Object.entries(provenance)) {
      const normalized = normalizeProvenanceEntry(entry);
      if (normalized) out[key] = normalized;
    }
  }
  const spectralEntry = normalizeProvenanceEntry(
    system.spectralClassProvenance ?? system.starClassProvenance ?? system.stellarTypeProvenance,
  );
  if (spectralEntry) out.spectralClass = spectralEntry;
  return out;
}

function normalizeSpectralClass(value) {
  if (!nonEmptyString(value)) return null;
  const cls = value.trim().toUpperCase();
  return STELLAR_CLASSES.has(cls) ? cls : null;
}

function hasSpectralClassInput(system) {
  return Object.hasOwn(system, 'spectralClass')
    || Object.hasOwn(system, 'spectral_class')
    || Object.hasOwn(system, 'starClass')
    || Object.hasOwn(system, 'stellarClass');
}

export function inferPlanetPosition(planet, index, total) {
  const orbit = Number(planet?.orbit ?? index + 1);
  const slot = Number.isFinite(orbit) && orbit > 0 ? orbit : index + 1;
  const angleDeg = total > 0 ? Math.round((index / total) * 360) : 0;
  const angle = (angleDeg * Math.PI) / 180;
  const radius = slot;
  return {
    slot,
    angleDeg,
    radius,
    x: Number((Math.cos(angle) * radius).toFixed(6)),
    y: Number((Math.sin(angle) * radius).toFixed(6)),
    source: INFERRED_CONTENT_PROVENANCE.planetPositions,
  };
}

function normalizePlanetEconomy(planet) {
  const economy = {};
  for (const key of ['population_M', 'population', 'food', 'industry']) {
    if (Number.isFinite(Number(planet?.[key]))) economy[key] = Number(planet[key]);
  }
  if (Object.hasOwn(planet ?? {}, 'habitable')) economy.habitable = Boolean(planet.habitable);
  return economy;
}

export function normalizeSystemRecord(system, index) {
  const cx = asNumberOrNull(system.cx ?? system.mapCx ?? system.map?.cx);
  const cy = asNumberOrNull(system.cy ?? system.mapCy ?? system.map?.cy);
  const canonCol = asNumberOrNull(system.canonCol ?? system.canon_col ?? system.map?.canonCol ?? system.map?.canon_col);
  const canonRow = asNumberOrNull(system.canonRow ?? system.canon_row ?? system.map?.canonRow ?? system.map?.canon_row);
  const canonDotX = asNumberOrNull(system.canonDotX ?? system.canon_dot_x ?? system.map?.canonDotX);
  const canonDotY = asNumberOrNull(system.canonDotY ?? system.canon_dot_y ?? system.map?.canonDotY);
  const canonLineMarkerX = asNumberOrNull(system.canonLineMarkerX ?? system.canon_line_marker_x ?? system.map?.canonLineMarkerX);
  const canonLineMarkerY = asNumberOrNull(system.canonLineMarkerY ?? system.canon_line_marker_y ?? system.map?.canonLineMarkerY);
  const rect = normalizeMapRect(system.rect ?? system.mapRect ?? system.map?.rect);
  const planets = Array.isArray(system.planets) ? system.planets : [];
  const contentId = asNumberOrNull(
    system.contentId ?? system.markerContentId ?? system.constmsgGroup18Id ?? system.constmsgGroup18SubId,
  );
  const out = {
    name: String(system.name_ja ?? system.name ?? system.system ?? `System ${index}`),
    nameKo: system.name_ko != null ? String(system.name_ko) : (system.nameKo != null ? String(system.nameKo) : null),
    contentId: contentId !== null && contentId >= 0 && contentId <= 0xff ? contentId : null,
    faction: system.faction ?? null,
    isCorridor: Boolean(system.is_corridor ?? system.isCorridor),
    canonCol: Number.isInteger(canonCol) ? canonCol : null,
    canonRow: Number.isInteger(canonRow) ? canonRow : null,
    provenance: normalizeSystemProvenance(system),
    map: cx !== null && cy !== null ? {
      cx,
      cy,
      rect,
      page: Number.isInteger(system.page) ? system.page : (Number.isInteger(system.map_page) ? system.map_page : null),
      canonCol: Number.isInteger(canonCol) ? canonCol : null,
      canonRow: Number.isInteger(canonRow) ? canonRow : null,
      canonDotX,
      canonDotY,
      canonLineMarkerX,
      canonLineMarkerY,
      source: INFERRED_CONTENT_PROVENANCE.systems,
    } : null,
    planets: planets.map((planet, planetIndex) => {
      if (typeof planet === 'string') {
        return { name: planet, nameKo: null, orbit: 0, inferredPosition: inferPlanetPosition({}, planetIndex, planets.length) };
      }
      return {
        ...normalizePlanetEconomy(planet),
        name: planet.name_ja ?? planet.name,
        nameKo: (planet.name_ko ?? planet.nameKo) != null ? String(planet.name_ko ?? planet.nameKo) : null,
        orbit: planet.orbit ?? 0,
        inferredPosition: planet.inferredPosition ?? inferPlanetPosition(planet, planetIndex, planets.length),
      };
    }),
    fortresses: Array.isArray(system.fortresses) ? system.fortresses.map(String) : [],
  };
  if (hasSpectralClassInput(system)) {
    out.spectralClass = normalizeSpectralClass(
      system.spectralClass ?? system.spectral_class ?? system.starClass ?? system.stellarClass,
    );
  }
  return out;
}

function msgdatFile(msgdat, fileName) {
  if (Array.isArray(msgdat?.files)) {
    const named = msgdat.files.find((entry) => entry.path === fileName || entry.name === fileName);
    if (named) return named;
    if (fileName === 'constmsg.dat') {
      return msgdat.files.find((entry) => Array.isArray(entry.records) && entry.records.length >= 3000) ?? null;
    }
  }
  return msgdat?.files?.[fileName] ?? null;
}

function msgdatRecords(msgdat, fileName) {
  const file = msgdatFile(msgdat, fileName);
  return Array.isArray(file?.records) ? file.records : [];
}

function offsetTableValue(entry) {
  if (Number.isInteger(entry)) return entry;
  if (Number.isInteger(entry?.value)) return entry.value;
  return null;
}

export function constmsgGroupSubIdsByText(msgdat, groupIndex, { layoutSource = null } = {}) {
  const file = msgdatFile(msgdat, 'constmsg.dat');
  const records = Array.isArray(file?.records) ? file.records : [];
  const layoutFile = layoutSource ? msgdatFile(layoutSource, 'constmsg.dat') : null;
  const offsetTable = file?.layout?.offsetTable ?? layoutFile?.layout?.offsetTable;
  if (!Array.isArray(offsetTable) || records.length === 0) return new Map();
  const base = offsetTableValue(offsetTable[groupIndex]);
  const next = offsetTableValue(offsetTable[groupIndex + 1]) ?? records.length;
  if (!Number.isInteger(base) || !Number.isInteger(next) || base < 0 || next <= base) {
    return new Map();
  }
  const ids = new Map();
  const cappedNext = Math.min(next, base + 0x100);
  for (let flatId = base; flatId < cappedNext; flatId += 1) {
    const text = records[flatId]?.text;
    const subId = flatId - base;
    if (nonEmptyString(text) && !ids.has(text)) ids.set(text, subId);
  }
  return ids;
}

function catalogIdsByText(msgdat) {
  const ids = new Map();
  const records = msgdatRecords(msgdat, 'constmsg.dat');
  for (const record of records) {
    if (nonEmptyString(record.text) && Number.isInteger(record.id) && !ids.has(record.text)) {
      ids.set(record.text, record.id);
    }
  }
  return ids;
}

function messageCatalogSummary(msgdat, source) {
  const files = Array.isArray(msgdat?.files) ? msgdat.files : Object.values(msgdat?.files ?? {});
  const records = files.reduce((sum, file) => sum + (Array.isArray(file.records) ? file.records.length : 0), 0);
  const nonEmpty = files.reduce(
    (sum, file) => sum + (Array.isArray(file.records) ? file.records.filter((record) => nonEmptyString(record.text)).length : 0),
    0,
  );
  return { source, files: files.length, records, nonEmpty };
}

export function buildInferredCatalogs({
  allNames = {}, schema = {}, msgdat = {}, modelData = {},
} = {}) {
  const ids = catalogIdsByText(msgdat);
  const resolveCatalogId = (name) => ids.get(name) ?? null;
  const institutions = (Array.isArray(allNames.institutions) ? allNames.institutions : []).map((entry, index) => ({
    id: index + 1,
    name: String(entry.text_ja ?? entry.name ?? `Institution ${index + 1}`),
    nameCatalogId: resolveCatalogId(entry.text_ja),
    source: Array.isArray(entry.source) ? entry.source.slice() : [INFERRED_CONTENT_PROVENANCE.institutions],
  }));

  const roomNames = [];
  const seen = new Set();
  for (const value of Array.isArray(schema.facilities) ? schema.facilities : []) {
    if (nonEmptyString(value) && ROOM_NAME_RE.test(value) && !seen.has(value)) {
      seen.add(value);
      roomNames.push(value);
    }
  }
  const rooms = roomNames.map((name, index) => ({
    id: index + 1,
    name,
    nameCatalogId: resolveCatalogId(name),
    source: INFERRED_CONTENT_PROVENANCE.rooms,
  }));

  return {
    institutions,
    rooms,
    resourceCatalogs: {
      msgdatBase: messageCatalogSummary(msgdat, 'content/client/msgdat.json'),
      modelData: {
        source: 'installed data/model/**/*.{mdx,mds}',
        counts: modelData.counts ?? {},
      },
    },
    provenance: INFERRED_CONTENT_PROVENANCE,
  };
}

export function buildInstitutionSeedElements({ baseId = 1, institutions = [], rooms = [], spotKey = null } = {}) {
  const instList = institutions.length > 0 ? institutions : [{ id: 1, nameCatalogId: 1 }];
  const roomList = rooms.length > 0 ? rooms : [{ id: 1, nameCatalogId: 1 }];
  const resolvedSpotKey = Number.isInteger(spotKey) && spotKey > 0 ? spotKey : baseId;
  return [{
    id: baseId,
    institutions: instList.slice(0, 36).map((inst, index) => ({
      // FUN_004c9170 treats the first scalar as a facility kind for live spot resolution.
      // 0x10 enables the parentage/home-base branch while later entries keep their catalog labels.
      field00: index === 0 ? 0x10 : inst.nameCatalogId ?? inst.id ?? index + 1,
      field04: inst.id ?? index + 1,
      spots: roomList.slice(0, 20).map((room, roomIndex) => ({
        field00: room.nameCatalogId ?? room.id ?? roomIndex + 1,
        // The current PLAYER_INFO spot key (+0x40, copied from character source +0x20) is matched
        // against spot.field04. Seed the first room as the current base/spot key, keep catalog ids after.
        field04: roomIndex === 0 ? resolvedSpotKey : room.id ?? roomIndex + 1,
        field08: 1,
      })),
    })),
  }];
}
