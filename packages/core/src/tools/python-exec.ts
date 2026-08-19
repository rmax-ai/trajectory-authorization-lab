/**
 * python.exec — a SAFE SIMULATED execution tool (SPEC §5).
 * It executes NOTHING. It parses a tiny deterministic statement language and
 * reports *modeled* effects (filesystem.read, network.connect, network.post,
 * environment.read) so the lab can demonstrate why generic execution capability
 * bypasses tool-level restrictions — without any real sandbox risk.
 *
 * Output labels: UNTRUSTED integrity (generic executor output, SPEC §8 A4:
 * "external web/tool output → UNTRUSTED"). The A5 effect layer (story 4.8)
 * decides which modeled effects are authorized.
 */
import { ToolInputError } from "./fixtures";
import type { RuntimeEffect } from "../schemas";
import type { Tool, ToolEnv, ToolResult } from "./types";

const STATEMENT =
  /^(filesystem\.read|network\.connect|network\.post|environment\.read)\((.+)\)\s*$/;

/**
 * Modeled semantics: the FIRST positional argument is the effect target.
 * (e.g. network.post(url, payload) → target is the url; the payload is not modeled.)
 */
function firstArg(raw: string): string {
  const quoted = /^["']([^"']*)["']/.exec(raw.trim());
  if (quoted) return quoted[1]!;
  const unquoted = raw.trim().split(",")[0]!.trim();
  return unquoted;
}

export const pythonExecTool: Tool = {
  name: "python.exec",
  run(env: ToolEnv, args: Record<string, unknown>): ToolResult {
    const script = typeof args.script === "string" ? args.script : null;
    if (!script) throw new ToolInputError("python.exec requires string script");

    const effects: RuntimeEffect[] = [];
    const stdout: string[] = [];
    for (const line of script.split("\n")) {
      const trimmed = line.trim();
      if (trimmed === "" || trimmed.startsWith("#")) continue;
      const match = STATEMENT.exec(trimmed);
      if (!match) {
        stdout.push(`(unrecognized statement: ${trimmed})`);
        continue;
      }
      const kind = match[1]! as RuntimeEffect["kind"];
      const target = firstArg(match[2]!);
      effects.push({ kind, target });
      stdout.push(`[modeled] ${kind} ${target}`);
    }

    return {
      result: { stdout: stdout.join("\n"), effects },
      labels: { confidentiality: "INTERNAL", integrity: "UNTRUSTED" },
    };
  },
};
