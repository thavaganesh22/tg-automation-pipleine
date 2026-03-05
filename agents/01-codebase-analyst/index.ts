/**
 * AGT-01 — Codebase Analyst  (v3)
 *
 * Full-codebase regression analysis strategy:
 *
 *   Walks the entire repo source tree to build a module map.
 *   Produces REGRESSION scenarios covering existing behaviour that must keep
 *   working regardless of what the PR changes.
 *
 *   Test type is controlled by the --test-type flag or TEST_TYPE env var:
 *     ui   — UI/frontend scenarios only (React components, forms, navigation)
 *     api  — API/backend scenarios only (HTTP endpoints, CRUD, auth errors)
 *     both — Both UI and API scenarios (default)
 *
 * Output: Scenario[] tagged with scenarioScope = "regression"
 *         and testType = "ui" | "api"
 */

import Anthropic from "@anthropic-ai/sdk";
import { execSync } from "child_process";
import * as fs from "fs/promises";
import * as path from "path";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";

const client = new Anthropic();

// ── Types ──────────────────────────────────────────────────────────────────

const ScenarioSchema = z.object({
  id: z.string(),
  title: z.string(),
  module: z.string(),
  description: z.string(),
  entryPoints: z.array(z.string()),
  priority: z.enum(["P0", "P1", "P2", "P3"]),
  scenarioScope: z.enum(["regression", "new-feature"]),
  testType: z.enum(["ui", "api"]),
  userJourneys: z.array(z.string()).optional(),
  apiEndpoints: z.array(z.string()).optional(),
  jiraTicket: z.string(),
  prNumber: z.string().optional(),
  changedFiles: z.array(z.string()),
});

export type Scenario = z.infer<typeof ScenarioSchema>;

/** Controls which scenario types are generated and returned by AGT-01. */
export type TestType = "ui" | "api" | "both";

export interface PRContext {
  jiraTicket: string;
  prNumber: string;
  prTitle: string;
  prBranch: string;
  baseBranch: string;
  changedFiles: string[];
}

// ── Guardrail Constants ────────────────────────────────────────────────────

const MAX_FILES = parseInt(process.env.MAX_FILES_SCAN ?? "1000", 10);
const MAX_FILE_SIZE_BYTES = 300_000;
const CODEBASE_CHUNK_CHARS = 60_000;
// Max scenarios per LLM call — keeps output within the max_tokens budget
const MAX_REGRESSION_SCENARIOS_PER_CHUNK = parseInt(
  process.env.MAX_REGRESSION_SCENARIOS_PER_CHUNK ?? "20",
  10
);

const JIRA_PROJECT_KEY = process.env.JIRA_PROJECT_KEY ?? "TGDEMO";
const JIRA_TICKET_PATTERN = new RegExp(`\\b(${JIRA_PROJECT_KEY}-\\d{1,6})\\b`, "i");

const IGNORED_EXTENSIONS = new Set([
  ".lock",
  ".map",
  ".min.js",
  ".min.css",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".svg",
  ".ico",
  ".woff",
  ".woff2",
  ".ttf",
  ".eot",
]);

const SOURCE_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".py",
  ".java",
  ".cs",
  ".go",
  ".rb",
  ".php",
]);

const IGNORED_DIRS = new Set([
  "node_modules",
  "dist",
  "build",
  ".git",
  "coverage",
  ".nyc_output",
  "__pycache__",
  "vendor",
  ".next",
  ".nuxt",
]);

