import { test } from "node:test";
import assert from "node:assert/strict";

import type { Principal } from "../lib/data/types";
import * as data from "../lib/data/secure-access";
import { AuthorizationError } from "../lib/data/secure-access";
import { orchestrate } from "../lib/llm/orchestrator";
import { buildReportHtml } from "../lib/report";

const ana: Principal = { userId: "U-ana", name: "Ana Souza", email: "ana@assessoria.com", role: "advisor", advisorId: "A-001" };
const bruno: Principal = { userId: "U-bruno", name: "Bruno Lima", email: "bruno@assessoria.com", role: "advisor", advisorId: "A-002" };
const gestora: Principal = { userId: "U-g", name: "Gabriela Mendes", email: "gestor@assessoria.com", role: "manager", advisorId: null };

// --- Suitability adherence ---------------------------------------------------

test("suitability adherence: valid ratio, AUM split reconciles, misaligned > 0", () => {
  const s = data.suitabilityAdherence(ana);
  assert.ok(s.pctAdherent >= 0 && s.pctAdherent <= 1);
  assert.equal(Math.round(s.adherentAum + s.misalignedAum), Math.round(data.totalAum(ana)));
  for (const c of s.misalignedClients) assert.ok(c.misalignedAum > 0);
});

// --- Portfolio performance ---------------------------------------------------

test("performance is monthly within scope; cumulative + benchmark are finite", () => {
  assert.equal(data.performanceByMonth(ana).length, 6);
  assert.equal(data.performanceByMonth(gestora).length, 6);
  assert.ok(Number.isFinite(data.cumulativeReturn(ana)));
  assert.ok(Number.isFinite(data.benchmarkCumulative()));
});

// --- Revenue by segment (manager-only) ---------------------------------------

test("revenue by segment is manager-only and reconciles to firm gross revenue", () => {
  assert.throws(() => data.revenueBySegment(ana), AuthorizationError);
  const rows = data.revenueBySegment(gestora);
  assert.ok(rows.length >= 1);
  const total = rows.reduce((a, r) => a + r.revenue, 0);
  assert.equal(Math.round(total), Math.round(data.commissionSummary(gestora).grossRevenueYtd));
});

// --- Client lookup (scope-aware) ---------------------------------------------

test("client lookup finds own client, null for gibberish, and never crosses scope", () => {
  const mine = data.topClients(ana, 1)[0].name;
  const found = data.findClient(ana, `resumo do cliente ${mine}`);
  assert.equal(found?.name, mine);
  assert.equal(data.findClient(ana, "resumo do cliente Zzyxwq Qwerty"), null);

  // An advisor must never resolve ANOTHER advisor's client. Because lookups only
  // ever search the caller's own book, a query for one of Bruno's clients can at
  // most return one of Ana's own clients (e.g. a shared surname) — never Bruno's.
  const anaNames = new Set(data.topClients(ana, 100).map((c) => c.name));
  const brunoOnly = data
    .topClients(bruno, 100)
    .map((c) => c.name)
    .find((n) => !anaNames.has(n));
  assert.ok(brunoOnly, "expected a client exclusive to Bruno's book");
  const crossed = data.findClient(ana, brunoOnly!);
  assert.ok(
    crossed === null || anaNames.has(crossed.name),
    "advisor lookup must never return another advisor's client"
  );
});

// --- PDF report builder ------------------------------------------------------

test("PDF report HTML is well-formed and includes scope + a card value", async () => {
  const res = await orchestrate(ana, "Resumo da minha carteira");
  const html = buildReportHtml(res, { scopeLabel: res.meta.scope, userName: "Ana Souza", userQuestion: "Resumo da minha carteira" });
  assert.ok(html.startsWith("<!doctype html>"));
  assert.ok(html.includes("Advisor Copilot"));
  assert.ok(html.includes(res.meta.scope));
  assert.ok(html.includes("R$"));
});

// --- Orchestrator routing for the new intents --------------------------------

test("new advisor intents route correctly", async () => {
  assert.equal((await orchestrate(ana, "rentabilidade da minha carteira")).meta.tool, "portfolio_performance");
  assert.equal((await orchestrate(ana, "aderência de suitability")).meta.tool, "suitability_adherence");
});

test("revenue_by_segment works for manager, denied for advisor", async () => {
  assert.equal((await orchestrate(gestora, "receita por segmento de cliente")).meta.tool, "revenue_by_segment");
  // "receita" is a restricted intent for an advisor → hard deny.
  assert.equal((await orchestrate(ana, "receita por segmento")).meta.tool, "access_denied");
});

test("client_detail routes and returns the client's own data end-to-end", async () => {
  const mine = data.topClients(ana, 1)[0].name;
  const res = await orchestrate(ana, `resumo do cliente ${mine}`);
  assert.equal(res.meta.tool, "client_detail");
  assert.ok(JSON.stringify(res.cards).includes(mine));
});

// --- Goals / metas -----------------------------------------------------------

test("goals: NNM target for both roles, receita target only for managers", () => {
  const a = data.goalsFor(ana);
  assert.ok(a.nnm.target > 0);
  assert.equal(a.receita, undefined);
  const g = data.goalsFor(gestora);
  assert.ok(g.nnm.target > 0);
  assert.ok(g.receita && g.receita.target > 0);
});

test("goals_tracker routes and emits a KPI carrying a goal", async () => {
  const res = await orchestrate(ana, "minhas metas e atingimento");
  assert.equal(res.meta.tool, "goals_tracker");
  const kpi = res.cards.find((c) => c.type === "kpi");
  assert.ok(kpi && "goal" in kpi && kpi.goal);
});

// --- Phase 2: NNM tree, churn, NPS, custody buckets, ROA ---------------------

test("NNM breakdown reconciles exactly with net new money (advisor + manager)", () => {
  for (const p of [ana, gestora]) {
    const b = data.nnmBreakdown(p);
    assert.equal(Math.round(b.nnmTotal), Math.round(data.netNewMoneyTotal(p)));
    assert.equal(Math.round(b.captacao + b.churn), Math.round(b.nnmTotal));
  }
});

test("nnm_breakdown routes and emits a tree card", async () => {
  const res = await orchestrate(ana, "NNM consolidado, de onde vem a captação");
  assert.equal(res.meta.tool, "nnm_breakdown");
  const tree = res.cards.find((c) => c.type === "tree");
  assert.ok(tree && "root" in tree && Array.isArray(tree.root.children));
});

test("custody buckets partition the whole book (clients + AUM reconcile)", () => {
  const rows = data.custodyBuckets(ana);
  const clients = rows.reduce((a, r) => a + r.clients, 0);
  const aum = rows.reduce((a, r) => a + r.aum, 0);
  assert.equal(clients, data.clientCount(ana));
  assert.equal(Math.round(aum), Math.round(data.totalAum(ana)));
});

test("NPS overview yields a bounded score and response rate", () => {
  const n = data.npsOverview(gestora);
  assert.ok(n.score >= -100 && n.score <= 100);
  assert.ok(n.responseRate >= 0 && n.responseRate <= 1);
  assert.equal(n.responses, n.promoters + n.neutrals + n.detractors);
});

test("ROA is manager-only and routes for the manager", async () => {
  assert.throws(() => data.roaOverview(ana), AuthorizationError);
  const res = await orchestrate(gestora, "ROA da mesa");
  assert.equal(res.meta.tool, "roa_overview");
});
