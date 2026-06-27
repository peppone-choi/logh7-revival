// 影響力·友好度 — Phase B §1.4 / §B5.
// 캐논: 사교 커맨드(演説·夜会 → 影響力↑, 狩猟·談話 → 友好度↑, 会談 등)가 캐릭터별 影響力/友好度를 변동시킨다.
// 影響力은 계급 사다리 법칙4의 입력이기도 하다([[logh7-rank-table]] 비교자). 델타 크기·곡선은 SERVER DESIGN,
// 0..MAX 클램프는 규칙. 순수 인메모리 상태(charId별), 영속성 직렬화 지원.

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

export const INFLUENCE_MAX = 100;
export const FRIENDLINESS_MAX = 100;

/** 캐릭터별 影響力/友好度 상태. */
export function createRelationsState() {
  /** @type {Map<number|string, {influence:number, friendliness:number}>} */
  const byChar = new Map();
  const ensure = (id) => {
    if (!byChar.has(id)) byChar.set(id, { influence: 0, friendliness: 0 });
    return byChar.get(id);
  };

  const state = {
    get(id) {
      return byChar.get(id) ?? null;
    },
    influenceOf(id) {
      return byChar.get(id)?.influence ?? 0;
    },
    friendlinessOf(id) {
      return byChar.get(id)?.friendliness ?? 0;
    },
    /** 演説/夜会 등 → 影響力 ±. 0..MAX 클램프, 갱신값 반환. */
    adjustInfluence(id, delta) {
      const r = ensure(id);
      r.influence = clamp(r.influence + (Number(delta) || 0), 0, INFLUENCE_MAX);
      return r.influence;
    },
    /** 狩猟/談話 등 → 友好度 ±. 0..MAX 클램프, 갱신값 반환. */
    adjustFriendliness(id, delta) {
      const r = ensure(id);
      r.friendliness = clamp(r.friendliness + (Number(delta) || 0), 0, FRIENDLINESS_MAX);
      return r.friendliness;
    },
    // --- 영속성 ---
    toSnapshot() {
      return [...byChar.entries()].map(([id, r]) => ({ id, ...r }));
    },
    restore(snapshot = []) {
      byChar.clear();
      for (const r of Array.isArray(snapshot) ? snapshot : []) {
        byChar.set(r.id, { influence: Number(r.influence) || 0, friendliness: Number(r.friendliness) || 0 });
      }
    },
  };
  return state;
}
