#!/usr/bin/env node
// M4-OBS-001: LOGH VII TCP 프레임을 변경하지 않고 양방향 상관관계만 기록하는 루프백 프록시.
// 이 모듈은 codec·권위 상태·mutation API를 소유하지 않는다.

import { createHash, randomBytes } from 'node:crypto';
import {
  closeSync,
  fstatSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readSync,
  realpathSync,
  statSync,
  unlinkSync,
  writeSync,
} from 'node:fs';
import { createServer, Socket } from 'node:net';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { createFrameStreamParser } from '../../server/src/server/logh7-frame-stream.mjs';

const DEFAULT_LISTEN_HOST = '127.0.0.1';
const DEFAULT_LISTEN_PORT = 47900;
const DEFAULT_UPSTREAM_HOST = '127.0.0.1';
const DEFAULT_UPSTREAM_PORT = 47901;

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

function loopbackFamilies(host) {
  const normalized = String(host).toLowerCase();
  if (normalized === '127.0.0.1') return new Set(['ipv4']);
  if (normalized === '::1') return new Set(['ipv6']);
  if (normalized === 'localhost') return new Set(['ipv4', 'ipv6']);
  return null;
}

function isLoopbackHost(host) {
  return loopbackFamilies(host) !== null;
}

function endpointsCanOverlap({ listenHost, listenPort, upstreamHost, upstreamPort }) {
  if (listenPort !== upstreamPort) return false;
  const listenFamilies = loopbackFamilies(listenHost);
  const upstreamFamilies = loopbackFamilies(upstreamHost);
  return [...listenFamilies].some((family) => upstreamFamilies.has(family));
}

function validatePort(name, port, { allowZero = false } = {}) {
  const minimum = allowZero ? 0 : 1;
  if (!Number.isInteger(port) || port < minimum || port > 0xffff) {
    throw new RangeError(`${name} must be an integer between ${minimum} and 65535`);
  }
}

function codeHex(code) {
  return `0x${code.toString(16).padStart(4, '0')}`;
}

function observedTransportCode(frame) {
  // conn2 로비 프레임: [len][zero subheader 4B][0x0030][encrypted body].
  // 고정 봉투 오프셋만 확인하고 암호화 body/inner code는 해석하지 않는다.
  if (
    frame.code === 0
    && frame.raw.length >= 8
    && frame.raw.readUInt32BE(2) === 0
    && frame.raw.readUInt16BE(6) === 0x0030
  ) {
    return 0x0030;
  }
  return frame.code;
}

function createDefaultRunId() {
  const stamp = new Date().toISOString().replaceAll(/[-:.]/g, '');
  return `${stamp}-${randomBytes(3).toString('hex')}`;
}

function createClock() {
  const monotonicAnchor = process.hrtime.bigint();
  const wallAnchorMs = Date.now();
  return () => {
    const elapsedNs = process.hrtime.bigint() - monotonicAnchor;
    return {
      monotonicTimestampNs: Number(elapsedNs),
      wallTimeUtc: new Date(wallAnchorMs + Number(elapsedNs / 1_000_000n)).toISOString(),
    };
  };
}

function createEvidenceHealth({ traceConfigured, loggerConfigured }) {
  const state = {
    trace: { configured: traceConfigured, healthy: traceConfigured, failures: 0 },
    logger: { configured: loggerConfigured, healthy: loggerConfigured ? true : null, failures: 0 },
    observation: { configured: true, healthy: true, failures: 0 },
    failureCodes: [],
  };
  if (!traceConfigured) state.failureCodes.push('trace-not-configured');
  if (!traceConfigured && !loggerConfigured) state.failureCodes.push('evidence-sink-missing');

  return {
    fail(channel, code) {
      const target = state[channel];
      target.healthy = false;
      target.failures += 1;
      if (!state.failureCodes.includes(code)) state.failureCodes.push(code);
    },

    snapshot() {
      return {
        evidenceHealthy: state.failureCodes.length === 0,
        trace: { ...state.trace },
        logger: { ...state.logger },
        observation: { ...state.observation },
        failureCodes: [...state.failureCodes],
      };
    },
  };
}

