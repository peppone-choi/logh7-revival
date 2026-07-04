import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { buildMedalMiningCatalog } from './logh7-medal-catalog.mjs';

const ALLIANCE_CORE_ICON_END_ID = 807;
const ALLIANCE_FLAG_REFERENCE = {
	path: 'client-unity/Assets/ArtSource/reference/logh7-alliance-flag-pentagon-reference.png',
	sha256: '81d5c36e3a4455214c276250e60d88e4e87f722dad8b1a5ba4ca8ef2acad7e0d',
	dimensions: { width: 560, height: 350 },
	emblem: 'central gold pentagon mark with black internal facets',
};
const IMPERIAL_CREST_REFERENCE = {
	sourceImage: 'client-unity/Assets/ArtSource/reference/logh7-imperial-double-eagle-reference.jpg',
	mask: 'client-unity/Assets/ArtSource/reference/imperial-crest/logh7-imperial-double-eagle-mask-gold.png',
	placement: 'large-visible-faction-mark',
	generatedReplacementAllowed: false,
};
const EMPIRE_SHIP_MOTIF_REFERENCE = {
	finalLargeShipMotifSource: 'original-ship-ge-mdx-render',
	sourceRoot: '.omo/work/logh7-installed/data/model/Ship/GE/',
	thumbnailUse: 'proof-only',
	generatedShipSilhouettesAllowed: false,
};
const IMPERIAL_SOURCE_LOCK_MANIFEST =
	'server/content/generated/logh7-imperial-medal-source-lock-manifest.json';

const EMPIRE_DESIGN_RULES = new Map([
  [
    767,
    {
      family: 'grand-order',
      form: 'large gold-and-black breast star with exact Imperial double-eagle crest center',
      material: 'polished gold rays, black enamel, crimson jewel accents',
      differentiation: 'highest order; largest starburst and most formal crest frame',
    },
  ],
  [
    768,
    {
      family: 'war-merit-eagle',
      form: 'gold war merit cross over laurel wreath with exact Imperial double-eagle crest',
      material: 'gold, dark red enamel, black ribbon accents',
      differentiation: 'martial version of the eagle order; crossed baton or sword geometry only, no real insignia',
    },
  ],
  [
    769,
    {
      family: 'grand-cross',
      form: 'imperial grand cross with orbital crown geometry and exact crest medallion',
      material: 'white enamel, silver bevels, gold rim',
      differentiation: 'cross silhouette distinct from real Iron Cross; broader space-opera geometry',
    },
  ],
  [
    770,
    {
      family: 'knight-cross',
      form: 'first-class fictional knight cross with black enamel core and gold edge',
      material: 'black enamel, gold edge, small crest seal',
      differentiation: 'grade 1: gold edge, red cabochon, more rays',
    },
  ],
  [
    771,
    {
      family: 'knight-cross',
      form: 'second-class fictional knight cross with black enamel core and silver edge',
      material: 'black enamel, silver edge, blue-black jewel',
      differentiation: 'grade 2: silver edge, fewer rays than grade 1',
    },
  ],
  [
    772,
    {
      family: 'merit-cross',
      form: 'first-class merit cross, compact and formal',
      material: 'white enamel, gold edge, small crest stamp',
      differentiation: 'grade 1: gold edge and upper crown mark',
    },
  ],
  [
    773,
    {
      family: 'merit-cross',
      form: 'second-class merit cross, compact and formal',
      material: 'white enamel, silver edge, small crest stamp',
      differentiation: 'grade 2: silver edge and simpler crown mark',
    },
  ],
  [
    774,
    {
      family: 'battle-merit',
      form: 'first-class battle achievement star',
      material: 'gold starburst, black enamel center',
      differentiation: 'grade 1: gold, tallest rays, crimson center',
    },
  ],
  [
    775,
    {
      family: 'battle-merit',
      form: 'second-class battle achievement star',
      material: 'silver starburst, black enamel center',
      differentiation: 'grade 2: silver, high rays, blue center',
    },
  ],
  [
    776,
    {
      family: 'battle-merit',
      form: 'third-class battle achievement star',
      material: 'bronze starburst, black enamel center',
      differentiation: 'grade 3: bronze, medium rays, green center',
    },
  ],
  [
    777,
    {
      family: 'battle-merit',
      form: 'fourth-class battle achievement star',
      material: 'dark iron starburst, black enamel center',
      differentiation: 'grade 4: gunmetal, short rays, white center',
    },
  ],
  [
    778,
    {
      family: 'battle-merit',
      form: 'fifth-class battle achievement star',
      material: 'aged copper starburst, black enamel center',
      differentiation: 'grade 5: copper, shortest rays, no jewel',
    },
  ],
  [
    779,
    {
      family: 'campaign',
      form: 'expeditionary campaign badge with fleet silhouette and laurel',
      material: 'antique gold relief, black enamel sky',
      differentiation: 'should read as campaign service, not combat valor',
    },
  ],
  [
    780,
    {
      family: 'combat-achievement',
      form: 'combat achievement badge with angular shield and crossed orbital paths',
      material: 'silver relief, black enamel, red spark accent',
      differentiation: 'combat action award; sharper geometry than campaign badge',
    },
  ],
  [
    781,
    {
      family: 'wound',
      form: 'wound badge with dark shield, crimson inset, broken laurel',
      material: 'blackened silver, crimson enamel',
      differentiation: 'somber and visibly distinct from merit medals',
    },
  ],
  [
    792,
    {
      family: 'staff-officer',
      form: 'staff officer badge with map compass, laurel, and small crest seal',
      material: 'gold laurel, blue-black enamel, silver compass',
      differentiation: 'planning/command symbolism, not frontline combat',
    },
  ],
]);

