import type { ReactNode } from "react";

/**
 * Minimal, safe inline markdown: supports **bold** only. Renders to React nodes
 * (never dangerouslySetInnerHTML), so model/tool text can't inject markup.
 */
export function renderInlineMarkdown(text: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    const m = part.match(/^\*\*([^*]+)\*\*$/);
    if (m) {
      return (
        <strong key={i} className="font-semibold text-ink-800 dark:text-ink-100">
          {m[1]}
        </strong>
      );
    }
    return <span key={i}>{part}</span>;
  });
}
