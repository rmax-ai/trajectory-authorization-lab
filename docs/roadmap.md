# Roadmap

> Implements SPEC.md §20 sequence. Rule: tests pass at every stage boundary (SPEC §20 "After each stage, ensure tests pass").

| Stage | Deliverable | Source |
|---|---|---|
| 1 | Zod schemas for all §4 types + event log (append-only, JSONL) | SPEC §4, §6 |
| 2 | Deterministic tool fixtures: crm, billing, slack (artifact-persisted), simulated `python.exec` effect model | SPEC §5 |
| 3 | Execution runner + reference monitor structural invariant; `AuthorizationContext` assembly; run artifact writer | SPEC §18, §6 |
| 4 | A0 tool ACL + scenario e2e harness | SPEC §8 |
| 5 | A1 argument ABAC | SPEC §8 |
| 6 | Task contracts + A2 (immutability enforced) | SPEC §8 |
| 7 | Trajectory/budget state + A3 | SPEC §8 |
| 8 | Causal graph reconstruction + label lattice + A4 | SPEC §7, §8 |
| 9 | Capability attenuation + runtime-effect layer + A5 | SPEC §8 |
| 10 | Full scenario suite: S1–S6 × legitimate/adversarial, expected-outcome assertions per level | SPEC §9, §15 |
| 11 | Metrics + `pnpm experiment report` → `artifacts/reports/latest.{json,md}` | SPEC §11–§12 |
| 12 | Next.js inspection UI: `/`, `/runs`, `/runs/[id]`, `/scenarios`, `/policies` | SPEC §13 |
| 13 | README, docs/extending.md, findings.md from measured runs | SPEC §17, §21 |

## Definition of done (SPEC §21)

All six scenarios run locally · A0–A5 all implemented · outcomes differ materially across levels · every run produces an immutable event log · graph reconstructable from persisted artifacts · decisions carry evidence + explanations · metrics from real runs · UI inspects trajectories + decisions · `pnpm test` green · `pnpm experiment run-all` works · README states claims/limitations · zero real side effects, zero unrestricted code execution.

## Out of scope (first version)

- LLM adapter (interface reserved, mock only) — SPEC §3
- Policy DSL — SPEC §8
- Interactive HITL approval — REQUIRE_APPROVAL recorded as event, auto-continue per scenario config
- Semantic taint detection — SPEC §8, §17
- Hash-chained artifact integrity