function createTraceSink({ tracePath, logger }) {
  const requestedTracePath = tracePath ? resolve(tracePath) : null;
  const health = createEvidenceHealth({
    traceConfigured: Boolean(requestedTracePath),
    loggerConfigured: typeof logger?.debug === 'function',
  });
  let canonicalTracePath = requestedTracePath;
  let traceDescriptor = null;
  let traceWritable = false;
  let traceEventCount = 0;
  let finalTraceReceipt = null;
  if (canonicalTracePath) {
    try {
      mkdirSync(dirname(canonicalTracePath), { recursive: true });
    } catch {
      canonicalTracePath = requestedTracePath;
      health.fail('trace', 'trace-mkdir-failed');
    }
    if (health.snapshot().trace.healthy) {
      try {
        canonicalTracePath = join(realpathSync(dirname(canonicalTracePath)), basename(canonicalTracePath));
        traceDescriptor = openSync(canonicalTracePath, 'wx+', 0o600);
        traceWritable = true;
      } catch (error) {
        if (error?.code === 'EEXIST') {
          throw new Error('trace path already exists; refusing mixed-run append');
        }
        traceDescriptor = null;
        traceWritable = false;
        health.fail('trace', 'trace-open-failed');
      }
    }
  }

  // 트레이스 디스크/logger 고장은 관찰 실패일 뿐 원본 전송 경로를 멈추지 않는다.
  return {
    emit(record) {
      if (traceDescriptor !== null && traceWritable) {
        try {
          const line = Buffer.from(`${JSON.stringify(record)}\n`);
          let offset = 0;
          while (offset < line.length) {
            const bytesWritten = writeSync(traceDescriptor, line, offset, line.length - offset);
            if (bytesWritten === 0) throw new Error('trace write made no progress');
            offset += bytesWritten;
          }
          traceEventCount += 1;
        } catch {
          traceWritable = false;
          health.fail('trace', 'trace-append-failed');
          // observe-only: 실패를 전송 소켓에 전파하지 않는다.
        }
      }
      try {
        logger?.debug?.(record);
      } catch {
        health.fail('logger', 'logger-write-failed');
        // observe-only: 외부 logger 실패도 전송과 분리한다.
      }
    },

    evidenceHealth() {
      return health.snapshot();
    },

    observationFailure(code) {
      health.fail('observation', code);
    },

    finalize({ discardEmptyTrace = false } = {}) {
      if (finalTraceReceipt) return { ...finalTraceReceipt };
      let sizeBytes = null;
      let sha256 = null;
      let device = null;
      let inode = null;
      let identityVerified = requestedTracePath ? false : null;
      let removed = requestedTracePath ? false : null;
      if (traceDescriptor !== null) {
        try {
          fsyncSync(traceDescriptor);
        } catch {
          health.fail('trace', 'trace-flush-failed');
        }
        try {
          const descriptorStat = fstatSync(traceDescriptor);
          sizeBytes = descriptorStat.size;
          device = String(descriptorStat.dev);
          inode = String(descriptorStat.ino);
          const digest = createHash('sha256');
          const chunk = Buffer.allocUnsafe(64 * 1024);
          let position = 0;
          while (position < sizeBytes) {
            const bytesRead = readSync(
              traceDescriptor,
              chunk,
              0,
              Math.min(chunk.length, sizeBytes - position),
              position,
            );
            if (bytesRead === 0) break;
            digest.update(chunk.subarray(0, bytesRead));
            position += bytesRead;
          }
          sha256 = digest.digest('hex');
          try {
            const pathStat = statSync(canonicalTracePath);
            identityVerified = String(pathStat.dev) === device && String(pathStat.ino) === inode;
          } catch {
            identityVerified = false;
          }
          if (!identityVerified) health.fail('trace', 'trace-path-identity-changed');
          if (discardEmptyTrace && traceEventCount === 0 && identityVerified) {
            try {
              unlinkSync(canonicalTracePath);
              removed = true;
            } catch {
              health.fail('trace', 'trace-cleanup-failed');
            }
          }
        } catch {
          health.fail('trace', 'trace-receipt-failed');
        }
        try {
          closeSync(traceDescriptor);
        } catch {
          health.fail('trace', 'trace-close-failed');
        }
        traceDescriptor = null;
        traceWritable = false;
      }
      finalTraceReceipt = {
        configured: Boolean(requestedTracePath),
        path: canonicalTracePath,
        eventCount: traceEventCount,
        sizeBytes,
        sha256,
        device,
        inode,
        identityVerified,
        removed,
      };
      return { ...finalTraceReceipt };
    },
  };
}

