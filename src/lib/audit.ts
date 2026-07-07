import type { Principal } from "@/lib/data/types";

/**
 * Audit logging. In the financial sector, every data access by the copilot must
 * be traceable: who asked, in what role, which tool ran, with what params, and
 * how many rows came back. Here it writes a structured line to the server log;
 * in production this INSERTs into advisory.audit_log (see db/policies.sql).
 */
export type AuditOutcome = "ok" | "denied" | "no_match" | "error";

export interface AuditEntry {
  at: string;
  userEmail: string;
  role: Principal["role"];
  advisorId: string | null;
  tool: string;
  outcome: AuditOutcome;
  params?: Record<string, unknown>;
  detail?: string;
}

export function audit(principal: Principal, entry: Omit<AuditEntry, "at" | "userEmail" | "role" | "advisorId">): void {
  const record: AuditEntry = {
    at: new Date().toISOString(),
    userEmail: principal.email,
    role: principal.role,
    advisorId: principal.advisorId,
    ...entry,
  };
  // eslint-disable-next-line no-console
  console.log("[AUDIT]", JSON.stringify(record));
}