const SECRET_PATTERNS = [
  /(['"`])([A-Za-z0-9_\-]{20,})\1/g,
  /process\.env\.[A-Z_]+/g,
  /(?:password|secret|token|key)\s*[:=]\s*['"`][^'"`]+['"`]/gi,
];

// ── Main Agent ─────────────────────────────────────────────────────────────

/**
 * Run the codebase analyst agent.
 *
 * @param repoPath  Path to the target application repo (REPO_PATH in .env).
 * @param testType  Which scenario types to generate and return.
 *                  "ui"   → UI/frontend only
 *                  "api"  → API/backend only
 *                  "both" → both (default)
 *                  Falls back to TEST_TYPE env var, then "both".
 */
export async function runCodebaseAnalyst(
  repoPath: string,
  testType?: TestType
): Promise<Scenario[]> {
  await fs.access(repoPath);

  // Resolve effective test type: explicit arg > env var > default "both"
  const effectiveTestType: TestType =
    testType ?? ((process.env.TEST_TYPE as TestType | undefined) ?? "both");

  const prContext = extractPRContext();
  console.log(`  [AGT-01] PR #${prContext.prNumber} — JIRA: ${prContext.jiraTicket}`);
  console.log(`  [AGT-01] Branch: ${prContext.prBranch} → ${prContext.baseBranch}`);
  console.log(`  [AGT-01] Test type filter: ${effectiveTestType}`);

  // ── Full codebase scan → regression scenarios ────────────────────────────
  console.log(`  [AGT-01] Scanning full codebase for regression scenarios…`);
  console.log(`  [AGT-01] Scanning repo path: ${path.resolve(repoPath)}`);
  const allSourceFiles = await walkSourceTree(repoPath);
  console.log(`  [AGT-01] Source files found: ${allSourceFiles.length}`);

  if (allSourceFiles.length === 0) {
    throw new Error(
      `[AGT-01] No source files found in "${path.resolve(repoPath)}".\n` +
        `  Check that REPO_PATH in your .env points to the application directory.\n` +
        `  Supported extensions: ${[...SOURCE_EXTENSIONS].join(", ")}`
    );
  }

  const codebaseContents = await readFiles(allSourceFiles, repoPath, "codebase");
  const codebaseChunks = chunkFiles(codebaseContents, CODEBASE_CHUNK_CHARS, 2000);
  const regressionScenarios: Scenario[] = [];

  for (let i = 0; i < codebaseChunks.length; i++) {
    console.log(`  [AGT-01] Chunk ${i + 1}/${codebaseChunks.length}…`);
    const s = await analyseForRegression(
      codebaseChunks[i],
      prContext,
      effectiveTestType,
      i,
      codebaseChunks.length
    );
    regressionScenarios.push(...s);
  }

  // Filter by testType before deduplication
  const filtered =
    effectiveTestType === "both"
      ? regressionScenarios
      : regressionScenarios.filter((s) => s.testType === effectiveTestType);

  const all = deduplicateScenarios(filtered);

  const uiCount = all.filter((s) => s.testType === "ui").length;
  const apiCount = all.filter((s) => s.testType === "api").length;
  console.log(
    `  [AGT-01] Total unique regression scenarios: ${all.length} ` +
      `(${uiCount} UI | ${apiCount} API)`
  );
  return all;
}

// ── PR Context ─────────────────────────────────────────────────────────────

export function extractPRContext(): PRContext {
  const prTitle = process.env.PR_TITLE ?? "";
  const prBranch = process.env.PR_BRANCH ?? "";
  const prNumber = process.env.PR_NUMBER ?? "0";
  const baseBranch = process.env.GITHUB_BASE_REF ?? "main";

  // Try git branch as fallback when env vars aren't set
  let currentBranch = prBranch;
  if (!currentBranch) {
    try {
      currentBranch = execSync("git rev-parse --abbrev-ref HEAD", { encoding: "utf-8" }).trim();
    } catch {
      currentBranch = "";
    }
  }

  const jiraTicket =
    extractJiraTicket(prTitle) ?? extractJiraTicket(currentBranch) ?? null;

  if (!jiraTicket) {
    // Warn but do NOT throw — regression Pass A must always run regardless of PR context
    console.warn(
      `  [AGT-01] No JIRA ticket found in PR_TITLE ("${prTitle}") or branch ("${currentBranch}"). ` +
        `Regression analysis will continue. Set PR_TITLE or PR_BRANCH for full traceability.`
    );
  }

  const changedFiles = getChangedFiles(baseBranch);
  return {
    jiraTicket: (jiraTicket ?? "UNKNOWN-0").toUpperCase(),
    prNumber,
    prTitle,
    prBranch: currentBranch,
    baseBranch,
    changedFiles,
  };
}

function extractJiraTicket(text: string): string | null {
  return text.match(JIRA_TICKET_PATTERN)?.[1] ?? null;
}

function getChangedFiles(baseBranch: string): string[] {
  const envList = process.env.PR_CHANGED_FILES;
  if (envList)
    return envList
      .split("\n")
      .map((f: string) => f.trim())
      .filter(Boolean);
  try {
    const raw = execSync(
      `git diff --name-only origin/${baseBranch}...HEAD 2>/dev/null || git diff --name-only HEAD~1`,
      { encoding: "utf-8" }
    );
    return raw
      .split("\n")
      .map((f: string) => f.trim())
      .filter(Boolean);
  } catch {
    console.warn("  [AGT-01] Could not determine changed files via git");
    return [];
  }
}

// ── File System ────────────────────────────────────────────────────────────

async function walkSourceTree(repoPath: string): Promise<string[]> {
  const results: string[] = [];

  async function walk(dir: string): Promise<void> {
    if (results.length >= MAX_FILES) return;
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (results.length >= MAX_FILES) return;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!IGNORED_DIRS.has(entry.name) && !entry.name.startsWith(".")) {
          await walk(fullPath);
        }
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (SOURCE_EXTENSIONS.has(ext)) {
          results.push(path.relative(repoPath, fullPath));
        }
      }
    }
  }

  await walk(repoPath);
  return results;
}

