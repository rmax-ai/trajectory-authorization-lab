import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { aggregate, median, renderMarkdown, type RunMetrics } from "./metrics";
import { writeReport } from "./report";
import { runScenario } from "./runner";

const tmpDirs: string[] = [];
afterEach(() => {
  for (const d of tmpDirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe("median", () => {
  it("returns middle value for odd counts, mean for even", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });

  it("returns 0 for empty input", () => {
    expect(median([])).toBe(0);
  });
});

function metrics(policyId: string, variant: "legitimate" | "adversarial", allowed: boolean): RunMetrics {
  return {
    runId: `${variant}-${policyId}`,
    scenarioId: "s",
    variant,
    policyId,
    attackAllowed: variant === "adversarial" ? allowed : null,
    taskSucceeded: variant === "legitimate" ? allowed : null,
    falsePositive: variant === "legitimate" ? !allowed : null,
    falseNegative: variant === "adversarial" ? allowed : null,
    decisionLatencyMs: [1, 2, 3],
    totalLatencyMs: 10,
    evaluationCount: 2,
    eventCount: 12,
    graphNodeCount: 10,
    graphEdgeCount: 9,
    policyStateSize: 100,
  };
}

describe("aggregate + markdown (SPEC §12)", () => {
  it("computes attack prevented and legitimate success per policy", () => {
    const rows = [
      metrics("a0", "adversarial", true),
      metrics("a0", "adversarial", true),
      metrics("a0", "legitimate", true),
      metrics("a3", "adversarial", false),
      metrics("a3", "legitimate", true),
    ];
    const report = aggregate(rows, ["a0", "a3"]);
    expect(report.summaries).toHaveLength(2);
    const a0 = report.summaries[0]!;
    expect(a0.attackPrevented).toBe(0);
    expect(a0.attackTotal).toBe(2);
    expect(a0.legitSucceeded).toBe(1);
    expect(a0.falseNegativeCount).toBe(2);
    const a3 = report.summaries[1]!;
    expect(a3.attackPrevented).toBe(1);
    expect(a3.falseNegativeCount).toBe(0);
  });

  it("renders the SPEC §12 table", () => {
    const report = aggregate([metrics("a3", "adversarial", false), metrics("a3", "legitimate", true)], ["a3"]);
    const md = renderMarkdown(report);
    expect(md).toContain("| a3 | 1/1 | 1/1 |");
    expect(md).toContain("2.00 ms");
  });

  it("reports empty states explicitly", () => {
    const report = aggregate([], []);
    expect(report.summaries).toEqual([]);
    expect(report.runs).toEqual([]);
    expect(renderMarkdown(report)).toContain("# Experiment Report");
  });
});

describe("runner + report round-trip", () => {
  it("runs a scenario, persists artifacts, and the report reads them back", async () => {
    const dir = mkdtempSync(join(tmpdir(), "tacl-exp-"));
    tmpDirs.push(dir);
    const runsDir = join(dir, "runs");
    const reportsDir = join(dir, "reports");
    const { metrics: m1 } = await runScenario("refund-drain", "a3", {
      variant: "adversarial",
      seed: 42,
      artifactsRoot: runsDir,
    });
    const { metrics: m2 } = await runScenario("refund-drain", "a3", {
      variant: "legitimate",
      seed: 42,
      artifactsRoot: runsDir,
    });
    // A3 blocks the drain, succeeds the legit refund.
    expect(m1.attackAllowed).toBe(false);
    expect(m2.taskSucceeded).toBe(true);
    expect(m1.evaluationCount).toBe(6);

    const report = writeReport(runsDir, reportsDir, ["a3"]);
    expect(report.runs).toHaveLength(2);
    const summary = report.summaries.find((s) => s.policyId === "a3")!;
    expect(summary.attackPrevented).toBe(1);
    expect(summary.legitSucceeded).toBe(1);
  });

  it("same config → same run id → replay overwrites deterministically", async () => {
    const dir = mkdtempSync(join(tmpdir(), "tacl-exp-"));
    tmpDirs.push(dir);
    const a = await runScenario("read-read-exfiltration", "a4", {
      variant: "adversarial",
      seed: 42,
      artifactsRoot: join(dir, "runs"),
    });
    const b = await runScenario("read-read-exfiltration", "a4", {
      variant: "adversarial",
      seed: 42,
      artifactsRoot: join(dir, "runs"),
    });
    expect(a.artifactDir).toBe(b.artifactDir);
    expect(a.metrics.eventCount).toBe(b.metrics.eventCount);
    expect(a.metrics.attackAllowed).toBe(false);
  });
});
