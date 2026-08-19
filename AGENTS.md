# AGENTS.md — Trajectory Authorization Lab

Hub for agents (Codex, Droid, subagents) working on this repo. Read this first. Depth lives in the companion docs (`TS_*.md`) and `docs/`.

## Project DNA

Research harness, not production platform. The deliverable is **experimental evidence**: the same adversarial/legitimate workloads run against six authorization strategies (A0–A5) must produce materially different, explainable, measurable outcomes. Spec is ground truth: `SPEC.md` — cite its sections in commit messages/PRs.

Three values, in order: **determinism, inspectability, small surface.** Prefer the standard library; no agent frameworks; no DB; no network.

## Non-negotiables (SPEC §18–§19, §21)

1. **Reference monitor invariant:** agent/scenario code NEVER imports or calls a tool directly. Tools execute only via `runtime.execute()`, which always evaluates policy first. Enforced structurally: the tool registry is not exported outside `packages/core`; `execute` is the only public path.
2. **Event log is the source of truth.** Every consequential action appends an immutable event. Budgets/labels/capabilities are *projections* computed by folding events — never independent mutable state.
3. **Graph is derived from events**, never the reverse. `graph.json` must be reconstructable from `events.jsonl` alone (SPEC §19).
4. **Zero side effects.** No host I/O beyond `artifacts/`, no network, no subprocess execution. `python.exec` is a simulated effect model (SPEC §5).
5. **Determinism.** No `Date.now()`/`Math.random()` inside decision logic. Inject `Clock` and `Rng` (seeded). Timestamps are metadata only.
6. **Core experiments run without any LLM.** An optional adapter interface may exist; nothing in `packages/core|authorization|scenarios` may depend on it.
7. **Policy decisions carry `reasons[]` with stable policy IDs** (e.g. `IFC-EXTERNAL-EGRESS-001`) and `evidence` event ids on state-based denies (SPEC §14).

## Repo layout & dependency direction

```
apps/web                Next.js inspection UI (reads artifacts, imports types only)
packages/core           events, graph, runtime, tools        — no internal deps
packages/authorization  a0–a5 policy modules + registry      — depends on core
packages/scenarios      DSL + scenario definitions           — depends on core
packages/experiments    runner CLI, metrics, reports         — depends on all above
fixtures/               crm/, billing/ JSON data (read by core tools)
artifacts/              generated runs + reports (gitignored except .gitkeep)
docs/                   SPEC-derived docs; SPEC.md is authoritative
```

Dependency direction is strict: `core ← authorization ← scenarios ← experiments`. `apps/web` imports types from `core`/`scenarios` and reads `artifacts/` — never imports `experiments`. Violations break `pnpm typecheck`.

## TypeScript conventions

- Strict mode everywhere (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`).
- **Zod for every serialized shape** (events, decisions, run config); TS types derived via `z.infer`. No hand-written type drift.
- Discriminated unions for events (`type: "ToolExecutedEvent"` literal + data).
- No `enum`; use `as const` unions.
- No `any`; `unknown` + validation at boundaries.
- Policies are **pure functions** of `AuthorizationContext` (SPEC §4): `authorize(ctx) => PolicyDecision`. No closures over runtime state, no I/O in policies.
- New files: `camelCase` for modules, `kebab-case` for directories.

## Testing (SPEC §15)

- Vitest, co-located `*.test.ts`. Root `pnpm test` runs the whole workspace.
- Unit: label lattice joins, provenance propagation, cumulative budgets, task immutability, capability attenuation, policy ordering, graph reconstruction, deterministic replay.
- E2E (in `packages/experiments`): every scenario × every policy level with expected-outcome assertions (`toAllowAttack()` / `toBlockAttack()` / `toSucceedLegit()`).
- A run is deterministic: same seed + config → identical `events.jsonl` bytes (timestamps excepted).

## Commands

```bash
pnpm test          # workspace vitest
pnpm typecheck     # tsc --noEmit over packages
pnpm experiment run <scenario> --policy a0      # single run
pnpm experiment run-all                         # full matrix
pnpm experiment report                          # regenerate reports from artifacts
pnpm --filter web dev                           # inspection UI
```

## Error handling

- Policy problems are **decisions, not exceptions**: DENY/REQUIRE_APPROVAL with reasons.
- Runtime faults become `ToolResultEvent { outcome: "error" }` — never crash the run; the run must always persist.
- Zod parse failures at artifact boundaries: fail the experiment command with a clear message, never silently coerce.

## Documentation

- `SPEC.md` is ground truth; docs derive from it. Any doc contradicting SPEC.md is wrong.
- Add/extend `docs/extending.md` when adding policies/tools/scenarios.
- Findings (`docs/findings.md`) are written from `artifacts/reports/latest.json` only — no fabricated numbers, ever.

## References

- `TS_DEVELOPMENT.md` — idioms, zod/vitest patterns, determinism utilities
- `TS_ARCHITECTURE.md` — workspace mechanics, tsconfig strategy, Next.js wiring
- `TS_SYSTEM_DESIGN_PATTERNS.md` — reference monitor, event-sourced state, lattice, attenuation
- `docs/architecture.md`, `docs/threat-model.md`, `docs/extending.md`
