/**
 * billing.read + billing.refund — fixture-backed billing data.
 * Read output labels: CONFIDENTIAL / TRUSTED. Refund ledger output: INTERNAL / TRUSTED.
 * Refunds persist to run artifacts (SPEC §5), never mutate fixtures.
 */
import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { loadFixture, ToolInputError } from "./fixtures";
import type { Tool, ToolEnv, ToolResult } from "./types";

interface InvoiceRecord {
  id: string;
  customerId: string;
  amount: number;
  status: string;
  issuedAt: string;
}

interface PaymentRecord {
  id: string;
  customerId: string;
  invoiceId: string;
  amount: number;
  method: string;
  at: string;
}

export const billingReadTool: Tool = {
  name: "billing.read",
  run(env: ToolEnv, args: Record<string, unknown>): ToolResult {
    const customerId = typeof args.customerId === "string" ? args.customerId : null;
    if (!customerId) throw new ToolInputError("billing.read requires string customerId");
    const invoices = loadFixture<InvoiceRecord[]>(env.fixturesDir, "billing/invoices.json").filter(
      (i) => i.customerId === customerId,
    );
    const payments = loadFixture<PaymentRecord[]>(env.fixturesDir, "billing/payments.json").filter(
      (p) => p.customerId === customerId,
    );
    return {
      result: { customerId, invoices, payments },
      labels: { confidentiality: "CONFIDENTIAL", integrity: "TRUSTED" },
    };
  },
};

export const billingRefundTool: Tool = {
  name: "billing.refund",
  run(env: ToolEnv, args: Record<string, unknown>): ToolResult {
    const customerId = typeof args.customerId === "string" ? args.customerId : null;
    const amount = typeof args.amount === "number" ? args.amount : null;
    if (!customerId) throw new ToolInputError("billing.refund requires string customerId");
    if (amount === null || !Number.isFinite(amount) || amount <= 0) {
      throw new ToolInputError("billing.refund requires positive numeric amount");
    }
    const invoices = loadFixture<InvoiceRecord[]>(env.fixturesDir, "billing/invoices.json");
    if (!invoices.some((i) => i.customerId === customerId)) {
      throw new ToolInputError(`customer ${customerId} has no billing records`);
    }
    // Deterministic id from the run's monotonic counter (ToolEnv.nextSeq).
    const refundId = `${env.runId}-refund-${env.nextSeq()}`;
    const record = { refundId, customerId, amount, issuedAtRun: env.runId };
    mkdirSync(env.artifactDir, { recursive: true });
    appendFileSync(join(env.artifactDir, "refunds.jsonl"), JSON.stringify(record) + "\n");
    return {
      result: record,
      labels: { confidentiality: "INTERNAL", integrity: "TRUSTED" },
    };
  },
};
