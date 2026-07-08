import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { Principal } from "@/lib/data/types";
import { toolsForRole } from "@/lib/tools/registry";
import type { Selection } from "./rule-based";

// Minimal, dependency-free Zod → JSON-Schema for the tool params we use (empty
// object, string enum, integer). The tool's Zod schema stays the single source
// of truth; this only describes the params to the model. Runtime validation is
// still done by Zod server-side, so this description is advisory.
type ZodInternal = {
  _def: {
    typeName: string;
    innerType?: z.ZodTypeAny;
    schema?: z.ZodTypeAny;
    values?: readonly string[];
    checks?: Array<{ kind: string }>;
    shape?: () => Record<string, z.ZodTypeAny>;
  };
};

function unwrap(schema: z.ZodTypeAny): ZodInternal {
  let current = schema as unknown as ZodInternal;
  const wrappers = new Set(["ZodCatch", "ZodDefault", "ZodOptional", "ZodNullable"]);
  while (current?._def) {
    const { typeName, innerType, schema: inner } = current._def;
    if (wrappers.has(typeName) && innerType) current = innerType as unknown as ZodInternal;
    else if (typeName === "ZodEffects" && inner) current = inner as unknown as ZodInternal;
    else break;
  }
  return current;
}

function fieldSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  const def = unwrap(schema)._def;
  if (def.typeName === "ZodEnum") return { type: "string", enum: def.values ?? [] };
  if (def.typeName === "ZodNumber") {
    return { type: (def.checks ?? []).some((c) => c.kind === "int") ? "integer" : "number" };
  }
  if (def.typeName === "ZodBoolean") return { type: "boolean" };
  return { type: "string" };
}

export function zodToInputSchema(schema: z.ZodTypeAny): Anthropic.Tool.InputSchema {
  const def = unwrap(schema)._def;
  const properties: Record<string, unknown> = {};
  if (def.typeName === "ZodObject" && def.shape) {
    for (const [key, value] of Object.entries(def.shape())) {
      properties[key] = fieldSchema(value);
    }
  }
  return { type: "object", properties } as Anthropic.Tool.InputSchema;
}

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
  // Interactive chat: fail fast so the deterministic fallback kicks in quickly
  // instead of the SDK's 10-minute default with 2 retries pinning the request.
  const client = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
    timeout: 8000,
    maxRetries: 1,
  });
  const allowed = toolsForRole(principal.role);

  const tools = allowed.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: zodToInputSchema(t.params),
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
