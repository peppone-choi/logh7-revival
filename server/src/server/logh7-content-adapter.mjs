/**
 * Content adapter — turns the unified content DB (logh7-content-source) into the content-pack shape
 * that the authoritative world consumes (logh7-content-pack / world seeding). The source DB mixes
 * evidence tiers: shipped/client-proven fields, manual/archive candidates, and reconstructed seeds.
 * Do not treat a mapped field as original LOGH VII data until its per-field provenance is proved.
 *
 * Mappings:
 *   faction key  -> nation id   (empire 0x500 / alliance 0x501 / neutral=Phezzan 0x502)
 *   character    -> {command,tactics,operations} from the 8-ability schema (統率/指揮/運営)
 *   character    -> portraitIndex (a Face/*.tcf global index) for the 0x0323 face field
 *   each character gets a provisional fleet unit so the named cast exercises map/server paths.
 */
import { readFileSync } from 'node:fs';
import { buildInferredCatalogs, constmsgGroupSubIdsByText } from './logh7-inferred-content.mjs';
import { buildCanonPortraitRoster, loadOriginalFaceCodes } from './logh7-original-officers.mjs';
import { rankId } from './logh7-rank-table.mjs';
import { encodeFace, decodeFace, FACE_ATLAS } from './logh7-face-codec.mjs';

export const NATION_ID = { empire: 0x500, alliance: 0x501, neutral: 0x502 };
const CHARACTER_ROSTER_SOURCE = 'content/roster/characters.json';
const STELLAR_CLASS_SOURCE = 'content/extracted/model-galaxy-stars.json';
const STELLAR_CLASS_NOTE = 'Null_galaxy.mdx star node order; not necessarily galaxy.json system order.';

// Normalize a romaji name to a matchable surname key: lowercase, drop nobiliary particles, keep the
// longest token (the family name) — so "Reinhard von Lohengramm" and "Reinhard" both key on a shared
// token, and "Yang Wen-li" / "Yang Wenli" both reduce to "yang…". Used to match a character against the
// authoritative face-number anchors recovered from the official site (content/roster/face-name-map.json).
function nameKeys(romaji) {
  if (!romaji) return [];
  const tokens = String(romaji)
    .toLowerCase()
    .replace(/[.\-]/g, ' ')
    .split(/\s+/)
    .filter((t) => t && !['von', 'van', 'de', 'der', 'the', 'di', 'du'].includes(t));
  return tokens;
}

function sourceList(value) {
  if (value == null) return [];
  if (Array.isArray(value)) return value.filter((v) => v != null).map(String);
  return [String(value)];
}

function characterProvenance(characterSource) {
  const source = [CHARACTER_ROSTER_SOURCE, ...sourceList(characterSource)];
  return {
    name: { authority: 'revival_roster', source, originalServerData: false },
    stats: { authority: 'revival_roster', source, originalServerData: false },
  };
}

/**
 * Return a deterministic face assigner. Priority:
 *   1) AUTHORITATIVE — the official VII face number recovered from gineiden.com
 *      (content/roster/face-name-map.json: 12 confirmed name↔face-number pairs, e.g. Reinhard=209,
 *      Yang=206). Matched by a shared surname token, so the named principals render their REAL face.
 *   2) Pool anchor / deterministic pick from the valid Face/*.tcf pool (content/roster/face-pool.json)
 *      for everyone else — a stable, plausible face (the original name↔face table was server-side and
 *      is lost, so non-principals get a consistent assigned face, not an authentic one).
 * Best-effort: missing files degrade gracefully (faces left null).
 */
