# Autonomous QA Pipeline

> A fully automated QA testing pipeline powered by Claude. Every Pull Request triggers all 7 agents — from codebase analysis to test execution and Kibana reporting. The PR check only passes after AGT-07 (Report Architect) completes successfully.

---

## Architecture

```
  Pull Request opened / updated
           │
           ▼
  ┌─────────────────┐
  │     AGT-01      │  Scans the full codebase; generates REGRESSION scenarios.
  │  Codebase       │  Skipped automatically when scenarios.json is cached.
  │  Analyst        │  Use --regen-scenarios to force a fresh scan.
  └────────┬────────┘
           │  scenarios.json
           ▼
  ┌─────────────────┐
  │     AGT-02      │  Fetches the JIRA story; performs code-vs-story alignment.
  │  JIRA Story     │  Generates new-feature UI + API scenarios from acceptance
  │  Validator      │  criteria + changed file context. Always runs.
  └────────┬────────┘  ❌ FAIL verdict → pipeline halts, PR blocked
           │  validated-scenarios.json
           ▼
  ┌─────────────────┐
  │     AGT-03      │  Loads regression baseline; reuses pending-promotion.json
  │  Test Case      │  on subsequent pushes to keep UUIDs stable. Generates new
  │  Designer       │  test cases only on the first push of a branch.
  └────────┬────────┘
           │  test-cases.json
           ▼
  ┌─────────────────┐
  │     AGT-04      │  Browses BASE_URL with headless Chromium to discover real
  │  Playwright     │  [data-testid] selectors. Generates POM + fixture + spec
  │  Engineer       │  (UI) and fixture + api.spec (API). Merges new tests into
  │                 │  existing spec files — never overwrites regression coverage.
  └────────┬────────┘
           │  playwright-tests/specs/
           ▼
  ┌─────────────────┐
  │     AGT-05      │  Audits UI and API coverage separately. Triggers AGT-04
  │  Coverage       │  gap remediation if below threshold.
  │  Auditor        │
  └────────┬────────┘  ❌ Still below after remediation → pipeline halts
           │  coverage-report.json
           ▼
  ┌─────────────────┐
  │     AGT-06      │  Runs Playwright tests. Auto-heals script errors via LLM
  │  Test           │  and re-runs. Classifies failures as "script" or "app" —
  │  Executor       │  app failures are surfaced directly, not healed.
  └────────┬────────┘
           │  execution-result.json
           ▼
  ┌─────────────────┐
  │     AGT-07      │  Indexes to Elasticsearch (qa-test-runs, qa-failed-tests,
  │  Report         │  qa-test-results). Generates HTML report artifact.
  │  Architect      │  Sends SLA alerts if pass rate < threshold.
  └────────┬────────┘
           ▼
  ✅ PR check passes  (or ❌ blocked if any gate above failed)
```

A live PR comment is posted when the pipeline starts and updated with the full report when it finishes.

---

## Agent reference

| Agent  | Name                 | Model             | Role                                                                                        |
| ------ | -------------------- | ----------------- | ------------------------------------------------------------------------------------------- |
| AGT-01 | Codebase Analyst     | claude-sonnet-4-6 | Full codebase scan → regression scenarios; cached; `--regen-scenarios` to refresh           |
| AGT-02 | JIRA Story Validator | claude-sonnet-4-6 | Alignment verdict (PASS/WARN/FAIL) + new-feature scenario generation; always runs           |
| AGT-03 | Test Case Designer   | claude-sonnet-4-6 | Regression baseline preserved; reuses `pending-promotion.json` on repeat pushes             |
| AGT-04 | Playwright Engineer  | claude-opus-4-6   | Live app inspection → POM + fixture + spec (UI); fixture + api.spec (API)                   |
| AGT-05 | Coverage Auditor     | —                 | Separate UI + API traceability matrices; blocks + triggers remediation if below threshold   |
| AGT-06 | Test Executor        | claude-opus-4-6   | Playwright runner; auto-heal for script errors; classifies failures as script vs app        |
| AGT-07 | Report Architect     | claude-sonnet-4-6 | ES indexing (`qa-test-runs`, `qa-failed-tests`, `qa-test-results`); HTML report; SLA alerts |

---

## Quick start

**Prerequisites:** Node.js 20+, Docker + Docker Compose, Anthropic API key, JIRA API token.

