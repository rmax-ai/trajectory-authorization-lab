# TS_SYSTEM_DESIGN_PATTERNS.md — The Patterns That Matter

## 1. Reference Monitor (structural, SPEC §18)

The invariant "the agent never invokes tools directly" must hold by construction:

```ts
// packages/core/tools/registry.ts — NOT exported from package index
const toolRegistry = new Map<string, Tool>([
  ["crm.read", crmReadTool],
  ["billing.read", billingReadTool],
  ["billing.refund", billingRefundTool],
  ["slack.internal_post", slackInternalPostTool],
  ["slack.external_post", slackExternalPostTool],
  ["python.exec", pythonExecTool],
]);

// packages/core/runtime/execute.ts — the ONLY public path
export async function execute(
  ctx: AuthorizationContext,
  policy: AuthorizationPolicy,
  deps: { clock: Clock; rng: Rng; emit: (e: AgentEvent) => void },
): Promise<PolicyEvaluatedEvent> {
  const decision = await policy.authorize(ctx);   // ALLOW | DENY | REQUIRE_APPROVAL
  deps.emit(policyEvaluatedEvent(decision));
  if (decision.outcome !== "ALLOW") return blockedEvent(decision);
  const tool = toolRegistry.get(ctx.proposedAction.tool); // unreachable from outside
  if (!tool) throw new Error("unknown tool");            // config error, not policy
  const result = tool.run(ctx.proposedAction.arguments, deps);
  return executedEvent(result);
}
```

Package `exports` map simply never exposes the registry — `import { toolRegistry } from "@tacl/core"` does not typecheck. That is the structural enforcement.

## 2. Event-sourced state projection (SPEC §6, §8)

Budgets, labels, capabilities are **folds over events**, recomputed per policy evaluation:

```ts
export function projectState(events: AgentEvent[]): ProjectedState {
  // single pass, O(n); each event type updates exactly one domain:
  //   BudgetUpdatedEvent   → budgets
  //   LabelUpdatedEvent    → labels (join on derivation)
  //   CapabilityChangedEvent → capabilities (narrowing only)
  //   ToolExecutedEvent    → history index (per-tool, per-tenant)
}
```

Policy receives the projection via `AuthorizationContext`. No mutable singleton anywhere; two runs in one process cannot bleed state.

## 3. Pure policy functions (SPEC §4)

```ts
export const a4IfcPolicy: AuthorizationPolicy = {
  id: "a4-ifc",
  authorize(ctx): PolicyDecision {
    const payloadLabels = ctx.labels.ofDerivedSources(ctx.proposedAction);
    const sinkAllowance = SINK_ALLOWANCE[ctx.proposedAction.tool]; // PUBLIC/INTERNAL
    if (lte(sinkAllowance, payloadLabels.confidentiality)) {
      return { outcome: "DENY", reasons: [...], evidence: [...] };
    }
    return { outcome: "ALLOW", reasons: ["IFC-LATTICE-001 satisfied"] };
  },
};
```

- Read everything from `ctx`; write nothing.
- Stable rule IDs per check (`IFC-EXTERNAL-EGRESS-001`), stable across runs (SPEC §14).
- `authorize` may be sync; `Promise` allowed for a future LLM-backed policy — runner `await`s uniformly.

## 4. Label lattice (SPEC §8 A4)

```ts
const CONF_ORDER = ["PUBLIC", "INTERNAL", "CONFIDENTIAL", "SECRET"] as const;
export const joinConf = (...xs: Conf[]) => xs.reduce((a, b) =>
  CONF_ORDER.indexOf(a) >= CONF_ORDER.indexOf(b) ? a : b, "PUBLIC");

const INT_ORDER = ["TRUSTED", "UNTRUSTED"] as const; // join = max index
```

Derived values: `label(derived) = join(labels(sources))` — implemented as a `LabelUpdatedEvent` with `causalParents` pointing at source result events (SPEC §7).

## 5. Capability attenuation (SPEC §8 A5)

```ts
export function attenuate(parent: Capability, child: Capability): boolean {
  if (parent.action !== child.action) return false;          // same action
  return isNarrower(child.constraints, parent.constraints);  // ∀ parent bounds ⊇ child bounds
}
```

- Widening → `CapabilityChangedEvent` is never emitted for it; the delegation step itself is denied by A5.
- Runtime-effect layer: `python.exec` proposes modeled effects (`network.post`, `environment.read`, `filesystem.read`); each is checked against the capability's `runtimeRestrictions` before the simulated effect "occurs" (SPEC §8).

## 6. Scenario execution (SPEC §10)

Scenarios are data: `steps[]` with `tool` | `derive` | `approve` step types. The runner walks steps, feeds proposals to the reference monitor, records events. Scenario definitions never contain branching logic — `expectedOutcomes` per policy level is a table the e2e tests assert against (SPEC §9).

## 7. Causal graph reconstruction (SPEC §7)

`graph.json` is produced by `buildGraph(events)`:

- Every event → node (type = event type).
- `causalParents` → `caused_by` edges.
- `derive` step → `derived_from` edges to source result nodes.
- Tool read/write of fixture entities → `read_from` / `writes_to` edges (fixture entity ids).
- `PolicyEvaluatedEvent` → `authorized_by` edge from the execution event; delegation steps → `delegated_from`.

Unit test: `buildGraph(parseEvents(jsonl))` deep-equals `graph.json` written during the run.