export function loadFaceAssigner(
  poolPath = 'content/roster/face-pool.json',
  officialPath = 'content/roster/face-name-map.json',
) {
  let pool = {};
  try {
    pool = JSON.parse(readFileSync(poolPath, 'utf8'));
  } catch {
    pool = {};
  }
  const valid = Array.isArray(pool.valid) ? pool.valid : [];
  const poolAnchors = pool.anchors ?? {};

  // Build the authoritative surname-token → face_number index from the recovered official 12.
  const officialByKey = new Map();
  try {
    const map = JSON.parse(readFileSync(officialPath, 'utf8'));
    const entries = Array.isArray(map) ? map : map.entries ?? map.mappings ?? map.faces ?? [];
    for (const e of entries) {
      if (!Number.isInteger(e?.face_number)) continue;
      for (const k of nameKeys(e.name_romaji)) {
        if (k.length >= 3 && !officialByKey.has(k)) officialByKey.set(k, e.face_number);
      }
    }
  } catch {
    /* no official map — fall through to the pool */
  }

  return (character) => {
    // 1) authoritative official face number by surname-token match
    for (const k of nameKeys(character.nameRomaji)) {
      if (officialByKey.has(k)) {
        return {
          portraitIndex: officialByKey.get(k),
          provenance: {
            authority: 'official_anchor',
            source: [officialPath],
            method: 'surname_token',
            originalServerData: false,
          },
        };
      }
    }
    // 2) pool anchor (legacy) then deterministic pool pick
    if (character.nameRomaji && poolAnchors[character.nameRomaji] != null) {
      return {
        portraitIndex: poolAnchors[character.nameRomaji],
        provenance: {
          authority: 'house_rule',
          source: [poolPath],
          method: 'pool_anchor',
          originalServerData: false,
        },
      };
    }
    if (valid.length === 0) {
      return {
        portraitIndex: null,
        provenance: { authority: 'unknown', source: [], method: 'unassigned', originalServerData: false },
      };
    }
    return {
      portraitIndex: valid[(character.id >>> 0) % valid.length],
      provenance: {
        authority: 'house_rule',
        source: [poolPath],
        method: 'deterministic_pool',
        originalServerData: false,
      },
    };
  };
}

// Ship classes per faction (names from the constmsg ship catalog incl. flagships; stats LOGH-grounded).
// Each faction has a flagship (for its top commander) + standard line classes.
const SHIP_CLASSES = [
  { id: 1, faction: 'empire', name: 'ブリュンヒルト', role: 'flagship', hp: 5200, attack: 920, defense: 880, speed: 11 },
  { id: 2, faction: 'empire', name: '戦艦', role: 'battleship', hp: 2200, attack: 430, defense: 400, speed: 9 },
  { id: 3, faction: 'empire', name: '巡航艦', role: 'cruiser', hp: 1400, attack: 260, defense: 230, speed: 12 },
  { id: 4, faction: 'empire', name: '駆逐艦', role: 'destroyer', hp: 900, attack: 180, defense: 150, speed: 14 },
  { id: 10, faction: 'alliance', name: 'ヒューベリオン', role: 'flagship', hp: 4400, attack: 780, defense: 760, speed: 11 },
  { id: 11, faction: 'alliance', name: '戦艦', role: 'battleship', hp: 2100, attack: 410, defense: 400, speed: 9 },
  { id: 12, faction: 'alliance', name: '巡航艦', role: 'cruiser', hp: 1300, attack: 240, defense: 220, speed: 12 },
  { id: 13, faction: 'alliance', name: '駆逐艦', role: 'destroyer', hp: 850, attack: 170, defense: 140, speed: 14 },
  { id: 20, faction: 'neutral', name: 'フェザーン商船', role: 'merchant', hp: 1100, attack: 90, defense: 200, speed: 13 },
];
const FLAGSHIP_BY_FACTION = { empire: 1, alliance: 10, neutral: 20 };
const LINE_BY_FACTION = { empire: 2, alliance: 11, neutral: 20 };
const NATION_META = {
  empire: { name: 'Galactic Empire', color: 0, budget: 200000, capital: 'オーディン' },
  alliance: { name: 'Free Planets Alliance', color: 1, budget: 180000, capital: 'ハイネセン' },
  neutral: { name: 'Phezzan Dominion', color: 2, budget: 150000, capital: 'フェザーン' },
};

function readContentJson(path) {
  try {
    return JSON.parse(readFileSync(new URL(`../../content/${path}`, import.meta.url), 'utf8'));
  } catch (error) {
    if (error instanceof Error) {
      return null;
    }
    throw error;
  }
}

