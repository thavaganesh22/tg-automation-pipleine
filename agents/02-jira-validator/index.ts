/**
 * AGT-02 — JIRA Story Validator & Scenario Generator
 *
 * Fetches the specific JIRA story identified in the PR (TGDEMO-xxxxx format),
 * then performs two tasks:
 *
 *   1. Alignment Analysis
 *      Compares the story's stated intent against the actual code changes.
 *      Produces a PASS / WARN / FAIL verdict. FAIL blocks the pipeline.
 *
 *   2. JIRA-Derived Scenario Generation
 *      Reads the story's acceptance criteria + code changes and generates
 *      high-level test scenarios specifically for this story's new behaviour.
 *      Each scenario is tagged testType = "ui" | "api" and
 *      scenarioScope = "new-feature".
 *
 * Output: ValidatedScenario[] =
 *   [enriched AGT-01 regression scenarios]
 *   + [new UI/API scenarios derived from the JIRA story]
 */

import Anthropic from "@anthropic-ai/sdk";
import axios from "axios";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import type { Scenario } from "../01-codebase-analyst";

const client = new Anthropic();

// ── Types ──────────────────────────────────────────────────────────────────

const JiraStorySchema = z.object({
  key: z.string(),
  summary: z.string(),
  description: z.string().nullable(),
  acceptanceCriteria: z.string().nullable(),
  status: z.string(),
  priority: z.string(),
  storyType: z.string(),
  assignee: z.string().nullable(),
  labels: z.array(z.string()),
  linkedIssues: z.array(
    z.object({
      key: z.string(),
      type: z.string(),
      summary: z.string(),
    })
  ),
  components: z.array(z.string()),
});

export type JiraStory = z.infer<typeof JiraStorySchema>;

export const AlignmentVerdictSchema = z.enum(["PASS", "WARN", "FAIL"]);
export type AlignmentVerdict = z.infer<typeof AlignmentVerdictSchema>;

export const AlignmentFindingSchema = z.object({
  type: z.enum(["MATCH", "MISMATCH", "MISSING", "EXTRA", "PARTIAL"]),
  category: z.enum(["acceptance-criteria", "description", "scope", "behaviour", "api-contract"]),
  description: z.string(),
  storyReference: z.string().optional(), // quote from the JIRA story
  codeReference: z.string().optional(), // file path or code element
  severity: z.enum(["critical", "major", "minor", "info"]),
});

export type AlignmentFinding = z.infer<typeof AlignmentFindingSchema>;

export const ValidatedScenarioSchema = z.object({
  id: z.string(),
  title: z.string(),
  module: z.string(),
  description: z.string(),
  entryPoints: z.array(z.string()),
  priority: z.enum(["P0", "P1", "P2", "P3"]),
  scenarioScope: z.enum(["regression", "new-feature"]).default("new-feature"),
  testType: z.enum(["ui", "api"]).default("ui"),
  userJourneys: z.array(z.string()).optional(),
  apiEndpoints: z.array(z.string()).optional(),
  jiraTicket: z.string(),
  prNumber: z.string().optional(),
  changedFiles: z.array(z.string()),
  // AGT-02 enrichment
  jiraRef: z.string(),
  jiraSummary: z.string(),
  jiraDescription: z.string().nullable(),
  jiraAcceptanceCriteria: z.string().nullable(),
  alignmentVerdict: AlignmentVerdictSchema,
  alignmentFindings: z.array(AlignmentFindingSchema),
  alignmentSummary: z.string(),
  coverageStatus: z.enum(["COVERED", "PARTIAL", "GAP", "MISMATCH"]),
});

export type ValidatedScenario = z.infer<typeof ValidatedScenarioSchema>;

export interface JiraValidationReport {
  jiraTicket: string;
  story: JiraStory;
  overallVerdict: AlignmentVerdict;
  findings: AlignmentFinding[];
  summary: string;
  blockedReason: string | null; // Set when verdict is FAIL
  validatedScenarios: ValidatedScenario[]; // enriched AGT-01 regression scenarios
  jiraDerivedScenarios: ValidatedScenario[]; // new UI/API scenarios from the JIRA story
}

export interface JiraConfig {
  host: string;
  email: string;
  token: string;
  projectKey: string;
  sprintId?: string;
}

// ── Guardrail: allowlisted JIRA hosts ──────────────────────────────────────

