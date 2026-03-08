# 7-Agent Autonomous QA Pipeline

> A fully automated QA testing pipeline powered by Claude. Every Pull Request triggers all 7 agents — from codebase analysis to test execution and Kibana reporting. The PR check only passes after AGT-07 (Report Architect) completes successfully.

---

## Architecture

### Pipeline flow

```
  Pull Request opened / updated
           │
           ▼
  ┌─────────────────┐
  │     AGT-01      │  Scans the full codebase; generates REGRESSION scenarios.
  │  Codebase       │  Scenario type controlled by --test-type flag:
  │  Analyst        │    ui   → browser interaction scenarios only
  │                 │    api  → HTTP endpoint scenarios only
  │                 │    both → UI + API scenarios (default)
  │                 │
  │  SKIPPED if     │  ⚡ Skipped automatically when pipeline-state/scenarios.json
  │  cached         │     already exists (use --regen-scenarios to force refresh).
  └────────┬────────┘
           │  scenarios.json  (regression only, tagged testType = "ui" | "api")
           ▼
  ┌─────────────────┐
  │     AGT-02      │  Fetches the JIRA story by ticket key.
  │  JIRA Story     │  Deep code-vs-story alignment analysis.
  │  Validator      │  Also generates new-feature UI + API scenarios from the
  │                 │    JIRA acceptance criteria + changed file context.
  │  ALWAYS runs    │  Always runs — this is what generates new tests for each PR.
  └────────┬────────┘  ❌ FAIL verdict → pipeline halts, PR blocked
           │  validated-scenarios.json  (regression + new-feature, all typed)
           ▼
  ┌─────────────────┐
  │     AGT-03      │  BASELINE STRATEGY:
  │  Test Case      │  First run — generates all cases; saves regression baseline.
  │  Designer       │  Subsequent runs — loads baseline; generates only new-feature
  │                 │    test cases from AGT-02 (regression UUIDs preserved).
  │  ALWAYS runs    │
  └────────┬────────┘
           │  test-cases.json  (testType on every case)
           ▼
  ┌─────────────────┐
  │     AGT-04      │  LIVE APP INSPECTION: headless Chromium browses
  │  Playwright     │  BASE_URL and discovers real [data-testid] attributes
  │  Engineer       │  before any code generation. Falls back to static
  │                 │  selector reference if app is unreachable.
  │                 │
  │                 │  TWO INDEPENDENT PIPELINES per module:
  │                 │  UI  → POM ({module}.page.ts)
  │                 │      + fixture ({module}.fixture.ts)
  │                 │      + spec ({module}.spec.ts)
  │                 │  API → shared fixture
  │                 │      + api spec ({module}.api.spec.ts, no POM)
  │  ALWAYS runs    │  Skips existing regression specs; merges only new-feature
  │                 │  tests into existing files.
  └────────┬────────┘
           │  playwright-tests/specs/
           ▼
  ┌─────────────────┐
  │     AGT-05      │  Audits UI and API coverage SEPARATELY.
  │  Coverage       │  *.spec.ts matched against UI cases.
  │  Auditor        │  *.api.spec.ts matched against API cases.
  │                 │  Blocks if EITHER type falls below P0/P1 threshold.
  │                 │  ⟳ Below threshold → triggers AGT-04 gap remediation.
  └────────┬────────┘  ❌ Still below after remediation → pipeline halts
           │  coverage-report.json  (overall + ui + api breakdowns)
           ▼
  ┌─────────────────┐
  │     AGT-06      │  Pre-flight TCP check — verifies app is reachable.
  │  Test           │  Filters specs by type via Playwright config.
  │  Executor       │  ✨ Auto-heal: classifies failures as "script" or "app";
  │                 │     rewrites script-broken specs via LLM and re-runs them.
  │                 │     Skipped if >50% of tests fail (app likely down).
  └────────┬────────┘
           │  execution-result.json
           ▼
  ┌─────────────────┐
  │     AGT-07      │  Indexes results to Elasticsearch:
  │  Report         │    qa-test-runs      — full run stats + UI/API breakdown
  │  Architect      │    qa-failed-tests   — one doc per failure, retried flag
  │                 │  Generates HTML dashboard artifact.
  └────────┬────────┘  Sends SLA alerts if pass rate < 95%.
           │
           ▼
  ✅ PR check passes — merge is now allowed
  (or ❌ blocked if any gate above failed)
```

