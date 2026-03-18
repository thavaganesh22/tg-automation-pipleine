/**
 * promote-to-regression.js
 *
 * Promotes staged new-feature test cases into the regression baseline.
 * Run this locally after you are satisfied with a pipeline run and the
 * JIRA story is ready to be considered done.
 *
 * Usage:
 *   npm run promote
 *
 * What it does:
 *   1. Reads pipeline-state/pending-promotion.json (written by AGT-03)
 *   2. Filters out cases already in regression-baseline.json
 *   3. Changes caseScope → "regression" for the new cases
 *   4. Appends them to regression-baseline.json
 *   5. Deletes pending-promotion.json
 */

const fs   = require("fs");
const path = require("path");

const PENDING  = path.resolve(__dirname, "../pipeline-state/pending-promotion.json");
const BASELINE = path.resolve(__dirname, "../pipeline-state/regression-baseline.json");

if (!fs.existsSync(PENDING)) {
  console.log("Nothing to promote — pipeline-state/pending-promotion.json does not exist.");
  console.log("Run the pipeline first (npm run pipeline) to generate new-feature cases.");
  process.exit(0);
}

const pending = JSON.parse(fs.readFileSync(PENDING, "utf8"));
if (!Array.isArray(pending) || pending.length === 0) {
  console.log("pending-promotion.json is empty — nothing to promote.");
  fs.rmSync(PENDING);
  process.exit(0);
}

const baseline = fs.existsSync(BASELINE)
  ? JSON.parse(fs.readFileSync(BASELINE, "utf8"))
  : [];

const baselineIds = new Set(baseline.map((tc) => tc.id));
const toPromote   = pending.filter((tc) => !baselineIds.has(tc.id));

if (toPromote.length === 0) {
  console.log("All pending cases are already in the regression baseline — nothing new to promote.");
  fs.rmSync(PENDING);
  process.exit(0);
}

const promoted = toPromote.map((tc) => ({ ...tc, caseScope: "regression" }));
const updated  = [...baseline, ...promoted];

fs.writeFileSync(BASELINE, JSON.stringify(updated, null, 2));
fs.rmSync(PENDING);

console.log(`Promoted ${promoted.length} case(s) to regression baseline.`);
console.log(`Baseline total: ${updated.length} case(s).`);
console.log("");
console.log("Promoted cases:");
promoted.forEach((tc) => console.log(`  [${tc.priority}] ${tc.title}`));
console.log("");
console.log("Next step: commit pipeline-state/regression-baseline.json to your branch.");
