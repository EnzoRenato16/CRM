import type { CardSpec } from "@/lib/cards/schema";

/**
 * "Meu Painel" — a personal, persistent dashboard the user composes from a
 * catalog of ready-made cards. Each catalog entry maps to a natural-language
 * question that runs through the SAME secured /api/query path, so the board can
 * never show anything the user's role couldn't ask for in the chat.
 */

export type BoardRole = "advisor" | "manager";

export interface CatalogEntry {
  id: string;
  label: string;
  description: string;
  /** The question sent to /api/query to produce this card's content. */
  question: string;
  roles: BoardRole[];
}

export interface BoardItem {
  id: string;
  label: string;
  tool: string;
  /**
   * The natural-language question that produced this card. When present, the
   * board RE-RUNS it on load (through the secured /api/query), so the dashboard
   * always reflects the current data instead of a frozen snapshot.
   */
  question?: string;
  cards: CardSpec[];
}

export const BOARD_CATALOG: CatalogEntry[] = [
  { id: "overview", label: "Panorama da carteira", description: "Custódia, clientes e captação do mês", question: "Resumo da minha carteira", roles: ["advisor", "manager"] },
  { id: "goals", label: "Metas e atingimento", description: "Realizado vs objetivo, com GAP", question: "Minhas metas e atingimento", roles: ["advisor", "manager"] },
  { id: "performance", label: "Rentabilidade", description: "Retorno acumulado e vs CDI", question: "Rentabilidade da minha carteira", roles: ["advisor", "manager"] },
  { id: "allocation", label: "Alocação por classe", description: "Distribuição do portfólio", question: "Alocação por classe de ativo", roles: ["advisor", "manager"] },
  { id: "suitability", label: "Aderência de suitability", description: "Enquadramento de risco (compliance)", question: "Aderência de suitability", roles: ["advisor", "manager"] },
  { id: "top-clients", label: "Maiores clientes", description: "Top clientes por patrimônio", question: "Meus 10 maiores clientes", roles: ["advisor", "manager"] },
  { id: "nnm", label: "Captação líquida", description: "NNM mês a mês", question: "Minha captação líquida no período", roles: ["advisor", "manager"] },
  { id: "nnm-tree", label: "NNM consolidado", description: "Árvore Captação − Churn", question: "NNM consolidado, de onde vem a captação", roles: ["advisor", "manager"] },
  { id: "churn", label: "Churn e contas novas", description: "Evasão PF/PJ e ativações", question: "Churn e contas novas", roles: ["advisor", "manager"] },
  { id: "custody", label: "Faixas de custódia", description: "Clientes por tamanho", question: "Faixas de custódia", roles: ["advisor", "manager"] },
  { id: "nps", label: "NPS", description: "Satisfação e taxa de resposta", question: "NPS e satisfação", roles: ["advisor", "manager"] },
  { id: "risk", label: "Perfil de risco", description: "Distribuição por suitability", question: "Distribuição por perfil de risco", roles: ["advisor", "manager"] },
  // Prospecting funnel (CRM / Pipefy)
  { id: "meetings", label: "Reuniões (R1/R2)", description: "Agendadas, realizadas e no-shows", question: "Reuniões agendadas vs realizadas e no-shows", roles: ["advisor", "manager"] },
  { id: "funnel", label: "Conversão do funil", description: "R1 → R2 → Conta aberta", question: "Conversão do funil de captação", roles: ["advisor", "manager"] },
  { id: "fup", label: "Follow-up (FUP)", description: "Conversão, recuperados, régua", question: "FUPs realizados e taxa de conversão", roles: ["advisor", "manager"] },
  { id: "pipe", label: "Pipe & forecast", description: "Frio, forecast e quente", question: "Pipe e forecast da prospecção", roles: ["advisor", "manager"] },
  { id: "origins", label: "Origem dos leads", description: "Canais e conversão por origem", question: "Origem dos leads e conversão por origem", roles: ["advisor", "manager"] },
  // Manager-only
  { id: "team-revenue", label: "Faturamento da equipe", description: "Receita, comissões e margem", question: "Faturamento da equipe", roles: ["manager"] },
  { id: "revenue-segment", label: "Receita por segmento", description: "Varejo / Private / Corporate", question: "Receita por segmento de cliente", roles: ["manager"] },
  { id: "roa", label: "ROA da mesa", description: "Receita sobre custódia", question: "ROA da mesa", roles: ["manager"] },
  { id: "ranking", label: "Ranking dos assessores", description: "AUM e captação por assessor", question: "Ranking dos assessores", roles: ["manager"] },
  { id: "commission-class", label: "Receita por classe", description: "De onde vem a receita", question: "Receita por classe de ativo", roles: ["manager"] },
];

export function catalogFor(role: BoardRole): CatalogEntry[] {
  return BOARD_CATALOG.filter((e) => e.roles.includes(role));
}

const storageKey = (email: string) => `ac-board:${email || "anon"}`;

export function loadBoard(email: string): BoardItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(storageKey(email));
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? (parsed as BoardItem[]) : [];
  } catch {
    return [];
  }
}

export function saveBoard(email: string, items: BoardItem[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(email), JSON.stringify(items));
  } catch {
    /* quota / privacy mode — non-fatal */
  }
}

/** Append an item to the board and persist. Returns the new list. */
export function pinToBoard(email: string, item: BoardItem): BoardItem[] {
  const next = [...loadBoard(email), item];
  saveBoard(email, next);
  return next;
}

export function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
