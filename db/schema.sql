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
