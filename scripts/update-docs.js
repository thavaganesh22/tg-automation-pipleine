/**
 * update-docs.js
 *
 * Uses Claude API to update specific sections of CLAUDE.md and README.md
 * based on the current state of the codebase. Run this manually after
 * making significant changes to the pipeline.
 *
 * Usage:
 *   npm run update-docs
 *
 * What it updates:
 *   CLAUDE.md  — Commands, Architecture agent table, State management files,
 *                Configuration env vars, Guardrail env vars, CLI flags
 *   README.md  — Commands, Agent reference table, Environment variables table,
 *                Manual dispatch inputs, Inter-agent data flow, Project structure
 *
 * What it preserves:
 *   All human-authored content (Critical patterns, explanatory prose, examples)
 *   is passed through unchanged — the model is instructed only to update
 *   sections that are directly derivable from the source files provided.
 */

require("dotenv/config");
const fs      = require("fs");
const path    = require("path");
const Anthropic = require("@anthropic-ai/sdk");

const ROOT = path.resolve(__dirname, "..");
const client = new Anthropic.default();

// ── Source files the model will read to derive updates ────────────────────────

function readFile(relPath) {
  const full = path.join(ROOT, relPath);
  if (!fs.existsSync(full)) return null;
  return fs.readFileSync(full, "utf8");
}

function agentSummaries() {
  const agentsDir = path.join(ROOT, "agents");
  if (!fs.existsSync(agentsDir)) return "(agents/ not found)";
  return fs.readdirSync(agentsDir)
    .filter((d) => fs.statSync(path.join(agentsDir, d)).isDirectory())
    .sort()
    .map((d) => {
      const indexPath = path.join(agentsDir, d, "index.ts");
      if (!fs.existsSync(indexPath)) return `${d}/index.ts — not found`;
      // Read only the top comment block (first 40 lines) to keep tokens low
      const lines = fs.readFileSync(indexPath, "utf8").split("\n").slice(0, 40).join("\n");
      return `### agents/${d}/index.ts (first 40 lines)\n${lines}`;
    })
    .join("\n\n");
}

function scriptsSummary() {
  const scriptsDir = path.join(ROOT, "scripts");
  if (!fs.existsSync(scriptsDir)) return "(scripts/ not found)";
  return fs.readdirSync(scriptsDir)
    .filter((f) => f.endsWith(".js") || f.endsWith(".ts") || f.endsWith(".py"))
    .sort()
    .join(", ");
}

// ── Build context ─────────────────────────────────────────────────────────────

