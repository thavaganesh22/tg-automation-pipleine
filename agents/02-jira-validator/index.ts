/**
 * AGT-02 — JIRA Story Validator
 *
 * Fetches the specific JIRA story identified in the PR (TGDEMO-xxxxx format),
 * then performs a deep alignment analysis:
 *
 *   1. Fetches the story's description, acceptance criteria, and linked issues
 *   2. Compares the story's stated intent against the actual code changes
 *   3. Produces a PASS / WARN / FAIL alignment verdict with detailed findings
 *   4. Enriches each scenario with JIRA story context for downstream agents
 *
 * A FAIL verdict (code contradicts the story or is completely unrelated)
 * blocks the pipeline — the PR should not proceed to test generation until
 * the mismatch is resolved.
 */

import Anthropic from "@anthropic-ai/sdk";
import axios from "axios";
import { z } from "zod";
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
  validatedScenarios: ValidatedScenario[];
}

export interface JiraConfig {
  host: string;
  token: string;
  projectKey: string;
  sprintId?: string;
}

// ── Guardrail: allowlisted JIRA hosts ──────────────────────────────────────

function assertHostAllowed(host: string): void {
  const allowlist = (process.env.JIRA_HOST_ALLOWLIST ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!allowlist.some((h) => host.startsWith(h))) {
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

  // ── Step 2: Deep alignment analysis — code changes vs story ─────────────
  console.log(`  [AGT-02] Running code-vs-story alignment analysis…`);
  const report = await analyseAlignment(scenarios, story);

  console.log(`  [AGT-02] Alignment verdict: ${report.overallVerdict}`);
  console.log(
    `  [AGT-02] Findings: ${report.findings.length} (${report.findings.filter((f) => f.severity === "critical").length} critical)`
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

  // ── Step 4: Enrich each scenario with JIRA context ───────────────────────
  return report.validatedScenarios;
}

// ── JIRA API ───────────────────────────────────────────────────────────────

async function fetchJiraStory(ticketKey: string, config: JiraConfig): Promise<JiraStory> {
  // GUARDRAIL: read-only — GET only, no POST/PUT/PATCH
  const { data } = await axios.get(`${config.host}/rest/api/3/issue/${ticketKey}`, {
    headers: {
      Authorization: `Bearer ${config.token}`,
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
  const scenarioDescriptions = scenarios.map((s) => ({
    title: s.title,
    module: s.module,
    description: s.description,
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
${story.linkedIssues.map((l) => `- ${l.type}: ${l.key} — ${l.summary}`).join("\n") || "none"}

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
  const analysisRaw = extractJSON(text);

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

  // Build enriched validated scenarios
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

  return {
    jiraTicket: story.key,
    story,
    overallVerdict,
    findings,
    summary: analysis.alignmentSummary ?? "",
    blockedReason: analysis.blockedReason ?? null,
    validatedScenarios,
  };
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
  };
}

// ── Utilities ──────────────────────────────────────────────────────────────

function extractJSON(text: string): Record<string, unknown> | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]) as Record<string, unknown>;
  } catch {
    return null;
  }
}
