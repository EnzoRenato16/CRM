// NOTE: server-only module — must never be imported into a client component.
import { cookies } from "next/headers";
import crypto from "node:crypto";
import type { Principal } from "@/lib/data/types";

/**
 * Minimal signed-cookie session for the reference app.
 *
 * The session cookie carries the Principal signed with an HMAC so it cannot be
 * forged client-side. In production you would instead verify a JWT issued by
 * Supabase Auth / Cognito — but the contract is identical: the server derives a
 * trusted Principal from a cryptographically verified token, and that Principal
 * (never the LLM) drives every authorization decision.
 */

const COOKIE_NAME = "ac_session";
const MAX_AGE_SECONDS = 60 * 60 * 8; // 8h

const DEV_FALLBACK_SECRET = "dev-insecure-secret-change-in-production";
const MIN_SECRET_LENGTH = 32;

/**
 * Resolve the HMAC signing secret. Fails closed in production: if AUTH_SECRET is
 * missing or too short we throw rather than silently signing sessions with a
 * public constant (which would let anyone forge a `role: "manager"` cookie and
 * defeat every downstream authorization layer). The weak fallback is allowed
 * only outside production so the reference app still runs with zero setup.
 */
function secret(): string {
  const s = process.env.AUTH_SECRET;
  if (process.env.NODE_ENV === "production") {
    if (!s || s.length < MIN_SECRET_LENGTH) {
      throw new Error(
        `AUTH_SECRET must be set to a strong value (>= ${MIN_SECRET_LENGTH} chars) in production.`
      );
    }
    return s;
  }
  return s || DEV_FALLBACK_SECRET;
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function sign(payload: string): string {
  return crypto.createHmac("sha256", secret()).update(payload).digest("base64url");
}

function timingSafeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

interface SessionPayload extends Principal {
  iat: number;
  exp: number;
}

export function serializeSession(principal: Principal): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = {
    ...principal,
    iat: now,
    exp: now + MAX_AGE_SECONDS,
  };
  const body = b64url(JSON.stringify(payload));
  return `${body}.${sign(body)}`;
}

export function parseSession(token: string | undefined): Principal | null {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  if (!timingSafeEqual(sig, sign(body))) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString()) as SessionPayload;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return {
      userId: payload.userId,
      name: payload.name,
      email: payload.email,
      role: payload.role,
      advisorId: payload.advisorId,
    };
  } catch {
    return null;
  }
}

export function setSessionCookie(principal: Principal): void {
  cookies().set(COOKIE_NAME, serializeSession(principal), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export function clearSessionCookie(): void {
  cookies().set(COOKIE_NAME, "", { httpOnly: true, path: "/", maxAge: 0 });
}

/** Read the authenticated Principal from the request cookies (or null). */
export function getPrincipal(): Principal | null {
  return parseSession(cookies().get(COOKIE_NAME)?.value);
}

/** Like getPrincipal but throws — use in routes that require a session. */
export function requirePrincipal(): Principal {
  const principal = getPrincipal();
  if (!principal) {
    const err = new Error("Não autenticado");
    (err as Error & { status?: number }).status = 401;
    throw err;
  }
  return principal;
}
