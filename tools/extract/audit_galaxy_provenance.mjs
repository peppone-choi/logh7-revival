#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, '..', '..');

const INPUT_GALAXY = join(REPO_ROOT, 'server/content/galaxy.json');
const NULL_GALAXY_MDX = join(
  REPO_ROOT,
  'artifacts/logh7-install/____________s___/____/data/model/strategy/null_galaxy.mdx',
);
const OBSIDIAN_NOTE = 'E:/obsidian-tech-vault/1. 프로젝트/은하영웅전설 7 리바이벌/갤럭시 좌표 발견 (null_galaxy.mdx).md';
const OUTPUT_AUDIT = join(REPO_ROOT, 'server/content/generated/logh7-galaxy-provenance-audit.json');

const EXPECTED = {
  systemsTotal: 85,
  gameMdxCount: 79,
  manualOnlyCount: 1,
  virtualOverlayCount: 5,
  withGameXYCount: 79,
};

function repoPath(path) {
  return resolve(REPO_ROOT, path);
}

function sha256File(path) {
  const hash = createHash('sha256');
  hash.update(readFileSync(path));
  return hash.digest('hex');
}

function fileStat(path) {
  const st = statSync(path);
  return {
    sizeBytes: st.size,
    mtime: st.mtime.toISOString(),
    ctime: st.ctime.toISOString(),
    sha256: sha256File(path),
  };
}

function countLineHits(text, terms) {
  const lines = text.split(/\r?\n/);
  return terms.map((term) => {
    const termLower = String(term).toLowerCase();
    const matches = [];
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].toLowerCase().includes(termLower)) {
        matches.push({
          line: i + 1,
          text: lines[i].trim(),
        });
      }
    }
    return {
      term,
      hitCount: matches.length,
      hits: matches.slice(0, 8),
    };
  });
}

function readObsidiannote(path) {
  if (!existsSync(path)) {
    return {
      path,
      exists: false,
      warning: 'Obsidian note path not found',
    };
  }

  const text = readFileSync(path, 'utf8');
  const st = statSync(path);
  const hits = countLineHits(text, [
    'null_galaxy.mdx',
    '79',
    'フォルセティ',
    'virtual-overlay',
    '_specialBodies',
    'special-body',
    'specialBodies',
  ]);

  return {
    path,
    exists: true,
    sizeBytes: st.size,
    mtime: st.mtime.toISOString(),
    sha256: sha256File(path),
    keyLineHits: hits,
  };
}

function auditGalaxy(path) {
  const text = readFileSync(path, 'utf8');
  const galaxy = JSON.parse(text);
  const systems = Array.isArray(galaxy.systems) ? galaxy.systems : [];
  const counts = {
    systemsTotal: systems.length,
    gameMdxCount: 0,
    manualOnlyCount: 0,
    virtualOverlayCount: 0,
    withGameXYCount: 0,
  };

  for (const system of systems) {
    const provenance = String(system?.coordProvenance || '').toLowerCase();
    const isVirtual = provenance.includes('virtual-overlay');
    const isGameMdx = provenance.includes('game-mdx');
    const isManual = provenance.includes('manual');

    if (isGameMdx) counts.gameMdxCount += 1;
    if (isVirtual) counts.virtualOverlayCount += 1;
    if (isManual && !isVirtual) counts.manualOnlyCount += 1;
    if (Number.isFinite(system?.gameX) && Number.isFinite(system?.gameY)) {
      counts.withGameXYCount += 1;
    }
  }

  const mismatches = [];
  const countPairs = [
    ['systemsTotal', counts.systemsTotal, EXPECTED.systemsTotal],
    ['gameMdxCount', counts.gameMdxCount, EXPECTED.gameMdxCount],
    ['manualOnlyCount', counts.manualOnlyCount, EXPECTED.manualOnlyCount],
    ['virtualOverlayCount', counts.virtualOverlayCount, EXPECTED.virtualOverlayCount],
    ['withGameXYCount', counts.withGameXYCount, EXPECTED.withGameXYCount],
  ];

  for (const [name, value, expected] of countPairs) {
    if (value !== expected) {
      mismatches.push({ name, value, expected });
    }
  }

  return {
    path: relative(REPO_ROOT, path),
    exists: true,
    sizeBytes: statSync(path).size,
    counts,
    expectedCounts: EXPECTED,
    mismatches,
  };
}

function main() {
  const notes = [];
  const warnings = [];

  const nullGalaxy = existsSync(NULL_GALAXY_MDX)
    ? {
        path: relative(REPO_ROOT, NULL_GALAXY_MDX),
        exists: true,
        ...fileStat(NULL_GALAXY_MDX),
      }
    : {
        path: relative(REPO_ROOT, NULL_GALAXY_MDX),
        exists: false,
        warning: 'Expected null_galaxy.mdx source file is missing',
      };

  const galaxy = existsSync(INPUT_GALAXY)
    ? auditGalaxy(INPUT_GALAXY)
    : {
        path: relative(REPO_ROOT, INPUT_GALAXY),
        exists: false,
        warning: 'Expected server/content/galaxy.json is missing',
      };

  const obsidian = readObsidiannote(OBSIDIAN_NOTE);
  if (!obsidian.exists) warnings.push(obsidian.warning);

  if (!galaxy.exists) {
    notes.push({ severity: 'error', check: 'galaxy-json-read', message: galaxy.warning });
  } else if (galaxy.mismatches.length > 0) {
    for (const mismatch of galaxy.mismatches) {
      notes.push({
        severity: 'error',
        check: 'count-expected',
        message: `Mismatch for ${mismatch.name}: expected ${mismatch.expected}, got ${mismatch.value}`,
      });
    }
  }

  if (!nullGalaxy.exists) {
    notes.push({
      severity: 'error',
      check: 'null-galaxy-source',
      message: nullGalaxy.warning,
    });
  }

  const readyForUse = notes.filter((note) => note.severity === 'error').length === 0;
  if (!obsidian.exists) {
    notes.push({
      severity: 'warning',
      check: 'obsidian-note-missing',
      message: obsidian.warning,
    });
  }

  const audit = {
    id: 'logh7-galaxy-provenance-audit',
    generatedAt: new Date().toISOString(),
    readyForUse,
    checks: {
      galaxyJson: galaxy,
      nullGalaxyMdx: nullGalaxy,
      obsidianNote: {
        path: obsidian.path,
        exists: obsidian.exists,
        ...(obsidian.exists
          ? {
              sizeBytes: obsidian.sizeBytes,
              mtime: obsidian.mtime,
              sha256: obsidian.sha256,
              keyLineHits: obsidian.keyLineHits,
            }
          : {}),
      },
    },
    notes,
  };

  mkdirSync(repoPath('server/content/generated'), { recursive: true });
  writeFileSync(OUTPUT_AUDIT, JSON.stringify(audit, null, 2) + '\n');

  console.log(JSON.stringify(
    {
      readyForUse,
      generatedAt: audit.generatedAt,
      output: relative(REPO_ROOT, OUTPUT_AUDIT),
      warningCount: notes.filter((note) => note.severity === 'warning').length,
      errorCount: notes.filter((note) => note.severity === 'error').length,
    },
    null,
    2,
  ));
}

main();
