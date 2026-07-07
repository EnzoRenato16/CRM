import { advisors, clients, positions, cashFlows, TEAM } from "./seed";
import type {
  Advisor,
  Client,
  PositionRecord,
  CashFlowRecord,
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
};
