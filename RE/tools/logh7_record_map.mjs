#!/usr/bin/env node
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

const KNOWN_RECORDS = {
  '0x0201': {
    surface: 'session-login',
    serverData: ['login status'],
    renderState: 'session-gate',
    interactionState: 'working',
    notes: ['SSLoginOK is required before world login continues.'],
  },
  '0x0204': {
    surface: 'world-admission',
    serverData: ['selected character id'],
    renderState: 'world-anchor',
    interactionState: 'working',
    notes: ['Client stores selected character id before 0x0f02 player anchor records.'],
  },
  '0x0206': {
    surface: 'world-admission',
    serverData: ['game login status'],
    renderState: 'world-gate',
    interactionState: 'working',
  },
  '0x0305': {
    surface: 'static-card-or-session',
    serverData: ['session/card rows, gated by request context'],
    renderState: 'dangerous-during-world-init',
    interactionState: 'working-when-gated',
    notes: ['World-init 0x0304 must keep the legacy empty session-shaped walker unless duty cards are explicitly requested.'],
  },
  '0x0307': {
    surface: 'static-card-command',
    serverData: ['card command catalog'],
    renderState: 'implemented',
    interactionState: 'needs-panel-qa',
  },
  '0x0313': {
    surface: 'strategic-map',
    serverData: ['grid object/class table', 'fleet/system marker class and sprite ids'],
    renderState: 'partial',
    interactionState: 'blocked',
    notes: ['Marker slots can be populated, but label/star-type/planet companion mapping is not complete.'],
  },
  '0x0315': {
    surface: 'strategic-map',
    serverData: ['100x50 strategic grid cells'],
    renderState: 'partial',
    interactionState: 'blocked',
    notes: ['Client accepts grid cells, but click-to-0x0b01 remains blocked in latest QA.'],
  },
  '0x031d': {
    surface: 'star-system-base',
    serverData: ['system/base ids', 'names', 'owner/faction', 'coordinate and base fields'],
    renderState: 'working',
    interactionState: 'read-only',
  },
  '0x031f': {
    surface: 'base-dynamic',
    serverData: ['base economy/current state'],
    renderState: 'implemented',
    interactionState: 'needs-panel-qa',
  },
  '0x0321': {
    surface: 'office-facility',
    serverData: ['institution ids', 'office/room spots', 'occupants', 'facility state'],
    renderState: 'implemented',
    interactionState: 'blocked',
    notes: ['Office-room actions need real room position and occupant context, not only a seed facility row.'],
  },
  '0x0323': {
    surface: 'character-info',
    serverData: ['character id', 'grid unit id', 'name', 'portrait', 'rank', 'abilities', 'spot after safe timing', 'seat entries'],
    renderState: 'working-but-timing-sensitive',
    interactionState: 'working-for-info',
    notes: ['Early 0x0f02 spawn must stay minimal by default; current spot/owner are post-load/direct-record data.'],
  },
  '0x0325': {
    surface: 'unit-table',
    serverData: ['unit id/count', 'optional faction/commander/cell/owner/map section'],
    renderState: 'working-but-timing-sensitive',
    interactionState: 'world-anchor',
    notes: ['Full location slots are opt-in; default live path keeps the unit row minimal.'],
  },
  '0x0327': {
    surface: 'warehouse',
    serverData: ['stockpile rows per base'],
    renderState: 'implemented',
    interactionState: 'needs-panel-qa',
  },
  '0x0329': {
    surface: 'package-transfer',
    serverData: ['package/transfer manifest per base'],
    renderState: 'implemented',
    interactionState: 'needs-panel-qa',
  },
  '0x032b': {
    surface: 'outfit-summary',
    serverData: ['outfit ids', 'power/index metadata'],
    renderState: 'implemented',
    interactionState: 'needs-panel-qa',
  },
  '0x032f': {
    surface: 'outfit-party',
    serverData: ['outfit id', 'member characters', 'roles/ranks'],
    renderState: 'implemented',
    interactionState: 'needs-panel-qa',
  },
  '0x033b': {
    surface: 'tactics-unit-table',
    serverData: ['unit ids', 'map section', 'controllability'],
    renderState: 'implemented',
    interactionState: 'needs-tactical-qa',
  },
  '0x034f': {
    surface: 'character-card-roster',
    serverData: ['character id', 'display name', 'portrait', 'faction/rank/status'],
    renderState: 'working',
    interactionState: 'working-for-roster',
  },
  '0x0356': {
    surface: 'current-character-notify',
    serverData: ['native LE character id', 'grid unit id', 'seat count/entries'],
    renderState: 'implemented',
    interactionState: 'working-for-info-loop',
    notes: ['Not interchangeable with 0x0323; this is the native notify body.'],
  },
  '0x0707': {
    surface: 'appointment-command',
    serverData: ['target outfit', 'card character', 'seat role', 'chief spot'],
    renderState: 'client-command',
    interactionState: 'needs-office-qa',
  },
  '0x0b01': {
    surface: 'strategic-movement',
    serverData: ['selected unit context', 'source/destination grid cells'],
    renderState: 'client-command',
    interactionState: 'blocked',
    notes: ['Latest QA still observes no 0x0b01 after marker experiments.'],
  },
  '0x0b07': {
    surface: 'strategic-movement-result',
    serverData: ['movement acceptance/result', 'unit position update'],
    renderState: 'not-reached',
    interactionState: 'blocked',
    notes: ['Server cannot validate 0x0b07 until the client emits 0x0b01.'],
  },
  '0x0b09': {
    surface: 'grid-enter',
    serverData: ['enter-grid begin value'],
    renderState: 'implemented',
    interactionState: 'experimental',
  },
  '0x0b0a': {
    surface: 'grid-enter',
    serverData: ['enter-grid end value'],
    renderState: 'implemented',
    interactionState: 'experimental',
  },
  '0x0f02': {
    name: 'RequestGridInitialize',
    dir: 'C2S',
    family: 'social-world-runtime',
    surface: 'world-init-request',
    serverData: ['triggers 0x0204/0x0325/0x0323/0x0f03 push bundle'],
    renderState: 'client-command',
    interactionState: 'working-but-fragile',
  },
  '0x0f06': {
    name: 'RequestInformationMessengerStatus',
    dir: 'C2S',
    family: 'social-world-runtime',
    surface: 'post-load-tick',
    serverData: ['0x0f07 ack', 'optional grid-enter refresh bundle'],
    renderState: 'client-command',
    interactionState: 'must-be-reached-for-HUD-refresh',
  },
  '0x0f08': {
    surface: 'in-world-card-click',
    serverData: ['selected card id'],
    renderState: 'client-command',
    interactionState: 'working-for-info-loop',
  },
  '0x1001': {
    surface: 'account-info',
    serverData: ['account id', 'owned character count', 'slot cap'],
    renderState: 'working',
    interactionState: 'working',
  },
  '0x1003': {
    surface: 'uncharged-roster',
    serverData: ['non-empty chargeable candidate roster'],
    renderState: 'working',
    interactionState: 'working',
  },
  '0x1005': {
    surface: 'character-entry-state',
    serverData: ['available slot count/state'],
    renderState: 'working',
    interactionState: 'working',
  },
  '0x1008': {
    surface: 'character-creation',
    serverData: ['accepted draft id/status', 'parsed phase payload'],
    renderState: 'client-command',
    interactionState: 'working',
  },
  '0x2004': {
    surface: 'lobby-character-cards',
    serverData: ['character ids/statuses', 'portrait ids', 'display names'],
    renderState: 'working',
    interactionState: 'working',
    notes: ['Korean glyph QA requires the Korean-patched EXE/CP949 resources, not the protocol-probe EXE.'],
  },
  '0x2006': {
    surface: 'lobby-session-list',
    serverData: ['session id', 'session name', 'selectable status'],
    renderState: 'working',
    interactionState: 'working',
  },
  '0x200a': {
    surface: 'world-redirect',
    serverData: ['world endpoint ip/port/token'],
    renderState: 'working',
    interactionState: 'working',
  },
};

