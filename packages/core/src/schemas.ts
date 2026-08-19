/**
 * Core schemas — the single source of truth for every serialized shape in the lab.
 * Ground truth: SPEC.md §4 (abstractions), §6 (events), §7 (graph), §8 (labels, capabilities).
 *
 * Convention: types are derived from schemas via z.infer. Never hand-write parallel types.
 */
import { z } from "zod";

// ─────────────────────────────────────────────────────────────────────────────
// §4 Abstractions
// ─────────────────────────────────────────────────────────────────────────────

export const PrincipalSchema = z.object({
  id: z.string(),
  roles: z.array(z.string()),
});
export type Principal = z.infer<typeof PrincipalSchema>;

export const TaskContractSchema = z.object({
  id: z.string(),
  principalId: z.string(),
  purpose: z.string(),
  allowedCapabilityClasses: z.array(z.string()),
  prohibitedSinks: z.array(z.string()),
  constraints: z.record(z.string(), z.unknown()),
  validUntil: z.string().optional(),
});
export type TaskContract = z.infer<typeof TaskContractSchema>;

export const ToolCallSchema = z.object({
  tool: z.string(),
  arguments: z.record(z.string(), z.unknown()),
});
export type ToolCall = z.infer<typeof ToolCallSchema>;

/** PolicyDecision per SPEC §4, extended with §14 `evidence` (event ids). */
export const PolicyDecisionSchema = z.discriminatedUnion("outcome", [
  z.object({
    outcome: z.literal("ALLOW"),
    reasons: z.array(z.string()),
    evidence: z.array(z.string()).optional(),
  }),
  z.object({
    outcome: z.literal("DENY"),
    reasons: z.array(z.string()),
    evidence: z.array(z.string()).optional(),
  }),
  z.object({
    outcome: z.literal("REQUIRE_APPROVAL"),
    reasons: z.array(z.string()),
    evidence: z.array(z.string()).optional(),
  }),
]);
export type PolicyDecision = z.infer<typeof PolicyDecisionSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// §7 Execution graph (minimal; reconstruction logic lands in story 4.7)
// ─────────────────────────────────────────────────────────────────────────────

export const GraphNodeKindSchema = z.enum([
  "user-input",
  "tool-proposal",
  "policy-decision",
  "tool-execution",
  "tool-result",
  "derived-value",
  "model-decision",
]);

export const GraphNodeSchema = z.object({
  id: z.string(),
  kind: GraphNodeKindSchema,
  label: z.string(),
  data: z.unknown(),
});
export type GraphNode = z.infer<typeof GraphNodeSchema>;

export const GraphEdgeSemanticsSchema = z.enum([
  "caused_by",
  "derived_from",
  "read_from",
  "writes_to",
  "authorized_by",
  "delegated_from",
]);

export const GraphEdgeSchema = z.object({
  from: z.string(),
  to: z.string(),
  semantics: GraphEdgeSemanticsSchema,
});

export const ExecutionGraphSchema = z.object({
  nodes: z.array(GraphNodeSchema),
  edges: z.array(GraphEdgeSchema),
});
export type ExecutionGraph = z.infer<typeof ExecutionGraphSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// §8 state carried by AuthorizationContext (SPEC §4)
// ─────────────────────────────────────────────────────────────────────────────

export const ConfidentialitySchema = z.enum([
  "PUBLIC",
  "INTERNAL",
  "CONFIDENTIAL",
  "SECRET",
]);
export type Confidentiality = z.infer<typeof ConfidentialitySchema>;

export const IntegritySchema = z.enum(["TRUSTED", "UNTRUSTED"]);
export type Integrity = z.infer<typeof IntegritySchema>;

export const LabelSchema = z.object({
  confidentiality: ConfidentialitySchema,
  integrity: IntegritySchema,
});
export type Label = z.infer<typeof LabelSchema>;

/** entity id (tool result / derived value) → label */
export const InformationFlowStateSchema = z.object({
  labels: z.record(z.string(), LabelSchema),
});
export type InformationFlowState = z.infer<typeof InformationFlowStateSchema>;

export const CapabilitySchema = z.object({
  action: z.string(),
  constraints: z.record(z.string(), z.unknown()),
});
export type Capability = z.infer<typeof CapabilitySchema>;

/**
 * Modeled runtime effects of the simulated python.exec tool (SPEC §5).
 * Enforced at the effect layer by A5 (story 4.8) — never actually performed.
 */
