/**
 * A1 — Argument-aware ABAC (SPEC §8). Attribute checks on individual calls.
 * No historical state. Stable rule ids: A1-*-*.
 */
import type {
  AuthorizationContext,
  AuthorizationPolicy,
  PolicyDecision,
} from "@tacl/core";

export interface AbacConfig {
  /** Per-call refund cap (SPEC: refund.amount <= 100). */
  maxRefundAmount: number;
  /** Allowed customer ids for crm/billing tools. */
  allowedCustomers: string[];
  /** Allowed channels per slack tool. */
  allowedChannels: Record<string, string[]>;
}

export const DEFAULT_ABAC: AbacConfig = {
  maxRefundAmount: 100,
  allowedCustomers: ["customer-123", "customer-456"],
  allowedChannels: {
    "slack.internal_post": ["#internal-ops", "#engineering"],
    "slack.external_post": ["#external-partners"],
  },
};

export function createA1Policy(cfg: AbacConfig = DEFAULT_ABAC): AuthorizationPolicy {
  return {
    id: "a1-abac",
    authorize(ctx: AuthorizationContext): PolicyDecision {
      const { tool, arguments: args } = ctx.proposedAction;
      const violations: string[] = [];

      if (tool === "billing.refund") {
        const amount = typeof args.amount === "number" ? args.amount : null;
        if (amount === null || !Number.isFinite(amount)) {
          violations.push("A1-REFUND-AMOUNT-001: refund requires numeric amount");
        } else if (amount > cfg.maxRefundAmount) {
          violations.push(
            `A1-REFUND-AMOUNT-001: amount ${amount} exceeds per-call cap ${cfg.maxRefundAmount}`,
          );
        }
      }

      if (tool === "crm.read" || tool === "billing.read" || tool === "billing.refund") {
        const customerId = typeof args.customerId === "string" ? args.customerId : null;
        if (!customerId || !cfg.allowedCustomers.includes(customerId)) {
          violations.push(
            `A1-CUSTOMER-SCOPE-001: customer ${String(customerId)} outside allowed set`,
          );
        }
      }

      if (tool === "slack.internal_post" || tool === "slack.external_post") {
        const channel = typeof args.channel === "string" ? args.channel : null;
        const allowed = cfg.allowedChannels[tool] ?? [];
        if (!channel || !allowed.includes(channel)) {
          violations.push(
            `A1-CHANNEL-SCOPE-001: channel ${String(channel)} not allowed for ${tool}`,
          );
        }
      }

      if (violations.length > 0) {
        return { outcome: "DENY", reasons: violations };
      }
      return { outcome: "ALLOW", reasons: ["A1-ABAC-001: all argument constraints satisfied"] };
    },
  };
}
