# Trajectory Authorization Lab

An executable security experiment. The same agent workloads run against six progressively stronger authorization models — from per-call tool ACLs to capability + information-flow control — to make one claim experimentally visible: **per-call authorization is insufficient for autonomous agents, because security failures emerge from the composition, history, provenance, and cumulative state of otherwise valid actions.**

## Problem

Individually authorized actions can compose into unauthorized computation:

```
crm.read(customer=123)          ✅ every call passes
billing.read(customer=123)      ✅ every call passes
slack.external_post(summary)    ✅ every call passes
                                ❌ composed: PII → public channel
```

Each tool call is fine in isolation. The computation as a whole is exfiltration. Static per-tool policies (MCP-style ACLs, per-call ABAC) cannot see this, because the violation lives in the *trajectory*: what was read, what it derived, where it flows.

## Hypothesis

Security improves when authorization decisions receive execution history and provenance — when the decision boundary moves from *tool calls* to *computations*. Richer policy state (task contracts, trajectory budgets, information-flow labels, attenuated capabilities) closes attack classes that per-call checks cannot see, at a measurable cost in latency and state.

## Experiment

Six attack scenarios (each with a legitimate and adversarial variant) run against six policies:

| Policy | Sees | Catches |
|---|---|---|
| A0 Tool ACL | principal → tool | — |
| A1 Argument ABAC | + argument ranges | oversized single calls |
| A2 Task contract | + declared purpose/capabilities | off-task actions, prompt-injection drift |
| A3 Trajectory | + history, cumulative budgets | refund drain, cross-tenant writes, exfil sequences |
| A4 Information flow | + labels, provenance joins | CONFIDENTIAL → PUBLIC sinks, untrusted inputs |
| A5 Capabilities + runtime effects | + attenuation, effect-level checks | privilege widening, exec-driven egress |

Every run produces an immutable event log and causal graph; every decision carries reasons and evidence; metrics (attack prevented, false positives, decision latency, state overhead) are generated from real runs — never fabricated.

## Quickstart

```bash
pnpm install
pnpm test                       # unit + e2e scenario matrix
pnpm experiment run read-read-exfiltration --all-policies
pnpm experiment run-all         # full matrix → artifacts/runs/
pnpm experiment report          # → artifacts/reports/latest.{json,md}
pnpm --filter web dev           # inspection UI → http://localhost:3000
```

Requirements: Node.js ≥ 20, pnpm ≥ 9. Everything runs locally; no API keys, no network, no LLM.

## Non-goals

This project does **not** claim to solve:

- arbitrary semantic information-flow tracking through LLM latent states;
- production-grade sandboxing (the Python tool is a simulated effect model);
- complete formal verification of policies;
- real enterprise identity federation;
- production MCP infrastructure.

## Documentation

- `SPEC.md` — ground-truth specification (cite sections)
- `docs/architecture.md` — components, trust boundaries, data model
- `docs/threat-model.md` — the six attacks as threats
- `docs/research-questions.md` — RQs + how experiments answer them
- `docs/research/prior-work.md` — the literature this builds on
- `docs/findings.md` — conclusions from measured runs only
- `docs/extending.md` — add a policy, tool, or scenario
- `AGENTS.md` + `TS_*.md` — engineering conventions
- `DECISIONS.md` — design rationale; `ROADMAP.md` — delivery state

## Status

All six policies, six scenario pairs, the e2e matrix, the experiment CLI, and the inspection UI ship and pass `pnpm test` (200+ tests). Measured findings: `docs/findings.md`. Companion artifact for the article *From Tool Authorization to Computation Authorization*. Research harness, not a production platform — inspectability, determinism, and a small code surface over feature breadth.

## License

MIT
