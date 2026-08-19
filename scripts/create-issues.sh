#!/usr/bin/env bash
# Creates the full issue board for trajectory-authorization-lab.
# Idempotent-ish: each issue echoes its URL; rerun creates duplicates, so check output.
set +e
R="rmax-ai/trajectory-authorization-lab"
O=$(mktemp -d)

cat > "$O/plan.md" << 'BODY'
## Project Plan

Tracks the full lifecycle of **Trajectory Authorization Lab** — the research harness companion to the article *From Tool Authorization to Computation Authorization*.

Ground truth: `SPEC.md`. Engineering conventions: `AGENTS.md` + `TS_*.md`. Delivery order: `docs/roadmap.md`.

### Phases
- Phase 0: Scope and Architecture — done (spec extraction, docs)
- Phase 1: Research — done (prior-work catalog: DSCC, Progent, Conseca, AgentCore temporal policies, Denning lattice, capabilities, DIFC)
- Phase 2: Supporting Files — done (AGENTS.md hub, TS companion docs, pnpm scaffold)
- Phase 3: GitHub Setup — done (repo, labels, this board)
- Phase 4: Implementation — 12 stories, stages from SPEC 20
- Phase 5: Verification — hard gates, claims audit, release
- Phase 6: Website — landing page

### Acceptance Criteria (SPEC 21)
- [ ] Six scenarios execute locally; A0-A5 implemented; outcomes differ materially across levels
- [ ] Every run: immutable event log; graph reconstructable from persisted artifacts
- [ ] Decisions carry evidence and explanations; metrics from real runs
- [ ] `pnpm test` and `pnpm experiment run-all` pass
- [ ] UI inspects trajectories and decisions
- [ ] README states claims and limitations; zero real side effects; zero unrestricted code execution
- [ ] docs/findings.md from measured runs only
BODY

cat > "$O/p0.md" << 'BODY'
## Phase 0: Scope and Architecture

**Status: DONE** — completed during kickoff session 2026-08-19.

### Deliverables
- [x] Project identity: name `trajectory-authorization-lab`, rmax-ai, public, MIT
- [x] SPEC.md (verbatim ground truth)
- [x] docs/architecture.md, docs/threat-model.md, docs/research-questions.md, docs/roadmap.md, docs/extending.md
- [x] ARCHITECTURE.md (concise), DECISIONS.md, ROADMAP.md

### Reference
Skill: `fp-phase-0-scope`
BODY

cat > "$O/p1.md" << 'BODY'
## Phase 1: Research

**Status: DONE** — completed during kickoff session 2026-08-19 (direct execution, no planner subagent — machine under memory pressure from other sessions).

### Deliverables
- [x] docs/research/prior-work.md: Denning lattice (1976), Bell-LaPadula, Biba, Myers-Liskov DIFC, HiStar, Dennis-Van Horn capabilities, NIST ABAC, W3C PROV, OPA/Rego
- [x] Agent-specific prior work: DSCC (arXiv 2607.03423), Conseca (2501.17070), Progent (2504.11703), AWS AgentCore temporal policies, AgentGuardian (2601.10440), Greshake indirect prompt injection

### Reference
Skill: `fp-phase-1-research`
BODY

cat > "$O/p2.md" << 'BODY'
## Phase 2: Supporting Files

**Status: DONE** — completed during kickoff session 2026-08-19.

### Deliverables
- [x] AGENTS.md hub (non-negotiables, dependency direction, conventions)
- [x] TS_DEVELOPMENT.md, TS_ARCHITECTURE.md, TS_SYSTEM_DESIGN_PATTERNS.md
- [x] DECISIONS.md (D1-D8), README.md, .gitignore, .npmrc
- [x] pnpm workspace scaffold: 5 packages (@tacl/core, authorization, scenarios, experiments, web), source-consumed, tsconfig.base + per-package, vitest.workspace.ts explicit paths

### Reference
Skill: `fp-phase-2-supporting-files`
BODY

cat > "$O/p3.md" << 'BODY'
## Phase 3: GitHub Setup

**Status: DONE** — completed during kickoff session 2026-08-19.

### Deliverables
- [x] Repo rmax-ai/trajectory-authorization-lab, public, MIT, pushed main
- [x] 21 labels: status x6, type x2, phase 0-6, area x6
- [x] Plan epic, phase issues 0-6, 12 implementation stories

### Reference
Skill: `fp-phase-3-github-setup`
BODY

cat > "$O/p4.md" << 'BODY'
## Phase 4: Implementation

### Objective
Implement all 12 stories (SPEC 20 stages). TypeScript/Next.js — Codex CLI (gpt-5.6-terra) for batches of stories, worktree per story, verify gates: `pnpm typecheck` + `pnpm test` per story before merge.

