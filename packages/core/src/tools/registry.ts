/**
 * Tool registry — PRIVATE to @tacl/core.
 * Deliberately NOT re-exported from the package index: the reference monitor
 * is the only code path that resolves tools (AGENTS.md non-negotiable #1).
 */
import type { Tool } from "./types";
import { crmReadTool } from "./crm";
import { billingReadTool, billingRefundTool } from "./billing";
import { slackExternalPostTool, slackInternalPostTool } from "./slack";
import { pythonExecTool } from "./python-exec";

const toolRegistry = new Map<string, Tool>([
  ["crm.read", crmReadTool],
  ["billing.read", billingReadTool],
  ["billing.refund", billingRefundTool],
  ["slack.internal_post", slackInternalPostTool],
  ["slack.external_post", slackExternalPostTool],
  ["python.exec", pythonExecTool],
]);

export function getTool(name: string): Tool | undefined {
  return toolRegistry.get(name);
}

export function toolNames(): readonly string[] {
  return [...toolRegistry.keys()];
}
