import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createEventFactory, EventLog, readEventLog, type Clock } from "./event-log";
import type { AgentEvent } from "../schemas";

const fixedClock: Clock = { now: () => "2026-08-19T21:00:00.000Z" };

const tmpDirs: string[] = [];
function tmpFile(name: string): string {
  const dir = mkdtempSync(join(tmpdir(), "tacl-events-"));
  tmpDirs.push(dir);
  return join(dir, name);
}
afterEach(() => {
  for (const d of tmpDirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe("createEventFactory", () => {
  it("assigns strictly increasing sequence and stable ids", () => {
    const f = createEventFactory("run-1", fixedClock);
    const a = f.next("UserRequestEvent", { request: "hi" });
    const b = f.next("ToolProposedEvent", { tool: { tool: "crm.read", arguments: {} } }, [a.id]);
    expect(a.sequence).toBe(1);
    expect(b.sequence).toBe(2);
    expect(a.id).toBe("evt-1");
    expect(b.id).toBe("evt-2");
    expect(b.causalParents).toEqual(["evt-1"]);
    expect(a.runId).toBe("run-1");
    expect(a.timestamp).toBe("2026-08-19T21:00:00.000Z");
  });

  it("events are structurally immutable (deep-frozen)", () => {
    const f = createEventFactory("run-1", fixedClock);
    const evt = f.next("ToolResultEvent", { result: { nested: { value: 1 } } });
    expect(Object.isFrozen(evt)).toBe(true);
    expect(() => {
      (evt as AgentEvent & { data: { result: { nested: { value: number } } } }).data.result.nested.value = 2;
    }).toThrow();
  });

  it("rejects invalid data payloads at creation", () => {
    const f = createEventFactory("run-1", fixedClock);
    expect(() => f.next("BudgetUpdatedEvent", { budget: "refunds", spent: "nope", limit: 1 })).toThrow();
  });
});

describe("EventLog", () => {
  it("appends one validated JSON line per event with immediate flush", () => {
    const file = tmpFile("events.jsonl");
    const log = new EventLog(file);
    const f = createEventFactory("run-1", fixedClock);
    const a = f.next("UserRequestEvent", { request: "hi" });
    const b = f.next("RunCompletedEvent", { outcome: "completed", summary: "ok" });
    log.append(a);
    log.append(b);
    // Read WITHOUT closing/flushing anything — per-event flush must have persisted.
    const lines = readFileSync(file, "utf8").trimEnd().split("\n");
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]!).id).toBe("evt-1");
    expect(JSON.parse(lines[1]!).id).toBe("evt-2");
  });

  it("refuses to append an invalid event (fail loud, file never created)", () => {
    const file = tmpFile("events.jsonl");
    const log = new EventLog(file);
    expect(() => log.append({ type: "Nope" } as unknown as AgentEvent)).toThrow();
    expect(existsSync(file)).toBe(false);
  });

  it("readEventLog replays the canonical source of truth", () => {
    const file = tmpFile("events.jsonl");
    const log = new EventLog(file);
    const f = createEventFactory("run-1", fixedClock);
    const written = [f.next("UserRequestEvent", { request: "hi" }), f.next("ToolProposedEvent", { tool: { tool: "billing.read", arguments: {} } }, ["evt-1"])];
    for (const e of written) log.append(e);
    const replayed = readEventLog(file);
    expect(replayed).toEqual(written);
  });

  it("readEventLog rejects tampered lines", () => {
    const file = tmpFile("events.jsonl");
    const log = new EventLog(file);
    const f = createEventFactory("run-1", fixedClock);
    log.append(f.next("UserRequestEvent", { request: "hi" }));
    // Tamper: invalid sequence
    const tampered = JSON.parse(readFileSync(file, "utf8"));
    tampered.sequence = -5;
    const tamperedFile = tmpFile("tampered.jsonl");
    writeFileSync(tamperedFile, JSON.stringify(tampered) + "\n");
    expect(() => readEventLog(tamperedFile)).toThrow();
  });
});
