# Modelo de segurança

> A tese central deste projeto: **o LLM nunca é a fronteira de segurança.** A
> governança de dados é imposta em código que fica entre a requisição e o dado —
> exatamente como Row-Level Security + privilégios de coluna no PostgreSQL fazem
> em produção. Instrução de prompt (“não mostre comissões”) **não** é controle de
> acesso e não é usada como tal aqui.

## Por que não confiar no prompt

Colocar a regra no prompt (“você é um ASSESSOR, nunca mostre comissões”) falha por
três motivos, todos inaceitáveis no mercado financeiro:

1. **Prompt injection** — o usuário pode instruir o modelo a ignorar as regras.
2. **Alucinação / erro** — o modelo pode simplesmente errar e vazar um dado.
3. **Auditoria** — não há como provar a um regulador que a regra “sempre vale”.

## As três camadas de imposição

Toda resposta passa por **três verificações independentes**. Nenhuma depende do
texto do modelo:

| Camada | Onde | O que garante |
|--------|------|---------------|
| 1. Ferramentas por papel | `toolsForRole()` em `orchestrator.ts` | O seletor (LLM ou offline) só **enxerga** ferramentas permitidas ao papel. Um assessor nunca recebe a ferramenta de receita. |
| 2. `requiredRole` no servidor | `orchestrate()` re-checa antes de executar | Mesmo que uma ferramenta restrita fosse escolhida, ela é bloqueada aqui. |
| 3. Camada de dados (fail-closed) | `secure-access.ts` / RLS no Postgres | Métodos de receita e cross-assessor chamam `assertManager()` e **lançam exceção**. Linhas são filtradas por `advisorId`. Colunas de comissão não existem em nenhum método acessível ao assessor. |

Além disso: uma **quarta** verificação de UX/governança bloqueia o assessor logo
na entrada quando ele menciona receita/comissão, respondendo com a mensagem de
“acesso restrito” em vez de uma interpretação parcial.

## Garantias concretas

- **Row scoping** — um assessor só lê linhas do seu `advisorId`. Verificado no
  teste “advisors see disjoint client books” e “firm AUM equals the sum of
  advisor AUMs”.
- **Column scoping** — `grossRevenueYtd` e `advisorCommissionYtd` só existem nos
  registros brutos privados do store; nenhum método acessível ao assessor os
  retorna. Verificado no teste “no advisor-reachable method exposes
  commission/revenue fields”.
- **Fail-closed** — `revenueByAdvisor`, `commissionSummary`, `aumByAdvisor`,
  `netNewMoneyByAdvisor`, `firmTotals` lançam `AuthorizationError` para
  assessores.
- **Resistente a prompt injection** — teste “prompt injection cannot escalate an
  advisor to manager data” envia um ataque explícito de escalonamento e confirma
  que o resultado nunca é a ferramenta de receita.

Rode tudo com `npm test` (17 testes).

## Mapeamento para produção (PostgreSQL)

`secure-access.ts` é o gêmeo, em código, de `db/policies.sql`:

- **Identidade** vem de um IdP verificado (Supabase Auth / AWS Cognito) como JWT,
  nunca de algo que o LLM produziu.
- Por requisição, dentro de uma transação: `SET LOCAL app.current_advisor_id` +
  `SET LOCAL role = app_advisor|app_manager`.
- **RLS** filtra linhas por `advisor_id`. **GRANTs de coluna** removem
  `gross_revenue_ytd` / `advisor_commission_ytd` do papel `app_advisor`.
- Views `vw_positions_safe` (sem receita) e `vw_positions_full` (com receita, só
  gestor) como defesa em profundidade.
- **`audit_log`** registra cada leitura (quem, papel, ferramenta, params,
  nº de linhas) — requisito de compliance.

## Endurecimento (revisão de segurança)

Uma revisão dedicada (RBAC/auth + camada de dados/RLS) motivou os reforços abaixo,
todos com testes ou verificação:

- **Segredo de sessão fail-closed** — `session.ts` **lança exceção** em produção se
  `AUTH_SECRET` estiver ausente ou fraco (< 32 chars), em vez de assinar cookies com
  uma constante pública (que permitiria forjar um cookie `role: "manager"`). Em dev,
  o fallback de conveniência é mantido para rodar sem setup.
- **Redação de coluna estrutural** — `scopedPositions()` agora devolve
  `SafePositionRecord` (sem `grossRevenueYtd`/`advisorCommissionYtd`). Um futuro
  card de assessor que tentasse repassar comissão **não compila** — o gêmeo em
  runtime do GRANT de coluna do PostgreSQL.
- **RLS forçada + `advisors` protegida** — `db/policies.sql` agora usa
  `FORCE ROW LEVEL SECURITY` em todas as tabelas, adiciona RLS/política para
  `advisors` (antes tinha SELECT amplo, vazando o roster), concede `USAGE` no schema,
  revoga de `PUBLIC` e protege `audit_log` (INSERT-only por papel, sem SELECT).
- **Validação de parâmetros do modelo** — `assetClass` é validado contra o enum e
  `limit` é limitado a `[1, 20]` antes de executar a ferramenta (nunca confiar na
  saída do LLM).
- **Rate limiting** — `/api/auth/login` (anti brute-force) e `/api/query`
  (custo/DoS de LLM) usam janela deslizante por IP/usuário.
- **Cabeçalhos de segurança** — `next.config.mjs` envia CSP, `X-Frame-Options`,
  `X-Content-Type-Options`, `Referrer-Policy` e HSTS.
- **Comparação de senha em tempo constante** e **dependência Next.js** atualizada
  para a linha 14.2.x corrigida (CVEs de bypass de middleware / DoS / SSRF).
- **Integridade de dados** — trigger garante `positions.advisor_id = clients.advisor_id`,
  evitando que uma posição apareça no escopo RLS do assessor errado.

> Para uma revisão completa multi-modelo, os `agents` da ECC (`security-reviewer`,
> `database-reviewer`) foram usados sobre esta base — recomendado a cada mudança
> em auth, RBAC ou na camada de dados.

## Dados sensíveis e o provedor de LLM

Dado financeiro de cliente **não** deve trafegar para uma API pública de LLM sem
avaliação de compliance (LGPD, cláusulas da CVM, DPA). Como a infra já é AWS,
prefira **Amazon Bedrock** para manter o modelo dentro do seu próprio boundary.
Neste projeto o LLM recebe **apenas o texto da pergunta** — nunca linhas de dados,
que são resolvidas server-side após a escolha da ferramenta.
