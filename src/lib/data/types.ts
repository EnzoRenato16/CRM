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

/** A named numeric series point used by most aggregation results. */
export interface SeriesPoint {
  label: string;
  value: number;
}
