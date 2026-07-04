// G058: 서버 권위 캐릭터 스토어.
// 규칙 근거: 매뉴얼 p8 서버당 단일 진영(session-offline-rules.json),
// face G군만 플레이어 생성 허용(logh7-face-portrait-catalog: G-group-player).
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SERVER_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const PORTRAIT_EXPORT_MANIFEST = join(
	SERVER_ROOT, "content", "generated", "logh7-portrait-full-export-manifest.json",
);
const PLAYER_FACE_ARCHIVES = new Set(["gaf", "gam", "gef", "gem"]);
const NAME_MAX = 32;

// 전수출 manifest에서 실존 디코드된 G군 (archive, slot) 쌍만 유효 얼굴로 채택
export function loadValidPlayerFaces(manifestPath = PORTRAIT_EXPORT_MANIFEST) {
	const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
	const faces = new Set();
	for (const entry of manifest.outputs ?? []) {
		const archive = String(entry.archive ?? "").replace(/\.tcf$/, "");
		if (PLAYER_FACE_ARCHIVES.has(archive) && Number.isInteger(entry.slot)) {
			faces.add(`${archive}:${entry.slot}`);
		}
	}
	return faces;
}

export function createCharacterStore({ serverFaction, validFaces, persistPath } = {}) {
	if (serverFaction !== "empire" && serverFaction !== "alliance") {
		throw new Error("serverFaction must be 'empire' or 'alliance' (manual p8: one faction per server)");
	}
	const faces = validFaces ?? loadValidPlayerFaces();
	const byAccount = new Map();

	// G062: JSON 파일 영속. 파손 파일은 조용히 버리지 않고 기동 실패(fail-closed).
	if (persistPath && existsSync(persistPath)) {
		const raw = JSON.parse(readFileSync(persistPath, "utf8"));
		for (const [accountId, slots] of Object.entries(raw.accounts ?? {})) {
			byAccount.set(accountId, slots);
		}
	}
	// ponytail: 생성 빈도가 낮아 변경 즉시 전체 쓰기; 쓰기량이 문제되면 dirty-check/write-behind로 승격
	const persist = () => {
		if (!persistPath) {
			return;
		}
		const tmp = `${persistPath}.tmp`;
		writeFileSync(tmp, JSON.stringify({ accounts: Object.fromEntries(byAccount) }, null, 1), "utf8");
		renameSync(tmp, persistPath);
	};

	return {
		createCharacter({ accountId, name, faction, faceId } = {}) {
			if (typeof name !== "string" || name.length === 0 || name.length > NAME_MAX) {
				return { ok: false, reason: "invalid-name" };
			}
			if (faction !== serverFaction) {
				return { ok: false, reason: "faction-not-served" };
			}
			if (!faces.has(faceId)) {
				return { ok: false, reason: "invalid-face" };
			}
			const slots = byAccount.get(accountId) ?? [];
			if (slots.some((s) => s.name === name)) {
				return { ok: false, reason: "duplicate-name" };
			}
			const character = {
				characterId: randomUUID(),
				name,
				faction,
				faceId,
				occupied: true,
			};
			slots.push(character);
			byAccount.set(accountId, slots);
			persist();
			return { ok: true, character };
		},
		listCharacters(accountId) {
			return (byAccount.get(accountId) ?? []).slice();
		},
	};
}
