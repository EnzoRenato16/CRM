import type { Principal, Role, AssetClass } from "@/lib/data/types";
import { ASSET_CLASSES } from "@/lib/data/types";
import * as data from "@/lib/data/secure-access";
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
  /** JSON schema of parameters, used as the Anthropic tool input_schema. */
  jsonSchema: Record<string, unknown>;
  /** Extract parameters from raw text for the offline router. */
  extract?: (text: string) => Record<string, unknown>;
  run: (ctx: ToolContext, params: Record<string, unknown>) => ToolResult;
}

const EMPTY_SCHEMA = { type: "object", properties: {}, additionalProperties: false };

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
  jsonSchema: EMPTY_SCHEMA,
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
  jsonSchema: EMPTY_SCHEMA,
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
  jsonSchema: {
    type: "object",
    properties: {
      assetClass: {
        type: "string",
        enum: ASSET_CLASSES,
        description: "A classe de ativo a detalhar.",
      },
    },
    required: ["assetClass"],
    additionalProperties: false,
  },
  extract: (text) => {
    const cls = detectAssetClass(text);
    return cls ? { assetClass: cls } : {};
  },
  run: ({ principal }, params) => {
    // Validate the model/tool-supplied value against the allowed enum rather than
    // trusting the cast — unknown input falls back to a safe default.
    const requested = params.assetClass;
    const assetClass: AssetClass = (ASSET_CLASSES as string[]).includes(
      requested as string
    )
      ? (requested as AssetClass)
      : "Renda Fixa";
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
  jsonSchema: {
    type: "object",
    properties: {
      limit: { type: "integer", minimum: 1, maximum: 20, description: "Quantos clientes retornar." },
    },
    additionalProperties: false,
  },
  extract: (text) => {
    const m = text.match(/\b(\d{1,2})\b/);
    return m ? { limit: Math.min(20, Math.max(1, Number(m[1]))) } : {};
  },
  run: ({ principal }, params) => {
    // Clamp the model/tool-supplied limit to a safe integer range [1, 20].
    const rawLimit = Number(params.limit);
    const limit = Number.isFinite(rawLimit)
      ? Math.min(20, Math.max(1, Math.floor(rawLimit)))
      : 5;
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
  jsonSchema: EMPTY_SCHEMA,
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
  keywords: ["perfil de risco", "risco", "suitability", "conservador", "moderado", "arrojado", "aderência"],
  jsonSchema: EMPTY_SCHEMA,
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
  jsonSchema: EMPTY_SCHEMA,
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
  jsonSchema: EMPTY_SCHEMA,
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
  jsonSchema: EMPTY_SCHEMA,
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

export const TOOLS: ToolDef[] = [
  portfolioOverview,
  allocationByClass,
  assetClassDetail,
  topClients,
  netNewMoney,
  riskDistribution,
  teamRevenue,
  commissionByClass,
  teamRanking,
];

export function getTool(name: string): ToolDef | undefined {
  return TOOLS.find((t) => t.name === name);
}

/** Tools a principal is allowed to see/use, given their role. */
export function toolsForRole(role: Role): ToolDef[] {
  return TOOLS.filter((t) => !t.requiredRole || t.requiredRole === role);
}
