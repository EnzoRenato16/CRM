"use client";

import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";
import type { ComboCard as ComboCardSpec } from "@/lib/cards/schema";
import { CardShell } from "./CardShell";
import { formatValue } from "./format";

/**
 * Grouped bars + optional line on a secondary axis (agendadas vs realizadas +
 * no-shows). Bars share the left axis; the line gets its own right axis so a
 * small-count series stays readable next to large bars.
 */
export function ComboCard({ spec }: { spec: ComboCardSpec }) {
  const rows = spec.categories.map((cat, i) => {
    const row: Record<string, string | number> = { label: cat };
    for (const b of spec.bars) row[b.name] = b.values[i] ?? 0;
    if (spec.line) row[spec.line.name] = spec.line.values[i] ?? 0;
    return row;
  });
  const lineFmt = spec.line?.valueFormat ?? spec.valueFormat;
  const summary = `${spec.title}: ${spec.categories
    .map((cat, i) => {
      const parts = spec.bars.map((b) => `${b.name} ${formatValue(b.values[i] ?? 0, spec.valueFormat)}`);
      if (spec.line) parts.push(`${spec.line.name} ${formatValue(spec.line.values[i] ?? 0, lineFmt)}`);
      return `${cat} (${parts.join(", ")})`;
    })
    .join("; ")}.`;

  return (
    <CardShell title={spec.title} caption={spec.caption} className="col-span-full">
      <div className="mt-3 h-[260px]" role="img" aria-label={summary}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap={18}>
            <CartesianGrid vertical={false} stroke="var(--chart-grid)" strokeDasharray="3 3" />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={{ stroke: "var(--chart-grid)" }}
              tick={{ fontSize: 12, fill: "var(--chart-text)" }}
            />
            <YAxis
              yAxisId="bars"
              tickLine={false}
              axisLine={false}
              width={44}
              tick={{ fontSize: 11, fill: "var(--chart-muted)" }}
              tickFormatter={(v: number) => formatValue(v, spec.valueFormat)}
            />
            {spec.line && (
              <YAxis
                yAxisId="line"
                orientation="right"
                tickLine={false}
                axisLine={false}
                width={44}
                tick={{ fontSize: 11, fill: "var(--chart-muted)" }}
                tickFormatter={(v: number) => formatValue(v, lineFmt)}
              />
            )}
            <Tooltip
              cursor={{ fill: "var(--chart-grid)", opacity: 0.3 }}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                return (
                  <div className="rounded-lg border border-ink-200 bg-white px-3 py-2 text-xs shadow-lg dark:border-ink-700 dark:bg-ink-900">
                    <div className="font-medium">{label}</div>
                    {payload.map((p) => (
                      <div key={String(p.dataKey)} className="tabular-nums text-ink-500">
                        {p.name}:{" "}
                        {formatValue(
                          p.value as number,
                          spec.line && p.name === spec.line.name ? lineFmt : spec.valueFormat
                        )}
                      </div>
                    ))}
                  </div>
                );
              }}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {spec.bars.map((b, i) => (
              <Bar
                key={b.name}
                yAxisId="bars"
                dataKey={b.name}
                fill="var(--series-1)"
                fillOpacity={b.emphasis === "soft" || i === 1 ? 0.35 : 1}
                radius={[4, 4, 0, 0]}
                maxBarSize={30}
              />
            ))}
            {spec.line && (
              <Line
                yAxisId="line"
                type="monotone"
                dataKey={spec.line.name}
                stroke="var(--series-6)"
                strokeWidth={2}
                dot={{ r: 3.5, fill: "var(--series-6)", strokeWidth: 0 }}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </CardShell>
  );
}
