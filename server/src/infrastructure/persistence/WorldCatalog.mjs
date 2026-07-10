// 정적 세계 참조 카탈로그 조회 리포지토리 (읽기 전용).
// 시드된 galaxy_systems/ships/fortresses/factions/rank_table/abilities/
// initial_deployment/canon_characters 를 도메인 친화 형태로 반환한다.

function parse(json, fallback) {
  if (json == null) return fallback;
  try {
    return JSON.parse(json);
  } catch {
    return fallback;
  }
}

/**
 * @param {{ db: import('node:sqlite').DatabaseSync }} connection openDatabase() 결과
 */
export function createWorldCatalog(connection) {
  const { db } = connection;

  function getGalaxySystems() {
    return db
      .prepare(
        `SELECT system_name, faction, is_corridor, canon_col, canon_row, cell,
                canon_game_col, canon_game_row, spectral_class, planets_json, fortresses_json
         FROM galaxy_systems ORDER BY cell`,
      )
      .all()
      .map((r) => ({
        system_name: r.system_name,
        faction: r.faction,
        isCorridor: r.is_corridor === 1,
        canonCol: r.canon_col,
        canonRow: r.canon_row,
        cell: r.cell,
        canonGameCol: r.canon_game_col,
        canonGameRow: r.canon_game_row,
        spectralClass: r.spectral_class,
        planets: parse(r.planets_json, []),
        fortresses: parse(r.fortresses_json, []),
      }));
  }

  function getSystemByCell(cell) {
    const r = db
      .prepare(
        `SELECT system_name, faction, is_corridor, cell, spectral_class, planets_json, fortresses_json
         FROM galaxy_systems WHERE cell = ?`,
      )
      .get(cell >>> 0);
    if (!r) return null;
    return {
      system_name: r.system_name,
      faction: r.faction,
      isCorridor: r.is_corridor === 1,
      cell: r.cell,
      spectralClass: r.spectral_class,
      planets: parse(r.planets_json, []),
      fortresses: parse(r.fortresses_json, []),
    };
  }

  function getShips() {
    return db
      .prepare('SELECT ship_key, name, side, ship_class, pools_json FROM ships ORDER BY ship_key')
      .all()
      .map((r) => ({
        ship_key: r.ship_key,
        name: r.name,
        side: r.side,
        shipClass: r.ship_class,
        pools: parse(r.pools_json, {}),
      }));
  }

  function getFortresses() {
    return db
      .prepare('SELECT data_json FROM fortresses ORDER BY id')
      .all()
      .map((r) => parse(r.data_json, {}));
  }

  function getFactions() {
    return db
      .prepare('SELECT id, power_id, name_ja, name_ko, name_en, color_rgb_json, dynasty, flags_json, note FROM factions ORDER BY power_id')
      .all()
      .map((r) => ({
        id: r.id,
        powerId: r.power_id,
        name_ja: r.name_ja,
        name_ko: r.name_ko,
        name_en: r.name_en,
        colorRgb: parse(r.color_rgb_json, null),
        dynasty: r.dynasty,
        flags: parse(r.flags_json, []),
        note: r.note,
      }));
  }

  function getRanks() {
    return db.prepare('SELECT code, ja, ko, tier, confidence FROM rank_table ORDER BY code').all();
  }

  function getAbilities() {
    return db
      .prepare('SELECT order_index, ability_key, ja, ko FROM abilities ORDER BY order_index')
      .all()
      .map((r) => ({ order: r.order_index, key: r.ability_key, ja: r.ja, ko: r.ko }));
  }

  function getInitialDeployment() {
    return db
      .prepare('SELECT faction, unit, system, planet, cell FROM initial_deployment ORDER BY faction, unit')
      .all();
  }

  function getCanonCharacters() {
    return db
      .prepare('SELECT data_json FROM canon_characters ORDER BY id')
      .all()
      .map((r) => parse(r.data_json, {}));
  }

  function getProvenance() {
    return db
      .prepare('SELECT catalog, source_file, provenance, generated_at, row_count, loaded_at FROM seed_provenance ORDER BY catalog')
      .all();
  }

  function counts() {
    const tables = [
      'galaxy_systems',
      'ships',
      'fortresses',
      'factions',
      'rank_table',
      'abilities',
      'initial_deployment',
      'canon_characters',
    ];
    const out = {};
    for (const t of tables) {
      out[t] = db.prepare(`SELECT COUNT(*) AS c FROM ${t}`).get().c;
    }
    return out;
  }

  return {
    getGalaxySystems,
    getSystemByCell,
    getShips,
    getFortresses,
    getFactions,
    getRanks,
    getAbilities,
    getInitialDeployment,
    getCanonCharacters,
    getProvenance,
    counts,
  };
}
