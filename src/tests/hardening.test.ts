import { test } from "node:test";
import assert from "node:assert/strict";

import type { Principal } from "../lib/data/types";
import { verifyCredentials } from "../lib/auth/users";
import { rateLimit } from "../lib/rate-limit";
import { getTool } from "../lib/tools/registry";

const gestora: Principal = { userId: "U-g", name: "Gabriela Mendes", email: "gestor@assessoria.com", role: "manager", advisorId: null };
const ana: Principal = { userId: "U-ana", name: "Ana Souza", email: "ana@assessoria.com", role: "advisor", advisorId: "A-001" };

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
//  TOOL PARAM VALIDATION — never trust the model/tool input
// =============================================================================

test("asset_class_detail falls back to a safe class for unknown input", () => {
  const tool = getTool("asset_class_detail");
  assert.ok(tool);
  const res = tool!.run({ principal: ana }, { assetClass: "'; DROP TABLE positions; --" });
  assert.ok(JSON.stringify(res.cards).includes("Renda Fixa"));
});

test("asset_class_detail honors a valid class", () => {
  const tool = getTool("asset_class_detail");
  const res = tool!.run({ principal: ana }, { assetClass: "Fundos" });
  assert.ok(JSON.stringify(res.cards).includes("Fundos"));
});

test("top_clients clamps an out-of-range limit to [1, 20]", () => {
  const tool = getTool("top_clients");
  assert.ok(tool);
  const many = tool!.run({ principal: gestora }, { limit: 9999 });
  const table = many.cards.find((c) => c.type === "table") as { rows: unknown[] };
  assert.ok(table.rows.length <= 20, `expected <= 20 rows, got ${table.rows.length}`);

  const few = tool!.run({ principal: gestora }, { limit: -5 });
  const table2 = few.cards.find((c) => c.type === "table") as { rows: unknown[] };
  assert.ok(table2.rows.length >= 1);
});
