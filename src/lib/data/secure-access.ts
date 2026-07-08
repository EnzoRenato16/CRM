import { db } from "./store";
import type {
  Principal,
  SafePositionRecord,
  Client,
  CashFlowRecord,
  SeriesPoint,
  AssetClass,
  Segment,
  RiskProfile,
} from "./types";
import { ASSET_CLASS_RISK_LEVEL, RISK_PROFILE_LEVEL } from "./types";

/**
 * =============================================================================
 *  SECURE DATA ACCESS LAYER  —  the single security chokepoint
 * =============================================================================
 *
 *  Design principle (the whole point of the architecture):
 *  the LLM is NEVER the security boundary. Governance is enforced HERE, in code
 *  that sits between the request and the data, exactly like PostgreSQL
 *  Row-Level Security + column GRANTs would in production (see db/policies.sql).
 *
 *  Guarantees enforced by this module:
 *   1. Row scoping    — an advisor principal can only ever read rows belonging
 *                       to their own advisorId. Managers see everything.
 *   2. Column scoping — commission / revenue fields never leave this module for
 *                       an advisor. There is literally no advisor-reachable
 *                       method that returns them.
 *   3. Fail-closed    — cross-advisor and revenue methods call assertManager()
 *                       and THROW for anyone else, no matter what the LLM, the
 *                       user prompt, or a tool asks for.
 *
 *  A tool, the orchestrator, or a jailbroken prompt cannot bypass this: they can
 *  only call these methods, and these methods answer to the Principal, not to
 *  natural-language instructions.
 * =============================================================================
 */

export class AuthorizationError extends Error {
  readonly code = "FORBIDDEN";
  constructor(message: string) {
    super(message);
    this.name = "AuthorizationError";
  }
}

export function canSeeRevenue(principal: Principal): boolean {
  return principal.role === "manager";
}

export function isManager(principal: Principal): boolean {
  return principal.role === "manager";
}

/** Fail-closed guard used by every cross-advisor / revenue method. */
function assertManager(principal: Principal, what: string): void {
  if (principal.role !== "manager") {
    throw new AuthorizationError(
      `Acesso negado: "${what}" é restrito a gestores. Usuário ${principal.email} tem papel "${principal.role}".`
    );
  }
}

// --- Private, scope-aware primitives -----------------------------------------
// These are the ONLY functions that touch the raw store. Everything an advisor
// can reach is derived from `scopedPositions` / `scopedClients`, which are
// filtered to their advisorId before any aggregation happens.

function scopedPositions(principal: Principal): ReadonlyArray<SafePositionRecord> {
  const rows =
    principal.role === "manager"
      ? db.positions
      : db.positions.filter((p) => p.advisorId === principal.advisorId);
  // Strip the sensitive columns at the primitive itself — the runtime twin of
  // the SQL column GRANT. Revenue/commission cannot flow past this point through
  // any advisor-safe read; manager-only reads use db.positions directly.
  return rows.map(({ grossRevenueYtd, advisorCommissionYtd, ...safe }) => safe);
}

function scopedClients(principal: Principal): ReadonlyArray<Client> {
  if (principal.role === "manager") return db.clients;
  return db.clients.filter((c) => c.advisorId === principal.advisorId);
}

function scopedCashFlows(principal: Principal): ReadonlyArray<CashFlowRecord> {
  if (principal.role === "manager") return db.cashFlows;
  return db.cashFlows.filter((f) => f.advisorId === principal.advisorId);
}

function sumBy<T>(rows: ReadonlyArray<T>, fn: (r: T) => number): number {
  return rows.reduce((acc, r) => acc + fn(r), 0);
}

function groupSum<T>(
  rows: ReadonlyArray<T>,
  keyFn: (r: T) => string,
  valFn: (r: T) => number
): SeriesPoint[] {
  const map = new Map<string, number>();
  for (const r of rows) {
    const k = keyFn(r);
    map.set(k, (map.get(k) ?? 0) + valFn(r));
  }
  return [...map.entries()].map(([label, value]) => ({ label, value }));
}

// =============================================================================
//  ADVISOR-SAFE READS  (also available to managers, scoped to everything)
//  None of these can return revenue or commission.
// =============================================================================

export interface Scope {
  role: Principal["role"];
  /** Human label used in headings and in the LLM system prompt. */
  label: string;
  advisorName: string | null;
  advisorCount: number;
}

export function getScope(principal: Principal): Scope {
  if (principal.role === "manager") {
    return {
      role: "manager",
      label: `${db.team} — visão de gestor (${db.advisors.length} assessores)`,
      advisorName: null,
      advisorCount: db.advisors.length,
    };
  }
  const advisor = db.advisors.find((a) => a.id === principal.advisorId);
  return {
    role: "advisor",
    label: `Carteira de ${advisor?.name ?? principal.name}`,
    advisorName: advisor?.name ?? principal.name,
    advisorCount: 1,
  };
}

