# Advisor Copilot 🧭

**BI conversacional para assessorias de investimento.** O usuário pergunta em
português e a interface **desenha os cards e gráficos na hora** (o efeito “Power BI
sob demanda”), com **controle de acesso (RBAC) de nível enterprise** — assessores e
gestores, cada um com a sua visão segura.

> A ideia por trás do projeto: fazer o “UAU” (cards gerados por IA) **sem abrir mão
> da governança**. A regra de acesso é imposta no banco / na camada de dados —
> **nunca no prompt**. Comissão de um assessor jamais chega a outro, e o modelo não
> é a fronteira de segurança.

## O que dá para ver em 30 segundos

1. Entre como **assessora (Ana)** → peça *“Resumo da minha carteira”*. Surgem KPIs +
   um donut de alocação. Peça *“meus 5 maiores clientes”* → uma tabela. **Sem
   comissões.**
2. Ainda como Ana, peça *“quanto recebi de comissão?”* → **acesso restrito**, com a
   explicação de que a regra vale no banco, não no prompt.
3. Entre como **gestora (Gabriela)** → peça *“faturamento da equipe”* → receita,
   comissões, margem, ranking por assessor. **A mesma pergunta, resposta diferente,
   por papel.**

## Contas de demonstração

| Papel | E-mail | Senha | Vê |
|-------|--------|-------|-----|
| Assessora | `ana@assessoria.com` | `assessor123` | só a carteira dela, sem comissões |
| Assessor | `bruno@assessoria.com` | `assessor123` | outra carteira (prova o isolamento) |
| Gestora | `gestor@assessoria.com` | `gestor123` | toda a equipe, receita e comissões |

## Rodando localmente

```bash
npm install
npm run dev          # http://localhost:3000
```

Funciona **100% offline, sem nenhuma chave** — usa um roteador de intenção
determinístico e um dataset semeado em memória.

Para ligar o **LLM real** (Claude via tool-calling), copie `.env.example` para
`.env.local` e defina `ANTHROPIC_API_KEY`. O modelo passa a escolher a ferramenta;
a segurança continua imposta no servidor e na camada de dados.

```bash
npm test             # 10 testes de segurança (RBAC, isolamento, prompt injection)
npm run build        # build de produção
```

## Como a segurança funciona (resumo)

Toda resposta passa por **três verificações independentes**, nenhuma baseada no
texto do modelo:

1. o seletor só **enxerga** ferramentas permitidas ao papel;
2. o servidor re-checa `requiredRole` antes de executar;
3. a camada de dados (`src/lib/data/secure-access.ts`) filtra linhas por assessor e
   **lança exceção** em qualquer leitura de receita/cross-assessor por um assessor.

O LLM recebe **apenas o texto da pergunta** — nunca linhas de dados, nunca escreve
SQL. Detalhes em [`docs/SECURITY.md`](docs/SECURITY.md) e o mapeamento para
PostgreSQL RLS em [`db/policies.sql`](db/policies.sql).

## Documentação

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — camadas, fluxo de uma pergunta, stack.
- [`docs/SECURITY.md`](docs/SECURITY.md) — modelo de ameaça e as camadas de imposição.
- [`db/schema.sql`](db/schema.sql) + [`db/policies.sql`](db/policies.sql) — esquema e RLS de produção.

## Stack

Next.js 14 (App Router) · TypeScript · Tailwind CSS · Recharts · Zod ·
`@anthropic-ai/sdk` (opcional) · testes com `node:test`.

---

_Referência técnica. Substitua a sessão demo por Supabase Auth / AWS Cognito e o
store em memória por PostgreSQL para produção._
