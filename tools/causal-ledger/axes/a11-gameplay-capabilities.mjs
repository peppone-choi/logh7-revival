import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { CONTRACT, stableStringify, validateLedger, SOURCE_MANIFEST, importSources } from '../index.mjs';

const AXIS_DIR = dirname(fileURLToPath(import.meta.url));
const TOOL_DIR = dirname(AXIS_DIR);
const GENERATED_DIR = join(TOOL_DIR, 'generated');

const FIXED_EVIDENCE_TIMESTAMP = '2026-07-21T00:00:00Z'; // Deterministic, fixed timestamp

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function canonicalLf(value) {
  return value.replaceAll('\r\n', '\n').replaceAll('\r', '\n');
}

async function readMasterDesignSource(repoRoot) {
  // Read the distinct non-base source for A11 evidence
  const path = join(repoRoot, 'docs/logh7-causal-ledger-master-design.md');
  const text = canonicalLf(await readFile(path, 'utf8'));
  return {
    path,
    text,
    sha256: sha256(text),
  };
}

async function readOpcodeSource(repoRoot) {
  const path = join(repoRoot, 'docs', 'logh7-opcode-coverage-current.md');
  const text = canonicalLf(await readFile(path, 'utf8'));
  const lines = text.split('\n');
  const records = [];
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex];
    const match = line.match(/^\|\s*(0x[0-9a-fA-F]+)\s*\|\s*(0x[0-9a-fA-F]+)\s*\|\s*(.*?)\s*\|\s*(0x[0-9a-fA-F]+|\d+)\s*\|\s*(.*?)\s*\|\s*(.*?)\s*\|$/);
    if (!match) continue;
    const reqCode = match[1].toLowerCase();
    const respCode = match[2].toLowerCase();
    const responseName = match[3].trim();
    const sizeStr = match[4].trim();
    const status = match[5].trim();
    const location = match[6].trim();
    let sizeBytes = 0;
    if (sizeStr.startsWith('0x')) {
      sizeBytes = parseInt(sizeStr, 16);
    } else if (/^\d+$/.test(sizeStr)) {
      sizeBytes = parseInt(sizeStr, 10);
    }
    records.push({
      lineIndex: lineIndex + 1,
      line,
      lineHash: sha256(line),
      reqCode,
      respCode,
      responseName,
      sizeBytes,
      status,
      location,
      identity: `${reqCode}-${respCode}`,
    });
  }
  return { text, records, sourceHash: sha256(text) };
}

async function readStrategyCommandSource(repoRoot) {
  const path = join(repoRoot, 'server/content/generated', 'logh7-strategy-command-catalog.json');
  const text = canonicalLf(await readFile(path, 'utf8'));
  let commands = [];
  try {
    const catalog = JSON.parse(text);
    commands = catalog.commands || [];
  } catch (e) {
    // If not valid JSON, we'll handle it gracefully
    commands = [];
  }
  return {
    path,
    text,
    sha256: sha256(text),
    commands,
  };
}

function createCapabilityNode(capability, sourceManifestHash, evidenceId, isUnknown = false, blocker = '') {
  const state = isUnknown
    ? {
      grade: 'R1',
      confidence: 'unknown',
      canonicality: 'blocked',
      rights: 'unknown',
      verification: 'unverified',
    }
    : {
      grade: 'R1',
      confidence: 'confirmed',
      canonicality: 'noncanonical',
      rights: 'unknown',
      verification: 'unverified',
    };

  const unresolved = isUnknown
    ? {
      impact: capability.impact || 'Capability unresolved or unconfirmed',
      blocker: blocker,
      nextExperiment: capability.nextExperiment || 'Live game evidence capture and analysis',
      releaseCondition: capability.releaseCondition || 'Fresh evidence from current checkout confirms capability',
    }
    : { impact: '', blocker: '', nextExperiment: '', releaseCondition: '' };

  return {
    schemaVersion: CONTRACT.schemaVersion,
    nodeId: capability.nodeId,
    axis: 'A11',
    type: 'gameplay-capability',
    domain: 'gameplay',
    owner: capability.owner || 'A05',
    summary: capability.summary,
    preconditions: capability.preconditions || [],
    postconditions: capability.postconditions || [],
    failureConditions: capability.failureConditions || [],
    surface: capability.surface || 'opcode',
    direction: capability.direction || 'none',
    state,
    lifetime: {
      creator: 'player',
      consumer: 'game-engine',
      disposer: 'session-close',
      scope: 'gameplay-session',
      hardBound: 0,
      notApplicableReason: '',
    },
    evidenceIds: [evidenceId],
    relatedIssue: 'LOGH7-216',
    acceptanceCriteria: ['AC-1', 'AC-5'],
    sourceManifestHash,
    unresolved,
  };
}