```bash
# 1. Clone and install
git clone https://github.com/thavaganesh22/tg-automation-pipleine.git
cd tg-automation-pipleine
npm install

# 2. Configure environment
cp .env.example .env
# Fill in: ANTHROPIC_API_KEY, JIRA_EMAIL, JIRA_TOKEN, JIRA_HOST,
#          JIRA_PROJECT_KEY, BASE_URL, ALLOWED_TEST_URLS

# 3. Start the target app
docker compose up --build

# 4. Run the pipeline
npm run pipeline
```

| Service       | URL                              | Purpose                              |
| ------------- | -------------------------------- | ------------------------------------ |
| Frontend      | http://localhost:3000            | Employee Directory app (test target) |
| Backend API   | http://localhost:4000/api/health | Express REST API                     |
| Elasticsearch | http://localhost:9200            | Report storage                       |
| Kibana        | http://localhost:5601            | Dashboard visualisation              |

> Kibana setup is a one-time operation. Run `npm run kibana:setup` after first start to create indices, data views, and the dashboard.

---

## Common commands

```bash
npm run pipeline                          # run all 7 agents (UI + API)
npm run pipeline -- --test-type=ui        # UI tests only
npm run pipeline -- --test-type=api       # API tests only
npm run pipeline -- --from=5              # resume from AGT-05
npm run pipeline -- --agent=4             # run AGT-04 only
npm run pipeline -- --regen-scenarios     # force AGT-01 to regenerate
npm run pipeline:add-regression           # allow new regression modules into baseline
npm run promote                           # promote staged new-feature cases to baseline
npm run test:specs                        # run Playwright specs only (skip AI agents)
npm run typecheck                         # TypeScript check
npm run mcp:server                        # start MCP server (Claude Code integration)
```

---

## PR naming convention

AGT-02 extracts the JIRA ticket from the PR title or branch name:

```
feat: TGDEMO-12345 add payment gateway   ← PR title
feat/TGDEMO-12345-payment-gateway        ← branch name
```

If no ticket is found, regression analysis still runs; new-feature scenario generation is skipped.

---

## Wiki

Detailed documentation is on the [GitHub Wiki](https://github.com/thavaganesh22/tg-automation-pipleine/wiki):

| Page                                                                                                                                              | Contents                                                                                         |
| ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| [Regression baseline & new-feature tests](https://github.com/thavaganesh22/tg-automation-pipleine/wiki/Regression-Baseline-and-New-Feature-Tests) | How the baseline is frozen, how `pending-promotion.json` prevents UUID drift, promotion on merge |
| [Auto-heal](https://github.com/thavaganesh22/tg-automation-pipleine/wiki/Auto-Heal)                                                               | Script vs app error classification, heal cycle, guardrails                                       |
| [Generated test files](https://github.com/thavaganesh22/tg-automation-pipleine/wiki/Generated-Test-Files)                                         | File layout, UI vs API rules, live app inspection, browser strategy                              |
| [Coverage audit](https://github.com/thavaganesh22/tg-automation-pipleine/wiki/Coverage-Audit)                                                     | Per-type thresholds, remediation flow, `CoverageReport` shape                                    |
| [Kibana dashboards](https://github.com/thavaganesh22/tg-automation-pipleine/wiki/Kibana-Dashboards)                                               | ES indices, dashboard panels, Azure VM setup                                                     |
| [MCP server](https://github.com/thavaganesh22/tg-automation-pipleine/wiki/MCP-Server)                                                             | Registration, available tools, input parameters                                                  |
| [CI/CD](https://github.com/thavaganesh22/tg-automation-pipleine/wiki/CI-CD)                                                                       | All 3 jobs, blocking conditions, GitHub Secrets + Variables                                      |
| [Environment variables](https://github.com/thavaganesh22/tg-automation-pipleine/wiki/Environment-Variables)                                       | Full reference for all supported env vars                                                        |
| [Project structure](https://github.com/thavaganesh22/tg-automation-pipleine/wiki/Project-Structure)                                               | Directory tree with descriptions                                                                 |
| [Inter-agent data flow](https://github.com/thavaganesh22/tg-automation-pipleine/wiki/Inter-Agent-Data-Flow)                                       | pipeline-state/ file map, restartability                                                         |
| [Guardrails](https://github.com/thavaganesh22/tg-automation-pipleine/wiki/Guardrails)                                                             | Security, quality, and operational limits                                                        |
| [Employee Directory App](https://github.com/thavaganesh22/tg-automation-pipleine/wiki/Employee-Directory-App)                                     | Stack, API endpoints, frontend routing                                                           |
| [LLM Model Change Guide](https://github.com/thavaganesh22/tg-automation-pipleine/wiki/LLM-Model-Change-Guide)                                     | Stack, API endpoints, frontend routing                                                           |
