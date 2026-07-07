import crypto from "node:crypto";
import type { Principal, Role } from "@/lib/data/types";

/**
 * Constant-time string comparison. Hashing first equalizes length so we never
 * leak length via `timingSafeEqual` throwing, and never short-circuit on the
 * first differing byte the way `!==` would. (Real auth delegates this to the
 * IdP / bcrypt; this keeps the demo pattern correct if it is ever copied.)
 */
function constantTimeEqual(a: string, b: string): boolean {
  const ha = crypto.createHash("sha256").update(a).digest();
  const hb = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/**
 * Demo user directory.
 *
 * In production this is REPLACED by Supabase Auth or AWS Cognito — the app
 * never stores passwords. The identity provider authenticates the user and
 * returns their role + advisor_id as verified claims (JWT), which become the
 * Principal. This file exists only so the reference app is runnable with zero
 * external setup. Passwords are intentionally trivial and clearly marked demo.
 */
export interface DemoUser {
  userId: string;
  name: string;
  email: string;
  password: string; // DEMO ONLY — real auth is delegated to Supabase/Cognito.
  role: Role;
  advisorId: string | null;
}

export const DEMO_USERS: DemoUser[] = [
  {
    userId: "U-ana",
    name: "Ana Souza",
    email: "ana@assessoria.com",
    password: "assessor123",
    role: "advisor",
    advisorId: "A-001",
  },
  {
    userId: "U-bruno",
    name: "Bruno Lima",
    email: "bruno@assessoria.com",
    password: "assessor123",
    role: "advisor",
    advisorId: "A-002",
  },
  {
    userId: "U-gestor",
    name: "Gabriela Mendes",
    email: "gestor@assessoria.com",
    password: "gestor123",
    role: "manager",
    advisorId: null,
  },
];

export function verifyCredentials(email: string, password: string): Principal | null {
  const user = DEMO_USERS.find(
    (u) => u.email.toLowerCase() === email.trim().toLowerCase()
  );
  if (!user || !constantTimeEqual(user.password, password)) return null;
  return toPrincipal(user);
}

export function toPrincipal(user: DemoUser): Principal {
  return {
    userId: user.userId,
    name: user.name,
    email: user.email,
    role: user.role,
    advisorId: user.advisorId,
  };
}