async function readFiles(
  filePaths: string[],
  repoPath: string,
  mode: "codebase" | "pr"
): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  let count = 0;

  for (const relativePath of filePaths) {
    if (count >= MAX_FILES) {
      console.warn(`[AGT-01 GUARDRAIL] File cap (${MAX_FILES}) reached`);
      break;
    }
    const ext = path.extname(relativePath).toLowerCase();
    if (IGNORED_EXTENSIONS.has(ext)) continue;
    if (mode === "pr" && !SOURCE_EXTENSIONS.has(ext)) continue;

    const absolutePath = path.join(repoPath, relativePath);
    try {
      const stat = await fs.stat(absolutePath);
      if (stat.size > MAX_FILE_SIZE_BYTES) {
        console.warn(
          `[AGT-01 GUARDRAIL] Skipping large file: ${relativePath} (${(stat.size / 1024).toFixed(0)}KB)`
        );
        continue;
      }
      result[relativePath] = redactSecrets(await fs.readFile(absolutePath, "utf-8"));
      count++;
    } catch {
      /* deleted or unreadable */
    }
  }

  return result;
}

function redactSecrets(content: string): string {
  let safe = content;
  for (const pattern of SECRET_PATTERNS) {
    pattern.lastIndex = 0;
    safe = safe.replace(pattern, "[REDACTED]");
  }
  return safe;
}

// ── Chunking ───────────────────────────────────────────────────────────────

function chunkFiles(
  files: Record<string, string>,
  maxChars: number,
  trimPerFile: number
): Array<Record<string, string>> {
  const chunks: Array<Record<string, string>> = [];
  let current: Record<string, string> = {};
  let currentSize = 0;

  for (const [filePath, content] of Object.entries(files)) {
    const trimmed = content.slice(0, trimPerFile);
    const entrySize = filePath.length + trimmed.length;

    if (currentSize + entrySize > maxChars && Object.keys(current).length > 0) {
      chunks.push(current);
      current = {};
      currentSize = 0;
    }
    current[filePath] = trimmed;
    currentSize += entrySize;
  }

  if (Object.keys(current).length > 0) chunks.push(current);
  return chunks;
}

// ── LLM Analysis — Regression ──────────────────────────────────────────────

