import http from "node:http";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const toolsDir = path.dirname(__filename);
const repoRoot = path.resolve(toolsDir, "..");
const reviewDir = path.join(repoRoot, ".omo", "work", "portrait-review");
const decisionsPath = path.join(reviewDir, "decisions.json");
const pagePath = path.join(toolsDir, "logh7_portrait_review.html");

const rankingFiles = [
  {
    id: "vi_help",
    label: "LOGH VI help labeled portraits",
    kind: "prior_game",
    path: ".omo/work/logh7-prior-game/vi-help-vii-ensemble-rankings.json",
  },
  {
    id: "vi_help_deep",
    label: "LOGH VI help deep vision embeddings",
    kind: "prior_game_deep",
    path: ".omo/work/logh7-prior-game/vi-help-vii-deep-rankings.json",
  },
  {
    id: "vi_labeled",
    label: "LOGH VI extracted labeled set",
    kind: "prior_game",
    path: ".omo/work/logh7-prior-game/vi-vii-ensemble-rankings.json",
  },
  {
    id: "vi_labeled_deep",
    label: "LOGH VI extracted deep vision embeddings",
    kind: "prior_game_deep",
    path: ".omo/work/logh7-prior-game/vi-vii-deep-rankings.json",
  },
  {
    id: "jp_nameplate",
    label: "Japanese screenshot nameplates",
    kind: "screenshot_nameplate",
    path: ".omo/work/logh7-japanese-screenshots/nameplate-evidence/japanese-nameplate-vii-ensemble-rankings.json",
  },
  {
    id: "jp_nameplate_deep",
    label: "Japanese screenshot nameplate deep embeddings",
    kind: "screenshot_nameplate_deep",
    path: ".omo/work/logh7-japanese-screenshots/nameplate-evidence/japanese-nameplate-vii-deep-rankings.json",
  },
  {
    id: "kr_nameplate",
    label: "Korean screenshot nameplates",
    kind: "screenshot_nameplate",
    path: ".omo/work/logh7-screenshot-evidence/nameplate-vii-ensemble-rankings.json",
  },
  {
    id: "kr_nameplate_deep",
    label: "Korean screenshot nameplate deep embeddings",
    kind: "screenshot_nameplate_deep",
    path: ".omo/work/logh7-screenshot-evidence/nameplate-vii-deep-rankings.json",
  },
];

const fusionPath = ".omo/work/portrait-review/fused-classification.json";

const manifestFiles = [
  {
    id: "vi_help_manifest",
    label: "LOGH VI help manifest",
    kind: "prior_game_manifest",
    path: ".omo/work/logh7-prior-game/vi-help-manifest.json",
  },
  {
    id: "v_gdt_manifest",
    label: "LOGH V decoded GDT screens",
    kind: "asset_manifest",
    path: ".omo/work/logh7-prior-game/v-gdt-manifest.json",
  },
  {
    id: "gineipaedia_candidates",
    label: "Gineipaedia candidate images",
    kind: "public_reference_manifest",
    path: ".omo/work/gineipaedia/extracted/candidate-image-manifest.json",
  },
];

const directEvidenceFiles = [
  {
    id: "jp_visible_nameplates",
    label: "Japanese visible nameplates",
    path: ".omo/work/logh7-japanese-screenshots/nameplate-evidence/japanese-nameplate-manifest.json",
  },
  {
    id: "kr_visible_nameplates",
    label: "Korean visible nameplates",
    path: ".omo/work/logh7-screenshot-evidence/nameplate-confirmed-manifest.json",
  },
  {
    id: "kr_full_context",
    label: "Korean full-context crops",
    path: ".omo/work/logh7-screenshot-evidence/nameplate-full-context-manifest.json",
  },
];

function parseArgs(argv) {
  const args = { host: "127.0.0.1", port: 4788 };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--host") args.host = argv[++i] ?? args.host;
    if (argv[i] === "--port") args.port = Number(argv[++i] ?? args.port);
  }
  return args;
}

