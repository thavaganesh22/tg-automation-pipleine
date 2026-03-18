# LLM Model Change Guide

This document assesses the effort required to change the LLM model(s) used by the pipeline agents and provides step-by-step instructions for each scenario.

---

## Current State

### Model usage by agent

| Agent  | File                                     | Model               | Calls | max_tokens |
| ------ | ---------------------------------------- | ------------------- | ----- | ---------- |
| AGT-01 | `agents/01-codebase-analyst/index.ts`    | `claude-opus-4-6`   | 1     | 8096       |
| AGT-02 | `agents/02-jira-validator/index.ts`      | `claude-opus-4-6`   | 2     | 6000       |
| AGT-03 | `agents/03-test-case-designer/index.ts`  | `claude-opus-4-6`   | 1     | 8096       |
| AGT-04 | `agents/04-playwright-engineer/index.ts` | `claude-opus-4-6`   | 7     | 8192       |
| AGT-06 | `agents/06-test-executor/index.ts`       | `claude-opus-4-6`   | 1     | 8192       |
| AGT-07 | `agents/07-report-architect/index.ts`    | `claude-sonnet-4-6` | 1     | 1024       |

**Total:** 13 hardcoded model strings in 6 files.

### How the SDK is initialised

Every agent creates its own `Anthropic` client at module load time:

```typescript
import Anthropic from "@anthropic-ai/sdk";
const client = new Anthropic(); // reads ANTHROPIC_API_KEY from env automatically
```

The model string is then passed per-call:

```typescript
const response = await client.messages.create({
  model: "claude-opus-4-6",   // ← hardcoded here
  max_tokens: 8192,
  system: "...",
  messages: [...]
});
```

---

## Scenario A — Swap one or all agents to a different Claude model

**Effort: Very low (< 30 minutes)**

Only the model strings need changing. The Anthropic SDK, authentication (`ANTHROPIC_API_KEY`), and the `messages.create` call shape are identical across all Claude models.

### Considerations before changing

| Factor                         | Detail                                                                                                                                                                                                                      |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Max output tokens**          | `claude-opus-4-6` and `claude-sonnet-4-6` support up to 8 192 output tokens. `claude-haiku-4-5` supports up to 4 096. Any `max_tokens` value above 4 096 must be reduced for Haiku or the call will error.                  |
| **Prompt compatibility**       | All three Claude model families understand the same prompt format. No prompt rewrites needed.                                                                                                                               |
| **Output quality**             | AGT-01, AGT-03, and AGT-04 generate structured JSON and TypeScript. These tasks depend heavily on reasoning quality. Haiku may produce less accurate selectors or more JSON parse failures. Sonnet is a good middle ground. |
| **Cost vs quality trade-offs** | AGT-07 already uses Sonnet (report summary is low-stakes). AGT-04 (code generation) benefits most from Opus. AGT-06 heal (one-shot repair) is also high-stakes.                                                             |

### Steps

**1. Decide which agents to change and to which model.**

Recommended split if reducing cost:

| Agent  | Suggested model     | Rationale                                                   |
| ------ | ------------------- | ----------------------------------------------------------- |
| AGT-01 | `claude-sonnet-4-6` | Scenario generation is structured but not code              |
| AGT-02 | `claude-sonnet-4-6` | JIRA alignment is reasoning-heavy but tolerates Sonnet      |
| AGT-03 | `claude-sonnet-4-6` | Test case design benefits from Sonnet+                      |
| AGT-04 | `claude-opus-4-6`   | TypeScript/POM generation — keep Opus                       |
| AGT-06 | `claude-opus-4-6`   | Spec repair — keep Opus                                     |
| AGT-07 | `claude-haiku-4-5`  | Report summary is low-stakes; already Sonnet, Haiku is fine |

**2. Update the model strings.**

In each target file, replace the model string. Example for AGT-01:

```typescript
// agents/01-codebase-analyst/index.ts  line ~399
// Before:
model: "claude-opus-4-6",

// After:
model: "claude-sonnet-4-6",
```

Repeat for every `client.messages.create()` call in the target agent file.

**3. Adjust `max_tokens` if switching to Haiku.**

`claude-haiku-4-5` has a 4 096 output token limit. For any call currently using `max_tokens: 8192` or `max_tokens: 8096`, reduce it:

```typescript
// Before (Opus/Sonnet):
max_tokens: 8192,

// After (Haiku):
max_tokens: 4096,
```

Files affected if you switch to Haiku:

- `agents/01-codebase-analyst/index.ts` — change `8096` → `4096`
- `agents/03-test-case-designer/index.ts` — change `8096` → `4096`
- `agents/04-playwright-engineer/index.ts` — change all seven `8192` → `4096`
- `agents/06-test-executor/index.ts` — change `8192` → `4096`

