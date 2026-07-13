import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import {
  applyPatchManifest,
  rollbackPatchManifest,
} from '../../tools/patch/exe-patch.mjs';

const manifestPath = fileURLToPath(
  new URL('../content/client/logh7-strategy-ui-label-patch.json', import.meta.url),
);
const constMsgGroupsPath = fileURLToPath(
  new URL('../content/extracted/constmsg-groups.json', import.meta.url),
);
const msgdatPath = fileURLToPath(new URL('../content/client/msgdat.json', import.meta.url));
const canonicalExeSha256 = '9c97de2ae426f011680992d6c8d88b25488b5f51555ce5784aeef677f334bb51';

function hash(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

test('strategy UI label manifest pins the canonical guarded byte patches', async () => {
  // Given: 전략 HUD와 확인창 라벨용 정본 패치 매니페스트
  const manifest = await readJson(manifestPath);

  // When: 대상 해시와 아홉 패치의 계약을 읽는다.
  const patchContract = manifest.patches.map((patch) => ({
    id: patch.id,
    childIndex: patch.childIndex ?? null,
    constMsgSubId: patch.constMsgSubId,
    sourceExeSha256: patch.sourceExeSha256,
    addressKind: patch.addressKind,
    offset: patch.offset,
    originalBytes: patch.originalBytes,
    patchedBytes: patch.patchedBytes,
    rollbackBytes: patch.rollbackBytes,
  }));

  // Then: 정본 EXE에만 적용되는 동일 길이 guarded 패치여야 한다.
  assert.equal(manifest.id, 'logh7-strategy-ui-label-patch');
  assert.equal(
    manifest.purpose,
    '전략 HUD 탭의 실제 표시 문구와 확인창 라벨의 잘못된 ConstMsg 참조를 되돌릴 수 있게 교정한다.',
  );
  assert.deepEqual(manifest.targetExe, {
    name: 'g7mtclient.exe',
    sha256: canonicalExeSha256,
    imageBase: 4194304,
  });
  assert.equal(
    manifest.expectedPatchedSha256,
    'e62a8a30dd512cb588fe8ebaa874e24cd3536a99830b40e0a12178ab75c33308',
  );
  const expectedPatches = [
    ['strategy-hud-right-tab-member-list-label', 8, null, 0x0fcdb5, '6a65b900742102e84f520200', '83c404b890525d0090909090'],
    ['strategy-hud-left-tab-label-group', 9, 3, 0x0fce7f, '6a65b900742102e885510200', '6a60b900742102e885510200'],
    ['common-dialog-confirm-label-group', null, 0, 0x16f304, '6a67b900742102e8002dfbff', '6a62b900742102e8002dfbff'],
    ['common-dialog-cancel-label-group', null, 1, 0x16f39a, '6a67b90074210289442430e8662cfbff', '6a62b90074210289442430e8662cfbff'],
    ['strategy-command-ui-confirm-label-group', null, 0, 0x1786be, '6a67b900742102e84699faff', '6a62b900742102e84699faff'],
    ['strategy-command-ui-cancel-label-group', null, 1, 0x17875c, '6a67b900742102e8a898faff', '6a62b900742102e8a898faff'],
    ['strategy-command-ui-remaining-count-label-group', null, 2, 0x1787fb, '6a67b900742102e80998faff', '6a62b900742102e80998faff'],
    ['strategy-command-ui-minimum-rank-label-group', null, 3, 0x178a23, '6a67b900742102e8e195faff', '6a62b900742102e8e195faff'],
    ['strategy-hud-member-list-label-data', null, null, 0x1d5290, 'cccccccccccccccccccccccccccccc', '83818393836f815b838a8358836700'],
  ].map(([id, childIndex, constMsgSubId, offset, originalBytes, patchedBytes]) => ({
    id,
    childIndex,
    constMsgSubId,
    sourceExeSha256: canonicalExeSha256,
    addressKind: 'offset',
    offset,
    originalBytes,
    patchedBytes,
    rollbackBytes: originalBytes,
  }));
  assert.deepEqual(patchContract, expectedPatches);
  for (const patch of manifest.patches) {
    assert.match(patch.reason, /[가-힣]/u);
  }
  assert.match(
    manifest.patches.find((patch) => patch.id === 'common-dialog-confirm-label-group').reason,
    /FUN_0056ebf0.*child 6/u,
  );
  assert.match(
    manifest.patches.find((patch) => patch.id === 'common-dialog-cancel-label-group').reason,
    /FUN_0056ebf0.*child 7/u,
  );
  for (const patch of manifest.patches.filter((entry) => entry.id.startsWith('strategy-command-ui-'))) {
    assert.match(patch.reason, /FUN_005780f0/u);
  }
});

test('strategy HUD tab labels match the official visible labels and click handlers', async () => {
  // Given: EXE 소비처를 기준으로 복원한 ConstMsg 그룹과 원문 레코드
  const [{ groups }, msgdat] = await Promise.all([
    readJson(constMsgGroupsPath),
    readJson(msgdatPath),
  ]);
  const records = msgdat.files['constmsg.dat'].records;
  const textAt = (group, subId) => {
    const { baseId } = groups.find((entry) => entry.group === group);
    return records.find((record) => record.id === baseId + subId).text;
  };

  // When: 전략 HUD 좌우 탭 패치와 전용 표시 문자열을 읽는다.
  const manifest = await readJson(manifestPath);
  const leftTab = manifest.patches.find((patch) => patch.id === 'strategy-hud-left-tab-label-group');
  const rightTab = manifest.patches.find((patch) => patch.id === 'strategy-hud-right-tab-member-list-label');
  const memberListData = manifest.patches.find((patch) => patch.id === 'strategy-hud-member-list-label-data');
  const memberListBytes = Buffer.from(memberListData.patchedBytes, 'hex');

  // Then: 매뉴얼 화면의 표시 문구와 정적 핸들러 mode가 각각 일치한다.
  assert.deepEqual(
    {
      childIndex: leftTab.childIndex,
      eventCode: leftTab.eventCode,
      targetHudMode: leftTab.targetHudMode,
      visibleText: leftTab.visibleText,
    },
    { childIndex: 9, eventCode: 0xa4, targetHudMode: 2, visibleText: '職務権限カード' },
  );
  assert.deepEqual(
    {
      childIndex: rightTab.childIndex,
      eventCode: rightTab.eventCode,
      literalVa: rightTab.literalVa,
      targetHudMode: rightTab.targetHudMode,
      visibleText: rightTab.visibleText,
    },
    {
      childIndex: 8,
      eventCode: 0xa5,
      literalVa: 0x005d5290,
      targetHudMode: 6,
      visibleText: 'メンバーリスト',
    },
  );
  assert.equal(memberListData.literalForPatch, rightTab.id);
  assert.equal(memberListBytes.at(-1), 0);
  assert.equal(
    new TextDecoder('shift_jis', { fatal: true }).decode(memberListBytes.subarray(0, -1)),
    'メンバーリスト',
  );

  // 기능 설명용 ConstMsg와 실제 버튼 표시는 구분한다.
  assert.equal(textAt(0x60, 2), '同スポットキャラクター');
  assert.equal(textAt(0x60, 3), '職務権限カード');
  assert.equal(textAt(0x65, 2), 'サウンド設定');
  assert.equal(textAt(0x65, 3), 'ゲームを中断します。');
  assert.deepEqual(
    [0, 1, 2, 3].map((subId) => textAt(0x62, subId)),
    ['決定', '取消し', '残り枚数', '最低条件階級'],
  );
  assert.deepEqual(
    [0, 1, 2, 3].map((subId) => textAt(0x67, subId)),
    [
      'ログインに失敗しました。',
      'バージョンが違います。',
      'サーバーが混み合っています。',
      'あなたはすでにログインしています。',
    ],
  );
});

test('strategy UI label patches apply and roll back on a sparse fixture', async () => {
  // Given: 실제 EXE 없이 아홉 오프셋과 원본 바이트만 담은 희소 fixture
  const manifest = await readJson(manifestPath);
  const fixtureSize = Math.max(...manifest.patches.map(
    (patch) => patch.offset + Buffer.from(patch.originalBytes, 'hex').length,
  ));
  const fixture = Buffer.alloc(fixtureSize);
  for (const patch of manifest.patches) {
    Buffer.from(patch.originalBytes, 'hex').copy(fixture, patch.offset);
  }
  const fixtureHash = hash(fixture);
  const fixtureManifest = structuredClone(manifest);
  fixtureManifest.targetExe.sha256 = fixtureHash;
  fixtureManifest.patches = fixtureManifest.patches.map((patch) => ({
    ...patch,
    sourceExeSha256: fixtureHash,
  }));
  const dir = await mkdtemp(join(tmpdir(), 'logh7-strategy-ui-labels-'));
  const sourcePath = join(dir, 'source.exe');
  const patchedPath = join(dir, 'patched.exe');
  const restoredPath = join(dir, 'restored.exe');
  await writeFile(sourcePath, fixture);

  // When: 공용 패처로 적용한 뒤 롤백한다.
  await applyPatchManifest(fixtureManifest, sourcePath, patchedPath);
  const patched = await readFile(patchedPath);
  await rollbackPatchManifest(fixtureManifest, patchedPath, restoredPath);
  const restored = await readFile(restoredPath);

  // Then: 모든 가변 길이 패치가 적용되고 전체 fixture가 완전히 복원된다.
  for (const patch of manifest.patches) {
    const patchedBytes = Buffer.from(patch.patchedBytes, 'hex');
    assert.equal(
      patched.subarray(patch.offset, patch.offset + patchedBytes.length).toString('hex'),
      patch.patchedBytes,
    );
  }
  assert.equal(restored.toString('hex'), fixture.toString('hex'));
});
