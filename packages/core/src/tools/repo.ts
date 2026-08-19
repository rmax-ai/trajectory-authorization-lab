/**
 * repo.read / repo.delete — simulated repository tools for Scenario 6
 * (SPEC §9: privilege attenuation). Deterministic, fixture-backed, zero side
 * effects: repo.delete persists an INTENT record to run artifacts; it never
 * touches the host or the fixtures.
 */
import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { loadFixture, ToolInputError } from "./fixtures";
import type { Tool, ToolEnv, ToolResult } from "./types";

interface FileRecord {
  path: string;
  size: number;
}

export const repoReadTool: Tool = {
  name: "repo.read",
  run(env: ToolEnv, args: Record<string, unknown>): ToolResult {
    const repo = typeof args.repo === "string" ? args.repo : "default";
    const files = loadFixture<FileRecord[]>(env.fixturesDir, "repo/files.json");
    return {
      result: { repo, files: files.map((f) => f.path) },
      labels: { confidentiality: "INTERNAL", integrity: "TRUSTED" },
    };
  },
};

export const repoDeleteTool: Tool = {
  name: "repo.delete",
  run(env: ToolEnv, args: Record<string, unknown>): ToolResult {
    const pathArg = typeof args.path === "string" ? args.path : null;
    if (!pathArg) throw new ToolInputError("repo.delete requires string path");
    const record = { intent: "repo.delete", path: pathArg, runId: env.runId, seq: env.nextSeq() };
    mkdirSync(env.artifactDir, { recursive: true });
    appendFileSync(join(env.artifactDir, "delete-ledger.jsonl"), JSON.stringify(record) + "\n");
    return {
      result: record,
      labels: { confidentiality: "INTERNAL", integrity: "TRUSTED" },
    };
  },
};