function assertHostAllowed(host: string): void {
  const allowlist = (process.env.JIRA_HOST_ALLOWLIST ?? "")
    .split(",")
    .map((s: string) => s.trim())
    .filter(Boolean);
  if (!allowlist.some((h: string) => host.startsWith(h))) {
    throw new Error(
      `[AGT-02 GUARDRAIL] JIRA host "${host}" is not in JIRA_HOST_ALLOWLIST.\n` +
        `  Allowed: ${allowlist.join(", ")}`
    );
  }
}

// ── Main Agent ─────────────────────────────────────────────────────────────

export async function runJiraValidator(
  scenarios: Scenario[],
  config: JiraConfig
): Promise<ValidatedScenario[]> {
  assertHostAllowed(config.host);

  if (!scenarios.length) {
    console.warn("  [AGT-02] No scenarios to validate");
    return [];
  }

  // All scenarios from AGT-01 carry the same JIRA ticket (from the PR)
  const jiraTicket = scenarios[0].jiraTicket;
  console.log(`  [AGT-02] Fetching JIRA story: ${jiraTicket}`);

  // ── Step 1: Fetch the specific JIRA story ────────────────────────────────
  let story: JiraStory;
  try {
    story = await fetchJiraStory(jiraTicket, config);
    console.log(`  [AGT-02] Story fetched: "${story.summary}" [${story.status}]`);
  } catch (err) {
    // GUARDRAIL: fail-safe — if JIRA is unreachable, warn but continue with WARN verdict
    console.warn(
      `  [AGT-02 GUARDRAIL] JIRA unreachable: ${(err as Error).message}\n` +
        `  Continuing with WARN verdict — manual review required`
    );
    return scenarios.map((s) => buildFallbackScenario(s, jiraTicket));
  }

  // ── Step 2: Alignment analysis + JIRA-derived scenario generation ─────────
  console.log(`  [AGT-02] Running code-vs-story alignment analysis…`);
  const report = await analyseAlignment(scenarios, story);

  console.log(`  [AGT-02] Alignment verdict: ${report.overallVerdict}`);
  console.log(
    `  [AGT-02] Findings: ${report.findings.length} (${report.findings.filter((f) => f.severity === "critical").length} critical)`
  );
  console.log(
    `  [AGT-02] JIRA-derived scenarios generated: ${report.jiraDerivedScenarios.length} ` +
      `(${report.jiraDerivedScenarios.filter((s) => s.testType === "ui").length} UI | ` +
      `${report.jiraDerivedScenarios.filter((s) => s.testType === "api").length} API)`
  );

  // ── Step 3: GUARDRAIL — block on FAIL verdict ────────────────────────────
  if (report.overallVerdict === "FAIL") {
    const msg =
      `[AGT-02 GUARDRAIL] Code-vs-story alignment FAILED for ${jiraTicket}.\n\n` +
      `  Story: "${story.summary}"\n\n` +
      `  Reason: ${report.blockedReason ?? "Code changes do not match the JIRA story intent"}\n\n` +
      `  Critical findings:\n` +
      report.findings
        .filter((f) => f.severity === "critical")
        .map((f) => `    ✗ [${f.category}] ${f.description}`)
        .join("\n") +
      `\n\n  Resolve the mismatch between the PR and JIRA story before proceeding.`;

    throw new Error(msg);
  }

  if (report.overallVerdict === "WARN") {
    console.warn(
      `  [AGT-02] ⚠ Alignment WARN — pipeline continues but manual review recommended.\n` +
        `  ${report.summary}`
    );
  }

  // ── Step 4: Return enriched AGT-01 scenarios + new JIRA-derived scenarios ─
  return [...report.validatedScenarios, ...report.jiraDerivedScenarios];
}

// ── JIRA API ───────────────────────────────────────────────────────────────

