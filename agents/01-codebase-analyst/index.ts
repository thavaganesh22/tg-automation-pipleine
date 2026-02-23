/**
 * AGT-01 — Codebase Analyst
 *
 * Triggered on Pull Request. Extracts the JIRA story number from the PR title
 * or branch name (format: TGDEMO-xxxxx), then scans ONLY the files changed in
 * that PR to generate focused, PR-scoped high-level test scenarios.
 *
 * PR context is injected via environment variables set by the GitHub Actions
 * workflow (PR_TITLE, PR_BRANCH, PR_NUMBER, GITHUB_BASE_REF).
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
  userJourneys: z.array(z.string()).optional(),
  apiEndpoints: z.array(z.string()).optional(),
  // PR-specific fields
  jiraTicket: z.string(),             // e.g. "TGDEMO-12345"
  prNumber: z.string().optional(),
  changedFiles: z.array(z.string()),  // files touched in this PR
});

export type Scenario = z.infer<typeof ScenarioSchema>;

export interface PRContext {
  jiraTicket: string;   // Extracted ticket ID, e.g. "TGDEMO-12345"
  prNumber: string;
  prTitle: string;
  prBranch: string;
  baseBranch: string;
  changedFiles: string[];
}

// ── Guardrail Constants ────────────────────────────────────────────────────

const MAX_FILES = parseInt(process.env.MAX_FILES_SCAN ?? "1000", 10);
const MAX_FILE_SIZE_BYTES = 500_000; // 500KB

/**
 * JIRA ticket format: TGDEMO-xxxxx (case-insensitive).
 * Matches in PR title, branch name, or commit messages.
 */
const JIRA_TICKET_PATTERN = /\b(TGDEMO-\d{1,6})\b/i;

const IGNORED_EXTENSIONS = new Set([
  ".lock", ".map", ".min.js", ".min.css", ".png", ".jpg",
  ".jpeg", ".gif", ".svg", ".ico", ".woff", ".woff2", ".ttf",
]);

