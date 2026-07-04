import { createHash } from "node:crypto";
import { deflateSync } from "node:zlib";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SERVER_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const WORKSPACE_ROOT = join(SERVER_ROOT, "..");
const BLOCKED = "blocked-until-cross-source-confirmed";
const PROVENANCE = "original-decoded(R0-derived)";
const DEFAULT_MANIFEST = join(
	SERVER_ROOT,
	"content",
	"generated",
	"logh7-original-ui-image-manifest.json",
);

// 첫 슬라이스 수출 목록. 원본 설치 자산 TGA -> Unity StreamingAssets PNG.
// 추가 확장은 이 배열에 항목을 더하면 된다.
const EXPORT_LIST = [
	{
		id: "gamemenu/title",
		source: ".omo/work/logh7-installed/data/image/gamemenu/title.tga",
		output: "client-unity/Assets/StreamingAssets/logh7/original/gamemenu/title.png",
	},
	{
		// 로비 기본 배경(P0: G7MTClient.exe 0x3721bc 하드코딩 기본값, 룸 전환은 bg%03d.jpg)
		id: "spot/bg005",
		mode: "copy",
		source: ".omo/work/logh7-installed/data/image/spot/bg005.jpg",
		output: "client-unity/Assets/StreamingAssets/logh7/original/spot/bg005.jpg",
	},
];

// TGA 파서: 타입 1(컬러맵 8bit) + 타입 2(트루컬러 24/32bit), 비압축만 지원.
// 그 외 타입/필드는 fail-closed(throw 아님, { ok:false, reason } 반환).
export function decodeTga(buffer) {
	if (!Buffer.isBuffer(buffer) || buffer.length < 18) {
		return { ok: false, reason: "tga-header-too-short" };
	}

	const idLength = buffer.readUInt8(0);
	const colorMapType = buffer.readUInt8(1);
	const imageType = buffer.readUInt8(2);
	const colorMapFirstEntry = buffer.readUInt16LE(3);
	const colorMapLength = buffer.readUInt16LE(5);
	const colorMapEntrySize = buffer.readUInt8(7);
	const width = buffer.readUInt16LE(12);
	const height = buffer.readUInt16LE(14);
	const bpp = buffer.readUInt8(16);
	const descriptor = buffer.readUInt8(17);

	// descriptor bit5(0x20)=1 이면 top-left origin, 아니면 bottom-left origin.
	const topOrigin = (descriptor & 0x20) !== 0;

	if (imageType !== 1 && imageType !== 2) {
		// RLE(9/10/11), 흑백(3) 등은 미지원 -> fail-closed
		return { ok: false, reason: `unsupported-image-type-${imageType}` };
	}
	if (width <= 0 || height <= 0) {
		return { ok: false, reason: "invalid-dimensions" };
	}

	const header = {
		width,
		height,
		type: imageType,
		bpp,
		colorMapType,
		descriptor,
		topOrigin,
	};

	const pixelCount = width * height;
	let offset = 18 + idLength;

	if (imageType === 1) {
		// 컬러맵(인덱스) 이미지: 8bit 인덱스만 지원, 팔레트는 24bit(BGR)만.
		if (colorMapType !== 1) return { ok: false, reason: "colormap-type-missing" };
		if (bpp !== 8) return { ok: false, reason: `unsupported-indexed-bpp-${bpp}` };
		if (colorMapEntrySize !== 24) {
			return { ok: false, reason: `unsupported-colormap-entry-${colorMapEntrySize}` };
		}
		const paletteBytes = colorMapLength * 3;
		if (buffer.length < offset + paletteBytes + pixelCount) {
			return { ok: false, reason: "tga-body-truncated" };
		}
		const palette = buffer.subarray(offset, offset + paletteBytes);
		offset += paletteBytes;

		const channels = 3;
		const pixels = Buffer.allocUnsafe(pixelCount * channels);
		for (let i = 0; i < pixelCount; i += 1) {
			const index = buffer.readUInt8(offset + i) - colorMapFirstEntry;
			const p = index * 3;
			// 팔레트는 BGR 순서 -> RGB 로 변환
			pixels[i * 3] = palette[p + 2];
			pixels[i * 3 + 1] = palette[p + 1];
			pixels[i * 3 + 2] = palette[p];
		}
		return {
			ok: true,
			header,
			width,
			height,
			channels,
			pixels: normalizeOrigin(pixels, width, height, channels, topOrigin),
		};
	}

	// imageType === 2: 트루컬러 비압축, 24bit(BGR) 또는 32bit(BGRA)만.
	if (bpp !== 24 && bpp !== 32) {
		return { ok: false, reason: `unsupported-truecolor-bpp-${bpp}` };
	}
	// 컬러맵 필드가 있으면 건너뛴다(타입2에서는 보통 0).
	offset += colorMapType === 1 ? colorMapLength * Math.ceil(colorMapEntrySize / 8) : 0;

	const srcChannels = bpp / 8;
	if (buffer.length < offset + pixelCount * srcChannels) {
		return { ok: false, reason: "tga-body-truncated" };
	}
	const channels = srcChannels === 4 ? 4 : 3;
	const pixels = Buffer.allocUnsafe(pixelCount * channels);
	for (let i = 0; i < pixelCount; i += 1) {
		const s = offset + i * srcChannels;
		// TGA 픽셀은 BGR(A) 순서 -> RGB(A) 로 변환
		pixels[i * channels] = buffer[s + 2];
		pixels[i * channels + 1] = buffer[s + 1];
		pixels[i * channels + 2] = buffer[s];
		if (channels === 4) pixels[i * channels + 3] = buffer[s + 3];
	}
	return {
		ok: true,
		header,
		width,
		height,
		channels,
		pixels: normalizeOrigin(pixels, width, height, channels, topOrigin),
	};
}

