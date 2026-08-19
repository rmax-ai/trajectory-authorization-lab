/**
 * Append-only event log + deterministic event factory.
 * SPEC.md §6: the event log is the canonical source of truth.
 * AGENTS.md non-negotiable #2: every consequential action appends an immutable event.
 * TS_DEVELOPMENT.md: per-event flush, never buffer the whole run.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { AgentEventSchema, type AgentEvent, type AgentEventType } from "../schemas";

/** Injected clock — decision logic never reads wall time (AGENTS.md #5). */
export interface Clock {
  now(): string;
}

export const realClock: Clock = {
  now: () => new Date().toISOString(),
};

export interface EventFactory {
  /** Create the next event; assigns id (`evt-<seq>`), runId, sequence++, timestamp, causalParents. */
  next(
    type: AgentEventType,
    data: unknown,
    causalParents?: readonly string[],
  ): AgentEvent;
}

/**
 * Deterministic event factory. Sequence strictly increases from 1.
 * The emitted event object is deep-frozen — mutation throws in ESM strict mode,
 * making immutability structural rather than a convention.
 */
export function createEventFactory(runId: string, clock: Clock): EventFactory {
  let sequence = 0;
  const factory: EventFactory = {
    next(type, data, causalParents = []) {
      sequence += 1;
      const event = AgentEventSchema.parse({
        id: `evt-${sequence}`,
        runId,
        sequence,
        timestamp: clock.now(),
        causalParents: [...causalParents],
        type,
        data,
      });
      return deepFreeze(event);
    },
  };
  return factory;
}

export function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    Object.freeze(value);
    for (const key of Object.getOwnPropertyNames(value)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
  }
  return value;
}

/**
 * Append-only JSONL event log. Each append validates the event and writes a
 * single line + flush immediately — a crash mid-run must not lose history.
 */
export class EventLog {
  readonly path: string;

  constructor(filePath: string) {
    this.path = filePath;
  }

  append(event: AgentEvent): void {
    const validated = AgentEventSchema.parse(event); // fail loud, never coerce
    fs.mkdirSync(path.dirname(this.path), { recursive: true });
    fs.appendFileSync(this.path, JSON.stringify(validated) + "\n");
  }
}

/** Replay: stream-parse an events.jsonl file into validated events. */
export function readEventLog(filePath: string): AgentEvent[] {
  const content = fs.readFileSync(filePath, "utf8");
  const events: AgentEvent[] = [];
  for (const line of content.split("\n")) {
    if (line.trim() === "") continue;
    events.push(AgentEventSchema.parse(JSON.parse(line)));
  }
  return events;
}
