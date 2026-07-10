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

-- 0) BASELINE PRIVILEGES ------------------------------------------------------
--    Nothing is reachable without USAGE on the schema; deny PUBLIC by default so
--    a future broad GRANT can't silently re-open these tables. App roles receive
--    only the narrow, explicit grants defined below.

REVOKE ALL ON ALL TABLES IN SCHEMA advisory FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA advisory REVOKE ALL ON TABLES FROM PUBLIC;

GRANT USAGE ON SCHEMA advisory TO app_advisor, app_manager;

-- 1) ROW-LEVEL SECURITY -------------------------------------------------------
--    ENABLE turns policies on; FORCE also applies them to the table owner, so a
--    pooler/migration connection that forgets `SET LOCAL role` still cannot read
--    across scope. Every table that holds advisor-scoped data is forced.

ALTER TABLE advisors   ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients    ENABLE ROW LEVEL SECURITY;
ALTER TABLE positions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_flows ENABLE ROW LEVEL SECURITY;

ALTER TABLE advisors   FORCE ROW LEVEL SECURITY;
ALTER TABLE clients    FORCE ROW LEVEL SECURITY;
ALTER TABLE positions  FORCE ROW LEVEL SECURITY;
ALTER TABLE cash_flows FORCE ROW LEVEL SECURITY;

-- Advisors: only their own advisor row (name/email/team); managers: all.
CREATE POLICY advisor_self_row ON advisors
  FOR SELECT TO app_advisor
  USING (id = current_setting('app.current_advisor_id', true));

CREATE POLICY manager_advisors_all ON advisors
  FOR SELECT TO app_manager USING (true);

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

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log FORCE ROW LEVEL SECURITY;

-- Both roles may only APPEND to the trail (and use the id sequence). There is
-- deliberately no SELECT grant or policy: neither app role can read the log via
-- the application connection — audit reads use a separate, dedicated role, so an
-- advisor can never see another advisor's query history.
GRANT INSERT ON audit_log TO app_advisor, app_manager;
GRANT USAGE ON SEQUENCE audit_log_id_seq TO app_advisor, app_manager;

CREATE POLICY audit_insert_advisor ON audit_log
  FOR INSERT TO app_advisor
  WITH CHECK (advisor_id = current_setting('app.current_advisor_id', true));

CREATE POLICY audit_insert_manager ON audit_log
  FOR INSERT TO app_manager
  WITH CHECK (true);

-- 5) ANALYTICS TABLES: same row + column scope model --------------------------

ALTER TABLE advisor_goals       ENABLE ROW LEVEL SECURITY;
ALTER TABLE advisor_performance ENABLE ROW LEVEL SECURITY;
ALTER TABLE flow_breakdown      ENABLE ROW LEVEL SECURITY;
ALTER TABLE nps                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE advisor_goals       FORCE ROW LEVEL SECURITY;
ALTER TABLE advisor_performance FORCE ROW LEVEL SECURITY;
ALTER TABLE flow_breakdown      FORCE ROW LEVEL SECURITY;
ALTER TABLE nps                 FORCE ROW LEVEL SECURITY;

-- Advisors: only their own row; managers: all.
CREATE POLICY adv_goals_scope ON advisor_goals       FOR SELECT TO app_advisor USING (advisor_id = current_setting('app.current_advisor_id', true));
CREATE POLICY mgr_goals_all   ON advisor_goals       FOR SELECT TO app_manager USING (true);
CREATE POLICY adv_perf_scope  ON advisor_performance FOR SELECT TO app_advisor USING (advisor_id = current_setting('app.current_advisor_id', true));
CREATE POLICY mgr_perf_all    ON advisor_performance FOR SELECT TO app_manager USING (true);
CREATE POLICY adv_flow_scope  ON flow_breakdown      FOR SELECT TO app_advisor USING (advisor_id = current_setting('app.current_advisor_id', true));
CREATE POLICY mgr_flow_all    ON flow_breakdown      FOR SELECT TO app_manager USING (true);
CREATE POLICY adv_nps_scope   ON nps                 FOR SELECT TO app_advisor USING (advisor_id = current_setting('app.current_advisor_id', true));
CREATE POLICY mgr_nps_all     ON nps                 FOR SELECT TO app_manager USING (true);

-- Column privileges: advisors never see the commercial revenue target.
REVOKE ALL ON advisor_goals FROM app_advisor, app_manager;
GRANT SELECT (advisor_id, nnm_target) ON advisor_goals TO app_advisor;
GRANT SELECT (advisor_id, nnm_target, receita_target) ON advisor_goals TO app_manager;

GRANT SELECT ON advisor_performance, flow_breakdown, nps TO app_advisor, app_manager;
-- CDI is a public benchmark (no advisor scope, not sensitive).
GRANT SELECT ON cdi_benchmark TO app_advisor, app_manager;
