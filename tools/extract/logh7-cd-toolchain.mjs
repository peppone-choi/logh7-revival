// LOGH VII 추출 툴체인 핀 관리 (unshield 등 외부 도구를 SHA256 + 버전으로 고정 실행)
//
// 원칙: pinned 도구는 파일 SHA256과 --version 출력이 모두 기대치와 일치해야만 실행한다.
// 어느 하나라도 어긋나면 실행 전에 거부(fail-closed) — 잘못된 도구 사본이 정본 추출을 오염시키지 않게.

import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

// 도구 실행 커맨드 구성. launcher가 있으면 launcher가 도구 스크립트를 인자로 받는다.
function resolveCommand(tool, args) {
  if (tool.launcher) return { command: tool.launcher, argv: [tool.path, ...args] };
  return { command: tool.path, argv: args };
}

// pinned 도구를 검증: 파일 존재 → SHA256 일치 → --version 일치. receipt 반환.
export async function validatePinnedTool(tool) {
  let bytes;
  try {
    bytes = await readFile(tool.path);
  } catch (error) {
    throw new Error(`pinned tool missing (ENOENT): ${tool.path} — ${error.message}`);
  }

  const actualSha = sha256(bytes);
  if (tool.sha256 && actualSha !== tool.sha256) {
    throw new Error(`pinned tool sha-256 mismatch: expected ${tool.sha256}, got ${actualSha} (hash)`);
  }

  const versionArgs = tool.versionArgs ?? ['--version'];
  const { command, argv } = resolveCommand(tool, versionArgs);
  let stdout = '';
  try {
    ({ stdout } = await execFileAsync(command, argv));
  } catch (error) {
    throw new Error(`pinned tool version probe failed: ${error.message} (version)`);
  }
  const version = stdout.trim();
  if (tool.expectedVersion && version !== tool.expectedVersion) {
    throw new Error(`pinned tool version mismatch: expected ${tool.expectedVersion}, got ${version} (version)`);
  }

  return { status: 'verified', sha256: actualSha, version };
}

// pinned 도구를 검증 후 인자와 함께 실행. { exitCode, stdout, stderr } 반환(비정상 종료도 코드로 보고).
export async function runPinnedTool(tool, args) {
  await validatePinnedTool(tool);
  const { command, argv } = resolveCommand(tool, args);
  try {
    const { stdout, stderr } = await execFileAsync(command, argv);
    return { exitCode: 0, stdout, stderr };
  } catch (error) {
    if (typeof error.code === 'number') {
      return { exitCode: error.code, stdout: error.stdout ?? '', stderr: error.stderr ?? '' };
    }
    throw error;
  }
}
