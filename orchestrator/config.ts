import { z } from "zod";

const ConfigSchema = z.object({
  repoPath: z.string().default("./"),
  openApiPath: z.string().optional(),
  stagingUrl: z.string().url(),
  jira: z.object({
    host: z.string().url(),
    token: z.string().min(1),
    projectKey: z.string().min(1),
    sprintId: z.string().optional(),
  }),
  guardrails: z.object({
    minP0Coverage: z.number().min(0).max(100).default(80),
    minP1Coverage: z.number().min(0).max(100).default(80),
    maxGapPercent: z.number().min(0).max(100).default(20),
    maxFilesScan: z.number().positive().default(1000),
    maxTestCases: z.number().positive().default(500),
  }),
  sla: z.object({
    passRate: z.number().min(0).max(1).default(0.95),
    stakeholderEmails: z.array(z.string().email()).default([]),
  }),
});

export type PipelineConfig = z.infer<typeof ConfigSchema>;

export async function loadConfig(): Promise<PipelineConfig> {
  const raw = {
    repoPath: process.env.REPO_PATH ?? "./",
    openApiPath: process.env.OPEN_API_PATH,
    stagingUrl: process.env.BASE_URL,
    jira: {
      host: process.env.JIRA_HOST,
      token: process.env.JIRA_TOKEN,
      projectKey: process.env.JIRA_PROJECT_KEY,
      sprintId: process.env.JIRA_SPRINT_ID,
    },
    guardrails: {
      minP0Coverage: Number(process.env.MIN_P0_COVERAGE ?? "80"),
      minP1Coverage: Number(process.env.MIN_P1_COVERAGE ?? "80"),
      maxGapPercent: Number(process.env.MAX_GAP_PERCENT ?? "20"),
      maxFilesScan: Number(process.env.MAX_FILES_SCAN ?? "1000"),
      maxTestCases: Number(process.env.MAX_TEST_CASES ?? "500"),
    },
    sla: {
      passRate: Number(process.env.SLA_PASS_RATE ?? "0.95"),
      stakeholderEmails: (process.env.STAKEHOLDER_EMAILS ?? "")
        .split(",")
        .map((e) => e.trim())
        .filter(Boolean),
    },
  };

  const result = ConfigSchema.safeParse(raw);
  if (!result.success) {
    const errors = result.error.errors.map((e) => `  ${e.path.join(".")}: ${e.message}`).join("\n");
    throw new Error(`[CONFIG] Invalid pipeline configuration:\n${errors}\n\nCheck your .env file against .env.example`);
  }

  return result.data;
}
