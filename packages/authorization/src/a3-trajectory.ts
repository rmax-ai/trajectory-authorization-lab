/**
 * A3 — Stateful trajectory authorization (SPEC §8).
 * History-dependent policies: the decision reads the run so far.
 *
 * State comes exclusively from ctx (budgets are event folds; the trajectory
 * is the event log) — the policy stays pure (TS_SYSTEM_DESIGN_PATTERNS.md §3).
 *
 * Checks (deterministic functions, SPEC §8 examples):
 *  1. cumulative refund budget: sum(refunds over run) + amount <= limit
 *  2. tenant affinity: if tenants were read, refunds must target a read tenant
 *  3. confidential-observed: CONFIDENTIAL/SECRET seen → no external writes
 *  4. event precedence (config): deny tool X if event type Y occurred earlier
 *
 * Stable rule ids: A3-BUDGET-*, A3-TENANT-*, A3-CONFIDENTIAL-*, A3-PRECEDENCE-*.
 */
import type {
  AgentEvent,
  AuthorizationContext,
  AuthorizationPolicy,
  PolicyDecision,
} from "@tacl/core";

export interface A3Config {
  /** Cumulative refund budget limit (defaults to ctx budget if set). */
  refundBudgetLimit?: number;
  /** Deny `tool` if any event of `eventTypes` occurred earlier in the run. */
  eventPrecedence?: Array<{ tool: string; ifEventTypes: string[] }>;
}

const CONFIDENTIAL_OR_HIGHER = new Set(["CONFIDENTIAL", "SECRET"]);

/** Customer ids read this run (executed reads only — denied proposals don't count). */
function readCustomerIds(trajectory: readonly AgentEvent[]): string[] {
  const ids: string[] = [];
  for (const e of trajectory) {
    if (e.type === "ToolExecutedEvent") {
      const { tool, arguments: args } = e.data.tool;
      if ((tool === "crm.read" || tool === "billing.read") && typeof args.customerId === "string") {
        ids.push(args.customerId);
      }
    }
  }
  return ids;
}

function confidentialObserved(trajectory: readonly AgentEvent[]): boolean {
  return trajectory.some(
    (e) =>
      e.type === "ToolResultEvent" &&
      e.data.labels !== undefined &&
      CONFIDENTIAL_OR_HIGHER.has(e.data.labels.confidentiality),
  );
}

export function createA3Policy(cfg: A3Config = {}): AuthorizationPolicy {
  const precedence = cfg.eventPrecedence ?? [];
  return {
    id: "a3-trajectory",
    authorize(ctx: AuthorizationContext): PolicyDecision {
      const { trajectory, budgets, proposedAction } = ctx;
      const { tool, arguments: args } = proposedAction;
      const violations: string[] = [];
      const evidence: string[] = [];

      // 1. Cumulative refund budget (SPEC §8: sum(refund.amount over run) <= 500).
      if (tool === "billing.refund") {
        const amount = typeof args.amount === "number" ? args.amount : 0;
        const budget = budgets.budgets["refunds"];
        const limit = budget?.limit ?? cfg.refundBudgetLimit ?? 500;
        const spent = budget?.spent ?? 0;
        if (spent + amount > limit) {
          violations.push(
            `A3-BUDGET-CUMULATIVE-001: ${spent} + ${amount} would exceed refund budget ${limit}`,
          );
        }
      }

      // 2. Tenant affinity (SPEC §8: read tenant A → deny writes to tenant B).
      if (tool === "billing.refund") {
        const target = typeof args.customerId === "string" ? args.customerId : null;
        const readIds = readCustomerIds(trajectory);
        if (target !== null && readIds.length > 0 && !readIds.includes(target)) {
          violations.push(
            `A3-TENANT-AFFINITY-001: refund targets customer ${target} but only [${readIds.join(", ")}] were read this run`,
          );
        }
      }

      // 3. Confidential-observed → no external write (SPEC §8 A3 example).
      if (tool === "slack.external_post" && confidentialObserved(trajectory)) {
        violations.push(
          "A3-CONFIDENTIAL-EXTERNAL-001: confidential data was observed earlier in this run; external write denied",
        );
        const seen = trajectory.filter((e) => e.type === "ToolResultEvent" && e.data.labels !== undefined);
        for (const e of seen) evidence.push(e.id);
      }

      // 4. Configurable event precedence: deny tool X if event Y occurred earlier.
      for (const rule of precedence) {
        if (rule.tool !== tool) continue;
        const triggered = trajectory.find((e) => rule.ifEventTypes.includes(e.type));
        if (triggered) {
          violations.push(
            `A3-PRECEDENCE-001: ${tool} is denied because ${triggered.type} occurred earlier`,
          );
          evidence.push(triggered.id);
        }
      }

      if (violations.length > 0) {
        return { outcome: "DENY", reasons: violations, evidence };
      }
      return {
        outcome: "ALLOW",
        reasons: ["A3-TRAJECTORY-001: no trajectory-state constraints violated"],
      };
    },
  };
}
