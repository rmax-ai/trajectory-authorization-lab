/**
 * slack.internal_post / slack.external_post — persist to run artifacts (SPEC §5),
 * never touch the network. The sink allowance (SPEC §8 A4) is encoded in labels:
 * internal → INTERNAL, external → PUBLIC.
 *
 * `channel` is an argument (not implicit) so A1 can check allowed channels
 * (SPEC §8 A1: "allowed Slack channels").
 */
import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { ToolInputError } from "./fixtures";
import type { Tool, ToolEnv, ToolResult } from "./types";

function makeSlackTool(name: string): Tool {
  return {
    name,
    run(env: ToolEnv, args: Record<string, unknown>): ToolResult {
      const text = typeof args.text === "string" ? args.text : null;
      const channel = typeof args.channel === "string" ? args.channel : null;
      if (!text) throw new ToolInputError(`${name} requires string text`);
      if (!channel) throw new ToolInputError(`${name} requires string channel`);
      const message = {
        messageId: `${env.runId}-msg-${env.nextSeq()}`,
        channel,
        text,
      };
      mkdirSync(env.artifactDir, { recursive: true });
      appendFileSync(join(env.artifactDir, "slack-messages.jsonl"), JSON.stringify(message) + "\n");
      const confidentiality = name === "slack.external_post" ? "PUBLIC" : "INTERNAL";
      return {
        result: message,
        labels: { confidentiality, integrity: "TRUSTED" },
      };
    },
  };
}

export const slackInternalPostTool: Tool = makeSlackTool("slack.internal_post");
export const slackExternalPostTool: Tool = makeSlackTool("slack.external_post");
