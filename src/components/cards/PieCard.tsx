"use client";

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import type { PieCard as PieCardSpec } from "@/lib/cards/schema";
import { CardShell } from "./CardShell";
import { formatValue, seriesColor } from "./format";
import { formatPercent } from "@/lib/format";

export function PieCard({ spec }: { spec: PieCardSpec }) {
  const total = spec.data.reduce((a, b) => a + b.value, 0) || 1;
  const data = spec.data.map((d, i) => ({ ...d, color: seriesColor(i) }));

  return (
    <CardShell title={spec.title} caption={spec.caption} className="col-span-full lg:col-span-2">
      <div className="mt-3 flex flex-col items-center gap-4 sm:flex-row">
        <div className="h-[200px] w-[200px] shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                nameKey="label"
                innerRadius={52}
                outerRadius={88}
                paddingAngle={2}
                stroke="var(--chart-surface)"
                strokeWidth={2}
              >
                {data.map((d) => (
                  <Cell key={d.label} fill={d.color} />
                ))}
              </Pie>
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const p = payload[0].payload as { label: string; value: number };
                  return (
                    <div className="rounded-lg border border-ink-200 bg-white px-3 py-2 text-xs shadow-lg dark:border-ink-700 dark:bg-ink-900">
                      <div className="font-medium">{p.label}</div>
                      <div className="tabular-nums text-ink-500">
                        {formatValue(p.value, spec.valueFormat)} · {formatPercent(p.value / total)}
                      </div>
                    </div>
                  );
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        {/* Legend doubles as the direct-label relief for low-contrast slices */}
        <ul className="w-full space-y-1.5">
          {data.map((d) => (
            <li key={d.label} className="flex items-center gap-2 text-sm">
              <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: d.color }} />
              <span className="flex-1 truncate text-ink-700 dark:text-ink-200">{d.label}</span>
              <span className="tabular-nums text-ink-500">{formatPercent(d.value / total)}</span>
              <span className="w-20 text-right tabular-nums font-medium">
                {formatValue(d.value, spec.valueFormat)}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </CardShell>
  );
}