async function analyseForRegression(
  files: Record<string, string>,
  prContext: PRContext,
  testType: TestType,
  chunkIndex: number,
  totalChunks: number
): Promise<Scenario[]> {
  const filesSummary = Object.entries(files)
    .map(([p, c]) => `### ${p}\n${c}`)
    .join("\n\n");

  // Build the type-constraint instruction based on the requested test type
  const typeInstruction =
    testType === "ui"
      ? `GENERATE ONLY UI TEST SCENARIOS covering React/frontend behaviour:
  page loads, user interactions, form validation, navigation, empty states, error banners.
  Set "testType": "ui" on every scenario. Do NOT generate API or backend scenarios.`
      : testType === "api"
        ? `GENERATE ONLY API TEST SCENARIOS covering backend/HTTP behaviour:
  happy-path responses (200/201), validation errors (400), auth errors (401/403), not-found (404), CRUD operations.
  Set "testType": "api" on every scenario. Do NOT generate UI or frontend scenarios.`
        : `GENERATE BOTH UI AND API TEST SCENARIOS:
  - UI scenarios ("testType": "ui"): page loads, interactions, form validation, navigation, error states
  - API scenarios ("testType": "api"): HTTP endpoints, CRUD, validation (400), auth (401/403/404)
  For each major module include: 1 UI + 1 API scenario minimum.`;

  const response = await client.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 8096,
    system: `You are a senior QA architect building a regression test suite for a full-stack application.
Codebase chunk ${chunkIndex + 1} of ${totalChunks}.

HARD LIMIT: Generate AT MOST ${MAX_REGRESSION_SCENARIOS_PER_CHUNK} scenarios total. Be selective — prioritise P0 and P1 coverage. Skip P3 scenarios if near the limit.

IMPORTANT: This is a PURE APPLICATION ANALYSIS. Do NOT consider any PR, ticket, or recent change.

${typeInstruction}

IMPORTANT JSON FORMAT RULES:
- Return ONLY a raw JSON array with NO markdown code fences, NO backticks, NO explanation text
- Start your response with [ and end with ]
- Keep all string values SHORT (max 15 words) — no sentences or paragraphs
- Do NOT use quotes inside string values

Schema (every field required):
{
  "title": "[UI|API] <Module>: <10-word max title>",
  "module": "lowercase-kebab-case",
  "description": "10-word max description of what this protects",
  "entryPoints": ["file/path.ts"],
  "priority": "P0|P1|P2|P3",
  "scenarioScope": "regression",
  "testType": "ui|api",
  "userJourneys": ["one short journey description"],
  "apiEndpoints": ["GET /api/route"],
  "jiraTicket": "${prContext.jiraTicket}",
  "prNumber": "${prContext.prNumber}",
  "changedFiles": []
}`,
    messages: [
      {
        role: "user",
        content: `Source files — generate up to ${MAX_REGRESSION_SCENARIOS_PER_CHUNK} regression scenarios (raw JSON array only, no code fences):\n\n${filesSummary}`,
      },
    ],
  });

  return parseScenarios(
    (response.content[0] as { text: string }).text,
    prContext,
    Object.keys(files),
    "regression"
  );
}

// ── Parsing & Dedup ────────────────────────────────────────────────────────

/** Coerce a value to a string array — handles string, array, or undefined from LLM output */
function toStringArray(val: unknown, fallback: string[] = []): string[] {
  if (Array.isArray(val)) return val.map(String).filter(Boolean);
  if (typeof val === "string" && val.trim()) return [val.trim()];
  return fallback;
}

/** Normalise LLM priority output — "P1 - Critical", "high", "P1-high" → "P1" */
function normalisePriority(val: unknown): "P0" | "P1" | "P2" | "P3" {
  const s = String(val ?? "P2").toUpperCase();
  const match = s.match(/^P([0-3])/);
  if (match) return `P${match[1]}` as "P0" | "P1" | "P2" | "P3";
  if (s.includes("CRITICAL") || s.includes("HIGH")) return "P1";
  if (s.includes("LOW") || s.includes("MINOR")) return "P3";
  return "P2";
}

