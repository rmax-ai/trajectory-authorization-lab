/**
 * A0 — Tool ACL (SPEC §8). The baseline: principal → tool, nothing else.
 * DELIBERATELY allows unsafe composed trajectories — that is the point of the
 * experiment ladder. Stable rule ids: A0-TOOL-ACL-*.
 */
import type {
  AuthorizationContext,
  AuthorizationPolicy,
  PolicyDecision,
} from "@tacl/core";

export interface AclConfig {
  /** principal id OR role → allowed tool names. */
  allow: Record<string, string[]>;
}

/** Defaults: a support agent holding the full toolset (scenarios 1–4). */
export const DEFAULT_ACL: AclConfig = {
  allow: {
    "support-agent": [
      "crm.read",
      "billing.read",
      "billing.refund",
      "slack.internal_post",
      "slack.external_post",
      "python.exec",
    ],
  },
};

export function createA0Policy(cfg: AclConfig = DEFAULT_ACL): AuthorizationPolicy {
  return {
    id: "a0-tool-acl",
    authorize(ctx: AuthorizationContext): PolicyDecision {
      const allowed = new Set<string>();
      // Precedence: an explicit per-principal entry overrides role ACLs.
      const byId = cfg.allow[ctx.principal.id];
      if (byId) {
        for (const t of byId) allowed.add(t);
      } else {
        for (const role of ctx.principal.roles) {
          const byRole = cfg.allow[role];
          if (byRole) for (const t of byRole) allowed.add(t);
        }
      }
      if (allowed.has(ctx.proposedAction.tool)) {
        return {
          outcome: "ALLOW",
          reasons: ["A0-TOOL-ACL-001: tool present in principal ACL"],
        };
      }
      return {
        outcome: "DENY",
        reasons: [`A0-TOOL-ACL-002: ${ctx.proposedAction.tool} not in ACL for principal ${ctx.principal.id}`],
      };
    },
  };
}
