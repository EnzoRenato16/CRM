import { redirect } from "next/navigation";
import { getPrincipal } from "@/lib/auth/session";
import { getScope } from "@/lib/data/secure-access";
import { SUGGESTIONS } from "@/lib/llm/orchestrator";
import { isAnthropicEnabled } from "@/lib/llm/anthropic";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { AppHeader } from "@/components/AppHeader";

export default function DashboardPage() {
  const principal = getPrincipal();
  if (!principal) redirect("/login");

  const scope = getScope(principal);

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <AppHeader principal={principal} scopeLabel={scope.label} active="chat" />
      <main className="min-h-0 flex-1">
        <ChatPanel
          userName={principal.name}
          userEmail={principal.email}
          role={principal.role}
          scopeLabel={scope.label}
          suggestions={SUGGESTIONS[principal.role]}
          llmEngine={isAnthropicEnabled() ? "anthropic" : "rule-based"}
        />
      </main>
    </div>
  );
}
