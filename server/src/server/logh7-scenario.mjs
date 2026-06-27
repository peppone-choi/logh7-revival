import { existsSync, readFileSync } from 'node:fs';

// 시나리오 정의/로더 — Phase C(커스텀 시스템 확장성).
// 캐논 801-07 시작이든 커스텀 시작이든, "월드 시작 상태"(게임클록 기준점 + 성계/함선/함대/지상부대 배치 +
// 소유/진영)를 **데이터로** 정의하고 한 번에 월드에 시드한다. 코어 무수정: 기존 world-state 시드 API
// (seedSystems/upsertShip/upsertFleet/upsertTroop)만 호출한다. 검증은 순수, 로드는 전달된 world를 변이.
//
// 시나리오 형태:
//   {
//     name: string,
//     clockStartMs?: number,          // 게임클록 기준점(없으면 호출자/0). ※ 클록은 생성시 결정이라
//                                     //   loadScenarioInto는 이 값을 적용하지 않고 메타로만 노출 → 호출자가
//                                     //   createWorldState({clockStartMs})에 쓴다.
//     systems?:  [{ name, faction?, planets?, ... }],   // seedSystems 입력 형태
//     ships?:    [{ id, owner?, faction?, shipClass?, x?, y?, z?, heading?, state?, stats? }],
//     fleets?:   [{ id, owner?, faction?, commander?, cell?, boats?, supply?, mapSection? }],
//     troops?:   [{ id, owner?, faction?, strength?, morale?, defense?, x?, y?, z?, landed? }],
//   }

const COLLECTION_KEYS = ['systems', 'ships', 'fleets', 'troops', 'characters'];

/**
 * 시나리오 정의 검증(순수). name 필수(문자열), 선택 컬렉션은 배열, clockStartMs는 숫자(있으면).
 * 엔티티 id 필수 검사(ships/fleets/troops). systems는 name 키.
 * @returns {{ valid:boolean, errors:string[] }}
 */
export function validateScenario(scenario = {}) {
  const errors = [];
  if (!scenario || typeof scenario !== 'object') {
    return { valid: false, errors: ['not-an-object'] };
  }
  if (typeof scenario.name !== 'string' || scenario.name.length === 0) {
    errors.push('no-name');
  }
  if (scenario.clockStartMs !== undefined && !Number.isFinite(scenario.clockStartMs)) {
    errors.push('bad-clock');
  }
  for (const key of COLLECTION_KEYS) {
    if (scenario[key] !== undefined && !Array.isArray(scenario[key])) {
      errors.push(`${key}-not-array`);
    }
  }
  for (const key of ['ships', 'fleets', 'troops', 'characters']) {
    for (const e of Array.isArray(scenario[key]) ? scenario[key] : []) {
      if (e == null || e.id === undefined || e.id === null) {
        errors.push(`${key}-missing-id`);
        break;
      }
    }
  }
  for (const s of Array.isArray(scenario.systems) ? scenario.systems : []) {
    if (s == null || typeof s.name !== 'string' || s.name.length === 0) {
      errors.push('systems-missing-name');
      break;
    }
  }
  return { valid: errors.length === 0, errors };
}

/**
 * 시나리오를 월드에 로드(시드). 검증 실패면 적용 없이 에러 반환. world의 기존 시드 API만 호출하므로
 * 부분 구현 도메인(troop 등)도 world가 지원하는 만큼만 시드된다. 게임클록 기준점은 적용하지 않고
 * (생성시 결정) `clockStartMs`로 메타 반환 → 호출자가 createWorldState에 전달.
 * @param {object} world createWorldState() 인스턴스
 * @param {object} scenario 시나리오 정의
 * @returns {{ ok:boolean, errors:string[], counts:{systems:number,ships:number,fleets:number,troops:number}, clockStartMs:number|null }}
 */
export function loadScenarioInto(world, scenario = {}) {
  const { valid, errors } = validateScenario(scenario);
  if (!valid) {
    return { ok: false, errors, counts: { systems: 0, ships: 0, fleets: 0, troops: 0 }, clockStartMs: null };
  }
  const counts = { systems: 0, ships: 0, fleets: 0, troops: 0 };

  if (Array.isArray(scenario.systems) && scenario.systems.length && typeof world.seedSystems === 'function') {
    world.seedSystems(scenario.systems);
    counts.systems = scenario.systems.length;
  }
  if (Array.isArray(scenario.ships) && typeof world.upsertShip === 'function') {
    for (const ship of scenario.ships) {
      world.upsertShip(ship);
      counts.ships += 1;
    }
  }
  if (Array.isArray(scenario.fleets) && typeof world.upsertFleet === 'function') {
    for (const fleet of scenario.fleets) {
      world.upsertFleet(fleet);
      counts.fleets += 1;
    }
  }
  if (Array.isArray(scenario.troops) && typeof world.upsertTroop === 'function') {
    for (const troop of scenario.troops) {
      world.upsertTroop(troop);
      counts.troops += 1;
    }
  }
  if (Array.isArray(scenario.characters) && typeof world.upsertCharacter === 'function') {
    for (const ch of scenario.characters) {
      world.upsertCharacter(ch);
      counts.characters = (counts.characters ?? 0) + 1;
    }
  }

  // A7 시나리오/세션 메타(있으면) → world에 기록. 0x2006 세션레코드(세션명)·턴/연도·진영별 원수의 출처.
  if (typeof world.setScenarioInfo === 'function'
      && (scenario.sessionName != null || scenario.startYear != null
          || scenario.term != null || Array.isArray(scenario.powers))) {
    world.setScenarioInfo({
      sessionName: scenario.sessionName,
      startYear: scenario.startYear,
      term: scenario.term,
      powers: scenario.powers,
    });
  }

  return {
    ok: true,
    errors: [],
    counts,
    clockStartMs: scenario.clockStartMs !== undefined ? scenario.clockStartMs : null,
  };
}

/**
 * 시나리오 JSON 파일을 읽어 파싱+검증한다(thin fs 래퍼). 파일 없음/파싱 실패/검증 실패는 throw하지 않고
 * `{ scenario:null, errors:[...] }`로 보고한다(부팅 경로가 폴백 가능하도록). 성공 시 `{ scenario, errors:[] }`.
 * @param {string} path 시나리오 JSON 경로
 */
export function loadScenarioFile(path) {
  if (!path || !existsSync(path)) {
    return { scenario: null, errors: ['file-not-found'] };
  }
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return { scenario: null, errors: ['parse-error'] };
  }
  const { valid, errors } = validateScenario(parsed);
  if (!valid) {
    return { scenario: null, errors };
  }
  return { scenario: parsed, errors: [] };
}
