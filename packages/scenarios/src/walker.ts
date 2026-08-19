/**
 * Scenario walker (SPEC §10: "avoid embedding scenario logic directly into
 * the runner"). The walker is the ONLY logic between scenario data and the
 * runtime: it resolves step references (derive sources, textFrom), feeds
 * proposals through the reference monitor, and records per-step outcomes.
 */
import { Runtime } from "@tacl/core";
import type { Scenario, StepResult, WalkResult } from "./dsl";

export async function walkScenario(rt: Runtime, scenario: Scenario): Promise<WalkResult> {
  /** step id → ToolResultEvent id (tool steps) or derived value id (derive steps). */
  const stepIds = new Map<string, string>();
  const results: StepResult[] = [];

  for (const step of scenario.steps) {
    if (step.type === "tool") {
      const args = { ...step.arguments };
      const uses: string[] = [];
      if (step.textFrom !== undefined) {
        const derivedId = stepIds.get(step.textFrom);
        if (derivedId === undefined) {
          throw new Error(`step ${step.id}: textFrom references unknown step ${step.textFrom}`);
        }
        uses.push(derivedId);
        args.text = derivedId;
      }
      const out = await rt.propose({ tool: step.tool, arguments: args }, [], uses);
      if (out.resultEventId !== undefined) stepIds.set(step.id, out.resultEventId);
      results.push({
        step,
        decision: out.decision,
        resultEventId: out.resultEventId ?? undefined,
        executed: out.decision.outcome === "ALLOW" && out.resultEventId !== undefined,
      });
    } else if (step.type === "derive") {
      const sources = step.sources.map((s) => {
        const id = stepIds.get(s);
        if (id === undefined) throw new Error(`derive ${step.id}: unknown source ${s}`);
        return id;
      });
      rt.derive(step.id, sources);
      stepIds.set(step.id, step.id); // derived value id IS the step id
      results.push({ step, executed: true });
    } else {
      // attenuate
      try {
        rt.attenuateCapabilities(step.capabilities);
        results.push({ step, executed: true });
      } catch (error) {
        results.push({
          step,
          executed: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  const lastTool = [...results].reverse().find((r) => r.decision !== undefined);
  return {
    results,
    lastToolDecision: lastTool?.decision,
    lastToolExecuted: lastTool?.executed ?? false,
  };
}

export type { Scenario, ScenarioStep, ExpectedOutcome, StepResult, WalkResult } from "./dsl";