**4. Typecheck.**

```bash
npx tsc --noEmit
```

**5. Run a smoke test on a single agent.**

```bash
npm run pipeline -- --agent=1
```

Check that the output JSON in `pipeline-state/scenarios.json` is valid and has the expected structure.

---

## Scenario B — Make the model configurable via environment variables (no code changes per swap)

**Effort: Low (1–2 hours)**

Add env-var constants at the top of each agent file so the model can be changed in `.env` or CI secrets without touching code.

### Steps

**1. Add model constants to each agent file.**

Pattern to add near the top of each agent (after the imports):

```typescript
// agents/01-codebase-analyst/index.ts
const MODEL = process.env.AGT01_MODEL ?? "claude-opus-4-6";
const MAX_TOKENS = parseInt(process.env.AGT01_MAX_TOKENS ?? "8096", 10);
```

```typescript
// agents/02-jira-validator/index.ts
const MODEL = process.env.AGT02_MODEL ?? "claude-opus-4-6";
const MAX_TOKENS = parseInt(process.env.AGT02_MAX_TOKENS ?? "6000", 10);
```

```typescript
// agents/03-test-case-designer/index.ts
const MODEL = process.env.AGT03_MODEL ?? "claude-opus-4-6";
const MAX_TOKENS = parseInt(process.env.AGT03_MAX_TOKENS ?? "8096", 10);
```

```typescript
// agents/04-playwright-engineer/index.ts
const MODEL = process.env.AGT04_MODEL ?? "claude-opus-4-6";
const MAX_TOKENS = parseInt(process.env.AGT04_MAX_TOKENS ?? "8192", 10);
```

```typescript
// agents/06-test-executor/index.ts  (inside healSpecFile function)
const MODEL = process.env.AGT06_HEAL_MODEL ?? "claude-opus-4-6";
const MAX_TOKENS = parseInt(process.env.AGT06_HEAL_MAX_TOKENS ?? "8192", 10);
```

```typescript
// agents/07-report-architect/index.ts
const MODEL = process.env.AGT07_MODEL ?? "claude-sonnet-4-6";
const MAX_TOKENS = parseInt(process.env.AGT07_MAX_TOKENS ?? "1024", 10);
```

**2. Replace hardcoded strings with the constants.**

In each `client.messages.create()` call:

```typescript
// Before:
model: "claude-opus-4-6",
max_tokens: 8192,

// After:
model: MODEL,
max_tokens: MAX_TOKENS,
```

AGT-04 has seven `client.messages.create()` calls — all use the same `MODEL` and `MAX_TOKENS` constants so it is one pass of find-and-replace.

**3. Add the env vars to `.env.example`.**

```bash
# LLM model overrides (optional — defaults shown)
AGT01_MODEL=claude-opus-4-6
AGT01_MAX_TOKENS=8096
AGT02_MODEL=claude-opus-4-6
AGT02_MAX_TOKENS=6000
AGT03_MODEL=claude-opus-4-6
AGT03_MAX_TOKENS=8096
AGT04_MODEL=claude-opus-4-6
AGT04_MAX_TOKENS=8192
AGT06_HEAL_MODEL=claude-opus-4-6
AGT06_HEAL_MAX_TOKENS=8192
AGT07_MODEL=claude-sonnet-4-6
AGT07_MAX_TOKENS=1024
```

**4. Expose the vars in the GitHub Actions workflow (if switching in CI).**

In `.github/workflows/qa-pipeline.yml`, under each pipeline step's `env:` block, add:

```yaml
AGT01_MODEL: ${{ vars.AGT01_MODEL }}
AGT04_MODEL: ${{ vars.AGT04_MODEL }}
# etc.
```

Set the values as GitHub Variables (not secrets — model names are not sensitive).

**5. Typecheck and smoke test.**

```bash
npx tsc --noEmit
npm run pipeline -- --agent=1
```

After this, changing the model for any agent requires only a `.env` edit or a GitHub Variable update — no code changes, no deployment.

---

## Scenario C — Switch to a non-Anthropic provider (OpenAI, Gemini, etc.)

**Effort: Moderate (1–2 days)**

The Anthropic SDK is used throughout. Switching providers requires replacing the client, adapting the call signature, and verifying that prompt outputs still parse correctly.

### What changes

| Layer          | Anthropic (current)                     | OpenAI example                                         |
| -------------- | --------------------------------------- | ------------------------------------------------------ |
| Package        | `@anthropic-ai/sdk`                     | `openai`                                               |
| Auth env var   | `ANTHROPIC_API_KEY`                     | `OPENAI_API_KEY`                                       |
| Client init    | `new Anthropic()`                       | `new OpenAI()`                                         |
| Call method    | `client.messages.create(...)`           | `client.chat.completions.create(...)`                  |
| Message format | `{ role: "user", content: "..." }`      | Same shape — compatible                                |
| System prompt  | Top-level `system:` field               | `{ role: "system", content: "..." }` in messages array |
| Response text  | `response.content[0].text`              | `response.choices[0].message.content`                  |
| Stop reason    | `response.stop_reason === "max_tokens"` | `response.choices[0].finish_reason === "length"`       |

