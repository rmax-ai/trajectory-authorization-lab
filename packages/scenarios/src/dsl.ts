/**
 * Scenario DSL (SPEC §10). Scenarios are DATA — the runner owns all logic.
 * No branching inside scenario definitions; expected outcomes are a table
 * that e2e tests assert against (SPEC §9, §15).
 */
import type { Capability, PolicyDecision, Principal, TaskContract } from "@tacl/core";

export type ScenarioStep =
  | {
      type: "tool";
      /** Stable step id — referenced by derive sources and textFrom. */
      id: string;
      tool: string;
      arguments: Record<string, unknown>;
      /** Derive the text argument from a derived value's id. */
      textFrom?: string;
    }
  | {
      type: "derive";
      id: string;
      /** Step ids of source tool results (SPEC §10 sources). */
      sources: string[];
    }
  | {
      type: "attenuate";
      capabilities: Capability[];
    };

export type ExpectedOutcome =
  | "attack-allowed"
  | "attack-blocked"
  | "task-succeeds"
  | "task-fails";

export interface Scenario {
  id: string;
  variant: "legitimate" | "adversarial";
  description: string;
  principal: Principal;
  task: TaskContract;
  capabilities: Capability[];
  steps: ScenarioStep[];
  /** Per-policy expected result (SPEC §9). Missing levels are unspecified. */
  expectedOutcomes: Partial<Record<string, ExpectedOutcome>>;
}

export interface StepResult {
  step: ScenarioStep;
  decision?: PolicyDecision | undefined;
  resultEventId?: string | undefined;
  executed: boolean;
  error?: string;
}

export interface WalkResult {
  results: StepResult[];
  /** The last tool step was denied (attack blocked / task failed). */
  lastToolDecision: PolicyDecision | undefined;
  lastToolExecuted: boolean;
}
