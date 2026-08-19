# Prior Work

> Source list for `docs/findings.md` — the "supported by prior theory" tag draws from here. Categories map to the A0–A5 ladder.

## Foundations (classical)

| Work | What it contributes |
|---|---|
| Denning, *A Lattice Model of Secure Information Flow*, CACM 1976 | Lattice of security classes, class-combining operator ⊕ = label join. The A4 label lattice is a direct instance. |
| Bell & La Padula, *Secure Computer System*, MITRE 1976 | Ordered sensitivity levels; confidentiality "no read up / no write down". Basis of sink-allowance checks. |
| Biba, *Integrity Considerations for Secure Computer Systems*, 1977 | Integrity lattice (no read down / no write up). Basis of the TRUSTED/UNTRUSTED axis. |
| Myers & Liskov, *A Decentralized Model for Information Flow Control*, SOSP 1997 | Decentralized declassification, fine-grained labels. |
| Zeldovich et al., *Making Information Flow Explicit in HiStar*, OSDI 2006 | Kernel-level DIFC with explicit taint; minimal trusted code. Model for "labels on results, join at derivation". |
| Dennis & Van Horn, *Programming Semantics for Multiprogrammed Computations*, CACM 1966 | Capability-based security: unforgeable references, no ambient authority. Basis of A5. |
| Miller, Yee, Shapiro, *Capability Myths Demolished*, 2003 | Capability revocation/attenuation critique; confinement properties. |
| NIST SP 800-162, *ABAC*, 2014 | Attribute-based access control standard — A1's reference model. |
| W3C PROV-DM, 2013 | Provenance data model: entities/activities/derivation. Shapes the causal graph edge vocabulary (`derived_from`, etc.). |

## Recent agent-specific work (2024–2026)

| Work | Relationship to this project |
|---|---|
| DSCC — *Securing Multi-Tool AI Agent Chains With Dynamic, Real-Time Compositional Policies* (arXiv 2607.03423) | Closest prior art: session-level monotonic taint state, most-restrictive-set policy composition, blocks chains whose aggregate effective permission exceeds any constituent policy. Complementary: we compare *policy models* (A0–A5) on identical workloads rather than composing per-tool policies. |
| Conseca — *Contextual Agent Security: A Policy for Every Purpose* (arXiv 2501.17070) | Just-in-time task-scoped policies with deterministic enforcement; explicitly names *trajectory constraints* (multi-step predicates) as future work — the gap A3 occupies. |
| Progent — *Securing AI Agents with Privilege Control* (arXiv 2504.11703) | Per-step privilege policies; SMT-decided narrowing vs. expansion; monotonic confinement under prompt injection. Directly corresponds to A2 + A5 (task contract + attenuation), with a learned policy updater we deliberately replace with deterministic fixtures. |
| AWS Bedrock AgentCore — *Temporal Policies* (AWS blog, 2025) | Production trajectory-aware authorization at a gateway perimeter: cumulative budget caps, output-to-input integrity, workflow ordering, approval-event HITL, time-decaying trust. Demonstrates A3-style statefulness in shipped infrastructure; our harness measures its cost. |
| AgentGuardian (arXiv 2601.10440) | Learns control-flow-graph policies from benign traces. Alternative path to A3 (validated trajectories) — noted, not implemented. |
| Greshake et al., *Indirect Prompt Injection* (arXiv 2302.12173) | Threat source for Scenario 4: untrusted tool output steering agent behavior. |
| OPA / Rego (CNCF) | Policy-as-code engine; Rego's decidable subset is the standard for attribute/state predicates. We use plain TS functions instead (determinism + small surface); Rego remains the production counterpart. |

## Positioning

This project's delta vs. the above: (1) a *single deterministic harness* that runs identical workloads against a graded ladder of policies to *measure* what each increment buys — attack coverage, false positives, latency, state overhead; (2) an authorization-neutral event graph (SPEC §19) explicitly designed for reuse across security, evals, and observability; (3) structural enforcement of the reference-monitor invariant rather than framework-level integration.