const normalizeCode = (code) => {
  if (typeof code === 'number') return `0x${code.toString(16).padStart(4, '0')}`;
  const match = String(code).match(/0x[0-9a-fA-F]{4}/);
  return match ? match[0].toLowerCase() : String(code).toLowerCase();
};

const readJson = async (file) => JSON.parse(await readFile(file, 'utf8'));

const collectTraceFiles = async (explicitTraces, scanUiExplorer) => {
  const files = [...explicitTraces];
  if (!scanUiExplorer) return files;
  const root = path.join(REPO_ROOT, '.omo', 'ui-explorer');
  if (!existsSync(root)) return files;
  const sessions = await readdir(root, { withFileTypes: true });
  for (const session of sessions) {
    if (!session.isDirectory() || !session.name.includes('g247')) continue;
    const trace = path.join(root, session.name, 'trace.jsonl');
    if (existsSync(trace)) files.push(trace);
  }
  return [...new Set(files.map((file) => path.resolve(file)))];
};

const scanTraceCounts = async (traceFiles) => {
  const counts = new Map();
  const traces = [];
  for (const file of traceFiles) {
    const resolved = path.resolve(file);
    const text = await readFile(resolved, 'utf8');
    const fileStat = await stat(resolved);
    let events = 0;
    for (const line of text.split(/\r?\n/)) {
      if (!line.trim()) continue;
      events += 1;
      let record;
      try {
        record = JSON.parse(line);
      } catch {
        continue;
      }
      const inbound = record.innerCodeHex ? normalizeCode(record.innerCodeHex) : null;
      const outbound = record.respInnerCodeHex ? normalizeCode(record.respInnerCodeHex) : null;
      if (inbound) {
        const entry = counts.get(inbound) ?? { inbound: 0, outbound: 0 };
        entry.inbound += 1;
        counts.set(inbound, entry);
      }
      if (outbound) {
        const entry = counts.get(outbound) ?? { inbound: 0, outbound: 0 };
        entry.outbound += 1;
        counts.set(outbound, entry);
      }
    }
    traces.push({ path: path.relative(REPO_ROOT, resolved).replaceAll('\\', '/'), bytes: fileStat.size, events });
  }
  return { counts, traces };
};

