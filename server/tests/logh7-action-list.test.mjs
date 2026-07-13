import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  CODE_NOTIFY_INFORMATION_CHARACTER,
  NOTIFY_INFORMATION_CHARACTER_BYTES,
  buildNotifyInformationCharacterInner,
  decodeNotifyInformationCharacterStream,
} from '../src/server/codec/personnel-action-list.mjs';
import {
  buildGridInitializeSpawnInners,
  CODE_INFO_CHARACTER,
  CODE_INFO_UNIT,
  CODE_NOTIFY_ENTER_GRID_BEGIN,
  CODE_NOTIFY_ENTER_GRID_END,
  CODE_GRID_INIT_OK,
  readMsg32Code,
  msg32Body,
} from '../src/server/logh7-world-records.mjs';
import { createWorldSession } from '../src/server/logh7-world-session.mjs';

function body(inner) {
  return inner.subarray(6);
}

function readNativePstr16(object, lengthOffset, charsOffset) {
  const length = object.readUInt8(lengthOffset);
  return Array.from(
    { length },
    (_, index) => String.fromCharCode(object.readUInt16LE(charsOffset + index * 2)),
  ).join('');
}

test('0x0356 compact builder expands to the native action-list object', () => {
  const inner = buildNotifyInformationCharacterInner({
    characterId: 1,
    gridUnitId: 1,
    power: 2,
    spot: 1,
    abilities: [90, 80, 70, 60, 50, 40, 30, 20],
    lastname: 'PANEL',
    firstname: 'TEST',
    rank: 4,
    seatEntries: [{ character: 1, role: 0 }],
  });

  assert.equal(readMsg32Code(inner), CODE_NOTIFY_INFORMATION_CHARACTER);
  const payload = body(inner);
  assert.ok(payload.length > 0);
  assert.ok(payload.length < NOTIFY_INFORMATION_CHARACTER_BYTES);

  const decoded = decodeNotifyInformationCharacterStream(payload);
  assert.ok(decoded);
  assert.equal(decoded.consumed, payload.length);
  assert.equal(decoded.trailing, 0);
  assert.equal(decoded.object.length, NOTIFY_INFORMATION_CHARACTER_BYTES);
  assert.equal(decoded.object.readUInt32LE(0x04), 1);
  assert.equal(decoded.object.readUInt32LE(0x28), 1);
  assert.equal(decoded.object.readUInt16LE(0x18c), 90);
  assert.equal(decoded.object.readUInt16LE(0x18c + 7 * 4), 20);
  assert.equal(decoded.object.readUInt8(0x250), 1, 'native action-list seat count');
  assert.equal(decoded.object.readUInt16LE(0x254), 1);
  assert.equal(decoded.object.readUInt32LE(0x258), 0);
});

test('grid-init은 postload env와 무관하게 0x0f03 직후 동일한 0x0356을 정확히 한 번 보낸다', () => {
  const previous = process.env.LOGH_POSTLOAD_ACTION_LIST;
  const actionFrames = [];
  try {
    for (const value of [undefined, '0', '1']) {
      if (value === undefined) delete process.env.LOGH_POSTLOAD_ACTION_LIST;
      else process.env.LOGH_POSTLOAD_ACTION_LIST = value;
      const label = `LOGH_POSTLOAD_ACTION_LIST=${value ?? 'unset'}`;
      const inners = buildGridInitializeSpawnInners({
        characterId: 1,
        unitId: 1,
        power: 2,
        abilities: [90, 80, 70, 60, 50, 40, 30, 20],
        lastname: 'PANEL',
        firstname: 'TEST',
        rank: 4,
      });
      const codes = inners.map(readMsg32Code);
      const iBegin = codes.indexOf(CODE_NOTIFY_ENTER_GRID_BEGIN);
      const iUnit = codes.indexOf(CODE_INFO_UNIT);
      const iChar = codes.indexOf(CODE_INFO_CHARACTER);
      const iEnd = codes.indexOf(CODE_NOTIFY_ENTER_GRID_END);
      const iGridInit = codes.indexOf(CODE_GRID_INIT_OK);
      const iAction = codes.indexOf(CODE_NOTIFY_INFORMATION_CHARACTER);
      assert.equal(codes.filter((code) => code === CODE_NOTIFY_INFORMATION_CHARACTER).length, 1, `${label}: exactly once`);
      assert.ok(iBegin < iUnit && iUnit < iChar && iChar < iEnd && iEnd < iGridInit, `${label}: grid-init order`);
      assert.equal(iAction, iGridInit + 1, `${label}: 0x0356 immediately follows 0x0f03`);

      const action = inners[iAction];
      const decoded = decodeNotifyInformationCharacterStream(msg32Body(action));
      assert.ok(decoded, `${label}: compact stream decodes`);
      assert.equal(decoded.object.readUInt32LE(0x04), 1, `${label}: character`);
      assert.equal(decoded.object.readUInt16LE(0x18c), 90, `${label}: ability[0]`);
      assert.equal(decoded.object.readUInt16LE(0x18c + 7 * 4), 20, `${label}: ability[7]`);
      assert.equal(readNativePstr16(decoded.object, 0x85, 0x86), 'PANEL', `${label}: lastname`);
      assert.equal(readNativePstr16(decoded.object, 0xa0, 0xa2), 'TEST', `${label}: firstname`);
      assert.equal(decoded.object.readUInt16LE(0x85 + 0x55), 4, `${label}: rank`);
      assert.equal(decoded.object.readUInt8(0x250), 1, `${label}: seat count`);
      assert.equal(decoded.object.readUInt16LE(0x254), 1, `${label}: default seat character`);
      actionFrames.push(action);
    }
    assert.deepEqual(actionFrames[1], actionFrames[0], 'env=0 cannot change 0x0356 bytes');
    assert.deepEqual(actionFrames[2], actionFrames[0], 'env=1 cannot change 0x0356 bytes');
  } finally {
    if (previous == null) delete process.env.LOGH_POSTLOAD_ACTION_LIST;
    else process.env.LOGH_POSTLOAD_ACTION_LIST = previous;
  }
});

