# 🤖 7-Agent Autonomous QA Pipeline

> A fully automated QA testing pipeline powered by Claude. Every Pull Request triggers all 7 agents — from codebase analysis to test execution and stakeholder reporting. The PR check only passes after AGT-07 (Report Architect) completes successfully.

---

## Architecture

### Pull Request Flow

Every PR triggers the complete pipeline. All 7 agents run sequentially. The PR cannot be merged until AGT-07 finishes and all gates pass.

```
  Pull Request opened / updated
           │
           ▼
  ┌─────────────────┐
  │     AGT-01      │  Extracts tg-demo-xxxxx ticket from PR title or branch.
  │  Codebase       │  Scans only the files changed in this PR.
  │  Analyst        │  Generates PR-scoped test scenarios.
  └────────┬────────┘
           │  scenarios.json
           ▼
  ┌─────────────────┐
  │     AGT-02      │  Fetches the JIRA story by ticket key.
  │  JIRA Story     │  Deep code-vs-story alignment analysis:
  │  Validator      │    • Does code implement the story description?
  │                 │    • Are acceptance criteria addressed?
  │                 │    • Any scope creep or missing requirements?
  └────────┬────────┘  ❌ FAIL verdict → pipeline halts, PR blocked
           │  validated-scenarios.json
           ▼
  ┌─────────────────┐
  │     AGT-03      │  Expands scenarios into detailed step-by-step
  │  Test Case      │  test cases with positive and negative variants.
  │  Designer       │  Max 500 test cases per cycle.
  └────────┬────────┘
           │  test-cases.json
           ▼
  ┌─────────────────┐
  │     AGT-04      │  Generates Playwright Page Object Models,
  │  Playwright     │  HTTP mock fixtures, and spec files.
  │  Engineer       │  TypeScript strict mode validated after each file.
  └────────┬────────┘
           │  playwright-tests/
           ▼
  ┌─────────────────┐
  │     AGT-05      │  Builds traceability matrix (TC-ID → spec mapping).
  │  Coverage       │  Checks P0/P1 coverage thresholds (default 80%).
  │  Auditor        │  ⟳ If P0/P1 < 80% → triggers AGT-04 gap remediation.
  └────────┬────────┘  ❌ Still < 80% after remediation → pipeline halts
           │  coverage-report.json
           ▼
  ┌─────────────────┐
  │     AGT-06      │  Executes Playwright suite (max 8 workers, 60s/test).
  │  Test           │  Retries flaky tests up to 2×.
  │  Executor       │  Captures screenshots, traces, and videos on failure.
  └────────┬────────┘
           │  execution-result.json
           ▼
  ┌─────────────────┐
  │     AGT-07      │  Persists results to PostgreSQL (90-day history).
  │  Report         │  Generates HTML dashboard with trend analysis.
  │  Architect      │  Sends SLA alerts if pass rate < 95%.
  └────────┬────────┘
           │
           ▼
  ✅ PR check passes — merge is now allowed
  (or ❌ blocked if any gate above failed)
```

A live PR comment is posted when the pipeline starts and updated with the full report when it finishes, whether it passed or failed.

---

### Push / Schedule / Manual Flow

Pushes to `main`/`develop`, nightly schedule, and manual dispatch also run the full 7-agent pipeline. On push events, the diff between the current and previous commit is used as the changed-file scope for AGT-01.

---

## Agent Reference

| Agent | Name | Model | Role |
|-------|------|-------|------|
| AGT-01 | Codebase Analyst | claude-opus-4-6 | Extracts JIRA ticket from PR; scans changed files only; generates PR-scoped scenarios |
| AGT-02 | JIRA Story Validator | claude-opus-4-6 | Fetches JIRA story by key; deep code-vs-story alignment; FAIL verdict blocks pipeline |
| AGT-03 | Test Case Designer | claude-opus-4-6 | Expands scenarios into detailed manual test cases (positive + negative variants) |
| AGT-04 | Playwright Engineer | claude-opus-4-6 | Generates Page Object Models, HTTP mock fixtures, and Playwright spec files |
| AGT-05 | Coverage Auditor | claude-sonnet-4-6 | Traceability matrix; P0/P1 coverage gates; triggers AGT-04 gap remediation |
| AGT-06 | Test Executor | — | Executes Playwright suite; retries flaky tests; captures failure artifacts |
| AGT-07 | Report Architect | claude-sonnet-4-6 | PostgreSQL persistence; HTML dashboard; SLA alerting |

---

## Quick Start

### Prerequisites

- Node.js 20+
- PostgreSQL 15+ (for AGT-07 time-series reports)
- Anthropic API key
- JIRA API token (read-only)
- Staging/sandbox environment URL (never production)

