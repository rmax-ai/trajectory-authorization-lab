import { notFound } from "next/navigation";
import type { AgentEvent, Label } from "@tacl/core";
import { getRun, type RunDetail } from "../../../lib/artifacts";

function stringify(value: unknown, limit = 80): string {
  let text: string;
  try { text = JSON.stringify(value); } catch { text = String(value); }
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}
function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1]! + sorted[middle]!) / 2 : sorted[middle]!;
}
function labelBadges(label: Label): React.ReactNode { return <><span className="badge">{label.confidentiality}</span><span className="badge">{label.integrity}</span></>; }
function outcome(detail: RunDetail): { label: string; className: string } {
  const metrics = detail.metrics;
  const value = metrics?.attackAllowed ?? metrics?.taskSucceeded;
  if (value === null || value === undefined) return { label: detail.run.outcome ?? "unknown", className: "" };
  const attack = metrics?.variant === "adversarial";
  return { label: attack ? (value ? "attack allowed" : "attack blocked") : (value ? "task succeeded" : "task failed"), className: value === !attack ? "badge-allow" : "badge-deny" };
}
function related(events: readonly AgentEvent[], parentId: string, type: AgentEvent["type"]): AgentEvent[] { return events.filter((event) => event.type === type && event.causalParents.includes(parentId)); }

function Timeline({ events }: { events: readonly AgentEvent[] }) {
  const proposals = events.filter((event) => event.type === "ToolProposedEvent");
  const derivations = events.filter((event) => event.type === "LabelUpdatedEvent" && event.causalParents.length >= 2);
  if (proposals.length === 0 && derivations.length === 0) return <div className="panel">No parseable timeline events were recorded.</div>;
  return <div className="timeline">{proposals.map((proposal) => {
    if (proposal.type !== "ToolProposedEvent") return null;
    const evaluations = related(events, proposal.id, "PolicyEvaluatedEvent");
    const executions = evaluations.flatMap((evaluation) => related(events, evaluation.id, "ToolExecutedEvent"));
    const results = executions.flatMap((execution) => related(events, execution.id, "ToolResultEvent"));
    return <div className="timeline-row" key={proposal.id}><div><span className="mono">{String(proposal.sequence).padStart(2, "0")}</span> <strong>{proposal.data.tool.tool}</strong> <span className="mono muted">{stringify(proposal.data.tool.arguments)}</span></div>
      {evaluations.map((evaluation) => evaluation.type === "PolicyEvaluatedEvent" ? <div className="timeline-child" key={evaluation.id}><span className={`badge ${evaluation.data.decision.outcome === "ALLOW" ? "badge-allow" : evaluation.data.decision.outcome === "DENY" ? "badge-deny" : "badge-approval"}`}>{evaluation.data.decision.outcome}</span>{evaluation.data.decision.reasons.map((reason) => <div className="reason mono" key={reason}>{reason}</div>)}</div> : null)}
      {results.map((result) => result.type === "ToolResultEvent" ? <div className="timeline-child" key={result.id}>result <span className="mono">{stringify(result.data.result)}</span>{result.data.labels ? <span> {labelBadges(result.data.labels)}</span> : null}</div> : null)}
    </div>;
  })}{derivations.map((event) => event.type === "LabelUpdatedEvent" ? <div className="timeline-row" key={event.id}><div className="mono">derive → {event.id} <span className="muted">(from {event.causalParents.join(", ")})</span></div><div className="timeline-child">{Object.values(event.data.labels).map((label, index) => <span key={index}>{labelBadges(label)}</span>)}</div></div> : null)}</div>;
}

export default async function RunDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const detail = getRun(id); if (!detail) notFound();
  const result = outcome(detail); const task = detail.task; const budgets = detail.events.filter((event) => event.type === "BudgetUpdatedEvent"); const caps = detail.events.filter((event) => event.type === "CapabilityChangedEvent");
  const graphGroups = ["caused_by", "derived_from", "used_in", "authorized_by"] as const;
  return <><h1 className="mono">{detail.run.id}</h1><p>{detail.run.scenarioId} / <span className="mono">{detail.metrics?.variant ?? "unknown"}</span> · <span className="mono">{detail.run.policyId}</span> · <span className={`badge ${result.className}`}>{result.label}</span></p>
    {detail.parseErrors > 0 ? <div className="panel">{detail.parseErrors} malformed event line(s) were skipped while rendering this run.</div> : null}
    <h2>Task contract</h2>{!task ? <div className="panel">Task contract unavailable in the event log.</div> : <div className="panel"><p><span className="muted">Purpose: </span><span className="mono">{task.purpose}</span></p><p><span className="muted">Allowed: </span>{task.allowedCapabilityClasses.map((capability) => <span className="badge" key={capability}>{capability}</span>)}</p><p><span className="muted">Prohibited sinks: </span>{task.prohibitedSinks.length === 0 ? "none" : task.prohibitedSinks.map((sink) => <span className="badge badge-deny" key={sink}>{sink}</span>)}</p></div>}
    <h2>Timeline</h2><Timeline events={detail.events} />
    <h2>Budget changes</h2><div className="panel">{budgets.length === 0 && caps.length === 0 ? "No budget or capability changes recorded." : <>{budgets.map((event) => event.type === "BudgetUpdatedEvent" ? <p key={event.id}><span className="mono">{event.data.budget}</span>: {event.data.spent}/{event.data.limit}</p> : null)}{caps.map((event) => event.type === "CapabilityChangedEvent" ? <p key={event.id}>capabilities: {event.data.capabilities.map((capability) => <span className="badge" key={capability.action}>{capability.action}</span>)}</p> : null)}</>}</div>
    <h2>Graph</h2>{!detail.graph ? <div className="panel">Graph artifact unavailable or invalid.</div> : <div className="panel"><p>{detail.graph.nodes.length} nodes · {detail.graph.edges.length} edges</p>{graphGroups.map((semantics) => { const edges = detail.graph?.edges.filter((edge) => edge.semantics === semantics) ?? []; return edges.length > 0 ? <div key={semantics}><h3 className="mono">{semantics}</h3>{edges.map((edge, index) => <div className="mono muted" key={`${edge.from}-${edge.to}-${index}`}>{edge.from} → {edge.to}</div>)}</div> : null; })}</div>}
    <h2>Metrics</h2>{!detail.metrics ? <div className="panel">Metrics artifact unavailable or invalid.</div> : <div className="panel grid"><div>Events<br /><strong>{detail.metrics.eventCount}</strong></div><div>Evaluations<br /><strong>{detail.metrics.evaluationCount}</strong></div><div>Decision latency<br /><strong>{median(detail.metrics.decisionLatencyMs).toFixed(2)} / {Math.max(0, ...detail.metrics.decisionLatencyMs).toFixed(2)} ms</strong></div><div>Total latency<br /><strong>{detail.metrics.totalLatencyMs.toFixed(2)} ms</strong></div><div>Policy state size<br /><strong>{detail.metrics.policyStateSize}</strong></div></div>}</>;
}
