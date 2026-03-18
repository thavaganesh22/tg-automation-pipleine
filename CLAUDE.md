# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Run the full pipeline (all 7 agents)
npm run pipeline

# Resume pipeline from a specific agent
npm run pipeline -- --from=4

# Run a single agent
npm run pipeline -- --agent=3

# Filter test types (ui | api | both)
npm run pipeline -- --test-type=ui

# Force AGT-01 to regenerate scenarios (bypass cache)
npm run pipeline -- --regen-scenarios

# Force fresh browser inspection (bypass app-observations.json cache)
npm run pipeline -- --force-inspect

# Run pipeline AND allow new regression modules to be added to the baseline
npm run pipeline:add-regression

# Run pipeline with local Elasticsearch (localhost:9200)
npm run pipeline:local

# Standalone AGT-04 test generation (bypasses full pipeline)
npm run agent:playwright -- --cases pipeline-state/test-cases.json --base-url http://localhost:3000

# Start MCP server (Claude Code integration — exposes individual agents as tools)
npm run mcp:server

# Run generated Playwright tests
npm test                        # headless, uses playwright.config.ts at root
npm run test:headed             # headed browser
npm run test:specs              # specs only from playwright-tests/specs/

# TypeScript typecheck (no emit)
npm run typecheck

# Lint
npm run lint

# Format (TypeScript, JSON, Markdown, YAML)
npm run format

# Unit tests (Jest)
npm run test:unit

# Install all deps including employee-app workspaces
npm install-all

# Check Elasticsearch cluster health
npm run elastic:check

# Promote staged new-feature cases to regression baseline (run after pipeline, before merging)
npm run promote

# Update CLAUDE.md and README.md from current source files (run after significant changes)
npm run update-docs

# One-time Kibana setup (creates ES indices, data views, visualizations, dashboard)
npm run kibana:setup           # local docker-compose stack
npm run kibana:setup:azure     # Azure VM (CI environment)
```

## Architecture

This is a 7-agent LLM pipeline (powered by Claude via `@anthropic-ai/sdk`) that analyzes a target codebase and autonomously generates, runs, and reports on Playwright regression and new-feature tests.

**Entry point**: `orchestrator/index.ts` — runs agents sequentially, reads CLI flags, manages state.

### Agent sequence

| # | Directory | Role |
|---|-----------|------|
| AGT-01 | `agents/01-codebase-analyst/` | Walks `REPO_PATH`, generates `Scenario[]` tagged `regression` and `testType: ui\|api`. No new-feature scenarios — those come from AGT-02. |
| AGT-02 | `agents/02-jira-validator/` | Fetches JIRA story, validates PR alignment (PASS/WARN/FAIL verdict), and generates new-feature `Scenario[]` from acceptance criteria + code changes. FAIL verdict blocks the pipeline. |
| AGT-03 | `agents/03-test-case-designer/` | Converts scenarios to `TestCase[]` with UUIDs; uses `deterministicId()` (SHA1-based, `orchestrator/ids.ts`) for stable IDs across runs; maintains `regression-baseline.json`. Baseline is frozen by default — new regression modules only added with `--add-regression`. Stages new-feature cases to `pending-promotion.json` for promotion on PR merge. |
| AGT-04 | `agents/04-playwright-engineer/` | Uses observations from `shared/browser-inspector.ts` (`EnhancedAppStructure`) to generate observation-driven prompts with verified selectors, form defaults, API schemas, and dropdown options. Writes POM (`pages/`), fixtures (`fixtures/`), and spec files (`specs/`) to `playwright-tests/`. Also available as standalone CLI via `agents/04-playwright-engineer/cli.ts`. |
| AGT-05 | `agents/05-coverage-auditor/` | Checks spec files for `// TC-<uuid>` coverage comments; triggers AGT-04 remediation if below threshold; blocks pipeline if still below after remediation. |
| AGT-06 | `agents/06-test-executor/` | Runs Playwright tests against the staging URL; collects per-test `AllTestResult[]` for per-test ES indexing; auto-heals script errors via LLM. |
| AGT-07 | `agents/07-report-architect/` | Indexes to `qa-test-runs` (run stats), `qa-failed-tests` (one per failure), `qa-test-results` (one per test); HTML report artifact; SLA alerts; PR comment. |

### State management

Each agent writes its output to `pipeline-state/<key>.json` via `orchestrator/state.ts`. Agents read outputs of the previous agent from the same directory. The CI workflow caches `pipeline-state/` between runs so regression specs survive PR pushes without regeneration.

