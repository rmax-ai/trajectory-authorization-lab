/**
 * Causal graph reconstruction from the event stream (SPEC §7, v2).
 *
 * Node per event (kind mapped from event type). Edges:
 *   caused_by     — every causalParents link
 *   derived_from  — derivation: LabelUpdatedEvent with 2+ parents →
 *                   source events → derived value
 *   used_in       — ToolProposedEvent.data.uses → the proposal node
 *   authorized_by — PolicyEvaluatedEvent → ToolExecutedEvent it allowed
 *
 * Reserved (documented, not yet modeled): read_from, writes_to,
 * delegated_from — need fixture-entity and delegation modeling.
 *
 * ALWAYS derived from events — never the reverse (AGENTS.md #3). The unit
 * test asserts graph.json written at run completion deep-equals a fresh
 * reconstruction from events.jsonl.
 */
import type { AgentEvent, ExecutionGraph, GraphEdge, GraphNode } from "../schemas";

const KIND_BY_EVENT: Record<AgentEvent["type"], GraphNode["kind"]> = {
  UserRequestEvent: "user-input",
  TaskCreatedEvent: "user-input",
  ModelDecisionEvent: "model-decision",
  ToolProposedEvent: "tool-proposal",
  PolicyEvaluatedEvent: "policy-decision",
  ApprovalRequestedEvent: "policy-decision",
  ToolExecutedEvent: "tool-execution",
  ToolResultEvent: "tool-result",
  CapabilityChangedEvent: "model-decision",
  BudgetUpdatedEvent: "model-decision",
  LabelUpdatedEvent: "derived-value",
  RunCompletedEvent: "user-input",
};

export function buildGraph(events: readonly AgentEvent[]): ExecutionGraph {
  const nodes = events.map((e) => ({
    id: e.id,
    kind: KIND_BY_EVENT[e.type],
    label: e.type,
    data: { type: e.type, sequence: e.sequence },
  }));
  const edges: GraphEdge[] = [];
  const push = (from: string, to: string, semantics: GraphEdge["semantics"]) =>
    edges.push({ from, to, semantics });

  for (const event of events) {
    for (const parent of event.causalParents) {
      push(parent, event.id, "caused_by");
    }
  }

  for (const event of events) {
    if (event.type !== "LabelUpdatedEvent") continue;
    // Derivation record: multi-source label update (SPEC §7 derived_from).
    if (event.causalParents.length >= 2) {
      for (const source of event.causalParents) {
        push(source, event.id, "derived_from");
      }
    }
  }

  for (const event of events) {
    if (event.type !== "ToolProposedEvent") continue;
    for (const usedId of event.data.uses ?? []) {
      push(usedId, event.id, "used_in");
    }
  }

  for (const event of events) {
    if (event.type !== "ToolExecutedEvent") continue;
    for (const parentId of event.causalParents) {
      const parent = events.find((e) => e.id === parentId);
      if (parent?.type === "PolicyEvaluatedEvent") {
        push(parent.id, event.id, "authorized_by");
      }
    }
  }

  return { nodes, edges };
}
