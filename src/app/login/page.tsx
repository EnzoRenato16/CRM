"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const DEMO = [
  {
    label: "Assessora — Ana Souza",
    email: "ana@assessoria.com",
    password: "assessor123",
    hint: "Vê só a própria carteira. Comissões ficam ocultas.",
  },
  {
    label: "Assessor — Bruno Lima",
    email: "bruno@assessoria.com",
    password: "assessor123",
    hint: "Outra carteira — prova o isolamento entre assessores.",
  },
  {
    label: "Gestora — Gabriela Mendes",
    email: "gestor@assessoria.com",
    password: "gestor123",
    hint: "Vê toda a equipe, receita e comissões.",
  },
];

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Falha no login.");
        setLoading(false);
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("Erro de rede. Tente novamente.");
      setLoading(false);
    }
  }

  function fill(u: (typeof DEMO)[number]) {
    setEmail(u.email);
    setPassword(u.password);
    setError(null);
  }

  return (
    <main className="min-h-screen w-full lg:grid lg:grid-cols-2">
      {/* Brand / value panel */}
      <section className="relative hidden overflow-hidden bg-ink-900 lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            backgroundImage:
              "radial-gradient(60% 50% at 20% 10%, rgba(51,102,255,0.35), transparent 60%), radial-gradient(50% 50% at 90% 90%, rgba(28,46,143,0.5), transparent 60%)",
          }}
        />
        <div className="relative">
          <div className="flex items-center gap-2 text-white">
            <Logo />
            <span className="text-lg font-semibold tracking-tight">Advisor Copilot</span>
          </div>
        </div>
        <div className="relative space-y-6 text-white">
          <h1 className="text-3xl font-semibold leading-tight">
            BI conversacional para a sua assessoria.
          </h1>
          <p className="max-w-md text-ink-200">
            Pergunte em português. O copiloto desenha os cards na hora — captação,
            alocação, top clientes — com governança de dados de nível enterprise.
          </p>
          <ul className="space-y-3 text-sm text-ink-100">
            <Feature>Controle de acesso (RBAC) imposto no banco, não no prompt.</Feature>
            <Feature>Assessor nunca vê a carteira ou a comissão de outro.</Feature>
            <Feature>Cards e gráficos gerados dinamicamente pela IA.</Feature>
          </ul>
        </div>
        <div className="relative text-xs text-ink-300">
          Referência técnica · segurança em <code>secure-access.ts</code> + RLS no PostgreSQL
        </div>
      </section>

      {/* Form */}
      <section className="flex min-h-screen items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <div className="flex items-center gap-2">
              <Logo dark />
              <span className="text-lg font-semibold tracking-tight">Advisor Copilot</span>
            </div>
          </div>

          <h2 className="text-2xl font-semibold tracking-tight">Entrar</h2>
          <p className="mt-1 text-sm text-ink-500">Acesse o painel da sua carteira.</p>

          <form onSubmit={submit} className="mt-6 space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-ink-700 dark:text-ink-200">
                E-mail
              </label>
              <input
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm outline-none ring-brand-500/30 focus:border-brand-500 focus:ring-4 dark:border-ink-700 dark:bg-ink-900"
                placeholder="voce@assessoria.com"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-ink-700 dark:text-ink-200">
                Senha
              </label>
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm outline-none ring-brand-500/30 focus:border-brand-500 focus:ring-4 dark:border-ink-700 dark:bg-ink-900"
                placeholder="••••••••"
                required
              />
            </div>

            {error && (
              <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-300">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 disabled:opacity-60"
            >
              {loading ? "Entrando…" : "Entrar"}
            </button>
          </form>

          <div className="mt-8">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-400">
              Contas de demonstração
            </p>
            <div className="space-y-2">
              {DEMO.map((u) => (
                <button
                  key={u.email}
                  onClick={() => fill(u)}
                  className="w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-left text-sm transition hover:border-brand-400 hover:bg-brand-50/50 dark:border-ink-700 dark:bg-ink-900 dark:hover:bg-ink-800"
                >
                  <div className="font-medium">{u.label}</div>
                  <div className="text-xs text-ink-500">{u.hint}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

function Feature({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="mt-0.5 shrink-0 text-brand-300">
        <path d="M20 6 9 17l-5-5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span>{children}</span>
    </li>
  );
}

function Logo({ dark }: { dark?: boolean }) {
  return (
    <span
      className={`inline-flex h-8 w-8 items-center justify-center rounded-lg ${
        dark ? "bg-brand-600 text-white" : "bg-white/10 text-white"
      }`}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <path d="M4 15l4-4 3 3 5-6 4 4" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}