A live PR comment is posted when the pipeline starts and updated with the full report when it finishes.

---

## Agent reference

| Agent  | Name                 | Model             | Role |
|--------|----------------------|-------------------|------|
| AGT-01 | Codebase Analyst     | claude-opus-4-6   | Full codebase scan → regression scenarios; cached across PR commits; `--regen-scenarios` to refresh |
| AGT-02 | JIRA Story Validator | claude-opus-4-6   | Alignment analysis + generates new-feature UI + API scenarios from JIRA story; always runs |
| AGT-03 | Test Case Designer   | claude-opus-4-6   | Loads regression baseline; generates new test cases only for new-feature scenarios; always runs |
| AGT-04 | Playwright Engineer  | claude-opus-4-6   | Inspects live app with headless Chromium to discover real `[data-testid]` selectors; UI pipeline: POM + fixture + spec; API pipeline: shared fixture + api.spec; merges new tests into existing specs |
| AGT-05 | Coverage Auditor     | —                 | Separate UI + API traceability matrices; blocks if either type fails P0/P1 threshold |
| AGT-06 | Test Executor        | claude-opus-4-6   | Playwright runner; auto-heal for script errors; classifies failures as script vs app |
| AGT-07 | Report Architect     | claude-sonnet-4-6 | Elasticsearch indexing; HTML report artifact; SLA alerting |

---

## Quick start

### Prerequisites

- Node.js 20+
- Docker + Docker Compose (for the target app and observability stack)
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
# Fill in: ANTHROPIC_API_KEY, JIRA_EMAIL, JIRA_TOKEN, JIRA_HOST, JIRA_PROJECT_KEY,
#          BASE_URL, ALLOWED_TEST_URLS

# 3. Start the target app + observability stack
docker compose up --build

# 4. Run the pipeline
npm run pipeline
```

### Services started by docker compose

| Service | URL | Purpose |
|---------|-----|---------|
| Frontend | http://localhost:3000 | Employee Directory app (test target) |
| Backend API | http://localhost:4000/api/health | Express REST API |
| Elasticsearch | http://localhost:9200 | Report storage |
| Kibana | http://localhost:5601 | Dashboard visualisation |

Kibana data views (`qa-test-runs`, `qa-failed-tests`) are created automatically by the `kibana-setup` one-shot container on first start.

---

## Test type flag

The `--test-type` flag (or `TEST_TYPE` env var) controls the entire pipeline end-to-end:

```bash
npm run pipeline                         # both UI and API (default)
npm run pipeline -- --test-type=ui       # UI tests only
npm run pipeline -- --test-type=api      # API tests only
```

| Flag | AGT-01 | AGT-03 | AGT-04 | AGT-05 | AGT-06 |
|------|--------|--------|--------|--------|--------|
| `both` (default) | UI + API scenarios | UI + API cases | `*.spec.ts` + `*.api.spec.ts` | Audits both separately | Runs all specs |
| `ui` | UI scenarios only | UI cases only | `*.spec.ts` only | UI audit only | `testIgnore: *.api.spec.ts` |
| `api` | API scenarios only | API cases only | `*.api.spec.ts` only | API audit only | `testMatch: *.api.spec.ts` |

---

## Regression baseline vs new-feature tests

The pipeline separates concerns between stable regression coverage and new tests for each PR's code changes.

### Regression scenarios (AGT-01)

AGT-01 scans the full codebase and produces regression scenarios that cover existing behaviour. These are **stable across PR runs** — they do not change unless the app gains entirely new modules.

On a normal PR run, AGT-01 is **skipped** if `pipeline-state/scenarios.json` already exists in the cache. The cached scenarios feed AGT-02 alongside the new-feature scenarios it generates.

To force a fresh regression scan (e.g. after adding a new major module to the app):

```bash
# CLI
npm run pipeline -- --regen-scenarios

