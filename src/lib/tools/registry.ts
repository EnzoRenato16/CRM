import { z } from "zod";
import type { Principal, Role, AssetClass } from "@/lib/data/types";
import { ASSET_CLASSES } from "@/lib/data/types";
import * as data from "@/lib/data/secure-access";
import type { GoalProgress } from "@/lib/data/secure-access";
import type { CardSpec } from "@/lib/cards/schema";
import { formatBRL, formatPercent, formatNumber, formatMonth } from "@/lib/format";

export interface ToolContext {
  principal: Principal;
}
export interface ToolResult {
  narrative: string;
  cards: CardSpec[];
}
export interface ToolDef {
  name: string;
  /** Natural-language description surfaced to the LLM. */
  description: string;
  /** If set, only this role may run the tool. Enforced server-side. */
  requiredRole?: Role;
  /** Keywords for the offline rule-based router (PT-BR). */
  keywords: string[];
  /**
   * The single source of truth for this tool's parameters. The orchestrator
   * validates the model/router-supplied input against this Zod schema BEFORE
   * `run` executes, so `run` always receives already-safe, typed params and no
   * tool has to re-implement its own defensive checks. Also drives the Anthropic
   * tool input_schema (see anthropic.ts).
   */
  params: z.ZodTypeAny;
  /** Extract parameters from raw text for the offline router. */
  extract?: (text: string) => Record<string, unknown>;
  /** May be sync today or async once the store becomes a real database. */
  run: (ctx: ToolContext, params: Record<string, unknown>) => ToolResult | Promise<ToolResult>;
}

const NO_PARAMS = z.object({}).strip();

function detectAssetClass(text: string): AssetClass | null {
  const t = text.toLowerCase();
  if (/(renda\s*fixa|cdb|lci|lca|tesouro|deb[êe]nture|cra|cri)/.test(t)) return "Renda Fixa";
  if (/(renda\s*vari|a[çc][õo]es|bolsa|bdr|etf|fia)/.test(t)) return "Renda Variável";
  if (/(multimercado|long\s*short|macro|quant)/.test(t)) return "Multimercado";
  if (/(previd[êe]ncia|pgbl|vgbl)/.test(t)) return "Previdência";
  if (/(caixa|liquidez|conta)/.test(t)) return "Caixa";
  if (/(fundos?)/.test(t)) return "Fundos";
  return null;
}

// ---------------------------------------------------------------------------
//  TOOL DEFINITIONS
// ---------------------------------------------------------------------------

const portfolioOverview: ToolDef = {
  name: "portfolio_overview",
  description:
    "Resumo geral da carteira em escopo: patrimônio sob custódia (AUM), número de clientes, captação do mês e alocação por classe de ativo. Use para pedidos amplos como 'resumo da minha carteira', 'visão geral', 'como está meu portfólio'.",
  keywords: ["resumo", "visão geral", "visao geral", "panorama", "portfólio", "portfolio", "carteira", "overview", "como está", "como estao"],
  params: NO_PARAMS,
  run: ({ principal }) => {
    const scope = data.getScope(principal);
    const aum = data.totalAum(principal);
    const clients = data.clientCount(principal);
    const flows = data.netNewMoneyByMonth(principal);
    const lastMonth = flows[flows.length - 1];
    const allocation = data.allocationByAssetClass(principal);
    const cards: CardSpec[] = [
      {
        type: "kpi",
        title: "Patrimônio sob custódia",
        value: formatBRL(aum, { compact: true }),
        caption: scope.label,
        accent: "brand",
      },
      {
        type: "kpi",
        title: "Clientes ativos",
        value: formatNumber(clients),
        accent: "violet",
      },
      {
        type: "kpi",
        title: `Captação líquida — ${lastMonth ? formatMonth(lastMonth.label) : "mês"}`,
        value: formatBRL(lastMonth?.value ?? 0, { compact: true }),
        delta: lastMonth
          ? {
              label: lastMonth.value >= 0 ? "entrada líquida" : "resgate líquido",
              direction: lastMonth.value >= 0 ? "up" : "down",
            }
          : undefined,
        accent: (lastMonth?.value ?? 0) >= 0 ? "emerald" : "rose",
      },
      {
        type: "pie",
        title: "Alocação por classe de ativo",
        data: allocation,
        valueFormat: "brl_compact",
        caption: "Distribuição do portfólio por marcação a mercado",
      },
    ];
    return {
      narrative: `Aqui está o panorama de **${scope.label}**: ${formatBRL(aum, {
        compact: true,
      })} sob custódia em ${clients} clientes.`,
      cards,
    };
  },
};