async function fetchJiraStory(ticketKey: string, config: JiraConfig): Promise<JiraStory> {
  // GUARDRAIL: read-only — GET only, no POST/PUT/PATCH
  // Atlassian Cloud uses Basic auth: base64(email:api_token)
  const basicAuth = Buffer.from(`${config.email}:${config.token}`).toString("base64");
  const { data } = await axios.get(`${config.host}/rest/api/3/issue/${ticketKey}`, {
    headers: {
      Authorization: `Basic ${basicAuth}`,
      Accept: "application/json",
    },
    params: {
      fields:
        "summary,description,status,priority,issuetype,assignee,labels,issuelinks,components,customfield_10016",
    },
    timeout: 15_000,
  });

  const fields = data.fields as Record<string, unknown>;

  // Extract acceptance criteria from custom field or description
  const acceptanceCriteria = extractAcceptanceCriteria(fields);

  return JiraStorySchema.parse({
    key: data.key as string,
    summary: (fields.summary as string) ?? "",
    description: extractAdfText(fields.description),
    acceptanceCriteria,
    status: ((fields.status as Record<string, unknown>)?.name as string) ?? "",
    priority: ((fields.priority as Record<string, unknown>)?.name as string) ?? "",
    storyType: ((fields.issuetype as Record<string, unknown>)?.name as string) ?? "",
    assignee: ((fields.assignee as Record<string, unknown> | null)?.displayName as string) ?? null,
    labels: (fields.labels as string[]) ?? [],
    linkedIssues: extractLinkedIssues(fields.issuelinks),
    components: ((fields.components as Array<Record<string, unknown>>) ?? []).map(
      (c) => c.name as string
    ),
  });
}

function extractAcceptanceCriteria(fields: Record<string, unknown>): string | null {
  // Try custom field (common AC field IDs in JIRA)
  const customAcFields = ["customfield_10016", "customfield_10030", "customfield_10014"];
  for (const field of customAcFields) {
    const val = fields[field];
    if (val && typeof val === "object") {
      const text = extractAdfText(val);
      if (text) return text;
    }
    if (typeof val === "string" && val.trim()) return val;
  }

  // Fallback: look for "Acceptance Criteria" section in description
  const desc = extractAdfText(fields.description);
  if (!desc) return null;

  const acMatch = desc.match(/acceptance criteria[:\s]+([\s\S]+?)(?:\n\n|\n(?=[A-Z])|$)/i);
  return acMatch ? acMatch[1].trim() : null;
}

function extractLinkedIssues(links: unknown): JiraStory["linkedIssues"] {
  if (!Array.isArray(links)) return [];
  return links
    .map((link: Record<string, unknown>) => {
      const issue = (link.inwardIssue ?? link.outwardIssue) as Record<string, unknown> | undefined;
      if (!issue) return null;
      return {
        key: issue.key as string,
        type: ((link.type as Record<string, unknown>)?.name as string) ?? "",
        summary: ((issue.fields as Record<string, unknown>)?.summary as string) ?? "",
      };
    })
    .filter((l): l is NonNullable<typeof l> => l !== null);
}

function extractAdfText(adf: unknown): string | null {
  if (!adf || typeof adf !== "object") return null;
  if (typeof adf === "string") return adf;

  const doc = adf as {
    content?: Array<{ type?: string; content?: Array<{ text?: string; type?: string }> }>;
  };
  if (!doc.content) return null;

  const lines: string[] = [];
  for (const block of doc.content) {
    const texts = (block.content ?? []).map((inline) => inline.text ?? "").join("");
    if (texts.trim()) lines.push(texts);
  }
  return lines.join("\n") || null;
}

// ── Alignment Analysis ─────────────────────────────────────────────────────