const scanImplementationTouches = async (codes) => {
  const roots = ['src/server', 'tests/server', 'docs'];
  const touches = new Map(codes.map((code) => [code, []]));
  const scanFile = async (file) => {
    const text = await readFile(file, 'utf8');
    for (const code of codes) {
      const bare = code.slice(2);
      if (text.includes(code) || text.includes(`0x${bare}`) || text.includes(`0X${bare.toUpperCase()}`)) {
        touches.get(code)?.push(path.relative(REPO_ROOT, file).replaceAll('\\', '/'));
      }
    }
  };
  const walk = async (dir) => {
    const entries = await readdir(path.join(REPO_ROOT, dir), { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(REPO_ROOT, dir, entry.name);
      if (entry.isDirectory()) {
        await walk(path.relative(REPO_ROOT, full));
      } else if (/\.(mjs|js|md)$/.test(entry.name)) {
        await scanFile(full);
      }
    }
  };
  for (const root of roots) {
    if (existsSync(path.join(REPO_ROOT, root))) await walk(root);
  }
  return touches;
};

const classify = ({ message, known, traceCount, touches }) => {
  if (known?.interactionState === 'blocked') return 'blocked-live-gap';
  if ((traceCount?.outbound ?? 0) > 0 && message.dir !== 'C2S') return 'observed-server-downlink';
  if ((traceCount?.inbound ?? 0) > 0 && message.dir !== 'S2C') return 'observed-client-request';
  if (known?.renderState === 'working') return 'implemented-rendered';
  if (known) return 'mapped-needs-qa';
  if (touches.length > 0) return 'implemented-or-documented';
  if (message.status === 'done') return 'reverse-mapped-not-implemented';
  return 'unmapped-gap';
};

const inferSyntheticMessage = (code, known, traceCount) => ({
  code,
  name: known?.name ?? `TraceOnly_${code}`,
  dir: known?.dir ?? ((traceCount?.inbound ?? 0) > 0 && (traceCount?.outbound ?? 0) === 0 ? 'C2S' : 'unknown'),
  family: known?.family ?? 'runtime-companion',
  size: null,
  parser: null,
  status: 'trace-only',
  doc: null,
  catalogSource: 'runtime-companion',
});

export const buildRecordMapInventory = async ({
  catalogPath = path.join(REPO_ROOT, 'content', 'client', 'message-catalog.json'),
  traceFiles = [],
  scanUiExplorer = true,
} = {}) => {
  const catalog = await readJson(catalogPath);
  const catalogMessages = catalog.messages.map((message) => ({
    ...message,
    code: normalizeCode(message.code),
    catalogSource: 'message-catalog',
  }));
  const allTraceFiles = await collectTraceFiles(traceFiles, scanUiExplorer);
  const { counts, traces } = await scanTraceCounts(allTraceFiles);
  const codeSet = new Set([
    ...catalogMessages.map((message) => message.code),
    ...Object.keys(KNOWN_RECORDS),
    ...counts.keys(),
  ]);
  const codes = [...codeSet].sort((a, b) => Number.parseInt(a.slice(2), 16) - Number.parseInt(b.slice(2), 16));
  const touches = await scanImplementationTouches(codes);
  const catalogByCode = new Map(catalogMessages.map((message) => [message.code, message]));
  const records = codes.map((code) => {
    const known = KNOWN_RECORDS[code] ?? null;
    const traceCount = counts.get(code) ?? { inbound: 0, outbound: 0 };
    const message = catalogByCode.get(code) ?? inferSyntheticMessage(code, known, traceCount);
    const implementationFiles = touches.get(code) ?? [];
    return {
      code: message.code,
      name: message.name,
      dir: message.dir,
      family: message.family,
      size: message.size,
      clientStatus: message.status,
      catalogSource: message.catalogSource,
      doc: message.doc,
      classification: classify({ message, known, traceCount, touches: implementationFiles }),
      surface: known?.surface ?? null,
      renderState: known?.renderState ?? null,
      interactionState: known?.interactionState ?? null,
      serverData: known?.serverData ?? [],
      liveTrace: traceCount,
      implementationFiles: implementationFiles.slice(0, 12),
      notes: known?.notes ?? [],
    };
  });
  const classificationCounts = records.reduce((acc, record) => {
    acc[record.classification] = (acc[record.classification] ?? 0) + 1;
    return acc;
  }, {});
  return {
    generatedAt: new Date().toISOString(),
    source: catalog._source,
    framing: catalog._framing,
    catalogTotal: catalogMessages.length,
    total: records.length,
    traces,
    classificationCounts,
    blocked: records.filter((record) => record.classification === 'blocked-live-gap').map((record) => record.code),
    records,
  };
};

const parseArgs = (argv) => {
  const args = { traceFiles: [], scanUiExplorer: true, out: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--out') {
      args.out = argv[++i];
    } else if (arg === '--trace') {
      args.traceFiles.push(argv[++i]);
    } else if (arg === '--no-ui-scan') {
      args.scanUiExplorer = false;
    } else if (arg === '--help') {
      args.help = true;
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  return args;
};

const printHelp = () => {
  console.log(`Usage: node tools/logh7_record_map.mjs [--out PATH] [--trace trace.jsonl] [--no-ui-scan]

Build a complete LOGH VII message/record inventory from content/client/message-catalog.json,
current server/docs implementation references, and live UI explorer trace files.`);
};

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) {
      printHelp();
      process.exit(0);
    }
    const inventory = await buildRecordMapInventory(args);
    const json = `${JSON.stringify(inventory, null, 2)}\n`;
    if (args.out) {
      const out = path.resolve(args.out);
      await mkdir(path.dirname(out), { recursive: true });
      await writeFile(out, json, 'utf8');
      console.log(`wrote ${path.relative(REPO_ROOT, out).replaceAll('\\', '/')} (${inventory.total} records)`);
    } else {
      process.stdout.write(json);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
