import { describe, expect, it } from "vitest";
import {
  AgentEventSchema,
  buildAuthorizationContext,
  type AgentEvent,
  type AuthorizationContext,
  type AuthorizationPolicy,
  type PolicyDecision,
  type Principal,
  type TaskContract,
  type ToolCall,
} from "@tacl/core";
import { createA3Policy } from "./a3-trajectory";

function decide(policy: AuthorizationPolicy, ctx: AuthorizationContext): PolicyDecision {
  return policy.authorize(ctx) as PolicyDecision;
}

const principal: Principal = { id: "agent-1", roles: ["support-agent"] };
const task: TaskContract = {
  id: "task-1",
  principalId: "agent-1",
  purpose: "SUPPORT_OPS",
  allowedCapabilityClasses: ["crm.read", "billing.read", "billing.refund", "slack.external_post"],
  prohibitedSinks: [],
  constraints: {},
};

let seq = 0;
function evt(type: AgentEvent["type"], data: unknown, causalParents: string[] = []): AgentEvent {
  seq += 1;
  return AgentEventSchema.parse({
    id: `evt-${seq}`,
    runId: "run-1",
    sequence: seq,
    timestamp: "2026-08-19T22:00:00.000Z",
    causalParents,
    type,
    data,
  });
}

function executedRead(customerId: string, labels: AgentEvent["type"] extends never ? never : { confidentiality: string; integrity: string } | undefined = undefined) {
  return [
    evt("ToolExecutedEvent", { tool: { tool: "crm.read", arguments: { customerId } }, outcome: "success" }),
    evt("ToolResultEvent", { result: { customerId, tenant: customerId === "customer-123" ? "tenant-a" : "tenant-b" }, labels }),
  ];
}

function ctxFor(call: ToolCall, trajectory: AgentEvent[] = [], budgets: Record<string, { spent: number; limit: number }> = {}): AuthorizationContext {
  return {
    ...buildAuthorizationContext({ principal, task, proposedAction: call, trajectory }),
    budgets: { budgets },
  };
}

const refund = (amount: number, customerId = "customer-123"): ToolCall => ({
  tool: "billing.refund",
  arguments: { customerId, amount },
});

describe("A3 cumulative refund budget (SPEC §8, scenario 2)", () => {
  const a3 = createA3Policy();

  it("allows refunds while cumulative spend stays within limit", () => {
    const d = decide(a3, ctxFor(refund(99), [], { refunds: { spent: 396, limit: 500 } }));
    expect(d.outcome).toBe("ALLOW");
  });

  it("blocks the cumulative overflow: 99 x 6 with cap 500", () => {
    // After five $99 refunds, spent = 495. The sixth would breach 500.
    const d = decide(a3, ctxFor(refund(99), [], { refunds: { spent: 495, limit: 500 } }));
    expect(d.outcome).toBe("DENY");
    expect(d.reasons[0]).toContain("A3-BUDGET-CUMULATIVE-001");
  });

  it("per-call legal amount does not matter — only cumulative state (A1 would allow)", () => {
    // Each single call is $99 <= $100; A1 passes, A3 must not.
    const d = decide(a3, ctxFor(refund(99), [], { refunds: { spent: 450, limit: 500 } }));
    expect(d.outcome).toBe("DENY");
  });
});

describe("A3 tenant affinity (SPEC §8, scenario 3)", () => {
  const a3 = createA3Policy();

  it("allows a refund for a customer that was read this run", () => {
    const trajectory = executedRead("customer-123");
    expect(decide(a3, ctxFor(refund(6, "customer-123"), trajectory)).outcome).toBe("ALLOW");
  });

  it("denies cross-tenant writes: read A, refund B", () => {
    const trajectory = executedRead("customer-123");
    const d = decide(a3, ctxFor(refund(6, "customer-456"), trajectory));
    expect(d.outcome).toBe("DENY");
    expect(d.reasons[0]).toContain("A3-TENANT-AFFINITY-001");
  });

  it("does not restrict refunds when nothing was read (legitimate unassisted ops)", () => {
    expect(decide(a3, ctxFor(refund(6, "customer-456"))).outcome).toBe("ALLOW");
  });

  it("denied reads do not establish affinity (executed reads only)", () => {
    // A proposed-but-DENIED read must not count toward affinity.
    const trajectory = [
      evt("ToolProposedEvent", { tool: { tool: "crm.read", arguments: { customerId: "customer-123" } } }),
      evt("PolicyEvaluatedEvent", { policyId: "x", decision: { outcome: "DENY", reasons: ["nope"] } }),
    ];
    expect(decide(a3, ctxFor(refund(6, "customer-456"), trajectory)).outcome).toBe("ALLOW");
  });
});

describe("A3 confidential-observed (SPEC §8)", () => {
  const a3 = createA3Policy();

  const externalPost: ToolCall = {
    tool: "slack.external_post",
    arguments: { channel: "#external-partners", text: "summary" },
  };

  it("denies external write after confidential data was observed, with evidence", () => {
    const trajectory = executedRead("customer-123", { confidentiality: "CONFIDENTIAL", integrity: "TRUSTED" });
    const d = decide(a3, ctxFor(externalPost, trajectory));
    expect(d.outcome).toBe("DENY");
    expect(d.reasons[0]).toContain("A3-CONFIDENTIAL-EXTERNAL-001");
    // Evidence must point at the confidential ToolResultEvent of THIS trajectory.
    const confidentialResult = trajectory.find(
      (e) => e.type === "ToolResultEvent" && e.data.labels?.confidentiality === "CONFIDENTIAL",
    )!;
    expect(d.evidence).toContain(confidentialResult.id);
  });

  it("allows external write when only PUBLIC/INTERNAL data was observed", () => {
    const trajectory = executedRead("customer-123", { confidentiality: "INTERNAL", integrity: "TRUSTED" });
    expect(decide(a3, ctxFor(externalPost, trajectory)).outcome).toBe("ALLOW");
  });
});

describe("A3 event precedence (configurable)", () => {
  it("denies tool X after event type Y occurred earlier", () => {
    const a3 = createA3Policy({
      eventPrecedence: [{ tool: "billing.refund", ifEventTypes: ["ToolResultEvent"] }],
    });
    const trajectory = executedRead("customer-123");
    const d = decide(a3, ctxFor(refund(6, "customer-123"), trajectory));
    expect(d.outcome).toBe("DENY");
    expect(d.reasons[0]).toContain("A3-PRECEDENCE-001");
  });

  it("default config imposes no precedence rules", () => {
    const a3 = createA3Policy();
    const trajectory = executedRead("customer-123");
    expect(decide(a3, ctxFor(refund(6, "customer-123"), trajectory)).outcome).toBe("ALLOW");
  });
});

describe("A3 purity", () => {
  it("identical contexts give identical decisions", () => {
    const a3 = createA3Policy();
    const trajectory = executedRead("customer-123");
    const ctx = ctxFor(refund(99), trajectory, { refunds: { spent: 495, limit: 500 } });
    expect(decide(a3, ctx)).toEqual(decide(a3, ctx));
  });
});
