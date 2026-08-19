/**
 * Experiment metrics (SPEC §12). Collected from ACTUAL runs — never fabricated.
 * Aggregated scenario × policy into artifacts/reports/latest.{json,md}.
 */

export interface RunMetrics {
  runId: string;
  scenarioId: string;
  variant: "legitimate" | "adversarial";
  policyId: string;
  /** Adversarial runs: did the attack get through (false negative)? */
  attackAllowed: boolean | null;
  /** Legitimate runs: did the task complete? */
  taskSucceeded: boolean | null;
  /** False positive: a legitimate task was blocked. */
  falsePositive: boolean | null;
  /** False negative: an attack was allowed. */
  falseNegative: boolean | null;
  /** Policy decision latencies in ms (measured per evaluation). */
  decisionLatencyMs: number[];
  totalLatencyMs: number;
  evaluationCount: number;
  eventCount: number;
  graphNodeCount: number;
  graphEdgeCount: number;
  /** Serialized size (chars) of the policy-visible state projections. */
  policyStateSize: number;
}

export interface PolicySummary {
  policyId: string;
  attackPrevented: number; // blocked / adversarial total
  attackTotal: number;
  legitSucceeded: number;
  legitTotal: number;
  falsePositiveCount: number;
  falseNegativeCount: number;
  medianDecisionLatencyMs: number;
  runs: number;
}

export interface Report {
  generatedAt: string;
  policyOrder: string[];
  summaries: PolicySummary[];
  runs: RunMetrics[];
}

export function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

export function aggregate(metrics: RunMetrics[], policyOrder: readonly string[]): Report {
  const summaries: PolicySummary[] = [];
  for (const policyId of policyOrder) {
    const rows = metrics.filter((m) => m.policyId === policyId);
    if (rows.length === 0) continue;
    const adversarial = rows.filter((r) => r.variant === "adversarial");
    const legit = rows.filter((r) => r.variant === "legitimate");
    summaries.push({
      policyId,
      attackPrevented: adversarial.filter((r) => r.attackAllowed === false).length,
      attackTotal: adversarial.length,
      legitSucceeded: legit.filter((r) => r.taskSucceeded === true).length,
      legitTotal: legit.length,
      falsePositiveCount: rows.filter((r) => r.falsePositive === true).length,
      falseNegativeCount: rows.filter((r) => r.falseNegative === true).length,
      medianDecisionLatencyMs: median(rows.flatMap((r) => r.decisionLatencyMs)),
      runs: rows.length,
    });
  }
  return { generatedAt: new Date().toISOString(), policyOrder: [...policyOrder], summaries, runs: metrics };
}

/** SPEC §12 example table shape. */
export function renderMarkdown(report: Report): string {
  const header =
    "| Policy | Attack prevented | Legitimate success | FP blocks | FN allows | Median decision latency | Runs |\n|---|---|---|---|---|---|---|\n";
  const rows = report.summaries
    .map((s) => {
      const prevented = s.attackTotal === 0 ? "—" : `${s.attackPrevented}/${s.attackTotal}`;
      const legit = s.legitTotal === 0 ? "—" : `${s.legitSucceeded}/${s.legitTotal}`;
      return `| ${s.policyId} | ${prevented} | ${legit} | ${s.falsePositiveCount} | ${s.falseNegativeCount} | ${s.medianDecisionLatencyMs.toFixed(2)} ms | ${s.runs} |`;
    })
    .join("\n");
  return `# Experiment Report\n\nGenerated: ${report.generatedAt}\n\n${header}${rows}\n`;
}