function createCorrelationRecorder({ runId, emit }) {
  const sourceSequences = new Map();
  const now = createClock();

  return ({
    source,
    stage,
    connectionId,
    direction,
    frameSeq,
    messageId,
    causationId = null,
    transportCode,
    payloadLength,
    payloadSha256,
    outcome,
  }) => {
    const sourceSequence = sourceSequences.get(source) ?? 0;
    sourceSequences.set(source, sourceSequence + 1);
    const timestamp = now();
    const record = {
      schemaVersion: 1,
      runId,
      eventId: `${source}:${String(sourceSequence).padStart(6, '0')}`,
      source,
      stage,
      connectionId,
      clientId: null,
      direction,
      frameSeq,
      messageId,
      correlationId: null,
      causationId,
      commandId: null,
      transportCode,
      innerCode: null,
      payloadLength,
      payloadSha256,
      processId: process.pid,
      threadId: null,
      monotonicTimestampNs: timestamp.monotonicTimestampNs,
      wallTimeUtc: timestamp.wallTimeUtc,
      outcome,
      redaction: 'metadata-only',
    };
    emit(record);
    return record;
  };
}

function createDirectionObserver({ connectionId, direction, receiveSource, sendSource, record, observationFailure }) {
  const parser = createFrameStreamParser();
  let observationEnabled = true;
  let nextFrameSeq = 0;
  let failureSequence = 0;
  let finalized = false;

  const failObservation = (code) => {
    if (!observationEnabled) return;
    observationEnabled = false;
    observationFailure(code);
    const messageId = `${connectionId}:${direction}:observation-${failureSequence}`;
    failureSequence += 1;
    record({
      source: receiveSource,
      stage: 'proxy-recv',
      connectionId,
      direction,
      frameSeq: null,
      messageId,
      transportCode: null,
      payloadLength: null,
      payloadSha256: null,
      outcome: 'failed',
    });
  };

  return {
    consume(chunk) {
      if (!observationEnabled) return [];

      let frames;
      try {
        frames = parser.push(chunk);
      } catch {
        failObservation('frame-observation-failed');
        finalized = true;
        return [];
      }

      return frames.map((frame) => {
        const frameSeq = nextFrameSeq;
        nextFrameSeq += 1;
        const messageId = `${connectionId}:${direction}:${frameSeq}`;
        const payloadSha256 = createHash('sha256').update(frame.raw).digest('hex');
        const metadata = {
          connectionId,
          direction,
          frameSeq,
          messageId,
          transportCode: codeHex(observedTransportCode(frame)),
          payloadLength: frame.raw.length,
          payloadSha256,
        };
        const received = record({
          source: receiveSource,
          stage: 'proxy-recv',
          ...metadata,
          outcome: 'observed',
        });
        return { metadata, receivedEventId: received.eventId };
      });
    },

    forwarded(observations) {
      for (const observation of observations) {
        record({
          source: sendSource,
          stage: 'proxy-send',
          ...observation.metadata,
          causationId: observation.receivedEventId,
          outcome: 'forwarded',
        });
      }
    },

    finalize(reason = 'close') {
      if (finalized) return;
      finalized = true;
      if (!observationEnabled || parser.bufferedBytes === 0) return;
      const code = reason === 'fin'
        ? 'truncated-frame-at-fin'
        : reason === 'error'
          ? 'truncated-frame-at-error'
          : 'truncated-frame-at-close';
      failObservation(code);
    },
  };
}

