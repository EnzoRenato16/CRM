import type { Principal, Role } from "@/lib/data/types";
import { getScope, AuthorizationError } from "@/lib/data/secure-access";
import { getTool } from "@/lib/tools/registry";
import { cardSchema, type AssistantResponse, type CardSpec } from "@/lib/cards/schema";
import { selectToolRuleBased, mentionsRestricted, type Selection } from "./rule-based";
import { isAnthropicEnabled, selectToolAnthropic } from "./anthropic";
import { audit } from "@/lib/audit";

type Engine = "rule-based" | "anthropic";

export const SUGGESTIONS: Record<Role, string[]> = {
  advisor: [
    "Resumo da minha carteira",
    "Alocação por classe de ativo",
    "Resumo da minha renda fixa",
    "Minha captação líquida no período",
    "Meus 5 maiores clientes",
    "Distribuição por perfil de risco",
  ],
  manager: [
    "Faturamento da equipe",
    "Receita por classe de ativo",
    "Ranking dos assessores",
    "Captação da equipe",
    "Alocação consolidada da mesa",
    "Comissões pagas no ano",
  ],
};

/**
 * The orchestration entrypoint. Selects a tool (via LLM or the offline router),
 * then enforces authorization on the server — THREE independent times:
 *   (1) only role-appropriate tools are offered to the selector;
 *   (2) requiredRole is re-checked here before running;
 *   (3) the data layer itself throws for out-of-scope reads.
 * No prompt, jailbreak, or model mistake can widen access past the Principal.
 */
export async function orchestrate(
  principal: Principal,
  message: string
): Promise<AssistantResponse> {
  const scope = getScope(principal).label;
  let engine: Engine = isAnthropicEnabled() ? "anthropic" : "rule-based";

  // Governance short-circuit: if an advisor asks about revenue/commissions at
  // all, answer with the explicit access-restricted message — never a partial
  // interpretation. This is enforcement, not just UX: the branch runs before
  // any tool selection can occur.
  if (principal.role !== "manager" && mentionsRestricted(message)) {
    audit(principal, { tool: "team_revenue", outcome: "denied", detail: "restricted intent by advisor" });
    return denied(principal, engine, scope);
  }

  let selection: Selection | null = null;
  if (engine === "anthropic") {
    try {
      selection = await selectToolAnthropic(principal, message);
    } catch (err) {
      // Never fail the request because the LLM is unreachable — degrade to the
      // deterministic router.
      audit(principal, { tool: "-", outcome: "error", detail: `anthropic: ${(err as Error).message}` });
      engine = "rule-based";
    }
  }
  if (!selection) {
    selection = selectToolRuleBased(principal, message);
    if (engine === "anthropic" && selection) engine = "rule-based";
  }

  // No tool matched.
  if (!selection) {
    if (mentionsRestricted(message) && principal.role !== "manager") {
      audit(principal, { tool: "team_revenue", outcome: "denied", detail: "restricted intent by advisor" });
      return denied(principal, engine, scope);
    }
    audit(principal, { tool: "-", outcome: "no_match" });
    return help(principal, engine, scope);
  }

  const tool = getTool(selection.tool);
  if (!tool) {
    audit(principal, { tool: selection.tool, outcome: "no_match", detail: "unknown tool" });
    return help(principal, engine, scope);
  }

  // Enforcement layer (2): re-check required role server-side.
  if (tool.requiredRole && principal.role !== tool.requiredRole) {
    audit(principal, { tool: tool.name, outcome: "denied", params: selection.params });
    return denied(principal, engine, scope);
  }

  try {
    const result = tool.run({ principal }, selection.params);
    // Validate every card against the schema before it can reach the browser.
    const cards: CardSpec[] = result.cards.map((c) => cardSchema.parse(c));
    audit(principal, { tool: tool.name, outcome: "ok", params: selection.params, detail: `${cards.length} cards` });
    return {
      narrative: result.narrative,
      cards,
      meta: { tool: tool.name, engine, role: principal.role, scope },
    };
  } catch (err) {
    // Enforcement layer (3): the data layer refused (defense in depth).
    if (err instanceof AuthorizationError) {
      audit(principal, { tool: tool.name, outcome: "denied", detail: err.message });
      return denied(principal, engine, scope);
    }
    throw err;
  }
}

function denied(principal: Principal, engine: Engine, scope: string): AssistantResponse {
  return {
    narrative: "",
    cards: [
      {
        type: "text",
        title: "Acesso restrito",
        tone: "warning",
        body:
          "Dados de **receita, comissões e de outros assessores** são exclusivos do perfil de **gestor**. " +
          "Sua sessão está como **assessor**, então o copiloto só acessa a sua própria carteira — e nunca comissões. " +
          "Essa regra é imposta no banco de dados e na camada de acesso, não depende de instrução ao modelo.",
      },
    ],
    meta: { tool: "access_denied", engine, role: principal.role, scope },
  };
}

function help(principal: Principal, engine: Engine, scope: string): AssistantResponse {
  const list = SUGGESTIONS[principal.role].map((s) => `• ${s}`).join("\n");
  return {
    narrative: "",
    cards: [
      {
        type: "text",
        title: "Não entendi — tente uma destas",
        tone: "neutral",
        body: `Posso montar cards e gráficos sobre a sua carteira. Por exemplo:\n\n${list}`,
      },
    ],
    meta: { tool: "help", engine, role: principal.role, scope },
  };
}
