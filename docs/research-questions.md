# Research Questions

> From SPEC.md §2. Each question is bound to the experiment machinery that can answer it, so `docs/findings.md` is written from measurements, not assertions.

## Primary

**RQ0** — What security properties become enforceable when authorization moves from individual tool calls to stateful execution trajectories?

*Measured by:* the A0→A5 outcome matrix across all scenarios — which attack classes flip from ALLOW to DENY at which policy level, and at what cost (metrics).

## Secondary

| ID | Question | Observable via |
|---|---|---|
| RQ1 | Which attacks remain invisible to tool ACLs? | Scenarios where A0 allows and the adversarial run succeeds |
| RQ2 | Which attacks become detectable with argument-aware ABAC? | Scenarios where A1 flips A0's result |
| RQ3 | What additional protection comes from task contracts? | A2 vs A1 delta (esp. Scenario 4) |
| RQ4 | Which attacks require historical state? | A3 vs A2 delta (esp. Scenarios 1, 2, 3) |
| RQ5 | Which attacks require explicit provenance/IFC? | A4 vs A3 delta (esp. Scenario 1, 5 integrity label) |
| RQ6 | What operational cost does richer policy state introduce? | Per-level metrics: median decision latency, policy state size, event/graph counts |
| RQ7 | Can the same event representation support authorization, observability, and offline evaluation? | Architecture property: policy consumes the same persisted graph that the UI renders and reports replay (SPEC §19) |

## Expected outcome matrix (hypotheses to be verified by runs)

Measured results (seed 42, 72 runs) live in `docs/findings.md` and supersede this table. The suite asserted these expectations in e2e (`packages/scenarios/src/e2e.test.ts`) and all held:

| Scenario | A0 | A1 | A2 | A3 | A4 | A5 |
|---|---|---|---|---|---|---|
| S1 read-read-exfiltration | allow | allow | deny | deny | deny | deny |
| S2 refund-drain | allow | allow | allow | deny | allow | allow |
| S3 cross-tenant | allow | allow | allow | deny | allow | deny |
| S4 prompt-injection | allow | allow | deny | allow | deny | allow |
| S5 exec-bypass | allow | allow | allow | allow | allow | deny |
| S6 attenuation | allow | allow | allow | allow | allow | deny |

Measured results supersede this table — see `docs/findings.md`.

## Findings format (docs/findings.md, SPEC §21)

Every conclusion must be tagged exactly one of:
- **Demonstrated by this PoC** — supported by measured run output in this repository.
- **Supported by prior theory** — established literature (see `docs/research/prior-work.md`), not re-measured here.
- **Not yet solved** — open, explicitly out of scope.
