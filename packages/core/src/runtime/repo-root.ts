/**
 * Repo-root resolution that survives vitest/vite module rewriting:
 * walk up from a start dir until pnpm-workspace.yaml is found.
 * (import.meta.url arithmetic proved unreliable across packages under vitest.)
 */
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export function findRepoRoot(startDir: string): string {
  let dir = resolve(startDir);
  for (;;) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) throw new Error(`no pnpm-workspace.yaml found above ${startDir}`);
    dir = parent;
  }
}

export function resolveFixturesDir(startDir: string): string {
  return join(findRepoRoot(startDir), "fixtures");
}
