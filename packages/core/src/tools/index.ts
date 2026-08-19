/**
 * Public tool-layer surface: TYPES ONLY.
 * The registry and tool implementations stay private to @tacl/core — this is
 * the structural enforcement of the reference-monitor invariant (AGENTS.md #1,
 * SPEC §18). The runtime resolves tools internally; nothing else can.
 */
export type { Tool, ToolEnv, ToolResult } from "./types";