# Environment variable
REGEN_SCENARIOS=true npm run pipeline

# GitHub Actions — workflow_dispatch input
regen_scenarios: true
```

### New-feature scenarios (AGT-02)

AGT-02 always runs. It reads the PR's changed files and JIRA story acceptance criteria to generate **new-feature scenarios** specific to this PR. These flow into AGT-03 and AGT-04, which append the new tests to existing spec files without touching the committed regression coverage.

### How this prevents spec regeneration bugs

Because regression scenarios are cached and spec files are never overwritten (only appended to), each PR run:

1. Uses the committed regression spec files as-is
2. Generates new-feature tests for only the new code changes
3. Appends those tests to the existing spec files
4. Deduplicates by test-case UUID before appending (prevents duplicate test titles)

---

## Auto-heal (AGT-06)

When Playwright tests fail, AGT-06 classifies each failure before deciding whether to escalate:

| Failure type | Examples | Action |
|---|---|---|
| `script` | `TimeoutError`, wrong selector, missing POM method, bad route pattern | LLM repairs the spec file and re-runs it |
| `app` | `ECONNREFUSED`, `net::ERR_*`, 5xx response, `Internal Server Error` | Surfaced as a real failure — not healed |

The heal cycle runs at most once per pipeline execution:

1. Failures are classified as `script` or `app`
2. Script failures are grouped by spec file
3. Each failing spec is rewritten by Claude with the constraint: *fix only infrastructure problems (selectors, route patterns, navigation paths) — never weaken assertions*
4. Only the healed spec files are re-run
5. Results are merged: run-1 results for non-healed files + run-2 results for healed files

**Guardrails:**
- Skipped if `AUTO_HEAL_ENABLED=false`
- Skipped if more than 50% of tests fail (app likely down, not a script issue)
- Only spec files are rewritten — never POMs or fixtures

Log output:
```
  [AGT-06] Auto-heal: 3 script errors (2 spec files) | 1 app error (skipped)
  [AGT-06] Healing playwright-tests/specs/employee-drawer.spec.ts ...
  [AGT-06] Re-running 2 healed spec file(s)...
  [AGT-06] Post-heal: 9/10 passed (90.0%) — was 7/10 (70.0%)
```

---

## Generated test files

AGT-04 writes to `playwright-tests/specs/`. The naming convention determines which pipeline each file belongs to:

```
playwright-tests/
  pages/        {module}.page.ts           — Page Object Models (UI pipeline only)
  fixtures/     {module}.fixture.ts        — Route mocks (shared between UI + API)
  specs/        {module}.spec.ts           — UI specs  (call POM methods only)
                {module}.api.spec.ts       — API specs (page.evaluate fetch, no POM)
