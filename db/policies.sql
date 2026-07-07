-- =============================================================================
--  Advisor Copilot — Row-Level Security + column privileges (production)
-- =============================================================================
--  This is the REAL security boundary in production. It is the SQL twin of
--  src/lib/data/secure-access.ts. Even if the LLM emitted arbitrary SQL, the
--  database would refuse to return rows or columns outside the caller's scope.
--
--  How identity reaches the DB:
--    The API, after authenticating the user, opens/uses a connection and sets
--    two GUCs per request inside a transaction:
--        SET LOCAL app.current_advisor_id = 'A-001';
--        SET LOCAL role = app_advisor;          -- or app_manager
--    RLS policies read current_setting('app.current_advisor_id').
--    NEVER derive identity from anything the LLM produced.
-- =============================================================================

SET search_path TO advisory, public;

-- 1) ROW-LEVEL SECURITY -------------------------------------------------------

ALTER TABLE clients    ENABLE ROW LEVEL SECURITY;
ALTER TABLE positions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_flows ENABLE ROW LEVEL SECURITY;

-- Advisors: only their own rows.
CREATE POLICY advisor_clients_scope ON clients
  FOR SELECT TO app_advisor
  USING (advisor_id = current_setting('app.current_advisor_id', true));

CREATE POLICY advisor_positions_scope ON positions
  FOR SELECT TO app_advisor
  USING (advisor_id = current_setting('app.current_advisor_id', true));

CREATE POLICY advisor_cash_flows_scope ON cash_flows
  FOR SELECT TO app_advisor
  USING (advisor_id = current_setting('app.current_advisor_id', true));

-- Managers: full read across the team.
CREATE POLICY manager_clients_all    ON clients    FOR SELECT TO app_manager USING (true);
CREATE POLICY manager_positions_all  ON positions  FOR SELECT TO app_manager USING (true);
CREATE POLICY manager_cash_flows_all ON cash_flows FOR SELECT TO app_manager USING (true);

-- 2) COLUMN PRIVILEGES (commission / revenue) ---------------------------------
--    Advisors get SELECT on the non-sensitive columns ONLY. They have no
--    privilege on the revenue/commission columns at all — a `SELECT
--    gross_revenue_ytd ...` from an advisor connection fails with a
--    permission error, regardless of RLS.

REVOKE ALL ON positions FROM app_advisor, app_manager;

GRANT SELECT (id, client_id, advisor_id, asset_class, product, market_value)
  ON positions TO app_advisor;

GRANT SELECT  -- managers additionally get the sensitive columns
  (id, client_id, advisor_id, asset_class, product, market_value,
   gross_revenue_ytd, advisor_commission_ytd)
  ON positions TO app_manager;

GRANT SELECT ON clients, cash_flows, advisors TO app_advisor, app_manager;

-- 3) DEFENSE IN DEPTH: expose safe views the app queries by default -----------
--    Advisors read vw_positions_safe (no revenue columns). Managers read
--    vw_positions_full. RLS still applies underneath both views.

CREATE OR REPLACE VIEW vw_positions_safe
  WITH (security_invoker = true) AS
  SELECT id, client_id, advisor_id, asset_class, product, market_value
  FROM positions;

CREATE OR REPLACE VIEW vw_positions_full
  WITH (security_invoker = true) AS
  SELECT id, client_id, advisor_id, asset_class, product, market_value,
         gross_revenue_ytd, advisor_commission_ytd
  FROM positions;

GRANT SELECT ON vw_positions_safe TO app_advisor, app_manager;
GRANT SELECT ON vw_positions_full TO app_manager;

-- 4) AUDIT: every read the copilot performs should be logged --------------------
--    (who / role / tool / params / row-count). Financial-sector requirement.
CREATE TABLE IF NOT EXISTS audit_log (
  id          bigserial PRIMARY KEY,
  at          timestamptz NOT NULL DEFAULT now(),
  user_email  text NOT NULL,
  role        text NOT NULL,
  advisor_id  text,
  tool        text NOT NULL,
  params      jsonb,
  row_count   integer
);
