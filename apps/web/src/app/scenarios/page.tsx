import { getPolicies, getScenarios } from "../../lib/artifacts";

function renderStep(step: ReturnType<typeof getScenarios>[number]["steps"][number]): string {
  if (step.type === "tool") return `${step.tool} → ${JSON.stringify(step.arguments)}`;
  if (step.type === "derive") return `derive → ${step.sources.join(", ")}`;
  return `attenuate → ${step.capabilities.map((capability) => capability.action).join(", ")}`;
}

export default function ScenariosPage() {
  const scenarios = getScenarios(); const policies = getPolicies();
  const groups = [...new Set(scenarios.map((scenario) => scenario.id))];
  return <><h1>Scenario catalog</h1>{groups.map((id) => { const variants = scenarios.filter((scenario) => scenario.id === id); return <section className="panel" key={id}><h2 className="mono">{id}</h2>{variants.map((scenario) => <div key={scenario.variant}><h3>{scenario.variant}</h3><p>{scenario.description}</p><p><span className="muted">Purpose: </span><span className="mono">{scenario.task.purpose}</span></p><p>{scenario.capabilities.map((capability) => <span className="badge" key={capability.action}>{capability.action}</span>)}</p><ol className="compact">{scenario.steps.map((step, index) => <li className="mono" key={`${step.type}-${index}`}>{renderStep(step)}</li>)}</ol><table><thead><tr>{policies.map((policy) => <th className="mono" key={policy}>{policy}</th>)}</tr></thead><tbody><tr>{policies.map((policy) => <td key={policy}>{scenario.expectedOutcomes[policy] ?? "-"}</td>)}</tr></tbody></table></div>)}</section>; })}</>;
}