const SECRET_PATTERNS = [
  /(['"`])([A-Za-z0-9_\-]{20,})\1/g,
  /process\.env\.[A-Z_]+/g,
  /(?:password|secret|token|key)\s*[:=]\s*['"`][^'"`]+['"`]/gi,
];

// ── Main Agent ─────────────────────────────────────────────────────────────

export async function runCodebaseAnalyst(repoPath: string): Promise<Scenario[]> {
  // GUARDRAIL: validate repo path exists
  await fs.access(repoPath);

  // ── Step 1: Extract PR context ───────────────────────────────────────────
  const prContext = extractPRContext();
  console.log(`  [AGT-01] PR #${prContext.prNumber} — JIRA: ${prContext.jiraTicket}`);
  console.log(`  [AGT-01] Branch: ${prContext.prBranch} → ${prContext.baseBranch}`);
  console.log(`  [AGT-01] Changed files: ${prContext.changedFiles.length}`);

  if (!prContext.changedFiles.length) {
    console.warn("  [AGT-01] No changed files detected in PR — nothing to analyse");
    return [];
  }

  // ── Step 2: Read only the files changed in this PR ───────────────────────
  const fileContents = await readChangedFiles(prContext.changedFiles, repoPath);
  console.log(`  [AGT-01] Readable source files: ${Object.keys(fileContents).length}`);

  if (!Object.keys(fileContents).length) {
    console.warn("  [AGT-01] No readable source files in PR diff — nothing to analyse");
    return [];
  }

  // ── Step 3: Chunk & analyse ──────────────────────────────────────────────
  const chunks = chunkFiles(fileContents, 60_000);
  const allScenarios: Scenario[] = [];

  for (let i = 0; i < chunks.length; i++) {
    console.log(`  [AGT-01] Analysing chunk ${i + 1}/${chunks.length}…`);
    const scenarios = await analyseChunk(chunks[i], prContext, i, chunks.length);
    allScenarios.push(...scenarios);
  }

  return deduplicateScenarios(allScenarios);
}

// ── PR Context Extraction ──────────────────────────────────────────────────

export function extractPRContext(): PRContext {
  const prTitle  = process.env.PR_TITLE   ?? "";
  const prBranch = process.env.PR_BRANCH  ?? "";
  const prNumber = process.env.PR_NUMBER  ?? "0";
  const baseBranch = process.env.GITHUB_BASE_REF ?? "main";

  // Extract JIRA ticket from PR title first, then branch name
  const jiraTicket = extractJiraTicket(prTitle) ?? extractJiraTicket(prBranch);

  // GUARDRAIL: JIRA ticket is mandatory — block the pipeline if missing
  if (!jiraTicket) {
    throw new Error(
      `[AGT-01 GUARDRAIL] No JIRA ticket found in PR title or branch name.\n` +
      `  PR title:  "${prTitle}"\n` +
      `  Branch:    "${prBranch}"\n` +
      `  Expected format: TGDEMO-xxxxx (e.g. TGDEMO-12345)\n` +
      `  Please include the JIRA ticket in your PR title or branch name.`
    );
  }

  const changedFiles = getChangedFiles(baseBranch);

  return { jiraTicket: jiraTicket.toUpperCase(), prNumber, prTitle, prBranch, baseBranch, changedFiles };
}

function extractJiraTicket(text: string): string | null {
  const match = text.match(JIRA_TICKET_PATTERN);
  return match ? match[1] : null;
}

/**
 * Gets the list of files changed in this PR vs the base branch.
 * Uses git diff to produce the exact file list — no guessing.
 */
function getChangedFiles(baseBranch: string): string[] {
  // If GH Actions provides the list directly, use it (avoids git fetch overhead)
  const envList = process.env.PR_CHANGED_FILES;
  if (envList) {
    return envList.split("\n").map(f => f.trim()).filter(Boolean);
  }

  // Fallback: use git diff
  try {
    const raw = execSync(
      `git diff --name-only origin/${baseBranch}...HEAD 2>/dev/null || git diff --name-only HEAD~1`,
      { encoding: "utf-8" }
    );
    return raw.split("\n").map(f => f.trim()).filter(Boolean);
  } catch {
    console.warn("  [AGT-01] Could not determine changed files via git — scanning all source files");
    return [];
  }
}

// ── File Reading ───────────────────────────────────────────────────────────

async function readChangedFiles(
  changedFiles: string[],
  repoPath: string
): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  let count = 0;

  for (const relativePath of changedFiles) {
    // GUARDRAIL: max file count
    if (count >= MAX_FILES) {
      console.warn(`[AGT-01 GUARDRAIL] Capped at ${MAX_FILES} files`);
      break;
    }

    // GUARDRAIL: skip non-source file types
    const ext = path.extname(relativePath).toLowerCase();
    if (IGNORED_EXTENSIONS.has(ext)) continue;

    // Only analyse source code files
    const sourceExts = [".ts", ".tsx", ".js", ".jsx", ".py", ".java", ".cs", ".go", ".rb", ".php"];
    if (!sourceExts.includes(ext)) continue;

    const absolutePath = path.join(repoPath, relativePath);

    try {
      const stat = await fs.stat(absolutePath);

      // GUARDRAIL: skip files > 500KB
      if (stat.size > MAX_FILE_SIZE_BYTES) {
        console.warn(`[AGT-01 GUARDRAIL] Skipping large file: ${relativePath} (${(stat.size / 1024).toFixed(0)}KB)`);
        continue;
      }

      const raw = await fs.readFile(absolutePath, "utf-8");
      // GUARDRAIL: redact secrets before sending to LLM
      result[relativePath] = redactSecrets(raw);
      count++;
    } catch {
      // File may have been deleted in this PR — skip silently
    }
  }

  return result;
}

function redactSecrets(content: string): string {
  let safe = content;
  for (const pattern of SECRET_PATTERNS) {
    // Reset lastIndex for global patterns
    pattern.lastIndex = 0;
    safe = safe.replace(pattern, "[REDACTED]");
  }
  return safe;
}

// ── Chunking ───────────────────────────────────────────────────────────────

function chunkFiles(
  files: Record<string, string>,
  maxChars: number
): Array<Record<string, string>> {
  const chunks: Array<Record<string, string>> = [];
  let current: Record<string, string> = {};
  let currentSize = 0;

  for (const [filePath, content] of Object.entries(files)) {
    const size = filePath.length + content.length;
    if (currentSize + size > maxChars && Object.keys(current).length > 0) {
      chunks.push(current);
      current = {};
      currentSize = 0;
    }
    current[filePath] = content.slice(0, 3000); // trim per-file
    currentSize += size;
  }

  if (Object.keys(current).length > 0) chunks.push(current);
  return chunks;
}

// ── LLM Analysis ──────────────────────────────────────────────────────────

async function analyseChunk(
  files: Record<string, string>,
  prContext: PRContext,
  chunkIndex: number,
  totalChunks: number
): Promise<Scenario[]> {
  const filesSummary = Object.entries(files)
    .map(([p, c]) => `### ${p}\n${c}`)
    .join("\n\n");

  const response = await client.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 8096,
    system: `You are a senior QA architect. You are analysing ONLY the files changed in a Pull Request.
This is chunk ${chunkIndex + 1} of ${totalChunks}.

Context:
- JIRA Ticket: ${prContext.jiraTicket}
- PR Title: "${prContext.prTitle}"
- PR Branch: ${prContext.prBranch}
- Base Branch: ${prContext.baseBranch}
- PR Number: #${prContext.prNumber}

Your job: generate high-level test scenarios that cover the behaviour introduced or modified by this PR.
Focus ONLY on what has changed — do not generate scenarios for unrelated features.

Return ONLY a valid JSON array. Each object must match:
{
  "id": "unique string",
  "title": "concise scenario title",
  "module": "module/feature name derived from the changed files",
  "description": "what behaviour this scenario tests, referencing the PR changes",
  "entryPoints": ["changed file paths relevant to this scenario"],
  "priority": "P0|P1|P2|P3",
  "userJourneys": ["user-facing journeys affected by this change"],
  "apiEndpoints": ["API routes added or modified, if applicable"],
  "jiraTicket": "${prContext.jiraTicket}",
  "prNumber": "${prContext.prNumber}",
  "changedFiles": ["subset of changed files relevant to this scenario"]
}

Priority guide:
  P0 = Core business flow (auth, payments, critical data mutations)
  P1 = Important feature (major user workflows)
  P2 = Secondary feature change
  P3 = Minor change / edge case

Focus on: what the PR changes, new behaviour, modified flows, regression risks, error states.`,
    messages: [
      {
        role: "user",
        content: `Analyse these changed files from PR #${prContext.prNumber} [${prContext.jiraTicket}] and generate test scenarios:\n\n${filesSummary}`,
      },
    ],
  });

  const text = (response.content[0] as { text: string }).text;
  const raw = extractJSONArray(text);

  return raw
    .map((item) => {
      try {
        return ScenarioSchema.parse({
          ...item,
          id: uuidv4(),
          jiraTicket: prContext.jiraTicket,
          prNumber: prContext.prNumber,
          changedFiles: (item as { changedFiles?: string[] }).changedFiles ?? Object.keys(files),
        });
      } catch {
        return null;
      }
    })
    .filter((s): s is Scenario => s !== null);
}

// ── Utilities ──────────────────────────────────────────────────────────────

function deduplicateScenarios(scenarios: Scenario[]): Scenario[] {
  const seen = new Set<string>();
  return scenarios.filter((s) => {
    const key = s.title.toLowerCase().replace(/\s+/g, "-");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function extractJSONArray(text: string): unknown[] {
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return [];
  try {
    return JSON.parse(match[0]) as unknown[];
  } catch {
    return [];
  }
}