function wireDirection({ source, destination, observer }) {
  let ended = false;
  destination.on('drain', () => {
    if (!source.destroyed) source.resume();
  });

  source.on('data', (chunk) => {
    const observations = observer.consume(chunk);
    if (destination.destroyed) {
      source.destroy();
      return;
    }

    try {
      const writable = destination.write(chunk, (error) => {
        if (!error) observer.forwarded(observations);
      });
      if (!writable) source.pause();
    } catch {
      source.destroy();
      destination.destroy();
    }
  });

  // allowHalfOpen으로 반대 방향 응답을 받은 뒤 각 FIN만 독립적으로 전파한다.
  source.on('end', () => {
    ended = true;
    observer.finalize('fin');
    if (!destination.destroyed && !destination.writableEnded) destination.end();
  });
  source.on('error', () => observer.finalize('error'));
  source.on('close', () => observer.finalize(ended ? 'fin' : 'close'));
}

export function createPacketLabProxy({
  listenHost = DEFAULT_LISTEN_HOST,
  listenPort = DEFAULT_LISTEN_PORT,
  upstreamHost = DEFAULT_UPSTREAM_HOST,
  upstreamPort = DEFAULT_UPSTREAM_PORT,
  runId = createDefaultRunId(),
  tracePath = null,
  logger = null,
} = {}) {
  if (!isLoopbackHost(listenHost) || !isLoopbackHost(upstreamHost)) {
    throw new Error('packet lab proxy accepts loopback listen/upstream hosts only');
  }
  validatePort('listenPort', listenPort, { allowZero: true });
  validatePort('upstreamPort', upstreamPort);
  if (endpointsCanOverlap({ listenHost, listenPort, upstreamHost, upstreamPort })) {
    throw new Error('packet lab proxy refuses a same-family loopback listen/upstream endpoint');
  }
  if (typeof runId !== 'string' || runId.length === 0) throw new TypeError('runId must be a non-empty string');

  const traceSink = createTraceSink({ tracePath, logger });
  const record = createCorrelationRecorder({ runId, emit: traceSink.emit });
  const ownedPairs = new Set();
  let nextConnectionId = 0;
  let listenPromise = null;
  let closePromise = null;
  let closed = false;

  const server = createServer({ allowHalfOpen: true }, (client) => {
    if (closed) {
      client.destroy();
      return;
    }
    const connectionId = `conn-${String(nextConnectionId).padStart(6, '0')}`;
    nextConnectionId += 1;
    const upstream = new Socket({ allowHalfOpen: true });
    const pair = { client, upstream };
    ownedPairs.add(pair);

    client.setNoDelay(true);
    upstream.setNoDelay(true);

    const c2sObserver = createDirectionObserver({
      connectionId,
      direction: 'c2s',
      receiveSource: 'proxy-client',
      sendSource: 'proxy-server',
      record,
      observationFailure: traceSink.observationFailure,
    });
    const s2cObserver = createDirectionObserver({
      connectionId,
      direction: 's2c',
      receiveSource: 'proxy-server',
      sendSource: 'proxy-client',
      record,
      observationFailure: traceSink.observationFailure,
    });

    wireDirection({ source: client, destination: upstream, observer: c2sObserver });
    wireDirection({ source: upstream, destination: client, observer: s2cObserver });

    client.on('error', () => {
      upstream.destroy();
    });
    upstream.on('error', () => {
      client.destroy();
    });

    const releasePair = (closedSocket, peer, hadError) => {
      const incompleteClose = !closedSocket.readableEnded || !closedSocket.writableEnded;
      if ((hadError || incompleteClose) && !peer.destroyed) peer.destroy();
      if (client.destroyed && upstream.destroyed) ownedPairs.delete(pair);
    };
    client.on('close', (hadError) => releasePair(client, upstream, hadError));
    upstream.on('close', (hadError) => releasePair(upstream, client, hadError));

    upstream.connect({ host: upstreamHost, port: upstreamPort });
  });

  // accept/listen 오류는 API promise가 담당하고, 리슨 후 예외적 server error는
  // 프로세스 unhandled error로 확대하지 않는다.
  server.on('error', () => {});

  const api = {
    listen() {
      if (closed) return Promise.reject(new Error('packet lab proxy is closed'));
      if (server.listening) return Promise.resolve(api);
      if (listenPromise) return listenPromise;

      listenPromise = new Promise((resolveListen, rejectListen) => {
        const onError = (error) => {
          server.off('listening', onListening);
          listenPromise = null;
          rejectListen(error);
        };
        const onListening = () => {
          server.off('error', onError);
          resolveListen(api);
        };
        server.once('error', onError);
        server.once('listening', onListening);
        server.listen({ host: listenHost, port: listenPort });
      });
      return listenPromise;
    },

    close({ discardEmptyTrace = false } = {}) {
      if (closePromise) return closePromise;
      closed = true;
      closePromise = (async () => {
        if (listenPromise) await listenPromise.catch(() => {});
        for (const { client, upstream } of ownedPairs) {
          client.destroy();
          upstream.destroy();
        }
        ownedPairs.clear();
        if (server.listening) {
          await new Promise((resolveClose, rejectClose) => {
            server.close((error) => {
              if (error) rejectClose(error);
              else resolveClose();
            });
          });
        }
        const traceReceipt = traceSink.finalize({ discardEmptyTrace });
        return {
          runId,
          mode: 'observe-only',
          closed: true,
          evidenceHealth: traceSink.evidenceHealth(),
          traceReceipt,
        };
      })();
      return closePromise;
    },

    address() {
      return server.address();
    },

    evidenceHealth() {
      return traceSink.evidenceHealth();
    },
  };

  return api;
}