```

**Live app inspection** — AGT-04 browses `BASE_URL` with headless Chromium before any generation to verify real `[data-testid]` selectors. The discovered list is injected into every POM and spec prompt alongside the static selector reference. If the app is unreachable, generation continues using the static reference only.

**UI spec rules** — enforced by AGT-04 prompt:
- Import and instantiate the POM; call its methods only — never `page.click/fill/goto` directly in a test
- Every test starts with `await setup{Module}Mocks(page)` then navigates via POM
- Only navigate to `/` (the app's single frontend route)
- Selectors use `data-testid` attributes

**API spec rules** — enforced by AGT-04 prompt:
- No POM import — no browser interaction
- HTTP calls via `page.evaluate(async () => fetch(...))` — never `page.request.*` (which bypasses `page.route()` mocks)
- Assert `response.status` and specific `response.body` fields
- URL patterns use trailing `**` (e.g. `**/api/employees**`) to match paginated/filtered variants

---

## Coverage audit (AGT-05)

Coverage is audited separately for UI and API:

```
[AGT-05] UI  — 18/20 covered (90.0%) | P0: 85.0% | P1: 88.0%
[AGT-05] API — 12/15 covered (80.0%) | P0: 75.0% | P1: 83.3%
```

The `CoverageReport` contains both overall aggregates and per-type breakdowns:

```typescript
coverageReport.ui.coveragePercent      // UI-only coverage %
coverageReport.api.p0CoveragePercent   // API P0 coverage %
coverageReport.blocked                 // true if EITHER type fails threshold
```

The pipeline blocks if **either** type's P0 or P1 coverage falls below the configured threshold. AGT-04 is automatically re-invoked in remediation mode to fill gaps before AGT-06 runs.

---

## Kibana dashboards

After the first pipeline run, open Kibana:

- **Local**: http://localhost:5601
- **Azure VM (CI)**: http://cbts-elastic-vm.eastus.cloudapp.azure.com:5601 (login: `elastic`)

Run the setup script once to create all data views, visualizations, and the dashboard:

```bash
# Local
npm run kibana:setup

# Azure VM
npm run kibana:setup:azure
```

The script is idempotent — re-running it overwrites existing objects with stable IDs.

Two data views are created:

| Index | Time field | Contents |
|-------|-----------|---------|
| `qa-test-runs` | `@timestamp` | One doc per run: pass rate, coverage %, UI/API fields, heal metadata, SLA status |
| `qa-failed-tests` | `@timestamp` | One doc per failed test: name, file, error (≤500 chars), `failureType`, `retried` flag |

**Dashboard panels:**

| Panel | Type | Source index |
|-------|------|-------------|
| Overall / P0 / UI / API Coverage | Metric tiles | `qa-test-runs` |
| Pass Rate Trend | Line chart | `qa-test-runs` |
| Test Type Distribution | Pie chart | `qa-test-runs` |
| Passed vs Failed per Run | Stacked bar | `qa-test-runs` |
| Run Duration Trend | Line chart | `qa-test-runs` |
| Failures by Spec File | Horizontal bar | `qa-failed-tests` |
| Flaky Tests Leaderboard | Table (`retried=true`) | `qa-failed-tests` |
| SLA Breach History | Table (`slaBreached=true`) | `qa-test-runs` |

---

## Targeted runs

```bash
# Resume from a specific agent (e.g. after fixing a coverage gap)
npm run pipeline -- --from=5

# Run a single agent only (for debugging)
npm run pipeline -- --agent=4

# Force AGT-01 to regenerate regression scenarios
npm run pipeline -- --regen-scenarios

