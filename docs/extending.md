# Extending the Lab

The project's core value is that adding a policy, tool, or scenario is mechanical. Conventions below.

## Adding a policy

1. Create `packages/authorization/<id>/`.
2. Implement `AuthorizationPolicy` (SPEC §4): `{ id: string; authorize(context): PolicyDecision | Promise<PolicyDecision> }`.
3. Decisions MUST include `reasons: string[]` with a stable policy ID per rule (SPEC §14, e.g. `IFC-EXTERNAL-EGRESS-001`); DENY on state evidence should include `evidence` event ids.
4. Register in the policy registry (used by `--policy <id>` and the A0–A5 ladder ordering).
5. Add a unit test + ensure every scenario e2e still passes; update the expected-outcome matrix in `docs/research-questions.md` if behavior shifts.

**Constraint:** policies read from `AuthorizationContext` only — never from the runtime, agent loop, or process globals. The monitor owns state; policies are pure functions of context.

## Adding a tool

1. Implement in `packages/core/tools/`: deterministic, fixture-backed only.
2. Declare output labels (SPEC §8 A4) and modeled runtime effects if the tool is an executor-like generic capability (SPEC §5).
3. No host I/O, no network. Slack persists into run artifacts; `python.exec` is an effect simulator.
4. Add to ACL fixture data + unit tests.

## Adding a scenario

1. Add a `Scenario` object per the DSL (SPEC §10): `steps` only — no logic in the runner.
2. Every scenario needs a `legitimate` and `adversarial` variant and an expected outcome per policy level (SPEC §9).
3. Add e2e assertions: `toAllowAttack()` / `toBlockAttack()` style (SPEC §15).
4. Register in the catalog (`/scenarios` UI picks it up automatically).

## Adding a label level

- Confidentiality: extend the lattice (must remain a total order for the join to stay trivial), update tool/sink declarations, lattice unit tests.
- Integrity: add level, declare which tools emit it, decide join rules — document in architecture.md.

## Invariants (do not break)

1. Agent code never imports a tool directly; only the runtime executes tools, and only after ALLOW (SPEC §18).
2. Event log is append-only and is the source of truth; graph is a reconstruction (SPEC §19).
3. Determinism: no wall-clock in decisions, no unseeded randomness.
4. Core experiments run with zero network access (SPEC §3, §21).
