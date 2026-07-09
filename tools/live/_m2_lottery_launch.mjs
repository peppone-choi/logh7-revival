// M2 오리지널 추첨 라이브QA 런처 (검증 전용 계측 래퍼 — 서버/클라 코드 무수정).
// 목적: 빈 계정 오리지널 추첨(0x1006)에서 클라가 charge한 char_id 를 캡처한다.
// 서버 트레이스는 복호화된 0x1006 inner body 를 남기지 않으므로, 공개
// characterStore 주입 파라미터로 addCharacter 호출을 가로채 candidateId(=매칭된
// 클라 송신 id)를 기록한다. 이건 서버 로직 변경이 아니라 QA 계측이다.
import { createPlayableServer } from '../../server/src/server/logh7-playable-server.mjs';
import { createCharacterStore } from '../../server/src/server/logh7-character-store.mjs';

const evdir = process.argv[2];
if (!evdir) { console.error('usage: node _m2_lottery_launch.mjs <evidence-dir>'); process.exit(1); }

const tracePath = `${evdir}/trace.jsonl`;
const storePath = `${evdir}/store.json`;

function emit(record) {
  process.stdout.write(`${JSON.stringify({ ts: new Date().toISOString(), ...record })}\n`);
}

// 실제 store 를 만들고 addCharacter 를 계측 프록시로 감싼다.
const realStore = createCharacterStore(storePath);
const instrumentedStore = {
  getCharacters: (accountId) => realStore.getCharacters(accountId),
  deleteCharacter: (accountId, charId) => realStore.deleteCharacter(accountId, charId),
  addCharacter: (accountId, charData) => {
    // ★핵심 캡처: charge 된 후보 id. candidateId 는 클라가 0x1006 에 담아 보낸
    //   char_id 중 서버 후보 풀(501/502/503)과 매칭된 값이다.
    emit({
      event: 'CHARGE-addCharacter',
      accountId,
      candidateId: charData?.candidateId ?? null,
      charData,
    });
    const rec = realStore.addCharacter(accountId, charData);
    emit({ event: 'CHARGE-persisted', accountId, storeId: rec?.id ?? null, candidateId: rec?.candidateId ?? null });
    return rec;
  },
};

const srv = createPlayableServer({
  port: 47900,
  host: '127.0.0.1',
  tracePath,
  characterStore: instrumentedStore,
  logger: { debug(record) { emit(record); } },
});

await srv.listen();
emit({ event: 'm2-lottery-server-ready', address: srv.address(), store: storePath });

process.on('SIGINT', async () => { await srv.close(); process.exit(0); });
process.on('SIGTERM', async () => { await srv.close(); process.exit(0); });
