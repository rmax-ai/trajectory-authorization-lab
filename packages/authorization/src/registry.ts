/**
 * Policy registry — the A0–A5 ladder (SPEC §8). Experiments resolve policies
 * by id; scenarios assert expected outcomes per id. Registry grows as
 * stories land (a2…a5 appended by their stories).
 */
import type { AuthorizationPolicy } from "@tacl/core";
import { createA0Policy, type AclConfig } from "./a0-tool-acl";
import { createA1Policy, type AbacConfig } from "./a1-abac";
import { createA2Policy, type A2Config } from "./a2-task";
import { createA3Policy, type A3Config } from "./a3-trajectory";

export const POLICY_ORDER = ["a0", "a1", "a2", "a3", "a4", "a5"] as const;
export type PolicyId = (typeof POLICY_ORDER)[number];

export function createPolicy(id: PolicyId): AuthorizationPolicy {
  switch (id) {
    case "a0":
      return createA0Policy();
    case "a1":
      return createA1Policy();
    case "a2":
      return createA2Policy();
    case "a3":
      return createA3Policy();
    case "a4":
    case "a5":
      throw new Error(`policy ${id} not implemented yet`);
  }
}

export { createA0Policy, DEFAULT_ACL } from "./a0-tool-acl";
export type { AclConfig } from "./a0-tool-acl";
export { createA1Policy, DEFAULT_ABAC } from "./a1-abac";
export type { AbacConfig } from "./a1-abac";
export { createA2Policy, DEFAULT_A2 } from "./a2-task";
export type { A2Config } from "./a2-task";
export { createA3Policy } from "./a3-trajectory";
export type { A3Config } from "./a3-trajectory";
