import Link from "next/link";
import { listRuns } from "../../lib/artifacts";

function outcome(run: ReturnType<typeof listRuns>[number]): { label: string; className: string } {
  const permitted = run.attackAllowed ?? run.taskSucceeded;
  if (permitted === null) return { label: "n/a", className: "" };
  const isAttack = run.variant === "adversarial";
  return { label: isAttack ? (permitted ? "attack allowed" : "attack blocked") : (permitted ? "task succeeded" : "task failed"), className: permitted === !isAttack ? "badge-allow" : "badge-deny" };
}

export default function RunsPage() {
  const runs = listRuns();
  return <><h1>Runs</h1>{runs.length === 0 ? <div className="panel">no runs yet — run <code>pnpm experiment run-all</code>.</div> : <div className="panel"><table><thead><tr><th>Run</th><th>Scenario / variant</th><th>Policy</th><th>Outcome</th><th>Events</th><th>Median decision</th></tr></thead><tbody>{runs.map((run) => { const result = outcome(run); return <tr key={run.runId}><td className="mono"><Link href={`/runs/${encodeURIComponent(run.runId)}`}>{run.runId}</Link></td><td>{run.scenarioId}<br /><span className="muted">{run.variant}</span></td><td className="mono">{run.policyId}</td><td className="outcome"><span className={`badge ${result.className}`}>{result.label}</span></td><td>{run.eventCount}</td><td className="mono">{run.decisionLatencyMs.toFixed(2)} ms</td></tr>; })}</tbody></table></div>}</>;
}