export function totalAum(principal: Principal): number {
  return sumBy(scopedPositions(principal), (p) => p.marketValue);
}

export function clientCount(principal: Principal): number {
  return scopedClients(principal).length;
}

export function positionCount(principal: Principal): number {
  return scopedPositions(principal).length;
}

export function allocationByAssetClass(principal: Principal): SeriesPoint[] {
  return groupSum(
    scopedPositions(principal),
    (p) => p.assetClass,
    (p) => p.marketValue
  ).sort((a, b) => b.value - a.value);
}

export function riskDistribution(principal: Principal): SeriesPoint[] {
  // Weight risk profiles by AUM, not headcount — more meaningful for a book.
  const clientRisk = new Map(scopedClients(principal).map((c) => [c.id, c.riskProfile]));
  return groupSum(
    scopedPositions(principal),
    (p) => clientRisk.get(p.clientId) ?? "—",
    (p) => p.marketValue
  ).sort((a, b) => b.value - a.value);
}

export function segmentDistribution(principal: Principal): SeriesPoint[] {
  const clientSeg = new Map(scopedClients(principal).map((c) => [c.id, c.segment]));
  return groupSum(
    scopedPositions(principal),
    (p) => clientSeg.get(p.clientId) ?? "—",
    (p) => p.marketValue
  ).sort((a, b) => b.value - a.value);
}

export interface AssetClassSummary {
  assetClass: AssetClass;
  total: number;
  pctOfPortfolio: number;
  byProduct: SeriesPoint[];
}

export function assetClassSummary(
  principal: Principal,
  assetClass: AssetClass
): AssetClassSummary {
  const scoped = scopedPositions(principal);
  const inClass = scoped.filter((p) => p.assetClass === assetClass);
  const total = sumBy(inClass, (p) => p.marketValue);
  const portfolio = sumBy(scoped, (p) => p.marketValue) || 1;
  return {
    assetClass,
    total,
    pctOfPortfolio: total / portfolio,
    byProduct: groupSum(inClass, (p) => p.product, (p) => p.marketValue).sort(
      (a, b) => b.value - a.value
    ),
  };
}

export interface SafeClient {
  name: string;
  segment: Client["segment"];
  riskProfile: Client["riskProfile"];
  aum: number;
}

export function topClients(principal: Principal, limit = 5): SafeClient[] {
  const byClient = new Map<string, number>();
  for (const p of scopedPositions(principal)) {
    byClient.set(p.clientId, (byClient.get(p.clientId) ?? 0) + p.marketValue);
  }
  const clientMeta = new Map(scopedClients(principal).map((c) => [c.id, c]));
  return [...byClient.entries()]
    .map(([clientId, aum]) => {
      const c = clientMeta.get(clientId);
      return {
        name: c?.name ?? clientId,
        segment: c?.segment ?? "Varejo",
        riskProfile: c?.riskProfile ?? "Moderado",
        aum,
      } satisfies SafeClient;
    })
    .sort((a, b) => b.aum - a.aum)
    .slice(0, limit);
}

/** Net new money (captação líquida), aggregated by month within scope. */
export function netNewMoneyByMonth(principal: Principal): SeriesPoint[] {
  return groupSum(
    scopedCashFlows(principal),
    (f) => f.month,
    (f) => f.netNewMoney
  ).sort((a, b) => a.label.localeCompare(b.label));
}

export function netNewMoneyTotal(principal: Principal): number {
  return sumBy(scopedCashFlows(principal), (f) => f.netNewMoney);
}

// --- Suitability adherence (compliance) --------------------------------------

export interface SuitabilityResult {
  /** Share of AUM invested within the client's risk profile (0..1). */
  pctAdherent: number;
  adherentAum: number;
  misalignedAum: number;
  /** Clients holding products riskier than their profile, worst first. */
  misalignedClients: {
    name: string;
    profile: RiskProfile;
    misalignedAum: number;
    worstClass: AssetClass;
  }[];
}

