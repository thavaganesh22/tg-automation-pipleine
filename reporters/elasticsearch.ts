/**
 * reporters/elasticsearch.ts
 *
 * Custom Playwright reporter that indexes test results into Elasticsearch
 * using the same qa-test-runs / qa-failed-tests schema as AGT-07.
 *
 * Only fires on direct `npm test` runs — NOT during the full pipeline
 * (AGT-06 generates its own config that never loads this file).
 *
 * Coverage fields are left as 0 — those are only available via the full
 * pipeline (AGT-05 → AGT-07).
 *
 * Config via env vars:
 *   ELASTICSEARCH_URL   default: http://localhost:9200
 *                       supports credentials: http://user:pass@host:9200
 *   SLA_PASS_RATE       decimal threshold for slaBreached (default: 0.95)
 */

import type {
  Reporter,
  TestCase,
  TestResult,
  FullResult,
} from "@playwright/test/reporter";
import * as http from "http";
import * as https from "https";
import { URL } from "url";

const ES_URL = (process.env.ELASTICSEARCH_URL ?? "http://localhost:9200").replace(/\/$/, "");
const ES_INDEX_RUNS     = "qa-test-runs";
const ES_INDEX_FAILURES = "qa-failed-tests";
const SLA_PASS_RATE     = parseFloat(process.env.SLA_PASS_RATE ?? "0.95");

interface TrackedResult {
  status: "passed" | "failed" | "flaky" | "skipped";
  retried: boolean;
  title:   string;
  file:    string;
  error:   string;
}

class ElasticsearchReporter implements Reporter {
  private readonly runId     = `run-local-${Date.now()}`;
  private readonly startedAt = new Date().toISOString();
  private readonly startMs   = Date.now();

  // Keyed by test.id — always holds the latest/final outcome per test.
  private readonly results = new Map<string, TrackedResult>();

  onTestEnd(test: TestCase, result: TestResult): void {
    const retried  = result.retry > 0;
    const existing = this.results.get(test.id);

    if (result.status === "skipped") {
      // Only record skipped if we haven't seen this test pass/fail yet.
      if (!existing) {
        this.results.set(test.id, {
          status: "skipped", retried: false,
          title: test.title, file: test.location.file, error: "",
        });
      }
      return;
    }

    if (result.status === "passed") {
      // If a previous attempt failed, this is a flaky test.
      const status = retried ? "flaky" : "passed";
      this.results.set(test.id, {
        status, retried,
        title: test.title, file: test.location.file, error: "",
      });
      return;
    }

    // failed / timedOut / interrupted — only overwrite if no better result exists.
    if (!existing || existing.status === "failed") {
      this.results.set(test.id, {
        status: "failed", retried,
        title: test.title, file: test.location.file,
        error: (result.error?.message ?? "Unknown error").slice(0, 500),
      });
    }
  }

  async onEnd(_result: FullResult): Promise<void> {
    // Tally outcomes from the deduplicated map.
    let passed = 0, failed = 0, flaky = 0, skipped = 0;
    const failedTests: TrackedResult[] = [];

    for (const r of this.results.values()) {
      if      (r.status === "passed")  { passed++;  }
      else if (r.status === "flaky")   { flaky++;  passed++; } // flaky counts as a pass
      else if (r.status === "skipped") { skipped++; }
      else                             { failed++;  failedTests.push(r); }
    }

    const finishedAt  = new Date().toISOString();
    const durationMs  = Date.now() - this.startMs;
    const totalTests  = passed + failed + skipped;
    const passRate    = totalTests > 0 ? passed / totalTests : 0;
    const slaBreached = passRate < SLA_PASS_RATE;

    // Infer testType from spec filenames.
    const files  = [...this.results.values()].map((r) => r.file);
    const hasApi = files.some((f) => f.endsWith(".api.spec.ts"));
    const hasUi  = files.some((f) => !f.endsWith(".api.spec.ts"));
    const testType: "ui" | "api" | "both" =
      hasApi && hasUi ? "both" : hasApi ? "api" : "ui";

    const runDoc = {
      "@timestamp":        finishedAt,
      runId:               this.runId,
      startedAt:           this.startedAt,
      finishedAt,
      testType,
      totalTests,
      passed,
      failed,
      flaky,
      skipped,
      durationMs,
      passRate,
      // Coverage not available from direct Playwright runs — populated by full pipeline only.
      coveragePercent:      0,
      p0CoveragePercent:    0,
      p1CoveragePercent:    0,
      uiCoveragePercent:    0,
      apiCoveragePercent:   0,
      trend:                "stable",
      slaBreached,
      aiInsights:           "",
    };

    try {
      await esRequest("PUT", `/${ES_INDEX_RUNS}/_doc/${this.runId}`, runDoc);
      console.log(`\n[ES Reporter] Run indexed → ${ES_INDEX_RUNS}/${this.runId}`);
    } catch (err) {
      console.warn(`\n[ES Reporter] Elasticsearch unavailable — skipping index (${(err as Error).message})`);
      return;
    }

    for (let i = 0; i < failedTests.length; i++) {
      const f = failedTests[i];
      try {
        await esRequest("PUT", `/${ES_INDEX_FAILURES}/_doc/${this.runId}-${i}`, {
          "@timestamp": finishedAt,
          runId:        this.runId,
          testName:     f.title,
          file:         f.file,
          error:        f.error,
          retried:      f.retried,
        });
      } catch {
        // Suppress per-failure errors — run doc is more important.
      }
    }

    if (failedTests.length > 0) {
      console.log(`[ES Reporter] ${failedTests.length} failure(s) indexed → ${ES_INDEX_FAILURES}`);
    }

    const kibanaUrl = ES_URL.replace(/:9200$/, ":5601");
    console.log(`[ES Reporter] Dashboard → ${kibanaUrl}/app/dashboards#/view/dash-qa-pipeline-001\n`);
  }

  // This reporter is a side-effect reporter — it doesn't own the console output.
  printsToStdio(): boolean { return false; }
}

// ── Elasticsearch HTTP helper ─────────────────────────────────────────────────

function esRequest(method: string, urlPath: string, body: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const parsed  = new URL(ES_URL + urlPath);
    const lib     = parsed.protocol === "https:" ? https : http;
    const payload = JSON.stringify(body);

    const authHeader =
      parsed.username && parsed.password
        ? {
            Authorization: `Basic ${Buffer.from(
              `${parsed.username}:${decodeURIComponent(parsed.password)}`
            ).toString("base64")}`,
          }
        : {};

    const options = {
      hostname: parsed.hostname,
      port:     Number(parsed.port) || (parsed.protocol === "https:" ? 443 : 80),
      path:     parsed.pathname + parsed.search,
      method,
      headers: {
        "Content-Type":   "application/json",
        "Content-Length": Buffer.byteLength(payload),
        ...authHeader,
      },
    };

    const req = lib.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        if ((res.statusCode ?? 500) >= 400) {
          reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 200)}`));
        } else {
          resolve();
        }
      });
    });

    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

export default ElasticsearchReporter;