function buildContext() {
  const sections = [];

  const packageJson = readFile("package.json");
  if (packageJson) sections.push(`## package.json\n\`\`\`json\n${packageJson}\n\`\`\``);

  // Only the CLI flag parsing + AGT-03 orchestrator block (most doc-relevant parts)
  const orchestrator = readFile("orchestrator/index.ts");
  if (orchestrator) {
    // First 260 lines covers flag parsing and the full AGT-03 block
    const excerpt = orchestrator.split("\n").slice(0, 260).join("\n");
    sections.push(`## orchestrator/index.ts (first 260 lines)\n\`\`\`typescript\n${excerpt}\n\`\`\``);
  }

  const envExample = readFile(".env.example");
  if (envExample) sections.push(`## .env.example\n\`\`\`\n${envExample}\n\`\`\``);

  const workflow = readFile(".github/workflows/qa-pipeline.yml");
  if (workflow) sections.push(`## .github/workflows/qa-pipeline.yml\n\`\`\`yaml\n${workflow}\n\`\`\``);

  sections.push(`## Agent index files (top-comment summaries)\n${agentSummaries()}`);
  sections.push(`## scripts/ directory\nFiles: ${scriptsSummary()}`);

  return sections.join("\n\n---\n\n");
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const claudeMd  = readFile("CLAUDE.md");
  const readmeMd  = readFile("README.md");

  if (!claudeMd || !readmeMd) {
    console.error("Could not read CLAUDE.md or README.md");
    process.exit(1);
  }

  const context = buildContext();

  console.log("Reading source files...");
  console.log(`  Context size: ~${Math.round(context.length / 4)} tokens`);
  console.log("Calling Claude API to update docs...\n");

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 16000,
    system: `You are a technical writer maintaining documentation for a 7-agent LLM QA pipeline.

You will be given:
1. Source files (package.json, orchestrator code, .env.example, workflow YAML, agent summaries)
2. The current CLAUDE.md and README.md

Your job is to update ONLY the sections of each doc that are directly derivable from the source files:

CLAUDE.md — update these sections only:
  - ## Commands  (from package.json scripts)
  - The agent sequence table in ## Architecture (from agent dirs and orchestrator)
  - Key state files list in ### State management (from orchestrator)
  - The configuration table in ## Configuration (from .env.example)
  - Guardrail env vars (from .env.example and orchestrator)
  - CLI flags listed in the orchestrator

README.md — update these sections only:
  - npm run commands listed throughout the doc
  - ## Agent reference table (agent names, roles — not models)
  - ## Environment variables table (from .env.example)
  - Manual dispatch inputs table (from workflow YAML)
  - ## Inter-agent data flow code block (from orchestrator state files)
  - ## Project structure code block (from actual directory structure described in sources)
  - scripts/ entry in Project structure (from scripts/ directory listing)

STRICT RULES:
- Do NOT change any prose explanations, Critical patterns, architectural decisions, or examples
- Do NOT invent content — only update what you can verify from the source files
- Do NOT change the overall document structure or section order
- Return a JSON object with exactly two keys: "claude_md" and "readme_md"
  containing the complete updated file content as strings
- Return ONLY the JSON object — no explanation, no markdown fences around the JSON`,
    messages: [
      {
        role: "user",
        content: `## Source files\n\n${context}\n\n---\n\n## Current CLAUDE.md\n\n${claudeMd}\n\n---\n\n## Current README.md\n\n${readmeMd}\n\nPlease return the updated CLAUDE.md and README.md as a JSON object with keys "claude_md" and "readme_md".`,
      },
    ],
  });

  const raw = response.content[0].text.trim();

  // Strip JSON fences if the model wrapped it anyway
  const jsonStr = raw.startsWith("```")
    ? raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim()
    : raw;

  let updated;
  try {
    updated = JSON.parse(jsonStr);
  } catch (err) {
    console.error("Failed to parse model response as JSON:");
    console.error(raw.slice(0, 500));
    process.exit(1);
  }

  if (!updated.claude_md || !updated.readme_md) {
    console.error("Response missing claude_md or readme_md keys");
    process.exit(1);
  }

  // Write updated files
  fs.writeFileSync(path.join(ROOT, "CLAUDE.md"),  updated.claude_md,  "utf8");
  fs.writeFileSync(path.join(ROOT, "README.md"),  updated.readme_md,  "utf8");

  // Usage summary
  const inputTokens  = response.usage?.input_tokens  ?? 0;
  const outputTokens = response.usage?.output_tokens ?? 0;
  const costUsd = (inputTokens / 1_000_000) * 3 + (outputTokens / 1_000_000) * 15;

  console.log("CLAUDE.md updated ✓");
  console.log("README.md  updated ✓");
  console.log("");
  console.log(`Tokens used: ${inputTokens.toLocaleString()} in / ${outputTokens.toLocaleString()} out`);
  console.log(`Estimated cost: $${costUsd.toFixed(4)}`);
  console.log("");
  console.log("Review the changes with: git diff CLAUDE.md README.md");
  console.log("Commit when satisfied:   git add CLAUDE.md README.md && git commit -m 'docs: update via update-docs script'");
}

main().catch((err) => {
  console.error("update-docs failed:", err.message);
  process.exit(1);
});
