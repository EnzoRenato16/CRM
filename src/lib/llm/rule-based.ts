import type { Principal } from "@/lib/data/types";
import { toolsForRole, type ToolDef } from "@/lib/tools/registry";

export interface Selection {
  tool: string;
  params: Record<string, unknown>;
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/**
 * Deterministic intent router — works fully offline (no API key).
 * Scores each ALLOWED tool by keyword overlap, weighting longer (more specific)
 * keyword matches higher, so "renda fixa" beats a generic "resumo".
 *
 * Note it only ever considers tools the principal's role may use, so a manager-
 * only tool can never be selected for an advisor here. The orchestrator adds two
 * more independent enforcement layers on top of this.
 */
export function selectToolRuleBased(principal: Principal, message: string): Selection | null {
  const text = normalize(message);
  const allowed = toolsForRole(principal.role);

  let best: { tool: ToolDef; score: number } | null = null;
  for (const tool of allowed) {
    let score = 0;
    for (const kw of tool.keywords) {
      const nkw = normalize(kw);
      if (text.includes(nkw)) score += nkw.length; // longer match = more specific
    }
    if (score > 0 && (!best || score > best.score)) best = { tool, score };
  }

  if (!best) return null;
  const params = best.tool.extract ? best.tool.extract(message) : {};
  return { tool: best.tool.name, params };
}

/** True if the message is asking for revenue/commission data. */
export function mentionsRestricted(message: string): boolean {
  const t = normalize(message);
  return /(comiss|receita|faturament|margem|quanto a empresa|quanto ganho|quanto eu ganho)/.test(t);
}
