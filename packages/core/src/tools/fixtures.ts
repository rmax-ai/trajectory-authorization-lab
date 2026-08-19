/**
 * Shared fixture loading for tools. Fixtures are read-only, deterministic JSON
 * under fixtures/ (SPEC §5). No writes ever touch fixture data.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

export function loadFixture<T>(fixturesDir: string, relativePath: string): T {
  const raw = readFileSync(join(fixturesDir, relativePath), "utf8");
  return JSON.parse(raw) as T;
}

export class ToolInputError extends Error {}
