-- ─────────────────────────────────────────────────────────────────────────
-- 001_init.sql  —  Time-series schema for AGT-07 Report Architect
-- ─────────────────────────────────────────────────────────────────────────

-- ── Test Runs ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS test_runs (
  id                SERIAL PRIMARY KEY,
  run_id            VARCHAR(64) UNIQUE NOT NULL,
  started_at        TIMESTAMPTZ NOT NULL,
  finished_at       TIMESTAMPTZ NOT NULL,
  total             INT NOT NULL DEFAULT 0,
  passed            INT NOT NULL DEFAULT 0,
  failed            INT NOT NULL DEFAULT 0,
  flaky             INT NOT NULL DEFAULT 0,
  skipped           INT NOT NULL DEFAULT 0,
  duration_ms       BIGINT NOT NULL DEFAULT 0,
  coverage_pct      NUMERIC(5,2),
  p0_coverage_pct   NUMERIC(5,2),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Test Failures ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS test_failures (
  id          SERIAL PRIMARY KEY,
  run_id      VARCHAR(64) NOT NULL REFERENCES test_runs(run_id) ON DELETE CASCADE,
  test_name   TEXT NOT NULL,
  -- GUARDRAIL: error_msg capped at 500 chars — avoids PII from stack traces
  error_msg   VARCHAR(500),
  retried     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Indexes ───────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_test_runs_started_at    ON test_runs (started_at DESC);
CREATE INDEX IF NOT EXISTS idx_test_failures_run_id    ON test_failures (run_id);
CREATE INDEX IF NOT EXISTS idx_test_failures_test_name ON test_failures (test_name);
CREATE INDEX IF NOT EXISTS idx_test_failures_created   ON test_failures (created_at DESC);

-- ── GDPR: 90-day auto-purge function ─────────────────────────────────────
-- GUARDRAIL: enforce 90-day data retention maximum
CREATE OR REPLACE FUNCTION purge_old_qa_data() RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  -- Failures cascade-delete when parent run is deleted
  DELETE FROM test_runs WHERE created_at < NOW() - INTERVAL '90 days';
  RAISE NOTICE 'QA data older than 90 days purged at %', NOW();
END;
$$;

-- ── Useful Views ──────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW vw_recent_runs AS
  SELECT
    run_id,
    started_at::date           AS run_date,
    passed,
    failed,
    total,
    ROUND(passed::numeric / NULLIF(total, 0) * 100, 1) AS pass_rate_pct,
    duration_ms,
    coverage_pct,
    p0_coverage_pct
  FROM test_runs
  WHERE started_at > NOW() - INTERVAL '90 days'
  ORDER BY started_at DESC;

CREATE OR REPLACE VIEW vw_flaky_tests AS
  SELECT
    test_name,
    COUNT(*) FILTER (WHERE retried = true)  AS flaky_count,
    COUNT(*)                                AS total_failures,
    ROUND(
      COUNT(*) FILTER (WHERE retried = true)::numeric / NULLIF(COUNT(*),0) * 100,
      1
    )                                       AS flakiness_index_pct
  FROM test_failures
  WHERE created_at > NOW() - INTERVAL '90 days'
  GROUP BY test_name
  HAVING COUNT(*) > 2
  ORDER BY flakiness_index_pct DESC;