### Stories
- Story 4.1 Schemas and event log
- Story 4.2 Deterministic fixtures and simulated tools
- Story 4.3 Execution runner and reference monitor
- Story 4.4 A0 tool ACL and A1 argument ABAC
- Story 4.5 Task contracts and A2
- Story 4.6 Trajectory state and A3
- Story 4.7 Causal graph, label lattice, A4
- Story 4.8 Capability attenuation, runtime effects, A5
- Story 4.9 Scenario suite S1-S6 with e2e matrix
- Story 4.10 Metrics and report CLI
- Story 4.11 Web inspection UI
- Story 4.12 Findings and documentation pass

### Acceptance Criteria
- [ ] Zero open stories; all PRs merged
- [ ] `pnpm test` green (unit + e2e scenario matrix)
- [ ] `pnpm experiment run-all` green, deterministic replay verified
- [ ] Structural invariant: tools unreachable outside reference monitor

### Verification
```bash
gh issue list --repo rmax-ai/trajectory-authorization-lab --label "type:story" --state open
```

### Reference
Skill: `fp-phase-4-implementation`; pitfalls: `fp-pitfalls-codex-workflow`, `fp-pitfalls-git-github-ci`
BODY

cat > "$O/p5.md" << 'BODY'
## Phase 5: Verification and Closeout

### Objective
Hard gates, claims audit, release.

### Deliverables
- [ ] Hard Gate 1: `pnpm typecheck` then `pnpm test` (stop on first failure)
- [ ] Hard Gate 2: fresh-clone validation — README quickstart reproduced in clean checkout; no vaporware claims
- [ ] `pnpm experiment run-all` produces reports; expected-outcome matrix vs measured
- [ ] docs/findings.md written from measured results only (demonstrated / prior theory / not yet solved)
- [ ] Release tag v0.1.0

### Reference
Skills: `fp-phase-5-verification`, `validate-project-docs`
BODY

cat > "$O/p6.md" << 'BODY'
## Phase 6: Website

### Objective
Single-page landing for the project (article companion). Content audited line-by-line against measured findings — no LLM-hallucinated claims.

### Reference
Skill: `fp-phase-6-website`
BODY

echo "=== creating plan epic ==="
gh issue create --repo "$R" --title "[Plan] Trajectory Authorization Lab - Full Development" --label "type:epic,status:ready" --body-file "$O/plan.md"

echo "=== creating phase issues ==="
gh issue create --repo "$R" --title "[Phase 0] Scope and Architecture" --label "phase:0,status:done" --body-file "$O/p0.md"
gh issue create --repo "$R" --title "[Phase 1] Research" --label "phase:1,status:done" --body-file "$O/p1.md"
gh issue create --repo "$R" --title "[Phase 2] Supporting Files" --label "phase:2,status:done" --body-file "$O/p2.md"
gh issue create --repo "$R" --title "[Phase 3] GitHub Setup" --label "phase:3,status:done" --body-file "$O/p3.md"
gh issue create --repo "$R" --title "[Phase 4] Implementation" --label "phase:4,status:ready" --body-file "$O/p4.md"
gh issue create --repo "$R" --title "[Phase 5] Verification and Closeout" --label "phase:5,status:backlog" --body-file "$O/p5.md"
gh issue create --repo "$R" --title "[Phase 6] Website" --label "phase:6,status:backlog" --body-file "$O/p6.md"

echo "=== creating stories ==="
gh issue create --repo "$R" --title "[Story 4.1] Schemas and event log" --label "type:story,phase:4,area:core,status:backlog" --body-file /dev/stdin << 'BODY'
### Objective
Zod schemas for every SPEC 4 type (Principal, TaskContract, ToolCall, PolicyDecision, AuthorizationContext) and the 12 event types (SPEC 6) as a discriminated union. Append-only JSONL event log writer with per-event flush.

### Files
packages/core/src/events/, packages/core/src/schemas.ts

### AC
- [ ] All SPEC 4/6 types exist as zod schemas, types via z.infer
- [ ] Event schema: id, runId, sequence, timestamp, causalParents, data; sequence strictly increasing
- [ ] events.jsonl appended per event (never buffered whole run)
- [ ] Unit tests: schema round-trip, event ordering, immutability-by-construction

### Verify
pnpm --filter @tacl/core test
BODY

gh issue create --repo "$R" --title "[Story 4.2] Deterministic fixtures and simulated tools" --label "type:story,phase:4,area:core,status:backlog" --body-file /dev/stdin << 'BODY'
### Objective
Fixture data (fixtures/crm, fixtures/billing: customer-123/456 with invoices, payment history) and 6 tools: crm.read, billing.read, billing.refund, slack.internal_post, slack.external_post (persist to run artifacts), python.exec (simulated: filesystem.read, network.connect, network.post, environment.read effects).

