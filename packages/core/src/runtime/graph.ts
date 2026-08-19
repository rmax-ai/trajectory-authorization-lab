/**
 * Causal graph reconstruction from the event stream (SPEC §7).
 * v1 (story 4.3): node per event + caused_by edges from causalParents.
 * Semantic edges (derived_from, read_from, writes_to, authorized_by,
 * delegated_from) are layered on in story 4.7.
 *
 * The graph is ALWAYS derived from events — never the reverse (AGENTS.md #3).
 */
import type { AgentEvent, ExecutionGraph, GraphNode } from "../schemas";

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
  const edges = [];
  for (const event of events) {
    for (const parent of event.causalParents) {
      edges.push({ from: parent, to: event.id, semantics: "caused_by" as const });
    }
  }
  return { nodes, edges };
}