### Setup

```bash
# 1. Clone and install
git clone https://github.com/your-org/qa-pipeline.git
cd qa-pipeline
npm install

# 2. Configure environment
cp .env.example .env
# Fill in your values — see .env.example for the full reference

# 3. Set up the database
npm run db:migrate

# 4. Run the full pipeline
npm run pipeline
```

### PR Naming Convention

AGT-01 extracts the JIRA ticket from the PR title or branch name. The ticket format is:

```
tg-demo-XXXXX   (case-insensitive, 1–6 digits)
```

Examples that will be detected:

```
# In PR title
feat: tg-demo-12345 add payment gateway integration
fix: [TG-DEMO-99] correct invoice rounding error

# In branch name
feat/tg-demo-12345-payment-gateway
bugfix/tg-demo-99-invoice-rounding
```

If no ticket is found in either the PR title or branch name, AGT-01 throws immediately and the pipeline halts before any LLM calls are made.

### Targeted Runs (local / manual CI)

```bash
# Full pipeline from scratch
npm run pipeline

# Resume from a specific agent (e.g. after fixing a coverage gap)
npm run pipeline -- --from=5

# Run a single agent only (for debugging)
npm run pipeline -- --agent=4

# Run only the Playwright specs (skip all AI agents)
npm run test:specs

# Serve the latest dashboard locally
npm run report:serve
```

---

## CI/CD

The workflow (`qa-pipeline.yml`) defines **two jobs**:

### Job 1: `pr-pipeline` — Pull Request Gate (all 7 agents)

Triggered on every PR open or update targeting `main` or `develop`. The PR status check only turns green after AGT-07 completes successfully. Timeout: 60 minutes.

**Blocking conditions — any of these fail the PR check:**

| Condition | Source | Detail |
|-----------|--------|--------|
| Missing JIRA ticket | AGT-01 | `tg-demo-xxxxx` not found in PR title or branch |
| Alignment FAIL | AGT-02 | Code contradicts or is unrelated to the JIRA story |
| P0 coverage below threshold | AGT-05 | <80% P0 test coverage after gap remediation |
| P1 coverage below threshold | AGT-05 | <80% P1 test coverage after gap remediation |
| AGT-07 did not complete | AGT-07 | Report Architect must finish for the check to pass |

**PR comment behaviour:**
- "Pipeline in progress" table posted immediately when the run starts
- Replaced with the full report when the pipeline finishes (pass or fail)
- Report includes: per-agent status, JIRA alignment verdict and findings, pass rate, coverage %, duration

### Job 2: `full-pipeline` — Push / Nightly / Manual

| Trigger | Behaviour |
|---------|-----------|
| Push to `main` or `develop` | Full pipeline; AGT-01 scopes to the commit diff |
| Nightly (`cron: 0 2 * * *`) | Full pipeline at 02:00 UTC |
| Manual (`workflow_dispatch`) | Supports `--from=N` (resume) and `--agent=N` (single agent) |

### Required GitHub Secrets

| Secret | Description |
|--------|-------------|
| `ANTHROPIC_API_KEY` | Anthropic API key |
| `JIRA_TOKEN` | JIRA API token (read-only) |
| `DB_PASSWORD` | PostgreSQL password |
| `SMTP_HOST` | SMTP server hostname for SLA alerts |
| `SMTP_USER` | SMTP username |
| `SMTP_PASS` | SMTP password |

### Required GitHub Variables

| Variable | Example |
|----------|---------|
| `JIRA_HOST` | `https://yourcompany.atlassian.net` |
| `JIRA_PROJECT_KEY` | `TG-DEMO` |
| `STAGING_URL` | `https://staging.yourapp.com` |
| `STAKEHOLDER_EMAILS` | `qa@company.com,eng-lead@company.com` |

---

## Project Structure

