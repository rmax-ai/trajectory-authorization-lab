import { describe, expect, it } from "vitest";
import { confLte, joinConf, joinIntegrity, joinLabels } from "./lattice";

describe("confidentiality lattice (SPEC §8 A4)", () => {
  it("orders PUBLIC < INTERNAL < CONFIDENTIAL < SECRET", () => {
    expect(confLte("PUBLIC", "INTERNAL")).toBe(true);
    expect(confLte("INTERNAL", "CONFIDENTIAL")).toBe(true);
    expect(confLte("CONFIDENTIAL", "SECRET")).toBe(true);
    expect(confLte("SECRET", "PUBLIC")).toBe(false);
    expect(confLte("CONFIDENTIAL", "CONFIDENTIAL")).toBe(true);
  });

  it("join takes the maximum", () => {
    expect(joinConf("PUBLIC", "CONFIDENTIAL")).toBe("CONFIDENTIAL");
    expect(joinConf("INTERNAL", "SECRET")).toBe("SECRET");
    expect(joinConf("CONFIDENTIAL", "INTERNAL")).toBe("CONFIDENTIAL");
    expect(joinConf()).toBe("PUBLIC");
  });
});

describe("integrity lattice", () => {
  it("join takes the LESS trusted", () => {
    expect(joinIntegrity("TRUSTED", "UNTRUSTED")).toBe("UNTRUSTED");
    expect(joinIntegrity("TRUSTED", "TRUSTED")).toBe("TRUSTED");
  });
});

describe("joinLabels", () => {
  it("joins both axes independently", () => {
    const joined = joinLabels(
      { confidentiality: "CONFIDENTIAL", integrity: "TRUSTED" },
      { confidentiality: "INTERNAL", integrity: "UNTRUSTED" },
    );
    expect(joined).toEqual({ confidentiality: "CONFIDENTIAL", integrity: "UNTRUSTED" });
  });
});
