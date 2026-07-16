// M4-OBS-001 SRV-CORR(Issue #7): 서버측 correlation 레코드 빌더/검증기/writeTrace 배선 테스트.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import net from 'node:net';

import {
  CORRELATION_KEYS,
  CorrelationRecordValidationError,
  buildCorrelationRecord,
  validateCorrelationRecord,
  reportCorrelationFailure,
} from '../src/server/logh7-correlation-record.mjs';
import { CORRELATION_KEYS as PROXY_CORRELATION_KEYS } from '../../tools/live/logh7_packet_lab_proxy.mjs';
import { createPlayableServer } from '../src/server/logh7-playable-server.mjs';
import { loadChildCodecTables } from '../src/server/logh7-child-codec.mjs';

const TRANSPORT_KEY = Buffer.from('7b41344331333734382d303135392d346335342d414542332d3144363835373537363142337d', 'hex');
const DECIPHER_KEY = Buffer.from('5859', 'hex');

test('CORRELATION_KEYS는 tools/live/logh7_packet_lab_proxy.mjs의 정본 23키와 drift 없이 일치한다', () => {
  assert.deepEqual(CORRELATION_KEYS, PROXY_CORRELATION_KEYS);
  assert.equal(CORRELATION_KEYS.length, 23);
});

test('buildCorrelationRecord + validateCorrelationRecord: 정상 입력은 통과하고 23키를 모두 채운다', () => {
  const record = buildCorrelationRecord({
    runId: 'run-abc',
    eventId: 'evt-1',
    source: 'server',
    stage: 'connection-opened',
    connectionId: 1,
    direction: 'inbound',
    frameSeq: 0,
    messageId: 'msg-1',
    transportCode: 0x0030,
    payloadLength: 16,
    payloadSha256: 'a'.repeat(64),
    outcome: 'ok',
  });

  assert.deepEqual(Object.keys(record).sort(), [...CORRELATION_KEYS].sort());
  assert.equal(validateCorrelationRecord(record), true);
  // 계산 가능한 필드는 자동 보충된다.
  assert.equal(record.schemaVersion, 1);
  assert.equal(typeof record.processId, 'number');
  assert.equal(record.redaction, 'metadata-only');
  assert.equal(typeof record.monotonicTimestampNs, 'number');
  assert.equal(typeof record.wallTimeUtc, 'string');
  // 넘기지 않은 필드는 명시적 null.
  assert.equal(record.clientId, null);
  assert.equal(record.correlationId, null);
  assert.equal(record.causationId, null);
  assert.equal(record.commandId, null);
  assert.equal(record.innerCode, null);
  assert.equal(record.threadId, null);
});

test('buildCorrelationRecord는 임의 키를 추가하지 않는다', () => {
  const record = buildCorrelationRecord({ source: 'server', bogusKey: 'should-not-appear' });
  assert.equal(Object.hasOwn(record, 'bogusKey'), false);
  assert.deepEqual(Object.keys(record).sort(), [...CORRELATION_KEYS].sort());
});

test('validateCorrelationRecord: 키 누락 시 위반 키를 포함한 구조화된 Error를 throw한다', () => {
  const record = buildCorrelationRecord({ source: 'server' });
  delete record.stage;

  assert.throws(
    () => validateCorrelationRecord(record),
    (error) => {
      assert.ok(error instanceof CorrelationRecordValidationError);
      assert.ok(error.violations.some((v) => v.key === 'stage' && v.reason === 'missing key'));
      return true;
    },
  );
});

test('validateCorrelationRecord: 타입 위반과 미지정 키를 함께 보고하되 민감값은 담지 않는다', () => {
  const record = buildCorrelationRecord({ source: 'server' });
  const secretValue = 'super-secret-should-not-leak-9f8e7d';
  record.connectionId = secretValue; // 타입 위반: number 기대
  record.unexpectedField = secretValue; // 스키마 외 키

  assert.throws(
    () => validateCorrelationRecord(record),
    (error) => {
      assert.ok(error instanceof CorrelationRecordValidationError);
      const keys = error.violations.map((v) => v.key);
      assert.ok(keys.includes('connectionId'));
      assert.ok(keys.includes('unexpectedField'));
      const serialized = JSON.stringify(error.violations);
      assert.equal(serialized.includes(secretValue), false);
      assert.equal(error.message.includes(secretValue), false);
      return true;
    },
  );
});

