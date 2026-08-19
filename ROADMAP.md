# Roadmap

> Delivery view. Implementation order (stage-by-stage with tests at each boundary) lives in `docs/roadmap.md` (SPEC §20). This file tracks shipped milestones.

## v0.1.0 — Core harness (stages 1–9) ✅

- [x] Zod schemas + append-only event log (SPEC §4, §6)
- [x] Deterministic fixtures: crm, billing; Slack → run artifacts; simulated `python.exec` effects (SPEC §5)
- [x] Execution runner + structural reference monitor + run artifact writer (SPEC §18)
- [x] A0 Tool ACL
- [x] A1 argument ABAC
- [x] Task contracts + A2 (immutable, structurally frozen)
- [x] Trajectory/budget state + A3
- [x] Causal graph reconstruction + label lattice + A4
- [x] Capability attenuation + runtime-effect layer + A5

## v0.2.0 — Evidence + inspection (stages 10–13)

- [x] Scenario suite S1–S6 × {legitimate, adversarial} with per-level expected outcomes (e2e matrix green)
- [x] Metrics + `pnpm experiment report` → `artifacts/reports/latest.{json,md}`
- [ ] Next.js inspection UI (`/`, `/runs`, `/runs/[id]`, `/scenarios`, `/policies`) — in progress (story 4.11)
- [x] README, docs/extending.md
- [x] `docs/findings.md` from measured runs only (SPEC §21)

## Future (explicitly optional)

- Tiny policy DSL for A3 predicates (SPEC §8)
- LLM adapter (OpenAI/Anthropic/Gemini/mock) behind the reserved interface (SPEC §3)
- Policy composition: run A2+A3+A4+A5 as a combined monitor (union would catch 6/6 — see findings.md)
- Hash-chained artifact integrity
- Cross-run budget accumulation
- Interactive HITL for REQUIRE_APPROVAL

## Definition of done (SPEC §21)

Six scenarios run locally · A0–A5 implemented · outcomes differ materially across levels · immutable event log per run · graph reconstructable from persisted artifacts · decisions carry evidence + explanations · metrics from real runs · UI inspects trajectories and decisions · `pnpm test` + `pnpm experiment run-all` green · README states claims/limits · zero real side effects, zero unrestricted code execution.
