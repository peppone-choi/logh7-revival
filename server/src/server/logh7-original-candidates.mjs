// logh7-original-candidates.mjs — 오리지널 캐릭터 추첨(0x1006) 후보 풀
//
// ★정본 아님 — 오리지널 로스터 승격 전 임시(provisional) 데이터.
//   원작 캐릭터 스탯/이름/능력치는 아직 정본화되지 않았다(work-plan §6 hidden-data
//   워치리스트). 여기 값은 와이어 플로우(빈 계정 → 오리지널 추첨 → 캐릭터 획득 →
//   로비 해제)가 도는 것을 증명하기 위한 최소 필드 + 잠정 표시일 뿐이다.
//   진짜 원작 데이터로 오해하지 말 것. 로스터 정본화 시 이 모듈을 교체한다.
//
// 역할: 서버가 통제하는 "후보 오리지널 캐릭터 id 풀"의 단일 진실원(single source of
//   truth). 두 곳이 이 풀을 공유한다:
//     (1) 0x2006 세션 데이터(scenario-session.mjs) — 클라에 후보 id를 광고.
//     (2) 0x1006 CommandOriginalCharacterCharge 핸들러 — 들어온 id를 이 풀에서
//         찾아 계정 스토어에 charge.
//   두 경로가 같은 풀을 참조하므로 클라가 되돌려 보내는 char_id는 항상 서버가
//   정의한 후보 id와 정합한다.

/**
 * @typedef {{
 *   id: number,
 *   power: number,
 *   lastname: string,
 *   firstname: string,
 *   provisional: true,
 * }} OriginalCandidate
 */

/**
 * 잠정 후보 목록. id 는 와이어 정합, power 는 0x2004 카드 진영(폼과 동일 2|3).
 * lastname/firstname 은 정본 이름이 아니라 ORM 영속 게이트용 잠정 표기
 * (createCharacterEntity 가 빈 이름을 거부 — 황제 폴백 방지). 원작 로스터 승격 시 교체.
 *
 * @type {OriginalCandidate[]}
 */
export const ORIGINAL_CANDIDATES = [
  { id: 501, power: 2, lastname: 'Orig', firstname: '501', provisional: true },
  { id: 502, power: 3, lastname: 'Orig', firstname: '502', provisional: true },
  { id: 503, power: 2, lastname: 'Orig', firstname: '503', provisional: true },
];

/** 서버가 광고하는 후보 오리지널 캐릭터 id 목록. */
export const ORIGINAL_CANDIDATE_IDS = ORIGINAL_CANDIDATES.map((c) => c.id);

const _byId = new Map(ORIGINAL_CANDIDATES.map((c) => [c.id, c]));

/**
 * 후보 id로 잠정 후보 캐릭터를 조회한다.
 * @param {number} id
 * @returns {OriginalCandidate | undefined} 풀에 없으면 undefined
 */
export function getOriginalCandidate(id) {
  return _byId.get(Number(id));
}
