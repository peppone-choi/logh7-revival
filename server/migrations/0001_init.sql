-- 0001_init — PostgreSQL 타깃 스키마 (현행 SQLite 스키마의 1:1 방언 이식)
--
-- 출처: server/src/infrastructure/persistence/Database.mjs 의 MIGRATIONS 문자열.
-- 이 파일은 "다음 배치"에서 async PG 포트가 붙을 때 적용할 타깃 정본이다.
-- 현재 기본 부팅 경로(SQLite)는 이 파일을 읽지 않는다.
--
-- 방언 이식 원칙(최소 침습 — 무변조 이식):
--   * INTEGER PRIMARY KEY AUTOINCREMENT -> BIGINT GENERATED ALWAYS AS IDENTITY
--   * epoch millis 타임스탬프(created_at/updated_at) -> BIGINT (SQLite 와 동일 의미)
--   * *_json 컬럼은 TEXT 로 유지 — UnitOfWork 의 JSON.parse/stringify 매핑을 그대로
--     재사용하기 위함. JSONB 전환은 후속 최적화(다음 배치 목록 참조)로 분리.
--   * ON CONFLICT ... DO UPDATE 는 PG 원본 문법이라 WorldSeedLoader 쿼리 거의 무변경.
--   * lastInsertRowid -> INSERT ... RETURNING id (UnitOfWork.flush 이식 시 반영).

BEGIN;

CREATE TABLE IF NOT EXISTS accounts (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  account_id  TEXT   NOT NULL UNIQUE,
  password    TEXT   NOT NULL,
  created_at  BIGINT NOT NULL,
  revision    BIGINT NOT NULL DEFAULT 0,
  updated_at  BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS characters (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  account_id    TEXT    NOT NULL,
  power         INTEGER NOT NULL DEFAULT 1,
  blood         INTEGER NOT NULL DEFAULT 0,
  sex           INTEGER NOT NULL DEFAULT 0,
  lastname      TEXT    NOT NULL DEFAULT '',
  firstname     TEXT    NOT NULL DEFAULT '',
  face          INTEGER NOT NULL DEFAULT 1,
  rank          INTEGER NOT NULL DEFAULT 13,
  unit_id       BIGINT,
  cell          INTEGER NOT NULL DEFAULT 2588,
  online        INTEGER NOT NULL DEFAULT 0,
  ability8_json TEXT,
  created_at    BIGINT  NOT NULL,
  revision      BIGINT  NOT NULL DEFAULT 0,
  updated_at    BIGINT  NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_characters_account ON characters(account_id);

CREATE TABLE IF NOT EXISTS character_authority_cards (
  character_id BIGINT  NOT NULL,
  ordinal      INTEGER NOT NULL CHECK (ordinal BETWEEN 0 AND 15),
  kind         INTEGER NOT NULL CHECK (kind BETWEEN 0 AND 299),
  spot         BIGINT  NOT NULL CHECK (spot BETWEEN 0 AND 4294967295),
  provenance   TEXT    NOT NULL CHECK (length(provenance) > 0),
  PRIMARY KEY (character_id, ordinal),
  UNIQUE (character_id, kind),
  FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_authority_cards_character
  ON character_authority_cards(character_id, ordinal);

-- CQRS 읽기 프로젝션 (전략 트랙: 이벤트 + 강한 일관성 projection).
CREATE TABLE IF NOT EXISTS world_fleet (
  unit_id      BIGINT  PRIMARY KEY,
  character_id BIGINT  NOT NULL,
  account_id   TEXT    NOT NULL,
  cell         INTEGER NOT NULL,
  revision     BIGINT  NOT NULL DEFAULT 0,
  updated_at   BIGINT  NOT NULL
);

CREATE TABLE IF NOT EXISTS domain_events (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  type         TEXT   NOT NULL,
  payload_json TEXT   NOT NULL,
  created_at   BIGINT NOT NULL
);

-- ── 정적 세계 참조 카탈로그 (읽기 전용 시드; 플레이어 상태와 분리) ──────────
CREATE TABLE IF NOT EXISTS galaxy_systems (
  system_name     TEXT PRIMARY KEY,
  faction         TEXT,
  is_corridor     INTEGER NOT NULL DEFAULT 0,
  canon_col       INTEGER,
  canon_row       INTEGER,
  cell            INTEGER,
  canon_game_col  INTEGER,
  canon_game_row  INTEGER,
  spectral_class  TEXT,
  planets_json    TEXT,
  fortresses_json TEXT
);
CREATE INDEX IF NOT EXISTS idx_galaxy_cell ON galaxy_systems(cell);

CREATE TABLE IF NOT EXISTS ships (
  ship_key   TEXT PRIMARY KEY,
  name       TEXT,
  side       TEXT,
  ship_class TEXT,
  pools_json TEXT
);

CREATE TABLE IF NOT EXISTS fortresses (
  id                TEXT PRIMARY KEY,
  name_ja           TEXT,
  name_ko           TEXT,
  name_en           TEXT,
  system            TEXT,
  faction           TEXT,
  cannon_name       TEXT,
  cannon_power      INTEGER,
  armor             INTEGER,
  antiaircraft      INTEGER,
  stamina           INTEGER,
  defense_outfit    INTEGER,
  garrison_capacity INTEGER,
  data_json         TEXT
);

CREATE TABLE IF NOT EXISTS factions (
  id             TEXT PRIMARY KEY,
  power_id       INTEGER,
  name_ja        TEXT,
  name_ko        TEXT,
  name_en        TEXT,
  color_rgb_json TEXT,
  dynasty        TEXT,
  flags_json     TEXT,
  note           TEXT
);

CREATE TABLE IF NOT EXISTS rank_table (
  code       INTEGER PRIMARY KEY,
  ja         TEXT,
  ko         TEXT,
  tier       TEXT,
  confidence TEXT
);

CREATE TABLE IF NOT EXISTS abilities (
  order_index INTEGER PRIMARY KEY,
  ability_key TEXT NOT NULL,
  ja          TEXT,
  ko          TEXT
);

CREATE TABLE IF NOT EXISTS initial_deployment (
  faction TEXT    NOT NULL,
  unit    INTEGER NOT NULL,
  system  TEXT,
  planet  TEXT,
  cell    INTEGER,
  PRIMARY KEY (faction, unit)
);

CREATE TABLE IF NOT EXISTS canon_characters (
  id            TEXT PRIMARY KEY,
  source        TEXT NOT NULL DEFAULT 'canon',
  faction       TEXT,
  power_id      INTEGER,
  kind          TEXT,
  sex           INTEGER,
  name_ja       TEXT,
  name_romaji   TEXT,
  name_kr       TEXT,
  lastname      TEXT,
  firstname     TEXT,
  rank_code     INTEGER,
  post          TEXT,
  face          INTEGER,
  ability8_json TEXT,
  unit          INTEGER,
  flagship      TEXT,
  data_json     TEXT
);
CREATE INDEX IF NOT EXISTS idx_canon_characters_source ON canon_characters(source);

CREATE TABLE IF NOT EXISTS seed_provenance (
  catalog      TEXT PRIMARY KEY,
  source_file  TEXT,
  provenance   TEXT,
  generated_at TEXT,
  row_count    INTEGER,
  loaded_at    BIGINT
);

COMMIT;
