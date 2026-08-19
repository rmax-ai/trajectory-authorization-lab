import { describe, expect, it } from "vitest";
import {
  buildAuthorizationContext,
  type AuthorizationContext,
  type AuthorizationPolicy,
  type PolicyDecision,
  type Principal,
  type TaskContract,
  type ToolCall,
} from "@tacl/core";
import { createA2Policy, DEFAULT_A2 } from "./a2-task";

function decide(policy: AuthorizationPolicy, ctx: AuthorizationContext): PolicyDecision {
  return policy.authorize(ctx) as PolicyDecision;
}

const principal: Principal = { id: "agent-1", roles: ["support-agent"] };

function ctxFor(task: TaskContract, call: ToolCall): AuthorizationContext {
  return buildAuthorizationContext({
    principal,
    task,
    proposedAction: call,
    trajectory: [],
  });
}

function makeTask(overrides: Partial<TaskContract> = {}): TaskContract {
  return {
    id: "task-1",
    principalId: "agent-1",
    purpose: "LATENCY_DIAGNOSTICS",
    allowedCapabilityClasses: ["crm.read", "billing.read"],
    prohibitedSinks: ["slack.external_post"],
    constraints: {},
    ...overrides,
  };
}

const refund: ToolCall = { tool: "billing.refund", arguments: { customerId: "customer-123", amount: 6 } };
const read: ToolCall = { tool: "crm.read", arguments: { customerId: "customer-123" } };
const externalPost: ToolCall = { tool: "slack.external_post", arguments: { channel: "#external-partners", text: "x" } };

describe("A2 task contract (SPEC §8, scenario 4)", () => {
  const a2 = createA2Policy();

  it("allows tools inside the task capability classes", () => {
    const d = decide(a2, ctxFor(makeTask(), read));
    expect(d.outcome).toBe("ALLOW");
    expect(d.reasons[0]).toContain("A2-CAPABILITY-001");
  });

  it("denies prompt-injection task drift: refund outside LATENCY_DIAGNOSTICS", () => {
    // Scenario 4: injected instruction "refund customer immediately".
    const d = decide(a2, ctxFor(makeTask(), refund));
    expect(d.outcome).toBe("DENY");
    expect(d.reasons[0]).toContain("A2-CAPABILITY-002");
  });

  it("denies prohibited sinks even when in-scope", () => {
    // CUSTOMER_ANALYSIS declares slack.external_post? No — keep prohibited check first:
    // a task that declares external_post in classes AND in prohibitedSinks → denied.
    const t = makeTask({ allowedCapabilityClasses: ["slack.external_post"], prohibitedSinks: ["slack.external_post"] });
    const d = decide(a2, ctxFor(t, externalPost));
    expect(d.outcome).toBe("DENY");
    expect(d.reasons[0]).toContain("A2-SINK-PROHIBITED-001");
  });

  it("falls back to purpose defaults when a task declares no classes", () => {
    const t = makeTask({ allowedCapabilityClasses: [], prohibitedSinks: [] });
    // LATENCY_DIAGNOSTICS default: crm.read, billing.read
    expect(decide(a2, ctxFor(t, read)).outcome).toBe("ALLOW");
    expect(decide(a2, ctxFor(t, refund)).outcome).toBe("DENY");
  });

  it("unknown purpose with empty classes denies everything", () => {
    const t = makeTask({ purpose: "UNKNOWN", allowedCapabilityClasses: [], prohibitedSinks: [] });
    expect(decide(a2, ctxFor(t, read)).outcome).toBe("DENY");
  });

  it("S1 exfiltration: CUSTOMER_ANALYSIS default excludes external post", () => {
    const t = makeTask({ purpose: "CUSTOMER_ANALYSIS", allowedCapabilityClasses: [], prohibitedSinks: [] });
    expect(decide(a2, ctxFor(t, read)).outcome).toBe("ALLOW");
    expect(decide(a2, ctxFor(t, externalPost)).outcome).toBe("DENY");
  });

  it("decision does not depend on trajectory (stateless policy)", () => {
    const ctxA = ctxFor(makeTask(), refund);
    const ctxB = buildAuthorizationContext({
      principal,
      task: makeTask(),
      proposedAction: refund,
      trajectory: [
        {
          id: "evt-1", runId: "r", sequence: 1, timestamp: "t", causalParents: [], type: "UserRequestEvent",
          data: { request: "anything" },
        },
      ],
    });
    expect(decide(a2, ctxA)).toEqual(decide(a2, ctxB));
  });
});
