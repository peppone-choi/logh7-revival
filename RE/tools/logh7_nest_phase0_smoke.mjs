// LOGH VII — Nest 마이그레이션 Phase 0 게이트 스모크 (tsx로 실행: `node --import tsx tools/logh7_nest_phase0_smoke.mjs`).
//
// 증명하는 것:
//  1) 생명주기: NestFactory.createApplicationContext → WireServerService.onApplicationBootstrap가
//     와이어 서버를 올리고, app.close()(=OnApplicationShutdown)가 그레이스풀하게 닫는다(핸들 null + 포트 닫힘).
//     OS 시그널에 의존하지 않으므로 Windows/POSIX 모두 결정론.
//  2) 동일 와이어 동작: 같은 로그인 프레임(0x0034)에 대해 Nest 경로(in-process)와 CLI serve-auth(subprocess)가
//     바이트 동일한 응답을 낸다. 둘 다 bootServeAuthServer 동일 코드 경로라 구조적으로 보장되지만 라이브로 확인.
//
// LOGH_PERSIST=0으로 스냅샷 SQLite 오염을 막고 결정론을 확보한다.

import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { NestFactory } from '@nestjs/core';

import { AppModule } from '../src/app/app.module.js';
import { WireServerService } from '../src/app/wire-server.service.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// g004에서 관측된 실제 클라 로그인 요청 프레임(0x0034). server.test.mjs와 동일.
const LOGIN_FRAME = Buffer.from('001a0034a5eeed8ed2006d608f5f51cab90168cb467cd2eb355d8510', 'hex');

function fail(message) {
  console.error(`[phase0-smoke] FAIL: ${message}`);
  process.exit(1);
}

// host:port에 붙어 로그인 프레임을 보내고 응답 바이트를 모은다.
function probeLogin(host, port) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port });
    const chunks = [];
    const timer = setTimeout(() => socket.end(), 1500);
    socket.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    socket.once('connect', () => socket.write(LOGIN_FRAME));
    socket.on('data', (chunk) => chunks.push(chunk));
    socket.once('close', () => {
      clearTimeout(timer);
      resolve(Buffer.concat(chunks));
    });
  });
}

function isPortClosed(host, port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    const timer = setTimeout(() => {
      socket.destroy();
      resolve(false); // 연결이 매달리면 아직 닫히지 않은 것으로 간주
    }, 1000);
    socket.once('connect', () => {
      clearTimeout(timer);
      socket.destroy();
      resolve(false); // 여전히 연결 수락 = 안 닫힘
    });
    socket.once('error', () => {
      clearTimeout(timer);
      resolve(true); // ECONNREFUSED = 닫힘
    });
  });
}

// (1) Nest 생명주기 + 라이브 와이어 (in-process).
async function checkNestLifecycle() {
  const savedArgv = process.argv;
  // serve-auth와 동일한 CLI 플래그 통로. 포트 0 = OS가 빈 포트 배정.
  process.argv = [savedArgv[0], savedArgv[1], '--port', '0'];
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  process.argv = savedArgv;
  const service = app.get(WireServerService);
  const handle = service.getHandle();
  if (handle === null) {
    await app.close();
    fail('WireServerService.getHandle() is null after bootstrap');
  }
  const { host, port } = handle;
  const response = await probeLogin(host, port);
  if (response.length === 0) {
    await app.close();
    fail('Nest wire path returned empty response to login frame (not live)');
  }
  await app.close(); // OnApplicationShutdown → handle.close()
  if (service.getHandle() !== null) {
    fail('WireServerService.getHandle() is not null after app.close()');
  }
  const closed = await isPortClosed(host, port);
  if (!closed) {
    fail(`wire port ${host}:${port} still accepts connections after app.close() (graceful shutdown broken)`);
  }
  console.log(`[phase0-smoke] OK lifecycle: Nest boot→probe(${response.length}B)→close, port ${port} released`);
  return { host, port, response };
}

// (2) CLI serve-auth subprocess (동일 와이어 동작 비교 기준).
function bootServeAuthSubprocess() {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [path.join(REPO_ROOT, 'src', 'server', 'logh7-server.mjs'), 'serve-auth', '--port', '0'],
      { cwd: REPO_ROOT, env: { ...process.env, LOGH_PERSIST: '0' }, stdio: ['ignore', 'pipe', 'pipe'] },
    );
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`serve-auth subprocess did not log listening line in time. stderr=${stderr}`));
    }, 30000);
    child.stdout.on('data', async (data) => {
      stdout += data.toString();
      const match = stdout.match(/listening on ([\d.]+):(\d+)/);
      if (!match) {
        return;
      }
      clearTimeout(timer);
      const host = match[1];
      const port = Number(match[2]);
      try {
        const response = await probeLogin(host, port);
        child.kill();
        resolve({ host, port, response });
      } catch (error) {
        child.kill();
        reject(error);
      }
    });
    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    child.once('error', reject);
  });
}

async function main() {
  const nest = await checkNestLifecycle();
  const auth = await bootServeAuthSubprocess();
  if (auth.response.length === 0) {
    fail('serve-auth returned empty response to login frame');
  }
  if (!nest.response.equals(auth.response)) {
    console.error(`[phase0-smoke] nest=${nest.response.toString('hex')}`);
    console.error(`[phase0-smoke] auth=${auth.response.toString('hex')}`);
    fail('Nest wire response differs from serve-auth (NOT byte-identical)');
  }
  console.log(
    `[phase0-smoke] OK equivalence: Nest path == serve-auth path, login response ${nest.response.length}B byte-identical`,
  );
  console.log('[phase0-smoke] PASS');
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