/**
 * 캐논 인물의 직위/계급 출처(content/roster/canon-character-posts.json)를 name_ja 키로 인덱싱한다.
 * 이 파일이 직위(post_ja)·계급(rank_ja)·진영의 단일 권위 출처다(P2 재구성, 원본 서버 데이터 아님).
 * 파일이 없거나 깨지면 빈 Map으로 graceful degrade.
 * @returns {Map<string, {postJa:(string|null), rankJa:(string|null), faction:(string|null), kind:(string|null)}>}
 */
function loadCanonPostsByName() {
  const raw = readContentJson('roster/canon-character-posts.json');
  const list = Array.isArray(raw?.characters) ? raw.characters : [];
  const byName = new Map();
  for (const rec of list) {
    if (!rec?.name_ja) continue;
    byName.set(String(rec.name_ja), {
      postJa: rec.post_ja ?? null,
      rankJa: rec.rank_ja ?? null,
      faction: rec.faction ?? null,
      kind: rec.kind ?? null,
      // 매뉴얼 문서화 여부(P1 게이트): sources에 manual-roster.json이 있으면 매뉴얼이 직접 문서화한
      // 인물. NPC 월드 시드의 캐논명 unmask(P0 승격)는 이 인물에만 허용하고, 그 외(DB 추측명)는
      // 마스킹 폴백을 쓴다 — 추측 데이터를 권위적으로 노출하지 않는다(추측명 P0 승격 금지).
      manualDocumented: Array.isArray(rec.sources) && rec.sources.includes('manual-roster.json'),
    });
  }
  return byName;
}

/**
 * 캐논 NPC에게 임시(P2) O군 초상 코드를 진영/성별/계급으로 배정한다. 캐논 직위 인물은 전부 군인(kind:military)
 * 이라 장교 버킷을 쓴다: empire→oem, alliance→oam, 그 외/진영불명→o. 캐논 데이터엔 성별이 없어 남성 기본
 * (O군엔 여성 아틀라스가 없으므로 남성 oem/oam이 유일 유효). 계급은 아틀라스를 바꾸지 않는다(와이어 rank 필드만).
 * index는 이미 namedCanonFaceCodes(canon-face-registry.json)에 쓰인 코드를 건너뛰며 결정론적으로 0..cap에서 집는다.
 * @returns {(args:{faction:(string|null), kind:(string|null)}) => (number|null)}
 */
function makeProvisionalCanonFaceAssigner(usedFaceCodes) {
  const taken = new Set(usedFaceCodes instanceof Set ? usedFaceCodes : []);
  const cursor = { oem: 0, oam: 0, o: 0 };
  return ({ faction = null, kind = null }) => {
    const f = String(faction ?? '').toLowerCase();
    const atlas = kind && kind !== 'military' ? 'o' : (f === 'alliance' ? 'oam' : f === 'empire' ? 'oem' : 'o');
    const cap = FACE_ATLAS[atlas]?.cap ?? 0;
    // 이미 쓰인 코드(named O군) 건너뛰며 다음 빈 슬롯을 결정론적으로 배정.
    while (cursor[atlas] <= cap) {
      const idx = cursor[atlas];
      cursor[atlas] += 1;
      let code;
      try {
        code = encodeFace(atlas, idx);
      } catch {
        break;
      }
      if (!taken.has(code)) {
        taken.add(code);
        return code;
      }
    }
    return null; // 풀 소진 — 초상 미배정(상위에서 기존 portraitIndex 폴백).
  };
}

function loadInferredCatalogs() {
  return buildInferredCatalogs({
    allNames: readContentJson('extracted/all-names.json') ?? {},
    schema: readContentJson('client/schema.json') ?? {},
    msgdat: readContentJson('client/msgdat.json') ?? {},
    modelData: readContentJson('extracted/model-data.json') ?? {},
  });
}

function loadGalaxyStellarTypes() {
  const data = readContentJson('extracted/model-galaxy-stars.json') ?? {};
  if (!Array.isArray(data.stars)) return [];
  return data.stars.map((star) => ({
    index: Number.isInteger(star?.index) ? star.index : null,
    spectralClass: typeof star?.spectral_class === 'string' ? star.spectral_class.toUpperCase() : null,
  }));
}

