import type { ReactNode } from "react";

export function CardShell({
  title,
  caption,
  children,
  className = "",
}: {
  title?: string;
  caption?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`animate-fade-up rounded-xl border border-ink-200 bg-white p-4 shadow-card dark:border-ink-800 dark:bg-ink-900 ${className}`}
    >
      {title && (
        <h3 className="text-sm font-semibold tracking-tight text-ink-800 dark:text-ink-100">
          {title}
        </h3>
      )}
      {children}
      {caption && (
        <p className="mt-3 text-xs text-ink-400 dark:text-ink-500">{caption}</p>
      )}
    </div>
  );
}
