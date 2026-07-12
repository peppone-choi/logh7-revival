// 전략맵/전술맵 위치를 출처와 확신도와 함께 노출한다.
// MDX 모델 좌표는 시각 자산이므로 정본 셀 좌표로 승격하지 않는다.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const CONTENT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'content');
let cache;

function load(name) {
  return JSON.parse(readFileSync(join(CONTENT_DIR, name), 'utf8'));
}

/**
 * 정본 카탈로그의 전략/전술 위치 ledger.
 * 행성은 성계 셀에 독립 셀이 없고 orbit만 정본으로 존재한다.
 * 특수 천체의 MDX 투영 좌표는 보존하되 cell은 의도적으로 null이다.
 */
export function getMapPositionLedger() {
  if (cache) return cache;
  const galaxy = load('galaxy.json');
  const systems = (galaxy.systems ?? []).map((s) => {
    const cell = Number.isInteger(s.canonCol) && Number.isInteger(s.canonRow)
      ? s.canonRow * 100 + s.canonCol : null;
    const provenance = s.coordProvenance ?? '';
    const confidence = provenance.includes('virtual-overlay-P3')
      ? 'P3' : provenance.includes('manual-page101') ? 'P1' : cell === null ? 'P2' : 'P0';
    return {
      id: s.system,
      kind: 'starSystem',
      cell,
      col: s.canonCol ?? null,
      row: s.canonRow ?? null,
      spectralClass: s.spectralClass ?? null,
      cellStatus: cell === null ? 'missing' : confidence === 'P3' ? 'unverified-overlay' : 'canonical-grid-cell',
      confidence,
      source: 'server/content/galaxy.json:canonCol/canonRow',
      planets: (s.planets ?? []).map((p) => ({
        id: p.name,
        kind: 'planet',
        orbit: p.orbit,
        cell: null,
        cellStatus: 'no-independent-strategic-cell',
        source: 'server/content/galaxy.json:planets[].orbit',
        confidence: 'P1',
      })),
      fortresses: (s.fortresses ?? []).map((name) => ({
        id: name,
        kind: 'fortress',
        cell,
        cellStatus: 'inherits-system-cell',
        source: 'server/content/galaxy.json:fortresses[] + system cell',
        confidence: cell === null ? 'P2' : 'P1',
      })),
    };
  });
  const specialBodies = (galaxy._specialBodies?.bodies ?? []).map((body) => ({
    id: body.name,
    kind: body.kind,
    cell: null,
    cellStatus: 'unverified',
    visualPosition: { gameX: body.gameX, gameY: body.gameY, cx: body.cx, cy: body.cy },
    source: 'server/content/galaxy.json:_specialBodies (Null_galaxy.mdx scene graph)',
    confidence: 'P3',
  }));
  cache = Object.freeze({
    version: 1,
    grid: { width: 100, height: 50, cellFormula: 'row*100+col' },
    systems,
    specialBodies,
    tactical: {
      mapKind: 'battle-scene',
      strategicCellRelationship: 'battle participants enter from one strategic cell',
      participantPose: { source: 'wire 0x042f', stride: 0x14, fields: ['shipId', 'heading', 'x', 'z', 'y'] },
      objectSources: ['wire 0x033b unit/ship', 'wire 0x0345 base', 'wire 0x0347 obstacle'],
      staticCelestialPlacement: 'not represented by MDX grid coordinates',
    },
  });
  return cache;
}

export function _resetMapPositionLedgerCache() { cache = undefined; }
