// Domain types for the advisory data layer.
//
// SECURITY NOTE: The "sensitive" fields (grossRevenueYtd, advisorCommissionYtd)
// exist only on the raw records held privately inside the store. They are NEVER
// returned to an advisor principal — the secure-access layer (secure-access.ts)
// is the single chokepoint that enforces this. This mirrors, in the reference
// implementation, what PostgreSQL Row-Level Security + column GRANTs do in
// production (see db/policies.sql).

export type Role = "advisor" | "manager";

/**
 * The authenticated identity attached to every request. Every data-access call
 * requires a Principal — there is no way to query data anonymously.
 */
export interface Principal {
  userId: string;
  name: string;
  email: string;
  role: Role;
  /** The advisor a principal is scoped to. `null` only for managers (see-all). */
  advisorId: string | null;
}

export type AssetClass =
  | "Renda Fixa"
  | "Renda Variável"
  | "Fundos"
  | "Multimercado"
  | "Previdência"
  | "Caixa";

export const ASSET_CLASSES: AssetClass[] = [
  "Renda Fixa",
  "Renda Variável",
  "Fundos",
  "Multimercado",
  "Previdência",
  "Caixa",
];

export type Segment = "Varejo" | "Private" | "Corporate";
export type RiskProfile = "Conservador" | "Moderado" | "Arrojado";

/** Ordinal risk level (1 = most conservative) shared by profiles and products. */
export const RISK_PROFILE_LEVEL: Record<RiskProfile, 1 | 2 | 3> = {
  Conservador: 1,
  Moderado: 2,
  Arrojado: 3,
};

/**
 * Risk level of each asset class, used for suitability adherence: a position is
 * "enquadrada" when the product's level is <= the client's profile level.
 */
export const ASSET_CLASS_RISK_LEVEL: Record<AssetClass, 1 | 2 | 3> = {
  Caixa: 1,
  "Renda Fixa": 1,
  Previdência: 2,
  Fundos: 2,
  Multimercado: 3,
  "Renda Variável": 3,
};

export interface Advisor {
  id: string;
  name: string;
  email: string;
  team: string;
}

export interface Client {
  id: string;
  name: string;
  advisorId: string;
  segment: Segment;
  riskProfile: RiskProfile;
}

/**
 * Raw position record as stored. Contains commercially sensitive fields that
 * advisors must never see. Kept private to the store module.
 */
export interface PositionRecord {
  id: string;
  clientId: string;
  advisorId: string;
  assetClass: AssetClass;
  product: string;
  marketValue: number;
  /** Sensitive — manager-only. */
  grossRevenueYtd: number;
  /** Sensitive — manager-only. */
  advisorCommissionYtd: number;
}

/**
 * A position with the commercially sensitive columns removed. This is the only
 * shape the advisor-safe data primitives hand out, mirroring the PostgreSQL
 * column GRANT that withholds revenue/commission columns from `app_advisor`
 * (see db/policies.sql). Because the sensitive fields are absent from the type,
 * a future advisor-reachable read that tried to forward them fails to compile.
 */
export type SafePositionRecord = Omit<
  PositionRecord,
  "grossRevenueYtd" | "advisorCommissionYtd"
>;

export interface CashFlowRecord {
  id: string;
  advisorId: string;
  /** ISO month, e.g. "2026-06". */
  month: string;
  /** Captação líquida (net new money) in BRL. */
  netNewMoney: number;
}

/** Monthly portfolio return (rentabilidade) per advisor, as a fraction. */
export interface PerformanceRecord {
  advisorId: string;
  /** ISO month, e.g. "2026-06". */
  month: string;
  /** Monthly return as a fraction, e.g. 0.012 = +1.2%. */
  returnPct: number;
}

/** A benchmark point (e.g. CDI), month → return fraction. */
export interface BenchmarkPoint {
  month: string;
  returnPct: number;
}

/** Period targets per advisor (metas). Realized values come from the data. */
export interface GoalRecord {
  advisorId: string;
  /** Net new money (captação NNM) target for the period. */
  nnmTarget: number;
  /** Gross revenue target for the period (surfaced to managers only). */
  receitaTarget: number;
}

/** A named numeric series point used by most aggregation results. */
export interface SeriesPoint {
  label: string;
  value: number;
}
