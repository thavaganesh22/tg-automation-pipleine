/**
 * mcp/server.ts
 *
 * MCP (Model Context Protocol) server — exposes each pipeline agent as a tool
 * that Claude Code (or any MCP-compatible client) can call directly.
 *
 * Start:
 *   npx ts-node mcp/server.ts
 *   (or via package.json: npm run mcp:server)
 *
 * Then add to Claude Code's MCP settings (~/.claude/settings.json or .claude/settings.json):
 *   {
 *     "mcpServers": {
 *       "qa-pipeline": {
 *         "command": "npx",
 *         "args": ["ts-node", "mcp/server.ts"],
 *         "cwd": "/path/to/tg-automation-pipeline"
 *       }
 *     }
 *   }
 *
 * Available tools (call any subset — no full pipeline required):
 *   generate_playwright_tests  — AGT-04: generate specs/POMs/fixtures from TestCase[]
 *                                Live app inspection (shared/browser-inspector.ts) is
 *                                handled internally when baseUrl is reachable.
 *   design_test_cases          — AGT-03: convert ValidatedScenario[] to TestCase[]
 *   analyse_codebase           — AGT-01: scan a repo and produce Scenario[]
 *   audit_coverage             — AGT-05: check spec coverage against TestCase[]
 *   execute_tests              — AGT-06: run Playwright tests and return results
 *
 * Note: AGT-02 (JIRA Validator) and AGT-07 (Report Architect) are not exposed as
 * MCP tools — they require JIRA credentials and Elasticsearch access respectively.
 */

import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { runPlaywrightEngineer } from "../agents/04-playwright-engineer";
import { runTestCaseDesigner } from "../agents/03-test-case-designer";
import { runCodebaseAnalyst } from "../agents/01-codebase-analyst";
import { runCoverageAuditor } from "../agents/05-coverage-auditor";
import { runTestExecutor } from "../agents/06-test-executor";
import type { TestCase } from "../agents/03-test-case-designer";
import type { ValidatedScenario } from "../agents/02-jira-validator";
import type { TestType } from "../agents/01-codebase-analyst";

// ── Server ────────────────────────────────────────────────────────────────────

const server = new McpServer({ name: "qa-pipeline", version: "1.0.0" });

// ── AGT-04: Generate Playwright tests ─────────────────────────────────────────

server.registerTool(
  "generate_playwright_tests",
  {
    description:
      "Generate Playwright spec files, Page Object Models, and fixtures from a list of test cases. " +
      "Writes TypeScript files to the specified output directory.",
    inputSchema: {
      cases: z.array(z.record(z.unknown())).describe(
        "TestCase[] objects — each needs: id, title, module, testType (ui|api), caseScope (regression|new-feature), priority (P0|P1|P2), steps[], expectedResult"
      ),
      baseUrl: z.string().optional().describe("Live app URL for selector inspection (default: $BASE_URL or http://localhost:3000)"),
      outputDir: z.string().optional().describe("Output directory for generated files (default: playwright-tests)"),
      remediationMode: z.boolean().optional().describe("If true, append gap tests only — do not overwrite existing specs"),
    },
  },
  async ({ cases, baseUrl, outputDir, remediationMode }) => {
    const result = await runPlaywrightEngineer({
      cases: cases as TestCase[],
      apiSpecs: {},
      options: { baseUrl, outputDir, remediationMode },
    });
    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({ success: true, outputDir: result.outputDir, filesWritten: result.filesWritten.length, files: result.filesWritten, warnings: result.warnings }, null, 2),
      }],
    };
  }
);

// ── AGT-03: Design test cases ─────────────────────────────────────────────────

server.registerTool(
  "design_test_cases",
  {
    description: "Convert validated scenarios into detailed TestCase[] objects with UUIDs, priority, steps, and expected results.",
    inputSchema: {
      scenarios: z.array(z.record(z.unknown())).describe("ValidatedScenario[] from AGT-01/AGT-02"),
    },
  },
  async ({ scenarios }) => {
    const testCases = await runTestCaseDesigner(scenarios as ValidatedScenario[]);
    return {
      content: [{ type: "text" as const, text: JSON.stringify({ success: true, count: testCases.length, cases: testCases }, null, 2) }],
    };
  }
);

// ── AGT-01: Analyse codebase ──────────────────────────────────────────────────

server.registerTool(
  "analyse_codebase",
  {
    description: "Scan a codebase and generate regression test scenarios tagged by module, priority, and test type (ui/api).",
    inputSchema: {
      repoPath: z.string().describe("Absolute path to the repository to analyse"),
      testType: z.enum(["ui", "api", "both"]).optional().describe("Which test types to generate (default: both)"),
    },
  },
  async ({ repoPath, testType }) => {
    const scenarios = await runCodebaseAnalyst(repoPath, (testType ?? "both") as TestType);
    return {
      content: [{ type: "text" as const, text: JSON.stringify({ success: true, count: scenarios.length, scenarios }, null, 2) }],
    };
  }
);

// ── AGT-05: Audit coverage ────────────────────────────────────────────────────

server.registerTool(
  "audit_coverage",
  {
    description: "Check how well existing Playwright spec files cover a set of test cases. Returns coverage % by priority and a list of gaps.",
    inputSchema: {
      cases: z.array(z.record(z.unknown())).describe("TestCase[] to check coverage for"),
      specDir: z.string().optional().describe("Directory containing spec files (default: playwright-tests/specs)"),
      minP0Coverage: z.number().optional().describe("Minimum required P0 coverage 0-100 (default: 80)"),
      minP1Coverage: z.number().optional().describe("Minimum required P1 coverage 0-100 (default: 80)"),
    },
  },
  async ({ cases, specDir, minP0Coverage, minP1Coverage }) => {
    const report = await runCoverageAuditor(
      cases as TestCase[],
      specDir ?? "playwright-tests/specs",
      { minP0Coverage: minP0Coverage ?? 80, minP1Coverage: minP1Coverage ?? 80, maxGapPercent: 100 }
    );
    return {
      content: [{ type: "text" as const, text: JSON.stringify({ success: true, report }, null, 2) }],
    };
  }
);

// ── AGT-06: Execute tests ─────────────────────────────────────────────────────

server.registerTool(
  "execute_tests",
  {
    description: "Run Playwright tests and return a full execution report with pass/fail counts and per-test details.",
    inputSchema: {
      specDir: z.string().optional().describe("Directory containing spec files (default: playwright-tests/specs)"),
      baseUrl: z.string().optional().describe("URL the tests run against (default: $BASE_URL or http://localhost:3000)"),
      testType: z.enum(["ui", "api", "both"]).optional().describe("Filter which test types to run (default: both)"),
      headless: z.boolean().optional().describe("Run browsers in headless mode (default: true)"),
    },
  },
  async ({ specDir, baseUrl, testType, headless }) => {
    const result = await runTestExecutor(
      specDir ?? "playwright-tests/specs",
      { baseURL: baseUrl ?? process.env.BASE_URL ?? "http://localhost:3000", testType: testType ?? "both", headless: headless ?? true, autoHeal: false }
    );
    return {
      content: [{ type: "text" as const, text: JSON.stringify({ success: true, result }, null, 2) }],
    };
  }
);

// ── Start ─────────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
server.connect(transport).catch((err) => {
  console.error("[MCP] Fatal:", err.message);
  process.exit(1);
});

console.error("[MCP] qa-pipeline server running (stdio)");
