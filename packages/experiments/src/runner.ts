/**
 * Experiment runner — executes one scenario under one policy, measures
 * everything (SPEC §11–§12), and persists the standard artifact layout.
 *
 * Determinism: same scenario + policy + seed → same run id → same artifact
 * path (replay overwrites). Event content is deterministic; measured
 * latencies are observations, not part of the deterministic contract (D7).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  realClock,
  Runtime,
  findRepoRoot,
  type AuthorizationContext,
  type AuthorizationPolicy,
  type RunConfig,
} from "@tacl/core";
import { createPolicy, POLICY_ORDER, type PolicyId } from "@tacl/authorization";
import { getScenario, walkScenario, type Scenario } from "@tacl/scenarios";
import { buildGraph, projectState } from "@tacl/core";
import type { RunMetrics } from "./metrics";

export interface RunOptions {
  variant: "legitimate" | "adversarial";
  seed: number;
  artifactsRoot?: string | undefined;
}

export interface RunResult {
  metrics: RunMetrics;
  artifactDir: string;
}

/** Timing wrapper: measures authorize() latency per evaluation. */
function timedPolicy(inner: AuthorizationPolicy, latencies: number[]): AuthorizationPolicy {
  return {
    id: inner.id,
    async authorize(ctx: AuthorizationContext) {
      const start = performance.now();
      const decision = await inner.authorize(ctx);
      latencies.push(performance.now() - start);
      return decision;
    },
  };
}

export async function runScenario(
  scenarioId: string,
  policyId: PolicyId,
  opts: RunOptions,
): Promise<RunResult> {
  const scenario = getScenario(scenarioId, opts.variant);
  const repoRoot = findRepoRoot(process.cwd());
  const artifactsRoot = opts.artifactsRoot ?? join(repoRoot, "artifacts", "runs");
  const runId = `${scenario.id}-${scenario.variant}-${policyId}-seed${opts.seed}`;
  const artifactDir = join(artifactsRoot, runId);

  const started = performance.now();
  const latencies: number[] = [];
  const policy = timedPolicy(createPolicy(policyId), latencies);

  const cfg: RunConfig = {
    id: runId,
    scenarioId: scenario.id,
    policyId,
    principal: scenario.principal,
    task: scenario.task,
    capabilities: scenario.capabilities,
    seed: opts.seed,
    artifactsDir: artifactDir,
    fixturesDir: join(repoRoot, "fixtures"),
    requireApproval: "record-and-continue",
  };

  const rt = new Runtime(cfg, policy, realClock);
  const walk = await walkScenario(rt, scenario);
  const taskSucceeded = walk.lastToolExecuted;
  rt.complete(
    taskSucceeded ? "completed" : "denied",
    `${scenario.id}/${scenario.variant} under ${policyId}`,
  );

  const trajectory = rt.trajectory;
  const graph = buildGraph(trajectory);
  const state = projectState(trajectory);
  const stateSize = JSON.stringify(state).length;

  const metrics: RunMetrics = {
    runId,
    scenarioId: scenario.id,
    variant: scenario.variant,
    policyId,
    attackAllowed: scenario.variant === "adversarial" ? taskSucceeded : null,
    taskSucceeded: scenario.variant === "legitimate" ? taskSucceeded : null,
    falsePositive: scenario.variant === "legitimate" ? !taskSucceeded : null,
    falseNegative: scenario.variant === "adversarial" ? taskSucceeded : null,
    decisionLatencyMs: latencies,
    totalLatencyMs: performance.now() - started,
    evaluationCount: trajectory.filter((e) => e.type === "PolicyEvaluatedEvent").length,
    eventCount: trajectory.length,
    graphNodeCount: graph.nodes.length,
    graphEdgeCount: graph.edges.length,
    policyStateSize: stateSize,
  };

  // Persist the full metrics beside the runtime's own artifacts.
  writeFileSync(join(artifactDir, "metrics.json"), JSON.stringify(metrics, null, 2) + "\n");

  // run.json gets the measured totals for the report index.
  const runJson = JSON.parse(readFileSync(join(artifactDir, "run.json"), "utf8"));
  runJson.totalLatencyMs = metrics.totalLatencyMs;
  writeFileSync(join(artifactDir, "run.json"), JSON.stringify(runJson, null, 2) + "\n");

  return { metrics, artifactDir };
}

export async function runAll(options: {
  variants?: Array<"legitimate" | "adversarial">;
  seed?: number;
  artifactsRoot?: string;
}): Promise<RunResult[]> {
  const { getScenario, scenarioIds } = await import("@tacl/scenarios");
  const variants = options.variants ?? ["legitimate", "adversarial"];
  const seed = options.seed ?? 42;
  const results: RunResult[] = [];
  for (const id of scenarioIds()) {
    for (const variant of variants) {
      for (const policyId of POLICY_ORDER) {
        // Skip expectedOutcome-less combos gracefully? No — run everything:
        // measured reality wins over the table (docs/research-questions.md).
        void getScenario;
        results.push(
          await runScenario(id, policyId, { variant, seed, artifactsRoot: options.artifactsRoot }),
        );
      }
    }
  }
  return results;
}

export { POLICY_ORDER };
export type { Scenario };
