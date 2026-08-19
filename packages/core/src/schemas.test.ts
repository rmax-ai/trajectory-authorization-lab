import { describe, expect, it } from "vitest";
import {
  AgentEventSchema,
  PolicyDecisionSchema,
  TaskContractSchema,
  ToolCallSchema,
} from "./schemas";

const base = {
  id: "evt-1",
  runId: "run-1",
  sequence: 1,
  timestamp: "2026-08-19T21:00:00.000Z",
  causalParents: [],
};

describe("ToolCall", () => {
  it("accepts SPEC §4 shape", () => {
    const tc = ToolCallSchema.parse({ tool: "crm.read", arguments: { customerId: "123" } });
    expect(tc.tool).toBe("crm.read");
    expect(tc.arguments).toEqual({ customerId: "123" });
  });

  it("rejects missing tool name", () => {
    expect(() => ToolCallSchema.parse({ arguments: {} })).toThrow();
  });
});

describe("TaskContract", () => {
  it("parses full contract with optional validUntil", () => {
    const t = TaskContractSchema.parse({
      id: "task-1",
      principalId: "agent-1",
      purpose: "LATENCY_DIAGNOSTICS",
      allowedCapabilityClasses: ["crm.read", "billing.read"],
      prohibitedSinks: ["slack.external_post"],
      constraints: { maxLatencyMs: 500 },
      validUntil: "2026-08-20T00:00:00.000Z",
    });
    expect(t.purpose).toBe("LATENCY_DIAGNOSTICS");
  });

  it("accepts contract without validUntil", () => {
    const t = TaskContractSchema.parse({
      id: "task-1",
      principalId: "agent-1",
      purpose: "X",
      allowedCapabilityClasses: [],
      prohibitedSinks: [],
      constraints: {},
    });
    expect(t.validUntil).toBeUndefined();
  });
});

describe("PolicyDecision", () => {
  it("parses ALLOW with reasons", () => {
    const d = PolicyDecisionSchema.parse({ outcome: "ALLOW", reasons: ["ACL-001 satisfied"] });
    expect(d.outcome).toBe("ALLOW");
  });

  it("parses DENY with evidence ids (SPEC §14)", () => {
    const d = PolicyDecisionSchema.parse({
      outcome: "DENY",
      reasons: ["Action targets PUBLIC sink", "Payload derives from CONFIDENTIAL CRM result", "Policy IFC-EXTERNAL-EGRESS-001 violated"],
      evidence: ["evt-13", "evt-17"],
    });
    expect(d.evidence).toEqual(["evt-13", "evt-17"]);
  });

  it("rejects unknown outcome", () => {
    expect(() => PolicyDecisionSchema.parse({ outcome: "MAYBE", reasons: [] })).toThrow();
  });
});

describe("AgentEvent discriminated union", () => {
  const cases: Array<[string, unknown]> = [
    ["UserRequestEvent", { request: "analyze customer" }],
    ["TaskCreatedEvent", { task: { id: "t1", principalId: "p1", purpose: "P", allowedCapabilityClasses: [], prohibitedSinks: [], constraints: {} } }],
    ["ModelDecisionEvent", { decision: "call crm.read" }],
    ["ToolProposedEvent", { tool: { tool: "crm.read", arguments: { customerId: "123" } } }],
    ["PolicyEvaluatedEvent", { policyId: "a0-tool-acl", decision: { outcome: "ALLOW", reasons: ["ok"] } }],
    ["ApprovalRequestedEvent", { reason: "refund over threshold" }],
    ["ToolExecutedEvent", { tool: { tool: "crm.read", arguments: {} }, outcome: "success" }],
    ["ToolResultEvent", { result: { name: "Ada" }, labels: { confidentiality: "CONFIDENTIAL", integrity: "TRUSTED" } }],
    ["CapabilityChangedEvent", { capabilities: [{ action: "billing.refund", constraints: { "amount.max": 100 } }] }],
    ["BudgetUpdatedEvent", { budget: "refunds", spent: 12, limit: 500 }],
    ["LabelUpdatedEvent", { labels: { summary: { confidentiality: "CONFIDENTIAL", integrity: "TRUSTED" } } }],
    ["RunCompletedEvent", { outcome: "completed", summary: "done" }],
  ];

  for (const [type, data] of cases) {
    it(`round-trips ${type}`, () => {
      const evt = AgentEventSchema.parse({ ...base, type, data });
      expect(evt.type).toBe(type);
      expect(AgentEventSchema.parse(JSON.parse(JSON.stringify(evt)))).toEqual(evt);
    });
  }

  it("rejects unknown event type", () => {
    expect(() => AgentEventSchema.parse({ ...base, type: "MagicEvent", data: {} })).toThrow();
  });

  it("rejects negative sequence", () => {
    expect(() => AgentEventSchema.parse({ ...base, sequence: -1, type: "UserRequestEvent", data: { request: "x" } })).toThrow();
  });
});
