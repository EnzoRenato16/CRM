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
    "NNM consolidado, de onde vem a captação",
    "Minhas metas e atingimento",
    "Rentabilidade da minha carteira",
    "Aderência de suitability",
    "Faixas de custódia",
  ],
  manager: [
    "Faturamento da equipe",
    "NNM consolidado da mesa",
    "ROA da mesa",
    "Receita por segmento de cliente",
    "Churn e contas novas",
    "NPS e satisfação",
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
    audit(principal, { tool: "team_revenue", outcome: "denied", detail: "restricted intent by advisor", engine });
    return denied(principal, engine, scope);
  }

  let selection: Selection | null = null;
  if (engine === "anthropic") {
    try {
      selection = await selectToolAnthropic(principal, message);
    } catch (err) {
      // Never fail the request because the LLM is unreachable — degrade to the
      // deterministic router.
      audit(principal, { tool: "-", outcome: "error", detail: `anthropic indisponível: ${(err as Error).message}`, engine });
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
      audit(principal, { tool: "team_revenue", outcome: "denied", detail: "restricted intent by advisor", engine });
      return denied(principal, engine, scope);
    }
    audit(principal, { tool: "-", outcome: "no_match", engine });
    return help(principal, engine, scope);
  }

  const tool = getTool(selection.tool);
  if (!tool) {
    audit(principal, { tool: selection.tool, outcome: "no_match", detail: "unknown tool", engine });
    return help(principal, engine, scope);
  }

  // Enforcement layer (2): re-check required role server-side.
  if (tool.requiredRole && principal.role !== tool.requiredRole) {
    audit(principal, { tool: tool.name, outcome: "denied", params: selection.params, engine });
    return denied(principal, engine, scope);
  }

  // Validate the model/router-supplied params against the tool's own schema
  // ONCE, centrally — so run() always receives safe, typed input and no tool
  // has to re-implement its own sanitization.
  const parsed = tool.params.safeParse(selection.params ?? {});
  const params: Record<string, unknown> = parsed.success
    ? (parsed.data as Record<string, unknown>)
    : {};

  try {
    const result = await tool.run({ principal }, params);
    const cards = toRenderableCards(result.cards, principal, tool.name, engine);
    audit(principal, { tool: tool.name, outcome: "ok", params, detail: `${cards.length} cards`, engine });
    return {
      narrative: result.narrative,
      cards,
      meta: { tool: tool.name, engine, role: principal.role, scope },
    };
  } catch (err) {
    // Enforcement layer (3): the data layer refused (defense in depth).
    if (err instanceof AuthorizationError) {
      audit(principal, { tool: tool.name, outcome: "denied", detail: err.message, engine });
      return denied(principal, engine, scope);
    }
    throw err;
  }
}

const CHART_TYPES = new Set<string>(["pie", "bar", "line"]);

/**
 * Turn a tool's raw cards into render-safe, schema-valid cards. Two otherwise-500
 * failure modes are handled here instead of failing the whole response:
 *  - a chart with an empty series (a valid business state — e.g. an advisor with
 *    no positions) would fail the schema's `.min(1)`; we swap it for an
 *    explicit empty-state text card;
 *  - a genuinely malformed card is logged with its offending tool and replaced
 *    by a single warning card, so the rest of the answer still renders.
 */
function toRenderableCards(
  cards: CardSpec[],
  principal: Principal,
  tool: string,
  engine: Engine
): CardSpec[] {
  const out: CardSpec[] = [];
  for (const card of cards) {
    const isEmptyChart =
      CHART_TYPES.has(card.type) &&
      Array.isArray((card as { data?: unknown[] }).data) &&
      (card as { data: unknown[] }).data.length === 0;
    const candidate: unknown = isEmptyChart
      ? { type: "text", body: "Sem dados para exibir neste recorte.", tone: "neutral" }
      : card;

    const result = cardSchema.safeParse(candidate);
    if (result.success) {
      out.push(result.data);
    } else {
      audit(principal, {
        tool,
        outcome: "error",
        detail: `card inválido (${card.type}): ${result.error.issues[0]?.message ?? "schema"}`,
        engine,
      });
      out.push({
        type: "text",
        title: "Não foi possível montar este card",
        tone: "warning",
        body: "Um card retornou em formato inesperado e foi omitido; o restante da resposta está abaixo.",
      });
    }
  }
  return out;
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
