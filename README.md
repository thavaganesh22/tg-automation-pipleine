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
  │     AGT-01      │  TWO-PASS STRATEGY:
  │  Codebase       │  Pass A — walks full codebase; generates REGRESSION
  │  Analyst        │    scenarios covering existing behaviour.
  │                 │  Pass B — reads only PR-changed files; generates
  │                 │    NEW-FEATURE scenarios for introduced/modified code.
  │                 │  JIRA ticket extracted from PR title or branch (warns
  │                 │    if missing but does NOT block the pipeline).
  └────────┬────────┘
           │  scenarios.json  (scenarioScope: "regression" | "new-feature")
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
  │     AGT-03      │  BASELINE STRATEGY:
  │  Test Case      │  First run — generates all test cases; saves regression
  │  Designer       │    cases to regression-baseline.json (UUIDs stable).
  │                 │  Subsequent runs — loads baseline; generates only new
  │                 │    cases for new modules + new-feature scenarios.
  └────────┬────────┘
           │  test-cases.json  (regression baseline + new-feature cases)
           ▼
  ┌─────────────────┐
  │     AGT-04      │  SMART MERGE STRATEGY:
  │  Playwright     │  New module → full suite (POM → fixtures → spec).
  │  Engineer       │  Existing spec → merge new-feature cases only.
  │                 │  Remediation mode → append gap cases to existing spec.
  │                 │  POM always generated first; spec uses exact POM methods.
  └────────┬────────┘  TypeScript strict-mode check after each file.
           │  playwright-tests/
           ▼
  ┌─────────────────┐
  │     AGT-05      │  Builds traceability matrix (TC-ID → spec mapping).
  │  Coverage       │  Match by TC-ID comment (primary); fuzzy title (fallback).
  │  Auditor        │  Checks P0/P1 coverage thresholds (default 80%).
  │                 │  ⟳ If P0/P1 < 80% → triggers AGT-04 gap remediation.
  └────────┬────────┘  ❌ Still < 80% after remediation → pipeline halts
           │  coverage-report.json
           ▼
  ┌─────────────────┐
  │     AGT-06      │  Pre-flight TCP check — verifies app is reachable
  │  Test           │    before spawning Playwright (10 retries, 3 s apart).
  │  Executor       │  Executes Playwright suite (max 8 workers, 60s/test).
  │                 │  Retries flaky tests up to 2×.
  │                 │  Captures screenshots, traces, and videos on failure.
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

| Agent  | Name                 | Model             | Role                                                                                  |
| ------ | -------------------- | ----------------- | ------------------------------------------------------------------------------------- |
| AGT-01 | Codebase Analyst     | claude-opus-4-6   | Two-pass: full codebase → regression scenarios (Pass A); PR changed files → new-feature scenarios (Pass B) |
| AGT-02 | JIRA Story Validator | claude-opus-4-6   | Fetches JIRA story by key; deep code-vs-story alignment; FAIL verdict blocks pipeline                      |
| AGT-03 | Test Case Designer   | claude-opus-4-6   | Baseline strategy: generates all cases on first run; subsequent runs reuse baseline + only new cases        |
| AGT-04 | Playwright Engineer  | claude-opus-4-6   | Smart merge: new modules get full suite; existing specs get new-feature merge; POM generated before spec   |
| AGT-05 | Coverage Auditor     | —                 | Traceability matrix (TC-ID + fuzzy match); P0/P1 coverage gates; triggers AGT-04 gap remediation           |
| AGT-06 | Test Executor        | —                 | Pre-flight reachability check; executes Playwright suite; retries flaky tests; captures failure artifacts  |
| AGT-07 | Report Architect     | claude-sonnet-4-6 | PostgreSQL persistence; HTML dashboard; SLA alerting                                                       |

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
git clone https://github.com/thavaganesh22/tg-automation-pipleine.git
cd tg-automation-pipeline
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
TGDEMO-XXXXX   (case-insensitive, 1–6 digits)
```

Examples that will be detected:

```
# In PR title
feat: TGDEMO-12345 add payment gateway integration
fix: [TGDEMO-99] correct invoice rounding error

