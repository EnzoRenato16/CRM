import type { TextCard as TextCardSpec } from "@/lib/cards/schema";
import { renderInlineMarkdown } from "./markdown";

export function TextCard({ spec }: { spec: TextCardSpec }) {
  const warning = spec.tone === "warning";
  return (
    <div
      className={`animate-fade-up col-span-full rounded-xl border p-4 shadow-card ${
        warning
          ? "border-amber-300 bg-amber-50 dark:border-amber-500/40 dark:bg-amber-950/30"
          : "border-ink-200 bg-white dark:border-ink-800 dark:bg-ink-900"
      }`}
    >
      {spec.title && (
        <div className="flex items-center gap-2">
          {warning && (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-amber-500">
              <path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
          <h3 className="text-sm font-semibold tracking-tight">{spec.title}</h3>
        </div>
      )}
      <div className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-ink-600 dark:text-ink-300">
        {spec.body.split("\n").map((line, i) => (
          <p key={i}>{renderInlineMarkdown(line)}</p>
        ))}
      </div>
    </div>
  );
}
