import * as fs from "fs/promises";
import * as path from "path";
import type { TestCase } from "../03-test-case-designer";

// ── Types ──────────────────────────────────────────────────────────────────

export interface TraceabilityEntry {
  testCaseId: string;
  testCaseTitle: string;
  priority: string;
  type: string;
  specFile: string | null;
  testName: string | null;
  covered: boolean;
}

export interface CoverageReport {
  totalCases: number;
  coveredCases: number;
  gapCases: TraceabilityEntry[];
  traceabilityMatrix: TraceabilityEntry[];
  coveragePercent: number;
  p0CoveragePercent: number;
  p1CoveragePercent: number;
  blocked: boolean;
  remediationTasks: string[];
  generatedAt: string;
}

// ── Main Agent ─────────────────────────────────────────────────────────────

export async function runCoverageAuditor(
  testCases: TestCase[],
  specDir: string
): Promise<CoverageReport> {
  const specFiles = await loadSpecFiles(specDir);
  console.log(`  [AGT-05] Loaded ${Object.keys(specFiles).length} spec files`);

  const traceMatrix: TraceabilityEntry[] = testCases.map((tc) => {
    const match = findTestInSpecs(tc.id, tc.title, specFiles);
    return {
      testCaseId: tc.id,
      testCaseTitle: tc.title,
      priority: tc.priority,
      type: tc.type,
      specFile: match?.file ?? null,
      testName: match?.testName ?? null,
      covered: !!match,
    };
  });

  const covered = traceMatrix.filter((t) => t.covered);
  const gaps = traceMatrix.filter((t) => !t.covered);

  const p0Total = testCases.filter((t) => t.priority === "P0").length;
  const p1Total = testCases.filter((t) => t.priority === "P1").length;
  const p0Covered = traceMatrix.filter((t) => t.priority === "P0" && t.covered).length;
  const p1Covered = traceMatrix.filter((t) => t.priority === "P1" && t.covered).length;

  const p0Pct = p0Total > 0 ? (p0Covered / p0Total) * 100 : 100;
  const p1Pct = p1Total > 0 ? (p1Covered / p1Total) * 100 : 100;

  const minP0 = parseFloat(process.env.MIN_P0_COVERAGE ?? "80");
  const minP1 = parseFloat(process.env.MIN_P1_COVERAGE ?? "80");
  const maxGap = parseFloat(process.env.MAX_GAP_PERCENT ?? "20");

  // GUARDRAIL: block if critical coverage below threshold
  const blocked = p0Pct < minP0 || p1Pct < minP1;

  // GUARDRAIL: escalate if gap percent exceeds threshold
  const gapPercent = testCases.length > 0 ? (gaps.length / testCases.length) * 100 : 0;
  if (gapPercent > maxGap) {
    console.warn(
      `[AGT-05 GUARDRAIL] Gap count ${gapPercent.toFixed(1)}% exceeds ${maxGap}% threshold. ` +
        `Human review required.`
    );
  }

  const remediationTasks = gaps.map(
    (g) => `[AGT-04-TASK] TC-${g.testCaseId} | Priority: ${g.priority} | "${g.testCaseTitle}"`
  );

  // Write traceability matrix to disk
  const reportPath = "pipeline-state/traceability-matrix.json";
  await fs.mkdir("pipeline-state", { recursive: true });
  await fs.writeFile(reportPath, JSON.stringify(traceMatrix, null, 2), "utf-8");
  console.log(`  [AGT-05] Traceability matrix written to ${reportPath}`);

  return {
    totalCases: testCases.length,
    coveredCases: covered.length,
    gapCases: gaps,
    traceabilityMatrix: traceMatrix,
    coveragePercent: testCases.length > 0 ? (covered.length / testCases.length) * 100 : 0,
    p0CoveragePercent: p0Pct,
    p1CoveragePercent: p1Pct,
    blocked,
    remediationTasks,
    generatedAt: new Date().toISOString(),
  };
}

// ── Matching Logic ─────────────────────────────────────────────────────────

interface SpecMatch {
  file: string;
  testName: string;
}

function findTestInSpecs(
  tcId: string,
  tcTitle: string,
  specFiles: Record<string, string>
): SpecMatch | null {
  for (const [file, content] of Object.entries(specFiles)) {
    // Primary: match by TC ID comment
    if (content.includes(`TC-${tcId}`)) {
      const lines = content.split("\n");
      const idx = lines.findIndex((l) => l.includes(`TC-${tcId}`));
      const searchLines = lines.slice(idx, idx + 5);
      const testLine = searchLines.find((l) => /test\s*\(/.test(l));
      const testName = testLine?.match(/test\s*\(['"`](.+?)['"`]/)?.[1] ?? tcTitle;
      return { file, testName };
    }

    // Fallback: fuzzy title match (first 40 chars, normalised)
    const needle = tcTitle
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, "")
      .slice(0, 40);
    if (content.toLowerCase().includes(needle)) {
      return { file, testName: tcTitle };
    }
  }
  return null;
}

async function loadSpecFiles(specDir: string): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  try {
    await fs.access(specDir);
  } catch {
    console.warn(`  [AGT-05] Spec directory "${specDir}" not found — no coverage`);
    return result;
  }

  const entries = (await fs.readdir(specDir, { recursive: true, withFileTypes: true })).filter(
    (e: { isFile(): boolean; name: string }) =>
      e.isFile() && (e.name.endsWith(".spec.ts") || e.name.endsWith(".spec.js"))
  );

  for (const entry of entries) {
    const fullPath = path.join(specDir, entry.name);
    result[fullPath] = await fs.readFile(fullPath, "utf-8");
  }

  return result;
}