# Run only the Playwright specs (skip all AI agents)
npm run test:specs
```

---

## PR naming convention

AGT-02 looks for the JIRA ticket in the PR title or branch name:

```
TGDEMO-XXXXX   (case-insensitive, 1–6 digits)
```

Examples:
```
feat: TGDEMO-12345 add payment gateway integration   ← PR title
feat/TGDEMO-12345-payment-gateway                    ← branch name
```

If no ticket is found, AGT-01 warns but continues. Regression analysis still runs; new-feature scenarios require a valid ticket for full traceability.

---

## CI/CD

The workflow (`.github/workflows/qa-pipeline.yml`) defines two jobs.

### Job 1: `pr-pipeline` — Pull Request Gate

Triggered on every PR open/update targeting `main` or `develop`. Timeout: 60 minutes.

**State caching:** `pipeline-state/` is cached per branch using GitHub Actions cache. This means:
- **First push on a branch**: no cache → AGT-01 runs, generates regression scenarios and test cases, saves cache
- **Subsequent pushes**: cache restored → AGT-01 skipped, AGT-02–07 run normally, new-feature tests generated for the code changes

**Blocking conditions:**

| Condition | Source | Detail |
|-----------|--------|--------|
| Alignment FAIL | AGT-02 | Code contradicts or is unrelated to the JIRA story |
| P0 UI coverage below threshold | AGT-05 | < 80% P0 coverage in UI specs after remediation |
| P0 API coverage below threshold | AGT-05 | < 80% P0 coverage in API specs after remediation |
| AGT-07 did not complete | AGT-07 | Report Architect must finish for the check to pass |

**PR comment** — posted immediately ("in progress") then updated with the full report:

```
| Test Type        | BOTH                       |
| Pass Rate        | 97.8%                      |
| Overall Coverage | 88.0%                      |
| P0 Coverage      | 84.0%                      |
| UI Coverage      | 90.0% (P0: 86.0%)          |
| API Coverage     | 85.0% (P0: 82.0%)          |
| Duration         | 127s                       |
```

### Job 2: `full-pipeline` — Manual Dispatch

Triggered via `workflow_dispatch`. Supports pipeline resume and scenario regeneration.

**Manual dispatch inputs:**

| Input | Default | Description |
|-------|---------|-------------|
| `from_agent` | `1` | Resume pipeline from this agent number (1–7) |
| `single_agent` | `0` | Run only this agent (0 = run all) |
| `test_type` | `both` | `ui` \| `api` \| `both` |
| `regen_scenarios` | `false` | Force AGT-01 to regenerate regression scenarios and rebuild all specs |

### Infrastructure in CI

Elasticsearch and Kibana run on a **persistent Azure VM** (`cbts-elastic-vm.eastus.cloudapp.azure.com`), provisioned once via `infra/azure/vm-setup.sh`. The pipeline indexes results directly to this VM — no observability containers are started in CI.

`docker compose` starts only the app services in CI:
```bash
docker compose up -d --build mongodb backend frontend
```

To provision or reprovision the Azure VM:
```bash
bash infra/azure/vm-setup.sh
```

### Required GitHub Secrets

| Secret | Description |
|--------|-------------|
| `ANTHROPIC_API_KEY` | Claude API key |
| `JIRA_EMAIL` | Atlassian account email (used for Basic auth alongside `JIRA_TOKEN`) |
| `JIRA_TOKEN` | JIRA API token — paired with `JIRA_EMAIL` for `Basic base64(email:token)` auth |
| `MONGO_ROOT_PASSWORD` | MongoDB root password |
| `ELASTICSEARCH_URL` | Full ES URL with credentials — `http://elastic:<pass>@cbts-elastic-vm.eastus.cloudapp.azure.com:9200` |
| `SMTP_HOST` | SMTP server for SLA alert emails |
| `SMTP_USER` | SMTP username |
| `SMTP_PASS` | SMTP password |

### Required GitHub Variables

| Variable | Example |
|----------|---------|
| `JIRA_HOST` | `https://yourcompany.atlassian.net` |
| `JIRA_PROJECT_KEY` | `TGDEMO` |
| `STAGING_URL` | `http://localhost:3000` |
| `STAKEHOLDER_EMAILS` | `qa@company.com,eng-lead@company.com` |
| `AZ_ELASTIC_HOST` | `cbts-elastic-vm.eastus.cloudapp.azure.com` |