const allocationByClass: ToolDef = {
  name: "allocation_by_class",
  description:
    "Distribuição do portfólio por classe de ativo (Renda Fixa, Renda Variável, Fundos, Multimercado, Previdência, Caixa). Use para 'alocação', 'distribuição do portfólio', 'como está dividido'.",
  keywords: ["alocação", "alocacao", "distribuição", "distribuicao", "dividido", "classe de ativo", "classes", "mix"],
  params: NO_PARAMS,
  run: ({ principal }) => {
    const allocation = data.allocationByAssetClass(principal);
    const total = allocation.reduce((a, b) => a + b.value, 0);
    const top = allocation[0];
    return {
      narrative: top
        ? `A maior exposição é em **${top.label}** (${formatPercent(top.value / (total || 1))} do portfólio).`
        : "Sem posições no escopo.",
      cards: [
        {
          type: "pie",
          title: "Alocação por classe de ativo",
          data: allocation,
          valueFormat: "brl_compact",
        },
        {
          type: "bar",
          title: "Exposição por classe (R$)",
          data: allocation,
          orientation: "horizontal",
          valueFormat: "brl_compact",
        },
      ],
    };
  },
};

const assetClassDetail: ToolDef = {
  name: "asset_class_detail",
  description:
    "Detalhe de uma classe de ativo específica: total investido, participação no portfólio e quebra por produto. Informe o parâmetro assetClass. Use para 'resumo da renda fixa', 'quanto tenho em ações', 'detalhe da previdência'.",
  keywords: ["renda fixa", "renda variável", "renda variavel", "ações", "acoes", "previdência", "previdencia", "multimercado", "fundos", "caixa", "detalhe", "quanto tenho em"],
  // Unknown/absent class is coerced to a safe default by the schema itself.
  params: z.object({
    assetClass: z
      .enum(ASSET_CLASSES as unknown as [AssetClass, ...AssetClass[]])
      .catch("Renda Fixa"),
  }),
  extract: (text) => {
    const cls = detectAssetClass(text);
    return cls ? { assetClass: cls } : {};
  },
  run: ({ principal }, params) => {
    // params is already validated against the schema above.
    const { assetClass } = params as { assetClass: AssetClass };
    const summary = data.assetClassSummary(principal, assetClass);
    return {
      narrative: `Em **${assetClass}** há ${formatBRL(summary.total, {
        compact: true,
      })} investidos — ${formatPercent(summary.pctOfPortfolio)} do portfólio.`,
      cards: [
        {
          type: "kpi",
          title: `Total em ${assetClass}`,
          value: formatBRL(summary.total, { compact: true }),
          delta: { label: `${formatPercent(summary.pctOfPortfolio)} do portfólio`, direction: "flat" },
          accent: "brand",
        },
        {
          type: "bar",
          title: `${assetClass} — por produto`,
          data: summary.byProduct,
          orientation: "horizontal",
          valueFormat: "brl_compact",
        },
      ],
    };
  },
};

const topClients: ToolDef = {
  name: "top_clients",
  description:
    "Maiores clientes por patrimônio no escopo, com segmento e perfil de risco. Parâmetro opcional limit (padrão 5). Use para 'meus maiores clientes', 'top 10 clientes'.",
  keywords: ["maiores clientes", "top clientes", "principais clientes", "ranking de clientes", "maiores contas"],
  // The schema coerces, defaults, then clamps to a safe integer range [1, 20];
  // run trusts it. (min/max would reject → default; a transform actually clamps.)
  params: z.object({
    limit: z
      .coerce.number()
      .int()
      .catch(5)
      .transform((n) => Math.min(20, Math.max(1, n))),
  }),
  extract: (text) => {
    const m = text.match(/\b(\d{1,2})\b/);
    return m ? { limit: Number(m[1]) } : {};
  },
  run: ({ principal }, params) => {
    const { limit } = params as { limit: number };
    const clients = data.topClients(principal, limit);
    return {
      narrative: `Top ${clients.length} clientes por patrimônio.`,
      cards: [
        {
          type: "table",
          title: `Maiores clientes (top ${clients.length})`,
          columns: [
            { key: "name", label: "Cliente", align: "left" },
            { key: "segment", label: "Segmento", align: "left" },
            { key: "riskProfile", label: "Perfil", align: "left" },
            { key: "aum", label: "Patrimônio", align: "right", format: "brl_compact" },
          ],
          rows: clients.map((c) => ({
            name: c.name,
            segment: c.segment,
            riskProfile: c.riskProfile,
            aum: c.aum,
          })),
        },
      ],
    };
  },
};

