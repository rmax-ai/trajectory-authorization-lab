import "server-only";

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  AgentEventSchema,
  ExecutionGraphSchema,
  findRepoRoot,
  type AgentEvent,
  type ExecutionGraph,
  type TaskContract,
} from "@tacl/core";
import { POLICY_ORDER } from "@tacl/authorization";
import { SCENARIOS, type Scenario } from "@tacl/scenarios";
import { z } from "zod";

const RunMetricsSchema = z.object({
  runId: z.string(), scenarioId: z.string(), variant: z.enum(["legitimate", "adversarial"]), policyId: z.string(),
  attackAllowed: z.boolean().nullable(), taskSucceeded: z.boolean().nullable(),
  decisionLatencyMs: z.array(z.number()), totalLatencyMs: z.number(), evaluationCount: z.number(), eventCount: z.number(),
  graphNodeCount: z.number(), graphEdgeCount: z.number(), policyStateSize: z.number(),
  falsePositive: z.boolean().nullable().optional(), falseNegative: z.boolean().nullable().optional(),
});
export type RunMetrics = z.infer<typeof RunMetricsSchema>;

const ReportSchema = z.object({
  generatedAt: z.string(), policyOrder: z.array(z.string()),
  summaries: z.array(z.object({
    policyId: z.string(), attackPrevented: z.number(), attackTotal: z.number(), legitSucceeded: z.number(), legitTotal: z.number(),
    falsePositiveCount: z.number(), falseNegativeCount: z.number(), medianDecisionLatencyMs: z.number(), runs: z.number(),
  })),
  runs: z.array(RunMetricsSchema),
});
export type Report = z.infer<typeof ReportSchema>;

const RunMetadataSchema = z.object({
  id: z.string(), scenarioId: z.string(), policyId: z.string(), seed: z.number(), startedAt: z.string(), completedAt: z.string().optional(),
  outcome: z.string().optional(), eventCount: z.number().optional(), decisionCount: z.number().optional(), totalLatencyMs: z.number().optional(),
});
export type RunMetadata = z.infer<typeof RunMetadataSchema>;

export type RunSummary = Pick<RunMetrics, "runId" | "scenarioId" | "variant" | "policyId" | "attackAllowed" | "taskSucceeded" | "eventCount" | "totalLatencyMs"> & { decisionLatencyMs: number };
export type RunDetail = { run: RunMetadata; events: AgentEvent[]; metrics: RunMetrics | null; graph: ExecutionGraph | null; task: TaskContract | null; parseErrors: number };

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1]! + sorted[middle]!) / 2 : sorted[middle]!;
}

function readJson(path: string): unknown | null {
  if (!existsSync(path)) return null;
  try { return JSON.parse(readFileSync(path, "utf8")) as unknown; } catch { return null; }
}

export function getRepoRoot(): string { return join(findRepoRoot(process.cwd()), "artifacts"); }

export function listRuns(): RunSummary[] {
  const runsDir = join(getRepoRoot(), "runs");
  if (!existsSync(runsDir)) return [];
  const summaries: RunSummary[] = [];
  for (const entry of readdirSync(runsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const parsed = RunMetricsSchema.safeParse(readJson(join(runsDir, entry.name, "metrics.json")));
    if (!parsed.success) continue;
    const metrics = parsed.data;
    summaries.push({ ...metrics, decisionLatencyMs: median(metrics.decisionLatencyMs) });
  }
  return summaries.sort((left, right) => left.scenarioId.localeCompare(right.scenarioId) || left.variant.localeCompare(right.variant) || left.policyId.localeCompare(right.policyId));
}

export function getRun(runId: string): RunDetail | null {
  if (!/^[A-Za-z0-9._-]+$/.test(runId)) return null;
  const runDir = join(getRepoRoot(), "runs", runId);
  const runResult = RunMetadataSchema.safeParse(readJson(join(runDir, "run.json")));
  if (!runResult.success) return null;
  let parseErrors = 0;
  const events: AgentEvent[] = [];
  const eventPath = join(runDir, "events.jsonl");
  if (existsSync(eventPath)) {
    for (const line of readFileSync(eventPath, "utf8").split("\n")) {
      if (line.trim() === "") continue;
      try {
        const event = AgentEventSchema.safeParse(JSON.parse(line) as unknown);
        if (event.success) events.push(event.data); else parseErrors += 1;
      } catch { parseErrors += 1; }
    }
  }
  const metricsResult = RunMetricsSchema.safeParse(readJson(join(runDir, "metrics.json")));
  const graphResult = ExecutionGraphSchema.safeParse(readJson(join(runDir, "graph.json")));
  const taskEvent = events.find((event) => event.type === "TaskCreatedEvent");
  return { run: runResult.data, events, metrics: metricsResult.success ? metricsResult.data : null, graph: graphResult.success ? graphResult.data : null, task: taskEvent?.type === "TaskCreatedEvent" ? taskEvent.data.task : null, parseErrors };
}

export function getReport(): Report | null {
  const result = ReportSchema.safeParse(readJson(join(getRepoRoot(), "reports", "latest.json")));
  return result.success ? result.data : null;
}

export function getScenarios(): readonly Scenario[] { return SCENARIOS; }
export function getPolicies(): readonly string[] { return POLICY_ORDER; }
