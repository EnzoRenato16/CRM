import type {
  Advisor,
  Client,
  PositionRecord,
  CashFlowRecord,
  PerformanceRecord,
  BenchmarkPoint,
  GoalRecord,
  FlowBreakdown,
  NpsRecord,
  FunnelRecord,
  LeadOrigin,
  FunnelPhase,
  AssetClass,
  Segment,
  RiskProfile,
} from "./types";
import { ASSET_CLASSES } from "./types";

// Deterministic PRNG (mulberry32) so the seeded dataset is stable across runs.
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(20260707);
const pick = <T>(arr: T[]): T => arr[Math.floor(rand() * arr.length)];
const between = (min: number, max: number) => min + rand() * (max - min);
const round = (n: number, step = 1) => Math.round(n / step) * step;

export const TEAM = "Mesa Alpha";

// Six months of history, shared by cash flows and performance.
export const MONTHS = ["2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07"];

const round4 = (n: number) => Math.round(n * 1e4) / 1e4;

export const advisors: Advisor[] = [
  { id: "A-001", name: "Ana Souza", email: "ana@assessoria.com", team: TEAM },
  { id: "A-002", name: "Bruno Lima", email: "bruno@assessoria.com", team: TEAM },
  { id: "A-003", name: "Carla Dias", email: "carla@assessoria.com", team: TEAM },
  { id: "A-004", name: "Diego Rocha", email: "diego@assessoria.com", team: TEAM },
];

const firstNames = [
  "Marcos", "Juliana", "Rafael", "Beatriz", "Fernando", "Patrícia", "Gustavo",
  "Camila", "Rodrigo", "Larissa", "Thiago", "Aline", "Vinícius", "Renata",
  "Eduardo", "Mariana", "Felipe", "Bianca", "André", "Débora", "Leonardo",
  "Priscila", "Ricardo", "Natália", "Gabriel", "Sabrina", "Henrique", "Vanessa",
];
const lastNames = [
  "Almeida", "Barbosa", "Cardoso", "Duarte", "Esteves", "Fonseca", "Gomes",
  "Henriques", "Imbassahy", "Junqueira", "Klein", "Lopes", "Moraes", "Nunes",
  "Oliveira", "Pereira", "Queiroz", "Ribeiro", "Santos", "Teixeira",
];

const segments: Segment[] = ["Varejo", "Private", "Corporate"];
const risks: RiskProfile[] = ["Conservador", "Moderado", "Arrojado"];

// Typical products per asset class, for realistic detail.
const productsByClass: Record<AssetClass, string[]> = {
  "Renda Fixa": ["CDB Liquidez Diária", "LCI 90% CDI", "Tesouro IPCA+ 2035", "Debênture Incentivada", "CRA Agro"],
  "Renda Variável": ["Carteira Ações Dividendos", "BDR Global Tech", "Long Biased FIA", "ETF Ibovespa"],
  "Fundos": ["Fundo Multiestratégia", "FIC Renda Fixa Crédito", "Fundo Global Equities"],
  "Multimercado": ["Macro Long Short", "Quant Systematic", "Multimercado Institucional"],
  "Previdência": ["PGBL Balanceado", "VGBL Renda Fixa", "VGBL Multimercado"],
  "Caixa": ["Conta Investimento", "Fundo DI Caixa"],
};

// Commission economics differ by asset class (bps of AUM, annualized YTD proxy).
// Sensitive — managers only.
const revenueBpsByClass: Record<AssetClass, number> = {
  "Renda Fixa": 45,
  "Renda Variável": 120,
  "Fundos": 95,
  "Multimercado": 110,
  "Previdência": 70,
  "Caixa": 10,
};
const ADVISOR_PAYOUT = 0.35; // assessor recebe 35% da receita bruta

function makeName(): string {
  return `${pick(firstNames)} ${pick(lastNames)}`;
}

// Weighted allocation shape per risk profile → drives asset-class mix.
const allocationByRisk: Record<RiskProfile, Partial<Record<AssetClass, number>>> = {
  Conservador: { "Renda Fixa": 0.6, Previdência: 0.15, Fundos: 0.1, Caixa: 0.1, Multimercado: 0.05 },
  Moderado: { "Renda Fixa": 0.4, Fundos: 0.2, Multimercado: 0.15, "Renda Variável": 0.15, Previdência: 0.1 },
  Arrojado: { "Renda Variável": 0.4, Multimercado: 0.25, Fundos: 0.15, "Renda Fixa": 0.15, Caixa: 0.05 },
};

