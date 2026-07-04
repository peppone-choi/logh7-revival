import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildSceneInventory,
  writeSceneInventory,
} from '../../src/server/logh7-scene-inventory.mjs';

test('scene inventory extracts scene groups from executable strings and MsgDat text', () => {
  const workspaceRoot = mkdtempSync(join(tmpdir(), 'logh7-scenes-'));
  try {
    writeFile(join(workspaceRoot, '.omo/ghidra/export/G7MTClient/strings.tsv'), [
      '0x00401000\tLobbyLoginOK',
      '0x00401010\tSelectGrid',
      '0x00401020\tBattleMap',
      '0x00401030\tStrategicMap',
    ].join('\n'));
    writeFile(
      join(workspaceRoot, '.omo/work/logh7-cd-extract/installshield-root/game/data/MsgDat/constmsg.dat'),
      'ログイン\0ロビー\0戦略\0艦隊\0会戦\0惑星\0',
    );

    const inventory = buildSceneInventory({ workspaceRoot });

    assert.equal(inventory.id, 'logh7-scene-inventory');
    assert.equal(inventory.status, 'inventoried');
    assert.deepEqual(
      inventory.scenes.slice(0, 7).map((scene) => scene.id),
      [
        'boot-update-launcher',
        'login',
        'lobby',
        'character-select',
        'character-create',
        'world-entry',
        'strategic-map',
      ],
    );
    assert.deepEqual(
      inventory.scenes.find((scene) => scene.id === 'strategic-map').requires,
      ['world-session'],
    );
    assert.equal(
      inventory.scenes.find((scene) => scene.id === 'character-select').sessionConcept,
      'character-slot-session',
    );
    assert.ok(inventory.scenes.some((scene) => scene.id === 'tactical-battle'));
    assert.ok(inventory.scenes.every((scene) => scene.unityScenePath.startsWith('Assets/Scenes/')));
  } finally {
    rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test('scene inventory writes manifest for Unity generation', () => {
  const workspaceRoot = mkdtempSync(join(tmpdir(), 'logh7-scenes-'));
  try {
    const inventory = buildSceneInventory({ workspaceRoot });
    const outPath = join(workspaceRoot, 'server/content/generated/logh7-scene-inventory.json');
    writeSceneInventory(outPath, inventory);
    assert.equal(inventory.scenes.length > 0, true);
  } finally {
    rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

function writeFile(path, value) {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, `${value}\n`);
}