# In branch name
feat/TGDEMO-12345-payment-gateway
bugfix/TGDEMO-99-invoice-rounding
```

If no ticket is found in either the PR title or branch name, AGT-01 logs a warning and continues with `jiraTicket: "UNKNOWN-0"`. Regression Pass A always runs regardless of PR context; Pass B (new-feature scenarios) is skipped if no app-scoped changed files are found. Full JIRA traceability requires `PR_TITLE` or `PR_BRANCH` to contain the ticket key.

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

| Condition                   | Source | Detail                                                                             |
| --------------------------- | ------ | ---------------------------------------------------------------------------------- |
| Alignment FAIL              | AGT-02 | Code contradicts or is unrelated to the JIRA story                                |
| P0 coverage below threshold | AGT-05 | <80% P0 test coverage after gap remediation                                        |
| P1 coverage below threshold | AGT-05 | <80% P1 test coverage after gap remediation                                        |
| AGT-07 did not complete     | AGT-07 | Report Architect must finish for the check to pass                                 |

> **Note:** A missing JIRA ticket (`TGDEMO-xxxxx` not found in PR title or branch) logs a warning but does **not** block the pipeline. Regression analysis continues; new-feature scenarios require a valid ticket for full traceability.

**PR comment behaviour:**

- "Pipeline in progress" table posted immediately when the run starts
- Replaced with the full report when the pipeline finishes (pass or fail)
- Report includes: per-agent status, JIRA alignment verdict and findings, pass rate, coverage %, duration

### Job 2: `full-pipeline` — Push / Nightly / Manual

| Trigger                      | Behaviour                                                   |
| ---------------------------- | ----------------------------------------------------------- |
| Push to `main` or `develop`  | Full pipeline; AGT-01 scopes to the commit diff             |
| Nightly (`cron: 0 2 * * *`)  | Full pipeline at 02:00 UTC                                  |
| Manual (`workflow_dispatch`) | Supports `--from=N` (resume) and `--agent=N` (single agent) |

### Required GitHub Secrets

| Secret              | Description                         |
| ------------------- | ----------------------------------- |
| `ANTHROPIC_API_KEY` | Anthropic API key                   |
| `JIRA_TOKEN`        | JIRA API token (read-only)          |
| `DB_PASSWORD`       | PostgreSQL password                 |
| `SMTP_HOST`         | SMTP server hostname for SLA alerts |
| `SMTP_USER`         | SMTP username                       |
| `SMTP_PASS`         | SMTP password                       |

### Required GitHub Variables

| Variable             | Example                               |
| -------------------- | ------------------------------------- |
| `JIRA_HOST`          | `https://yourcompany.atlassian.net`   |
| `JIRA_PROJECT_KEY`   | `TGDEMO`                              |
| `STAGING_URL`        | `https://staging.yourapp.com`         |
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
│                               #   Each scenario tagged: scenarioScope = "regression" | "new-feature"
│                               #   Contains: jiraTicket, prNumber, changedFiles
├── validated-scenarios.json    # AGT-02 output → AGT-03 input
│                               #   Adds: jiraRef, alignmentVerdict, alignmentFindings,
│                               #         jiraSummary, jiraAcceptanceCriteria, coverageStatus
├── regression-baseline.json    # AGT-03 output (first run only) — stable regression test cases
│                               #   UUIDs preserved across runs; appended when new modules appear
├── test-cases.json             # AGT-03 output → AGT-04 + AGT-05 input
│                               #   = regression baseline + any new-feature cases for this PR
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
- Files larger than 300 KB are skipped with a logged warning
- AGT-03 generates at most `MAX_TEST_CASES` test cases (default: 500) per cycle
- Playwright hard timeout: **30 minutes** total; **60 seconds** per individual test
- Maximum **8 parallel workers**
- Flaky tests retried at most **2 times** before recording as failed
- Database auto-purges records older than 90 days (`purge_old_qa_data()`)

### AGT-05 → AGT-04 Feedback Loop

1. AGT-05 builds a traceability matrix — each test case matched by `TC-<id>` comment (primary) or fuzzy title (fallback)
2. AGT-05 identifies test case IDs with no matching Playwright spec
3. AGT-04 re-runs in `remediationMode` with only the gap cases — appends tests to existing specs (never overwrites)
4. AGT-05 re-checks coverage
5. If still below threshold → `process.exit(1)` — pipeline fails, PR blocked

### AGT-03 Regression Baseline

On the **first run**, AGT-03 generates all test cases and saves regression cases to `pipeline-state/regression-baseline.json`. UUIDs are stable across runs, ensuring consistent TC-ID traceability.

