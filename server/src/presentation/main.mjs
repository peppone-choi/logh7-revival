// 실 유저 경로 진입점 — 3티어 playable runtime (47900 + SQLite + accounts)

import { parseArgs } from 'node:util';
import { resolve } from 'node:path';
import { createPlayableRuntime } from './createPlayableRuntime.mjs';

const { values } = parseArgs({
  options: {
    port: { type: 'string', default: '47900' },
    host: { type: 'string', default: '127.0.0.1' },
    'advertise-host': { type: 'string' },
    'advertise-port': { type: 'string' },
    trace: { type: 'string' },
    db: { type: 'string' },
  },
  allowPositionals: false,
});

const port = Number(values.port);
const host = values.host;
const hasAdvertiseHost = values['advertise-host'] !== undefined;
const hasAdvertisePort = values['advertise-port'] !== undefined;
if (hasAdvertiseHost !== hasAdvertisePort) {
  throw new Error('--advertise-host and --advertise-port must be provided together');
}
const advertisedPort = hasAdvertisePort ? Number(values['advertise-port']) : port;
if (!Number.isInteger(advertisedPort) || advertisedPort < 1 || advertisedPort > 0xffff) {
  throw new Error(`invalid --advertise-port: ${values['advertise-port'] ?? values.port}`);
}
const advertisedEndpoint = {
  ip: hasAdvertiseHost
    ? values['advertise-host']
    : (host === '0.0.0.0' ? '127.0.0.1' : host),
  port: advertisedPort,
};
const tracePath = values.trace ? resolve(values.trace) : null;
const dbPath = values.db ? resolve(values.db) : undefined;

const runtime = createPlayableRuntime({
  port,
  host,
  advertisedEndpoint,
  tracePath,
  dbPath,
  logger: {
    debug(record) {
      process.stdout.write(`${JSON.stringify({ ts: new Date().toISOString(), ...record })}\n`);
    },
  },
});

await runtime.listen();
const addr = runtime.address();
process.stdout.write(
  `${JSON.stringify({
    event: 'playable-runtime-ready',
    address: addr,
    dbPath: runtime.app.dbPath,
    architecture: '3-tier-cqrs-orm',
  })}\n`,
);

const shutdown = async (signal) => {
  process.stdout.write(`${JSON.stringify({ event: 'shutdown', signal })}\n`);
  await runtime.close();
  process.exit(0);
};
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
