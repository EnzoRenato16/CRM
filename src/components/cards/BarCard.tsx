"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
  LabelList,
  Cell,
} from "recharts";
import type { BarCard as BarCardSpec } from "@/lib/cards/schema";
import { CardShell } from "./CardShell";
import { formatValue } from "./format";

export function BarCard({ spec }: { spec: BarCardSpec }) {
  const horizontal = spec.orientation !== "vertical";
  const height = Math.max(160, spec.data.length * 40 + 24);
  // Single-hue magnitude bars (not a rainbow) — color carries no extra meaning.
  const fill = "var(--series-1)";

  return (
    <CardShell title={spec.title} caption={spec.caption} className="col-span-full lg:col-span-2">
      <div className="mt-3" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={spec.data}
            layout={horizontal ? "vertical" : "horizontal"}
            margin={{ top: 4, right: 56, bottom: 4, left: 4 }}
            barCategoryGap={10}
          >
            {horizontal ? (
              <>
                <XAxis type="number" hide />
                <YAxis
                  type="category"
                  dataKey="label"
                  width={110}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 12, fill: "var(--chart-text)" }}
                />
              </>
            ) : (
              <>
                <XAxis
                  type="category"
                  dataKey="label"
                  tickLine={false}
                  axisLine={{ stroke: "var(--chart-grid)" }}
                  tick={{ fontSize: 12, fill: "var(--chart-text)" }}
                />
                <YAxis type="number" hide />
              </>
            )}
            <Tooltip
              cursor={{ fill: "var(--chart-grid)", opacity: 0.3 }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0].payload as { label: string; value: number };
                return (
                  <div className="rounded-lg border border-ink-200 bg-white px-3 py-2 text-xs shadow-lg dark:border-ink-700 dark:bg-ink-900">
                    <div className="font-medium">{p.label}</div>
                    <div className="tabular-nums text-ink-500">
                      {formatValue(p.value, spec.valueFormat)}
                    </div>
                  </div>
                );
              }}
            />
            <Bar dataKey="value" radius={[4, 4, 4, 4]} maxBarSize={26}>
              {spec.data.map((d) => (
                <Cell key={d.label} fill={fill} />
              ))}
              <LabelList
                dataKey="value"
                position={horizontal ? "right" : "top"}
                className="fill-ink-500"
                style={{ fontSize: 11, fontVariantNumeric: "tabular-nums" }}
                formatter={(v: number) => formatValue(v, spec.valueFormat)}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </CardShell>
  );
}
