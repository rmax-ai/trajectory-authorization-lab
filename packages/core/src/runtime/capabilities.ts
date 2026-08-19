/**
 * Capability attenuation (SPEC §8 A5, TS_SYSTEM_DESIGN_PATTERNS.md §5).
 * A child capability may only NARROW a parent: same action, and every
 * constraint the parent binds must be at least as restrictive in the child.
 * Adding new constraint keys is narrowing; changing a binding to a weaker
 * value is widening (rejected).
 */
import type { Capability } from "../schemas";

export function constraintsNarrow(
  parent: Record<string, unknown>,
  child: Record<string, unknown>,
): boolean {
  for (const [key, parentVal] of Object.entries(parent)) {
    const childVal = child[key];
    if (childVal === undefined) return false; // child must bind everything parent binds

    if (typeof parentVal === "number" && typeof childVal === "number") {
      if (key.endsWith(".max") && childVal > parentVal) return false;
      if (key.endsWith(".min") && childVal < parentVal) return false;
      if (!key.includes(".") && childVal !== parentVal) return false;
      continue;
    }
    if (typeof parentVal === "string" && typeof childVal === "string") {
      if (key.endsWith(".prefix")) {
        if (!childVal.startsWith(parentVal)) return false;
        continue;
      }
      if (childVal !== parentVal) return false;
      continue;
    }
    if (JSON.stringify(parentVal) !== JSON.stringify(childVal)) return false;
  }
  return true;
}

/** Same action + monotone constraint narrowing (SPEC §8 A5 attenuation). */
export function attenuate(parent: Capability, child: Capability): boolean {
  if (parent.action !== child.action) return false;
  return constraintsNarrow(parent.constraints, child.constraints);
}