function normalizeSpectralClass(value) {
  return typeof value === 'string' && /^[OBAFGKM]$/u.test(value.toUpperCase()) ? value.toUpperCase() : null;
}

function stellarClassProvenance(star, systemIndex, chartSpectralClass = null) {
  if (chartSpectralClass) {
    return {
      authority: 'manual_star_chart_pixel_color',
      source: ['.omo/work/galaxy-extract/page101-bg.jpg', 'content/galaxy.json'],
      method: 'small raster star-dot color classified to a provisional Morgan-Keenan marker variant',
      originalServerData: false,
      confidence: 'medium',
      systemIndex: systemIndex + 1,
      note: 'User-confirmed raster dot color; exact original server stellar class is still unrecovered.',
    };
  }
  return {
    authority: 'model_node_order_provisional',
    source: [STELLAR_CLASS_SOURCE],
    method: 'system index matched to star_<NN> node index until a direct system-name link is recovered',
    originalServerData: false,
    confidence: star ? 'medium' : 'none',
    starNodeIndex: star?.index ?? null,
    systemIndex: systemIndex + 1,
    note: star ? STELLAR_CLASS_NOTE : 'No star node recovered for this manual system index; 79 star nodes vs 80 systems.',
  };
}

function mergedConstmsgGroupSubIdsByText(groupIndex) {
  const msgdatFull = readContentJson('extracted/msgdat-full.json') ?? {};
  const msgdatOriginal = readContentJson('client/msgdat.json') ?? {};
  return new Map([
    ...constmsgGroupSubIdsByText(msgdatFull, groupIndex),
    ...constmsgGroupSubIdsByText(msgdatOriginal, groupIndex, { layoutSource: msgdatFull }),
  ]);
}

/**
 * Build a content-pack data object ({name, nations, shipClasses, characters, units}) from a content
 * source (logh7-content-source). Pass to createContentPack() to get the validated pack.
 * @param {ReturnType<import('./logh7-content-source.mjs').openContentSource>} source
 * @param {{ name?: string, maxUnits?: number }} [opts]
 */
