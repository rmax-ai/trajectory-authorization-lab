/**
 * E2E matrix — every scenario × variant × all six policies against the
 * expected-outcome tables (SPEC §9, §15). These tests ARE the experiment's
 * acceptance criteria: if one fails, the ladder no longer demonstrates the
 * claim the project exists to demonstrate.
 */
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { realClock, resolveFixturesDir, Runtime, type RunConfig } from "@tacl/core";
import { createPolicy, POLICY_ORDER, type PolicyId } from "@tacl/authorization";
import { SCENARIOS } from "./scenarios";
import { walkScenario } from "./walker";
import type { ExpectedOutcome, Scenario } from "./dsl";

const FIXTURES_DIR = resolveFixturesDir(dirname(fileURLToPath(import.meta.url)));
const tmpDirs: string[] = [];
afterEach(() => {
  for (const d of tmpDirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

async function runScenario(scenario: Scenario, policyId: PolicyId) {
  const dir = mkdtempSync(join(tmpdir(), "tacl-e2e-"));
  tmpDirs.push(dir);
  const cfg: RunConfig = {
    id: `${scenario.id}-${scenario.variant}-${policyId}`,
    scenarioId: scenario.id,
    policyId,
    principal: scenario.principal,
    task: scenario.task,
    capabilities: scenario.capabilities,
    seed: 42,
    artifactsDir: join(dir, "run"),
    fixturesDir: FIXTURES_DIR,
    requireApproval: "record-and-continue",
  };
  const rt = new Runtime(cfg, createPolicy(policyId), realClock);
  const walk = await walkScenario(rt, scenario);
  const outcome: ExpectedOutcome =
    walk.lastToolExecuted ? (scenario.variant === "adversarial" ? "attack-allowed" : "task-succeeds")
      : (scenario.variant === "adversarial" ? "attack-blocked" : "task-fails");
  rt.complete(walk.lastToolExecuted ? "completed" : "denied", `scenario ${scenario.id}/${scenario.variant} under ${policyId}`);
  return { walk, outcome, artifactsDir: cfg.artifactsDir };
}

for (const scenario of SCENARIOS) {
  for (const policyId of POLICY_ORDER) {
    const expected = scenario.expectedOutcomes[policyId];
    if (expected === undefined) continue;
    it(`${scenario.id}/${scenario.variant} under ${policyId} → ${expected}`, async () => {
      const { walk, outcome, artifactsDir } = await runScenario(scenario, policyId);
      expect(outcome, JSON.stringify(walk.lastToolDecision, null, 2)).toBe(expected);
      // Every e2e run must produce the full artifact set (SPEC §21).
      for (const f of ["run.json", "events.jsonl", "graph.json", "decisions.jsonl", "metrics.json"]) {
        expect(existsSync(join(artifactsDir, f)), f).toBe(true);
      }
    });
  }
}

describe("deterministic replay (SPEC §21)", () => {
  it("two runs of the same scenario+policy produce identical event structures", async () => {
    const scenario = SCENARIOS.find((s) => s.id === "read-read-exfiltration" && s.variant === "adversarial")!;
    const strip = (rt: Runtime) =>
      rt.trajectory.map(({ timestamp: _t, runId: _r, ...rest }) => rest);
    const a = new Runtime(
      {
        id: "run-a",
        scenarioId: scenario.id,
        policyId: "a3",
        principal: scenario.principal,
        task: scenario.task,
        capabilities: scenario.capabilities,
        seed: 42,
        artifactsDir: join(mkdtempSync(join(tmpdir(), "tacl-replay-a-")), "run"),
        fixturesDir: FIXTURES_DIR,
        requireApproval: "record-and-continue",
      },
      createPolicy("a3"),
      realClock,
    );
    const b = new Runtime(
      {
        id: "run-b",
        scenarioId: scenario.id,
        policyId: "a3",
        principal: scenario.principal,
        task: scenario.task,
        capabilities: scenario.capabilities,
        seed: 42,
        artifactsDir: join(mkdtempSync(join(tmpdir(), "tacl-replay-b-")), "run"),
        fixturesDir: FIXTURES_DIR,
        requireApproval: "record-and-continue",
      },
      createPolicy("a3"),
      realClock,
    );
    await walkScenario(a, scenario);
    await walkScenario(b, scenario);
    expect(strip(a)).toEqual(strip(b));
  });
});