export const clients: Client[] = [];
export const positions: PositionRecord[] = [];
export const cashFlows: CashFlowRecord[] = [];

let clientSeq = 0;
let posSeq = 0;
let flowSeq = 0;

for (const advisor of advisors) {
  const clientCount = Math.round(between(6, 10));
  for (let c = 0; c < clientCount; c++) {
    clientSeq += 1;
    const risk = pick(risks);
    const segment = pick(segments);
    const client: Client = {
      id: `C-${String(clientSeq).padStart(4, "0")}`,
      name: makeName(),
      advisorId: advisor.id,
      segment,
      riskProfile: risk,
    };
    clients.push(client);

    // Total client AUM depends on segment.
    const aum =
      segment === "Private"
        ? between(3_000_000, 12_000_000)
        : segment === "Corporate"
        ? between(2_000_000, 20_000_000)
        : between(150_000, 1_200_000);

    const mix = allocationByRisk[risk];
    for (const cls of ASSET_CLASSES) {
      const weight = mix[cls] ?? 0;
      if (weight <= 0) continue;
      // jitter the weight a bit
      const jittered = weight * between(0.8, 1.2);
      const value = round(aum * jittered, 1000);
      if (value < 5000) continue;
      posSeq += 1;
      const grossRevenueYtd = round((value * revenueBpsByClass[cls]) / 10_000, 1);
      positions.push({
        id: `P-${String(posSeq).padStart(5, "0")}`,
        clientId: client.id,
        advisorId: advisor.id,
        assetClass: cls,
        product: pick(productsByClass[cls]),
        marketValue: value,
        grossRevenueYtd,
        advisorCommissionYtd: round(grossRevenueYtd * ADVISOR_PAYOUT, 1),
      });
    }
  }

  // 6 months of net new money (captação líquida) per advisor.
  for (const month of MONTHS) {
    flowSeq += 1;
    cashFlows.push({
      id: `F-${String(flowSeq).padStart(5, "0")}`,
      advisorId: advisor.id,
      month,
      netNewMoney: round(between(-800_000, 4_500_000), 1000),
    });
  }
}

// Monthly portfolio return per advisor (rentabilidade). Generated AFTER the main
// loop so the existing seeded dataset (clients/positions/cash flows) is unchanged.
export const performance: PerformanceRecord[] = [];
for (const advisor of advisors) {
  for (const month of MONTHS) {
    performance.push({
      advisorId: advisor.id,
      month,
      // plausible monthly equity-ish return with a positive drift
      returnPct: round4(between(-0.018, 0.032)),
    });
  }
}

// CDI benchmark (~0.9%/month) for the same window.
export const CDI_BY_MONTH: BenchmarkPoint[] = MONTHS.map((month) => ({
  month,
  returnPct: round4(between(0.0085, 0.0098)),
}));

// Period targets (metas) per advisor. Static, plausible values; attainment is
// computed against realized data.
export const goals: GoalRecord[] = advisors.map((a) => ({
  advisorId: a.id,
  nnmTarget: round(between(6_000_000, 18_000_000), 100_000),
  receitaTarget: round(between(250_000, 700_000), 10_000),
}));

// NNM driver decomposition per advisor, derived to RECONCILE with each advisor's
// net new money (captação + churn = NNM). Lets the NNM tree add up exactly.
export const flows: FlowBreakdown[] = advisors.map((a) => {
  const nnm = cashFlows
    .filter((f) => f.advisorId === a.id)
    .reduce((s, f) => s + f.netNewMoney, 0);
  const churnTotal = -round(between(3_000_000, 12_000_000), 1000);
  const captacaoTotal = nnm - churnTotal; // so captação + churn === nnm
  const captacaoNew = round(captacaoTotal * between(0.06, 0.18), 1000);
  const captacaoBase = captacaoTotal - captacaoNew;
  const churnPf = round(churnTotal * between(0.7, 0.9), 1000);
  const churnPj = churnTotal - churnPf;
  return {
    advisorId: a.id,
    captacaoNew,
    captacaoBase,
    churnPf,
    churnPj,
    activations: Math.round(between(3, 14)),
  };
});