On **subsequent runs**, AGT-03 loads the baseline and only generates:
- New regression cases for modules that did not exist in the baseline
- New-feature cases for this PR's new-feature scenarios

The baseline is **additively updated** — new module cases are appended; nothing is ever removed.

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
2. Create a branch named with your ticket: `git checkout -b feat/TGDEMO-12345-description`
3. Make your changes — agents are isolated modules in `agents/`
4. Run `npm run typecheck && npm run lint` before committing
5. Open a PR — the pipeline runs automatically and posts a full report comment

---

## License

MIT — see [LICENSE](LICENSE) for details.

---

## Employee Directory App

A full-stack demo application bundled with this repo. It serves as the **target application** that the 7-agent QA pipeline tests — giving the pipeline a real codebase to analyse, real API specs to reference, and a running service to execute Playwright tests against.

### Stack

| Layer    | Technology                                          |
| -------- | --------------------------------------------------- |
| Frontend | React 18 + TypeScript + Vite + nginx                |
| Backend  | Node.js 20 + Express + Mongoose                     |
| Database | MongoDB 7                                           |
| Spec     | OpenAPI 3.1 (`employee-app/api-specs/openapi.yaml`) |

### Running locally with Docker Compose

```bash
# 1. Copy and edit environment
cp .env.example .env
# Set MONGO_ROOT_PASSWORD to something secure

# 2. Build and start all three services
docker compose up --build

# Services:
#   Frontend  →  http://localhost:3000
#   Backend   →  http://localhost:4000/api/health
#   MongoDB   →  localhost:27017
```

MongoDB is seeded automatically on first start with 12 realistic employee records across multiple departments and countries.

### Employee App Structure

```
employee-app/
├── frontend/               # React SPA
│   ├── src/
│   │   ├── api/            # Typed fetch wrappers (employeeApi.ts)
│   │   ├── components/     # EmployeesPage, EmployeeDrawer, EmployeeForm,
│   │   │                   # EmployeeTable, StatusBadge, Avatar, ConfirmDialog
│   │   ├── types/          # TypeScript interfaces matching OpenAPI schema
│   │   └── App.tsx
│   ├── nginx.conf          # SPA routing + /api proxy to backend
│   └── Dockerfile
│
├── backend/                # Express REST API
│   ├── src/
│   │   ├── config/         # Zod-validated env config
│   │   ├── models/         # Mongoose Employee model + enums
│   │   ├── routes/         # employees.ts — GET/POST/PATCH/DELETE
│   │   └── middleware/     # Zod validation, error handler
│   └── Dockerfile
│
├── mongo-init/
│   └── seed.js             # Auto-runs on first container start
│
└── api-specs/
    └── openapi.yaml        # Full OpenAPI 3.1 specification
```

### API Endpoints

| Method   | Path                 | Description                        |
| -------- | -------------------- | ---------------------------------- |
| `GET`    | `/api/health`        | Health check                       |
| `GET`    | `/api/employees`     | List with search/filter/pagination |
| `POST`   | `/api/employees`     | Create employee                    |
| `GET`    | `/api/employees/:id` | Get by ID                          |
| `PATCH`  | `/api/employees/:id` | Update fields                      |
| `DELETE` | `/api/employees/:id` | Delete employee                    |

Query parameters for `GET /api/employees`: `page`, `limit`, `search`, `department`, `status`.

### Development without Docker

```bash
# Terminal 1 — Backend (requires MongoDB running)
cd employee-app/backend
npm install
MONGODB_URI=mongodb://localhost:27017/employee_directory npm run dev

# Terminal 2 — Frontend
cd employee-app/frontend
npm install
npm run dev   # http://localhost:5173  (Vite proxies /api → localhost:4000)
```

### How the QA Pipeline uses this app

The `OPEN_API_PATH` in `.env.example` points to `employee-app/api-specs/openapi.yaml`. When the pipeline runs against a PR that modifies the employee app:

1. **AGT-01** scans changed files in `employee-app/`
2. **AGT-02** validates changes against the linked JIRA story
3. **AGT-03** designs test cases covering employee CRUD flows
4. **AGT-04** generates Playwright specs using the OpenAPI spec for HTTP mocks
5. **AGT-06** executes tests against `http://localhost:3000` (started by CI)
6. **AGT-07** reports results — pass rate, coverage, trend

The `ALLOWED_TEST_URLS` in `.env.example` includes `http://localhost:3000` so AGT-06's URL guardrail allows it.