function repoPath(relativePath) {
  return path.resolve(repoRoot, relativePath);
}

function resolveAllowed(rawPath) {
  const decoded = decodeURIComponent(rawPath || "");
  const resolved = path.isAbsolute(decoded) ? path.resolve(decoded) : path.resolve(repoRoot, decoded);
  if (resolved !== repoRoot && !resolved.startsWith(`${repoRoot}${path.sep}`)) {
    throw Object.assign(new Error("path outside repository is not allowed"), { statusCode: 403 });
  }
  return resolved;
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJsonIfExists(relativePath) {
  const absolutePath = repoPath(relativePath);
  if (!(await exists(absolutePath))) return null;
  return JSON.parse(await fs.readFile(absolutePath, "utf8"));
}

async function listPortraits() {
  const dir = repoPath("content/roster/portraits");
  const names = (await fs.readdir(dir)).filter((name) => name.endsWith(".png")).sort();
  return names.map((name) => {
    const slot = name.match(/\d+/)?.[0]?.padStart(4, "0") ?? name.replace(/\.png$/, "");
    return { slot, path: `content/roster/portraits/${name}` };
  });
}

async function loadRankingSource(definition) {
  const data = await readJsonIfExists(definition.path);
  if (!data) return null;
  return {
    ...definition,
    created: data._created,
    method: data._method,
    thresholds: data._thresholds,
    weights: data._weights,
    counts: data._counts,
    results: data.results ?? [],
  };
}

function addCandidate(candidatesBySlot, source, result, top, rank) {
  const slot = String(top.slot ?? "").padStart(4, "0");
  if (!/^\d{4}$/.test(slot)) return;
  if (!candidatesBySlot[slot]) candidatesBySlot[slot] = [];
  candidatesBySlot[slot].push({
    sourceId: source.id,
    sourceLabel: source.label,
    sourceKind: source.kind,
    sourceStatus: result.status,
    rank,
    reference: result.reference,
    bestScore: result.best_score,
    runnerUpScore: result.runner_up_score,
    gap: result.gap,
    match: top,
  });
}

async function loadManifests() {
  const manifests = [];
  for (const definition of manifestFiles) {
    const data = await readJsonIfExists(definition.path);
    if (!data) continue;
    manifests.push({
      ...definition,
      counts: data._counts ?? { entries: data.entries?.length ?? 0 },
      entries: data.entries ?? [],
    });
  }
  return manifests;
}

async function loadDirectEvidence() {
  const evidence = [];
  for (const definition of directEvidenceFiles) {
    const data = await readJsonIfExists(definition.path);
    if (!data) continue;
    evidence.push({
      ...definition,
      counts: data._counts ?? { entries: data.entries?.length ?? 0 },
      entries: data.entries ?? [],
    });
  }
  return evidence;
}

async function loadDecisions() {
  if (!(await exists(decisionsPath))) {
    return { updatedAt: null, decisions: {} };
  }
  return JSON.parse(await fs.readFile(decisionsPath, "utf8"));
}

async function loadFusion() {
  const data = await readJsonIfExists(fusionPath);
  if (!data) {
    return { summary: null, slots: {} };
  }
  return {
    summary: {
      created: data._created,
      method: data._method,
      counts: data._counts,
      weights: data._weights,
      sources: data.sources ?? [],
    },
    slots: data.slots ?? {},
  };
}

async function saveDecision(body) {
  const slot = String(body.slot ?? "").padStart(4, "0");
  if (!/^\d{4}$/.test(slot)) {
    throw Object.assign(new Error("slot must be a four-digit portrait id"), { statusCode: 400 });
  }
  const status = String(body.status ?? "unknown");
  const allowedStatuses = new Set(["unknown", "confirmed", "probable", "candidate", "rejected", "needs_source"]);
  if (!allowedStatuses.has(status)) {
    throw Object.assign(new Error("unknown decision status"), { statusCode: 400 });
  }
  const current = await loadDecisions();
  const record = {
    slot,
    status,
    nameJa: String(body.nameJa ?? "").trim(),
    nameKo: String(body.nameKo ?? "").trim(),
    nameEn: String(body.nameEn ?? "").trim(),
    sourceReferenceId: String(body.sourceReferenceId ?? "").trim(),
    note: String(body.note ?? "").trim(),
    updatedAt: new Date().toISOString(),
  };
  current.updatedAt = record.updatedAt;
  current.decisions[`slot:${slot}`] = record;
  await fs.mkdir(reviewDir, { recursive: true });
  await fs.writeFile(decisionsPath, `${JSON.stringify(current, null, 2)}\n`, "utf8");
  return record;
}

async function buildData() {
  const portraits = await listPortraits();
  const sources = (await Promise.all(rankingFiles.map(loadRankingSource))).filter(Boolean);
  const fusion = await loadFusion();
  const candidatesBySlot = {};
  for (const source of sources) {
    for (const result of source.results) {
      (result.top ?? []).forEach((top, index) => addCandidate(candidatesBySlot, source, result, top, index + 1));
    }
  }
  for (const candidates of Object.values(candidatesBySlot)) {
    candidates.sort((a, b) => {
      const scoreDelta = (b.match?.score ?? 0) - (a.match?.score ?? 0);
      if (scoreDelta !== 0) return scoreDelta;
      return (b.gap ?? 0) - (a.gap ?? 0);
    });
  }
  return {
    createdAt: new Date().toISOString(),
    repoRoot,
    counts: {
      portraits: portraits.length,
      rankingSources: sources.length,
      slotsWithCandidates: Object.keys(candidatesBySlot).length,
      slotsWithAiSuggestions: Object.keys(fusion.slots).length,
    },
    portraits,
    rankingSources: sources.map(({ results, ...meta }) => meta),
    candidatesBySlot,
    aiSuggestionsBySlot: fusion.slots,
    fusionSummary: fusion.summary,
    manifests: await loadManifests(),
    directEvidence: await loadDirectEvidence(),
    decisions: await loadDecisions(),
  };
}

function mimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".gif") return "image/gif";
  if (ext === ".json") return "application/json; charset=utf-8";
  if (ext === ".html" || ext === ".htm") return "text/html; charset=utf-8";
  return "application/octet-stream";
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(`${JSON.stringify(payload, null, 2)}\n`);
}