// bottom-left origin 이면 행 순서를 뒤집어 top-left 기준으로 정규화한다.
function normalizeOrigin(pixels, width, height, channels, topOrigin) {
	if (topOrigin) return pixels;
	const stride = width * channels;
	const flipped = Buffer.allocUnsafe(pixels.length);
	for (let row = 0; row < height; row += 1) {
		const src = row * stride;
		const dst = (height - 1 - row) * stride;
		pixels.copy(flipped, dst, src, src + stride);
	}
	return flipped;
}

// 최소 PNG 인코더: 8bit RGB/RGBA, 필터 0, node:zlib deflateSync.
// 타임스탬프 등 메타 없음 -> 결정론적 출력.
export function encodePng({ width, height, channels, pixels }) {
	const colorType = channels === 4 ? 6 : 2;
	const stride = width * channels;

	// 각 스캔라인 앞에 필터 바이트 0 을 붙인다.
	const raw = Buffer.allocUnsafe(height * (stride + 1));
	for (let row = 0; row < height; row += 1) {
		raw[row * (stride + 1)] = 0;
		pixels.copy(raw, row * (stride + 1) + 1, row * stride, row * stride + stride);
	}

	const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
	const ihdr = Buffer.allocUnsafe(13);
	ihdr.writeUInt32BE(width, 0);
	ihdr.writeUInt32BE(height, 4);
	ihdr.writeUInt8(8, 8); // bit depth
	ihdr.writeUInt8(colorType, 9);
	ihdr.writeUInt8(0, 10); // compression
	ihdr.writeUInt8(0, 11); // filter method
	ihdr.writeUInt8(0, 12); // interlace

	const idat = deflateSync(raw, { level: 9 });

	return Buffer.concat([
		signature,
		chunk("IHDR", ihdr),
		chunk("IDAT", idat),
		chunk("IEND", Buffer.alloc(0)),
	]);
}

