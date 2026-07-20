import { test } from "node:test";
import { strict as assert } from "node:assert";
import { resolve, dirname } from "node:path";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

const { buildA05Axis } = await import("../../tools/causal-ledger/axes/a05-authority-domain.mjs");
const { stableStringify } = await import("../../tools/causal-ledger/index.mjs");

test("A05 axis: bootstrap and append", async () => {
  const { ledger } = await buildA05Axis(REPO_ROOT);
  assert(ledger.schemaVersion === "1.0.0");
  assert(ledger.sourceManifestHash);
  const a05Nodes = ledger.nodes.filter((n) => n.axis === "A05");
  assert(a05Nodes.length > 0);
});

test("A05 axis: validateLedger passes", async () => {
  const { validateLedger, SOURCE_MANIFEST } = await import("../../tools/causal-ledger/index.mjs");
  const { ledger } = await buildA05Axis(REPO_ROOT);
  assert.doesNotThrow(() => validateLedger(ledger, { manifest: SOURCE_MANIFEST }));
});

test("A05 axis: determinism check", async () => {
  const { ledger: ledger1 } = await buildA05Axis(REPO_ROOT);
  const { ledger: ledger2 } = await buildA05Axis(REPO_ROOT);
  assert.strictEqual(stableStringify(ledger1), stableStringify(ledger2));
});

test("A05 axis: no Date/random", async () => {
  const path = resolve(REPO_ROOT, "tools/causal-ledger/axes/a05-authority-domain.mjs");
  const src = await readFile(path, "utf-8");
  assert(!src.match(/new Date\(/));
  assert(!src.match(/Date\.now\(/));
  assert(!src.match(/Math\.random\(/));
});

test("A05 axis: rejection edges must not mutate", async () => {
  const { ledger } = await buildA05Axis(REPO_ROOT);
  const rejectEdges = ledger.edges.filter((e) => e.verb === "rejects");
  for (const edge of rejectEdges) {
    const writeSet = edge.stateChange?.writeSet || [];
    assert(!writeSet.some((s) => s?.includes("mutate")));
  }
});

test("A05 axis: command nodes exist", async () => {
  const { ledger } = await buildA05Axis(REPO_ROOT);
  const cmdNodes = ledger.nodes.filter((n) => n.axis === "A05" && n.surface === "command");
  assert(cmdNodes.length >= 9);
});

test("A05 axis: event nodes exist", async () => {
  const { ledger } = await buildA05Axis(REPO_ROOT);
  const evtNodes = ledger.nodes.filter((n) => n.axis === "A05" && n.surface === "event");
  assert(evtNodes.length > 0);
});
