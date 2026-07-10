import { redirect } from "next/navigation";
import { getPrincipal } from "@/lib/auth/session";
import { getScope } from "@/lib/data/secure-access";
import { AppHeader } from "@/components/AppHeader";
import { BoardView } from "@/components/BoardView";

export default function PainelPage() {
  const principal = getPrincipal();
  if (!principal) redirect("/login");

  const scope = getScope(principal);

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <AppHeader principal={principal} scopeLabel={scope.label} active="board" />
      <main className="min-h-0 flex-1 overflow-y-auto">
        <BoardView role={principal.role} userEmail={principal.email} />
      </main>
    </div>
  );
}
