#!/usr/bin/env node
import { randomUUID } from 'node:crypto';
import { access, mkdir, writeFile } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import { dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { spawn as defaultSpawn } from 'node:child_process';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DEFAULT_CAPTURE_ROOT = join(REPO_ROOT, '.omo', 'captures');
const DEFAULT_DURATION_SECONDS = 30;

function nonEmptyString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value.trim();
}

function positiveInteger(value, label) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive integer`);
  }
  return parsed;
}

function sanitizePathSegment(value) {
  return value.replace(/[<>:"/\\|?*\u0000-\u001f]+/g, '-').replace(/[. ]+$/g, '').replace(/^-+|-+$/g, '') || 'capture';
}

function sessionStamp(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, '-');
}

function createDefaultSessionId(date = new Date()) {
  return `session-${sessionStamp(date)}-${randomUUID().slice(0, 8)}`;
}

function executableExtensions(env = process.env) {
  if (process.platform !== 'win32') {
    return [''];
  }
  const raw = env.PATHEXT || '.COM;.EXE;.BAT;.CMD';
  const parts = raw.split(';').map((entry) => entry.trim()).filter(Boolean);
  return [''].concat(parts.map((entry) => entry.startsWith('.') ? entry : `.${entry}`));
}

function splitPathEntries(env = process.env) {
  const raw = env.PATH || env.Path || '';
  return raw.split(process.platform === 'win32' ? ';' : ':').map((entry) => entry.trim()).filter(Boolean);
}

async function pathExists(candidate) {
  try {
    await access(candidate, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function findExecutable(command, env = process.env) {
  if (typeof command !== 'string' || command.trim() === '') {
    return null;
  }
  const trimmed = command.trim();
  const variants = executableExtensions(env).map((ext) => (ext && !trimmed.toLowerCase().endsWith(ext.toLowerCase()) ? `${trimmed}${ext}` : trimmed));
  const directCandidates = isAbsolute(trimmed) || trimmed.includes('/') || trimmed.includes('\\')
    ? variants.map((candidate) => resolve(candidate))
    : [];
  for (const candidate of directCandidates) {
    if (await pathExists(candidate)) {
      return candidate;
    }
  }
  for (const dir of splitPathEntries(env)) {
    for (const variant of variants) {
      const candidate = resolve(dir, variant);
      if (await pathExists(candidate)) {
        return candidate;
      }
    }
  }
  return null;
}

async function requireToolPath(pathValue, toolName, env = process.env) {
  if (typeof pathValue === 'string' && pathValue.trim() !== '') {
    const trimmed = pathValue.trim();
    if (isAbsolute(trimmed) || trimmed.includes('/') || trimmed.includes('\\')) {
      const resolved = resolve(trimmed);
      if (!(await pathExists(resolved))) {
        throw new Error(`${toolName} was not found at ${resolved}. Pass --${toolName} <full path> or add it to PATH.`);
      }
      return resolved;
    }
    const found = await findExecutable(trimmed, env);
    if (found) {
      return found;
    }
    throw new Error(`${toolName} was not found. Pass --${toolName} <full path> or add it to PATH.`);
  }
  const found = await findExecutable(toolName, env);
  if (!found) {
    throw new Error(`${toolName} was not found. Pass --${toolName} <full path> or add it to PATH.`);
  }
  return found;
}

function buildTsharkListArgs() {
  return ['-D'];
}

function buildVersionArgs() {
  return ['-v'];
}

function buildCaptureFilter({ port, filter }) {
  const clauses = [];
  if (typeof filter === 'string' && filter.trim() !== '') {
    clauses.push(`(${filter.trim()})`);
  }
  if (port !== undefined && port !== null) {
    clauses.push(`port ${positiveInteger(port, '--port')}`);
  }
  if (!clauses.length) {
    throw new Error('Either --port or --filter is required');
  }
  return clauses.join(' and ');
}

function parseTsharkInterfaces(output) {
  return output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
    const match = line.match(/^(\d+)\.\s+(.*)$/);
    if (!match) {
      return null;
    }
    const index = Number(match[1]);
    const raw = match[2].trim();
    const descriptionMatch = raw.match(/^(.*?)(?:\s+\((.*)\))$/);
    const name = descriptionMatch ? descriptionMatch[1].trim() : raw;
    const description = descriptionMatch ? descriptionMatch[2].trim() : null;
    const lower = `${name} ${description ?? ''} ${raw}`.toLowerCase();
    return {
      index,
      name,
      description,
      raw,
      loopback: lower.includes('loopback'),
    };
  }).filter(Boolean);
}

function selectCaptureInterface(interfaces) {
  if (!Array.isArray(interfaces) || interfaces.length === 0) {
    return null;
  }
  return interfaces.find((item) => item.loopback) ?? interfaces[0];
}

function buildCaptureArgs({ interfaceArg, outputPath, durationSeconds, filter }) {
  return ['-i', interfaceArg, '-w', outputPath, '-a', `duration:${durationSeconds}`, '-f', filter];
}

function buildManifest({
  sessionId,
  captureRoot,
  tsharkPath,
  tsharkVersion,
  dumpcapPath,
  dumpcapVersion,
  interfaceSelection,
  filter,
  startTimestamp,
  endTimestamp,
  outputPath,
  exitCode,
  command,
  notes,
}) {
  return {
    schema: 'logh7-live-capture-manifest-v1',
    sessionId,
    captureRoot,
    startTimestamp,
    endTimestamp,
    outputPath,
    exitCode,
    command,
    tools: {
      tshark: { path: tsharkPath, version: tsharkVersion },
      dumpcap: { path: dumpcapPath, version: dumpcapVersion },
    },
    interface: interfaceSelection,
    filter,
    notes,
  };
}

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function spawnCommand(command, args, { spawnImpl = defaultSpawn, cwd = REPO_ROOT, env = process.env } = {}) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawnImpl(command, args, {
      cwd,
      env,
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout?.setEncoding('utf8');
    child.stderr?.setEncoding('utf8');
    child.stdout?.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr?.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', rejectPromise);
    child.on('close', (code, signal) => {
      resolvePromise({ code, signal, stdout, stderr });
    });
  });
}

async function getToolVersion(command, spawnImpl = defaultSpawn, env = process.env) {
  const result = await spawnCommand(command, buildVersionArgs(), { spawnImpl, env });
  const text = `${result.stdout}\n${result.stderr}`.trim();
  if (result.code !== 0) {
    throw new Error(`failed to query version from ${command}: ${text || `exit ${result.code}`}`);
  }
  return text.split(/\r?\n/).map((line) => line.trim()).find(Boolean) ?? '';
}

export async function listInterfaces({ tsharkPath, spawnImpl = defaultSpawn, env = process.env } = {}) {
  const resolvedTshark = await requireToolPath(tsharkPath, 'tshark', env);
  const result = await spawnCommand(resolvedTshark, buildTsharkListArgs(), { spawnImpl, env });
  const output = `${result.stdout}\n${result.stderr}`.trim();
  if (result.code !== 0) {
    throw new Error(`tshark -D failed: ${output || `exit ${result.code}`}`);
  }
  return {
    tsharkPath: resolvedTshark,
    interfaces: parseTsharkInterfaces(result.stdout),
  };
}

async function prepareCapturePlan({
  tsharkPath,
  dumpcapPath,
  interfaceArg,
  port,
  filter,
  durationSeconds,
  sessionId,
  captureRoot = DEFAULT_CAPTURE_ROOT,
  spawnImpl = defaultSpawn,
  env = process.env,
  notes = [],
}) {
  const resolvedTshark = await requireToolPath(tsharkPath, 'tshark', env);
  const resolvedDumpcap = await requireToolPath(dumpcapPath, 'dumpcap', env);
  const tsharkVersion = await getToolVersion(resolvedTshark, spawnImpl, env);
  const dumpcapVersion = await getToolVersion(resolvedDumpcap, spawnImpl, env);
  const filterExpr = buildCaptureFilter({ port, filter });
  const currentSessionId = sanitizePathSegment(sessionId ?? createDefaultSessionId());
  const sessionDir = join(captureRoot, currentSessionId);
  const outputPath = join(sessionDir, 'capture.pcapng');
  const manifestPath = join(sessionDir, 'capture.manifest.json');
  const startTimestamp = new Date().toISOString();
  const runNotes = Array.isArray(notes) ? [...notes] : [];
  return {
    resolvedTshark,
    resolvedDumpcap,
    tsharkVersion,
    dumpcapVersion,
    filterExpr,
    sessionId: currentSessionId,
    sessionDir,
    outputPath,
    manifestPath,
    startTimestamp,
    notes: runNotes,
    interfaceArg,
  };
}

export async function captureSession(options = {}) {
  const {
    tsharkPath,
    dumpcapPath,
    interfaceArg,
    port,
    filter,
    durationSeconds = DEFAULT_DURATION_SECONDS,
    sessionId,
    captureRoot = DEFAULT_CAPTURE_ROOT,
    spawnImpl = defaultSpawn,
    env = process.env,
  } = options;

  const plan = await prepareCapturePlan({
    tsharkPath,
    dumpcapPath,
    interfaceArg,
    port,
    filter,
    durationSeconds,
    sessionId,
    captureRoot,
    spawnImpl,
    env,
  });

  const targetInterface = interfaceArg ?? (await selectDefaultInterfaceFromTshark(plan.resolvedTshark, spawnImpl, env));
  if (!targetInterface) {
    throw new Error('No capture interface available from tshark -D');
  }

  await mkdir(plan.sessionDir, { recursive: true });
  const command = plan.resolvedDumpcap;
  const args = buildCaptureArgs({
    interfaceArg: targetInterface,
    outputPath: plan.outputPath,
    durationSeconds,
    filter: plan.filterExpr,
  });
  const notes = [...plan.notes];
  if (!interfaceArg) {
    notes.push('loopback or first interface selected from tshark -D');
  }
  let exitCode = null;
  let signal = null;
  let captureError = null;
  try {
    const result = await spawnCommand(command, args, { spawnImpl, env });
    exitCode = result.code;
    signal = result.signal;
    if (result.stderr.trim()) {
      notes.push(result.stderr.trim());
    }
    if (result.code !== 0) {
      captureError = new Error(`dumpcap exited with code ${result.code}${result.signal ? ` (signal ${result.signal})` : ''}`);
    }
  } catch (error) {
    captureError = error;
  }

  const endTimestamp = new Date().toISOString();
  const manifest = buildManifest({
    sessionId: plan.sessionId,
    captureRoot,
    tsharkPath: plan.resolvedTshark,
    tsharkVersion: plan.tsharkVersion,
    dumpcapPath: plan.resolvedDumpcap,
    dumpcapVersion: plan.dumpcapVersion,
    interfaceSelection: {
      arg: targetInterface,
      explicit: Boolean(interfaceArg),
    },
    filter: plan.filterExpr,
    startTimestamp: plan.startTimestamp,
    endTimestamp,
    outputPath: plan.outputPath,
    exitCode,
    command: [command, ...args],
    notes: notes.length ? notes : ['bounded capture run'],
  });
  await writeJson(plan.manifestPath, manifest);

  if (captureError) {
    throw captureError;
  }

  return {
    sessionId: plan.sessionId,
    sessionDir: plan.sessionDir,
    outputPath: plan.outputPath,
    manifestPath: plan.manifestPath,
    exitCode,
    signal,
    tsharkPath: plan.resolvedTshark,
    dumpcapPath: plan.resolvedDumpcap,
  };
}

async function selectDefaultInterfaceFromTshark(tsharkPath, spawnImpl = defaultSpawn, env = process.env) {
  const { interfaces } = await listInterfaces({ tsharkPath, spawnImpl, env });
  const selected = selectCaptureInterface(interfaces);
  return selected ? String(selected.index) : null;
}

function parseCli(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      help: { type: 'boolean', short: 'h' },
      'list-interfaces': { type: 'boolean' },
      tshark: { type: 'string' },
      dumpcap: { type: 'string' },
      interface: { type: 'string' },
      port: { type: 'string' },
      filter: { type: 'string' },
      duration: { type: 'string' },
      session: { type: 'string' },
    },
    allowPositionals: false,
  });
  return values;
}

function printUsage() {
  process.stdout.write([
    'Usage:',
    '  logh7_capture.mjs --list-interfaces [--tshark <path>]',
    '  logh7_capture.mjs --port <n> [--filter <bpf>] [--interface <iface>] [--duration <seconds>] [--session <id>]',
    '',
    'Notes:',
    '  - capture output is written under .omo/captures/<session>/capture.pcapng',
    '  - a manifest is written next to the pcap as capture.manifest.json',
  ].join('\n') + '\n');
}

export async function main(argv = process.argv.slice(2), env = process.env) {
  const values = parseCli(argv);
  if (values.help) {
    printUsage();
    return 0;
  }

  if (values['list-interfaces']) {
    const { tsharkPath, interfaces } = await listInterfaces({
      tsharkPath: values.tshark,
      env,
    });
    process.stdout.write(`${JSON.stringify({ tsharkPath, interfaces }, null, 2)}\n`);
    return 0;
  }

  const durationSeconds = values.duration ? positiveInteger(values.duration, '--duration') : DEFAULT_DURATION_SECONDS;
  const filter = values.filter ?? null;
  const port = values.port ?? null;
  const interfaceArg = values.interface ?? null;
  if (!port && !filter) {
    throw new Error('Capture requires --port or --filter');
  }
  const result = await captureSession({
    tsharkPath: values.tshark,
    dumpcapPath: values.dumpcap,
    interfaceArg,
    port,
    filter,
    durationSeconds,
    sessionId: values.session,
    env,
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}

export {
  buildCaptureArgs,
  buildCaptureFilter,
  buildManifest,
  buildTsharkListArgs,
  createDefaultSessionId,
  findExecutable,
  getToolVersion,
  parseTsharkInterfaces,
  positiveInteger,
  requireToolPath,
  sanitizePathSegment,
  selectCaptureInterface,
};
