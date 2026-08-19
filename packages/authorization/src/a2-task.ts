/**
 * A2 — Task contract authorization (SPEC §8).
 * A tool is authorized only if it belongs to the active task's declared
 * capability classes, and is not on the task's prohibited sink list.
 *
 * Task contracts are IMMUTABLE during a run — enforced structurally by the
 * Runtime, which deep-freezes the contract at construction (AGENTS.md #1).
 * A policy can therefore trust ctx.task; the agent cannot rewrite its own
 * contract mid-run.
 *
 * Stable rule ids: A2-SINK-*, A2-CAPABILITY-*.
 */
import type {
  AuthorizationContext,
  AuthorizationPolicy,
  PolicyDecision,
} from "@tacl/core";

export interface A2Config {
  /**
   * Fallback capability classes per purpose, used only when a task declares
   * an empty allowedCapabilityClasses list (scenarios normally declare
   * explicitly, SPEC §10).
   */
  purposeDefaults: Record<string, string[]>;
}

export const DEFAULT_A2: A2Config = {
  purposeDefaults: {
    CUSTOMER_ANALYSIS: ["crm.read", "billing.read", "slack.internal_post"],
    LATENCY_DIAGNOSTICS: ["crm.read", "billing.read"],
    SUPPORT_OPS: ["crm.read", "billing.read", "billing.refund", "slack.internal_post"],
  },
};

export function createA2Policy(cfg: A2Config = DEFAULT_A2): AuthorizationPolicy {
  return {
    id: "a2-task",
    authorize(ctx: AuthorizationContext): PolicyDecision {
      const { task, proposedAction } = ctx;

      if (task.prohibitedSinks.includes(proposedAction.tool)) {
        return {
          outcome: "DENY",
          reasons: [
            `A2-SINK-PROHIBITED-001: ${proposedAction.tool} is on task ${task.id}'s prohibited sink list`,
          ],
        };
      }

      const classes =
        task.allowedCapabilityClasses.length > 0
          ? task.allowedCapabilityClasses
          : (cfg.purposeDefaults[task.purpose] ?? []);

      if (classes.includes(proposedAction.tool)) {
        return {
          outcome: "ALLOW",
          reasons: [`A2-CAPABILITY-001: ${proposedAction.tool} within task ${task.id} capability classes`],
        };
      }

      return {
        outcome: "DENY",
        reasons: [
          `A2-CAPABILITY-002: ${proposedAction.tool} outside capability classes of task ${task.id} (purpose ${task.purpose})`,
        ],
      };
    },
  };
}