### Files
packages/core/src/tools/, fixtures/

### AC
- [ ] All tools deterministic, fixture-backed, zero host side effects
- [ ] Slack messages land in run artifacts only
- [ ] python.exec models effects, executes nothing
- [ ] Tool output labels declared per tool (SPEC 8 A4)

### Verify
pnpm --filter @tacl/core test
BODY

gh issue create --repo "$R" --title "[Story 4.3] Execution runner and reference monitor" --label "type:story,phase:4,area:core,status:backlog" --body-file /dev/stdin << 'BODY'
### Objective
Runtime: walk scenario steps, assemble AuthorizationContext (trajectory, graph, provenance, labels, budgets, capabilities), evaluate policy, execute on ALLOW, append events, write run artifacts (run.json, events.jsonl, graph.json, decisions.jsonl, metrics.json).

### Files
packages/core/src/runtime/

### AC
- [ ] Structural invariant: tool registry not exported; execute() is the only path (SPEC 18)
- [ ] ALLOW / DENY / REQUIRE_APPROVAL all recorded as PolicyEvaluatedEvent
- [ ] Runtime faults become ToolResultEvent outcome error; run always persists
- [ ] Injected Clock and seeded Rng; no wall-clock in decisions (AGENTS.md)

### Verify
pnpm --filter @tacl/core test
BODY

gh issue create --repo "$R" --title "[Story 4.4] A0 tool ACL and A1 argument ABAC" --label "type:story,phase:4,area:authorization,status:backlog" --body-file /dev/stdin << 'BODY'
### Objective
A0: principal-to-tool ACL (SPEC 8). A1: argument checks (refund.amount <= 100, allowed customers, allowed Slack channels). Policy registry mapping ids a0..a5. Decisions carry reasons with stable policy IDs.

### Files
packages/authorization/src/

### AC
- [ ] A0 allows unsafe composed trajectories by design
- [ ] A1 denies oversized single refunds, out-of-scope customers/channels
- [ ] authorize(ctx) pure: reads only context (SPEC 4)
- [ ] Unit tests: per-check deny reasons include stable rule IDs (SPEC 14)

### Verify
pnpm --filter @tacl/authorization test
BODY

gh issue create --repo "$R" --title "[Story 4.5] Task contracts and A2" --label "type:story,phase:4,area:authorization,status:backlog" --body-file /dev/stdin << 'BODY'
### Objective
TaskContract enforcement (SPEC 8 A2): tool must belong to task purpose/capability classes; prohibitedSinks denied. Contracts immutable during run; agent cannot self-modify.

### Files
packages/authorization/src/a2-task/

### AC
- [ ] LATENCY_DIAGNOSTICS allows crm.read, billing.read; denies billing.refund
- [ ] Immutability test: mutation attempts rejected structurally
- [ ] Scenario 4 (prompt-injection drift) deny path unit-tested with reasons

### Verify
pnpm --filter @tacl/authorization test
BODY

gh issue create --repo "$R" --title "[Story 4.6] Trajectory state and A3" --label "type:story,phase:4,area:authorization,status:backlog" --body-file /dev/stdin << 'BODY'
### Objective
History-dependent policies (SPEC 8 A3): cumulative refund budget (sum <= 500), tenant-affinity (read A then write B denied), confidential-observed then external-write denied, event-precedence rules. State projected by folding events (TS_SYSTEM_DESIGN_PATTERNS.md 2).

### Files
packages/authorization/src/a3-trajectory/

### AC
- [ ] 99 x 6 refund drain: each call passes A1-style check, A3 blocks cumulative overflow
- [ ] BudgetUpdatedEvent emitted on refund execution; policy reads projection
- [ ] Unit tests: fold correctness, budget boundary, tenant affinity

### Verify
pnpm --filter @tacl/authorization test
BODY

gh issue create --repo "$R" --title "[Story 4.7] Causal graph, label lattice, A4" --label "type:story,phase:4,area:core,status:backlog" --body-file /dev/stdin << 'BODY'
### Objective
Graph reconstruction from events (SPEC 7): node per event, edges caused_by, derived_from, read_from, writes_to, authorized_by, delegated_from. Label lattice PUBLIC < INTERNAL < CONFIDENTIAL < SECRET, integrity TRUSTED/UNTRUSTED; join on derivation; sink allowances (slack.external_post PUBLIC, slack.internal_post INTERNAL). A4 deny if source confidentiality > sink allowance.

### Files
packages/core/src/graph/, packages/authorization/src/a4-ifc/

### AC
- [ ] buildGraph(events.jsonl) deep-equals graph.json from run
- [ ] Join tests: CONFIDENTIAL + INTERNAL = CONFIDENTIAL etc.
- [ ] Derive step emits LabelUpdatedEvent with causalParents to source results
- [ ] A4 denies Scenario 1 exfiltration with IFC-EXTERNAL-EGRESS-001 evidence ids