const netNewMoney: ToolDef = {
  name: "net_new_money",
  description:
    "Captação líquida (net new money) por mês no escopo, com total do período. Use para 'captação', 'quanto captei', 'evolução da captação'.",
  keywords: ["captação", "captacao", "captei", "net new money", "nnm", "entrada de recursos", "resgates"],
  params: NO_PARAMS,
  run: ({ principal }) => {
    const series = data.netNewMoneyByMonth(principal);
    const total = data.netNewMoneyTotal(principal);
    return {
      narrative: `Captação líquida no período: **${formatBRL(total, { compact: true })}**.`,
      cards: [
        {
          type: "kpi",
          title: "Captação líquida (período)",
          value: formatBRL(total, { compact: true }),
          delta: { label: total >= 0 ? "positiva" : "negativa", direction: total >= 0 ? "up" : "down" },
          accent: total >= 0 ? "emerald" : "rose",
        },
        {
          type: "line",
          title: "Captação líquida por mês",
          data: series.map((p) => ({ label: formatMonth(p.label), value: p.value })),
          valueFormat: "brl_compact",
        },
      ],
    };
  },
};

const riskDistribution: ToolDef = {
  name: "risk_distribution",
  description:
    "Distribuição do patrimônio por perfil de risco (suitability): Conservador, Moderado, Arrojado. Use para 'perfil de risco', 'suitability', 'aderência de risco'.",
  keywords: ["perfil de risco", "distribuição de risco", "distribuicao de risco", "risco", "conservador", "moderado", "arrojado"],
  params: NO_PARAMS,
  run: ({ principal }) => {
    const dist = data.riskDistribution(principal);
    return {
      narrative: "Distribuição do patrimônio por perfil de risco (ponderada por AUM).",
      cards: [
        { type: "pie", title: "Patrimônio por perfil de risco", data: dist, valueFormat: "brl_compact" },
      ],
    };
  },
};

// --- MANAGER-ONLY TOOLS ------------------------------------------------------

const teamRevenue: ToolDef = {
  name: "team_revenue",
  description:
    "RESTRITO A GESTORES. Receita bruta, comissões dos assessores e margem da empresa (YTD), com quebra por assessor. Use para 'faturamento da equipe', 'receita', 'comissões'.",
  requiredRole: "manager",
  keywords: ["receita", "faturamento", "comissão", "comissao", "comissões", "comissoes", "margem", "rentabilidade da equipe", "quanto a empresa"],
  params: NO_PARAMS,
  run: ({ principal }) => {
    const summary = data.commissionSummary(principal);
    const byAdvisor = data.revenueByAdvisor(principal);
    return {
      narrative: `Receita bruta YTD de **${formatBRL(summary.grossRevenueYtd, {
        compact: true,
      })}**; comissões dos assessores **${formatBRL(summary.advisorCommissionYtd, {
        compact: true,
      })}**; margem da empresa **${formatBRL(summary.firmMarginYtd, { compact: true })}**.`,
      cards: [
        { type: "kpi", title: "Receita bruta (YTD)", value: formatBRL(summary.grossRevenueYtd, { compact: true }), accent: "brand" },
        { type: "kpi", title: "Comissões pagas (YTD)", value: formatBRL(summary.advisorCommissionYtd, { compact: true }), accent: "amber" },
        { type: "kpi", title: "Margem da empresa (YTD)", value: formatBRL(summary.firmMarginYtd, { compact: true }), accent: "emerald" },
        {
          type: "bar",
          title: "Receita bruta por assessor",
          data: byAdvisor.map((r) => ({ label: r.advisorName, value: r.grossRevenueYtd })),
          orientation: "horizontal",
          valueFormat: "brl_compact",
        },
        {
          type: "table",
          title: "Detalhe por assessor",
          columns: [
            { key: "advisorName", label: "Assessor", align: "left" },
            { key: "aum", label: "AUM", align: "right", format: "brl_compact" },
            { key: "grossRevenueYtd", label: "Receita YTD", align: "right", format: "brl_compact" },
            { key: "advisorCommissionYtd", label: "Comissão YTD", align: "right", format: "brl_compact" },
          ],
          rows: byAdvisor.map((r) => ({
            advisorName: r.advisorName,
            aum: r.aum,
            grossRevenueYtd: r.grossRevenueYtd,
            advisorCommissionYtd: r.advisorCommissionYtd,
          })),
        },
      ],
    };
  },
};

