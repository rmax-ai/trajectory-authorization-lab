# Roadmap

> Delivery view. Implementation order (stage-by-stage with tests at each boundary) lives in `docs/roadmap.md` (SPEC §20). This file tracks shipped milestones.

## v0.1.0 — Core harness (stages 1–9)

- [ ] Zod schemas + append-only event log (SPEC §4, §6)
- [ ] Deterministic fixtures: crm, billing; Slack → run artifacts; simulated `python.exec` effects (SPEC §5)
- [ ] Execution runner + structural reference monitor + run artifact writer (SPEC §18)
- [ ] A0 Tool ACL
- [ ] A1 argument ABAC
- [ ] Task contracts + A2 (immutable)
- [ ] Trajectory/budget state + A3
- [ ] Causal graph reconstruction + label lattice + A4
- [ ] Capability attenuation + runtime-effect layer + A5

## v0.2.0 — Evidence + inspection (stages 10–13)

- [ ] Scenario suite S1–S6 × {legitimate, adversarial} with per-level expected outcomes
- [ ] Metrics + `pnpm experiment report` → `artifacts/reports/latest.{json,md}`
- [ ] Next.js inspection UI (`/`, `/runs`, `/runs/[id]`, `/scenarios`, `/policies`)
- [ ] README, docs/extending.md
- [ ] `docs/findings.md` from measured runs only (SPEC §21)

## Future (explicitly optional)

- Tiny policy DSL for A3 predicates (SPEC §8)
- LLM adapter (OpenAI/Anthropic/Gemini/mock) behind the reserved interface (SPEC §3)
- Hash-chained artifact integrity
- Cross-run budget accumulation
- Interactive HITL for REQUIRE_APPROVAL

## Definition of done (SPEC §21)

Six scenarios run locally · A0–A5 implemented · outcomes differ materially across levels · immutable event log per run · graph reconstructable from persisted artifacts · decisions carry evidence + explanations · metrics from real runs · UI inspects trajectories and decisions · `pnpm test` + `pnpm experiment run-all` green · README states claims/limits · zero real side effects, zero unrestricted code execution.
