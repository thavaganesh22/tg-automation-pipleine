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
  │                 │  JIRA ticket extracted from PR title or branch name.
  └────────┬────────┘
           │  scenarios.json  (each tagged: testType = "ui" | "api")
           ▼
  ┌─────────────────┐
  │     AGT-02      │  Fetches the JIRA story by ticket key.
  │  JIRA Story     │  Deep code-vs-story alignment analysis.
  │  Validator      │  Also generates new-feature UI + API scenarios from the
  │                 │    JIRA acceptance criteria + changed file context.
  └────────┬────────┘  ❌ FAIL verdict → pipeline halts, PR blocked
           │  validated-scenarios.json  (regression + new-feature, all typed)
           ▼
  ┌─────────────────┐
  │     AGT-03      │  BASELINE STRATEGY:
  │  Test Case      │  First run — generates all cases; saves regression baseline.
  │  Designer       │  Subsequent runs — loads baseline; generates only new cases.
  │                 │  Each case typed: UI cases = browser steps only;
  │                 │    API cases = HTTP steps only (LLM cannot mix types).
  └────────┬────────┘
           │  test-cases.json  (testType on every case)
           ▼
  ┌─────────────────┐
  │     AGT-04      │  TWO INDEPENDENT PIPELINES per module:
  │  Playwright     │  UI  → POM ({module}.page.ts)
  │  Engineer       │      + fixture ({module}.fixture.ts)
  │                 │      + spec ({module}.spec.ts)
  │                 │  API → shared fixture
  │                 │      + api spec ({module}.api.spec.ts, no POM)
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
  │  Test           │  Filters specs by type via Playwright config:
  │  Executor       │    ui   → testIgnore: *.api.spec.ts
  │                 │    api  → testMatch:  *.api.spec.ts
  │                 │    both → all *.spec.ts (default)
  │                 │  Retries flaky tests up to 2×.
  └────────┬────────┘
           │  execution-result.json  (includes testType field)
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
| AGT-01 | Codebase Analyst     | claude-opus-4-6   | Full codebase scan → regression scenarios; `--test-type` controls UI/API scope |
| AGT-02 | JIRA Story Validator | claude-opus-4-6   | Alignment analysis + generates new-feature UI + API scenarios from JIRA story |
| AGT-03 | Test Case Designer   | claude-opus-4-6   | Type-aware case generation; UI cases = browser steps only, API cases = HTTP steps only |
| AGT-04 | Playwright Engineer  | claude-opus-4-6   | UI pipeline: POM + fixture + spec; API pipeline: shared fixture + api.spec (no POM) |
| AGT-05 | Coverage Auditor     | —                 | Separate UI + API traceability matrices; blocks if either type fails P0/P1 threshold |
| AGT-06 | Test Executor        | —                 | Playwright runner; testMatch/testIgnore to filter by test type; captures failure artifacts |
| AGT-07 | Report Architect     | claude-sonnet-4-6 | Elasticsearch indexing; Kibana for dashboards; HTML report artifact; SLA alerting |

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
# Fill in: ANTHROPIC_API_KEY, JIRA_TOKEN, JIRA_HOST, JIRA_PROJECT_KEY,
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

## Generated test files

AGT-04 writes to `playwright-tests/specs/`. The naming convention determines which pipeline each file belongs to:

```
playwright-tests/
  pages/        {module}.page.ts           — Page Object Models (UI pipeline only)
  fixtures/     {module}.fixture.ts        — Route mocks (shared between UI + API)
  specs/        {module}.spec.ts           — UI specs  (call POM methods only)
                {module}.api.spec.ts       — API specs (page.evaluate fetch, no POM)
```