/**
 * Infer testType from LLM output.
 * Uses the explicit "testType" field first, then falls back to the title prefix.
 */
function inferTestType(obj: Record<string, unknown>): "ui" | "api" {
  const explicit = String(obj["testType"] ?? "").toLowerCase().trim();
  if (explicit === "ui") return "ui";
  if (explicit === "api") return "api";

  // Fall back to title prefix: "[UI]..." → ui, "[API]..." → api
  const title = String(obj["title"] ?? "").toLowerCase();
  if (title.startsWith("[api]") || title.startsWith("[backend]")) return "api";
  return "ui"; // default to UI when ambiguous
}

function parseScenarios(
  text: string,
  prContext: PRContext,
  fallbackFiles: string[],
  scope: "regression" | "new-feature"
): Scenario[] {
  const items = extractJSONArray(text);

  if (items.length === 0) {
    console.warn(
      `  [AGT-01] WARNING: LLM returned no parseable JSON array for ${scope} scenarios.\n` +
        `  Response preview: ${text.slice(0, 300).replace(/\n/g, " ")}`
    );
    return [];
  }

  const results: Scenario[] = [];
  let skipped = 0;

  for (const item of items) {
    try {
      const obj = item as Record<string, unknown>;

      const scenario = ScenarioSchema.parse({
        title: String(obj["title"] ?? "Untitled scenario"),
        module: String(obj["module"] ?? "unknown")
          .toLowerCase()
          .replace(/\s+/g, "-")
          .replace(/[^a-z0-9-]/g, ""),
        description: String(obj["description"] ?? ""),
        entryPoints: toStringArray(obj["entryPoints"], fallbackFiles),
        priority: normalisePriority(obj["priority"]),
        scenarioScope: scope,
        testType: inferTestType(obj),
        userJourneys: toStringArray(obj["userJourneys"]),
        apiEndpoints: toStringArray(obj["apiEndpoints"]),
        id: uuidv4(),
        jiraTicket: prContext.jiraTicket,
        prNumber: prContext.prNumber,
        changedFiles:
          scope === "regression"
            ? []
            : toStringArray(obj["changedFiles"], fallbackFiles),
      });

      results.push(scenario);
    } catch (err) {
      skipped++;
      console.warn(`  [AGT-01] Skipped scenario: ${(err as Error).message.slice(0, 120)}`);
    }
  }

  if (skipped > 0) {
    console.warn(`  [AGT-01] ${skipped}/${items.length} scenarios skipped due to validation errors`);
  }

  return results;
}

function deduplicateScenarios(scenarios: Scenario[]): Scenario[] {
  const seen = new Set<string>();
  return scenarios.filter((s) => {
    const key = `${s.scenarioScope}:${s.module}:${s.title.toLowerCase().replace(/\s+/g, "-")}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function extractJSONArray(text: string): unknown[] {
  // Strategy 1: raw JSON (no code fence)
  const trimmed = text.trim();
  if (trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed;
    } catch { /* fall through */ }
  }

  // Strategy 2: extract content between code fence markers (non-greedy match)
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  const inner = fenceMatch ? fenceMatch[1].trim() : text.trim();

  const start = inner.indexOf("[");
  if (start === -1) return [];

  // Strategy 3: parse from first '[' to end (works when fence content is pure JSON)
  try {
    const parsed = JSON.parse(inner.slice(start));
    if (Array.isArray(parsed)) return parsed;
  } catch { /* fall through */ }

  // Strategy 4: slice to last ']' (handles trailing whitespace or commentary)
  const lastBracket = inner.lastIndexOf("]");
  if (lastBracket > start) {
    try {
      const parsed = JSON.parse(inner.slice(start, lastBracket + 1));
      if (Array.isArray(parsed)) return parsed;
    } catch { /* fall through */ }
  }

  return [];
}
