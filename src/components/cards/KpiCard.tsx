import type { KpiCard as KpiCardSpec } from "@/lib/cards/schema";

const ACCENT: Record<NonNullable<KpiCardSpec["accent"]>, string> = {
  brand: "text-brand-600 dark:text-brand-400",
  emerald: "text-emerald-600 dark:text-emerald-400",
  amber: "text-amber-600 dark:text-amber-400",
  rose: "text-rose-600 dark:text-rose-400",
  violet: "text-violet-600 dark:text-violet-400",
};

const DOT: Record<NonNullable<KpiCardSpec["accent"]>, string> = {
  brand: "bg-brand-500",
  emerald: "bg-emerald-500",
  amber: "bg-amber-500",
  rose: "bg-rose-500",
  violet: "bg-violet-500",
};

export function KpiCard({ spec }: { spec: KpiCardSpec }) {
  const accent = spec.accent ?? "brand";
  return (
    <div className="animate-fade-up rounded-xl border border-ink-200 bg-white p-4 shadow-card dark:border-ink-800 dark:bg-ink-900">
      <div className="flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${DOT[accent]}`} />
        <span className="text-xs font-medium uppercase tracking-wide text-ink-400">
          {spec.title}
        </span>
      </div>
      <div className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">
        {spec.value}
      </div>
      {spec.delta && (
        <div className={`mt-1 flex items-center gap-1 text-xs font-medium ${ACCENT[accent]}`}>
          {spec.delta.direction === "up" && <Arrow up />}
          {spec.delta.direction === "down" && <Arrow />}
          <span>{spec.delta.label}</span>
        </div>
      )}
      {spec.caption && (
        <div className="mt-1 text-xs text-ink-400">{spec.caption}</div>
      )}
    </div>
  );
}

function Arrow({ up }: { up?: boolean }) {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" className={up ? "" : "rotate-180"}>
      <path d="M12 19V5M5 12l7-7 7 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
