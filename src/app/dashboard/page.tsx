import { redirect } from "next/navigation";
import { getPrincipal } from "@/lib/auth/session";
import { getScope } from "@/lib/data/secure-access";
import { SUGGESTIONS } from "@/lib/llm/orchestrator";
import { isAnthropicEnabled } from "@/lib/llm/anthropic";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LogoutButton } from "@/components/LogoutButton";

export default function DashboardPage() {
  const principal = getPrincipal();
  if (!principal) redirect("/login");

  const scope = getScope(principal);
  const isManager = principal.role === "manager";

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <header className="z-10 border-b border-ink-200 bg-white/90 backdrop-blur dark:border-ink-800 dark:bg-ink-950/80">
        <div className="mx-auto flex w-full max-w-6xl items-center gap-3 px-4 py-3">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 text-white">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M4 15l4-4 3 3 5-6 4 4" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-semibold tracking-tight">Advisor Copilot</span>
              <RoleBadge manager={isManager} />
            </div>
            <div className="truncate text-xs text-ink-500">{scope.label}</div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <div className="hidden text-right sm:block">
              <div className="text-sm font-medium">{principal.name}</div>
              <div className="text-xs text-ink-500">{principal.email}</div>
            </div>
            <ThemeToggle />
            <LogoutButton />
          </div>
        </div>
      </header>

      <main className="min-h-0 flex-1">
        <ChatPanel
          userName={principal.name}
          role={principal.role}
          scopeLabel={scope.label}
          suggestions={SUGGESTIONS[principal.role]}
          llmEngine={isAnthropicEnabled() ? "anthropic" : "rule-based"}
        />
      </main>
    </div>
  );
}

function RoleBadge({ manager }: { manager: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
        manager
          ? "bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300"
          : "bg-brand-100 text-brand-700 dark:bg-brand-500/20 dark:text-brand-300"
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${manager ? "bg-violet-500" : "bg-brand-500"}`} />
      {manager ? "Gestor" : "Assessor"}
    </span>
  );
}
