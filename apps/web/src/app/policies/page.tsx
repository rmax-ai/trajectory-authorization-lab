import { getPolicies } from "../../lib/artifacts";

const details: Record<string, { name: string; sees: string; catches: string; rule: string }> = {
  a0: { name: "Tool ACL", sees: "Principal and tool name", catches: "Unapproved tools", rule: "A0-TOOL-ACL-001" },
  a1: { name: "Argument ABAC", sees: "Tool arguments and principal attributes", catches: "Out-of-bound arguments", rule: "A1-REFUND-AMOUNT-001" },
  a2: { name: "Task Contract", sees: "Immutable task purpose and capability classes", catches: "Task drift", rule: "A2-CAPABILITY-002" },
  a3: { name: "Trajectory State", sees: "Prior events and cumulative state", catches: "Budget and sequence abuse", rule: "A3-BUDGET-CUMULATIVE-001" },
  a4: { name: "Information Flow", sees: "Labels and provenance", catches: "Confidential data egress", rule: "IFC-EXTERNAL-EGRESS-001" },
  a5: { name: "Capabilities + Runtime Effects", sees: "Attenuated capabilities and modeled effects", catches: "Capability escalation and effect bypass", rule: "A5-EFFECT-POST-001" },
};

export default function PoliciesPage() { return <><h1>Authorization ladder</h1><p className="muted">Each level adds policy-visible context to the same reference monitor.</p>{getPolicies().map((id) => { const policy = details[id]; if (!policy) return null; return <section className="panel" key={id}><h2><span className="mono">{id.toUpperCase()}</span> — {policy.name}</h2><p><span className="muted">What it sees: </span>{policy.sees}</p><p><span className="muted">What it catches: </span>{policy.catches}</p><p><span className="badge">{policy.rule}</span></p></section>; })}</>;
}