function chunk(type, data) {
	const typeBuf = Buffer.from(type, "ascii");
	const length = Buffer.allocUnsafe(4);
	length.writeUInt32BE(data.length, 0);
	const crcBuf = Buffer.allocUnsafe(4);
	crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
	return Buffer.concat([length, typeBuf, data, crcBuf]);
}

const CRC_TABLE = (() => {
	const table = new Uint32Array(256);
	for (let n = 0; n < 256; n += 1) {
		let c = n;
		for (let k = 0; k < 8; k += 1) {
			c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		}
		table[n] = c >>> 0;
	}
	return table;
})();

function crc32(buffer) {
	let crc = 0xffffffff;
	for (let i = 0; i < buffer.length; i += 1) {
		crc = CRC_TABLE[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
	}
	return (crc ^ 0xffffffff) >>> 0;
}

// TGA 버퍼를 PNG 로 변환. 실패 시 { ok:false, reason }.
export function convertTgaBufferToPng(buffer) {
	const decoded = decodeTga(buffer);
	if (!decoded.ok) return decoded;
	return { ok: true, header: decoded.header, png: encodePng(decoded) };
}

// 수출 목록을 순회하며 PNG + 매니페스트를 생성한다.
export function exportOriginalUiImages({
	workspaceRoot = WORKSPACE_ROOT,
	manifestPath = DEFAULT_MANIFEST,
	write = true,
} = {}) {
	const root = resolve(workspaceRoot);
	const items = EXPORT_LIST.map((entry) => {
		const sourceAbs = join(root, entry.source);
		if (!existsSync(sourceAbs)) {
			return {
				id: entry.id,
				sourcePath: entry.source,
				outputPath: entry.output,
				status: "failed",
				reason: "source-missing",
				canonicalPromotion: BLOCKED,
			};
		}
		const buffer = readFileSync(sourceAbs);
		const sourceSha1 = createHash("sha1").update(buffer).digest("hex");
		if (entry.mode === "copy") {
			// JPG 등 Unity 가 네이티브 로드 가능한 포맷은 바이트 그대로 복사(R0)
			// client-unity/ 는 완전 삭제됨(G070) — 실제 파일 쓰기는 하지 않고 메타데이터만 산출한다.
			return {
				id: entry.id,
				sourcePath: entry.source,
				sourceSha1,
				sourceByteSize: buffer.length,
				outputPath: entry.output,
				outputSha256: createHash("sha256").update(buffer).digest("hex"),
				status: "ok",
				provenance: "original-byte-copy(R0)",
				canonicalPromotion: BLOCKED,
			};
		}
		const result = convertTgaBufferToPng(buffer);
		if (!result.ok) {
			return {
				id: entry.id,
				sourcePath: entry.source,
				sourceSha1,
				sourceByteSize: buffer.length,
				outputPath: entry.output,
				status: "failed",
				reason: result.reason,
				canonicalPromotion: BLOCKED,
			};
		}
		// client-unity/ 는 완전 삭제됨(G070) — 실제 파일 쓰기는 하지 않고 메타데이터만 산출한다.
		return {
			id: entry.id,
			sourcePath: entry.source,
			sourceSha1,
			sourceByteSize: buffer.length,
			tga: {
				width: result.header.width,
				height: result.header.height,
				type: result.header.type,
				bpp: result.header.bpp,
			},
			outputPath: entry.output,
			outputSha256: createHash("sha256").update(result.png).digest("hex"),
			status: "ok",
			provenance: PROVENANCE,
			canonicalPromotion: BLOCKED,
		};
	});

	const manifest = {
		id: "logh7-original-ui-image-manifest",
		deterministic: true,
		provenance: PROVENANCE,
		canonicalPromotion: BLOCKED,
		summary: {
			itemCount: items.length,
			okCount: items.filter((item) => item.status === "ok").length,
			failedCount: items.filter((item) => item.status === "failed").length,
		},
		items,
	};

	if (write) {
		mkdirSync(dirname(manifestPath), { recursive: true });
		writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
	}
	return manifest;
}