async function analyseAlignment(
  scenarios: Scenario[],
  story: JiraStory
): Promise<JiraValidationReport> {
  const changedFiles = [...new Set(scenarios.flatMap((s) => s.changedFiles))];
  const modules = [...new Set(scenarios.map((s) => s.module))];
  const apiEndpoints = [...new Set(scenarios.flatMap((s) => s.apiEndpoints ?? []))];
  const scenarioDescriptions = scenarios.map((s) => ({
    title: s.title,
    module: s.module,
    description: s.description,
    testType: s.testType,
    changedFiles: s.changedFiles,
    userJourneys: s.userJourneys ?? [],
    apiEndpoints: s.apiEndpoints ?? [],
  }));

  const prompt = `
You are a senior QA lead performing a code-vs-JIRA-story alignment review.

## JIRA Story: ${story.key}
**Summary:** ${story.summary}
**Type:** ${story.storyType}
**Status:** ${story.status}
**Priority:** ${story.priority}

**Description:**
${story.description ?? "(no description provided)"}

**Acceptance Criteria:**
${story.acceptanceCriteria ?? "(no acceptance criteria defined)"}

**Labels:** ${story.labels.join(", ") || "none"}
**Components:** ${story.components.join(", ") || "none"}

**Linked Issues:**
${story.linkedIssues.map((l: { type: string; key: string; summary: string }) => `- ${l.type}: ${l.key} — ${l.summary}`).join("\n") || "none"}

---

## What the PR Actually Does (from changed files analysis)
Changed files: ${changedFiles.join(", ")}

Detected behaviours from code analysis:
${JSON.stringify(scenarioDescriptions, null, 2)}

---

## Your Task
Perform a deep alignment analysis. Evaluate:
1. Does the code implement what the JIRA story description says?
2. Does the code satisfy each acceptance criterion (if any are defined)?
3. Are there behaviours in the code NOT mentioned in the story (scope creep)?
4. Are there story requirements that appear to be missing from the code?
5. Do the API endpoints or modules match the story's stated technical scope?

Return ONLY a valid JSON object:
{
  "overallVerdict": "PASS|WARN|FAIL",
  "verdictRationale": "one-sentence explanation of the verdict",
  "blockedReason": "string if FAIL, null otherwise",
  "findings": [
    {
      "type": "MATCH|MISMATCH|MISSING|EXTRA|PARTIAL",
      "category": "acceptance-criteria|description|scope|behaviour|api-contract",
      "description": "what was found",
      "storyReference": "relevant quote from the JIRA story (optional)",
      "codeReference": "file path or function name (optional)",
      "severity": "critical|major|minor|info"
    }
  ],
  "alignmentSummary": "2-3 sentence plain-English summary for the PR reviewer",
  "enrichedScenarios": [
    {
      "scenarioTitle": "must match one of the input scenario titles exactly",
      "coverageStatus": "COVERED|PARTIAL|GAP|MISMATCH",
      "storyAlignment": "how this scenario relates to the JIRA story"
    }
  ]
}

Verdict guide:
  PASS = Code clearly implements the story intent; all/most ACs addressed
  WARN = Partial alignment, missing ACs, or scope concerns — needs review
  FAIL = Code contradicts the story, implements something completely different, or is dangerously out of scope`;

  const response = await client.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 6000,
    system: `You are a strict QA lead performing alignment validation between JIRA stories and code changes.
Be precise and evidence-based. Only flag real mismatches — not style preferences.
Return ONLY valid JSON.`,
    messages: [{ role: "user", content: prompt }],
  });

  const text = (response.content[0] as { text: string }).text;
  const analysisRaw = extractJSONObject(text);

  if (!analysisRaw) {
    return buildFallbackReport(scenarios, story, "LLM returned non-parseable analysis");
  }

  type RawAnalysis = {
    overallVerdict?: string;
    verdictRationale?: string;
    blockedReason?: string | null;
    findings?: unknown[];
    alignmentSummary?: string;
    enrichedScenarios?: Array<{
      scenarioTitle?: string;
      coverageStatus?: string;
      storyAlignment?: string;
    }>;
  };

  const analysis = analysisRaw as RawAnalysis;

  // Parse and validate findings
  const findings: AlignmentFinding[] = (analysis.findings ?? [])
    .map((f) => {
      try {
        return AlignmentFindingSchema.parse(f);
      } catch {
        return null;
      }
    })
    .filter((f): f is AlignmentFinding => f !== null);

  const overallVerdict = AlignmentVerdictSchema.safeParse(analysis.overallVerdict).success
    ? (analysis.overallVerdict as AlignmentVerdict)
    : "WARN";

  // Build enriched validated scenarios (AGT-01 regression scenarios + JIRA context)
  const validatedScenarios = scenarios.map((s): ValidatedScenario => {
    const enriched = analysis.enrichedScenarios?.find((e) => e.scenarioTitle === s.title);
    const coverageStatus =
      (enriched?.coverageStatus as ValidatedScenario["coverageStatus"]) ?? "GAP";

    return ValidatedScenarioSchema.parse({
      ...s,
      jiraRef: story.key,
      jiraSummary: story.summary,
      jiraDescription: story.description,
      jiraAcceptanceCriteria: story.acceptanceCriteria,
      alignmentVerdict: overallVerdict,
      alignmentFindings: findings,
      alignmentSummary: analysis.alignmentSummary ?? "",
      coverageStatus,
    });
  });

  // Generate new UI + API test scenarios from the JIRA story + code changes
  const jiraDerivedScenarios = await generateJiraScenarios(
    story,
    { modules, apiEndpoints, changedFiles },
    overallVerdict,
    analysis.alignmentSummary ?? ""
  );

  return {
    jiraTicket: story.key,
    story,
    overallVerdict,
    findings,
    summary: analysis.alignmentSummary ?? "",
    blockedReason: analysis.blockedReason ?? null,
    validatedScenarios,
    jiraDerivedScenarios,
  };
}

// ── JIRA-Derived Scenario Generation ───────────────────────────────────────

