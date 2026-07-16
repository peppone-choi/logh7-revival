// logh7-correlation-record.mjs — M4-OBS-001 서버측 상관관계(correlation) 레코드 스키마/빌더/검증기.
//
// 정본 키 목록은 tools/live/logh7_packet_lab_proxy.mjs:30 CORRELATION_KEYS(23키)다.
// 이 모듈은 tools/ 를 import하지 않는다(server/src → tools/ 프로덕션 의존을 만들지 않기 위해).
// 대신 두 목록의 drift는 server/tests/logh7-correlation-record.test.mjs 에서
// 양쪽을 모두 import해 deepEqual로 검증한다.
export const CORRELATION_KEYS = Object.freeze([
  'schemaVersion',
  'runId',
  'eventId',
  'source',
  'stage',
  'connectionId',
  'clientId',
  'direction',
  'frameSeq',
  'messageId',
  'correlationId',
  'causationId',
  'commandId',
  'transportCode',
  'innerCode',
  'payloadLength',
  'payloadSha256',
  'processId',
  'threadId',
  'monotonicTimestampNs',
  'wallTimeUtc',
  'outcome',
  'redaction',
]);

// 호출자가 값을 넘기지 않아도 서버 프로세스가 스스로 채울 수 있는 필드들의 기본값.
// (proxy의 createCorrelationRecorder 관례와 동일: schemaVersion=1, processId=현재 pid,
//  redaction='metadata-only'.)
const COMPUTED_DEFAULTS = {
  schemaVersion: () => 1,
  processId: () => process.pid,
  redaction: () => 'metadata-only',
  monotonicTimestampNs: () => Number(process.hrtime.bigint()),
  wallTimeUtc: () => new Date().toISOString(),
};

// 값이 present일 때 허용되는 typeof. 이 5개 키는 항상 채워지므로(COMPUTED_DEFAULTS) null 불가.
const FIELD_TYPES = {
  schemaVersion: 'number',
  runId: 'string',
  eventId: 'string',
  source: 'string',
  stage: 'string',
  connectionId: 'number',
  clientId: 'string',
  direction: 'string',
  frameSeq: 'number',
  messageId: 'string',
  correlationId: 'string',
  causationId: 'string',
  commandId: 'string',
  transportCode: 'number',
  innerCode: 'number',
  payloadLength: 'number',
  payloadSha256: 'string',
  processId: 'number',
  threadId: 'number',
  monotonicTimestampNs: 'number',
  wallTimeUtc: 'string',
  outcome: 'string',
  redaction: 'string',
};

const REQUIRED_NON_NULL_KEYS = new Set(Object.keys(COMPUTED_DEFAULTS));

/**
 * 23키 중 누락된 값을 명시적 null로 채워 correlation 레코드를 만든다.
 * traceData에 없는 필드는 null. schemaVersion/processId/redaction/timestamp류만
 * 계산 가능하므로 미지정 시 자동 보충한다. 23키 외의 임의 키는 절대 추가하지 않는다.
 * @param {Record<string, unknown>} [traceData]
 * @returns {Record<string, unknown>}
 */
export function buildCorrelationRecord(traceData = {}) {
  if (traceData === null || typeof traceData !== 'object' || Array.isArray(traceData)) {
    throw new TypeError('traceData must be a plain object');
  }
  const record = {};
  for (const key of CORRELATION_KEYS) {
    const hasValue = Object.hasOwn(traceData, key) && traceData[key] !== undefined;
    if (hasValue) {
      record[key] = traceData[key];
    } else if (Object.hasOwn(COMPUTED_DEFAULTS, key)) {
      record[key] = COMPUTED_DEFAULTS[key]();
    } else {
      record[key] = null;
    }
  }
  return record;
}

export class CorrelationRecordValidationError extends Error {
  /**
   * @param {Array<{key: string, reason: string}>} violations 민감값을 포함하지 않는 위반 키 목록
   */
  constructor(violations) {
    const keys = violations.map((v) => v.key).join(', ');
    super(`correlation record violates schema (${violations.length} violation(s)): ${keys}`);
    this.name = 'CorrelationRecordValidationError';
    this.violations = violations;
  }
}

/**
 * correlation 레코드가 23키 스키마(키 집합·필수 타입)를 만족하는지 검증한다.
 * 위반 시 위반 키 목록을 담은 CorrelationRecordValidationError를 throw한다(실제 값은 담지 않음).
 * @param {Record<string, unknown>} record
 * @returns {true}
 */
export function validateCorrelationRecord(record) {
  const violations = [];
  if (record === null || typeof record !== 'object' || Array.isArray(record)) {
    throw new CorrelationRecordValidationError([{ key: '<root>', reason: 'record must be a plain object' }]);
  }

  for (const key of Object.keys(record)) {
    if (!CORRELATION_KEYS.includes(key)) {
      violations.push({ key, reason: 'unexpected key not in CORRELATION_KEYS' });
    }
  }

  for (const key of CORRELATION_KEYS) {
    if (!Object.hasOwn(record, key)) {
      violations.push({ key, reason: 'missing key' });
      continue;
    }
    const value = record[key];
    if (value === null) {
      if (REQUIRED_NON_NULL_KEYS.has(key)) {
        violations.push({ key, reason: 'must not be null' });
      }
      continue;
    }
    const expectedType = FIELD_TYPES[key];
    if (typeof value !== expectedType) {
      violations.push({ key, reason: `expected ${expectedType}, got ${typeof value}` });
    }
  }

  if (violations.length > 0) {
    throw new CorrelationRecordValidationError(violations);
  }
  return true;
}

/**
 * correlation 레코드 검증 실패를 Sentry에 안전하게 보고한다.
 * SENTRY_DSN 미설정 시 완전 no-op(동적 import조차 하지 않음) — 정적 import는
 * 로드에 수 초 걸려 테스트 timeout 회귀를 일으킨 실측 이력이 있어(Phase 2C) 금지.
 * 실패해도 절대 throw하지 않는다(호출자가 죽지 않아야 함).
 * @param {Error} error
 * @param {{ sentryDsn?: string, importSentry?: () => Promise<any> }} [options]
 * @returns {Promise<{ reported: boolean }>}
 */
export async function reportCorrelationFailure(error, {
  sentryDsn = process.env.SENTRY_DSN,
  importSentry = () => import('@sentry/node'),
} = {}) {
  if (!sentryDsn) return { reported: false };
  try {
    const Sentry = await importSentry();
    Sentry.captureException(error);
    return { reported: true };
  } catch {
    // Sentry 전송 실패는 서버 동작에 영향을 주지 않는다(관측 부수 채널일 뿐).
    return { reported: false };
  }
}
