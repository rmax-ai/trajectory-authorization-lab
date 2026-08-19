/**
 * AuthorizationContext assembly (SPEC §4, TS_SYSTEM_DESIGN_PATTERNS.md §2).
 * Everything the policy sees is a projection of the event log — the monitor
 * owns state; policies are pure functions of this context.
 */
import type {
  AgentEvent,
  AuthorizationContext,
  Principal,
  TaskContract,
  ToolCall,
} from "../schemas";
import { buildGraph } from "./graph";
import { projectState } from "./state-projection";

export interface ContextInputs {
  principal: Principal;
  task: TaskContract;
  proposedAction: ToolCall;
  trajectory: readonly AgentEvent[];
}

export function buildAuthorizationContext(inputs: ContextInputs): AuthorizationContext {
  const state = projectState(inputs.trajectory);
  return {
    principal: inputs.principal,
    task: inputs.task,
    proposedAction: inputs.proposedAction,
    trajectory: [...inputs.trajectory],
    graph: buildGraph(inputs.trajectory),
    provenance: state.provenance,
    labels: state.labels,
    budgets: state.budgets,
    capabilities: state.capabilities,
  };
}
