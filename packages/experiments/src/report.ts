/**
 * Report generation (SPEC §11 `report`, §12): reads persisted run metrics
 * from artifacts/runs/, aggregates scenario × policy, writes
 * artifacts/reports/latest.json + latest.md. Zero fabrication — the report
 * is a pure projection of run artifacts.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { aggregate, renderMarkdown, type Report, type RunMetrics } from "./metrics";

export function collectRunMetrics(runsDir: string): RunMetrics[] {
  if (!existsSync(runsDir)) return [];
  const metrics: RunMetrics[] = [];
  for (const runDir of readdirSync(runsDir)) {
    const metricsPath = join(runsDir, runDir, "metrics.json");
    if (!existsSync(metricsPath)) continue;
    metrics.push(JSON.parse(readFileSync(metricsPath, "utf8")) as RunMetrics);
  }
  metrics.sort((a, b) =>
    `${a.scenarioId}/${a.variant}/${a.policyId}`.localeCompare(
      `${b.scenarioId}/${b.variant}/${b.policyId}`,
    ),
  );
  return metrics;
}

export function writeReport(
  runsDir: string,
  reportsDir: string,
  policyOrder: readonly string[],
): Report {
  const metrics = collectRunMetrics(runsDir);
  const report = aggregate(metrics, policyOrder);
  mkdirSync(reportsDir, { recursive: true });
  writeFileSync(join(reportsDir, "latest.json"), JSON.stringify(report, null, 2) + "\n");
  writeFileSync(join(reportsDir, "latest.md"), renderMarkdown(report) + "\n");
  return report;
}
