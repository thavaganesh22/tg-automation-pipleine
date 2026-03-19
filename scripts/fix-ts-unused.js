#!/usr/bin/env node
/**
 * fix-ts-unused.js
 *
 * Auto-fix TS6133 (unused variable / parameter) errors in generated
 * playwright-tests/ files by prefixing the identifier with _.
 *
 * Called by CI after the pipeline generates new POM / fixture files and before
 * the bot commits them back to the branch, so the initial typecheck on the
 * next push always starts clean.
 *
 * Usage: node scripts/fix-ts-unused.js
 * Exit 0 = clean (with or without fixes applied)
 * Exit 1 = non-TS6133 errors remain that need manual attention
 */

const { execSync } = require("child_process");
const fs = require("fs");

function runTypecheck() {
  try {
    execSync("npx tsc --noEmit 2>&1", { encoding: "utf8" });
    return "";
  } catch (err) {
    return (err.stdout || "") + (err.stderr || "");
  }
}

const output = runTypecheck();

if (!output.trim()) {
  console.log("TypeScript: no errors.");
  process.exit(0);
}

// Parse TS6133 errors only in generated playwright-tests/ files
// Format: "playwright-tests/pages/foo.page.ts(12,34): error TS6133: 'bar' is declared but..."
const TS6133 =
  /^(playwright-tests\/[^(]+)\((\d+),\d+\): error TS6133: '([^']+)' is declared/gm;

const fixes = [];
let match;
while ((match = TS6133.exec(output)) !== null) {
  fixes.push({ file: match[1], line: parseInt(match[2], 10), name: match[3] });
}

if (fixes.length === 0) {
  // Errors exist but none are TS6133 in generated files — surface them
  console.error(output);
  process.exit(1);
}

// Group by file and apply in reverse line order so edits don't shift offsets
const byFile = {};
for (const fix of fixes) {
  (byFile[fix.file] = byFile[fix.file] || []).push(fix);
}

for (const [file, fileFixes] of Object.entries(byFile)) {
  const lines = fs.readFileSync(file, "utf8").split("\n");
  fileFixes.sort((a, b) => b.line - a.line);
  for (const { line, name } of fileFixes) {
    const idx = line - 1;
    // Replace first whole-word occurrence of the identifier on that line
    lines[idx] = lines[idx].replace(new RegExp(`\\b${name}\\b`), `_${name}`);
    console.log(`  Fixed ${file}:${line}  '${name}' → '_${name}'`);
  }
  fs.writeFileSync(file, lines.join("\n"));
}

// Re-check after fixes
const remaining = runTypecheck();
if (!remaining.trim()) {
  console.log("TypeScript: clean after auto-fix.");
  process.exit(0);
}

// Check whether only TS6133 still remain (edge case: fix loop needs another pass)
const stillUnused = remaining
  .split("\n")
  .filter((l) => l.includes("error TS"));
const allUnused = stillUnused.every((l) => l.includes("TS6133"));

if (allUnused && stillUnused.length > 0) {
  // Run one more pass for any remaining TS6133 (nested unused refs)
  console.log("Running second fix pass...");
  execSync("node " + __filename, { stdio: "inherit" });
} else if (remaining.trim()) {
  console.error(
    "TypeScript errors remain after auto-fix — manual intervention required:"
  );
  console.error(remaining);
  process.exit(1);
}
