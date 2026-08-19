/**
 * A5 — Capability attenuation and runtime-effect enforcement (SPEC §8).
 *
 * Two distinct layers, deliberately separated:
 *  1. TOOL authorization via capabilities: the proposed tool must be covered
 *     by a capability in ctx.capabilities, and the arguments must satisfy its
 *     constraints (a capability's constraints accept or reject a call).
 *  2. RUNTIME-EFFECT authorization for python.exec: even when the generic
 *     executor capability exists, its modeled effects (network egress,
 *     environment reads, secret filesystem reads) are checked against
 *     runtime restrictions — the tool-vs-effect distinction (SPEC §8 A5,
 *     scenario 5).
 *
 * Delegation/attenuation itself is enforced structurally by the Runtime
 * (attenuateCapabilities rejects widening, core/runtime/capabilities.ts).
 *
 * Stable rule ids: A5-CAPABILITY-*, A5-CONSTRAINT-*, A5-EFFECT-*.
 */
import {
  constraintsNarrow,
  type AuthorizationContext,
  type AuthorizationPolicy,
  type Capability,
  type PolicyDecision,
} from "@tacl/core";

export interface A5Config {
  /** Runtime restrictions per tool: blocked modeled-effect kinds. */
  runtimeRestrictions: Record<string, string[]>;
  /** File paths (substring match) denied to filesystem.read effects. */
  deniedFsReadPatterns: string[];
}

export const DEFAULT_A5: A5Config = {
  runtimeRestrictions: {
    "python.exec": ["network.connect", "network.post", "environment.read"],
  },
  deniedFsReadPatterns: ["/etc/", "secret"],
};

/** Default capabilities for the main ladder scenarios (support agent). */
export const DEFAULT_CAPABILITIES: Capability[] = [
  { action: "crm.read", constraints: {} },
  { action: "billing.read", constraints: {} },
  { action: "billing.refund", constraints: { "amount.max": 100, customer: "customer-123" } },
  { action: "slack.internal_post", constraints: { channel: "#internal-ops" } },
  { action: "python.exec", constraints: {} },
];

/** Argument-constraint check: a capability accepts a call if args satisfy it. */
function callSatisfies(capability: Capability, args: Record<string, unknown>): boolean {
  const c = capability.constraints;
  if (typeof c["amount.max"] === "number") {
    const amount = typeof args.amount === "number" ? args.amount : null;
    if (amount === null || amount > (c["amount.max"] as number)) return false;
  }
  if (typeof c["amount.min"] === "number") {
    const amount = typeof args.amount === "number" ? args.amount : null;
    if (amount === null || amount < (c["amount.min"] as number)) return false;
  }
  if (typeof c["customer"] === "string") {
    if (args.customerId !== c["customer"]) return false;
  }
  if (typeof c["channel"] === "string") {
    if (args.channel !== c["channel"]) return false;
  }
  return true;
}

export function createA5Policy(cfg: A5Config = DEFAULT_A5): AuthorizationPolicy {
  return {
    id: "a5-capabilities",
    authorize(ctx: AuthorizationContext): PolicyDecision {
      const { tool, arguments: args } = ctx.proposedAction;
      const capabilities = ctx.capabilities.capabilities;

      // 1. Tool authorization: a matching capability must exist.
      const matching = capabilities.filter((c) => c.action === tool);
      if (matching.length === 0) {
        return {
          outcome: "DENY",
          reasons: [`A5-CAPABILITY-MISSING-001: no capability grants ${tool}`],
        };
      }

      // 2. Constraint check: at least one matching capability must accept args.
      const accepting = matching.filter((c) => callSatisfies(c, args));
      if (accepting.length === 0) {
        return {
          outcome: "DENY",
          reasons: [
            `A5-CONSTRAINT-001: arguments violate every ${tool} capability constraint`,
          ],
        };
      }

      // 3. Runtime-effect layer for the generic executor (scenario 5).
      if (tool === "python.exec") {
        const blocked = cfg.runtimeRestrictions[tool] ?? [];
        const script = typeof args.script === "string" ? args.script : "";
        for (const kind of blocked) {
          // Match the FULL modeled statement (escaped dots) — a bare `read(`
          // marker would also match filesystem.read (see a5 tests).
          const regex = new RegExp(`${kind.replace(/\./g, "\\.")}\\s*\\(`);
          if (regex.test(script)) {
            const marker = kind.split(".").at(-1)!.toUpperCase();
            return {
              outcome: "DENY",
              reasons: [
                `A5-EFFECT-${marker}-001: modeled runtime effect ${kind} is denied for python.exec`,
              ],
            };
          }
        }
        for (const pattern of cfg.deniedFsReadPatterns) {
          if (script.includes(pattern)) {
            return {
              outcome: "DENY",
              reasons: [
                `A5-EFFECT-FS-001: filesystem.read of path matching "${pattern}" is denied`,
              ],
            };
          }
        }
        return {
          outcome: "ALLOW",
          reasons: ["A5-CAPABILITY-001: capability satisfied; runtime effects authorized"],
        };
      }

      return {
        outcome: "ALLOW",
        reasons: ["A5-CAPABILITY-001: capability satisfied"],
      };
    },
  };
}

export { constraintsNarrow };
