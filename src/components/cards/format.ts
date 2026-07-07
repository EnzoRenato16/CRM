import type { ValueFormat } from "@/lib/cards/schema";
import { formatBRL, formatNumber, formatPercent } from "@/lib/format";

export function formatValue(value: number, fmt: ValueFormat | undefined): string {
  switch (fmt) {
    case "brl":
      return formatBRL(value);
    case "brl_compact":
      return formatBRL(value, { compact: true });
    case "percent":
      return formatPercent(value);
    case "number":
    default:
      return formatNumber(value);
  }
}

export const SERIES_VARS = [
  "var(--series-1)",
  "var(--series-2)",
  "var(--series-3)",
  "var(--series-4)",
  "var(--series-5)",
  "var(--series-6)",
  "var(--series-7)",
  "var(--series-8)",
];

export function seriesColor(i: number): string {
  return SERIES_VARS[i % SERIES_VARS.length];
}