### Verify
pnpm --filter @tacl/core test && pnpm --filter @tacl/authorization test
BODY

gh issue create --repo "$R" --title "[Story 4.8] Capability attenuation, runtime effects, A5" --label "type:story,phase:4,area:authorization,status:backlog" --body-file /dev/stdin << 'BODY'
### Objective
Capabilities (SPEC 8 A5): attenuation narrowing-only check (parent billing.refund amount<=500 -> child amount<=100 customer=123). Runtime-effect layer for python.exec: modeled effects checked against runtimeRestrictions (network egress denied). Delegation: child agents receive attenuated caps only; repo.delete request denied (Scenario 6).

### Files
packages/authorization/src/a5-capabilities/

### AC
- [ ] Widening rejected (repo.delete after repo.read), narrowing accepted
- [ ] Scenario 5: python.exec allowed at tool level, network.post blocked at effect level
- [ ] Unit tests: attenuation monotonicity, effect-layer denials

### Verify
pnpm --filter @tacl/authorization test
BODY

gh issue create --repo "$R" --title "[Story 4.9] Scenario suite S1-S6 with e2e matrix" --label "type:story,phase:4,area:scenarios,status:backlog" --body-file /dev/stdin << 'BODY'
### Objective
Scenario DSL (SPEC 10) and S1-S6, each with legitimate and adversarial variants and expected outcomes per policy level (SPEC 9). E2E assertions toAllowAttack/toBlockAttack/toSucceedLegit per the docs/research-questions.md matrix. No branching logic inside scenario definitions.

### Files
packages/scenarios/src/

### AC
- [ ] All 6 scenarios x 2 variants registered in catalog
- [ ] E2E matrix green: A1 allows refund-drain, A3 blocks it; A4 denies S1; A5 denies S5/S6; A2 denies S4
- [ ] Deterministic replay: two runs of same scenario+policy+seed produce identical events (timestamps excepted)

### Verify
pnpm --filter @tacl/experiments test
BODY

gh issue create --repo "$R" --title "[Story 4.10] Metrics and report CLI" --label "type:story,phase:4,area:experiments,status:backlog" --body-file /dev/stdin << 'BODY'
### Objective
Experiment runner CLI (SPEC 11): run --policy, run --all-policies, run-all, report. Metrics (SPEC 12): attack success, legitimate success, FP block, FN allow, policy eval latency, total latency, eval count, event count, graph nodes/edges, policy state size. Aggregated scenario x policy. Report to artifacts/reports/latest.json and latest.md.

### Files
packages/experiments/src/

### AC
- [ ] pnpm experiment run-all produces run artifacts for full matrix
- [ ] pnpm experiment report regenerates latest.json/md from artifacts only (no fabrication)
- [ ] Median decision latency measured per policy level
- [ ] Deterministic runs given same seed/config

### Verify
pnpm --filter @tacl/experiments test && pnpm experiment run-all && pnpm experiment report
BODY

gh issue create --repo "$R" --title "[Story 4.11] Web inspection UI" --label "type:story,phase:4,area:web,status:backlog" --body-file /dev/stdin << 'BODY'
### Objective
Next.js app (SPEC 13): / overview, /runs list, /runs/[id] detail (task contract, ordered trajectory with per-step decisions, causal graph, labels/provenance, budget changes, final outcome), /scenarios catalog, /policies models. Read-only server-side loader over artifacts/. Hand-written CSS, dark theme, readability over polish.

### Files
apps/web/src/

### AC
- [ ] Run detail timeline renders like SPEC 13 example (step, decision, label, reasons, derived-from)
- [ ] No client-side execution; static + server components
- [ ] pnpm --filter web dev serves locally; no network calls

### Verify
pnpm --filter @tacl/web build && manual dev-server smoke test
BODY

gh issue create --repo "$R" --title "[Story 4.12] Findings and documentation pass" --label "type:story,phase:4,area:docs,status:backlog" --body-file /dev/stdin << 'BODY'
### Objective
docs/findings.md written strictly from artifacts/reports/latest.json. Each conclusion tagged demonstrated-by-PoC / supported-by-prior-theory / not-yet-solved (SPEC 21). README, docs/extending.md, AGENTS.md reconciled with the shipped code.

### Files
docs/findings.md, README.md, docs/*

### AC
- [ ] Zero fabricated numbers; every table sourced from measured runs
- [ ] Expected-outcome matrix (research-questions.md) updated to measured reality if divergent
- [ ] README claims/limitations section matches implementation

### Verify
cross-check findings tables vs latest.json
BODY

echo "=== done ==="
rm -rf "$O"
