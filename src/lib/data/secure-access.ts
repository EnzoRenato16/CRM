import { db } from "./store";
import type {
  Principal,
  PositionRecord,
  Client,
  CashFlowRecord,
  SeriesPoint,
  AssetClass,
} from "./types";

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

function scopedPositions(principal: Principal): ReadonlyArray<PositionRecord> {
  if (principal.role === "manager") return db.positions;
  return db.positions.filter((p) => p.advisorId === principal.advisorId);
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
