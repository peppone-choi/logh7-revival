// G054 세션 서버 CLI. 계정은 반드시 --accounts <json> 파일로 명시(익명 모드 없음).
// 파일 형식: [{ "accountId": "...", "passwordHash": "salt:hex" }]
// 해시 생성: node -e "import('./src/server/logh7-session-service.mjs').then(m=>console.log(m.hashPassword(process.argv[1])))" <password>
import { readFileSync } from "node:fs";

import { createCharacterStore } from "../src/server/logh7-character-store.mjs";
import { createSessionHttpServer } from "../src/server/logh7-session-http.mjs";
import { createSessionService } from "../src/server/logh7-session-service.mjs";

const args = process.argv.slice(2);
const accountsIdx = args.indexOf("--accounts");
const portIdx = args.indexOf("--port");
const factionIdx = args.indexOf("--server-faction");
if (accountsIdx < 0) {
	console.error("usage: logh7_serve_session --accounts <accounts.json> [--port 8047] [--server-faction empire|alliance]");
	process.exit(1);
}
const accounts = JSON.parse(readFileSync(args[accountsIdx + 1], "utf8"));
const port = portIdx >= 0 ? Number.parseInt(args[portIdx + 1], 10) : 8047;
// 매뉴얼 p8: 서버당 단일 진영. 기본 empire; 얼굴 검증은 실제 초상화 전수출 manifest 기반.
const serverFaction = factionIdx >= 0 ? args[factionIdx + 1] : "empire";
const charsIdx = args.indexOf("--characters-db");
// G062: 캐릭터 영속 기본 경로(레포 로컬). 파손 파일이면 기동 실패가 정답.
const persistPath = charsIdx >= 0 ? args[charsIdx + 1] : "../.omo/work/logh7-characters.json";
const server = createSessionHttpServer({
	sessionService: createSessionService({ accounts }),
	characterStore: createCharacterStore({ serverFaction, persistPath }),
});
server.listen(port, "127.0.0.1", () => {
	console.log(JSON.stringify({ listening: `http://127.0.0.1:${port}`, serverFaction, routes: ["/api/boot", "/api/login", "/api/lobby", "/api/characters"] }));
});
