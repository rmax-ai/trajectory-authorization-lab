# TS_DEVELOPMENT.md — Day-to-Day TypeScript Idioms

Companion to AGENTS.md. Concrete patterns; follow them unless a story explicitly overrides.

## Zod: schemas as the type source of truth

```ts
// packages/core/events/schema.ts
export const ToolCallSchema = z.object({
  tool: z.string(),
  arguments: z.record(z.string(), z.unknown()),
});
export type ToolCall = z.infer<typeof ToolCallSchema>;

export const AgentEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("ToolExecutedEvent"),
    id: z.string(), runId: z.string(), sequence: z.number().int().nonnegative(),
    timestamp: z.string(), causalParents: z.array(z.string()),
    data: z.object({ tool: ToolCallSchema, outcome: z.enum(["success", "error"]) }),
  }),
  // ... one variant per event type (SPEC §6)
]);
export type AgentEvent = z.infer<typeof AgentEventSchema>;
```

Rules:
- One `schema.ts` per domain; `z.infer` everywhere; no parallel hand-written interfaces.
- Unknown input at file boundaries: `AgentEventSchema.safeParse(...)`, throw a descriptive error on failure.
- Don't use `z.record(z.string(), z.unknown())` when the keys are known — spell out fields.

## Discriminated unions, not classes

Event types and decisions are data, not classes. No inheritance; helper functions instead:

```ts
export function eventSequence(e: AgentEvent): number { return e.sequence; }
```

Use `switch (e.type)` with `satisfies never` fallback to keep additions exhaustive.

## Determinism utilities (AGENTS.md non-negotiable #5)

```ts
// packages/core/runtime/clock.ts
export interface Clock { now(): string; }        // ISO-8601
export const realClock: Clock = { now: () => new Date().toISOString() };
// tests/experiments inject FixedClock

// packages/core/runtime/rng.ts
export function mulberry32(seed: number): () => number { /* deterministic PRNG */ }
```

- Policies and graph code take `Clock`/`Rng` from context — never import `realClock` directly.
- Array iteration order is part of determinism: don't iterate `Object.entries` of user data in an order-sensitive way without `Object.keys().sort()`.

## Event log I/O (SPEC §6)

- Append with `fs.appendFileSync(eventsPath, JSON.stringify(evt) + "\n")` after every event; never buffer the whole log in memory and flush at end (crash loses history).
- `run.json` written at run start (config + seed) and updated at completion (`outcome`, counts).
- Timestamps: ISO strings; sequence strictly increasing from 1.

## Vitest

- Co-located `*.test.ts`; `describe` per invariant.
- E2E scenario tests live in `packages/experiments` and use the real runner API (not re-implemented harnesses).
- No `vi.useFakeTimers` in policy tests — inject `FixedClock` instead (deterministic and faster).

## Performance guardrails (low bar, this machine is small)

- Budget/label lookups: plain `Map` keyed by run-id scoped entity — O(1).
- Don't re-parse `events.jsonl` inside the per-step loop; project state incrementally as events append.
- `experiment run-all` = one process, sequential runs; no workers.

## Style

- No `any`; prefer `readonly` arrays/tuples for lattice definitions.
- Function declarations over arrow-functions-in-objects for exported API.
- JSDoc on exported symbols in `core` and `authorization` (they're the teaching surface).
