// M2 라이브QA 런처 — 깨끗한 JSON store + trace를 증거 디렉터리로.
// 서버 코드 수정 아님(검증용 조립 스크립트). createPlayableServer 기본값 사용.
import { createPlayableServer } from '../../server/src/server/logh7-playable-server.mjs';

const evdir = process.argv[2];
if (!evdir) { console.error('usage: node _m2_launch.mjs <evidence-dir>'); process.exit(1); }

const srv = createPlayableServer({
  port: 47900,
  host: '127.0.0.1',
  tracePath: `${evdir}/trace.jsonl`,
  characterStorePath: `${evdir}/store.json`,
  logger: {
    debug(record) {
      process.stdout.write(`${JSON.stringify({ ts: new Date().toISOString(), ...record })}\n`);
    },
  },
});

await srv.listen();
process.stdout.write(`${JSON.stringify({ event: 'm2-server-ready', address: srv.address(), store: `${evdir}/store.json` })}\n`);

process.on('SIGINT', async () => { await srv.close(); process.exit(0); });
process.on('SIGTERM', async () => { await srv.close(); process.exit(0); });
