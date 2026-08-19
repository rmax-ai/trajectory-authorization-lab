/**
 * The Runtime — the reference monitor (SPEC §18, TS_SYSTEM_DESIGN_PATTERNS.md §1).
 *
 * STRUCTURAL INVARIANT: tools are resolved ONLY here, inside the package,
 * after the policy has rendered ALLOW. The tool registry is never exported
 * (packages/core/src/tools/registry.ts is not reachable from the package
 * index). An agent or scenario CANNOT invoke a tool directly — it can only
 * propose actions, and this class is the single execution path.
 *
 * Determinism (AGENTS.md #5): decisions never read wall time; Clock is
 * injected; event ids and sequences are monotonic per run; timestamps are
 * metadata only (DECISIONS.md D7).
 */
import { join } from "node:path";
import {
  type AgentEvent,
  type AuthorizationPolicy,
  type PolicyDecision,
  type Principal,
  type TaskContract,
  type ToolCall,
} from "../schemas";
import { createEventFactory, deepFreeze, type Clock, type EventFactory } from "../events/event-log";
import { getTool } from "../tools/registry";
import type { ToolEnv, ToolResult } from "../tools/types";
import { buildAuthorizationContext } from "./context";
import { joinLabels, PUBLIC_TRUSTED } from "./lattice";
import { projectState } from "./state-projection";
import { RunArtifacts } from "./artifacts";

export interface RunConfig {
  id: string;
  scenarioId: string;
  policyId: string;
  principal: Principal;
  task: TaskContract;
  seed: number;
  /** artifacts/runs/<run-id>/ */
  artifactsDir: string;
  fixturesDir: string;
  /** REQUIRE_APPROVAL handling (docs/roadmap.md out-of-scope note). */
  requireApproval: "record-and-continue" | "stop";
}

export interface ProposalOutcome {
  decision: PolicyDecision;
  /** Events emitted by this proposal (proposal → evaluation → execution/result). */
  events: AgentEvent[];
  /** The ToolResultEvent id when ALLOWed and executed; undefined otherwise. */
  resultEventId?: string;
}

export interface DeriveOutcome {
  /** The LabelUpdatedEvent id (the derived value's node). */
  eventId: string;
  label: ToolResult["labels"];
}

const REFUND_BUDGET_NAME = "refunds";
const DEFAULT_REFUND_BUDGET_LIMIT = 500;

export class Runtime {
  readonly cfg: RunConfig;
  private readonly policy: AuthorizationPolicy;
  private readonly factory: EventFactory;
  private readonly artifacts: RunArtifacts;
  private readonly events: AgentEvent[] = [];
  private seq = 0;
  private completed = false;
  private readonly startedAt: string;

  constructor(cfg: RunConfig, policy: AuthorizationPolicy, clock: Clock) {
    // SPEC §8 A2: task contracts are immutable during a run. Structural
    // enforcement: deep-freeze — mutation attempts throw in ESM strict mode.
    // The agent cannot modify its own task contract.
    this.cfg = {
      ...cfg,
      principal: deepFreeze(cfg.principal),
      task: deepFreeze(cfg.task),
    };
    this.policy = policy;
    this.startedAt = clock.now();
    this.factory = createEventFactory(cfg.id, clock);
    this.artifacts = new RunArtifacts(cfg.artifactsDir);
    this.artifacts.writeRunStart({
      id: cfg.id,
      scenarioId: cfg.scenarioId,
      policyId: cfg.policyId,
      seed: cfg.seed,
      startedAt: this.startedAt,
    });
    this.emit("TaskCreatedEvent", { task: cfg.task });
  }

  get trajectory(): readonly AgentEvent[] {
    return this.events;
  }

