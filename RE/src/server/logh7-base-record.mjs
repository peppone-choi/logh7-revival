/**
 * `ResponseInformationBase` (0x031f) — 콘텐츠 로더 shim + 순수 코덱 re-export.
 *
 * 관심사 분리(Phase A2 셋째 코호트): 이 모듈은 원래 (a) 순수 와이어 빌더 + RIB_ / RESP_INFO_BASE_
 * 오프셋 상수 와 (b) node:fs 로 content/planet-economy.json 을 읽는 콘텐츠 로더가 섞여 있었다.
 * L2 코덱은 순수해야 하므로 둘을 갈랐다:
 *   - 순수 와이어 빌더(buildResponseInformationBaseInner / systemToBaseRecord / economyBaseRecord)는
 *     codec/base-record.mjs 로 이동(fs import 0).
 *   - 와이어 레이아웃 상수(RESP_INFO_BASE_*·RIB_*)는 기지관리(基地管理) 0x32x 패밀리와 같은 단일 지점
 *     codec/offsets.mjs 로 합류(institution/warehouse가 거기 두는 것과 일관).
 *   - node:fs 콘텐츠 로더(loadBaseEconomyContent)만 이 파일에 남았다.
 *
 * 의존 방향은 단방향이다: loader(이 파일) → codec. codec 은 fs/loader 를 절대 import 하지 않는다.
 *
 * 기존 import 경로 100% 보존: 순수 부분은 아래에서 `export * from './codec/base-record.mjs'` 로
 * 그대로 re-export 하므로, 이 모듈을 import 하던 4개 소비처(info-records / institution-record /
 * warehouse-record / login-session)와 테스트의 import 표면은 1개도 바뀌지 않는다.
 *
 * 0x031f 레코드의 와이어 근거·신뢰도 정책은 codec/base-record.mjs / codec/offsets.mjs 헤더 참조.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// 순수 와이어 코덱(빌더 + RESP_INFO_BASE_*/RIB_* 상수)을 그대로 re-export 해 import 경로를 보존한다.
export * from './codec/base-record.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = join(HERE, '..', '..', 'content');

/**
 * Load content/planet-economy.json into a { systemName -> planets[] } map, reused read-only from the
 * sibling economy module's content layout. Provided so a future world-init wiring can correlate a base's
 * planets without a second file read. (No values are projected onto 0x031f here — see systemToBaseRecord.)
 *
 * fs 콘텐츠 로더 — 순수 코덱과 분리하려고 이 shim 파일에 남겨 둔 유일한 비순수(impure) 함수다.
 *
 * @param {{ path?: string }} [opts]
 * @returns {Map<string, Array<object>>}
 */
export function loadBaseEconomyContent({ path = join(CONTENT_DIR, 'planet-economy.json') } = {}) {
  const map = new Map();
  let doc;
  try {
    doc = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return map; // missing/unreadable content → empty map (server runs without the economy pack)
  }
  const systems = Array.isArray(doc?.systems) ? doc.systems : [];
  for (const sys of systems) {
    const name = sys?.system;
    if (typeof name !== 'string') continue;
    map.set(name, Array.isArray(sys.planets) ? sys.planets : []);
  }
  return map;
}