```
qa-pipeline/
├── agents/
│   ├── 01-codebase-analyst/      # AGT-01: PR-scoped scan, JIRA ticket extraction
│   ├── 02-jira-validator/        # AGT-02: Fetch story by key, deep alignment analysis
│   ├── 03-test-case-designer/    # AGT-03: Scenario expansion to test cases
│   ├── 04-playwright-engineer/   # AGT-04: POM + HTTP fixtures + spec generation
│   ├── 05-coverage-auditor/      # AGT-05: Traceability matrix + gap remediation loop
│   ├── 06-test-executor/         # AGT-06: Playwright execution + artifact capture
│   └── 07-report-architect/      # AGT-07: PostgreSQL + HTML dashboard + SLA alerts
│
├── orchestrator/
│   ├── index.ts                  # Main pipeline runner (--from=N, --agent=N)
│   ├── config.ts                 # Zod-validated env config loader
│   ├── logger.ts                 # Coloured terminal logger with elapsed time
│   └── state.ts                  # JSON-based inter-agent state in pipeline-state/
│
├── db/
│   ├── migrate.ts                # Migration runner
│   └── migrations/
│       └── 001_init.sql          # Schema: test_runs, test_failures, 90-day purge
│
├── playwright-tests/             # ← GENERATED by AGT-04 (not committed)
│   ├── pages/                    # Page Object Models
│   ├── fixtures/                 # HTTP mock fixtures
│   └── specs/                    # Playwright spec files
│
├── pipeline-state/               # ← Inter-agent JSON state (not committed)
├── test-results/                 # ← AGT-06 artifacts: screenshots, traces, videos
├── reports/                      # ← AGT-07 HTML dashboards
│
├── .github/workflows/
│   └── qa-pipeline.yml           # pr-pipeline job + full-pipeline job
│
├── playwright.config.ts
├── tsconfig.json
├── package.json
└── .env.example
```

---

## Inter-Agent Data Flow

All agents communicate through JSON files in `pipeline-state/`:

```
pipeline-state/
├── scenarios.json              # AGT-01 output → AGT-02 input
│                               #   Contains: jiraTicket, prNumber, changedFiles
├── validated-scenarios.json    # AGT-02 output → AGT-03 input
│                               #   Adds: jiraRef, alignmentVerdict, alignmentFindings,
│                               #         jiraSummary, jiraAcceptanceCriteria, coverageStatus
├── test-cases.json             # AGT-03 output → AGT-04 + AGT-05 input
├── coverage-report.json        # AGT-05 output → AGT-06 + AGT-07 input
├── execution-result.json       # AGT-06 output → AGT-07 input
└── traceability-matrix.json    # AGT-05 output (uploaded as CI artifact, 30-day retention)
```

The pipeline is **restartable at any agent**. If AGT-06 fails due to a flaky environment, fix the issue and run `--from=6` to resume without re-running the AI generation steps.

---

## Guardrails

### Security
- All secrets injected via environment variables — never hardcoded or logged
- JIRA API is **read-only** — agents never modify tickets
- AGT-01 redacts secrets (tokens, keys, passwords) from source code before any LLM call
- Test execution strictly limited to URLs in `ALLOWED_TEST_URLS` — never production
- Stakeholder report emails limited to the `STAKEHOLDER_EMAILS` allowlist
- AGT-06 error messages truncated to 500 characters before database storage (PII protection)

### Quality
- Pipeline halts if P0/P1 Playwright coverage falls below 80% (configurable)
- AGT-05 triggers a targeted AGT-04 **gap remediation pass** before halting
- TypeScript strict-mode compilation verified after every generated spec file
- Existing passing tests are **never overwritten** — AGT-04 uses a merge strategy
- All external HTTP calls in tests must use `page.route()` mocks — no live API traffic

### Operational
- AGT-01 scans at most `MAX_FILES_SCAN` files (default: 1,000) per run
- Files larger than 500KB are skipped with a logged warning
- AGT-03 generates at most `MAX_TEST_CASES` test cases (default: 500) per cycle
- Playwright hard timeout: **30 minutes** total; **60 seconds** per individual test
- Maximum **8 parallel workers**
- Flaky tests retried at most **2 times** before recording as failed
- Database auto-purges records older than 90 days (`purge_old_qa_data()`)

### AGT-05 → AGT-04 Feedback Loop

1. AGT-05 identifies test case IDs with no matching Playwright spec
2. AGT-04 re-runs in `remediationMode` with only the gap cases
3. AGT-05 re-checks coverage
4. If still below threshold → `process.exit(1)` — pipeline fails, PR blocked

---

## Database Schema

AGT-07 stores run history in PostgreSQL:

```sql
-- One row per pipeline execution
test_runs (
  id, run_id, started_at, finished_at,
  total, passed, failed, flaky, skipped,
  duration_ms, coverage_pct, p0_coverage_pct
)

-- One row per failed test (error_msg capped at 500 chars)
test_failures (
  id, run_id, test_name, error_msg VARCHAR(500),
  retried, created_at
)
```

**Views:**
- `vw_recent_runs` — 90-day window with `pass_rate_pct`
- `vw_flaky_tests` — flakiness index grouped by test name

---

## Contributing

1. Fork the repository
2. Create a branch named with your ticket: `git checkout -b feat/tg-demo-12345-description`
3. Make your changes — agents are isolated modules in `agents/`
4. Run `npm run typecheck && npm run lint` before committing
5. Open a PR — the pipeline runs automatically and posts a full report comment

---

## License

MIT — see [LICENSE](LICENSE) for details.
