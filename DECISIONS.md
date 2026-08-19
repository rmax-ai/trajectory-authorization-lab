# Decisions

Design rationale. What was chosen, why, what was rejected.

## D1 — pnpm monorepo, 5 packages (not 12)

SPEC §16 sketches `packages/authorization/a0-tool-acl/…` as separate directories. We keep those as **modules inside one `@tacl/authorization` package**. Twelve workspace packages would multiply config files (tsconfig, package.json, vitest config each) without adding boundaries — the policies share schemas and the registry. SPEC explicitly permits the simpler layout. *Rejected:* per-policy packages (config overhead), single flat package (no enforcement of the core↔authorization↔scenarios dependency direction).

## D2 — Source-consumed packages, no build step

Packages ship TS source; `tsx` runs the CLI, Vitest transforms tests, Next.js `transpilePackages` handles the web app. `tsc --noEmit` per package is the type gate. *Rejected:* `tsc --build` emit + dist/ everywhere — build artifacts would need to be deterministic too, and rebuild loops on a 2-core machine are slow. Adopt emit later only if the repo grows.

## D3 — Policies as plain TS functions (no DSL, no Rego)

SPEC §8 allows "a tiny policy DSL later". v1 policies are pure functions over `AuthorizationContext`. *Rejected:* Rego (external dependency, interpreter semantics to pin for determinism) and a custom DSL (a second language to test). The policy *module* boundary is the extension point — see `docs/extending.md`.

## D4 — Event-sourced state, no live mutable policy state

Budgets/labels/capabilities are projections folded from the event log, recomputed in `AuthorizationContext` assembly. *Rejected:* mutable per-run state objects — they drift from the log, break replay, and hide state changes from inspection. Cost: projection is O(events) per evaluation; acceptable at PoC scale (tens of events per run) and keeps `PolicyEvaluatedEvent` self-contained.

## D5 — Deterministic pseudo-agent, no LLM in core

Adversarial scenarios encode the injected observation + malicious proposal directly (SPEC §9 Scenario 4). The "agent" is the scenario's step list. *Rejected:* an LLM adapter as a core dependency — nondeterministic, needs API keys, and would make results unreproducible. Adapter interface reserved (SPEC §3), mock model only if added.

## D6 — Simulated tools, including `python.exec`

All tools are fixture-backed functions; Slack writes to run artifacts; `python.exec` models effects (`filesystem.read`, `network.connect`, `network.post`, `environment.read`) and never executes. *Rejected:* real subprocess sandboxing — explicitly a non-goal (SPEC §17); the modeled-effect layer still demonstrates the tool-vs-runtime-effect distinction (SPEC §8 A5).

## D7 — Two timestamp domains

Event `timestamp` is wall-clock metadata (required by SPEC §6). Decision logic reads only an injected `Clock`; tests inject fixed values. Determinism guarantee applies to **outcomes and event structure**, not timestamps. *Rejected:* fully fixed timestamps everywhere (uninformative for a research UI), and using `Date.now()` freely (breaks replay).

## D8 — `artifacts/` gitignored

Runs are reproducible by re-execution (`pnpm experiment run-all`); committing generated outputs invites drift and merge noise. Reports are regenerated from run artifacts. *Rejected:* committing example runs (stale almost immediately during development).

## Known limitations (honest section)

- Artifacts have no hash chaining — append-only is enforced by construction, not cryptographically (docs/threat-model.md, cross-cutting).
- Label tracking is explicit-structured only; no semantic taint through model latent state (SPEC §8/§17).
- REQUIRE_APPROVAL records an event and auto-continues per scenario config; no interactive HITL.
- No cross-run state (budgets are per-run, per SPEC §8 A3).