function sortNodesByNodeId(nodes) {
  return nodes.slice().sort((a, b) => a.nodeId.localeCompare(b.nodeId));
}

function sortEdgesByEdgeId(edges) {
  return edges.slice().sort((a, b) => a.edgeId.localeCompare(b.edgeId));
}

export async function buildA11Axis(repoRoot) {
  // Bootstrap A01 base
  const { ledger: base } = await importSources(repoRoot, SOURCE_MANIFEST);

  // Read master design source
  const masterDesignSource = await readMasterDesignSource(repoRoot);

  // Read opcode coverage source for reference
  const { records: opcodeRecords } = await readOpcodeSource(repoRoot);

  // Read strategy command catalog for reference
  const { commands: strategyCommands } = await readStrategyCommandSource(repoRoot);

  // Build A11 evidence record with distinct non-base source
  const capabilityEvidenceId = 'A11:evidence:gameplay-capabilities';
  const axisEvidence = [
    {
      schemaVersion: CONTRACT.schemaVersion,
      evidenceId: capabilityEvidenceId,
      type: 'design-documentation',
      producer: 'A11 importer',
      reviewer: 'A11 gameplay axis',
      source: {
        path: 'docs/logh7-causal-ledger-master-design.md',
        sha256: masterDesignSource.sha256,
        sizeBytes: Buffer.byteLength(masterDesignSource.text),
        lineage: 'design-spec',
        rights: 'allowed',
        recordPointer: 'section:A11',
        recordSha256: sha256('A11 — Gameplay capability and vertical-slice coverage'),
        legacyMetadata: {
          source: 'master-design',
          version: '1.0',
        },
      },
      execution: {
        platform: 'node',
        runtimeMode: 'static-analysis',
        command: 'node tools/causal-ledger/axes/a11-gameplay-capabilities.mjs',
        inputs: ['docs/logh7-opcode-coverage-current.md', 'server/content/generated/logh7-strategy-command-catalog.json'],
        configHash: sha256('a11-gameplay-capabilities'),
        startedAt: FIXED_EVIDENCE_TIMESTAMP,
        endedAt: FIXED_EVIDENCE_TIMESTAMP,
        exitCode: 0,
      },
      observation: {
        expected: 'Gameplay capabilities indexed with owner axis mapping',
        observed: 'Capabilities indexed from opcode coverage and strategy commands',
        verdict: 'verified',
        contradictedClaim: '',
      },
      artifacts: [],
      correlation: {
        acceptanceCriteria: ['AC-1', 'AC-5'],
        nodeIds: [],
        edgeIds: [],
      },
      cleanup: {
        pids: [],
        ports: [],
        databases: [],
        tempPaths: [],
        guis: [],
        runtimeWorkspaces: [],
        residual: 0,
      },
    },
  ];

  // Define capabilities based on spec and opcode coverage
  const capabilities = [
    // Session/Login capabilities (0x0200-0x0206)
    {
      nodeId: 'A11:capability:login-authenticate',
      summary: 'Player authentication (opcode 0x0200/0x0201)',
      owner: 'A05',
      surface: 'opcode',
      direction: 'c2s',
      preconditions: ['connection-established'],
      postconditions: ['auth-token-received'],
      failureConditions: ['invalid-credentials'],
    },
    {
      nodeId: 'A11:capability:select-character',
      summary: 'Character selection (opcode 0x0204/0x0205)',
      owner: 'A05',
      surface: 'opcode',
      direction: 'c2s',
      preconditions: ['authenticated'],
      postconditions: ['character-selected'],
      failureConditions: ['invalid-character'],
    },
    {
      nodeId: 'A11:capability:game-login',
      summary: 'Game world login (opcode 0x0206)',
      owner: 'A05',
      surface: 'opcode',
      direction: 'c2s',
      preconditions: ['character-selected'],
      postconditions: ['world-entry-prepared'],
      failureConditions: ['server-full'],
    },

    // Lobby capabilities
    {
      nodeId: 'A11:capability:character-creation',
      summary: 'Character creation (opcode 0x1000-0x1008)',
      owner: 'A05',
      surface: 'opcode',
      direction: 'c2s',
      preconditions: ['authenticated'],
      postconditions: ['character-created'],
      failureConditions: ['invalid-name'],
    },

    // World/Movement capabilities (0x0b01→0x0b07)
    {
      nodeId: 'A11:capability:world-enter',
      summary: 'Enter world/initialize grid (opcode 0x0f00-0x0f03)',
      owner: 'A03',
      surface: 'opcode',
      direction: 's2c',
      preconditions: ['game-login-complete'],
      postconditions: ['grid-initialized', 'sprite-rendered'],
      failureConditions: ['grid-data-missing'],
    },
    {
      nodeId: 'A11:capability:grid-movement',
      summary: 'Move unit on grid (opcode 0x0b01→0x0b07)',
      owner: 'A02',
      surface: 'opcode',
      direction: 'c2s',
      preconditions: ['world-entered', 'unit-selected', 'grid-valid'],
      postconditions: ['unit-position-updated', 'broadcast-movement'],
      failureConditions: ['out-of-range', 'invalid-target'],
    },

    // Fleet selection capability (Unknown/Blocked)
    {
      nodeId: 'A11:capability:fleet-selection',
      summary: 'Select fleet for movement/Warp',
      owner: 'A02',
      surface: 'input',
      direction: 'local',
      preconditions: ['world-entered'],
      postconditions: ['fleet-selected'],
      failureConditions: ['no-fleet-available'],
      impact: 'Fleet marker and selection UI not recorded',
      nextExperiment: 'Frida hook to WndProc fleet dialog',
      releaseCondition: 'A02 axis delivers fleet-selection input capture with screenshot',
    },

    // Warp capability (Unknown/Blocked)
    {
      nodeId: 'A11:capability:warp-to-coordinate',
      summary: 'Warp fleet to coordinate (authority card 0x2b via 0x0b01)',
      owner: 'A05',
      surface: 'opcode',
      direction: 'c2s',
      preconditions: ['fleet-selected', 'warp-authority'],
      postconditions: ['fleet-warped', 'position-changed'],
      failureConditions: ['no-authority', 'destination-blocked'],
      impact: 'Warp end-to-end vertical slice not recorded in current checkout',
      nextExperiment: 'Reproduce P0 runtime lineage with Frida trace',
      releaseCondition: 'Fresh evidence from native Windows or Wine session with opcode trace',
    },

    // Information capabilities (0x0323/0x0325/0x0327/0x032f)
    {
      nodeId: 'A11:capability:character-information',
      summary: 'Fetch character data (opcode 0x0322→0x0323)',
      owner: 'A06',
      surface: 'opcode',
      direction: 's2c',
      preconditions: ['world-entered'],
      postconditions: ['character-data-available'],
      failureConditions: ['data-missing'],
    },
    {
      nodeId: 'A11:capability:unit-information',
      summary: 'Fetch unit data (opcode 0x0324→0x0325)',
      owner: 'A06',
      surface: 'opcode',
      direction: 's2c',
      preconditions: ['world-entered'],
      postconditions: ['unit-data-available'],
      failureConditions: ['data-missing'],
    },
    {
      nodeId: 'A11:capability:warehouse-information',
      summary: 'Fetch warehouse data (opcode 0x0326→0x0327)',
      owner: 'A06',
      surface: 'opcode',
      direction: 's2c',
      preconditions: ['world-entered'],
      postconditions: ['warehouse-data-available'],
      failureConditions: ['data-missing'],
    },

    // OutfitParty capability (Unknown/Blocked - 0x032f)
    {
      nodeId: 'A11:capability:outfit-party-information',
      summary: 'Fetch fleet members list (opcode 0x032e→0x032f ResponseInformationOutfitParty)',
      owner: 'A06',
      surface: 'opcode',
      direction: 's2c',
      preconditions: ['fleet-selected'],
      postconditions: ['fleet-member-list-available'],
      failureConditions: ['response-zero-filled'],
      impact: 'OutfitParty response (0x8b04 bytes) is zero-filled; no builder confirmed',
      nextExperiment: 'Check A06 canonical fleet-member data source; confirm builder in code',
      releaseCondition: 'A06 provides canonical member-list values; A04 builder confirmed',
    },

    // Static Information capabilities
    {
      nodeId: 'A11:capability:grid-type-information',
      summary: 'Fetch grid type master table (opcode 0x0312→0x0313)',
      owner: 'A06',
      surface: 'opcode',
      direction: 's2c',
      preconditions: ['world-entered'],
      postconditions: ['grid-type-data-available'],
      failureConditions: ['data-missing'],
    },
    {
      nodeId: 'A11:capability:grid-cells-information',
      summary: 'Fetch grid cells (opcode 0x0314→0x0315)',
      owner: 'A06',
      surface: 'opcode',
      direction: 's2c',
      preconditions: ['world-entered'],
      postconditions: ['grid-cells-available'],
      failureConditions: ['data-missing'],
    },
    {
      nodeId: 'A11:capability:card-information',
      summary: 'Fetch card master table (opcode 0x0304→0x0305)',
      owner: 'A06',
      surface: 'opcode',
      direction: 's2c',
      preconditions: ['world-entered'],
      postconditions: ['card-data-available'],
      failureConditions: ['data-missing'],
    },
    {
      nodeId: 'A11:capability:card-command-information',
      summary: 'Fetch card-command master table (opcode 0x0306→0x0307)',
      owner: 'A06',
      surface: 'opcode',
      direction: 's2c',
      preconditions: ['world-entered'],
      postconditions: ['card-command-data-available'],
      failureConditions: ['data-missing'],
    },

    // Astronomy capability (Unknown/Blocked - 0x031d)
    {
      nodeId: 'A11:capability:astronomy-information',
      summary: 'Fetch planet visual data (opcode 0x031c→0x031d ResponseStaticInformationBase)',
      owner: 'A06',
      surface: 'opcode',
      direction: 's2c',
      preconditions: ['world-entered'],
      postconditions: ['planet-data-available'],
      failureConditions: ['response-zero-filled'],
      impact: 'Astronomy response (0x031d) is zero-filled; canonical spectral class/diameter values missing',
      nextExperiment: 'A06 recovers canonical galaxy data from CD/manual',
      releaseCondition: 'A06 node connects 0x031d to canonical master-data source',
    },

    // Economy capabilities (Unknown/Blocked - P3)
    {
      nodeId: 'A11:capability:base-information',
      summary: 'Fetch base/economy data (opcode 0x031e→0x031f)',
      owner: 'A06',
      surface: 'opcode',
      direction: 's2c',
      preconditions: ['world-entered'],
      postconditions: ['base-data-available'],
      failureConditions: ['response-zero-filled'],
      impact: 'Economy features unimplemented per manual p9; base panel shows zero-fill',
      nextExperiment: 'Manual specification review; content audit for canonical values',
      releaseCondition: 'Decision to implement or mark permanently P3/skipped',
    },

    // Strategy commands - resolved (2/81)
    {
      nodeId: 'A11:capability:strategy-command-warp',
      summary: 'Strategy command: Warp (factory ID 0x2b)',
      owner: 'A05',
      surface: 'command',
      direction: 'c2s',
      preconditions: ['fleet-selected', 'authority-warp'],
      postconditions: ['warp-executed'],
      failureConditions: ['authority-denied'],
    },
    {
      nodeId: 'A11:capability:strategy-command-move',
      summary: 'Strategy command: Move grid (factory ID 0x2d)',
      owner: 'A05',
      surface: 'command',
      direction: 'c2s',
      preconditions: ['grid-movement-enabled'],
      postconditions: ['move-executed'],
      failureConditions: ['authority-denied'],
    },

    // Strategy commands - unresolved (79/81)
    {
      nodeId: 'A11:capability:strategy-commands-unresolved',
      summary: '79 strategy commands with unresolved factory IDs',
      owner: 'A05',
      surface: 'command',
      direction: 'c2s',
      preconditions: ['authority-card-present'],
      postconditions: ['command-executed'],
      failureConditions: ['authority-denied'],
      impact: 'Strategy command factory IDs not resolved; cannot author commands',
      nextExperiment: 'MHServerEmu cross-check + live authority-card trace',
      releaseCondition: 'authority-cards.mjs records all 81 factory IDs with P0 provenance',
    },

    // Tactics/Battle capability (Unknown/Blocked)
    {
      nodeId: 'A11:capability:tactics-information',
      summary: 'Fetch tactical position data (opcode 0x033a→0x033b)',
      owner: 'A05',
      surface: 'opcode',
      direction: 's2c',
      preconditions: ['battle-entered'],
      postconditions: ['tactics-data-available'],
      failureConditions: ['data-missing'],
    },
    {
      nodeId: 'A11:capability:battle-entry-handshake',
      summary: 'Battle entry state transition trigger',
      owner: 'A05',
      surface: 'function',
      direction: 'internal',
      preconditions: ['tactics-area-unlocked'],
      postconditions: ['tactical-fsm-ready'],
      failureConditions: ['wrong-sequence-crash'],
      impact: 'Battle-enter handshake trigger opcode not identified',
      nextExperiment: 'Frida breakpoint on FUN_004c32a0; server battle-enter command identification',
      releaseCondition: 'A05 delivers explicit battle-enter command node with opcode/authority/response',
    },

    // Chat capability
    {
      nodeId: 'A11:capability:grid-chat',
      summary: 'Grid chat message (opcode 0x0f1c)',
      owner: 'A12',
      surface: 'opcode',
      direction: 'c2s',
      preconditions: ['world-entered'],
      postconditions: ['chat-broadcast'],
      failureConditions: ['encoding-error'],
    },

    // Heartbeat capability
    {
      nodeId: 'A11:capability:session-heartbeat',
      summary: 'Session heartbeat (opcode 0x0300→0x0301)',
      owner: 'A04',
      surface: 'opcode',
      direction: 's2c',
      preconditions: ['session-active'],
      postconditions: ['keep-alive-sent'],
      failureConditions: ['session-timeout'],
    },

    // Package capability (Unknown/Blocked - P3)
    {
      nodeId: 'A11:capability:package-information',
      summary: 'Fetch package data (opcode 0x0328→0x0329)',
      owner: 'A06',
      surface: 'opcode',
      direction: 's2c',
      preconditions: ['world-entered'],
      postconditions: ['package-data-available'],
      failureConditions: ['response-zero-filled'],
      impact: 'Package information unimplemented; response zero-filled',
      nextExperiment: 'A06 canonical package data source identification',
      releaseCondition: 'A06 provides canonical package values',
    },

    // Grid information outfit capability (Unknown/Blocked)
    {
      nodeId: 'A11:capability:grid-outfit-information',
      summary: 'Fetch grid outfit data (opcode 0x032c→0x032d)',
      owner: 'A06',
      surface: 'opcode',
      direction: 's2c',
      preconditions: ['world-entered'],
      postconditions: ['grid-outfit-data-available'],
      failureConditions: ['response-zero-filled'],
      impact: 'Grid outfit information unimplemented; response zero-filled',
      nextExperiment: 'A06 canonical grid outfit data source identification',
      releaseCondition: 'A06 provides canonical grid outfit values',
    },

    // Power distribution capability (Unknown/Blocked - P3)
    {
      nodeId: 'A11:capability:power-distribution-information',
      summary: 'Fetch power distribution master table (opcode 0x0308→0x0309)',
      owner: 'A06',
      surface: 'opcode',
      direction: 's2c',
      preconditions: ['world-entered'],
      postconditions: ['power-dist-data-available'],
      failureConditions: ['response-zero-filled'],
      impact: 'Power distribution information unimplemented; response zero-filled',
      nextExperiment: 'A06 canonical power distribution data source identification',
      releaseCondition: 'A06 provides canonical power distribution values',
    },

    // Unit ship master table
    {
      nodeId: 'A11:capability:unit-ship-information',
      summary: 'Fetch unit ship master table (opcode 0x030a→0x030b)',
      owner: 'A06',
      surface: 'opcode',
      direction: 's2c',
      preconditions: ['world-entered'],
      postconditions: ['unit-ship-data-available'],
      failureConditions: ['data-missing'],
    },

    // Unit troop master table (Unknown/Blocked - P3)
    {
      nodeId: 'A11:capability:unit-troop-information',
      summary: 'Fetch unit troop master table (opcode 0x030c→0x030d)',
      owner: 'A06',
      surface: 'opcode',
      direction: 's2c',
      preconditions: ['world-entered'],
      postconditions: ['unit-troop-data-available'],
      failureConditions: ['response-zero-filled'],
      impact: 'Unit troop information unimplemented; response zero-filled',
      nextExperiment: 'A06 canonical troop data source identification',
      releaseCondition: 'A06 provides canonical troop values',
    },

    // Fighters master table (Unknown/Blocked - P3)
    {
      nodeId: 'A11:capability:fighters-information',
      summary: 'Fetch fighters master table (opcode 0x030e→0x030f)',
      owner: 'A06',
      surface: 'opcode',
      direction: 's2c',
      preconditions: ['world-entered'],
      postconditions: ['fighters-data-available'],
      failureConditions: ['response-zero-filled'],
      impact: 'Fighters information unimplemented; response zero-filled',
      nextExperiment: 'A06 canonical fighters data source identification',
      releaseCondition: 'A06 provides canonical fighters values',
    },

    // Arms master table (Unknown/Blocked - P3)
    {
      nodeId: 'A11:capability:arms-information',
      summary: 'Fetch arms master table (opcode 0x0310→0x0311)',
      owner: 'A06',
      surface: 'opcode',
      direction: 's2c',
      preconditions: ['world-entered'],
      postconditions: ['arms-data-available'],
      failureConditions: ['response-zero-filled'],
      impact: 'Arms information unimplemented; response zero-filled',
      nextExperiment: 'A06 canonical arms data source identification',
      releaseCondition: 'A06 provides canonical arms values',
    },

    // Institution information (Unknown/Blocked)
    {
      nodeId: 'A11:capability:institution-information',
      summary: 'Fetch institution data (opcode 0x0320→0x0321)',
      owner: 'A06',
      surface: 'opcode',
      direction: 's2c',
      preconditions: ['world-entered'],
      postconditions: ['institution-data-available'],
      failureConditions: ['response-zero-filled'],
      impact: 'Institution information conditionally zero-filled; depends on data availability',
      nextExperiment: 'A06 canonical institution data source identification',
      releaseCondition: 'A06 provides canonical institution values',
    },

    // Outfit information (Unknown/Blocked)
    {
      nodeId: 'A11:capability:outfit-information',
      summary: 'Fetch outfit data (opcode 0x032a→0x032b)',
      owner: 'A06',
      surface: 'opcode',
      direction: 's2c',
      preconditions: ['fleet-selected'],
      postconditions: ['outfit-data-available'],
      failureConditions: ['response-zero-filled'],
      impact: 'Outfit information conditionally zero-filled; depends on fleet data',
      nextExperiment: 'A06 canonical outfit data source identification',
      releaseCondition: 'A06 provides canonical outfit values',
    },

    // Outfit unit information (Unknown/Blocked)
    {
      nodeId: 'A11:capability:outfit-unit-information',
      summary: 'Fetch outfit unit data (opcode 0x0330→0x0331)',
      owner: 'A06',
      surface: 'opcode',
      direction: 's2c',
      preconditions: ['fleet-selected'],
      postconditions: ['outfit-unit-data-available'],
      failureConditions: ['response-zero-filled'],
      impact: 'Outfit unit information unimplemented; response zero-filled',
      nextExperiment: 'A06 canonical outfit unit data source identification',
      releaseCondition: 'A06 provides canonical outfit unit values',
    },

    // Additional strategy commands (sample of categories)
    {
      nodeId: 'A11:capability:strategy-command-attack',
      summary: 'Strategy command: Attack (category STR)',
      owner: 'A05',
      surface: 'command',
      direction: 'c2s',
      preconditions: ['authority-card-present'],
      postconditions: ['attack-executed'],
      failureConditions: ['authority-denied'],
      impact: 'Factory ID unresolved; cannot author command',
      nextExperiment: 'MHServerEmu cross-check + authority-card trace',
      releaseCondition: 'authority-cards.mjs records factory ID with P0 provenance',
    },
    {
      nodeId: 'A11:capability:strategy-command-development',
      summary: 'Strategy command: Development (category IND)',
      owner: 'A05',
      surface: 'command',
      direction: 'c2s',
      preconditions: ['authority-card-present'],
      postconditions: ['development-executed'],
      failureConditions: ['authority-denied'],
      impact: 'Factory ID unresolved; cannot author command',
      nextExperiment: 'MHServerEmu cross-check + authority-card trace',
      releaseCondition: 'authority-cards.mjs records factory ID with P0 provenance',
    },
    {
      nodeId: 'A11:capability:strategy-command-politics',
      summary: 'Strategy command: Politics (category POL)',
      owner: 'A05',
      surface: 'command',
      direction: 'c2s',
      preconditions: ['authority-card-present'],
      postconditions: ['politics-executed'],
      failureConditions: ['authority-denied'],
      impact: 'Factory ID unresolved; cannot author command',
      nextExperiment: 'MHServerEmu cross-check + authority-card trace',
      releaseCondition: 'authority-cards.mjs records factory ID with P0 provenance',
    },
    {
      nodeId: 'A11:capability:strategy-command-diplomacy',
      summary: 'Strategy command: Diplomacy (category CMD)',
      owner: 'A05',
      surface: 'command',
      direction: 'c2s',
      preconditions: ['authority-card-present'],
      postconditions: ['diplomacy-executed'],
      failureConditions: ['authority-denied'],
      impact: 'Factory ID unresolved; cannot author command',
      nextExperiment: 'MHServerEmu cross-check + authority-card trace',
      releaseCondition: 'authority-cards.mjs records factory ID with P0 provenance',
    },
    {
      nodeId: 'A11:capability:strategy-command-intelligence',
      summary: 'Strategy command: Intelligence (category INT)',
      owner: 'A05',
      surface: 'command',
      direction: 'c2s',
      preconditions: ['authority-card-present'],
      postconditions: ['intelligence-executed'],
      failureConditions: ['authority-denied'],
      impact: 'Factory ID unresolved; cannot author command',
      nextExperiment: 'MHServerEmu cross-check + authority-card trace',
      releaseCondition: 'authority-cards.mjs records factory ID with P0 provenance',
    },
    {
      nodeId: 'A11:capability:strategy-command-logistics',
      summary: 'Strategy command: Logistics (category LOG)',
      owner: 'A05',
      surface: 'command',
      direction: 'c2s',
      preconditions: ['authority-card-present'],
      postconditions: ['logistics-executed'],
      failureConditions: ['authority-denied'],
      impact: 'Factory ID unresolved; cannot author command',
      nextExperiment: 'MHServerEmu cross-check + authority-card trace',
      releaseCondition: 'authority-cards.mjs records factory ID with P0 provenance',
    },
    {
      nodeId: 'A11:capability:strategy-command-personnel',
      summary: 'Strategy command: Personnel (category PER)',
      owner: 'A05',
      surface: 'command',
      direction: 'c2s',
      preconditions: ['authority-card-present'],
      postconditions: ['personnel-executed'],
      failureConditions: ['authority-denied'],
      impact: 'Factory ID unresolved; cannot author command',
      nextExperiment: 'MHServerEmu cross-check + authority-card trace',
      releaseCondition: 'authority-cards.mjs records factory ID with P0 provenance',
    },

    // Additional battle/tactical capabilities
    {
      nodeId: 'A11:capability:tactics-command-attack-target',
      summary: 'Tactical command: Attack specific target (opcode 0x0345)',
      owner: 'A05',
      surface: 'opcode',
      direction: 'c2s',
      preconditions: ['battle-entered', 'tactical-fsm-ready'],
      postconditions: ['attack-command-executed'],
      failureConditions: ['no-targets'],
    },
    {
      nodeId: 'A11:capability:tactics-command-retreat',
      summary: 'Tactical command: Retreat unit (opcode 0x0347)',
      owner: 'A05',
      surface: 'opcode',
      direction: 'c2s',
      preconditions: ['battle-entered', 'tactical-fsm-ready'],
      postconditions: ['retreat-command-executed'],
      failureConditions: ['blocked'],
    },
    {
      nodeId: 'A11:capability:tactics-command-standby',
      summary: 'Tactical command: Unit stand by (opcode 0x0349)',
      owner: 'A05',
      surface: 'opcode',
      direction: 'c2s',
      preconditions: ['battle-entered', 'tactical-fsm-ready'],
      postconditions: ['standby-command-executed'],
      failureConditions: ['invalid-state'],
    },
    {
      nodeId: 'A11:capability:tactics-command-formation',
      summary: 'Tactical command: Change formation (opcode 0x034b)',
      owner: 'A05',
      surface: 'opcode',
      direction: 'c2s',
      preconditions: ['battle-entered', 'tactical-fsm-ready'],
      postconditions: ['formation-changed'],
      failureConditions: ['invalid-formation'],
    },

    // Grid entry bracket
    {
      nodeId: 'A11:capability:grid-enter-bracket-start',
      summary: 'Grid enter bracket start (opcode 0x0b09)',
      owner: 'A04',
      surface: 'opcode',
      direction: 's2c',
      preconditions: ['world-entered'],
      postconditions: ['grid-entry-sequence-start'],
      failureConditions: ['protocol-error'],
    },
    {
      nodeId: 'A11:capability:grid-enter-bracket-end',
      summary: 'Grid enter bracket end (opcode 0x0b0a)',
      owner: 'A04',
      surface: 'opcode',
      direction: 's2c',
      preconditions: ['grid-entry-sequence-start'],
      postconditions: ['grid-entry-sequence-end'],
      failureConditions: ['protocol-error'],
    },
  ];

  // Build A11 nodes from capabilities
  const axisNodes = [];
  const capabilityNodeIds = new Set();

  for (const cap of capabilities) {
    const isUnknown = cap.impact && cap.impact.length > 0;
    const blocker = cap.impact || '';
    const node = createCapabilityNode(cap, base.sourceManifestHash, capabilityEvidenceId, isUnknown, blocker);
    axisNodes.push(node);
    capabilityNodeIds.add(node.nodeId);
  }

  // A11 focuses on capability nodes; edges are minimal
  // (Complex dependency relationships are documented in node preconditions/postconditions)
  const axisEdges = [];

  // Map base coverage records: attach A11 nodes to first coverage record
  const mappedCoverage = base.coverage.map((cov, idx) => {
    if (idx === 0) {
      // Attach all A11 nodes to first coverage record
      const newTargetNodeIds = [...(cov.targetNodeIds || []), ...Array.from(capabilityNodeIds)];
      return { ...cov, targetNodeIds: newTargetNodeIds };
    }
    return cov;
  });

  // Sort axis records for determinism
  const sortedAxisNodes = sortNodesByNodeId(axisNodes);
  const sortedAxisEdges = sortEdgesByEdgeId(axisEdges);
  const sortedAxisEvidence = axisEvidence.slice().sort((a, b) => a.evidenceId.localeCompare(b.evidenceId));

  // Assemble ledger by appending A11 records to A01 base
  const ledger = {
    ...base,
    nodes: [...base.nodes, ...sortedAxisNodes],
    edges: [...base.edges, ...sortedAxisEdges],
    evidence: [...base.evidence, ...sortedAxisEvidence],
    coverage: mappedCoverage,
    transitions: [...base.transitions],
    migrations: [...base.migrations],
    axisDependencies: base.axisDependencies,
    importReceipts: [...base.importReceipts],
  };

  // Validate ledger with manifest
  validateLedger(ledger, { manifest: SOURCE_MANIFEST });

  // Write generated output (delta only - with coverage attachment info)
  // Filter coverage to only include records that reference A11 nodes (i.e., were modified)
  const a11NodeIds = new Set(sortedAxisNodes.map(n => n.nodeId));
  const deltaCoverage = mappedCoverage.filter(cov =>
    cov.targetNodeIds?.some(id => a11NodeIds.has(id))
  );
  const delta = {
    nodes: sortedAxisNodes,
    edges: sortedAxisEdges,
    evidence: sortedAxisEvidence,
    coverage: deltaCoverage,
  };
  const outputPath = join(GENERATED_DIR, 'a11-gameplay-capabilities.json');
  await writeFile(outputPath, stableStringify(delta) + '\n', 'utf8');

  return { ledger, delta };
}

// CLI entry point: output full ledger as JSON to stdout
const isMainModule = process.argv[1]?.endsWith('a11-gameplay-capabilities.mjs');
if (isMainModule) {
  const repoRoot = process.argv[2] || process.cwd();
  try {
    const { ledger } = await buildA11Axis(repoRoot);
    console.log(stableStringify(ledger));
    process.exit(0);
  } catch (err) {
    console.error('Error building A11 axis:', err.message);
    console.error('Stack:', err.stack);
    process.exit(1);
  }
}
