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
import { createA0Policy, DEFAULT_ACL } from "./a0-tool-acl";
import { createA1Policy } from "./a1-abac";
import { createPolicy } from "./registry";

/** a0/a1 are synchronous implementations — narrow the union for test ergonomics. */
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

function ctxFor(call: ToolCall): AuthorizationContext {
  return buildAuthorizationContext({
    principal,
    task,
    proposedAction: call,
    trajectory: [],
  });
}

function call(tool: string, args: Record<string, unknown>): ToolCall {
  return { tool, arguments: args };
}

describe("A0 tool ACL (SPEC §8)", () => {
  const a0 = createA0Policy();

  it("allows tools in the principal's role ACL", () => {
    const d = decide(a0, ctxFor(call("crm.read", { customerId: "customer-123" })));
    expect(d.outcome).toBe("ALLOW");
    expect(d.reasons[0]).toContain("A0-TOOL-ACL-001");
  });

  it("denies tools outside the ACL with a stable rule id", () => {
    const d = decide(a0, ctxFor(call("repo.delete", {})));
    expect(d.outcome).toBe("DENY");
    expect(d.reasons[0]).toContain("A0-TOOL-ACL-002");
  });

  it("deliberately allows the S1 exfiltration chain (each call individually)", () => {
    for (const c of [
      call("crm.read", { customerId: "customer-123" }),
      call("billing.read", { customerId: "customer-123" }),
      call("slack.external_post", { channel: "#external-partners", text: "summary" }),
    ]) {
      expect(decide(a0, ctxFor(c)).outcome).toBe("ALLOW");
    }
  });

  it("respects per-principal ACL entries over roles", () => {
    const restricted = createA0Policy({
      allow: { "agent-1": ["crm.read"], "support-agent": [...DEFAULT_ACL.allow["support-agent"]!] },
    });
    expect(decide(restricted, ctxFor(call("crm.read", { customerId: "x" }))).outcome).toBe("ALLOW");
    expect(decide(restricted, ctxFor(call("billing.read", { customerId: "x" }))).outcome).toBe("DENY");
  });
});

describe("A1 argument ABAC (SPEC §8)", () => {
  const a1 = createA1Policy();

  it("allows refunds at or below the per-call cap", () => {
    const d = decide(a1, ctxFor(call("billing.refund", { customerId: "customer-123", amount: 100 })));
    expect(d.outcome).toBe("ALLOW");
  });

  it("denies refunds above the cap with A1-REFUND-AMOUNT-001", () => {
    const d = decide(a1, ctxFor(call("billing.refund", { customerId: "customer-123", amount: 101 })));
    expect(d.outcome).toBe("DENY");
    expect(d.reasons[0]).toContain("A1-REFUND-AMOUNT-001");
  });

  it("denies out-of-scope customers", () => {
    const d = decide(a1, ctxFor(call("crm.read", { customerId: "customer-999" })));
    expect(d.outcome).toBe("DENY");
    expect(d.reasons[0]).toContain("A1-CUSTOMER-SCOPE-001");
  });

  it("denies disallowed slack channels", () => {
    const d = decide(a1, ctxFor(call("slack.internal_post", { channel: "#random", text: "hi" })));
    expect(d.outcome).toBe("DENY");
    expect(d.reasons[0]).toContain("A1-CHANNEL-SCOPE-001");
  });

  it("allows in-scope channels", () => {
    const d = decide(a1, ctxFor(call("slack.external_post", { channel: "#external-partners", text: "ok" })));
    expect(d.outcome).toBe("ALLOW");
  });

  it("has NO historical state: cumulative breach passes every per-call check", () => {
    // Six sequential $99 refunds each pass A1 — the cumulative breach is A3's job.
    for (let i = 0; i < 6; i++) {
      const d = decide(a1, ctxFor(call("billing.refund", { customerId: "customer-123", amount: 99 })));
      expect(d.outcome).toBe("ALLOW");
    }
  });
});

describe("registry", () => {
  it("exposes the ladder in order and instantiates a0/a1", () => {
    expect(createPolicy("a0").id).toBe("a0-tool-acl");
    expect(createPolicy("a1").id).toBe("a1-abac");
  });

  it("fails loudly for not-yet-implemented rungs", () => {
    expect(() => createPolicy("a3")).toThrow(/not implemented/);
  });

  it("is pure: repeated authorizations give identical decisions", () => {
    const a1 = createPolicy("a1");
    const ctx = ctxFor(call("billing.refund", { customerId: "customer-123", amount: 101 }));
    expect(decide(a1, ctx)).toEqual(decide(a1, ctx));
  });
});
