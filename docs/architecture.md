# Architecture

> Derived from SPEC.md §4–§8, §18–§19. Authoritative where they conflict: SPEC.md.

## Overview

Trajectory Authorization Lab is a deterministic, local, framework-free research harness that runs the same agent workloads against six progressively richer authorization strategies (A0–A5) to make the gap between *tool authorization* and *computation authorization* experimentally visible.

One executable invariant shapes everything: **the agent never invokes tools directly.** Every consequential action is a proposed action that passes through the Reference Monitor, which renders ALLOW / DENY / REQUIRE_APPROVAL from state the monitor alone owns. This is enforced structurally — the tool registry is only reachable through the runtime's `execute` path, which always consults policy.

## Components

```
packages/core/
  events/     immutable event log (SPEC §6) — canonical source of truth
  graph/      causal graph reconstructed from events (SPEC §7)
  runtime/    agent loop, reference monitor, execution of approved actions
  tools/      deterministic simulated tools + fixture-backed data (SPEC §5)
packages/authorization/
  a0-tool-acl/ ... a5-capabilities/   interchangeable AuthorizationPolicy impls (SPEC §8)
packages/scenarios/    declarative scenario DSL (SPEC §10)
packages/experiments/  runner, metrics, report generation (SPEC §11–§12)
apps/web/              Next.js inspection UI (SPEC §13)
fixtures/              crm/, billing/ deterministic data
artifacts/             runs/<run-id>/…, reports/latest.{json,md}
```

## Request lifecycle

1. Scenario steps (or a deterministic pseudo-agent) emit a proposed `ToolCall`.
2. Runtime builds an `AuthorizationContext` from: principal, immutable task contract, proposed action, trajectory, causal graph, provenance, labels, budgets, capabilities (SPEC §4).
3. The active policy returns a `PolicyDecision` with outcome + reasons + evidence (SPEC §14).
4. ALLOW → tool executes against fixtures, result event appended with declared labels. DENY → blocked event recorded, run continues. REQUIRE_APPROVAL → approval event recorded.
5. Every step appends immutable events; the graph is derived from the event stream, never the reverse.

## Trust boundaries

| Boundary | Crossing rule |
|---|---|
| Agent → tools | Structural: only via reference monitor |
| Tool → host | None. All tools simulated; Slack persists to run artifacts; `python.exec` models effects, executes nothing (SPEC §5) |
| Task contract → agent | Immutable during run; agent cannot self-modify (SPEC §8 A2) |
| Parent capability → child | Attenuation only — child may narrow, never widen (SPEC §8 A5) |
| Tool authorization → runtime effects | Separate layer: `python.exec` may be tool-authorized while its modeled `network.post` is denied at effect level (SPEC §8 A5) |
| Confidentiality → sinks | Label join of derived-value sources must be ≤ sink allowance (SPEC §8 A4) |

## Data model

- **Event** (`SPEC §6`): `{id, runId, sequence, timestamp, type, causalParents, data}` — append-only, JSONL-persisted per run.
- **Run artifact layout** (`SPEC §6`): `run.json`, `events.jsonl`, `graph.json`, `decisions.jsonl`, `metrics.json`.
- **Graph** (`SPEC §7`): nodes = user input, proposals, decisions, executions, results, derived values; edges = `caused_by`, `derived_from`, `read_from`, `writes_to`, `authorized_by`, `delegated_from`. No token-level lineage.
- **Labels** (`SPEC §8 A4`): confidentiality lattice `PUBLIC < INTERNAL < CONFIDENTIAL < SECRET`; integrity `TRUSTED`/`UNTRUSTED`. `join()` of source labels propagates through derived values.
- **Capability** (`SPEC §8 A5`): `{action, constraints}`; monotone narrowing.

## Non-negotiables

1. Event log is the single source of truth; all other artifacts are projections.
2. Graph reconstruction must be possible from `events.jsonl` alone (SPEC §19 — the graph is reusable for security, evals, observability, debugging; not coupled to any policy).
3. Determinism: same seed/config → identical artifact bytes. No wall-clock in decision logic; no `Math.random()` without an injected seed.
4. No LLM required for any core experiment (SPEC §3). Optional adapter interface only.
5. No network egress, no real side effects, no unrestricted code execution (SPEC §21).

## Open questions

- Approval path (REQUIRE_APPROVAL): modeled as event, no interactive HITL in PoC. Record and auto-continue per scenario config.
- Policy DSL (SPEC §8 A3 "optionally later") — out of scope for first implementation.
