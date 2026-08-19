/**
 * A4 — Provenance and information-flow policy (SPEC §8).
 *
 * Structured taint: derived values carry the JOIN of their sources' labels
 * (computed by the runtime's derive step); sinks declare a maximum accepted
 * confidentiality. Policy: deny if source confidentiality > sink allowance.
 *
 * Integrity: money mutations must not consume UNTRUSTED data.
 *
 * Explicit structured provenance ONLY — no semantic LLM taint detection
 * (SPEC §8 A4, §17 non-goals).
 *
 * Stable rule ids: IFC-EXTERNAL-EGRESS-001 (SPEC §14 example id), A4-IFC-*.
 */
import {
  confLte,
  joinConf,
  joinIntegrity,
  PUBLIC_TRUSTED,
  type AgentEvent,
  type AuthorizationContext,
  type AuthorizationPolicy,
  type Confidentiality,
  type Label,
  type PolicyDecision,
} from "@tacl/core";

type ToolProposed = Extract<AgentEvent, { type: "ToolProposedEvent" }>;

/** Sink allowance map (SPEC §8 A4): tool → max accepted confidentiality. */
const SINK_ALLOWANCE: Record<string, Confidentiality> = {
  "slack.external_post": "PUBLIC",
  "slack.internal_post": "INTERNAL",
};

/** Money mutations require trusted input. */
const INTEGRITY_SENSITIVE = new Set(["billing.refund"]);

export function createA4Policy(): AuthorizationPolicy {
  return {
    id: "a4-ifc",
    authorize(ctx: AuthorizationContext): PolicyDecision {
      const { tool } = ctx.proposedAction;
      const allowance = SINK_ALLOWANCE[tool];

      // The runtime emits the current ToolProposedEvent immediately before
      // assembling this context — it is the last proposal in the trajectory.
      const currentProposal = [...ctx.trajectory]
        .reverse()
        .find((e): e is ToolProposed => e.type === "ToolProposedEvent");
      const usedIds = currentProposal?.data.uses ?? [];

      // Resolve the payload's label: labels of everything this proposal uses.
      const sourceLabels: Label[] = [];
      const evidence: string[] = [];
      for (const usedId of usedIds) {
        const sources = ctx.provenance.derivedValues[usedId] ?? [usedId];
        for (const sourceId of sources) {
          const label = ctx.labels.labels[sourceId];
          if (label) {
            sourceLabels.push(label);
            evidence.push(sourceId);
          }
        }
      }
      const payload: Label =
        sourceLabels.length > 0
          ? {
              confidentiality: joinConf(...sourceLabels.map((l) => l.confidentiality)),
              integrity: joinIntegrity(...sourceLabels.map((l) => l.integrity)),
            }
          : PUBLIC_TRUSTED;

      // Confidentiality: sink check — deny if source confidentiality > allowance.
      if (allowance !== undefined && !confLte(payload.confidentiality, allowance)) {
        return {
          outcome: "DENY",
          reasons: [
            "Action targets PUBLIC sink",
            `Payload derives from ${payload.confidentiality} data; sink allows at most ${allowance}`,
            "Policy IFC-EXTERNAL-EGRESS-001 violated",
          ],
          evidence,
        };
      }

      // Integrity: untrusted input must not drive money mutations.
      if (INTEGRITY_SENSITIVE.has(tool) && usedIds.length > 0 && payload.integrity === "UNTRUSTED") {
        return {
          outcome: "DENY",
          reasons: [`A4-UNTRUSTED-INPUT-001: ${tool} must not consume UNTRUSTED data`],
          evidence,
        };
      }

      if (allowance === undefined && !INTEGRITY_SENSITIVE.has(tool)) {
        return { outcome: "ALLOW", reasons: ["A4-IFC-001: not a labeled sink"] };
      }
      return {
        outcome: "ALLOW",
        reasons: ["A4-IFC-002: payload labels within sink allowance"],
      };
    },
  };
}
