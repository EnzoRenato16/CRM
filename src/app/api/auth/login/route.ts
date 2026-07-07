import { NextResponse } from "next/server";
import { verifyCredentials } from "@/lib/auth/users";
import { setSessionCookie } from "@/lib/auth/session";
import { rateLimit, clientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";

// 10 login attempts per IP per 15 minutes.
const LOGIN_LIMIT = 10;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;

export async function POST(request: Request) {
  const gate = rateLimit(`login:${clientIp(request)}`, LOGIN_LIMIT, LOGIN_WINDOW_MS);
  if (!gate.ok) {
    return NextResponse.json(
      { error: "Muitas tentativas de login. Tente novamente mais tarde." },
      { status: 429, headers: { "Retry-After": String(gate.retryAfterSeconds) } }
    );
  }

  let body: { email?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  }

  const email = (body.email ?? "").trim();
  const password = body.password ?? "";
  if (!email || !password) {
    return NextResponse.json({ error: "Informe e-mail e senha." }, { status: 400 });
  }

  const principal = verifyCredentials(email, password);
  if (!principal) {
    return NextResponse.json({ error: "Credenciais inválidas." }, { status: 401 });
  }

  setSessionCookie(principal);
  return NextResponse.json({
    ok: true,
    user: { name: principal.name, role: principal.role },
  });
}