export function suitabilityAdherence(principal: Principal): SuitabilityResult {
  const clientById = new Map(scopedClients(principal).map((c) => [c.id, c]));
  let adherentAum = 0;
  let misalignedAum = 0;
  const perClient = new Map<
    string,
    { name: string; profile: RiskProfile; misalignedAum: number; worstLevel: number; worstClass: AssetClass }
  >();

  for (const p of scopedPositions(principal)) {
    const client = clientById.get(p.clientId);
    if (!client) continue;
    const clientLevel = RISK_PROFILE_LEVEL[client.riskProfile];
    const productLevel = ASSET_CLASS_RISK_LEVEL[p.assetClass];
    if (productLevel <= clientLevel) {
      adherentAum += p.marketValue;
    } else {
      misalignedAum += p.marketValue;
      const cur =
        perClient.get(client.id) ??
        { name: client.name, profile: client.riskProfile, misalignedAum: 0, worstLevel: 0, worstClass: p.assetClass };
      cur.misalignedAum += p.marketValue;
      if (productLevel > cur.worstLevel) {
        cur.worstLevel = productLevel;
        cur.worstClass = p.assetClass;
      }
      perClient.set(client.id, cur);
    }
  }

  const total = adherentAum + misalignedAum || 1;
  return {
    pctAdherent: adherentAum / total,
    adherentAum,
    misalignedAum,
    misalignedClients: [...perClient.values()]
      .map(({ name, profile, misalignedAum: aum, worstClass }) => ({ name, profile, misalignedAum: aum, worstClass }))
      .sort((a, b) => b.misalignedAum - a.misalignedAum),
  };
}

// --- Portfolio performance (rentabilidade) -----------------------------------

