// G054: 세션 서비스 HTTP/JSON 배선 (Unity 클라이언트 전송 계약).
// GET /api/boot  -> StreamingAssets 수출 요약(무결성 카운트/승격 차단 상태)
// POST /api/login {accountId,password} -> {ok,token,accountId} | {ok:false,reason}
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SERVER_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const EXPORT_MANIFEST = join(
	SERVER_ROOT, "content", "generated", "logh7-unity-streamingassets-export.json",
);

export function createSessionHttpServer({ sessionService, characterStore = null, exportManifestPath = EXPORT_MANIFEST }) {
	return createServer((req, res) => {
		const send = (status, body) => {
			res.writeHead(status, { "content-type": "application/json" });
			res.end(JSON.stringify(body));
		};
		if (req.method === "GET" && req.url === "/api/boot") {
			try {
				const manifest = JSON.parse(readFileSync(exportManifestPath, "utf8"));
				return send(200, {
					ok: true,
					fileCount: manifest.summary?.fileCount ?? 0,
					canonicalPromotion: manifest.canonicalPromotion,
				});
			} catch {
				return send(503, { ok: false, reason: "export-manifest-unavailable" });
			}
		}
		const resolveBearer = () => {
			const auth = req.headers.authorization ?? "";
			const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
			return sessionService.resolveSession(token);
		};
		if (req.method === "GET" && req.url === "/api/lobby") {
			// G057: 유효 세션 토큰 필수. 슬롯은 캐릭터 스토어(G058)가 권위.
			const session = resolveBearer();
			if (!session) {
				return send(401, { ok: false, reason: "invalid-session" });
			}
			const characterSlots = characterStore ? characterStore.listCharacters(session.accountId) : [];
			return send(200, { ok: true, accountId: session.accountId, characterSlots });
		}
		if (req.method === "POST" && req.url === "/api/characters") {
			// G058: 서버 권위 캐릭터 생성 (진영/얼굴/이름 검증은 스토어 규칙)
			const session = resolveBearer();
			if (!session) {
				return send(401, { ok: false, reason: "invalid-session" });
			}
			if (!characterStore) {
				return send(503, { ok: false, reason: "character-store-unavailable" });
			}
			let raw = "";
			req.on("data", (chunk) => {
				raw += chunk;
				if (raw.length > 4096) {
					req.destroy();
				}
			});
			req.on("end", () => {
				try {
					const { name, faction, faceId } = JSON.parse(raw);
					const result = characterStore.createCharacter({
						accountId: session.accountId, name, faction, faceId,
					});
					send(result.ok ? 200 : 422, result);
				} catch {
					send(400, { ok: false, reason: "malformed-request" });
				}
			});
			return undefined;
		}
		if (req.method === "GET" && req.url === "/api/commands") {
			// G064: 전략 커맨드 카탈로그 서빙(81커맨드, 가변 CP는 unresolved 정직 유지)
			const session = resolveBearer();
			if (!session) {
				return send(401, { ok: false, reason: "invalid-session" });
			}
			try {
				const catalog = JSON.parse(readFileSync(
					join(SERVER_ROOT, "content", "generated", "logh7-strategy-command-catalog.json"), "utf8"));
				return send(200, {
					ok: true,
					commandCount: catalog.commandCount,
					categories: catalog.categories,
					commands: catalog.commands,
				});
			} catch {
				return send(503, { ok: false, reason: "command-catalog-unavailable" });
			}
		}
		if (req.method === "POST" && req.url === "/api/world/enter") {
			// G060: 본인 소유 캐릭터로만 월드 진입. 갤럭시는 suspect 라벨 유지(승격 아님).
			const session = resolveBearer();
			if (!session) {
				return send(401, { ok: false, reason: "invalid-session" });
			}
			if (!characterStore) {
				return send(503, { ok: false, reason: "character-store-unavailable" });
			}
			let raw = "";
			req.on("data", (chunk) => {
				raw += chunk;
				if (raw.length > 4096) {
					req.destroy();
				}
			});
			req.on("end", () => {
				try {
					const { characterId } = JSON.parse(raw);
					const character = characterStore
						.listCharacters(session.accountId)
						.find((c) => c.characterId === characterId);
					if (!character) {
						return send(422, { ok: false, reason: "character-not-owned" });
					}
					let systemCount = 0;
					try {
						const galaxy = JSON.parse(readFileSync(
							join(SERVER_ROOT, "content", "galaxy.json"), "utf8"));
						systemCount = Array.isArray(galaxy.systems) ? galaxy.systems.length : 0;
					} catch {
						systemCount = 0;
					}
					return send(200, {
						ok: true,
						worldSession: {
							characterId: character.characterId,
							faction: character.faction,
							galaxySource: "streaming-assets:generated/galaxy.json",
							galaxyStatus: "suspect-cross-check-required",
							systemCount,
						},
					});
				} catch {
					return send(400, { ok: false, reason: "malformed-request" });
				}
			});
			return undefined;
		}
		if (req.method === "POST" && req.url === "/api/login") {
			let raw = "";
			req.on("data", (chunk) => {
				raw += chunk;
				if (raw.length > 4096) {
					req.destroy(); // 과대 페이로드 차단
				}
			});
			req.on("end", () => {
				try {
					const { accountId, password } = JSON.parse(raw);
					const result = sessionService.login({ accountId, password });
					send(result.ok ? 200 : 401, result);
				} catch {
					send(400, { ok: false, reason: "malformed-request" });
				}
			});
			return undefined;
		}
		return send(404, { ok: false, reason: "not-found" });
	});
}
