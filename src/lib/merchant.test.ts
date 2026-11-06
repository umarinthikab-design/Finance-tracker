import { describe, it, expect } from "vitest";
import { merchantsMatch } from "@/lib/merchant";

describe("merchantsMatch", () => {
  it("matches a short cancellation-notice merchant against a fuller stored one", () => {
    // The real case this exists for: a cancellation notice says "UBER", the
    // original SMS-parsed charge stored "UBER 852 LK".
    expect(merchantsMatch("UBER", "UBER 852 LK")).toBe(true);
    expect(merchantsMatch("UBER 852 LK", "UBER")).toBe(true);
  });

  it("matches exactly regardless of case/whitespace", () => {
    expect(merchantsMatch("  Keells Super  ", "keells super")).toBe(true);
  });

  it("does not match a short name against an unrelated word that merely contains it mid-word", () => {
    expect(merchantsMatch("uber", "Ruberoid Hardware")).toBe(false);
  });

  it("does not match two short (<6 char) unrelated names even if one is a substring of the other", () => {
    // Both sides under MIN_FUZZY_LEN and not an exact match — same guard as
    // getLearnedCategory's mapping lookup.
    expect(merchantsMatch("uber", "uberx")).toBe(false);
  });

  it("does not match unrelated merchants", () => {
    expect(merchantsMatch("UBER", "KEELLS SUPER DEHIWELA")).toBe(false);
  });

  it("returns false for empty input", () => {
    expect(merchantsMatch("", "UBER 852 LK")).toBe(false);
    expect(merchantsMatch("UBER", "")).toBe(false);
  });
});
