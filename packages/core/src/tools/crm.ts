/**
 * crm.read — fixture-backed customer records.
 * Output labels (SPEC §8 A4): CONFIDENTIAL / TRUSTED.
 */
import { loadFixture, ToolInputError } from "./fixtures";
import type { Tool, ToolEnv, ToolResult } from "./types";

interface CustomerRecord {
  id: string;
  tenant: string;
  name: string;
  email: string;
  address: string;
  taxId: string;
}

export const crmReadTool: Tool = {
  name: "crm.read",
  run(env: ToolEnv, args: Record<string, unknown>): ToolResult {
    const customerId = typeof args.customerId === "string" ? args.customerId : null;
    if (!customerId) throw new ToolInputError("crm.read requires string customerId");
    const customers = loadFixture<CustomerRecord[]>(env.fixturesDir, "crm/customers.json");
    const customer = customers.find((c) => c.id === customerId);
    if (!customer) throw new ToolInputError(`customer ${customerId} not found`);
    return {
      result: { ...customer, readAtRun: env.runId },
      labels: { confidentiality: "CONFIDENTIAL", integrity: "TRUSTED" },
    };
  },
};
