#!/usr/bin/env node
// 라이브 QA용 얇은 부트스트랩: 로그인 하네스 서버를 리슨 소켓으로 띄운다.
// 서버 코덱/응답 로직은 건드리지 않는다 — createLoginHarnessServer를 그대로 호출만 한다.
//
// 사용:
//   node tools/live/logh7_login_harness_launch.mjs --port 47900 --trace .omo/live-qa/<stamp>/trace.jsonl
//
// 종료: SIGINT/SIGTERM 시 소켓·리슨 정리 후 종료.

import { parseArgs } from 'node:util';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createLoginHarnessServer } from '../../server/src/server/logh7-login-harness-server.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

function parseCli(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      port: { type: 'string' },
      host: { type: 'string' },
      trace: { type: 'string' },
    },
    allowPositionals: false,
  });
  return values;
}

async function main() {
  const values = parseCli(process.argv.slice(2));
  const port = values.port ? Number(values.port) : 47900;
  const host = values.host ?? '127.0.0.1';
  const tracePath = values.trace ? resolve(REPO_ROOT, values.trace) : null;

  if (!Number.isInteger(port) || port <= 0 || port > 0xffff) {
    throw new Error(`invalid --port: ${values.port}`);
  }

  // 트레이스를 stdout 으로도 흘려 라이브 관찰 가능하게 한다(logger.debug 훅 사용).
  const logger = {
    debug(record) {
      process.stdout.write(`${JSON.stringify({ ts: new Date().toISOString(), ...record })}\n`);
    },
  };

  const server = createLoginHarnessServer({ port, host, tracePath, logger });
  await server.listen();
  const addr = server.address();
  process.stdout.write(
    `${JSON.stringify({ event: 'harness-listening', host, port, address: addr, tracePath })}\n`,
  );

  let shuttingDown = false;
  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    process.stdout.write(`${JSON.stringify({ event: 'harness-shutdown', signal })}\n`);
    try {
      await server.close();
    } finally {
      process.exit(0);
    }
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
