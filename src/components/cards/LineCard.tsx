"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
  CartesianGrid,
} from "recharts";
import type { LineCard as LineCardSpec } from "@/lib/cards/schema";
import { CardShell } from "./CardShell";
import { formatValue } from "./format";

export function LineCard({ spec }: { spec: LineCardSpec }) {
  // Text alternative so the trend isn't conveyed by the line alone.
  const summary = `${spec.title}: ${spec.data
    .map((d) => `${d.label}, ${formatValue(d.value, spec.valueFormat)}`)
    .join("; ")}.`;
  return (
    <CardShell title={spec.title} caption={spec.caption} className="col-span-full lg:col-span-2">
      <div className="mt-3 h-[220px]" role="img" aria-label={summary}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={spec.data} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
            <defs>
              <linearGradient id="lineFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--series-1)" stopOpacity={0.28} />
                <stop offset="100%" stopColor="var(--series-1)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="var(--chart-grid)" strokeDasharray="3 3" />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={{ stroke: "var(--chart-grid)" }}
              tick={{ fontSize: 12, fill: "var(--chart-text)" }}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              width={52}
              tick={{ fontSize: 11, fill: "var(--chart-muted)" }}
              tickFormatter={(v: number) => formatValue(v, spec.valueFormat)}
            />
            <Tooltip
              cursor={{ stroke: "var(--chart-muted)", strokeWidth: 1 }}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                return (
                  <div className="rounded-lg border border-ink-200 bg-white px-3 py-2 text-xs shadow-lg dark:border-ink-700 dark:bg-ink-900">
                    <div className="font-medium">{label}</div>
                    <div className="tabular-nums text-ink-500">
                      {formatValue(payload[0].value as number, spec.valueFormat)}
                    </div>
                  </div>
                );
              }}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke="var(--series-1)"
              strokeWidth={2}
              fill="url(#lineFill)"
              dot={{ r: 3, fill: "var(--series-1)", strokeWidth: 0 }}
              activeDot={{ r: 5 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </CardShell>
  );
}
