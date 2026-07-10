import { test } from "node:test";
import assert from "node:assert/strict";

import type { Principal } from "../lib/data/types";
import * as data from "../lib/data/secure-access";
import { orchestrate } from "../lib/llm/orchestrator";

const ana: Principal = { userId: "U-ana", name: "Ana Souza", email: "ana@assessoria.com", role: "advisor", advisorId: "A-001" };
const bruno: Principal = { userId: "U-bruno", name: "Bruno Lima", email: "bruno@assessoria.com", role: "advisor", advisorId: "A-002" };
const gestora: Principal = { userId: "U-g", name: "Gabriela Mendes", email: "gestor@assessoria.com", role: "manager", advisorId: null };

// --- Scoping -------------------------------------------------------------------

test("funnel is advisor-scoped: manager totals equal the sum of advisor totals", () => {
  const advisors: Principal[] = [
    ana,
    bruno,
    { userId: "U-carla", name: "Carla Dias", email: "carla@assessoria.com", role: "advisor", advisorId: "A-003" },
    { userId: "U-diego", name: "Diego Rocha", email: "diego@assessoria.com", role: "advisor", advisorId: "A-004" },
  ];
  const sum = advisors.reduce((acc, p) => acc + data.meetingsOverview(p).r1Agendadas, 0);
  assert.equal(sum, data.meetingsOverview(gestora).r1Agendadas);
  assert.ok(data.meetingsOverview(ana).r1Agendadas < data.meetingsOverview(gestora).r1Agendadas);
});

// --- Internal consistency --------------------------------------------------------

test("meetings: no-shows = agendadas - realizadas, per stage and per month", () => {
  const m = data.meetingsOverview(gestora);
  assert.equal(m.noShowR1, m.r1Agendadas - m.r1Realizadas);
  assert.equal(m.noShowR2, m.r2Agendadas - m.r2Realizadas);
  for (const row of m.monthly) {
    assert.equal(row.noShows, row.agendadas - row.realizadas);
  }
});

test("funnel conversion is monotonic (R1 >= R2 >= contas) with sane rates", () => {
  const f = data.funnelConversion(gestora);
  assert.ok(f.r1Realizadas >= f.r2Realizadas);
  assert.ok(f.contasAbertas >= 1);
  for (const rate of [f.convR1R2, f.convR2Conta, f.convTotal]) {
    assert.ok(rate >= 0 && rate <= 1);
  }
  assert.ok(f.melhorCaso <= f.tempoMedioAbertura && f.tempoMedioAbertura <= f.piorCaso);
  // naoAbriramConta counts R2-realizada leads without an account DIRECTLY —
  // accounts recovered via FUP (no R2) must not distort it via subtraction.
  assert.ok(f.naoAbriramConta <= f.r2Realizadas);
  assert.ok(f.naoAbriramConta >= f.r2Realizadas - f.contasAbertas);
});

test("FUP: convertidos + sem retorno = realizados; recuperados <= convertidos", () => {
  const f = data.fupOverview(gestora);
  assert.equal(f.convertidos + f.semRetorno, f.realizados);
  assert.ok(f.recuperadosR1 + f.recuperadosR2 <= f.convertidos);
  assert.ok(f.taxaConversao >= 0 && f.taxaConversao <= 1);
});

test("lead origins: shares sum to 1 and every origin has leads", () => {
  const rows = data.leadOrigins(gestora);
  const share = rows.reduce((a, r) => a + r.share, 0);
  assert.ok(Math.abs(share - 1) < 1e-9);
  for (const r of rows) assert.ok(r.leads > 0);
});

test("pipe & forecast: forecast = raw pipe x probability, all non-negative", () => {
  const p = data.pipeForecast(gestora);
  assert.ok(p.pipeFrio >= 0 && p.forecast >= 0 && p.pipeQuente >= 0);
  assert.ok(p.probConversao >= 0 && p.probConversao <= 1);
  assert.ok(p.leadsR1 > 0);
  // With R2 history present, the probability must be the REAL conversion rate —
  // a genuine 0% must never be silently replaced by the 50% prior.
  const f = data.funnelConversion(gestora);
  assert.ok(f.r2Realizadas > 0);
  assert.equal(p.probConversao, f.convR2Conta);
});

// --- Routing + combo card end-to-end ---------------------------------------------

test("meetings_overview routes and emits a combo card with aligned series", async () => {
  const res = await orchestrate(gestora, "Reuniões agendadas vs realizadas");
  assert.equal(res.meta.tool, "meetings_overview");
  const combo = res.cards.find((c) => c.type === "combo");
  assert.ok(combo && combo.type === "combo");
  for (const b of combo.bars) assert.equal(b.values.length, combo.categories.length);
  if (combo.line) assert.equal(combo.line.values.length, combo.categories.length);
});

test("remaining funnel intents route to their tools", async () => {
  assert.equal((await orchestrate(ana, "conversão do funil de captação")).meta.tool, "funnel_conversion");
  assert.equal((await orchestrate(ana, "meus FUPs e régua de contato")).meta.tool, "fup_overview");
  assert.equal((await orchestrate(ana, "meu pipe e forecast")).meta.tool, "pipe_forecast");
  assert.equal((await orchestrate(gestora, "origem dos leads")).meta.tool, "lead_origins");
});
