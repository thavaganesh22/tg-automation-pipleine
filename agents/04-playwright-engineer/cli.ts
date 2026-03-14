#!/usr/bin/env ts-node
/**
 * agents/04-playwright-engineer/cli.ts
 *
 * Standalone CLI — run the Playwright Engineer agent without the full pipeline.
 *
 * Usage:
 *   npx ts-node agents/04-playwright-engineer/cli.ts \
 *     --cases ./my-test-cases.json \
 *     --base-url http://localhost:3000 \
 *     --output-dir ./e2e
 *
 * Flags:
 *   --cases <path>       Path to a JSON file containing TestCase[] (required)
 *   --base-url <url>     Live app URL for selector inspection (default: $BASE_URL or http://localhost:3000)
 *   --output-dir <path>  Where to write generated files (default: ./playwright-tests)
 *   --remediation        Run in remediation mode (append gap tests only, do not overwrite)
 *   --help               Print this message
 *
 * Input format (TestCase[]):
 *   [
 *     {
 *       "id": "uuid-here",
 *       "title": "Login with valid credentials",
 *       "module": "auth",
 *       "testType": "ui",          // "ui" | "api"
 *       "caseScope": "regression", // "regression" | "new-feature"
 *       "priority": "P0",          // "P0" | "P1" | "P2"
 *       "preconditions": ["App is running"],
 *       "steps": ["Navigate to /login", "Fill email and password", "Click submit"],
 *       "expectedResult": "User is redirected to dashboard"
 *     }
 *   ]
 *
 * Output:
 *   Writes to <output-dir>/
 *     pages/<module>.page.ts       — Page Object Models (UI only)
 *     fixtures/<module>.fixture.ts — Route mock helpers
 *     specs/<module>.spec.ts       — UI spec files
 *     specs/<module>.api.spec.ts   — API spec files
 */

import "dotenv/config";
import * as fs from "fs/promises";
import * as path from "path";
import { runPlaywrightEngineer } from "./index";
import type { TestCase } from "../03-test-case-designer";

// ── Parse CLI args ────────────────────────────────────────────────────────────

function parseArgs(argv: string[]): {
  casesPath: string | null;
  baseUrl: string | null;
  outputDir: string;
  remediationMode: boolean;
  help: boolean;
} {
  const args = argv.slice(2);
  const get = (flag: string) =>
    args.find((a) => a.startsWith(`${flag}=`))?.split("=").slice(1).join("=") ??
    (() => {
      const i = args.indexOf(flag);
      return i !== -1 && args[i + 1] ? args[i + 1] : null;
    })();

  return {
    casesPath: get("--cases"),
    baseUrl: get("--base-url"),
    outputDir: get("--output-dir") ?? "playwright-tests",
    remediationMode: args.includes("--remediation"),
    help: args.includes("--help") || args.includes("-h"),
  };
}

const HELP = `
Playwright Engineer — Standalone CLI

Usage:
  npx ts-node agents/04-playwright-engineer/cli.ts [flags]

Flags:
  --cases <path>       Path to TestCase[] JSON file  (required)
  --base-url <url>     Live app URL for selector inspection
                       (default: \$BASE_URL or http://localhost:3000)
  --output-dir <path>  Output directory (default: ./playwright-tests)
  --remediation        Append-only mode — does not overwrite existing specs
  --help               Print this help message

Examples:
  # Generate tests from a cases file into ./e2e
  npx ts-node agents/04-playwright-engineer/cli.ts \\
    --cases pipeline-state/test-cases.json \\
    --output-dir ./e2e

  # Target a remote staging app
  npx ts-node agents/04-playwright-engineer/cli.ts \\
    --cases my-cases.json \\
    --base-url https://staging.myapp.com \\
    --output-dir ./playwright-tests
`.trim();

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const { casesPath, baseUrl, outputDir, remediationMode, help } = parseArgs(process.argv);

  if (help) {
    console.log(HELP);
    process.exit(0);
  }

  if (!casesPath) {
    console.error("Error: --cases <path> is required.\n");
    console.error(HELP);
    process.exit(1);
  }

  // Load test cases
  let cases: TestCase[];
  try {
    const raw = await fs.readFile(casesPath, "utf-8");
    cases = JSON.parse(raw) as TestCase[];
    if (!Array.isArray(cases) || cases.length === 0) {
      throw new Error("File must contain a non-empty JSON array of TestCase objects");
    }
  } catch (err) {
    console.error(`Error loading cases from "${casesPath}": ${(err as Error).message}`);
    process.exit(1);
  }

  console.log(`\n[AGT-04 CLI] Loaded ${cases.length} test cases from ${casesPath}`);
  console.log(`[AGT-04 CLI] Output directory: ${path.resolve(outputDir)}`);
  console.log(`[AGT-04 CLI] Base URL: ${baseUrl ?? process.env.BASE_URL ?? "http://localhost:3000"}`);
  if (remediationMode) console.log("[AGT-04 CLI] Mode: remediation (append-only)");

  const result = await runPlaywrightEngineer({
    cases,
    apiSpecs: {},
    options: {
      outputDir,
      baseUrl: baseUrl ?? undefined,
      remediationMode,
    },
  });

  console.log(`\n[AGT-04 CLI] Done — ${result.filesWritten.length} file(s) written to ${result.outputDir}/`);
  for (const f of result.filesWritten) {
    console.log(`  ✓ ${path.relative(process.cwd(), f)}`);
  }
  if (result.warnings.length > 0) {
    console.log(`\n[AGT-04 CLI] Warnings (${result.warnings.length}):`);
    result.warnings.forEach((w) => console.log(`  ⚠ ${w}`));
  }
}

main().catch((err) => {
  console.error("[AGT-04 CLI] Fatal error:", err.message);
  process.exit(1);
});
