// PgConnection — PostgreSQL 영속성 포트 (스텁, 미배선)
//
// 왜 별도 포트인가: 현행 persistence 스택(Database/UnitOfWork/WorldCatalog/
// WorldSeedLoader)은 node:sqlite 의 *동기* API(prepare().get/all/run, exec)를
// 그대로 쓴다. 반면 pg 는 *비동기*(Promise) 다. 이 sync↔async 간극이 PG 전환의
// 실제 비용이며, SQL 방언 차이가 아니다. 따라서 최소 침습 이식은 "동기 커넥션을
// 흉내내기"가 아니라, UnitOfWork/카탈로그를 async 포트로 올리는 것이다.
//
// 이 파일은 그 async 포트의 계약(contract)만 정의한 스텁이다. 아직 아무 부팅
// 경로도 이걸 import 하지 않는다(기본 = SQLite). 'pg' 는 함수 내부에서 지연
// import 하여, 이 모듈을 로드하는 것만으로 pg 설치를 요구하지 않는다(테스트 안전).
//
// 다음 배치 착수 시:
//   1. UnitOfWork 의 find*/persist*/flush 를 async 로 승격(핸들러가 이미 await 가능).
//   2. 각 db.prepare(sql).get/all/run 을 pg 의 client.query(sql, params) 로 치환,
//      lastInsertRowid -> INSERT ... RETURNING id, BEGIN IMMEDIATE -> BEGIN.
//   3. WorldCatalog/WorldSeedLoader 도 동일 포트로 async 이식(ON CONFLICT 는 거의 무변경).

/**
 * PG 커넥션 풀을 열고, 이 스택이 기대하는 async 커넥션 façade 를 돌려준다.
 * @param {{ connectionString?: string }} [options] 기본값은 env DATABASE_URL.
 * @returns {Promise<PgConnection>}
 */
export async function openPgConnection({ connectionString = process.env.DATABASE_URL } = {}) {
  if (!connectionString) {
    throw new Error('openPgConnection: DATABASE_URL(또는 connectionString) 필요');
  }
  const { default: pg } = await import('pg');
  const pool = new pg.Pool({ connectionString });

  return {
    pool,
    /**
     * 단발 쿼리. @returns {Promise<{ rows: object[], rowCount: number }>}
     */
    async query(sql, params = []) {
      return pool.query(sql, params);
    },
    /**
     * 단일 트랜잭션 경계. fn 안의 모든 쓰기를 하나의 BEGIN..COMMIT 으로 묶는다.
     * 전략 트랙(이벤트 append + world_fleet projection)이 이 경계 위에 올라간다.
     * @param {(client: import('pg').PoolClient) => Promise<any>} fn
     */
    async transaction(fn) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await fn(client);
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },
    async close() {
      await pool.end();
    },
  };
}

/**
 * @typedef {object} PgConnection
 * @property {import('pg').Pool} pool
 * @property {(sql: string, params?: any[]) => Promise<{ rows: object[], rowCount: number }>} query
 * @property {(fn: (client: import('pg').PoolClient) => Promise<any>) => Promise<any>} transaction
 * @property {() => Promise<void>} close
 */
