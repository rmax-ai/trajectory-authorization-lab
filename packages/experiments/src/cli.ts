#!/usr/bin/env node
/**
 * Experiment CLI (SPEC §11):
 *   pnpm experiment run <scenario> [--policy a0|--all-policies] [--variant legitimate|adversarial] [--seed N]
 *   pnpm experiment run-all [--seed N]
 *   pnpm experiment report
 */
import { join } from "node:path";
import { findRepoRoot } from "@tacl/core";
import { POLICY_ORDER, type PolicyId } from "@tacl/authorization";
import { scenarioIds } from "@tacl/scenarios";
import { runScenario, runAll } from "./runner";
import { writeReport } from "./report";

interface CliArgs {
  command: string;
  scenario?: string;
  policy?: PolicyId;
  allPolicies: boolean;
  variant: "legitimate" | "adversarial";
  seed: number;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    command: argv[0] ?? "help",
    allPolicies: false,
    variant: "adversarial",
    seed: 42,
  };
  const rest = argv.slice(1);
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i]!;
    if (a === "--policy") args.policy = rest[++i]! as PolicyId;
    else if (a === "--all-policies") args.allPolicies = true;
    else if (a === "--variant") args.variant = rest[++i]! as "legitimate" | "adversarial";
    else if (a === "--seed") args.seed = Number(rest[++i]);
    else if (!a.startsWith("--") && args.scenario === undefined) args.scenario = a;
  }
  return args;
}

function usage(): string {
  return `Trajectory Authorization Lab — experiment runner

Usage:
  pnpm experiment run <scenario> [--policy a0..a5] [--all-policies] [--variant legitimate|adversarial] [--seed N]
  pnpm experiment run-all [--seed N]
  pnpm experiment report

Scenarios: ${scenarioIds().join(", ")}
Policies: ${POLICY_ORDER.join(", ")}`;
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  const repoRoot = findRepoRoot(process.cwd());
  const runsDir = join(repoRoot, "artifacts", "runs");
  const reportsDir = join(repoRoot, "artifacts", "reports");

  switch (args.command) {
    case "run": {
      if (!args.scenario) {
        console.error(usage());
        return 2;
      }
      const policyIds: PolicyId[] = args.allPolicies ? [...POLICY_ORDER] : [args.policy ?? "a0"];
      for (const policyId of policyIds) {
        const { metrics, artifactDir } = await runScenario(args.scenario, policyId, {
          variant: args.variant,
          seed: args.seed,
          artifactsRoot: runsDir,
        });
        const verdict = metrics.attackAllowed ?? metrics.taskSucceeded;
        console.log(
          `${metrics.scenarioId}/${metrics.variant} @ ${policyId}: ${verdict === null ? "n/a" : verdict ? "ALLOWED/SUCCEEDED" : "BLOCKED/FAILED"} (${metrics.eventCount} events, ${metrics.decisionLatencyMs.length} evals) → ${artifactDir}`,
        );
      }
      writeReport(runsDir, reportsDir, POLICY_ORDER);
      return 0;
    }
    case "run-all": {
      const results = await runAll({ seed: args.seed, artifactsRoot: runsDir });
      for (const r of results) {
        console.log(`${r.metrics.scenarioId}/${r.metrics.variant} @ ${r.metrics.policyId} → ${r.artifactDir}`);
      }
      writeReport(runsDir, reportsDir, POLICY_ORDER);
      console.log(`\n${results.length} runs complete. Report: ${join(reportsDir, "latest.md")}`);
      return 0;
    }
    case "report": {
      const report = writeReport(runsDir, reportsDir, POLICY_ORDER);
      console.log(`Report regenerated from ${report.runs.length} runs → ${join(reportsDir, "latest.md")}`);
      return 0;
    }
    default:
      console.log(usage());
      return 0;
  }
}

main()
  .then((code) => {
    process.exit(code);
  })
  .catch((error) => {
    console.error("experiment failed:", error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