const SPECIAL_BATTLE_COLORS = [
  'gold with crimson jewel',
  'silver with blue jewel',
  'bronze with green jewel',
  'black iron with white enamel',
  'rose gold with red enamel',
  'gunmetal with violet jewel',
  'bright silver with emerald enamel',
  'antique gold with black enamel',
  'dark bronze with amber jewel',
  'platinum-gold bicolor with crimson crown mark',
];

export function buildMedalArtBrief({ catalog = buildMedalMiningCatalog() } = {}) {
  const allianceMedals = catalog.medals.filter((medal) => medal.faction === 'alliance');
  const empireMedals = catalog.medals.filter((medal) => medal.faction === 'empire');

  return {
    id: 'logh7-medal-art-production-brief',
    generatedAt: new Date().toISOString(),
    sourceCatalog: 'server/content/generated/logh7-medal-mining-catalog.json',
    policy: {
      alliance:
        'Use the mined original m_f001..m_f015 icons as the canonical base. Upscale/remaster those 15 first; create similar variants only where the 52-medal UI requires unique missing Alliance images beyond the original icon pool. New Alliance variants must use the supplied flag pentagon as the faction emblem.',
      empire:
        'Create new name-driven Imperial medals from the 26 original Empire decoration names. Use German Empire / Prussian craftsmanship only as broad material inspiration; never copy real medals or symbols.',
      exactImperialCrest:
        'Any crest-bearing Imperial medal must use the supplied LOGH Imperial double-eagle reference exactly, not a generated approximation.',
      forbidden:
        'No swastikas, SS runes, Nazi symbols, hate symbols, exact real medal replicas, readable real-world insignia, or exact Iron Cross copies.',
    },
    summary: {
      allianceOriginalUpscaleCount: allianceMedals.filter((medal) => medal.id <= ALLIANCE_CORE_ICON_END_ID)
        .length,
      allianceVariantIfUniqueNeededCount: allianceMedals.filter(
        (medal) => medal.id > ALLIANCE_CORE_ICON_END_ID,
      ).length,
      empireCreateCount: empireMedals.length,
    },
    allianceEmblemReference: ALLIANCE_FLAG_REFERENCE,
    alliance: allianceMedals.map((medal) => buildAllianceBrief(medal)),
    empire: empireMedals.map((medal) => buildEmpireBrief(medal)),
  };
}

export function writeMedalArtBrief(path, brief) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(brief, null, 2)}\n`);
}

function buildAllianceBrief(medal) {
  const hasOriginalCoreIcon = medal.id <= ALLIANCE_CORE_ICON_END_ID;
  return {
    id: medal.id,
    bit: medal.bit,
    names: medal.names,
    sourceStem: medal.originalAsset.stem,
    productionAction: hasOriginalCoreIcon ? 'upscale-original' : 'create-variant-if-unique-icon-needed',
    artDirection: hasOriginalCoreIcon
      ? 'Preserve original silhouette, color family, relief depth, and UI readability while upscaling.'
      : 'If unique art is required, derive a same-quality Alliance variant from the named medal, the referenced original stem, and the central gold pentagon emblem from the Alliance flag.',
    emblemReference: ALLIANCE_FLAG_REFERENCE,
    referenceFiles: medal.originalAsset.files.map((file) => file.path),
  };
}

function buildEmpireBrief(medal) {
  const specialIndex = medal.id >= 782 && medal.id <= 791 ? medal.id - 782 : null;
  const rule =
    specialIndex === null
      ? EMPIRE_DESIGN_RULES.get(medal.id)
      : buildSpecialBattleRule(specialIndex);
  if (!rule) {
    throw new Error(`missing Empire art rule for medal ${medal.id}`);
  }
  return {
    id: medal.id,
    bit: medal.bit,
    names: medal.names,
    productionAction: 'create-name-driven-imperial-medal',
    referenceOnlyStem: medal.originalAsset.stem,
    family: rule.family,
		form: rule.form,
		material: rule.material,
		differentiation: rule.differentiation,
		imperialCrestReference: IMPERIAL_CREST_REFERENCE,
		shipMotifReference: EMPIRE_SHIP_MOTIF_REFERENCE,
		sourceLockManifest: IMPERIAL_SOURCE_LOCK_MANIFEST,
		promptKernel: [
			medal.names.ja,
			medal.names.en,
			rule.form,
			rule.material,
			rule.differentiation,
			'fictional LOGH Galactic Empire decoration',
			'exact supplied Imperial double-eagle crest if a crest appears',
			'original Ship/GE MDX render for any large ship motif',
			'readable as 80x80 icon and 4K remaster asset',
		],
	};
}

function buildSpecialBattleRule(index) {
  const grade = index + 1;
  return {
    family: 'special-battle-merit',
    form: `special battle-merit medal series grade ${grade} with compact round medallion and ribbon`,
    material: SPECIAL_BATTLE_COLORS[index],
    differentiation: `grade ${grade}: same family silhouette, distinct enamel/jewel/ribbon color; no text numerals`,
  };
}