const commissionByClass: ToolDef = {
  name: "commission_by_class",
  description:
    "RESTRITO A GESTORES. Receita e comissão por classe de ativo (YTD). Use para 'comissão por produto', 'de onde vem a receita'.",
  requiredRole: "manager",
  keywords: ["comissão por classe", "receita por classe", "receita por produto", "de onde vem a receita", "margem por produto"],
  params: NO_PARAMS,
  run: ({ principal }) => {
    const summary = data.commissionSummary(principal);
    return {
      narrative: "Composição da receita bruta por classe de ativo (YTD).",
      cards: [
        {
          type: "bar",
          title: "Receita bruta por classe (YTD)",
          data: summary.byAssetClass.map((c) => ({ label: c.label, value: c.revenue })),
          orientation: "horizontal",
          valueFormat: "brl_compact",
        },
        {
          type: "table",
          title: "Receita e comissão por classe",
          columns: [
            { key: "label", label: "Classe", align: "left" },
            { key: "revenue", label: "Receita YTD", align: "right", format: "brl_compact" },
            { key: "commission", label: "Comissão YTD", align: "right", format: "brl_compact" },
          ],
          rows: summary.byAssetClass.map((c) => ({ label: c.label, revenue: c.revenue, commission: c.commission })),
        },
      ],
    };
  },
};

const teamRanking: ToolDef = {
  name: "team_ranking",
  description:
    "RESTRITO A GESTORES. Ranking dos assessores por AUM e por captação líquida. Use para 'ranking da equipe', 'AUM por assessor', 'quem captou mais'.",
  requiredRole: "manager",
  keywords: ["ranking", "por assessor", "equipe", "quem captou", "aum por assessor", "melhores assessores", "comparar assessores"],
  params: NO_PARAMS,
  run: ({ principal }) => {
    const aum = data.aumByAdvisor(principal);
    const nnm = data.netNewMoneyByAdvisor(principal);
    return {
      narrative: "Ranking da equipe por patrimônio e por captação líquida.",
      cards: [
        { type: "bar", title: "AUM por assessor", data: aum, orientation: "horizontal", valueFormat: "brl_compact" },
        { type: "bar", title: "Captação líquida por assessor (período)", data: nnm, orientation: "horizontal", valueFormat: "brl_compact" },
      ],
    };
  },
};

// --- Suitability adherence (compliance, both roles) --------------------------

const suitabilityAdherence: ToolDef = {
  name: "suitability_adherence",
  description:
    "Aderência de suitability: quanto do patrimônio está investido em produtos compatíveis com o perfil de risco de cada cliente, e a lista de clientes desenquadrados (exposição acima do perfil). Use para 'aderência de suitability', 'enquadramento', 'clientes desenquadrados', 'compliance de risco'.",
  keywords: ["suitability", "aderência", "aderencia", "enquadramento", "desenquadrado", "desenquadramento", "adequação de perfil", "adequacao de perfil", "compliance de risco"],
  params: NO_PARAMS,
  run: ({ principal }) => {
    const s = data.suitabilityAdherence(principal);
    const cards: CardSpec[] = [
      {
        type: "kpi",
        title: "AUM aderente ao perfil",
        value: formatPercent(s.pctAdherent),
        accent: s.pctAdherent >= 0.9 ? "emerald" : s.pctAdherent >= 0.75 ? "amber" : "rose",
        caption: `${formatBRL(s.adherentAum, { compact: true })} aderente · ${formatBRL(s.misalignedAum, { compact: true })} acima do perfil`,
      },
      {
        type: "pie",
        title: "Enquadramento por AUM",
        valueFormat: "brl_compact",
        data: [
          { label: "Aderente", value: s.adherentAum },
          { label: "Acima do perfil", value: s.misalignedAum },
        ],
      },
    ];
    if (s.misalignedClients.length > 0) {
      cards.push({
        type: "table",
        title: "Clientes desenquadrados (exposição acima do perfil)",
        columns: [
          { key: "name", label: "Cliente", align: "left" },
          { key: "profile", label: "Perfil", align: "left" },
          { key: "worstClass", label: "Classe acima do perfil", align: "left" },
          { key: "misalignedAum", label: "Exposição", align: "right", format: "brl_compact" },
        ],
        rows: s.misalignedClients.slice(0, 10).map((c) => ({
          name: c.name,
          profile: c.profile,
          worstClass: c.worstClass,
          misalignedAum: c.misalignedAum,
        })),
      });
    } else {
      cards.push({
        type: "text",
        title: "Tudo enquadrado",
        tone: "neutral",
        body: "Nenhum cliente com exposição acima do seu perfil de risco. **100% aderente.**",
      });
    }
    return {
      narrative: `**${formatPercent(s.pctAdherent)}** do patrimônio está aderente ao perfil de suitability dos clientes.`,
      cards,
    };
  },
};