export const RuntimeEffectSchema = z.object({
  kind: z.enum(["filesystem.read", "network.connect", "network.post", "environment.read"]),
  target: z.string(),
});
export type RuntimeEffect = z.infer<typeof RuntimeEffectSchema>;

export const CapabilityStateSchema = z.object({
  capabilities: z.array(CapabilitySchema),
});
export type CapabilityState = z.infer<typeof CapabilityStateSchema>;

export const BudgetStateSchema = z.object({
  budgets: z.record(
    z.string(),
    z.object({ spent: z.number(), limit: z.number() }),
  ),
});
export type BudgetState = z.infer<typeof BudgetStateSchema>;

/** derived value id → source event ids */
export const ProvenanceStateSchema = z.object({
  derivedValues: z.record(z.string(), z.array(z.string())),
});
export type ProvenanceState = z.infer<typeof ProvenanceStateSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// §6 Agent events
// ─────────────────────────────────────────────────────────────────────────────

const EventBase = {
  id: z.string(),
  runId: z.string(),
  sequence: z.number().int().nonnegative(),
  timestamp: z.string(),
  causalParents: z.array(z.string()),
};

export const AgentEventSchema = z.discriminatedUnion("type", [
  z.object({ ...EventBase, type: z.literal("UserRequestEvent"), data: z.object({ request: z.string() }) }),
  z.object({ ...EventBase, type: z.literal("TaskCreatedEvent"), data: z.object({ task: TaskContractSchema }) }),
  z.object({ ...EventBase, type: z.literal("ModelDecisionEvent"), data: z.object({ decision: z.string() }) }),
  z.object({ ...EventBase, type: z.literal("ToolProposedEvent"), data: z.object({ tool: ToolCallSchema }) }),
  z.object({
    ...EventBase,
    type: z.literal("PolicyEvaluatedEvent"),
    data: z.object({ policyId: z.string(), decision: PolicyDecisionSchema }),
  }),
  z.object({ ...EventBase, type: z.literal("ApprovalRequestedEvent"), data: z.object({ reason: z.string() }) }),
  z.object({
    ...EventBase,
    type: z.literal("ToolExecutedEvent"),
    data: z.object({ tool: ToolCallSchema, outcome: z.enum(["success", "error"]) }),
  }),
  z.object({
    ...EventBase,
    type: z.literal("ToolResultEvent"),
    data: z.object({
      result: z.unknown(),
      labels: LabelSchema.optional(),
      effects: z.array(RuntimeEffectSchema).optional(),
    }),
  }),
  z.object({
    ...EventBase,
    type: z.literal("CapabilityChangedEvent"),
    data: z.object({ capabilities: z.array(CapabilitySchema) }),
  }),
  z.object({
    ...EventBase,
    type: z.literal("BudgetUpdatedEvent"),
    data: z.object({ budget: z.string(), spent: z.number(), limit: z.number() }),
  }),
  z.object({
    ...EventBase,
    type: z.literal("LabelUpdatedEvent"),
    data: z.object({ labels: z.record(z.string(), LabelSchema) }),
  }),
  z.object({
    ...EventBase,
    type: z.literal("RunCompletedEvent"),
    data: z.object({ outcome: z.enum(["completed", "denied", "error"]), summary: z.string() }),
  }),
]);
export type AgentEvent = z.infer<typeof AgentEventSchema>;
export type AgentEventType = AgentEvent["type"];

// ─────────────────────────────────────────────────────────────────────────────
// §4 AuthorizationContext
// ─────────────────────────────────────────────────────────────────────────────

export const AuthorizationContextSchema = z.object({
  principal: PrincipalSchema,
  task: TaskContractSchema,
  proposedAction: ToolCallSchema,
  trajectory: z.array(AgentEventSchema),
  graph: ExecutionGraphSchema,
  provenance: ProvenanceStateSchema,
  labels: InformationFlowStateSchema,
  budgets: BudgetStateSchema,
  capabilities: CapabilityStateSchema,
});
export type AuthorizationContext = z.infer<typeof AuthorizationContextSchema>;

/**
 * SPEC §4 — the policy contract. Lives in core so @tacl/authorization can
 * depend on it (dependency direction: core ← authorization).
 * Pure function of context; may be sync or async.
 */
export interface AuthorizationPolicy {
  readonly id: string;
  authorize(
    context: AuthorizationContext,
  ): PolicyDecision | Promise<PolicyDecision>;
}
