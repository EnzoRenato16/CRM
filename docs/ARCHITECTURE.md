# Arquitetura

Advisor Copilot é um **BI conversacional** para assessorias: o usuário pergunta em
português e a interface desenha os cards/gráficos na hora (o efeito “Power BI sob
demanda”), com controle de acesso de nível enterprise.

## Fluxo de uma pergunta

```
  Navegador (React)                         Servidor (Next.js, Node runtime)
  ─────────────────                         ─────────────────────────────────
  ChatPanel  ── POST /api/query ──▶  getPrincipal()            (sessão assinada)
                                          │  Principal { role, advisorId }
                                          ▼
                                     orchestrate(principal, message)
                                          │
             ┌────────────────────────────┼─────────────────────────────┐
             │ 1. curto-circuito de governança (assessor + intenção      │
             │    de receita → "acesso restrito")                        │
             │ 2. seleção de ferramenta:                                 │
             │      • Anthropic tool-calling  (se ANTHROPIC_API_KEY)      │
             │      • roteador determinístico (offline, padrão)          │
             │    → só ferramentas permitidas ao papel são oferecidas    │
             │ 3. re-check de requiredRole no servidor                   │
             │ 4. tool.run(ctx, params)                                  │
             │      └─ secure-access.ts  (RLS-equivalente, fail-closed)  │
             │ 5. valida cada card contra o schema Zod                   │
             └────────────────────────────┬─────────────────────────────┘
                                          ▼
   CardGrid  ◀── AssistantResponse ──  { narrative, cards[], meta }
   (renderiza componentes whitelisted: KPI, pie, bar, line, table, text)
```

O modelo (quando ativo) só escolhe **nome de ferramenta + parâmetros**. Ele nunca
vê linhas de dados nem escreve SQL. Ver [`SECURITY.md`](./SECURITY.md).

## Camadas

| Camada | Arquivos | Responsabilidade |
|--------|----------|------------------|
| **Auth / RBAC** | `lib/auth/*` | Sessão assinada (HMAC); em prod, JWT do Supabase/Cognito. Deriva o `Principal`. |
| **Dados (seguro)** | `lib/data/secure-access.ts` | Único ponto de acesso. Row scoping + column scoping + fail-closed. |
| **Store** | `lib/data/{store,seed}.ts` | Dataset semeado (em prod → PostgreSQL, `db/*.sql`). |
| **Ferramentas** | `lib/tools/registry.ts` | Funções parametrizadas e escopadas por papel que produzem cards. |
| **Orquestração** | `lib/llm/*` | Seleção de ferramenta (offline + Anthropic) + imposição de acesso + auditoria. |
| **Schema de cards** | `lib/cards/schema.ts` | Contrato Zod validado no servidor (generative UI). |
| **UI generativa** | `components/cards/*`, `components/chat/*` | Renderizadores whitelisted (Recharts). Nunca executa código do modelo. |

## Por que “tools” em vez de Text-to-SQL

Deixar o LLM escrever SQL livre em produção abre injection, exfiltração e risco de
uma query pesada derrubar o banco. Aqui o LLM escolhe entre um conjunto de queries
**pré-aprovadas e parametrizadas**, e o filtro de permissão é injetado no servidor.
Ganha-se segurança, previsibilidade, cache e testabilidade.

## Generative UI

O backend emite `CardSpec[]` (um union discriminado: `kpi | pie | bar | line |
table | text`). O schema é validado **antes** de chegar ao navegador. O front
renderiza apenas esses tipos, mapeando dados para componentes React fixos — sem
`eval`, sem `dangerouslySetInnerHTML` de conteúdo do modelo.

Paleta categórica dos gráficos validada com o método “compute, don’t eyeball”
(CVD-safe; contraste com relief via legendas). Variáveis CSS `--series-*` trocam
automaticamente entre claro/escuro.

## Stack

Next.js 14 (App Router) · TypeScript · Tailwind · Recharts · Zod ·
`@anthropic-ai/sdk` (opcional) · testes com `node:test` + `tsx`.

## Produção — próximos passos

- Trocar o store em memória por PostgreSQL (`db/schema.sql` + `db/policies.sql`),
  idealmente numa read replica / data mart.
- Trocar a sessão demo por Supabase Auth ou AWS Cognito (papel + `advisor_id`
  como claims).
- Usar Amazon Bedrock para manter o dado no boundary AWS.
- Persistir `audit_log`, adicionar evals das seleções de ferramenta e um
  rate-limit por usuário.