test('reportCorrelationFailure: SENTRY_DSN 미설정 시 완전 no-op(동적 import도 시도하지 않음)', async () => {
  let importAttempted = false;
  const result = await reportCorrelationFailure(new Error('boom'), {
    sentryDsn: undefined,
    importSentry: () => {
      importAttempted = true;
      throw new Error('should not be called');
    },
  });
  assert.deepEqual(result, { reported: false });
  assert.equal(importAttempted, false);
});

test('reportCorrelationFailure: DSN이 설정되면 captureException을 호출하고 reported:true를 반환한다', async () => {
  let captured = null;
  const error = new Error('validation failed');
  const result = await reportCorrelationFailure(error, {
    sentryDsn: 'https://example.test/1',
    importSentry: async () => ({
      captureException(err) {
        captured = err;
      },
    }),
  });
  assert.deepEqual(result, { reported: true });
  assert.equal(captured, error);
});

test('reportCorrelationFailure: Sentry 전송 자체가 실패해도 throw하지 않는다', async () => {
  const result = await reportCorrelationFailure(new Error('boom'), {
    sentryDsn: 'https://example.test/1',
    importSentry: async () => {
      throw new Error('module load failed');
    },
  });
  assert.deepEqual(result, { reported: false });
});

test('writeTrace 통합: 연결 이벤트가 기존 trace 라인 포맷을 유지하면서 correlation 레코드도 함께 남긴다', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'logh7-srv-corr-'));
  const tracePath = join(dir, 'trace.jsonl');
  const server = createPlayableServer({
    port: 0,
    host: '127.0.0.1',
    tracePath,
    tables: loadChildCodecTables(),
    transportKey: TRANSPORT_KEY,
    decipherKey: DECIPHER_KEY,
  });
  let socket = null;
  try {
    await server.listen();
    socket = net.connect(server.address());
    await once(socket, 'connect');
    socket.end();
    await once(socket, 'close');

    const lines = (await readFile(tracePath, 'utf8'))
      .trim().split('\n').map((line) => JSON.parse(line));

    // 기존 trace 포맷(회귀 없음): event 필드를 가진 라인이 여전히 존재한다.
    const legacyLine = lines.find((line) => line.event === 'connection-opened');
    assert.ok(legacyLine, 'legacy connection-opened trace line must still be written');
    assert.equal(typeof legacyLine.connectionId, 'number');
    assert.equal(typeof legacyLine.ts, 'string');

    // 추가된 correlation 스키마 라인: 23키를 모두 갖고 검증을 통과한다.
    const correlationLine = lines.find((line) => CORRELATION_KEYS.every((key) => Object.hasOwn(line, key)));
    assert.ok(correlationLine, 'a correlation-schema trace line must be written alongside the legacy line');
    assert.equal(validateCorrelationRecord(correlationLine), true);
    assert.equal(correlationLine.source, 'server');
  } finally {
    socket?.destroy();
    await server.close().catch(() => {});
    await rm(dir, { recursive: true, force: true });
  }
});

test('writeTrace 통합: tracePath 미설정이어도 correlation 빌드/검증 경로가 서버를 죽이지 않는다', async () => {
  const server = createPlayableServer({
    port: 0,
    host: '127.0.0.1',
    tables: loadChildCodecTables(),
    transportKey: TRANSPORT_KEY,
    decipherKey: DECIPHER_KEY,
  });
  let socket = null;
  try {
    await server.listen();
    socket = net.connect(server.address());
    await once(socket, 'connect');
    socket.end();
    await once(socket, 'close');
    // 크래시 없이 여기까지 도달하면 통과.
    assert.ok(true);
  } finally {
    socket?.destroy();
    await server.close().catch(() => {});
  }
});