interface CodeChangeSummary {
  modules: string[];
  apiEndpoints: string[];
  changedFiles: string[];
}

async function generateJiraScenarios(
  story: JiraStory,
  codeChanges: CodeChangeSummary,
  overallVerdict: AlignmentVerdict,
  alignmentSummary: string
): Promise<ValidatedScenario[]> {
  const MAX_JIRA_SCENARIOS = parseInt(process.env.MAX_JIRA_SCENARIOS ?? "15", 10);

  const response = await client.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 6000,
    system: `You are a senior QA architect creating test scenarios for a specific JIRA story.
Your job is to generate high-level test scenarios covering the NEW BEHAVIOUR described in this story.

HARD LIMIT: Generate AT MOST ${MAX_JIRA_SCENARIOS} scenarios total. Prioritise P0 and P1.

IMPORTANT: Only generate scenarios for genuinely NEW behaviour introduced by this story.
- If the story has no acceptance criteria and no clear new behaviour, return []
- If the story is a sample, placeholder, maintenance task, or has nothing testable, return []
- Do NOT invent scenarios just to have output — an empty array is the correct response when there is nothing new

When scenarios ARE warranted, generate BOTH types:
  UI scenarios  ("testType": "ui")  — what a user tests in the browser:
    page loads, interactions, form submissions, success/error feedback, navigation
  API scenarios ("testType": "api") — what backend tests should cover:
    HTTP endpoints, request validation, response format, auth errors (401/403), CRUD operations

Base scenarios directly on the acceptance criteria and story description.
Each acceptance criterion should produce at least one scenario.

IMPORTANT JSON FORMAT RULES:
- Return ONLY a raw JSON array — no code fences, no backticks, no explanation
- Start your response with [ and end with ]
- An empty array [] is valid when there is nothing new to test
- Keep all string values SHORT (max 15 words)

Schema (every field required):
{
  "title": "[UI|API] <Module>: <10-word max title>",
  "module": "lowercase-kebab-case",
  "description": "10-word max description",
  "testType": "ui|api",
  "priority": "P0|P1|P2|P3",
  "userJourneys": ["short user journey (UI scenarios only, empty array for API)"],
  "apiEndpoints": ["METHOD /api/route (API scenarios only, empty array for UI)"],
  "entryPoints": ["relevant/source/file.ts"]
}`,
    messages: [
      {
        role: "user",
        content: `
## JIRA Story: ${story.key}
**Summary:** ${story.summary}
**Type:** ${story.storyType} | **Priority:** ${story.priority} | **Status:** ${story.status}
**Components:** ${story.components.join(", ") || "none"}
**Labels:** ${story.labels.join(", ") || "none"}

**Description:**
${story.description ?? "(no description provided)"}

**Acceptance Criteria:**
${story.acceptanceCriteria ?? "(no acceptance criteria defined)"}

**Linked Issues:**
${story.linkedIssues.map((l) => `- ${l.type}: ${l.key} — ${l.summary}`).join("\n") || "none"}

---

## Code Changes in This PR
**Modules affected:** ${codeChanges.modules.join(", ") || "none detected"}
**API endpoints involved:** ${codeChanges.apiEndpoints.join(", ") || "none detected"}
**Changed files:** ${codeChanges.changedFiles.join(", ") || "none detected"}

**Alignment summary:** ${alignmentSummary || "N/A"}

---

Generate up to ${MAX_JIRA_SCENARIOS} new-feature test scenarios (raw JSON array, no code fences).
Cover each acceptance criterion with at least one UI or API scenario.
If there are no acceptance criteria and no new behaviour to test, return [].
`.trim(),
      },
    ],
  });

  const text = (response.content[0] as { text: string }).text;
  const items = extractJSONArray(text);

  if (items.length === 0) {
    console.warn("  [AGT-02] generateJiraScenarios: LLM returned no parseable scenarios");
    return [];
  }

  const results: ValidatedScenario[] = [];
  let skipped = 0;

  for (const item of items) {
    try {
      const obj = item as Record<string, unknown>;
      const rawTestType = String(obj["testType"] ?? "").toLowerCase();
      const testType: "ui" | "api" = rawTestType === "api" ? "api" : "ui";

      const scenario = ValidatedScenarioSchema.parse({
        id: uuidv4(),
        title: String(obj["title"] ?? "Untitled scenario"),
        module: String(obj["module"] ?? "unknown")
          .toLowerCase()
          .replace(/\s+/g, "-")
          .replace(/[^a-z0-9-]/g, ""),
        description: String(obj["description"] ?? ""),
        entryPoints: toStringArray(obj["entryPoints"], codeChanges.changedFiles),
        priority: normalisePriority(obj["priority"]),
        scenarioScope: "new-feature",
        testType,
        userJourneys: toStringArray(obj["userJourneys"]),
        apiEndpoints: toStringArray(obj["apiEndpoints"]),
        jiraTicket: story.key,
        prNumber: undefined,
        changedFiles: codeChanges.changedFiles,
        // AGT-02 enrichment
        jiraRef: story.key,
        jiraSummary: story.summary,
        jiraDescription: story.description,
        jiraAcceptanceCriteria: story.acceptanceCriteria,
        alignmentVerdict: overallVerdict,
        alignmentFindings: [],
        alignmentSummary,
        coverageStatus: "GAP",
      });

      results.push(scenario);
    } catch (err) {
      skipped++;
      console.warn(`  [AGT-02] Skipped JIRA scenario: ${(err as Error).message.slice(0, 120)}`);
    }
  }

  if (skipped > 0) {
    console.warn(
      `  [AGT-02] ${skipped}/${items.length} JIRA scenarios skipped (validation errors)`
    );
  }

  return results;
}