**UI spec rules** — enforced by AGT-04 prompt:
- Import and instantiate the POM; call its methods only — never `page.click/fill/goto` directly
- Every test starts with `await setup{Module}Mocks(page)` then navigates via POM
- Only navigate to `/` (the app's single frontend route)

**API spec rules** — enforced by AGT-04 prompt:
- No POM import — no browser interaction
- HTTP calls via `page.evaluate(async (data) => fetch(url, {method, body: JSON.stringify(data)}), payload)`
- Assert `response.status` and specific `response.body` fields

---

## Coverage audit (AGT-05)

Coverage is audited separately for UI and API:

```
[AGT-05] Loaded 7 UI spec file(s), 7 API spec file(s)
[AGT-05] UI  — 18/20 covered (90.0%) | P0: 85.0% | P1: 88.0%
[AGT-05] API — 12/15 covered (80.0%) | P0: 75.0% | P1: 83.3%
```

The `CoverageReport` returned by AGT-05 contains both the overall aggregates (for orchestrator compatibility) and per-type breakdowns:

```typescript
coverageReport.ui.coveragePercent      // UI-only coverage %
coverageReport.api.p0CoveragePercent   // API P0 coverage %
coverageReport.blocked                 // true if EITHER type fails threshold
```

The pipeline blocks if **either** type's P0 or P1 coverage falls below the threshold. AGT-04 is automatically re-invoked in remediation mode to fill gaps before AGT-06 runs.

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
| `qa-test-runs` | `@timestamp` | One doc per run: pass rate, coverage %, UI/API flat fields, trend, SLA status, AI insights |
| `qa-failed-tests` | `@timestamp` | One doc per failed test: name, file, error (≤500 chars), `retried` flag |

**Dashboard panels (created automatically by `npm run kibana:setup`):**

| Panel | Type | Source index |
|-------|------|-------------|
| Overall / P0 / UI / API Coverage | Metric tiles | `qa-test-runs` |
| Pass Rate Trend | Line chart | `qa-test-runs` |
| Test Type Distribution | Pie chart | `qa-test-runs` |
| Passed vs Failed per Run | Stacked bar | `qa-test-runs` |
| Run Duration Trend | Line chart | `qa-test-runs` |
| Failures by Spec File | Horizontal bar | `qa-failed-tests` |
| Flaky Tests Leaderboard | Table (retried=true) | `qa-failed-tests` |
| SLA Breach History | Table (slaBreached=true) | `qa-test-runs` |

Data is retained indefinitely (no automatic purge) — add an ILM policy if retention limits are required.

---

## Targeted runs

```bash
# Resume from a specific agent (e.g. after fixing a coverage gap)
npm run pipeline -- --from=5

# Run a single agent only (for debugging)
npm run pipeline -- --agent=4

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

**Blocking conditions:**

| Condition | Source | Detail |
|-----------|--------|--------|
| Alignment FAIL | AGT-02 | Code contradicts or is unrelated to the JIRA story |
| P0 UI coverage below threshold | AGT-05 | < 80% P0 coverage in UI specs after remediation |
| P0 API coverage below threshold | AGT-05 | < 80% P0 coverage in API specs after remediation |
| AGT-07 did not complete | AGT-07 | Report Architect must finish for the check to pass |

**PR comment** — posted immediately ("in progress") then updated with the full report including UI/API coverage split:

```
| Test Type        | BOTH                       |
| Pass Rate        | 97.8%                      |
| Overall Coverage | 88.0%                      |
| P0 Coverage      | 84.0%                      |
| UI Coverage      | 90.0% (P0: 86.0%)          |
| API Coverage     | 85.0% (P0: 82.0%)          |
| Duration         | 127s                       |
```

### Job 2: `full-pipeline` — Push / Manual Dispatch

| Trigger | Behaviour |
|---------|-----------|
| Push to `main` or `develop` | Full pipeline; AGT-01 scopes to the commit diff |
| Manual (`workflow_dispatch`) | Supports `from_agent`, `single_agent`, and `test_type` inputs |

**Manual dispatch inputs:**

| Input | Default | Description |
|-------|---------|-------------|
| `from_agent` | `1` | Resume pipeline from this agent number |
| `single_agent` | `0` | Run only this agent (0 = run all) |
| `test_type` | `both` | `ui` \| `api` \| `both` |

### Infrastructure in CI

Elasticsearch and Kibana run on a **persistent Azure VM** (`cbts-elastic-vm.eastus.cloudapp.azure.com`), provisioned once via `infra/azure/vm-setup.sh`. The pipeline indexes results directly to this VM — no observability containers are started in CI.

`docker compose` starts only the app services:
```bash
docker compose up -d --build --wait mongodb backend frontend
```

To provision or reprovision the Azure VM:
```bash
bash infra/azure/vm-setup.sh
```

### Required GitHub Secrets

| Secret | Description |
|--------|-------------|
| `ANTHROPIC_API_KEY` | Claude API key |
| `JIRA_TOKEN` | JIRA API token (read-only) |
| `MONGO_ROOT_PASSWORD` | MongoDB root password |
| `ELASTICSEARCH_URL` | Full ES URL with credentials — `http://elastic:<pass>@cbts-elastic-vm.eastus.cloudapp.azure.com:9200` |

### Required GitHub Variables

| Variable | Example |
|----------|---------|
| `JIRA_HOST` | `https://yourcompany.atlassian.net` |
| `JIRA_PROJECT_KEY` | `TGDEMO` |
| `STAGING_URL` | `https://staging.yourapp.com` |
| `STAKEHOLDER_EMAILS` | `qa@company.com,eng-lead@company.com` |
| `AZ_ELASTIC_HOST` | `cbts-elastic-vm.eastus.cloudapp.azure.com` |

---

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | Yes | Claude API key |
| `JIRA_TOKEN` | Yes | Atlassian API token |
| `JIRA_HOST` | Yes | e.g. `https://yourco.atlassian.net` |
| `JIRA_PROJECT_KEY` | Yes | e.g. `TGDEMO` |
| `BASE_URL` | Yes | Staging app URL |
| `ALLOWED_TEST_URLS` | Yes | Comma-separated allowed test targets |
| `ELASTICSEARCH_URL` | Yes (in CI) | Azure VM URL with credentials; defaults to `http://localhost:9200` for local runs |
| `TEST_TYPE` | No | `ui` \| `api` \| `both` (default `both`) |
| `REPO_PATH` | No | Path to scan (default `./`) |
| `MAX_TEST_CASES` | No | Total case cap (default 500) |
| `MAX_CASES_PER_SCENARIO` | No | Per-scenario cap (default 10) |
| `MAX_JIRA_SCENARIOS` | No | Max scenarios AGT-02 generates from JIRA (default 15) |
| `MIN_P0_COVERAGE` | No | Block threshold % (default 80) |
| `MIN_P1_COVERAGE` | No | Block threshold % (default 80) |
| `SLA_PASS_RATE` | No | Alert threshold 0–1 (default 0.95) |
| `STAKEHOLDER_EMAILS` | No | Comma-separated SLA alert recipients |

---

## Project structure

```
.
├── agents/
│   ├── 01-codebase-analyst/     AGT-01: full codebase scan → typed regression scenarios
│   ├── 02-jira-validator/       AGT-02: JIRA alignment + new-feature UI/API scenario generation
│   ├── 03-test-case-designer/   AGT-03: scenarios → typed test cases (UI or API steps)
│   ├── 04-playwright-engineer/  AGT-04: UI pipeline (POM+fixture+spec) + API pipeline (fixture+api.spec)
│   ├── 05-coverage-auditor/     AGT-05: separate UI + API coverage audit; traceability matrix
│   ├── 06-test-executor/        AGT-06: Playwright runner with testMatch/testIgnore type filter
│   └── 07-report-architect/     AGT-07: Elasticsearch indexing + HTML report + SLA alerts
├── orchestrator/
│   ├── index.ts                 Pipeline entry point (--from=N, --agent=N, --test-type=X)
│   ├── config.ts                Zod-validated env config loader
│   ├── logger.ts                Coloured terminal logger
│   └── state.ts                 JSON inter-agent state in pipeline-state/
├── playwright-tests/            ← GENERATED by AGT-04 (not committed)
│   ├── pages/                   Page Object Models
│   ├── fixtures/                Route mock fixtures
│   └── specs/                   UI specs (*.spec.ts) + API specs (*.api.spec.ts)
├── pipeline-state/              ← Inter-agent JSON state (not committed)
├── test-results/                ← AGT-06 artifacts: screenshots, traces, videos
├── reports/                     ← AGT-07 HTML dashboards
├── employee-app/                Target application (MongoDB + Express + React)
├── docker-compose.yml           App (mongodb/backend/frontend) + ES + Kibana + kibana-setup
├── .github/workflows/
│   └── qa-pipeline.yml          pr-pipeline job + full-pipeline job
└── .env.example                 All supported environment variables
```

---

## Inter-agent data flow

```
pipeline-state/
├── scenarios.json              AGT-01 → AGT-02  (testType on every scenario)
├── validated-scenarios.json    AGT-02 → AGT-03  (+ alignmentVerdict, jiraRef, new-feature scenarios)
├── regression-baseline.json    AGT-03 (first run) — stable UUIDs preserved across runs
├── test-cases.json             AGT-03 → AGT-04 + AGT-05  (testType on every case)
├── coverage-report.json        AGT-05 → AGT-06 + AGT-07  (overall + ui + api breakdowns)
├── execution-result.json       AGT-06 → AGT-07  (testType field included)
└── traceability-matrix.json    AGT-05 output (uploaded as CI artifact, 30-day retention)
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

### Operational

- AGT-01 scans at most `MAX_FILES_SCAN` files (default 1,000) per run
- AGT-03 generates at most `MAX_TEST_CASES` test cases (default 500) per cycle
- Playwright timeout: 30 minutes total; 60 seconds per test; max 8 parallel workers
- Flaky tests retried at most 2 times before recording as failed

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
| `GET` | `/api/employees` | List with search/filter/pagination |
| `POST` | `/api/employees` | Create employee |
| `GET` | `/api/employees/:id` | Get by ID |
| `PATCH` | `/api/employees/:id` | Update fields |
| `DELETE` | `/api/employees/:id` | Delete employee |

Query parameters for `GET /api/employees`: `page`, `limit`, `search`, `department`, `status`.

---

## Contributing

1. Fork the repository
2. Create a branch named with your ticket: `git checkout -b feat/TGDEMO-12345-description`
3. Make your changes — agents are isolated modules in `agents/`
4. Run `npm run typecheck` before committing
5. Open a PR — the pipeline runs automatically and posts a full report comment
