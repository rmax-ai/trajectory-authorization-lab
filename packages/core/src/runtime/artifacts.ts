/**
 * Run artifact writer — SPEC §6 layout:
 *   artifacts/runs/<run-id>/{run.json, events.jsonl, graph.json, decisions.jsonl, metrics.json}
 * events.jsonl is the canonical source of truth; everything else is a projection.
 */
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AgentEvent, ExecutionGraph } from "../schemas";
import { EventLog } from "../events/event-log";
import { buildGraph } from "./graph";

export interface RunMetadata {
  id: string;
  scenarioId: string;
  policyId: string;
  seed: number;
  startedAt: string;
  completedAt?: string;
  outcome?: string;
  eventCount?: number;
  decisionCount?: number;
}

export class RunArtifacts {
  readonly dir: string;
  readonly events: EventLog;
  private decisionCount = 0;

  constructor(dir: string) {
    this.dir = dir;
    mkdirSync(dir, { recursive: true });
    this.events = new EventLog(join(dir, "events.jsonl"));
  }

  writeRunStart(meta: RunMetadata): void {
    writeFileSync(join(this.dir, "run.json"), JSON.stringify(meta, null, 2) + "\n");
  }

  appendDecision(policyId: string, sequence: number, decision: unknown): void {
    this.decisionCount += 1;
    // Append-only decisions projection; decision records mirror the event log.
    appendFileSync(
      join(this.dir, "decisions.jsonl"),
      JSON.stringify({ sequence, policyId, decision }) + "\n",
    );
  }

  writeRunComplete(meta: RunMetadata): void {
    writeFileSync(join(this.dir, "run.json"), JSON.stringify(meta, null, 2) + "\n");
  }

  writeGraphAndMetrics(events: readonly AgentEvent[]): void {
    const graph: ExecutionGraph = buildGraph(events);
    writeFileSync(join(this.dir, "graph.json"), JSON.stringify(graph, null, 2) + "\n");
    const metrics = {
      eventCount: events.length,
      decisionCount: this.decisionCount,
      graphNodeCount: graph.nodes.length,
      graphEdgeCount: graph.edges.length,
    };
    writeFileSync(join(this.dir, "metrics.json"), JSON.stringify(metrics, null, 2) + "\n");
  }
}
