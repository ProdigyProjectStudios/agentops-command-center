/**
 * Eval harness reporter.
 *
 * Writes a machine-readable JSON report to eval-results/<timestamp>.json
 * and prints a human-readable summary table to stdout.
 *
 * NOTE: eval-results/ is not currently listed in the root .gitignore.
 * The directory is created automatically by this reporter. Whether to add
 * `eval-results/` to .gitignore (to keep generated reports out of version
 * control) is a decision left to the repository owner.
 */

import fs from "node:fs";
import path from "node:path";

export interface CheckResult {
  scenario: string;
  agent: string;
  check: string;
  passed: boolean;
  expected?: unknown;
  actual?: unknown;
  note?: string;
}

export interface EvalReport {
  runAt: string;
  summary: {
    scenarios: number;
    totalChecks: number;
    passed: number;
    failed: number;
  };
  coverageGaps: string[];
  results: {
    scenario: string;
    checks: CheckResult[];
    passed: number;
    failed: number;
  }[];
}

/** Coverage gaps that are structurally unreachable through the public demo path. */
export const COVERAGE_GAPS: string[] = [
  "financeReviewDemo budgetCheck.passes === false: unreachable through public request path. " +
    "The 85% utilisation threshold requires ≥ 10,200,000¢ but the maximum keyword cost " +
    "(roofing + urgent priority boost) is 6,000,000¢ (50% utilisation). " +
    "Testing this branch requires either modifying production constants or exposing " +
    "a test seam in financeReviewDemo — neither is done to preserve the no-production-code-change constraint.",
];

export function buildReport(allChecks: CheckResult[]): EvalReport {
  // Group by scenario — preserving insertion order.
  const byScenario = new Map<string, CheckResult[]>();
  for (const c of allChecks) {
    const existing = byScenario.get(c.scenario);
    if (existing) {
      existing.push(c);
    } else {
      byScenario.set(c.scenario, [c]);
    }
  }

  const results = Array.from(byScenario.entries()).map(([scenario, checks]) => ({
    scenario,
    checks,
    passed: checks.filter((c) => c.passed).length,
    failed: checks.filter((c) => !c.passed).length,
  }));

  const totalChecks = allChecks.length;
  const passed = allChecks.filter((c) => c.passed).length;
  const failed = totalChecks - passed;

  return {
    runAt: new Date().toISOString(),
    summary: {
      scenarios: byScenario.size,
      totalChecks,
      passed,
      failed,
    },
    coverageGaps: COVERAGE_GAPS,
    results,
  };
}

export function writeReport(report: EvalReport): string {
  const dir = path.resolve("eval-results");
  fs.mkdirSync(dir, { recursive: true });

  // Timestamp: YYYY-MM-DD_HH-MM-SS
  const ts = report.runAt
    .replace("T", "_")
    .replace(/\.\d{3}Z$/, "")
    .replace(/:/g, "-");
  const filePath = path.join(dir, `${ts}.json`);
  fs.writeFileSync(filePath, JSON.stringify(report, null, 2) + "\n", "utf8");
  return filePath;
}

export function printSummary(report: EvalReport): void {
  const { summary, results, coverageGaps } = report;
  const runAt = report.runAt.replace("T", " ").replace(/\.\d{3}Z$/, " UTC");
  const allPassed = summary.failed === 0;
  const status = allPassed ? "✓ ALL PASSED" : `✗ ${summary.failed} FAILED`;

  const divider = "─".repeat(56);

  console.log(`\nAgentOps Eval Harness — ${runAt}`);
  console.log(divider);
  console.log(`Scenarios : ${summary.scenarios}`);
  console.log(
    `Checks    : ${summary.totalChecks}  ✓ ${summary.passed}  ✗ ${summary.failed}`,
  );
  console.log(`Status    : ${status}`);
  console.log(divider);

  for (const r of results) {
    const scenarioStatus =
      r.failed === 0 ? `✓ ${r.passed}/${r.passed + r.failed}` : `✗ ${r.failed} failed`;
    console.log(`  ${r.scenario.padEnd(38)} ${scenarioStatus}`);

    if (r.failed > 0) {
      for (const c of r.checks.filter((ch) => !ch.passed)) {
        const exp = c.expected !== undefined ? ` expected=${JSON.stringify(c.expected)}` : "";
        const act = c.actual !== undefined ? ` actual=${JSON.stringify(c.actual)}` : "";
        console.log(`    ✗ [${c.agent}] ${c.check}${exp}${act}`);
      }
    }
  }

  if (coverageGaps.length > 0) {
    console.log(divider);
    console.log("Coverage gaps (unreachable branches):");
    for (const gap of coverageGaps) {
      // Wrap at ~72 chars for readability
      const words = gap.split(" ");
      let line = "  • ";
      for (const word of words) {
        if (line.length + word.length > 74) {
          console.log(line);
          line = "    " + word + " ";
        } else {
          line += word + " ";
        }
      }
      if (line.trim()) console.log(line);
    }
  }

  console.log(divider + "\n");
}
