/**
 * Tool layer types. Tools are deterministic, fixture-backed, zero side effects (SPEC §5).
 * The registry is module-private to this package — the reference-monitor invariant
 * (AGENTS.md #1) holds structurally: nothing outside core can resolve a tool.
 */
import type { Label, RuntimeEffect } from "../schemas";

/** Injected per-run environment — no global state, deterministic ids via nextSeq. */
export interface ToolEnv {
  runId: string;
  /** Where slack messages / ledgers persist (SPEC §5: artifacts, not real Slack). */
  artifactDir: string;
  /** Repo-root fixtures dir (crm/, billing/). */
  fixturesDir: string;
  /** Monotonic per-run counter for deterministic ids (refund ids, message ids). */
  nextSeq: () => number;
}

export interface ToolResult {
  result: unknown;
  /** Declared output labels (SPEC §8 A4) — consumed by the label projection. */
  labels?: Label;
  /** Modeled runtime effects (python.exec only, SPEC §5) — checked by A5. */
  effects?: RuntimeEffect[];
}

export interface Tool {
  readonly name: string;
  run(env: ToolEnv, args: Record<string, unknown>): ToolResult;
}