function parseCli(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      'listen-host': { type: 'string', default: DEFAULT_LISTEN_HOST },
      'listen-port': { type: 'string', default: String(DEFAULT_LISTEN_PORT) },
      'upstream-host': { type: 'string', default: DEFAULT_UPSTREAM_HOST },
      'upstream-port': { type: 'string', default: String(DEFAULT_UPSTREAM_PORT) },
      'run-id': { type: 'string' },
      trace: { type: 'string' },
    },
    allowPositionals: false,
  });
  return {
    listenHost: values['listen-host'],
    listenPort: Number(values['listen-port']),
    upstreamHost: values['upstream-host'],
    upstreamPort: Number(values['upstream-port']),
    runId: values['run-id'] ?? createDefaultRunId(),
    tracePath: values.trace ? resolve(values.trace) : null,
  };
}

async function main() {
  const options = parseCli(process.argv.slice(2));
  const logger = {
    debug(record) {
      process.stdout.write(`${JSON.stringify(record)}\n`);
    },
  };
  const proxy = createPacketLabProxy({ ...options, logger });
  let shuttingDown = false;
  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    try {
      const receipt = await proxy.close();
      process.stdout.write(`${JSON.stringify({ event: 'packet-lab-shutdown', signal, ...receipt })}\n`);
      if (!receipt.evidenceHealth.evidenceHealthy) process.exitCode = 1;
    } catch (error) {
      process.stderr.write(`${error.message}\n`);
      process.exitCode = 1;
    }
  };
  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.once('SIGTERM', () => void shutdown('SIGTERM'));

  try {
    await proxy.listen();
  } catch (error) {
    try {
      const receipt = await proxy.close({ discardEmptyTrace: true });
      process.stderr.write(`${JSON.stringify({
        event: 'packet-lab-start-failed',
        code: error?.code ?? null,
        receipt,
      })}\n`);
    } catch (cleanupError) {
      process.stderr.write(`${JSON.stringify({
        event: 'packet-lab-start-cleanup-failed',
        code: cleanupError?.code ?? null,
      })}\n`);
    }
    process.exitCode = 1;
    return;
  }
  process.stdout.write(`${JSON.stringify({
    event: 'packet-lab-listening',
    runId: options.runId,
    listen: proxy.address(),
    upstream: { host: options.upstreamHost, port: options.upstreamPort },
    tracePath: options.tracePath,
    mode: 'observe-only',
    evidenceHealth: proxy.evidenceHealth(),
  })}\n`);
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