---

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | Yes | Claude API key |
| `JIRA_EMAIL` | Yes | Atlassian account email — used with `JIRA_TOKEN` for Basic auth |
| `JIRA_TOKEN` | Yes | Atlassian API token — paired with `JIRA_EMAIL` |
| `JIRA_HOST` | Yes | e.g. `https://yourco.atlassian.net` |
| `JIRA_PROJECT_KEY` | Yes | e.g. `TGDEMO` |
| `BASE_URL` | Yes | Staging app URL — also used by AGT-04 for live app inspection |
| `ALLOWED_TEST_URLS` | Yes | Comma-separated allowed test targets (guardrail) |
| `ELASTICSEARCH_URL` | Yes (in CI) | Azure VM URL with credentials; defaults to `http://localhost:9200` for local runs |
| `TEST_TYPE` | No | `ui` \| `api` \| `both` (default `both`) |
| `REGEN_SCENARIOS` | No | Set to `true` to force AGT-01 to regenerate regression scenarios |
| `AUTO_HEAL_ENABLED` | No | Set to `false` to disable AGT-06 auto-heal (default: enabled) |
| `REPO_PATH` | No | Path to scan (default `./`) |
| `MAX_TEST_CASES` | No | Total case cap (default 500) |
| `MAX_CASES_PER_SCENARIO` | No | Per-scenario cap (default 10) |
| `MAX_CASES_PER_SPEC` | No | Per-module spec cap for AGT-04 (default 20) |
| `MAX_REGRESSION_SCENARIOS_PER_CHUNK` | No | AGT-01 chunk size (default 20) |
| `MIN_P0_COVERAGE` | No | Block threshold % (default 80) |
| `MIN_P1_COVERAGE` | No | Block threshold % (default 80) |
| `SLA_PASS_RATE` | No | Alert threshold 0–1 (default 0.95) |
| `STAKEHOLDER_EMAILS` | No | Comma-separated SLA alert recipients |
| `SMTP_HOST` / `SMTP_USER` / `SMTP_PASS` | No | Email transport for SLA alerts |

---

## Project structure

```
.
├── agents/
│   ├── 01-codebase-analyst/     AGT-01: codebase scan → regression scenarios (cached)
│   ├── 02-jira-validator/       AGT-02: JIRA alignment + new-feature scenario generation (always runs)
│   ├── 03-test-case-designer/   AGT-03: scenarios → typed test cases; regression baseline preserved
│   ├── 04-playwright-engineer/  AGT-04: UI pipeline (POM+fixture+spec) + API pipeline (fixture+api.spec)
│   ├── 05-coverage-auditor/     AGT-05: separate UI + API coverage audit; traceability matrix
│   ├── 06-test-executor/        AGT-06: Playwright runner; auto-heal for script errors
│   └── 07-report-architect/     AGT-07: Elasticsearch indexing + HTML report + SLA alerts
├── orchestrator/
│   ├── index.ts                 Pipeline entry point (--from=N, --agent=N, --test-type=X, --regen-scenarios)
│   ├── config.ts                Zod-validated env config loader
│   ├── logger.ts                Coloured terminal logger with elapsed timing
│   └── state.ts                 JSON inter-agent state in pipeline-state/
├── playwright-tests/
│   ├── pages/                   Page Object Models (generated by AGT-04)
│   ├── fixtures/                Route mock fixtures (generated by AGT-04)
│   ├── specs/                   UI specs (*.spec.ts) + API specs (*.api.spec.ts)
│   └── playwright.config.ts     Playwright configuration
├── pipeline-state/              Inter-agent JSON state (cached in CI)
├── test-results/                AGT-06 artifacts: screenshots, traces, videos
├── reports/                     AGT-07 HTML dashboards
├── employee-app/                Target application (MongoDB + Express + React)
├── infra/azure/                 Azure VM provisioning (Elastic Stack)
├── docker-compose.yml           App (mongodb/backend/frontend) + ES + Kibana + kibana-setup
├── .github/workflows/
│   └── qa-pipeline.yml          pr-pipeline job + full-pipeline job
└── .env.example                 All supported environment variables
```

---

## Inter-agent data flow

