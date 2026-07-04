import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
	convertTgaBufferToPng,
	decodeTga,
	encodePng,
	exportOriginalUiImages,
} from "../../src/server/logh7-original-ui-image-export.mjs";

const WORKSPACE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const TITLE_TGA = join(
	WORKSPACE_ROOT,
	".omo/work/logh7-installed/data/image/gamemenu/title.tga",
);

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

test("decodes original title.tga (colormap type 1) to 640x480 and writes a valid PNG signature", (t) => {
	if (!existsSync(TITLE_TGA)) {
		t.skip("title.tga source not present");
		return;
	}
	const buffer = readFileSync(TITLE_TGA);
	const decoded = decodeTga(buffer);
	assert.equal(decoded.ok, true);
	assert.equal(decoded.width, 640);
	assert.equal(decoded.height, 480);

	const result = convertTgaBufferToPng(buffer);
	assert.equal(result.ok, true);
	assert.ok(result.png.subarray(0, 8).equals(PNG_SIGNATURE));
});

test("PNG output sha256 is deterministic across two builds", (t) => {
	if (!existsSync(TITLE_TGA)) {
		t.skip("title.tga source not present");
		return;
	}
	const buffer = readFileSync(TITLE_TGA);
	const first = convertTgaBufferToPng(buffer).png;
	const second = convertTgaBufferToPng(buffer).png;
	const hash = (png) => createHash("sha256").update(png).digest("hex");
	assert.equal(hash(first), hash(second));
});

test("manifest (write=false) records ok item with blocked promotion", (t) => {
	if (!existsSync(TITLE_TGA)) {
		t.skip("title.tga source not present");
		return;
	}
	const manifest = exportOriginalUiImages({ workspaceRoot: WORKSPACE_ROOT, write: false });
	assert.equal(manifest.canonicalPromotion, "blocked-until-cross-source-confirmed");
	const item = manifest.items.find((entry) => entry.id === "gamemenu/title");
	assert.equal(item.status, "ok");
	assert.equal(item.canonicalPromotion, "blocked-until-cross-source-confirmed");
	assert.equal(item.provenance, "original-decoded(R0-derived)");
	assert.equal(item.tga.width, 640);
	assert.equal(item.tga.height, 480);
	assert.ok(/^[a-f0-9]{64}$/.test(item.outputSha256));
	assert.ok(/^[a-f0-9]{40}$/.test(item.sourceSha1));
});

test("missing source file fails closed with reason", () => {
	const manifest = exportOriginalUiImages({
		workspaceRoot: join(WORKSPACE_ROOT, "does-not-exist-xyz"),
		write: false,
	});
	const item = manifest.items[0];
	assert.equal(item.status, "failed");
	assert.equal(item.reason, "source-missing");
	assert.equal(item.canonicalPromotion, "blocked-until-cross-source-confirmed");
});

test("RLE (type 10) TGA fails closed instead of throwing", () => {
	// 합성 헤더: imageType=10(RLE truecolor) -> 미지원
	const header = Buffer.alloc(18);
	header.writeUInt8(10, 2);
	header.writeUInt16LE(4, 12); // width
	header.writeUInt16LE(4, 14); // height
	header.writeUInt8(24, 16); // bpp
	const decoded = decodeTga(header);
	assert.equal(decoded.ok, false);
	assert.equal(decoded.reason, "unsupported-image-type-10");
});

test("truncated body fails closed", () => {
	// 타입2 24bit, 2x2 이지만 픽셀 데이터 없음
	const header = Buffer.alloc(18);
	header.writeUInt8(2, 2);
	header.writeUInt16LE(2, 12);
	header.writeUInt16LE(2, 14);
	header.writeUInt8(24, 16);
	const decoded = decodeTga(header);
	assert.equal(decoded.ok, false);
	assert.equal(decoded.reason, "tga-body-truncated");
});

test("decodes synthetic type-2 24bit truecolor with BGR->RGB and origin flip", () => {
	// 2x2 트루컬러(24bit), bottom-left origin(descriptor 0x00).
	// TGA 는 BGR 순서로 저장 -> RGB 로 변환 + 행 뒤집기 검증.
	const header = Buffer.alloc(18);
	header.writeUInt8(2, 2); // imageType truecolor
	header.writeUInt16LE(2, 12);
	header.writeUInt16LE(2, 14);
	header.writeUInt8(24, 16);
	// 하단 행(먼저 저장): 빨강(BGR=00 00 FF), 초록(BGR=00 FF 00)
	// 상단 행(다음 저장): 파랑(BGR=FF 00 00), 흰색(BGR=FF FF FF)
	const body = Buffer.from([
		0x00, 0x00, 0xff, 0x00, 0xff, 0x00,
		0xff, 0x00, 0x00, 0xff, 0xff, 0xff,
	]);
	const decoded = decodeTga(Buffer.concat([header, body]));
	assert.equal(decoded.ok, true);
	assert.equal(decoded.channels, 3);
	// top-left 정규화 후 첫 행 = 원본 상단 행 = 파랑, 흰색
	assert.deepEqual([...decoded.pixels.subarray(0, 6)], [0, 0, 255, 255, 255, 255]);
	// 둘째 행 = 원본 하단 행 = 빨강, 초록
	assert.deepEqual([...decoded.pixels.subarray(6, 12)], [255, 0, 0, 0, 255, 0]);
});

test("encodePng round-trips dimensions in IHDR", () => {
	// 2x1 RGB 픽셀
	const png = encodePng({
		width: 2,
		height: 1,
		channels: 3,
		pixels: Buffer.from([255, 0, 0, 0, 255, 0]),
	});
	assert.ok(png.subarray(0, 8).equals(PNG_SIGNATURE));
	// IHDR width/height (chunk 시작: 8 sig + 4 length + 4 type = offset 16)
	assert.equal(png.readUInt32BE(16), 2);
	assert.equal(png.readUInt32BE(20), 1);
	assert.equal(png.readUInt8(25), 2); // color type RGB
});
