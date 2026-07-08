import { test } from "node:test";
import assert from "node:assert/strict";

import type { Principal } from "../lib/data/types";
import { verifyCredentials } from "../lib/auth/users";
import { rateLimit } from "../lib/rate-limit";
import { getTool } from "../lib/tools/registry";
import { orchestrate } from "../lib/llm/orchestrator";

const gestora: Principal = { userId: "U-g", name: "Gabriela Mendes", email: "gestor@assessoria.com", role: "manager", advisorId: null };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// =============================================================================
//  AUTH — constant-time credential check
// =============================================================================

test("valid credentials authenticate with the right role", () => {
  const p = verifyCredentials("ana@assessoria.com", "assessor123");
  assert.ok(p);
  assert.equal(p?.role, "advisor");
  assert.equal(p?.advisorId, "A-001");
});

test("wrong password and unknown email are rejected", () => {
  assert.equal(verifyCredentials("ana@assessoria.com", "wrong"), null);
  assert.equal(verifyCredentials("naoexiste@assessoria.com", "assessor123"), null);
});

test("email match is case- and whitespace-insensitive", () => {
  const p = verifyCredentials("  ANA@Assessoria.com  ", "assessor123");
  assert.ok(p);
  assert.equal(p?.userId, "U-ana");
});

// =============================================================================
//  RATE LIMITING
// =============================================================================

test("rate limiter blocks past the limit and resets after the window", async () => {
  const key = `test:${Math.random()}`;
  assert.equal(rateLimit(key, 2, 60).ok, true);
  assert.equal(rateLimit(key, 2, 60).ok, true);
  const blocked = rateLimit(key, 2, 60);
  assert.equal(blocked.ok, false);
  assert.ok(blocked.retryAfterSeconds >= 1);
  await sleep(80);
  assert.equal(rateLimit(key, 2, 60).ok, true, "window should reset");
});

// =============================================================================
//  TOOL PARAM VALIDATION — the Zod schema is the single gate; never trust input
// =============================================================================

test("asset_class_detail schema coerces an unknown class to a safe default", () => {
  const tool = getTool("asset_class_detail");
  assert.ok(tool);
  const bad = tool!.params.parse({ assetClass: "'; DROP TABLE positions; --" }) as { assetClass: string };
  assert.equal(bad.assetClass, "Renda Fixa");
  const ok = tool!.params.parse({ assetClass: "Fundos" }) as { assetClass: string };
  assert.equal(ok.assetClass, "Fundos");
});

test("top_clients schema clamps limit to [1, 20], coerces strings, defaults", () => {
  const tool = getTool("top_clients");
  assert.ok(tool);
  const limit = (p: unknown) => (tool!.params.parse(p) as { limit: number }).limit;
  assert.equal(limit({ limit: 9999 }), 20);
  assert.equal(limit({ limit: -5 }), 1);
  assert.equal(limit({ limit: "7" }), 7);
  assert.equal(limit({}), 5);
});

test("orchestrator applies the param schema end-to-end (limit is clamped)", async () => {
  const res = await orchestrate(gestora, "meus 40 maiores clientes");
  assert.equal(res.meta.tool, "top_clients");
  const table = res.cards.find((c) => c.type === "table");
  assert.ok(table && "rows" in table);
  assert.ok((table as { rows: unknown[] }).rows.length <= 20);
});
