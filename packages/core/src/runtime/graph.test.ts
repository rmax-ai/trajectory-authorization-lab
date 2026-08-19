import { beforeEach, describe, expect, it } from "vitest";
import { AgentEventSchema, buildGraph, type AgentEvent } from "@tacl/core";

let seq = 0;
beforeEach(() => {
  seq = 0;
});
function evt(type: AgentEvent["type"], data: unknown, causalParents: string[] = []): AgentEvent {
  seq += 1;
  return AgentEventSchema.parse({
    id: `evt-${seq}`,
    runId: "run-1",
    sequence: seq,
    timestamp: "2026-08-19T22:00:00.000Z",
    causalParents,
    type,
    data,
  });
}

describe("buildGraph (SPEC §7)", () => {
  it("creates a node per event with kind mapping", () => {
    const events = [evt("UserRequestEvent", { request: "go" })];
    const g = buildGraph(events);
    expect(g.nodes).toHaveLength(1);
    expect(g.nodes[0]).toEqual({
      id: "evt-1",
      kind: "user-input",
      label: "UserRequestEvent",
      data: { type: "UserRequestEvent", sequence: 1 },
    });
  });

  it("adds caused_by edges for every causalParents link", () => {
    const a = evt("UserRequestEvent", { request: "go" });
    const b = evt("ToolProposedEvent", { tool: { tool: "crm.read", arguments: {} } }, [a.id]);
    const g = buildGraph([a, b]);
    expect(g.edges).toContainEqual({ from: "evt-1", to: "evt-2", semantics: "caused_by" });
  });

  it("derived_from edges for multi-source derivations (the S1 summary)", () => {
    const read1 = evt("ToolResultEvent", { result: { id: "customer-123" } });
    const read2 = evt("ToolResultEvent", { result: { invoices: [] } });
    const summary = evt("LabelUpdatedEvent", {
      labels: { summary: { confidentiality: "CONFIDENTIAL", integrity: "TRUSTED" } },
    }, [read1.id, read2.id]);
    const g = buildGraph([read1, read2, summary]);
    expect(g.edges).toContainEqual({ from: "evt-1", to: "evt-3", semantics: "derived_from" });
    expect(g.edges).toContainEqual({ from: "evt-2", to: "evt-3", semantics: "derived_from" });
  });

  it("used_in edges from derived values to the consuming proposal", () => {
    const summary = evt("LabelUpdatedEvent", {
      labels: { summary: { confidentiality: "CONFIDENTIAL", integrity: "TRUSTED" } },
    }, ["evt-0", "evt-00"]);
    const post = evt("ToolProposedEvent", {
      tool: { tool: "slack.external_post", arguments: { channel: "#external-partners", text: "x" } },
      uses: [summary.id],
    });
    const g = buildGraph([summary, post]);
    expect(g.edges).toContainEqual({ from: summary.id, to: post.id, semantics: "used_in" });
  });

  it("authorized_by edge from the approving decision to the execution", () => {
    const proposal = evt("ToolProposedEvent", { tool: { tool: "crm.read", arguments: {} } });
    const decision = evt("PolicyEvaluatedEvent", {
      policyId: "a0",
      decision: { outcome: "ALLOW", reasons: ["ok"] },
    }, [proposal.id]);
    const execution = evt("ToolExecutedEvent", {
      tool: { tool: "crm.read", arguments: {} },
      outcome: "success",
    }, [decision.id]);
    const g = buildGraph([proposal, decision, execution]);
    expect(g.edges).toContainEqual({ from: decision.id, to: execution.id, semantics: "authorized_by" });
  });

  it("reconstruction is stable: buildGraph(buildGraph inputs) has no duplicated edges", () => {
    const a = evt("UserRequestEvent", { request: "go" });
    const b = evt("ToolProposedEvent", { tool: { tool: "crm.read", arguments: {} } }, [a.id]);
    const c = evt("PolicyEvaluatedEvent", { policyId: "a0", decision: { outcome: "ALLOW", reasons: [] } }, [b.id]);
    const g1 = buildGraph([a, b, c]);
    const g2 = buildGraph([a, b, c]);
    expect(g1).toEqual(g2);
    // no duplicate caused_by edges
    const caused = g1.edges.filter((e) => e.semantics === "caused_by");
    expect(new Set(caused.map((e) => `${e.from}->${e.to}`)).size).toBe(caused.length);
  });
});