// --- Portfolio performance / rentabilidade (both roles) ----------------------

const portfolioPerformance: ToolDef = {
  name: "portfolio_performance",
  description:
    "Rentabilidade da carteira no período: retorno acumulado, comparação com o CDI e a evolução mês a mês. Use para 'rentabilidade', 'quanto rendeu', 'retorno da carteira', 'performance', 'rendimento'.",
  keywords: ["rentabilidade", "retorno", "rendimento", "performance", "quanto rendeu", "quanto rendi", "valorização", "valorizacao", "rende"],
  params: NO_PARAMS,
  run: ({ principal }) => {
    const series = data.performanceByMonth(principal);
    const cum = data.cumulativeReturn(principal);
    const cdiCum = data.benchmarkCumulative();
    const excess = cum - cdiCum;
    return {
      narrative: `Retorno acumulado de **${formatPercent(cum)}** no período (CDI: ${formatPercent(cdiCum)}).`,
      cards: [
        {
          type: "kpi",
          title: "Retorno acumulado (período)",
          value: formatPercent(cum),
          accent: cum >= 0 ? "emerald" : "rose",
          delta: { label: cum >= 0 ? "positivo" : "negativo", direction: cum >= 0 ? "up" : "down" },
        },
        {
          type: "kpi",
          title: "vs CDI",
          value: `${excess >= 0 ? "+" : ""}${formatPercent(excess)}`,
          accent: excess >= 0 ? "emerald" : "amber",
          delta: { label: excess >= 0 ? "acima do CDI" : "abaixo do CDI", direction: excess >= 0 ? "up" : "down" },
          caption: `CDI no período: ${formatPercent(cdiCum)}`,
        },
        {
          type: "line",
          title: "Rentabilidade mês a mês",
          valueFormat: "percent",
          data: series.map((p) => ({ label: formatMonth(p.label), value: p.value })),
        },
      ],
    };
  },
};

// --- Client detail / drill-down (both roles, scope-aware) --------------------

const clientDetail: ToolDef = {
  name: "client_detail",
  description:
    "Resumo da carteira de um cliente específico (patrimônio, perfil, segmento e alocação), respeitando o escopo do usuário. Informe o nome do cliente. Use para 'resumo do cliente Fulano', 'carteira do cliente X', 'posição do cliente'.",
  keywords: ["resumo do cliente", "carteira do cliente", "detalhe do cliente", "conta do cliente", "posição do cliente", "posicao do cliente", "dados do cliente", "cliente chamado"],
  params: z.object({ query: z.string().catch("") }),
  extract: (text) => ({ query: text }),
  run: ({ principal }, params) => {
    const query = (params as { query?: string }).query ?? "";
    const client = data.findClient(principal, query);
    if (!client) {
      return {
        narrative: "",
        cards: [
          {
            type: "text",
            title: "Cliente não encontrado",
            tone: "warning",
            body: "Não encontrei um cliente com esse nome na sua carteira. Confira o nome — você só tem acesso aos seus próprios clientes.",
          },
        ],
      };
    }
    return {
      narrative: `**${client.name}** — ${client.segment}, perfil ${client.riskProfile} · ${formatBRL(client.aum, { compact: true })} sob custódia.`,
      cards: [
        {
          type: "kpi",
          title: "Patrimônio do cliente",
          value: formatBRL(client.aum, { compact: true }),
          caption: `${client.segment} · ${client.riskProfile}`,
          accent: "brand",
        },
        {
          type: "pie",
          title: `Alocação — ${client.name}`,
          valueFormat: "brl_compact",
          data: client.allocation,
        },
        {
          type: "table",
          title: "Principais produtos",
          columns: [
            { key: "label", label: "Produto", align: "left" },
            { key: "value", label: "Valor", align: "right", format: "brl_compact" },
          ],
          rows: client.topProducts.map((p) => ({ label: p.label, value: p.value })),
        },
      ],
    };
  },
};

