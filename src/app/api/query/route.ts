import { NextResponse } from "next/server";
import { getPrincipal } from "@/lib/auth/session";
import { orchestrate } from "@/lib/llm/orchestrator";
import { rateLimit, clientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";

// 30 questions per user per minute — bounds LLM cost/DoS when a key is set.
const QUERY_LIMIT = 30;
const QUERY_WINDOW_MS = 60 * 1000;

export async function POST(request: Request) {
  const principal = getPrincipal();
  if (!principal) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const gate = rateLimit(
    `query:${principal.userId}:${clientIp(request)}`,
    QUERY_LIMIT,
    QUERY_WINDOW_MS
  );
  if (!gate.ok) {
    return NextResponse.json(
      { error: "Muitas solicitações. Aguarde um instante." },
      { status: 429, headers: { "Retry-After": String(gate.retryAfterSeconds) } }
    );
  }

  let body: { message?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  }

  const message = (body.message ?? "").trim();
  if (!message) {
    return NextResponse.json({ error: "Mensagem vazia." }, { status: 400 });
  }
  if (message.length > 500) {
    return NextResponse.json({ error: "Mensagem muito longa." }, { status: 400 });
  }

  try {
    const response = await orchestrate(principal, message);
    return NextResponse.json(response);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[query] erro:", err);
    return NextResponse.json({ error: "Erro ao processar a solicitação." }, { status: 500 });
  }
}
