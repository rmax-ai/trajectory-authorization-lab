/**
 * Label lattices (SPEC §8 A4, TS_SYSTEM_DESIGN_PATTERNS.md §4).
 * Confidentiality: PUBLIC < INTERNAL < CONFIDENTIAL < SECRET.
 * Integrity: TRUSTED < UNTRUSTED (join takes the LESS trusted).
 */
import type { Confidentiality, Integrity, Label } from "../schemas";

const CONF_ORDER: readonly Confidentiality[] = ["PUBLIC", "INTERNAL", "CONFIDENTIAL", "SECRET"];
const INT_ORDER: readonly Integrity[] = ["TRUSTED", "UNTRUSTED"];

export function confLte(a: Confidentiality, b: Confidentiality): boolean {
  return CONF_ORDER.indexOf(a) <= CONF_ORDER.indexOf(b);
}

export function joinConf(...values: readonly Confidentiality[]): Confidentiality {
  return values.reduce<Confidentiality>(
    (acc, v) => (confLte(acc, v) ? v : acc),
    "PUBLIC",
  );
}

export function joinIntegrity(...values: readonly Integrity[]): Integrity {
  return values.reduce<Integrity>(
    (acc, v) => (INT_ORDER.indexOf(acc) >= INT_ORDER.indexOf(v) ? acc : v),
    "TRUSTED",
  );
}

export function joinLabels(...labels: readonly Label[]): Label {
  return {
    confidentiality: joinConf(...labels.map((l) => l.confidentiality)),
    integrity: joinIntegrity(...labels.map((l) => l.integrity)),
  };
}

export const PUBLIC_TRUSTED: Label = { confidentiality: "PUBLIC", integrity: "TRUSTED" };