/** Monthly return series within scope. Advisor: own; manager: AUM-weighted avg. */
export function performanceByMonth(principal: Principal): SeriesPoint[] {
  if (principal.role === "manager") {
    const aumByAdvisor = new Map<string, number>();
    for (const p of db.positions) {
      aumByAdvisor.set(p.advisorId, (aumByAdvisor.get(p.advisorId) ?? 0) + p.marketValue);
    }
    const totalAumAll = [...aumByAdvisor.values()].reduce((a, b) => a + b, 0) || 1;
    const byMonth = new Map<string, number>();
    for (const r of db.performance) {
      const weight = (aumByAdvisor.get(r.advisorId) ?? 0) / totalAumAll;
      byMonth.set(r.month, (byMonth.get(r.month) ?? 0) + r.returnPct * weight);
    }
    return [...byMonth.entries()]
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }
  return db.performance
    .filter((r) => r.advisorId === principal.advisorId)
    .map((r) => ({ label: r.month, value: r.returnPct }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

/** Compounded return over the period within scope. */
export function cumulativeReturn(principal: Principal): number {
  return performanceByMonth(principal).reduce((acc, p) => acc * (1 + p.value), 1) - 1;
}

/** CDI benchmark series (public — carries no advisor-scoped or sensitive data). */
export function benchmarkByMonth(): SeriesPoint[] {
  return db.cdi
    .map((c) => ({ label: c.month, value: c.returnPct }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export function benchmarkCumulative(): number {
  return db.cdi.reduce((acc, c) => acc * (1 + c.returnPct), 1) - 1;
}

// --- Client lookup / drill-down (scope-aware) --------------------------------

export interface ClientDetail {
  name: string;
  segment: Segment;
  riskProfile: RiskProfile;
  aum: number;
  allocation: SeriesPoint[];
  topProducts: SeriesPoint[];
}

function normalizeName(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/**
 * Find a client by name WITHIN the caller's scope. An advisor searching for
 * another advisor's client gets null — we never reveal that the client exists.
 */
export function findClient(principal: Principal, query: string): ClientDetail | null {
  const qTokens = new Set(normalizeName(query).split(/\s+/).filter((t) => t.length > 1));
  if (qTokens.size === 0) return null;

  let best: Client | null = null;
  let bestScore = 0;
  for (const c of scopedClients(principal)) {
    const nameTokens = normalizeName(c.name).split(/\s+/);
    const score = nameTokens.reduce((acc, t) => acc + (qTokens.has(t) ? 1 : 0), 0);
    if (score > bestScore) {
      best = c;
      bestScore = score;
    }
  }
  if (!best || bestScore === 0) return null;

  const pos = scopedPositions(principal).filter((p) => p.clientId === best!.id);
  return {
    name: best.name,
    segment: best.segment,
    riskProfile: best.riskProfile,
    aum: sumBy(pos, (p) => p.marketValue),
    allocation: groupSum(pos, (p) => p.assetClass, (p) => p.marketValue).sort((a, b) => b.value - a.value),
    topProducts: groupSum(pos, (p) => p.product, (p) => p.marketValue)
      .sort((a, b) => b.value - a.value)
      .slice(0, 5),
  };
}

// =============================================================================
//  MANAGER-ONLY READS  (fail-closed; advisors get an AuthorizationError)
//  These are the only methods that expose revenue/commission or another
//  advisor's book.
// =============================================================================

export interface AdvisorRevenueRow {
  advisorId: string;
  advisorName: string;
  aum: number;
  grossRevenueYtd: number;
  advisorCommissionYtd: number;
  netNewMoney: number;
}

export function revenueByAdvisor(principal: Principal): AdvisorRevenueRow[] {
  assertManager(principal, "receita e comissões por assessor");
  return db.advisors
    .map((a) => {
      const pos = db.positions.filter((p) => p.advisorId === a.id);
      const flows = db.cashFlows.filter((f) => f.advisorId === a.id);
      return {
        advisorId: a.id,
        advisorName: a.name,
        aum: sumBy(pos, (p) => p.marketValue),
        grossRevenueYtd: sumBy(pos, (p) => p.grossRevenueYtd),
        advisorCommissionYtd: sumBy(pos, (p) => p.advisorCommissionYtd),
        netNewMoney: sumBy(flows, (f) => f.netNewMoney),
      } satisfies AdvisorRevenueRow;
    })
    .sort((a, b) => b.grossRevenueYtd - a.grossRevenueYtd);
}

export interface CommissionSummary {
  grossRevenueYtd: number;
  advisorCommissionYtd: number;
  firmMarginYtd: number;
  byAssetClass: { label: string; revenue: number; commission: number }[];
}

export function commissionSummary(principal: Principal): CommissionSummary {
  assertManager(principal, "resumo de comissões");
  const gross = sumBy(db.positions, (p) => p.grossRevenueYtd);
  const commission = sumBy(db.positions, (p) => p.advisorCommissionYtd);
  const byClassMap = new Map<string, { revenue: number; commission: number }>();
  for (const p of db.positions) {
    const cur = byClassMap.get(p.assetClass) ?? { revenue: 0, commission: 0 };
    cur.revenue += p.grossRevenueYtd;
    cur.commission += p.advisorCommissionYtd;
    byClassMap.set(p.assetClass, cur);
  }
  return {
    grossRevenueYtd: gross,
    advisorCommissionYtd: commission,
    firmMarginYtd: gross - commission,
    byAssetClass: [...byClassMap.entries()]
      .map(([label, v]) => ({ label, ...v }))
      .sort((a, b) => b.revenue - a.revenue),
  };
}

/** Team AUM ranked by advisor — cross-advisor, so manager-only. */
export function aumByAdvisor(principal: Principal): SeriesPoint[] {
  assertManager(principal, "AUM por assessor");
  return db.advisors
    .map((a) => ({
      label: a.name,
      value: sumBy(
        db.positions.filter((p) => p.advisorId === a.id),
        (p) => p.marketValue
      ),
    }))
    .sort((a, b) => b.value - a.value);
}

/** Team captação ranked by advisor — cross-advisor, so manager-only. */
export function netNewMoneyByAdvisor(principal: Principal): SeriesPoint[] {
  assertManager(principal, "captação por assessor");
  return db.advisors
    .map((a) => ({
      label: a.name,
      value: sumBy(
        db.cashFlows.filter((f) => f.advisorId === a.id),
        (f) => f.netNewMoney
      ),
    }))
    .sort((a, b) => b.value - a.value);
}

/** Firm-wide totals for manager KPI header. */
export function firmTotals(principal: Principal) {
  assertManager(principal, "totais da empresa");
  return {
    aum: sumBy(db.positions, (p) => p.marketValue),
    clients: db.clients.length,
    advisors: db.advisors.length,
    grossRevenueYtd: sumBy(db.positions, (p) => p.grossRevenueYtd),
  };
}

export interface SegmentRevenueRow {
  segment: Segment;
  aum: number;
  revenue: number;
  commission: number;
  margin: number;
}

/** Revenue, commission and margin by client segment — commercial, manager-only. */
export function revenueBySegment(principal: Principal): SegmentRevenueRow[] {
  assertManager(principal, "receita por segmento de cliente");
  const clientSegment = new Map(db.clients.map((c) => [c.id, c.segment]));
  const bySegment = new Map<Segment, { aum: number; revenue: number; commission: number }>();
  for (const p of db.positions) {
    const segment = clientSegment.get(p.clientId) ?? "Varejo";
    const cur = bySegment.get(segment) ?? { aum: 0, revenue: 0, commission: 0 };
    cur.aum += p.marketValue;
    cur.revenue += p.grossRevenueYtd;
    cur.commission += p.advisorCommissionYtd;
    bySegment.set(segment, cur);
  }
  return [...bySegment.entries()]
    .map(([segment, v]) => ({ segment, ...v, margin: v.revenue - v.commission }))
    .sort((a, b) => b.revenue - a.revenue);
}
