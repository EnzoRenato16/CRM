import { advisors, clients, positions, cashFlows, performance, CDI_BY_MONTH, goals, TEAM } from "./seed";
import type {
  Advisor,
  Client,
  PositionRecord,
  CashFlowRecord,
  PerformanceRecord,
  BenchmarkPoint,
  GoalRecord,
} from "./types";

/**
 * The raw datastore. In production this is your analytical PostgreSQL
 * (data mart / read replica). Here it is an in-memory seeded dataset with the
 * SAME security contract: nothing reads from these raw arrays directly except
 * the secure-access layer. Application code, tools, and the LLM orchestrator
 * only ever touch `secure-access.ts`.
 *
 * These exports are intentionally NOT re-exported from an index barrel, to keep
 * the raw (commission-bearing) records out of casual reach.
 */
export const db = {
  team: TEAM,
  advisors: advisors as ReadonlyArray<Advisor>,
  clients: clients as ReadonlyArray<Client>,
  positions: positions as ReadonlyArray<PositionRecord>,
  cashFlows: cashFlows as ReadonlyArray<CashFlowRecord>,
  performance: performance as ReadonlyArray<PerformanceRecord>,
  cdi: CDI_BY_MONTH as ReadonlyArray<BenchmarkPoint>,
  goals: goals as ReadonlyArray<GoalRecord>,
};
