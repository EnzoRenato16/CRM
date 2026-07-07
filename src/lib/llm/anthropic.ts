import Anthropic from "@anthropic-ai/sdk";
import type { Principal } from "@/lib/data/types";
import { toolsForRole } from "@/lib/tools/registry";
import type { Selection } from "./rule-based";

/**
 * Optional LLM-backed tool selection.
 *
 * CRITICAL SECURITY PROPERTY: the model is only ever offered the tools the
 * principal's role is allowed to use, and it selects a tool NAME + typed
 * PARAMETERS. It never sees raw data, never writes SQL, and its choice is still
 * re-checked server-side (orchestrator) and again at the data layer. The model
 * is a natural-language router, not the security boundary.
 */
export function isAnthropicEnabled(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";

function systemPrompt(principal: Principal): string {
  return [
    "Você é o roteador de intenção de um copiloto de dados para uma assessoria de investimentos.",
    "Sua única função é escolher UMA ferramenta e seus parâmetros para responder à pergunta do usuário.",
    "NUNCA invente dados. NUNCA responda com números — apenas selecione a ferramenta.",
    `O usuário autenticado tem papel: ${principal.role.toUpperCase()}.`,
    "As ferramentas oferecidas já respeitam a permissão do usuário; use apenas as fornecidas.",
    "Se nenhuma ferramenta servir, não chame nenhuma ferramenta e responda em texto curto pedindo para reformular.",
  ].join("\n");
}

export async function selectToolAnthropic(
  principal: Principal,
  message: string
): Promise<Selection | null> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const allowed = toolsForRole(principal.role);

  const tools = allowed.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.jsonSchema as Anthropic.Tool.InputSchema,
  }));

  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 512,
    system: systemPrompt(principal),
    tools,
    tool_choice: { type: "auto" },
    messages: [{ role: "user", content: message }],
  });

  const toolUse = res.content.find((c) => c.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") return null;
  return {
    tool: toolUse.name,
    params: (toolUse.input as Record<string, unknown>) ?? {},
  };
}