async function readBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

async function handle(request, response) {
  const url = new URL(request.url ?? "/", "http://local");
  if (request.method === "GET" && url.pathname === "/") {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
    response.end(await fs.readFile(pagePath, "utf8"));
    return;
  }
  if (request.method === "GET" && url.pathname === "/api/data") {
    sendJson(response, 200, await buildData());
    return;
  }
  if (request.method === "POST" && url.pathname === "/api/decision") {
    sendJson(response, 200, { ok: true, decision: await saveDecision(await readBody(request)) });
    return;
  }
  if (request.method === "GET" && url.pathname === "/file") {
    const filePath = resolveAllowed(url.searchParams.get("path") ?? "");
    const content = await fs.readFile(filePath);
    response.writeHead(200, { "content-type": mimeType(filePath), "cache-control": "public, max-age=30" });
    response.end(content);
    return;
  }
  sendJson(response, 404, { error: "not found" });
}

function startServer() {
  const args = parseArgs(process.argv.slice(2));
  const server = http.createServer((request, response) => {
    handle(request, response).catch((error) => {
      sendJson(response, error.statusCode || 500, { error: error.message || String(error) });
    });
  });
  server.listen(args.port, args.host, () => {
    console.log(`LOGH VII portrait review server: http://${args.host}:${args.port}/`);
  });
}

startServer();