  /** The one and only execution path for a proposed tool call. */
  async propose(
    toolCall: ToolCall,
    causalParents: readonly string[] = [],
  ): Promise<ProposalOutcome> {
    this.assertActive();
    const startIndex = this.events.length;
    const outcome: ProposalOutcome = {
      decision: { outcome: "DENY", reasons: [] },
      events: [],
    };
    const proposal = this.emit("ToolProposedEvent", { tool: toolCall }, causalParents);

    const ctx = buildAuthorizationContext({
      principal: this.cfg.principal,
      task: this.cfg.task,
      proposedAction: toolCall,
      trajectory: this.events,
    });

    const decision = await this.policy.authorize(ctx);
    const evaluation = this.emit(
      "PolicyEvaluatedEvent",
      { policyId: this.policy.id, decision },
      [proposal.id],
    );
    outcome.decision = decision;
    this.artifacts.appendDecision(this.policy.id, evaluation.sequence, decision);

    if (decision.outcome === "REQUIRE_APPROVAL") {
      this.emit("ApprovalRequestedEvent", { reason: decision.reasons.join("; ") }, [evaluation.id]);
      outcome.events = this.events.slice(startIndex);
      if (this.cfg.requireApproval === "stop") this.complete("denied", "run stopped pending approval");
      return outcome;
    }
    if (decision.outcome !== "ALLOW") {
      outcome.events = this.events.slice(startIndex);
      return outcome;
    }

    const tool = getTool(toolCall.tool);
    if (!tool) {
      // Configuration error, not a policy decision — but the run must persist (AGENTS.md).
      const execEvent = this.emit("ToolExecutedEvent", { tool: toolCall, outcome: "error" }, [evaluation.id]);
      this.emit(
        "ToolResultEvent",
        { result: { error: `unknown tool: ${toolCall.tool}` } },
        [execEvent.id],
      );
      outcome.events = this.events.slice(startIndex);
      return outcome;
    }

    const env: ToolEnv = {
      runId: this.cfg.id,
      artifactDir: this.cfg.artifactsDir,
      fixturesDir: this.cfg.fixturesDir,
      nextSeq: () => ++this.seq,
    };

    let result: ToolResult;
    try {
      result = tool.run(env, toolCall.arguments);
    } catch (error) {
      // Runtime faults become error events — never crash the run (AGENTS.md).
      const execEvent = this.emit("ToolExecutedEvent", { tool: toolCall, outcome: "error" }, [evaluation.id]);
      this.emit(
        "ToolResultEvent",
        { result: { error: error instanceof Error ? error.message : String(error) } },
        [execEvent.id],
      );
      outcome.events = this.events.slice(startIndex);
      return outcome;
    }

    const execEvent = this.emit("ToolExecutedEvent", { tool: toolCall, outcome: "success" }, [evaluation.id]);
    const resultEvent = this.emit(
      "ToolResultEvent",
      { result: result.result, labels: result.labels, effects: result.effects },
      [execEvent.id],
    );
    outcome.resultEventId = resultEvent.id;

    if (result.labels) {
      this.emit("LabelUpdatedEvent", { labels: { [resultEvent.id]: result.labels } }, [resultEvent.id]);
    }
    if (toolCall.tool === "billing.refund") {
      this.emitBudgetUpdate(toolCall, resultEvent.id);
    }

    outcome.events = this.events.slice(startIndex);
    return outcome;
  }

  /**
   * Derivation step (SPEC §10 `derive`): the derived value inherits the JOIN
   * of its source labels; provenance records sources (SPEC §8 A4).
   */
  derive(id: string, sourceEventIds: readonly string[]): DeriveOutcome {
    this.assertActive();
    const state = projectState(this.events);
    const sourceLabels = sourceEventIds.map(
      (sid) => state.labels.labels[sid] ?? PUBLIC_TRUSTED,
    );
    const label = joinLabels(...sourceLabels);
    const event = this.emit(
      "LabelUpdatedEvent",
      { labels: { [id]: label } },
      sourceEventIds,
    );
    return { eventId: event.id, label };
  }

  /** Close the run: final event + artifact projections. */
  complete(
    outcome: "completed" | "denied" | "error",
    summary: string,
  ): AgentEvent {
    if (this.completed) throw new Error("run already completed");
    this.completed = true;
    const finalEvent = this.emit("RunCompletedEvent", { outcome, summary });
    this.artifacts.writeRunComplete({
      id: this.cfg.id,
      scenarioId: this.cfg.scenarioId,
      policyId: this.cfg.policyId,
      seed: this.cfg.seed,
      startedAt: this.startedAt,
      completedAt: finalEvent.timestamp,
      outcome,
      eventCount: this.events.length,
      decisionCount: this.events.filter((e) => e.type === "PolicyEvaluatedEvent").length,
    });
    this.artifacts.writeGraphAndMetrics(this.events);
    return finalEvent;
  }

  private emitBudgetUpdate(toolCall: ToolCall, resultEventId: string): void {
    const state = projectState(this.events);
    const current = state.budgets.budgets[REFUND_BUDGET_NAME];
    const limit =
      typeof this.cfg.task.constraints["refundBudget"] === "number"
        ? (this.cfg.task.constraints["refundBudget"] as number)
        : DEFAULT_REFUND_BUDGET_LIMIT;
    const amount = typeof toolCall.arguments["amount"] === "number" ? toolCall.arguments["amount"] : 0;
    const spent = (current?.spent ?? 0) + amount;
    this.emit("BudgetUpdatedEvent", { budget: REFUND_BUDGET_NAME, spent, limit }, [resultEventId]);
  }

  private emit(
    type: AgentEvent["type"],
    data: unknown,
    causalParents: readonly string[] = [],
  ): AgentEvent {
    const event = this.factory.next(type, data, causalParents);
    this.events.push(event);
    this.artifacts.events.append(event);
    return event;
  }

  private assertActive(): void {
    if (this.completed) throw new Error("run already completed");
  }
}

export { buildAuthorizationContext } from "./context";
export { buildGraph } from "./graph";
export { projectState } from "./state-projection";
export { confLte, joinConf, joinIntegrity, joinLabels, PUBLIC_TRUSTED } from "./lattice";
export type { ProjectedState } from "./state-projection";