### Steps

**1. Install the new provider's SDK.**

```bash
npm install openai          # or @google/generative-ai, etc.
```

**2. Create a shared LLM client wrapper.**

Rather than changing every agent file individually, create one adapter module:

```typescript
// llm/client.ts
export interface LLMResponse {
  text: string;
  stoppedAtLimit: boolean;
}

export async function llmCall(params: {
  model: string;
  maxTokens: number;
  system: string;
  userMessage: string;
}): Promise<LLMResponse> {
  // Swap this implementation to change providers
  const Anthropic = require("@anthropic-ai/sdk").default;
  const client = new Anthropic();
  const res = await client.messages.create({
    model: params.model,
    max_tokens: params.maxTokens,
    system: params.system,
    messages: [{ role: "user", content: params.userMessage }],
  });
  return {
    text: res.content[0]?.type === "text" ? res.content[0].text : "",
    stoppedAtLimit: res.stop_reason === "max_tokens",
  };
}
```

**3. Update each agent to call `llmCall()` instead of `client.messages.create()` directly.**

This is the bulk of the work. Each agent has 1–7 LLM calls. Each needs to be refactored to use the wrapper. The system prompt and user message are already separated in the existing code, so the refactor is mechanical.

**4. Swap the provider implementation in `llm/client.ts`.**

Only one file changes when the provider changes:

```typescript
// OpenAI implementation:
import OpenAI from "openai";
const client = new OpenAI(); // reads OPENAI_API_KEY from env

const res = await client.chat.completions.create({
  model: params.model,
  max_tokens: params.maxTokens,
  messages: [
    { role: "system", content: params.system },
    { role: "user", content: params.userMessage },
  ],
});
return {
  text: res.choices[0]?.message?.content ?? "",
  stoppedAtLimit: res.choices[0]?.finish_reason === "length",
};
```

**5. Verify prompt output compatibility.**

The pipeline parses LLM output as JSON (AGT-01, 02, 03) or TypeScript (AGT-04). Different models respond differently to the same prompt. After switching:

- Run the pipeline end-to-end on a test branch
- Check `pipeline-state/scenarios.json` for valid JSON structure
- Check `playwright-tests/specs/` for syntactically complete TypeScript
- The `extractJSONArray` and `extractTypeScriptCode` extraction helpers are already defensive (handle code fences, trailing text) — they will absorb minor formatting differences

**6. Update auth env vars.**

Replace `ANTHROPIC_API_KEY` with the new provider's key in `.env`, `.env.example`, and the GitHub Actions workflow `env:` blocks.

### Provider compatibility notes

| Provider                  | Max output tokens | JSON instruction following | TypeScript generation | Notes                                                     |
| ------------------------- | ----------------- | -------------------------- | --------------------- | --------------------------------------------------------- |
| Claude Opus 4.6 (current) | 8 192             | Excellent                  | Excellent             | Current baseline                                          |
| Claude Sonnet 4.6         | 8 192             | Excellent                  | Very good             | Lower cost, negligible quality drop for most agents       |
| Claude Haiku 4.5          | 4 096             | Good                       | Good                  | Significant quality risk for AGT-04 TypeScript generation |
| GPT-4o                    | 4 096             | Very good                  | Very good             | Different system prompt handling; test JSON parsing       |
| GPT-4o-mini               | 4 096             | Good                       | Good                  | Comparable to Haiku for cost                              |
| Gemini 1.5 Pro            | 8 192             | Good                       | Good                  | Different SDK shape; more refactoring in wrapper          |

---

## Summary

| Scenario                                  | Files changed                                      | Estimated time | Risk                                     |
| ----------------------------------------- | -------------------------------------------------- | -------------- | ---------------------------------------- |
| A — Swap model strings directly           | 1–6 agent files, 1–13 string replacements          | < 30 min       | Low if staying on Anthropic              |
| B — Make models configurable via env vars | Same 6 files + `.env.example` + workflow YAML      | 1–2 hours      | Low                                      |
| C — Switch to a different provider        | New `llm/client.ts` + all 6 agent files refactored | 1–2 days       | Medium (prompt output validation needed) |

Scenario B takes two hours, makes every future model change a configuration edit, and adds no risk to the existing pipeline.

Scenario C is only worthwhile if there is a firm requirement to use a non-Anthropic provider.