test('world-session 0x0f02도 postload env와 무관하게 동일한 player 0x0356을 보낸다', () => {
  const previous = process.env.LOGH_POSTLOAD_ACTION_LIST;
  const actionFrames = [];
  try {
    for (const value of [undefined, '0', '1']) {
      if (value === undefined) delete process.env.LOGH_POSTLOAD_ACTION_LIST;
      else process.env.LOGH_POSTLOAD_ACTION_LIST = value;
      const label = `LOGH_POSTLOAD_ACTION_LIST=${value ?? 'unset'}`;
      const world = createWorldSession();
      world.seedPlayer({
        connectionId: 1,
        characterId: 1,
        unitId: 1,
        inWorld: true,
        power: 2,
        lastname: 'PANEL',
        firstname: 'TEST',
        rank: 4,
        ability8: [90, 80, 70, 60, 50, 40, 30, 20],
      });
      const request = Buffer.alloc(2);
      request.writeUInt16BE(0x0f02, 0);
      const result = world.handleWorldInner({ connectionId: 1, accountId: 'test', inner: request });
      const actions = result.responses.filter((response) => (
        readMsg32Code(response.inner) === CODE_NOTIFY_INFORMATION_CHARACTER
      ));
      assert.equal(actions.length, 1, `${label}: exactly once`);
      const codes = result.responses.map((response) => readMsg32Code(response.inner));
      assert.equal(
        codes.indexOf(CODE_NOTIFY_INFORMATION_CHARACTER),
        codes.indexOf(CODE_GRID_INIT_OK) + 1,
        `${label}: follows 0x0f03`,
      );
      const decoded = decodeNotifyInformationCharacterStream(msg32Body(actions[0].inner));
      assert.ok(decoded, `${label}: compact stream decodes`);
      assert.equal(decoded.object.readUInt32LE(0x04), 1);
      assert.equal(decoded.object.readUInt16LE(0x18c), 90);
      assert.equal(readNativePstr16(decoded.object, 0x85, 0x86), 'PANEL');
      assert.equal(readNativePstr16(decoded.object, 0xa0, 0xa2), 'TEST');
      assert.equal(decoded.object.readUInt16LE(0x85 + 0x55), 4);
      assert.equal(decoded.object.readUInt8(0x250), 1);
      assert.equal(decoded.object.readUInt16LE(0x254), 1);
      actionFrames.push(actions[0].inner);
    }
    assert.deepEqual(actionFrames[1], actionFrames[0], 'world-session env=0 bytes');
    assert.deepEqual(actionFrames[2], actionFrames[0], 'world-session env=1 bytes');
  } finally {
    if (previous == null) delete process.env.LOGH_POSTLOAD_ACTION_LIST;
    else process.env.LOGH_POSTLOAD_ACTION_LIST = previous;
  }
});

test('action-list category selects the native card seat id', () => {
  const previousCategory = process.env.LOGH_ACTION_LIST_CATEGORY;
  const previousPostload = process.env.LOGH_POSTLOAD_ACTION_LIST;
  delete process.env.LOGH_POSTLOAD_ACTION_LIST;
  try {
    process.env.LOGH_ACTION_LIST_CATEGORY = '0';
    const categoryZero = buildGridInitializeSpawnInners({ characterId: 1, unitId: 1 })
      .find((inner) => readMsg32Code(inner) === CODE_NOTIFY_INFORMATION_CHARACTER);
    assert.ok(categoryZero);
    const zeroDecoded = decodeNotifyInformationCharacterStream(msg32Body(categoryZero));
    assert.ok(zeroDecoded);
    assert.equal(zeroDecoded.object.readUInt16LE(0x254), 0x0000);


    process.env.LOGH_ACTION_LIST_CATEGORY = '2';
    const categoryTwo = buildGridInitializeSpawnInners({ characterId: 1, unitId: 1 })
      .find((inner) => readMsg32Code(inner) === CODE_NOTIFY_INFORMATION_CHARACTER);
    assert.ok(categoryTwo);
    const twoDecoded = decodeNotifyInformationCharacterStream(msg32Body(categoryTwo));
    assert.ok(twoDecoded);
    assert.equal(twoDecoded.object.readUInt16LE(0x254), 2);
    assert.equal(twoDecoded.object.readUInt32LE(0x258), 0);

  } finally {
    if (previousPostload == null) delete process.env.LOGH_POSTLOAD_ACTION_LIST;
    else process.env.LOGH_POSTLOAD_ACTION_LIST = previousPostload;
    if (previousCategory == null) delete process.env.LOGH_ACTION_LIST_CATEGORY;
    else process.env.LOGH_ACTION_LIST_CATEGORY = previousCategory;
  }
});
