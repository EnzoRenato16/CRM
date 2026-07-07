import type { TableCard as TableCardSpec } from "@/lib/cards/schema";
import { CardShell } from "./CardShell";
import { formatValue } from "./format";

export function TableCard({ spec }: { spec: TableCardSpec }) {
  return (
    <CardShell title={spec.title} caption={spec.caption} className="col-span-full">
      <div className="mt-3 -mx-1 overflow-x-auto">
        <table className="w-full min-w-[420px] text-sm">
          <thead>
            <tr className="border-b border-ink-200 text-xs uppercase tracking-wide text-ink-400 dark:border-ink-800">
              {spec.columns.map((c) => (
                <th
                  key={c.key}
                  className={`px-2 py-2 font-medium ${
                    c.align === "right" ? "text-right" : c.align === "center" ? "text-center" : "text-left"
                  }`}
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {spec.rows.map((row, i) => (
              <tr
                key={i}
                className="border-b border-ink-100 last:border-0 hover:bg-ink-50 dark:border-ink-800/60 dark:hover:bg-ink-800/40"
              >
                {spec.columns.map((c) => {
                  const raw = row[c.key];
                  const display =
                    c.format && typeof raw === "number" ? formatValue(raw, c.format) : String(raw ?? "");
                  return (
                    <td
                      key={c.key}
                      className={`px-2 py-2 ${
                        c.align === "right"
                          ? "text-right tabular-nums font-medium"
                          : c.align === "center"
                          ? "text-center"
                          : "text-left"
                      }`}
                    >
                      {display}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </CardShell>
  );
}