/** Coerce value to string array (shared helper) */
function toStringArray(val: unknown, fallback: string[] = []): string[] {
  if (Array.isArray(val)) return val.map(String).filter(Boolean);
  if (typeof val === "string" && val.trim()) return [val.trim()];
  return fallback;
}

/** Normalise priority strings from LLM output */
function normalisePriority(val: unknown): "P0" | "P1" | "P2" | "P3" {
  const s = String(val ?? "P2").toUpperCase();
  const match = s.match(/^P([0-3])/);
  if (match) return `P${match[1]}` as "P0" | "P1" | "P2" | "P3";
  if (s.includes("CRITICAL") || s.includes("HIGH")) return "P1";
  if (s.includes("LOW") || s.includes("MINOR")) return "P3";
  return "P2";
}

/** Multi-strategy JSON array extraction for LLM output */
function extractJSONArray(text: string): unknown[] {
  const trimmed = text.trim();
  if (trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      /* fall through */
    }
  }
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  const inner = fenceMatch ? fenceMatch[1].trim() : text.trim();
  const start = inner.indexOf("[");
  if (start === -1) return [];
  try {
    const parsed = JSON.parse(inner.slice(start));
    if (Array.isArray(parsed)) return parsed;
  } catch {
    /* fall through */
  }
  const lastBracket = inner.lastIndexOf("]");
  if (lastBracket > start) {
    try {
      const parsed = JSON.parse(inner.slice(start, lastBracket + 1));
      if (Array.isArray(parsed)) return parsed;
    } catch {
      /* fall through */
    }
  }
  return [];
}

// ── Fallbacks ──────────────────────────────────────────────────────────────

function buildFallbackScenario(s: Scenario, jiraTicket: string): ValidatedScenario {
  return ValidatedScenarioSchema.parse({
    ...s,
    jiraRef: jiraTicket,
    jiraSummary: "(JIRA unavailable)",
    jiraDescription: null,
    jiraAcceptanceCriteria: null,
    alignmentVerdict: "WARN",
    alignmentFindings: [
      {
        type: "MISSING",
        category: "description",
        description: "JIRA story could not be fetched — alignment not verified",
        severity: "major",
      },
    ],
    alignmentSummary: "JIRA was unreachable during validation. Manual review required.",
    coverageStatus: "GAP",
  });
}

function buildFallbackReport(
  scenarios: Scenario[],
  story: JiraStory,
  reason: string
): JiraValidationReport {
  return {
    jiraTicket: story.key,
    story,
    overallVerdict: "WARN",
    findings: [
      {
        type: "MISSING",
        category: "description",
        description: reason,
        severity: "major",
      },
    ],
    summary: `Alignment analysis incomplete: ${reason}`,
    blockedReason: null,
    validatedScenarios: scenarios.map((s) => buildFallbackScenario(s, story.key)),
    jiraDerivedScenarios: [], // cannot generate without JIRA story content
  };
}

// ── Utilities ──────────────────────────────────────────────────────────────

/** Extract the first JSON object from LLM text (handles code fences and leading text) */
function extractJSONObject(text: string): Record<string, unknown> | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]) as Record<string, unknown>;
  } catch {
    return null;
  }
}
