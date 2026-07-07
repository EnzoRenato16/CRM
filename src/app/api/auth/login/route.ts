import { NextResponse } from "next/server";
import { verifyCredentials } from "@/lib/auth/users";
import { setSessionCookie } from "@/lib/auth/session";

export const runtime = "nodejs";

export async function POST(request: Request) {
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
