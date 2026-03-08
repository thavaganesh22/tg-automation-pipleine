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

# Run generated Playwright tests
npm test                        # headless, uses playwright.config.ts at root
npm run test:headed             # headed browser

# TypeScript typecheck (no emit)
npm run typecheck

# Lint
npm run lint

# Unit tests (Jest)
npm run test:unit

# Install all deps including employee-app workspaces
npm install-all
```

## Architecture

This is a 7-agent LLM pipeline (powered by Claude via `@anthropic-ai/sdk`) that analyzes a target codebase and autonomously generates, runs, and reports on Playwright regression and new-feature tests.

**Entry point**: `orchestrator/index.ts` — runs agents sequentially, reads CLI flags, manages state.

### Agent sequence

| # | Directory | Role |
|---|-----------|------|
| AGT-01 | `agents/01-codebase-analyst/` | Walks `REPO_PATH`, generates `Scenario[]` tagged `regression` or `new-feature` and `testType: ui\|api` |
| AGT-02 | `agents/02-jira-validator/` | Fetches JIRA story, validates PR alignment, augments scenarios; FAIL verdict blocks the pipeline |
| AGT-03 | `agents/03-test-case-designer/` | Converts scenarios to `TestCase[]` with UUIDs; maintains a stable `regression-baseline.json` across runs |
| AGT-04 | `agents/04-playwright-engineer/` | Inspects the live app with headless Chromium to discover real selectors, then writes POM (`pages/`), fixtures (`fixtures/`), and spec files (`specs/`) to `playwright-tests/` |
| AGT-05 | `agents/05-coverage-auditor/` | Checks spec files for `// TC-<uuid>` coverage comments; triggers AGT-04 remediation if below threshold |
| AGT-06 | `agents/06-test-executor/` | Runs Playwright tests against the staging URL |
| AGT-07 | `agents/07-report-architect/` | Publishes Kibana dashboard, sends stakeholder email, posts PR comment |

### State management

Each agent writes its output to `pipeline-state/<key>.json` via `orchestrator/state.ts`. Agents read outputs of the previous agent from the same directory. The CI workflow caches `pipeline-state/` between runs so regression specs survive PR pushes without regeneration.

Key state files:
- `scenarios.json` — AGT-01 output (cached; regenerate with `--regen-scenarios`)
- `validated-scenarios.json` — AGT-02 output
- `test-cases.json` — AGT-03 output (combined regression + new-feature)
- `regression-baseline.json` — stable regression test cases across runs
- `coverage-report.json` — AGT-05 output
- `execution-result.json` — AGT-06 output

### Generated test structure

```
playwright-tests/
  pages/          # Page Object Models (one per module, UI only)
  fixtures/       # page.route() mock helpers (shared by UI and API specs)
  specs/          # {module}.spec.ts (UI) | {module}.api.spec.ts (API)
  playwright.config.ts
```

### Target app (employee-app)

- React frontend on port 3000 (served via nginx in docker-compose), dev server on 5173
- Express/Node backend on port 4000, MongoDB
- **Only one frontend route: `/`** — React Router catch-all redirects everything else to `/`
- Employee list renders at `/`, not `/employees`
- API list response format: `{ data: EmployeeListItem[], pagination: { total, page, limit, pages } }`
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

> **JIRA auth**: Atlassian Cloud requires Basic auth (`base64(email:token)`), not Bearer tokens. Both `JIRA_EMAIL` and `JIRA_TOKEN` must be set. Add `JIRA_EMAIL` as a GitHub secret alongside `JIRA_TOKEN`.

Important guardrail env vars (all have defaults):
- `MIN_P0_COVERAGE=80`, `MIN_P1_COVERAGE=80` — AGT-05 blocks if below
- `SLA_PASS_RATE=0.95` — AGT-06 blocks if below
- `MAX_CASES_PER_SPEC=20`, `MAX_REGRESSION_SCENARIOS_PER_CHUNK=20` — keeps LLM output within `max_tokens`

## CI/CD

`.github/workflows/qa-pipeline.yml` runs the full 7-agent pipeline on every PR to `main`/`develop`. The PR check only passes after AGT-07 completes. The workflow:
1. Starts `employee-app` via `docker compose`
2. Restores `pipeline-state/` from cache (so regression specs aren't rebuilt from scratch)
3. Runs `npm run pipeline`
4. Posts a structured QA report as a PR comment
5. Fails the check if the pipeline exits non-zero

## Critical patterns

- **LLM JSON extraction**: LLM output always comes wrapped in ` ```json ``` ` fences. Every agent uses multi-strategy `extractJSONArray()` — do not use simple regex on raw content.
- **Coverage tracking**: AGT-04 embeds `// TC-<uuid>` comments in every `test()` block. AGT-05 reads these to match test cases to specs. Missing these comments = false gap detection.
- **Remediation vs. overwrite**: In remediation mode, AGT-04 _appends_ gap test cases to existing specs (`mergeNewFeatureCases`) — it never regenerates from scratch, which would destroy existing coverage.
- **URL patterns in fixtures**: `**/api/employees` does NOT match query-param URLs. Always use trailing `**`: `**/api/employees**`.
- **API calls in POMs**: Use `page.evaluate(async () => fetch(...))` — never `page.request.*`, which bypasses `page.route()` mocks.
- **AGT-04 live app inspection**: At the start of every run, `inspectAppStructure()` launches a headless Chromium browser, navigates to `BASE_URL`, and collects all `[data-testid]` attributes (including the drawer by clicking "Add Employee"). This verified selector list is injected into POM and spec generation prompts. Falls back gracefully to the static `DATA_TESTID_REFERENCE` if the app is unreachable.
- **Spec truncation guard — three passes**: AGT-04's `writeChecked()` validates generated TypeScript in three passes: (1) `syntaxDepth()` checks brace **and** paren balance — valid cut points are after `});` not just `}` (cutting at `}` alone leaves `test.describe(` unclosed); (2) `checkTypeScriptSyntax()` uses `ts.transpileModule()` for full syntax validation without import resolution; (3) if a syntax error remains, a second `truncateToBalanced()` pass is applied.
- **JIRA Basic auth**: Atlassian Cloud requires `Authorization: Basic base64(email:token)` — Bearer tokens are rejected with 403. `JIRA_EMAIL` must be set alongside `JIRA_TOKEN`. If JIRA is unreachable (any error), AGT-02 falls back to a WARN verdict and the pipeline continues.
- **Duplicate test prevention**: `extractExistingTestIds()` reads `// TC-<uuid>` from existing specs before any merge call; already-covered cases are filtered out before the LLM call.