export function buildContentPackDataFromSource(source, { name = 'logh-vii-recovered', maxUnits = 580, canonPortraitMax = Infinity, maskCanonNames = true } = {}) {
  const markerIdsByName = mergedConstmsgGroupSubIdsByText(0x18);
  const dbChars = source.listCharacters();
  // only factions that map to a real nation can seed units
  const usedFactions = new Set(dbChars.map((c) => c.faction).filter((f) => f in NATION_ID));
  // always include the three canon powers so the faction table is stable
  for (const f of ['empire', 'alliance', 'neutral']) usedFactions.add(f);

  const nations = [...usedFactions].map((f) => ({
    id: NATION_ID[f],
    name: NATION_META[f].name,
    color: NATION_META[f].color,
    budget: NATION_META[f].budget,
    capital: NATION_META[f].capital,
  }));

  const assignFace = loadFaceAssigner();
  // 캐논 직위/계급 출처를 name_ja로 인덱싱(직위·계급·진영의 단일 권위). 281p RE 재구성(P2).
  const canonPostsByName = loadCanonPostsByName();
  // The NAMED canon roster: the canon characters we have recovered names/abilities for (P2 manual/IV-EX).
  const namedCharacters = dbChars
    .filter((c) => c.faction in NATION_ID)
    .map((c) => {
      // canon-character-posts.json에서 직위/계급(rank_ja) 조인. 진영은 DB의 faction을 권위로 둔다.
      const post = canonPostsByName.get(String(c.name_ja)) ?? null;
      const rankJa = post?.rankJa ?? c.rank_ja ?? null;
      // rank_ja(元帥/大将…)→와이어 계급 id를 진영-로컬 사다리로 해석(元帥는 양 진영 동일 표기라 faction 힌트 필수).
      const wireRank = rankJa ? (rankId(rankJa, { faction: c.faction })?.id ?? null) : null;
      const ch = {
        id: c.id,
        name: c.name_ja,
        nameRomaji: c.name_romaji || null, // ASCII-safe name (avoids the unresolved u16 name encoding)
        nameKo: c.name_kr || null,
        source: sourceList(c.source),
        provenance: characterProvenance(c.source),
        nationId: NATION_ID[c.faction],
        // faction/postJa/wireRank/gender는 NPC 월드 시드(0x0323)가 직위·계급·진영·초상을 채우는 데 쓴다.
        faction: c.faction,
        postJa: post?.postJa ?? null,
        kind: post?.kind ?? 'military',
        // 매뉴얼 문서화 인물(P1): 캐논명 unmask를 이 인물에만 허용한다(추측명 P0 승격 금지).
        manualDocumented: post?.manualDocumented === true,
        wireRank, // 와이어 u16 계급 id(1..14); 미해석이면 null(시드 측에서 폴백)
        gender: 'male', // 캐논 데이터에 성별 없음 → 남성 기본(O군엔 여성 아틀라스 없음). 임시(P2).
        rank: c.rank_ja || 'Officer',
        command: c.tochi ?? 50,
        tactics: c.shiki ?? 50,
        operations: c.unei ?? 50,
        // the full 8-ability block in canonical wire order (統率/政治/運用/情報 + 指揮/機動/攻撃/防御)
        // for the 0x0323 record's ability_8@0x188 (docs/logh7-info-records-wire.md)
        abilities: [c.tochi, c.seiji, c.unei, c.joho, c.shiki, c.kido, c.kogeki, c.bogyo].map((v) => v ?? 50),
      };
      const face = assignFace(ch); // Face/*.tcf id → 0x0323 face field
      ch.portraitIndex = face.portraitIndex;
      ch.provenance.portrait = face.provenance;
      return ch;
    });

  // 原作/canon (오리지널) characters are ALL canon — their portraits are the shipped O-group atlases
  // (oem/oam/o, ~446 frames). We only know names/abilities for the named roster above; the rest must still
  // EXIST in-world as canon characters with REAL portraits and placeholder identity (names "1".."N",
  // neutral stats). Exclude the O-group faces already tied to a named canon person so nobody is doubled.
  // Player-created officers are a different pool (G-group gem/gef/gam/gaf, no 'o'); not generated here.
  const namedCanonFaceCodes = loadOriginalFaceCodes(readContentJson('canon-face-registry.json') ?? {});
  // 캐논 NPC 임시 O군 초상(P2): named O군 코드는 건너뛰며 진영/성별/계급으로 결정론 배정. 와이어 face 필드용.
  const assignProvisionalFace = makeProvisionalCanonFaceAssigner(
    namedCanonFaceCodes instanceof Set ? namedCanonFaceCodes : new Set(namedCanonFaceCodes ?? []),
  );
  for (const ch of namedCharacters) {
    // 이미 named face-name-map에서 O군 코드를 받았으면(authoritative) 그대로 유지, 아니면 임시 O군 배정.
    const existing = Number.isInteger(ch.portraitIndex) ? decodeFace(ch.portraitIndex) : null;
    if (existing && existing.group === 'O') {
      ch.faceCode = ch.portraitIndex;
    } else {
      ch.faceCode = assignProvisionalFace({ faction: ch.faction, kind: ch.kind });
    }
  }
  const canonPortraitRoster = buildCanonPortraitRoster({
    excludeFaces: namedCanonFaceCodes,
    max: canonPortraitMax,
  });

  // Per the user: NO canon name is verified — even the recovered roster names (ラインハルト etc.) are
  // unproven P2 reconstructions, and the 446 O-group portraits cannot be mapped to canon identities.
  // So EVERY canon character displays a PLACEHOLDER name ("1".."N"). The best-guess/recovered name is
  // kept as `candidateName` (NOT shown to the client) so a future identity mapping can restore it, and
  // provenance.name is marked unverified. Stats/portrait/faction are left as filled (the user accepts
  // unknown name/abilities as long as the rest exists). maskCanonNames lets tests inspect the raw roster.
  const maskName = (c, ordinal) => {
    if (!maskCanonNames) return c;
    const placeholder = String(ordinal);
    return {
      ...c,
      candidateName: c.candidateName ?? c.name ?? null,
      candidateNameRomaji: c.candidateNameRomaji ?? c.nameRomaji ?? null,
      candidateNameKo: c.candidateNameKo ?? c.nameKo ?? null,
      name: placeholder,
      nameRomaji: placeholder,
      nameKo: null,
      identityRecovered: false,
      provenance: {
        ...c.provenance,
        name: {
          authority: 'placeholder_unrecovered_identity',
          source: c.provenance?.name?.source ?? [],
          originalServerData: false,
          tier: 'P3',
          candidate: c.candidateName ?? c.name ?? null,
        },
      },
    };
  };
  const maskedNamed = namedCharacters.map((c, i) => maskName(c, i + 1));
  const maskedRoster = canonPortraitRoster.map((c, i) => maskName(c, namedCharacters.length + i + 1));
  const allCharacters = [...maskedNamed, ...maskedRoster];

  const factionOf = (nationId) => Object.keys(NATION_ID).find((k) => NATION_ID[k] === nationId) ?? 'empire';
  const shipClasses = SHIP_CLASSES
    .filter((s) => usedFactions.has(s.faction))
    .map((s) => ({ id: s.id, name: s.name, nationId: NATION_ID[s.faction], role: s.role, hp: s.hp, attack: s.attack, defense: s.defense, speed: s.speed }));

  // one fleet per NAMED character (capped), Empire facing Alliance across the field. The first fleet of
  // each faction flies its flagship; the rest fly the standard line class. The identity-unrecovered canon
  // portrait roster EXISTS as characters but is NOT all deployed as fleets (that would flood the map);
  // they are roster/recruit entries until a real identity+command is assigned.
  const flagshipUsed = new Set();
  const units = maskedNamed.slice(0, maxUnits).map((c, i) => {
    const fac = factionOf(c.nationId);
    const side = c.nationId === NATION_ID.empire ? -1 : 1;
    const useFlag = !flagshipUsed.has(fac);
    if (useFlag) flagshipUsed.add(fac);
    return {
      id: 0x01000000 + i,
      nationId: c.nationId,
      shipClass: useFlag ? FLAGSHIP_BY_FACTION[fac] : LINE_BY_FACTION[fac],
      commander: c.id,
      controllable: true,
      x: side * 220,
      y: (i % 12) * 40 - 220,
      z: 0,
      heading: side < 0 ? 90 : 270,
    };
  });

  // carry the recovered galaxy (systems + planets/fortresses) so the world has one content source.
  // name_ko (from the content/names/*-ko.json sidecars via the source) travels alongside name_ja so the
  // wire builders can prefer the Korean rendering and fall back to Japanese.
  const stellarTypes = loadGalaxyStellarTypes();
  const systems = source.listSystems().map((s, index) => {
    const star = stellarTypes[index] ?? null;
    const chartSpectralClass = normalizeSpectralClass(s.spectral_class ?? s.spectralClass ?? null);
    return {
      name_ja: s.name_ja,
      name_ko: s.name_ko ?? null,
      contentId: markerIdsByName.get(s.name_ja) ?? null,
      faction: s.faction,
      is_corridor: s.is_corridor,
      cx: s.cx,
      cy: s.cy,
      canonCol: s.canon_col,
      canonRow: s.canon_row,
      canonDotX: s.canon_dot_x,
      canonDotY: s.canon_dot_y,
      canonLineMarkerX: s.canon_line_marker_x,
      canonLineMarkerY: s.canon_line_marker_y,
      rect: [s.rect_x0, s.rect_y0, s.rect_x1, s.rect_y1],
      page: s.map_page,
      spectralClass: chartSpectralClass ?? star?.spectralClass ?? null,
      provenance: { spectralClass: stellarClassProvenance(star, index, chartSpectralClass) },
      planets: s.planets,
      fortresses: s.fortresses,
    };
  });

  const inferred = loadInferredCatalogs();
  return { name, nations, shipClasses, characters: allCharacters, units, systems, ...inferred };
}
