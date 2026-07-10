import type { AssistantResponse, CardSpec } from "@/lib/cards/schema";
import { formatValue } from "@/components/cards/format";

/**
 * Client-facing PDF export. We reconstruct the answer as a clean, branded,
 * print-optimized HTML document from the STRUCTURED response (not a screenshot),
 * so charts become tidy data tables and the output is crisp at any size. The
 * builder is a pure function (unit-tested); `printReport` opens it and prints.
 */

export interface ReportContext {
  scopeLabel: string;
  userName: string;
  userQuestion?: string;
}

const esc = (s: unknown): string =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const stripBold = (s: string): string => s.replace(/\*\*/g, "");

function pct(part: number, total: number): string {
  return ((part / (total || 1)) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + "%";
}

function cardHtml(card: CardSpec): string {
  switch (card.type) {
    case "kpi": {
      const delta = card.delta ? `<div class="delta">${esc(card.delta.label)}</div>` : "";
      const goal = card.goal
        ? `<div class="cap">Meta ${esc(card.goal.target)} · ${Math.round(card.goal.pct * 100)}%${card.goal.caption ? " · " + esc(card.goal.caption) : ""}</div>`
        : "";
      const cap = card.caption ? `<div class="cap">${esc(card.caption)}</div>` : "";
      return `<div class="kpi"><div class="klabel">${esc(card.title)}</div><div class="kval">${esc(card.value)}</div>${delta}${goal}${cap}</div>`;
    }
    case "pie":
    case "bar":
    case "line": {
      const total = card.type === "pie" ? card.data.reduce((a, b) => a + b.value, 0) : 0;
      const rows = card.data
        .map((d) => {
          const share = card.type === "pie" ? ` <span class="muted">(${pct(d.value, total)})</span>` : "";
          return `<tr><td>${esc(d.label)}</td><td class="num">${esc(formatValue(d.value, card.valueFormat))}${share}</td></tr>`;
        })
        .join("");
      return `<section class="block"><h3>${esc(card.title)}</h3><table><tbody>${rows}</tbody></table></section>`;
    }
    case "table": {
      const head = card.columns
        .map((c) => `<th class="${c.align === "right" ? "num" : ""}">${esc(c.label)}</th>`)
        .join("");
      const body = card.rows
        .map(
          (row) =>
            "<tr>" +
            card.columns
              .map((c) => {
                const raw = row[c.key];
                const val = c.format && typeof raw === "number" ? formatValue(raw, c.format) : String(raw ?? "");
                return `<td class="${c.align === "right" ? "num" : ""}">${esc(val)}</td>`;
              })
              .join("") +
            "</tr>"
        )
        .join("");
      return `<section class="block"><h3>${esc(card.title)}</h3><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></section>`;
    }
    case "text":
      return `<section class="block note"><h3>${esc(card.title ?? "")}</h3><p>${esc(stripBold(card.body))}</p></section>`;
    default:
      return "";
  }
}

export function buildReportHtml(response: AssistantResponse, ctx: ReportContext): string {
  const date = new Date().toLocaleString("pt-BR", { dateStyle: "long", timeStyle: "short" });
  const kpis = response.cards.filter((c) => c.type === "kpi").map(cardHtml).join("");
  const rest = response.cards.filter((c) => c.type !== "kpi").map(cardHtml).join("");
  const narrative = response.narrative ? `<p class="lead">${esc(stripBold(response.narrative))}</p>` : "";
  const question = ctx.userQuestion ? `<div class="q">Pergunta: “${esc(ctx.userQuestion)}”</div>` : "";

  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8" />
<title>Relatório — Advisor Copilot</title>
<style>
  :root { --brand:#1f47f5; --ink:#0f1729; --muted:#61708c; --border:#d4d9e2; --soft:#f6f7f9; }
  * { box-sizing: border-box; }
  body { margin:0; font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif; color: var(--ink); font-variant-numeric: tabular-nums; }
  .page { max-width: 760px; margin: 0 auto; padding: 32px 28px 48px; }
  header { display:flex; align-items:baseline; justify-content:space-between; border-bottom:2px solid var(--brand); padding-bottom:12px; }
  .brand { font-size:19px; font-weight:700; letter-spacing:-.01em; color: var(--brand); }
  .meta { font-size:12px; color: var(--muted); text-align:right; }
  .q { margin-top:16px; font-size:13px; color: var(--muted); font-style: italic; }
  .lead { font-size:15px; line-height:1.5; margin:10px 0 18px; }
  .kpis { display:grid; grid-template-columns: repeat(3, 1fr); gap:12px; margin-bottom:18px; }
  .kpi { border:1px solid var(--border); border-radius:10px; padding:12px 14px; }
  .klabel { font-size:10px; text-transform:uppercase; letter-spacing:.05em; color:var(--muted); font-weight:600; }
  .kval { font-size:22px; font-weight:700; letter-spacing:-.02em; margin-top:4px; }
  .delta, .cap { font-size:11px; color:var(--muted); margin-top:3px; }
  .block { margin: 14px 0; border:1px solid var(--border); border-radius:10px; padding:14px 16px; page-break-inside: avoid; }
  .block.note { background: var(--soft); }
  h3 { margin:0 0 8px; font-size:14px; font-weight:650; }
  table { width:100%; border-collapse: collapse; font-size:13px; }
  th { text-align:left; font-size:10px; text-transform:uppercase; letter-spacing:.03em; color:var(--muted); border-bottom:1px solid var(--border); padding:6px 6px; }
  td { padding:6px 6px; border-bottom:1px solid var(--soft); }
  .num { text-align:right; font-variant-numeric: tabular-nums; }
  .muted { color: var(--muted); }
  p { margin:0; font-size:13px; line-height:1.55; }
  footer { margin-top:26px; padding-top:12px; border-top:1px solid var(--border); font-size:10px; color:var(--muted); }
  @page { margin: 14mm; }
  @media print { .page { padding:0; max-width:none; } }
</style></head>
<body><div class="page">
  <header><div class="brand">Advisor Copilot</div><div class="meta">${esc(ctx.scopeLabel)}<br/>${esc(date)}</div></header>
  ${question}
  ${narrative}
  ${kpis ? `<div class="kpis">${kpis}</div>` : ""}
  ${rest}
  <footer>Gerado automaticamente pelo Advisor Copilot · documento confidencial — uso interno e do cliente.</footer>
</div></body></html>`;
}

export function printReport(response: AssistantResponse, ctx: ReportContext): void {
  const win = window.open("", "_blank", "width=920,height=1000");
  if (!win) return;
  win.document.open();
  win.document.write(buildReportHtml(response, ctx));
  win.document.close();
  win.focus();
  // Give the new document a beat to lay out before invoking the print dialog.
  setTimeout(() => {
    try {
      win.print();
    } catch {
      /* user can still print manually */
    }
  }, 350);
}
