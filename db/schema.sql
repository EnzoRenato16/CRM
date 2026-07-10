-- =============================================================================
--  Advisor Copilot — PostgreSQL schema (production mapping)
-- =============================================================================
--  The running reference app uses an in-memory seeded store, but the security
--  model is designed to map 1:1 onto this PostgreSQL schema. In production you
--  point the app's data layer at these tables (ideally on a read replica /
--  analytical data mart) and let the database — not the LLM — enforce access.
--
--  Load order:  schema.sql  ->  policies.sql
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS advisory;
SET search_path TO advisory, public;

-- Case-insensitive email column type used by advisors.email below.
CREATE EXTENSION IF NOT EXISTS citext;

-- App-level roles map onto Postgres roles.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_advisor') THEN
    CREATE ROLE app_advisor NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_manager') THEN
    CREATE ROLE app_manager NOLOGIN;
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS advisors (
  id       text PRIMARY KEY,
  name     text NOT NULL,
  email    citext UNIQUE NOT NULL,
  team     text NOT NULL
);

CREATE TABLE IF NOT EXISTS clients (
  id            text PRIMARY KEY,
  name          text NOT NULL,
  advisor_id    text NOT NULL REFERENCES advisors(id),
  segment       text NOT NULL CHECK (segment IN ('Varejo','Private','Corporate')),
  risk_profile  text NOT NULL CHECK (risk_profile IN ('Conservador','Moderado','Arrojado'))
);
CREATE INDEX IF NOT EXISTS idx_clients_advisor ON clients(advisor_id);

CREATE TABLE IF NOT EXISTS positions (
  id                       text PRIMARY KEY,
  client_id                text NOT NULL REFERENCES clients(id),
  advisor_id               text NOT NULL REFERENCES advisors(id),
  asset_class              text NOT NULL,
  product                  text NOT NULL,
  market_value             numeric(18,2) NOT NULL,
  -- Commercially sensitive columns. Access is restricted by GRANT +
  -- column privileges in policies.sql — advisors have no SELECT on these.
  gross_revenue_ytd        numeric(18,2) NOT NULL,
  advisor_commission_ytd   numeric(18,2) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_positions_advisor ON positions(advisor_id);
CREATE INDEX IF NOT EXISTS idx_positions_client  ON positions(client_id);

CREATE TABLE IF NOT EXISTS cash_flows (
  id             text PRIMARY KEY,
  advisor_id     text NOT NULL REFERENCES advisors(id),
  month          text NOT NULL,          -- 'YYYY-MM'
  net_new_money  numeric(18,2) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cash_flows_advisor ON cash_flows(advisor_id);

-- Integrity: a position's advisor_id must always match its client's advisor_id.
-- RLS on positions filters purely by positions.advisor_id, so if these two ever
-- diverged (e.g. a client reassigned without updating their positions) a
-- position could surface in the wrong advisor's scoped view. This trigger makes
-- that state unrepresentable.
CREATE OR REPLACE FUNCTION advisory.check_position_advisor_matches_client()
RETURNS trigger AS $$
BEGIN
  IF NEW.advisor_id <> (SELECT advisor_id FROM advisory.clients WHERE id = NEW.client_id) THEN
    RAISE EXCEPTION
      'positions.advisor_id (%) must match clients.advisor_id for client %',
      NEW.advisor_id, NEW.client_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_position_advisor_consistency ON positions;
CREATE TRIGGER trg_position_advisor_consistency
  BEFORE INSERT OR UPDATE ON positions
  FOR EACH ROW EXECUTE FUNCTION advisory.check_position_advisor_matches_client();

-- =============================================================================
--  Analytics / operational tables (goals, performance, flows, NPS)
--  The in-memory store's secure-access layer maps 1:1 onto these; point the
--  data layer here to serve the same cards from real data.
-- =============================================================================

CREATE TABLE IF NOT EXISTS advisor_goals (
  advisor_id     text PRIMARY KEY REFERENCES advisors(id),
  nnm_target     numeric(18,2) NOT NULL,
  -- Commercial (sensitive): revenue target — managers only via column GRANT.
  receita_target numeric(18,2) NOT NULL
);

CREATE TABLE IF NOT EXISTS advisor_performance (
  advisor_id  text NOT NULL REFERENCES advisors(id),
  month       text NOT NULL,            -- 'YYYY-MM'
  return_pct  numeric(8,6) NOT NULL,    -- monthly return as a fraction
  PRIMARY KEY (advisor_id, month)
);
CREATE INDEX IF NOT EXISTS idx_perf_advisor ON advisor_performance(advisor_id);

CREATE TABLE IF NOT EXISTS cdi_benchmark (
  month       text PRIMARY KEY,
  return_pct  numeric(8,6) NOT NULL
);

CREATE TABLE IF NOT EXISTS flow_breakdown (
  advisor_id    text PRIMARY KEY REFERENCES advisors(id),
  captacao_new  numeric(18,2) NOT NULL,
  captacao_base numeric(18,2) NOT NULL,
  churn_pf      numeric(18,2) NOT NULL,   -- negative
  churn_pj      numeric(18,2) NOT NULL,   -- negative
  activations   integer NOT NULL
);

CREATE TABLE IF NOT EXISTS nps (
  advisor_id  text PRIMARY KEY REFERENCES advisors(id),
  promoters   integer NOT NULL,
  neutrals    integer NOT NULL,
  detractors  integer NOT NULL,
  sent        integer NOT NULL
);