```
pipeline-state/
├── scenarios.json              AGT-01 → AGT-02  (regression; cached; skipped if exists)
├── validated-scenarios.json    AGT-02 → AGT-03  (+ alignmentVerdict, jiraRef, new-feature scenarios)
├── regression-baseline.json    AGT-03           (stable UUIDs; additive across runs)
├── test-cases.json             AGT-03 → AGT-04  (testType on every case)
├── coverage-report.json        AGT-05 → AGT-07  (overall + ui + api breakdowns)
├── execution-result.json       AGT-06 → AGT-07  (includes healAttempted, healedSpecs, scriptErrors, appErrors)
└── traceability-matrix.json    AGT-05 artifact  (uploaded to CI; 30-day retention)
```

The pipeline is **restartable at any agent**. Fix the issue and run `--from=6` to resume without re-running the AI generation steps.

---

## Guardrails

### Security

- All secrets injected via environment variables — never hardcoded or logged
- JIRA API is read-only — agents never modify tickets
- AGT-01 redacts secrets from source before any LLM call
- Test execution limited to URLs in `ALLOWED_TEST_URLS` — never production
- AGT-07 truncates error messages to 500 chars before Elasticsearch indexing (PII protection)

### Quality

- Pipeline blocks if P0/P1 coverage falls below 80% for **either** UI or API
- AGT-05 triggers a targeted AGT-04 gap remediation pass before blocking
- API calls in test files must use `page.evaluate(fetch)` — `page.request.*` bypasses `page.route()` mocks
- URL pattern `**/api/foo**` (trailing `**`) required for paginated/filterable endpoints
- AGT-04 validates generated TypeScript in three passes: (1) brace + paren depth — valid cut points are after `});` not just `}`, (2) `ts.transpileModule()` syntax check without import resolution, (3) second truncation pass if errors remain
- AGT-04 deduplicates by test-case UUID before appending to existing specs — prevents duplicate test titles
- AGT-02 uses `Authorization: Basic base64(email:token)` for Atlassian Cloud — Bearer tokens are rejected; if JIRA is unreachable the pipeline continues with a WARN verdict

### Operational

- AGT-01 scans at most `MAX_FILES_SCAN` files (default 1,000) per run
- AGT-03 generates at most `MAX_TEST_CASES` test cases (default 500) per cycle
- Playwright suite timeout: 15 minutes total; 20 seconds per test; 4 parallel workers (max 8)
- Auto-heal: 1 repair attempt per run; skipped if >50% of tests fail
- Flaky tests retried once before recording as failed

---

## Employee Directory App

A full-stack demo bundled with this repo, serving as the **target application** for the pipeline.

### Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + TypeScript + Vite + nginx |
| Backend | Node.js 20 + Express + Mongoose |
| Database | MongoDB 7 |
| Spec | OpenAPI 3.1 (`employee-app/api-specs/openapi.yaml`) |

### Running locally without the pipeline

```bash
docker compose up --build

# App:        http://localhost:3000
# API health: http://localhost:4000/api/health
# Kibana:     http://localhost:5601
```

MongoDB is seeded automatically on first start with 12 realistic employee records.

### API endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/health` | Health check |
| `GET` | `/api/employees` | List with search/filter/pagination (`?page`, `?limit`, `?search`, `?department`, `?status`) |
| `POST` | `/api/employees` | Create employee |
| `GET` | `/api/employees/:id` | Get by ID |
| `PATCH` | `/api/employees/:id` | Update fields |
| `DELETE` | `/api/employees/:id` | Delete employee |

List response shape (required by fixtures):
```json
{
  "data": [ /* EmployeeListItem[] */ ],
  "pagination": { "total": 42, "page": 1, "limit": 20, "pages": 3 }
}
```

### Frontend routing

The app has a single frontend route: `/`. React Router redirects all unknown paths back to `/`. Generated specs must **never navigate to `/employees`, `/employees/new`, or `/employees/:id`** — these do not exist as separate routes.

---

## Contributing

1. Fork the repository
2. Create a branch named with your ticket: `git checkout -b feat/TGDEMO-12345-description`
3. Make your changes — agents are isolated modules in `agents/`
4. Run `npm run typecheck` before committing
5. Open a PR — the pipeline runs automatically and posts a full report comment
