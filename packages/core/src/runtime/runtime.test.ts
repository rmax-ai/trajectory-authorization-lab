import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  type AgentEvent,
  type AuthorizationContext,
  type AuthorizationPolicy,
  type PolicyDecision,
  type Principal,
  type TaskContract,
  type ToolCall,
} from "../schemas";
import { readEventLog, type Clock } from "../events/event-log";
import { Runtime, type RunConfig } from "./runtime";
import { buildGraph } from "./graph";

const FIXTURES_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../../../fixtures");
const fixedClock: Clock = { now: () => "2026-08-19T22:00:00.000Z" };

const principal: Principal = { id: "agent-1", roles: ["support-agent"] };
const task: TaskContract = {
  id: "task-1",
  principalId: "agent-1",
  purpose: "CUSTOMER_ANALYSIS",
  allowedCapabilityClasses: ["crm.read", "billing.read", "billing.refund", "slack.internal_post", "slack.external_post", "python.exec"],
  prohibitedSinks: [],
  constraints: { refundBudget: 500 },
};

const tmpDirs: string[] = [];
function makeCfg(id = "run-1", overrides: Partial<RunConfig> = {}): RunConfig {
  const dir = mkdtempSync(join(tmpdir(), "tacl-runtime-"));
  tmpDirs.push(dir);
  return {
    id,
    scenarioId: "test",
    policyId: "test-policy",
    principal,
    task,
    seed: 42,
    artifactsDir: join(dir, id),
    fixturesDir: FIXTURES_DIR,
    requireApproval: "record-and-continue",
    ...overrides,
  };
}
afterEach(() => {
  for (const d of tmpDirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function allowPolicy(): AuthorizationPolicy {
  return { id: "allow-all", authorize: () => ({ outcome: "ALLOW", reasons: ["TEST-ALLOW"] }) };
}
function denyPolicy(reason = "TEST-DENY"): AuthorizationPolicy {
  return { id: "deny-all", authorize: () => ({ outcome: "DENY", reasons: [reason] }) };
}
function inspectingPolicy(onAuthorize: (ctx: AuthorizationContext) => PolicyDecision): AuthorizationPolicy {
  return { id: "inspecting", authorize: onAuthorize };
}

const readCall: ToolCall = { tool: "crm.read", arguments: { customerId: "customer-123" } };

describe("reference monitor (SPEC §18)", () => {
  it("executes tools ONLY after ALLOW — full event chain per proposal", async () => {
    const cfg = makeCfg();
    const rt = new Runtime(cfg, allowPolicy(), fixedClock);
    const out = await rt.propose(readCall);
    expect(out.decision.outcome).toBe("ALLOW");
    const types = out.events.map((e) => e.type);
    expect(types).toEqual([
      "ToolProposedEvent",
      "PolicyEvaluatedEvent",
      "ToolExecutedEvent",
      "ToolResultEvent",
      "LabelUpdatedEvent",
    ]);
    // Result carries the fixture record
    const resultEvent = out.events.find((e) => e.type === "ToolResultEvent")!;
    expect((resultEvent.data.result as { id: string }).id).toBe("customer-123");
    expect(out.resultEventId).toBe(resultEvent.id);
  });

  it("DENY blocks execution — no ToolExecutedEvent is emitted", async () => {
    const cfg = makeCfg();
    const rt = new Runtime(cfg, denyPolicy(), fixedClock);
    const out = await rt.propose(readCall);
    expect(out.decision.outcome).toBe("DENY");
    expect(out.events.some((e) => e.type === "ToolExecutedEvent")).toBe(false);
    expect(out.events.map((e) => e.type)).toEqual(["ToolProposedEvent", "PolicyEvaluatedEvent"]);
    // Decisions are persisted
    const decisions = readFileSync(join(cfg.artifactsDir, "decisions.jsonl"), "utf8").trim().split("\n");
    expect(decisions).toHaveLength(1);
    expect(JSON.parse(decisions[0]!).decision.outcome).toBe("DENY");
  });

  it("REQUIRE_APPROVAL records an approval event and does not execute", async () => {
    const cfg = makeCfg();
    const rt = new Runtime(cfg, inspectingPolicy(() => ({ outcome: "REQUIRE_APPROVAL", reasons: ["needs human"] })), fixedClock);
    const out = await rt.propose(readCall);
    expect(out.events.map((e) => e.type)).toContain("ApprovalRequestedEvent");
    expect(out.events.some((e) => e.type === "ToolExecutedEvent")).toBe(false);
  });

  it("runtime faults become error events, never crashes — run always persists", async () => {
    const cfg = makeCfg();
    const rt = new Runtime(cfg, allowPolicy(), fixedClock);
    const out = await rt.propose({ tool: "crm.read", arguments: { customerId: "customer-999" } });
    const exec = out.events.find((e) => e.type === "ToolExecutedEvent")!;
    expect(exec.data.outcome).toBe("error");
    const result = out.events.find((e) => e.type === "ToolResultEvent")!;
    expect((result.data.result as { error: string }).error).toContain("not found");
    // Run can still complete and persist
    rt.complete("error", "test");
    expect(existsSync(join(cfg.artifactsDir, "run.json"))).toBe(true);
  });

  it("unknown tool is a recorded configuration error, not a crash", async () => {
    const cfg = makeCfg();
    const rt = new Runtime(cfg, allowPolicy(), fixedClock);
    const out = await rt.propose({ tool: "rm.rf", arguments: {} });
    const result = out.events.find((e) => e.type === "ToolResultEvent")!;
    expect((result.data.result as { error: string }).error).toContain("unknown tool");
  });

  it("policy receives full state: trajectory grows across proposals", async () => {
    const cfg = makeCfg();
    const seenLengths: number[] = [];
    const rt = new Runtime(cfg, inspectingPolicy((ctx) => {
      seenLengths.push(ctx.trajectory.length);
      return { outcome: "ALLOW", reasons: ["ok"] };
    }), fixedClock);
    await rt.propose(readCall);
    await rt.propose({ tool: "billing.read", arguments: { customerId: "customer-123" } });
    expect(seenLengths[0]!).toBeGreaterThanOrEqual(1);
    expect(seenLengths[1]!).toBeGreaterThan(seenLengths[0]!);
  });
});

describe("budgets (SPEC §8 A3 groundwork)", () => {
  it("refund execution updates the cumulative refund budget", async () => {
    const cfg = makeCfg();
    const rt = new Runtime(cfg, allowPolicy(), fixedClock);
    await rt.propose({ tool: "billing.refund", arguments: { customerId: "customer-123", amount: 6 } });
    const budgetEvents = rt.trajectory.filter((e) => e.type === "BudgetUpdatedEvent");
    expect(budgetEvents).toHaveLength(1);
    expect((budgetEvents[0]!.data as { spent: number; limit: number }).spent).toBe(6);
    await rt.propose({ tool: "billing.refund", arguments: { customerId: "customer-123", amount: 6 } });
    const last = rt.trajectory.filter((e) => e.type === "BudgetUpdatedEvent").at(-1)!;
    expect((last.data as { spent: number }).spent).toBe(12);
  });

  it("policy can read the budget from context mid-run", async () => {
    const cfg = makeCfg();
    const observed: number[] = [];
    const rt = new Runtime(cfg, inspectingPolicy((ctx) => {
      observed.push(ctx.budgets.budgets["refunds"]?.spent ?? 0);
      return { outcome: "ALLOW", reasons: ["ok"] };
    }), fixedClock);
    await rt.propose({ tool: "billing.refund", arguments: { customerId: "customer-123", amount: 6 } });
    await rt.propose({ tool: "billing.refund", arguments: { customerId: "customer-123", amount: 6 } });
    expect(observed).toEqual([0, 6]);
  });
});

describe("derivation and labels (SPEC §10, §8 A4)", () => {
  it("derived values inherit the join of source labels; provenance is recorded", async () => {
    const cfg = makeCfg();
    const rt = new Runtime(cfg, allowPolicy(), fixedClock);
    const a = await rt.propose(readCall); // CONFIDENTIAL
    const b = await rt.propose({ tool: "billing.read", arguments: { customerId: "customer-123" } }); // CONFIDENTIAL
    const d = rt.derive("summary", [a.resultEventId!, b.resultEventId!]);
    expect(d.label).toEqual({ confidentiality: "CONFIDENTIAL", integrity: "TRUSTED" });
    // Provenance: derived value → source event ids
    const labelEvent = rt.trajectory.find((e) => e.id === d.eventId)!;
    expect(labelEvent.causalParents).toEqual([a.resultEventId, b.resultEventId]);
  });
});

describe("task contract immutability (SPEC §8 A2)", () => {
  it("runtime deep-freezes the task — mutation throws structurally", async () => {
    const cfg = makeCfg();
    const rt = new Runtime(cfg, allowPolicy(), fixedClock);
    expect(Object.isFrozen(rt.cfg.task)).toBe(true);
    expect(() => {
      (rt.cfg.task as { purpose: string }).purpose = "MALICIOUS_PIVOT";
    }).toThrow();
    // And the agent cannot reach a mutable copy through the context either:
    await rt.propose(readCall);
    const ctxSeen = rt.trajectory[0]!.data;
    // (TaskCreatedEvent carried the frozen task)
    expect(Object.isFrozen((rt.trajectory[0]!.data as { task: object }).task)).toBe(true);
    void ctxSeen;
  });
});

describe("persistence and determinism (SPEC §6, §19)", () => {
  it("writes the full artifact layout; graph reconstructs from events.jsonl", async () => {
    const cfg = makeCfg();
    const rt = new Runtime(cfg, allowPolicy(), fixedClock);
    await rt.propose(readCall);
    rt.complete("completed", "done");
    for (const f of ["run.json", "events.jsonl", "graph.json", "decisions.jsonl", "metrics.json"]) {
      expect(existsSync(join(cfg.artifactsDir, f))).toBe(true);
    }
    // Graph is a projection: reconstruct from the persisted log and compare
    const replayed = readEventLog(join(cfg.artifactsDir, "events.jsonl"));
    const rebuilt = buildGraph(replayed);
    const stored = JSON.parse(readFileSync(join(cfg.artifactsDir, "graph.json"), "utf8"));
    expect(rebuilt).toEqual(stored);
  });

  it("identical runs produce identical event structures (timestamps excepted)", async () => {
    const cfgA = makeCfg("run-1");
    const cfgB = makeCfg("run-2");
    const a = new Runtime(cfgA, allowPolicy(), fixedClock);
    const b = new Runtime(cfgB, allowPolicy(), fixedClock);
    await a.propose(readCall);
    await b.propose(readCall);
    a.complete("completed", "done");
    b.complete("completed", "done");
    const strip = (events: readonly AgentEvent[]) =>
      events.map(({ timestamp: _t, runId: _r, ...rest }) => rest);
    expect(strip(a.trajectory)).toEqual(strip(b.trajectory));
  });

  it("run.json records outcome and counts at completion", async () => {
    const cfg = makeCfg();
    const rt = new Runtime(cfg, allowPolicy(), fixedClock);
    await rt.propose(readCall);
    rt.complete("completed", "ok");
    const run = JSON.parse(readFileSync(join(cfg.artifactsDir, "run.json"), "utf8"));
    expect(run.outcome).toBe("completed");
    expect(run.eventCount).toBe(rt.trajectory.length);
  });
});