Key state files:
- `scenarios.json` — AGT-01 output (cached; regenerate with `--regen-scenarios`)
- `validated-scenarios.json` — AGT-02 output (regression + new-feature scenarios with JIRA enrichment)
- `test-cases.json` — AGT-03 output (combined regression + new-feature test cases)
- `regression-baseline.json` — stable regression test cases across runs (committed to repo)
- `pending-promotion.json` — new-feature cases staged for promotion to regression on PR merge (committed to PR branch by bot; consumed by `promote-on-merge` CI job or `npm run promote` locally)
- `coverage-report.json` — AGT-05 output
- `execution-result.json` — AGT-06 output
- `traceability-matrix.json` — test case → spec file mapping (AGT-05 output)
- `app-observations.json` — EnhancedAppStructure from `shared/browser-inspector.ts` (cached; bypass with `--force-inspect`)

### Generated test structure

```
playwright-tests/
  pages/          # Page Object Models (one per module, UI only)
  fixtures/       # page.route() mock helpers (shared by UI and API specs)
  specs/          # {module}.spec.ts (UI) | {module}.api.spec.ts (API)
  playwright.config.ts
```

Current spec files: `employee-create.spec.ts`, `employee-delete.spec.ts`, `employee-edit.spec.ts`, `employee-filters.spec.ts`, `employee-list.spec.ts`, `employee-pagination.spec.ts`, `employee-search.spec.ts`, `employee-validation.spec.ts` (UI) | `employee-create.api.spec.ts`, `employee-delete.api.spec.ts`, `employee-edit.api.spec.ts`, `employee-list.api.spec.ts`, `employee-search.api.spec.ts`, `employee-validation.api.spec.ts`, `error-handling.api.spec.ts`, `health.api.spec.ts` (API)

Current fixtures: `employee-create.fixture.ts`, `employee-delete.fixture.ts`, `employee-edit.fixture.ts`, `employee-list.fixture.ts`, `employee-search.fixture.ts`, `employee-validation.fixture.ts`, `error-handling.fixture.ts`, `health.fixture.ts`

### MCP server (`mcp/server.ts`)

Exposes individual agents as tools for Claude Code integration (stdio transport). Available tools: `generate_playwright_tests`, `design_test_cases`, `analyse_codebase`, `audit_coverage`, `execute_tests`. Start with `npm run mcp:server`.

### Shared types (`shared/types.ts`)

Single import point re-exporting all agent types: `Scenario`, `TestType`, `ValidatedScenario`, `TestCase`, `PlaywrightEngineerInput`, `CoverageReport`, `ExecutionResult`, `DashboardData`, etc. Also defines `EnhancedAppStructure` (live app observation type used by `shared/browser-inspector.ts` and `shared/browser-cache.ts`).

### Shared browser inspector (`shared/browser-inspector.ts`)

Runs once before the pipeline (orchestrated by `orchestrator/index.ts`) and produces an `EnhancedAppStructure` with: discovered `[data-testid]` selectors, form defaults, empty-submit validation errors, dropdown options (exact values), full API response shapes, filter/search behavior, route behavior, and UI timings. Results are cached to `pipeline-state/app-observations.json` (TTL: 30 min). Passed to AGT-01, AGT-04, and AGT-06 for observation-driven generation. Use `--force-inspect` to bypass cache.

### Target app (employee-app)

- React frontend on port 3000 (served via nginx in docker-compose), dev server on 5173
- Express/Node backend on port 4000, MongoDB
- **Only one frontend route: `/`** — React Router catch-all redirects everything else to `/`
- Employee list renders at `/`, not `/employees`
- API list response format: `{ data: EmployeeListItem[], pagination: { total, page, limit, pages } }`
- Enums: `DEPARTMENTS` (Engineering, Product, Design, QA, DevOps, Data, Marketing, Sales, HR, Finance, Legal, Operations, Other), `EMPLOYMENT_TYPES` (Full-Time, Part-Time, Contract, Intern), `EMPLOYMENT_STATUSES` (Active, On Leave, Terminated)
- Run the app via `docker compose up -d --build mongodb backend frontend`

## Configuration

Copy `.env.example` → `.env`. Required variables:

| Variable | Purpose |
|----------|---------|
| `ANTHROPIC_API_KEY` | Claude API key |
| `JIRA_EMAIL` | Atlassian account email (used for Basic auth with the API token) |
| `JIRA_TOKEN` | JIRA API token (paired with `JIRA_EMAIL`) |
| `JIRA_HOST` | e.g. `https://yourcompany.atlassian.net` |
| `JIRA_PROJECT_KEY` | e.g. `TGDEMO` |
| `BASE_URL` | Staging URL that Playwright tests hit (also used by AGT-04 for live app inspection) |
| `ELASTICSEARCH_URL` | Optional; used by AGT-07 for Kibana dashboard |
| `MONGO_ROOT_PASSWORD` | MongoDB root password (docker-compose) |
| `MONGODB_URI` | Backend MongoDB connection string |
| `CORS_ORIGIN` | Frontend CORS origin |

> **JIRA auth**: Atlassian Cloud requires Basic auth (`base64(email:token)`), not Bearer tokens. Both `JIRA_EMAIL` and `JIRA_TOKEN` must be set. Add `JIRA_EMAIL` as a GitHub secret alongside `JIRA_TOKEN`. If JIRA is unreachable, AGT-02 falls back to a WARN verdict and the pipeline continues.

Important guardrail env vars (all have defaults):
- `MIN_P0_COVERAGE=80`, `MIN_P1_COVERAGE=80` — AGT-05 blocks if below
- `SLA_PASS_RATE=1` in CI (100%); set `0.95` locally for a 95% threshold — AGT-06 blocks if below
- `MAX_CASES_PER_SPEC=20`, `MAX_REGRESSION_SCENARIOS_PER_CHUNK=20` — keeps LLM output within `max_tokens`
- `MAX_TEST_CASES=500`, `MAX_REGRESSION_CASES=50`, `MAX_NEW_FEATURE_CASES=50`
- `MAX_CASES_PER_SCENARIO=10`, `MAX_JIRA_SCENARIOS=15`
- `MAX_FILES_SCAN=1000` — codebase scan limit for AGT-01
- `TEST_TYPE=both|ui|api` — override test type filter via env (also set by `--test-type` flag)
- `ADD_REGRESSION=true` — allow new regression modules to be added to the baseline (default: false; use `--add-regression` flag or `npm run pipeline:add-regression`)

## CI/CD

`.github/workflows/qa-pipeline.yml` defines three jobs:

**Job 1 — `pr-pipeline`**: Runs on every PR to `main`/`develop`. The PR check only passes after AGT-07 completes.
1. Starts `employee-app` via `docker compose`
2. Restores `pipeline-state/` from cache (so regression specs aren't rebuilt from scratch)
3. Runs `npm run pipeline`
4. Commits updated `regression-baseline.json`, `pending-promotion.json`, and generated specs back to the PR branch (`git push origin HEAD:${{ github.head_ref }}`) with `[skip ci]` to prevent loop
5. Posts a structured QA report as a PR comment
6. Fails the check if the pipeline exits non-zero

**Job 2 — `full-pipeline`**: Runs on `workflow_dispatch`. Supports `--from`, `--agent`, `--test-type`, `--regen-scenarios`, `--force-inspect`, and `--add-regression` inputs.

**Job 3 — `promote-on-merge`**: Runs on `push` to `main` (i.e. when a PR is merged). Reads `pending-promotion.json`, promotes new-feature cases to `regression-baseline.json` with `caseScope: "regression"`, deletes `pending-promotion.json`, and commits to main with `[skip ci]`.

**CI browser strategy**: AGT-06 generates its own `playwright.config.ts` at runtime — Chromium only for both UI and API tests. The root `playwright.config.ts` is for local dev only (UI: Chromium + Firefox + WebKit; API: Chromium only).

**`setup-kibana` is a one-time operation**: The `scripts/setup-kibana.js` script must be run once after provisioning the Elastic stack. AGT-07 only calls the ES `_bulk` and `_doc` index APIs — it never recreates indices, data views, or Kibana dashboards.

## Critical patterns

- **LLM JSON extraction**: LLM output always comes wrapped in ` ```json ``` ` fences. Every agent uses multi-strategy `extractJSONArray()` — do not use simple regex on raw content.
- **Coverage tracking**: AGT-04 embeds `// TC-<uuid>` comments in every `test()` block. AGT-05 reads these to match test cases to specs. Missing these comments = false gap detection.
- **Remediation vs. overwrite**: In remediation mode, AGT-04 _appends_ gap test cases to existing specs (`mergeNewFeatureCases`) — it never regenerates from scratch, which would destroy existing coverage.
- **Deterministic UUIDs**: `deterministicId()` in `orchestrator/ids.ts` generates SHA1-based IDs — same input always produces the same ID. Keeps test-case UUIDs stable across pipeline runs even with minor LLM title drift.
- **URL patterns in fixtures**: `**/api/employees` does NOT match query-param URLs. Always use trailing `**`: `**/api/employees**`.
- **API calls in POMs — two distinct patterns**:
  - **Test-data helpers** (`createEmployee`, `deleteEmployee`, `getFirstEmployeeId`): MUST use `page.request.*` — runs at Node.js level, works before `navigate()` (page may be `about:blank`), never intercepted by `page.route()` mocks. Use absolute URL: `${process.env.BASE_URL ?? 'http://localhost:3000'}/api/...`
  - **In-test assertion calls** (after `navigate()`, for API state checks): Use `page.evaluate(async () => fetch(...))` so `page.route()` mocks intercept them correctly.
  - **NEVER** use `page.evaluate(fetch)` for `createEmployee`/`deleteEmployee`/`getFirstEmployeeId` — browser context is `about:blank` before navigation, causing "Failed to fetch" or "Failed to parse URL".
- **Test setup order**: Always call `po.navigate()` FIRST, then `po.createEmployee()`, then `po.navigate()` again to reload the list. Or use `page.request` helpers which work in any order.
- **AGT-04 live app inspection**: Before AGT-01 runs, `orchestrator/index.ts` calls `shared/browser-inspector.ts` which launches headless Chromium, browses `BASE_URL`, and collects selectors, form behavior, API schemas, and route behavior into `EnhancedAppStructure`. Results cached to `pipeline-state/app-observations.json` (30-min TTL; bypass with `--force-inspect`). Passed to AGT-01, AGT-04, and AGT-06. AGT-04's `generateBehaviorContext()` converts observations into compact verified-fact prompts. Falls back gracefully if the app is unreachable.
- **Spec truncation guard — three passes**: AGT-04's `writeChecked()` validates generated TypeScript in three passes: (1) `syntaxDepth()` checks brace **and** paren balance — valid cut points are after `});` not just `}` (cutting at `}` alone leaves `test.describe(` unclosed); (2) `checkTypeScriptSyntax()` uses `ts.transpileModule()` for full syntax validation without import resolution; (3) if a syntax error remains, a second `truncateToBalanced()` pass is applied.
- **Duplicate test prevention**: `extractExistingTestIds()` reads `// TC-<uuid>` from existing specs before any merge call; already-covered cases are filtered out before the LLM call.
- **Per-test ES indexing**: AGT-06 collects `AllTestResult[]` (one entry per test: `title`, `suite`, `file`, `testType`, `status`, `durationMs`, `retried`) via `walkSuites()` from the Playwright JSON report. AGT-07 bulk-indexes these to `qa-test-results` using `/_bulk` with `application/x-ndjson`. Documents include `runId` for correlation with `qa-test-runs`.
- **ES field naming — plain keyword vs `.keyword`**: Fields declared as `keyword` type in the explicit ES mapping (e.g. `testType`, `status`, `suite`) must be referenced **without** `.keyword` in Kibana terms aggregations. Fields declared as `text` with a `keyword` sub-field (e.g. `testName`) require `.keyword` for terms aggregation. Mismatching causes "No results found" in Kibana visualizations.
- **Kibana setup is idempotent but one-time**: `setup-kibana.js` uses stable saved-object IDs — re-running it safely overwrites existing objects. However, it must be run manually once after provisioning; it is not called by the pipeline itself.
- **Browser strategy (AGT-06)**: AGT-06 generates a fresh `playwright.config.ts` per run (Chromium only, for both UI and API). The root `playwright.config.ts` is only used for local `npm test` runs and includes Firefox + WebKit for UI specs.
- **`waitForResponse` anti-pattern in POMs**: `Promise.all([waitForResponse, fill/selectOption/click])` is unreliable in Firefox — React's debounce means the request may not fire within the action timeout. `postprocessPOM()` in AGT-04 automatically strips these and replaces with click+fill+loading-row wait (for search/clear) or action+loading-row wait (for filter dropdowns and pagination clicks).
- **`getFirstVisibleEmployeeId()` vs `getFirstEmployeeId()`**: After calling `searchEmployees(query)` and filtering the visible list, always use `getFirstVisibleEmployeeId()` to read the first visible row's ID from the DOM — NOT `getFirstEmployeeId()` which queries the unfiltered API and returns the wrong employee.
