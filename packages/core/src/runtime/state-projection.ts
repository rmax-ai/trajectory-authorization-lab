/**
 * State projection — fold the event log into the policy-visible state
 * (TS_SYSTEM_DESIGN_PATTERNS.md §2). Budgets, labels, capabilities, provenance
 * are DERIVED from events, never mutable singletons. Two runs in one process
 * cannot bleed state; replay produces identical projections.
 */
import type {
  AgentEvent,
  BudgetState,
  CapabilityState,
  InformationFlowState,
  ProvenanceState,
} from "../schemas";

export interface ProjectedState {
  budgets: BudgetState;
  labels: InformationFlowState;
  capabilities: CapabilityState;
  provenance: ProvenanceState;
}

export function emptyProjection(): ProjectedState {
  return {
    budgets: { budgets: {} },
    labels: { labels: {} },
    capabilities: { capabilities: [] },
    provenance: { derivedValues: {} },
  };
}

export function projectState(events: readonly AgentEvent[]): ProjectedState {
  const state = emptyProjection();
  for (const event of events) {
    switch (event.type) {
      case "BudgetUpdatedEvent":
        state.budgets.budgets[event.data.budget] = {
          spent: event.data.spent,
          limit: event.data.limit,
        };
        break;
      case "LabelUpdatedEvent":
        for (const [key, label] of Object.entries(event.data.labels)) {
          state.labels.labels[key] = label;
        }
        // A LabelUpdatedEvent with causal parents is a derivation record:
        // derivedValues[derivedId] = source event ids (SPEC §7 derived_from).
        if (event.causalParents.length > 0) {
          for (const key of Object.keys(event.data.labels)) {
            state.provenance.derivedValues[key] = [...event.causalParents];
          }
        }
        break;
      case "CapabilityChangedEvent":
        state.capabilities.capabilities = [...event.data.capabilities];
        break;
      default:
        break;
    }
  }
  return state;
}