// =============================================================================
//  CRM prospecting funnel (mirrors the Pipefy sync view vw_louro_negocio).
//  Deterministic synthetic cards with the SAME shape/rates as the real view —
//  real names/e-mails never enter the repo; in production this comes straight
//  from the database view.
// =============================================================================

const ORIGIN_WEIGHTS: [LeadOrigin, number][] = [
  ["Linkedin", 0.45],
  ["Cold call", 0.15],
  ["Indicação", 0.12],
  ["Lista do Assessor", 0.1],
  ["Mídia Paga", 0.08],
  ["Eventos", 0.06],
  ["Outros", 0.04],
];

function pickOrigin(): LeadOrigin {
  const r = rand();
  let acc = 0;
  for (const [origin, w] of ORIGIN_WEIGHTS) {
    acc += w;
    if (r < acc) return origin;
  }
  return "Outros";
}

export const funnel: FunnelRecord[] = [];
let leadSeq = 0;

for (const advisor of advisors) {
  const leadCount = Math.round(between(30, 40));
  for (let i = 0; i < leadCount; i++) {
    leadSeq += 1;
    const criadoMonth = MONTHS[Math.floor(rand() * MONTHS.length)];

    const r1Agendada = rand() < 0.9;
    const r1Realizada = r1Agendada && rand() < 0.78;
    const noShowR1 = r1Agendada && !r1Realizada;
    const r2Agendada = r1Realizada && rand() < 0.55;
    const r2Realizada = r2Agendada && rand() < 0.82;
    const noShowR2 = r2Agendada && !r2Realizada;

    // FUP: worked no-shows (plus a slice of stale leads).
    const passouFup = noShowR1 || noShowR2 || (!r1Agendada && rand() < 0.5);
    const fupRealizado = passouFup && rand() < 0.85;
    const fupConvertido = fupRealizado && rand() < 0.23;
    const fupRecuperadoDe: FunnelRecord["fupRecuperadoDe"] = fupConvertido
      ? noShowR2
        ? "r2"
        : "r1"
      : null;

    const contaAberta = (r2Realizada && rand() < 0.58) || (fupConvertido && rand() < 0.5);
    const emAbertura = !contaAberta && r2Realizada && rand() < 0.35;
    const descartado = !contaAberta && !emAbertura && rand() < 0.55;

    const fase: FunnelPhase = contaAberta
      ? "Finalizados"
      : descartado
      ? "Descartados/Perdidos"
      : emAbertura
      ? "Abertura de Conta - Aguardando"
      : passouFup && !fupConvertido
      ? "FUP"
      : r2Agendada
      ? "R2 Agendada"
      : r1Agendada
      ? "R1 Agendada"
      : "Fase Inicial - Leads";

    const ticket = round(between(80_000, 1_200_000), 10_000);
    funnel.push({
      cardId: `L-${String(leadSeq).padStart(4, "0")}`,
      advisorId: advisor.id,
      origem: pickOrigin(),
      fase,
      criadoMonth,
      diasNoFunil: Math.round(between(2, 140)),
      r1Agendada,
      r1Realizada,
      r2Agendada,
      r2Realizada,
      passouFup,
      fupRealizado,
      fupConvertido,
      fupRecuperadoDe,
      tentativasContato: Math.round(between(1, 6)),
      contaAberta,
      diasAteAbertura: contaAberta ? Math.round(between(7, 42)) : null,
      pipeFrio: fase === "R1 Agendada" ? ticket : null,
      pipeForecast: fase === "R2 Agendada" || fase === "FUP" ? ticket : null,
      pipeQuente: fase === "Abertura de Conta - Aguardando" ? ticket : null,
      descartado,
    });
  }
}

// NPS survey tallies per advisor for the period.
export const nps: NpsRecord[] = advisors.map((a) => {
  const sent = Math.round(between(150, 400));
  const responses = Math.round(sent * between(0.15, 0.35));
  const promoters = Math.round(responses * between(0.6, 0.85));
  const detractors = Math.round(responses * between(0.03, 0.12));
  const neutrals = Math.max(0, responses - promoters - detractors);
  return { advisorId: a.id, promoters, neutrals, detractors, sent };
});
