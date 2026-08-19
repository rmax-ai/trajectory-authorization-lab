import Link from "next/link";
import { getReport } from "../lib/artifacts";

export default function OverviewPage() {
  const report = getReport();
  return <><h1>Experiment overview</h1><p className="muted">Inspect deterministic authorization experiments and their event-derived evidence.</p>
    {!report ? <div className="panel">No runs yet — run <code>pnpm experiment run-all</code>.</div> : <div className="panel"><p className="muted">Report generated <span className="mono">{report.generatedAt}</span></p><table><thead><tr><th>Policy</th><th>Attack prevented</th><th>Legit success</th><th>Median latency</th></tr></thead><tbody>{report.summaries.map((summary) => <tr key={summary.policyId}><td className="mono">{summary.policyId}</td><td>{summary.attackPrevented}/{summary.attackTotal}</td><td>{summary.legitSucceeded}/{summary.legitTotal}</td><td className="mono">{summary.medianDecisionLatencyMs.toFixed(2)} ms</td></tr>)}</tbody></table></div>}
    <p><Link href="/runs">Browse runs</Link> or <Link href="/scenarios">review scenario contracts</Link>.</p></>;
}
