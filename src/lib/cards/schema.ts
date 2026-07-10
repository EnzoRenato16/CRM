import { z } from "zod";

/**
 * The card schema is the contract between the backend and the generative UI.
 *
 * Whatever produces cards — a deterministic tool, or an LLM — the output is
 * validated against this schema on the server BEFORE it reaches the browser.
 * The frontend renders only these whitelisted shapes. It never evaluates
 * model-authored code; it renders data into fixed React components.
 */

const valueFormat = z.enum(["brl", "brl_compact", "number", "percent"]).default("number");

const seriesPoint = z.object({
  label: z.string(),
  value: z.number(),
});

export const kpiCard = z.object({
  type: z.literal("kpi"),
  title: z.string(),
  value: z.string(), // pre-formatted display value
  delta: z
    .object({
      label: z.string(),
      direction: z.enum(["up", "down", "flat"]),
    })
    .optional(),
  /** Optional goal tracking: renders a progress bar (Realizado vs Objetivo). */
  goal: z
    .object({
      target: z.string(), // pre-formatted target
      pct: z.number(), // 0..1 attainment
      caption: z.string().optional(),
    })
    .optional(),
  caption: z.string().optional(),
  accent: z.enum(["brand", "emerald", "amber", "rose", "violet"]).default("brand"),
});

export const pieCard = z.object({
  type: z.literal("pie"),
  title: z.string(),
  data: z.array(seriesPoint).min(1),
  valueFormat,
  caption: z.string().optional(),
});

export const barCard = z.object({
  type: z.literal("bar"),
  title: z.string(),
  data: z.array(seriesPoint).min(1),
  orientation: z.enum(["vertical", "horizontal"]).default("horizontal"),
  valueFormat,
  caption: z.string().optional(),
});

export const lineCard = z.object({
  type: z.literal("line"),
  title: z.string(),
  data: z.array(seriesPoint).min(1),
  valueFormat,
  caption: z.string().optional(),
});

export const tableColumn = z.object({
  key: z.string(),
  label: z.string(),
  align: z.enum(["left", "right", "center"]).default("left"),
  format: valueFormat.optional(),
});

export const tableCard = z.object({
  type: z.literal("table"),
  title: z.string(),
  columns: z.array(tableColumn).min(1),
  rows: z.array(z.record(z.union([z.string(), z.number()]))).min(1),
  caption: z.string().optional(),
});

export const textCard = z.object({
  type: z.literal("text"),
  title: z.string().optional(),
  body: z.string(),
  tone: z.enum(["neutral", "warning"]).default("neutral"),
});

export const cardSchema = z.discriminatedUnion("type", [
  kpiCard,
  pieCard,
  barCard,
  lineCard,
  tableCard,
  textCard,
]);

export const assistantResponseSchema = z.object({
  narrative: z.string(),
  cards: z.array(cardSchema),
  meta: z.object({
    tool: z.string(),
    engine: z.enum(["rule-based", "anthropic"]),
    role: z.enum(["advisor", "manager"]),
    scope: z.string(),
  }),
});

export type ValueFormat = z.infer<typeof valueFormat>;
export type KpiCard = z.infer<typeof kpiCard>;
export type PieCard = z.infer<typeof pieCard>;
export type BarCard = z.infer<typeof barCard>;
export type LineCard = z.infer<typeof lineCard>;
export type TableCard = z.infer<typeof tableCard>;
export type TextCard = z.infer<typeof textCard>;
export type CardSpec = z.infer<typeof cardSchema>;
export type AssistantResponse = z.infer<typeof assistantResponseSchema>;