// --- Revenue by client segment (manager-only) --------------------------------

const revenueBySegment: ToolDef = {
  name: "revenue_by_segment",
  description:
    "RESTRITO A GESTORES. Receita, comissão e margem por segmento de cliente (Varejo, Private, Corporate). Use para 'receita por segmento', 'faturamento por tipo de cliente', 'de onde vem a receita por segmento'.",
  requiredRole: "manager",
  keywords: ["por segmento", "segmento", "varejo", "private", "corporate", "receita por segmento", "por tipo de cliente", "household"],
  params: NO_PARAMS,
  run: ({ principal }) => {
    const rows = data.revenueBySegment(principal);
    return {
      narrative: "Receita bruta e margem por segmento de cliente (YTD).",
      cards: [
        {
          type: "bar",
          title: "Receita bruta por segmento",
          orientation: "horizontal",
          valueFormat: "brl_compact",
          data: rows.map((r) => ({ label: r.segment, value: r.revenue })),
        },
        {
          type: "table",
          title: "Receita, comissão e margem por segmento",
          columns: [
            { key: "segment", label: "Segmento", align: "left" },
            { key: "aum", label: "AUM", align: "right", format: "brl_compact" },
            { key: "revenue", label: "Receita YTD", align: "right", format: "brl_compact" },
            { key: "commission", label: "Comissão YTD", align: "right", format: "brl_compact" },
            { key: "margin", label: "Margem YTD", align: "right", format: "brl_compact" },
          ],
          rows: rows.map((r) => ({
            segment: r.segment,
            aum: r.aum,
            revenue: r.revenue,
            commission: r.commission,
            margin: r.margin,
          })),
        },
      ],
    };
  },
};

// --- Goals / attainment (metas, both roles) ----------------------------------

function goalKpi(g: GoalProgress, accent: "brand" | "emerald"): CardSpec {
  return {
    type: "kpi",
    title: g.label,
    value: formatBRL(g.realized, { compact: true }),
    accent,
    goal: {
      target: formatBRL(g.target, { compact: true }),
      pct: Math.max(0, g.pct),
      caption: `GAP ${formatBRL(g.gap, { compact: true })} · projeção depende do ritmo`,
    },
  };
}

const goalsTracker: ToolDef = {
  name: "goals_tracker",
  description:
    "Metas e atingimento: realizado vs objetivo de captação (NNM) — e de receita, para gestores — com GAP e percentual de atingimento. Use para 'minhas metas', 'objetivo', 'atingimento', 'quanto falta para a meta'.",
  keywords: ["meta", "metas", "objetivo", "objetivos", "atingimento", "gap", "quanto falta"],
  params: NO_PARAMS,
  run: ({ principal }) => {
    const g = data.goalsFor(principal);
    const cards: CardSpec[] = [goalKpi(g.nnm, "brand")];
    if (g.receita) cards.push(goalKpi(g.receita, "emerald"));
    return {
      narrative: `Atingimento de captação: **${formatPercent(g.nnm.pct)}** da meta.`,
      cards,
    };
  },
};

export const TOOLS: ToolDef[] = [
  portfolioOverview,
  allocationByClass,
  assetClassDetail,
  topClients,
  netNewMoney,
  riskDistribution,
  suitabilityAdherence,
  portfolioPerformance,
  clientDetail,
  goalsTracker,
  teamRevenue,
  commissionByClass,
  teamRanking,
  revenueBySegment,
];

export function getTool(name: string): ToolDef | undefined {
  return TOOLS.find((t) => t.name === name);
}

/** Tools a principal is allowed to see/use, given their role. */
export function toolsForRole(role: Role): ToolDef[] {
  return TOOLS.filter((t) => !t.requiredRole || t.requiredRole === role);
}
