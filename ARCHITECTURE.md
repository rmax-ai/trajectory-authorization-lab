# Architecture (concise)

> Formal depth: `docs/architecture.md` (components, trust boundaries, data model) and `SPEC.md` §4/§18. This file is the quick orientation.

## Problem

Individually authorized agent actions can compose into unauthorized computation: `crm.read` → `billing.read` → `slack.external_post` passes every per-call check and exfiltrates PII. Security failures emerge from *composition, history, provenance, cumulative state* — not from any single bad call.

## Design goals

Make that gap experimentally visible: same workloads, progressively richer authorization (A0 ACL → A5 capabilities+IFC), deterministic local runs, explainable decisions, measurable costs.

## Shape

```
Scenario (declarative steps, deterministic pseudo-agent)
   │ proposed ToolCall
   ▼
Reference Monitor ── policy ── event log ──▶ graph ──▶ metrics/report
   │                  (pure fns)  (append-only) (derived)    │
ALLOW / DENY / REQUIRE_APPROVAL                              ▼
   │                                                   apps/web (read-only)
   ▼
Simulated tools (fixture-backed, zero side effects)
```

One structural invariant: tools are reachable only through the monitor (`packages/core` never exports the tool registry).

## Module layout

| Module | Role |
|---|---|
| `@tacl/core` | events, graph, runtime, tools |
| `@tacl/authorization` | A0–A5 interchangeable policies + registry |
| `@tacl/scenarios` | scenario DSL + S1–S6 definitions |
| `@tacl/experiments` | deterministic runner, metrics, reports |
| `@tacl/web` | Next.js inspection UI (`/`, `/runs`, `/runs/[id]`, `/scenarios`, `/policies`) |
| `fixtures/` | deterministic crm/billing data |
| `artifacts/` | `runs/<id>/{run.json,events.jsonl,graph.json,decisions.jsonl,metrics.json}`, `reports/latest.{json,md}` |

## Key trade-offs (decided, see DECISIONS.md)

- Policy functions in TS, not Rego/DSL — determinism, small surface, testability; DSL is an explicit later option.
- Event-sourced projections instead of mutable state — tamper-visibility and replay for free.
- Simulated `python.exec` instead of a real sandbox — demonstrates the tool-vs-effect gap without the non-goal of sandbox engineering.
- 5-package workspace, source-consumed — no build step for packages; small machine friendly.

## Data flow

1. Runner materializes scenario steps → proposed actions.
2. Monitor assembles `AuthorizationContext` (trajectory, graph, provenance, labels, budgets, capabilities).
3. Policy returns decision with reasons + evidence → `PolicyEvaluatedEvent`.
4. ALLOW → tool runs against fixtures → `ToolExecutedEvent` + `ToolResultEvent` (labels declared).
5. Every event appends to `events.jsonl`; graph/state are projections; metrics close the run.
