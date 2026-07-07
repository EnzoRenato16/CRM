# Camada de dados PostgreSQL (produção)

O app de referência roda com um store em memória (`src/lib/data/`), mas o modelo de
segurança foi desenhado para mapear 1:1 neste esquema PostgreSQL.

## Carregar

```bash
psql "$DATABASE_URL" -f schema.sql
psql "$DATABASE_URL" -f policies.sql
```

- `schema.sql` — tabelas (`advisors`, `clients`, `positions`, `cash_flows`), papéis
  `app_advisor` / `app_manager`.
- `policies.sql` — **Row-Level Security**, **privilégios de coluna** (comissão só
  para gestor), views seguras (`vw_positions_safe` / `vw_positions_full`) e a tabela
  `audit_log`.

## Identidade por requisição

Depois de autenticar (Supabase Auth / Cognito), a API abre uma transação e faz:

```sql
BEGIN;
SET LOCAL role = app_advisor;                 -- ou app_manager
SET LOCAL app.current_advisor_id = 'A-001';   -- vindo do JWT verificado, nunca do LLM
-- ... queries do copiloto ...
COMMIT;
```

O RLS filtra as linhas por `advisor_id`; os GRANTs de coluna impedem o assessor de
ler `gross_revenue_ytd` / `advisor_commission_ytd`. Ver
[`../docs/SECURITY.md`](../docs/SECURITY.md).
