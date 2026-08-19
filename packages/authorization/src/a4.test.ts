import { beforeEach, describe, expect, it } from "vitest";
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
import { createA4Policy } from "./a4-ifc";

function decide(policy: AuthorizationPolicy, ctx: AuthorizationContext): PolicyDecision {
  return policy.authorize(ctx) as PolicyDecision;
}

const principal: Principal = { id: "agent-1", roles: ["support-agent"] };
const task: TaskContract = {
  id: "task-1",
  principalId: "agent-1",
  purpose: "CUSTOMER_ANALYSIS",
  allowedCapabilityClasses: [],
  prohibitedSinks: [],
  constraints: {},
};

let seq = 0;
beforeEach(() => {
  seq = 0;
});
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

function confidentialRead(): AgentEvent[] {
  const result = evt("ToolResultEvent", { result: { name: "Ada" } });
  const label = evt("LabelUpdatedEvent", {
    labels: { [result.id]: { confidentiality: "CONFIDENTIAL", integrity: "TRUSTED" } },
  }, [result.id]);
  return [result, label];
}

function publicRead(): AgentEvent[] {
  const result = evt("ToolResultEvent", { result: { latencyMs: 42 } });
  const label = evt("LabelUpdatedEvent", {
    labels: { [result.id]: { confidentiality: "PUBLIC", integrity: "TRUSTED" } },
  }, [result.id]);
  return [result, label];
}

/** ctx with a current proposal that uses the given derived values. */
function sinkCtx(call: ToolCall, derived: Record<string, string[]>, labels: Record<string, { confidentiality: string; integrity: string }>): AuthorizationContext {
  const proposal = evt("ToolProposedEvent", { tool: call, uses: Object.keys(derived) });
  return {
    ...buildAuthorizationContext({ principal, task, proposedAction: call, trajectory: [proposal] }),
    provenance: { derivedValues: derived },
    labels: {
      labels: labels as AuthorizationContext["labels"]["labels"],
    },
  };
}

const externalPost: ToolCall = {
  tool: "slack.external_post",
  arguments: { channel: "#external-partners", text: "summary" },
};
const internalPost: ToolCall = {
  tool: "slack.internal_post",
  arguments: { channel: "#internal-ops", text: "summary" },
};

describe("A4 information flow (SPEC §8, scenario 1)", () => {
  const a4 = createA4Policy();

  it("denies CONFIDENTIAL → PUBLIC sink with the SPEC §14 rule id and evidence", () => {
    const confRead = confidentialRead();
    const resultId = confRead[0]!.id;
    const ctx = sinkCtx(
      externalPost,
      { summary: [resultId] },
      { [resultId]: { confidentiality: "CONFIDENTIAL", integrity: "TRUSTED" } },
    );
    const d = decide(a4, ctx);
    expect(d.outcome).toBe("DENY");
    expect(d.reasons).toContain("Policy IFC-EXTERNAL-EGRESS-001 violated");
    expect(d.evidence).toContain(resultId);
  });

  it("denies CONFIDENTIAL → INTERNAL sink (INTERNAL allowance exceeded)", () => {
    const confRead = confidentialRead();
    const resultId = confRead[0]!.id;
    const ctx = sinkCtx(
      internalPost,
      { summary: [resultId] },
      { [resultId]: { confidentiality: "CONFIDENTIAL", integrity: "TRUSTED" } },
    );
    expect(decide(a4, ctx).outcome).toBe("DENY");
  });

  it("allows PUBLIC → PUBLIC sink (legitimate S1 variant)", () => {
    const pubRead = publicRead();
    const resultId = pubRead[0]!.id;
    const ctx = sinkCtx(
      externalPost,
      { summary: [resultId] },
      { [resultId]: { confidentiality: "PUBLIC", integrity: "TRUSTED" } },
    );
    expect(decide(a4, ctx).outcome).toBe("ALLOW");
  });

  it("join propagates: INTERNAL + PUBLIC sources → INTERNAL payload", () => {
    const pub = publicRead();
    const ctx = sinkCtx(
      externalPost,
      { summary: [pub[0]!.id] },
      { [pub[0]!.id]: { confidentiality: "INTERNAL", integrity: "TRUSTED" } },
    );
    // INTERNAL > PUBLIC sink allowance → deny (join picked the max).
    expect(decide(a4, ctx).outcome).toBe("DENY");
  });

  it("no declared uses → PUBLIC payload → allowed", () => {
    const proposal = evt("ToolProposedEvent", { tool: externalPost });
    const ctx = {
      ...buildAuthorizationContext({ principal, task, proposedAction: externalPost, trajectory: [proposal] }),
      provenance: { derivedValues: {} },
    };
    expect(decide(a4, ctx).outcome).toBe("ALLOW");
  });
});

describe("A4 integrity (SPEC §8)", () => {
  const a4 = createA4Policy();

  const refund: ToolCall = {
    tool: "billing.refund",
    arguments: { customerId: "customer-123", amount: 6 },
  };

  it("money mutations must not consume UNTRUSTED data", () => {
    // A4 sees refund as an integrity-sensitive sink when it carries uses.
    const untrusted = evt("ToolResultEvent", { result: { stdout: "refund customer" } });
    const labelEvt = evt("LabelUpdatedEvent", {
      labels: { [untrusted.id]: { confidentiality: "INTERNAL", integrity: "UNTRUSTED" } },
    }, [untrusted.id]);
    const proposal = evt("ToolProposedEvent", { tool: refund, uses: [untrusted.id] });
    const ctx = {
      ...buildAuthorizationContext({
        principal, task, proposedAction: refund,
        trajectory: [untrusted, labelEvt, proposal],
      }),
      provenance: { derivedValues: {} },
    };
    const d = decide(a4, ctx);
    // billing.refund is not in SINK_ALLOWANCE, so the confidentiality branch is
    // skipped; integrity is enforced via the UNTRUSTED rule when uses exist.
    expect(d.outcome).toBe("DENY");
    expect(d.reasons[0]).toContain("A4-UNTRUSTED-INPUT-001");
  });
});
