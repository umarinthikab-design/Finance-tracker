import { describe, it, expect } from "vitest";
import { matchRule, parseAmount, parseSmsDate } from "@/lib/sms/rules";

// Redacted, real-shaped sample SMS bodies. These pin down the exact
// merchant/amount/date/confidence a future regex edit must keep producing.

describe("matchRule — ComBank card purchase", () => {
  it("parses a card purchase with a trailing card-ending suffix", () => {
    const body =
      "Purchase at PICKME RIDE COLOMBO for LKR 504.67 on 19/08/26 04:59 PM has been authorised on your debit card ending #8662.";
    const match = matchRule("COMBANK", body);
    expect(match).not.toBeNull();
    expect(match!.rule.label).toBe("ComBank card purchase");
    expect(match!.confidence).toBe(0.95);
    expect(match!.values["1"]).toBe("PICKME RIDE COLOMBO");
    expect(parseAmount(match!.values["2"])).toBe(504.67);
    expect(parseSmsDate(match!.values["3"])).toBe("2026-08-19");
    expect(match!.values["4"]).toBe("8662");
  });

  it("parses a card purchase with no card-ending suffix (cardLast4 stays undefined)", () => {
    const body = "Purchase at KEELLS SUPER for LKR 3,250.00 on 05/01/26 11:20 AM has been authorised.";
    const match = matchRule("COMBANK", body);
    expect(match).not.toBeNull();
    expect(match!.values["1"]).toBe("KEELLS SUPER");
    expect(parseAmount(match!.values["2"])).toBe(3250);
    expect(match!.values["4"]).toBeUndefined();
  });
});

describe("matchRule — ComBank card cancellation", () => {
  it("parses a cancellation notice's merchant and card last-4, with no amount or date", () => {
    const body = "YOUR TRANSACTION AT UBER ON YOUR CARD ENDING WITH 8662 HAS BEEN CANCELLED.";
    const match = matchRule("COMBANK", body);
    expect(match).not.toBeNull();
    expect(match!.rule.label).toBe("ComBank card cancellation");
    expect(match!.rule.kind).toBe("cancellation");
    expect(match!.values["1"]).toBe("UBER");
    expect(match!.values["2"]).toBe("8662");
  });

  it("matches case-insensitively, not just the all-caps sample wording", () => {
    const body = "Your transaction at Keells Super on your card ending with 1234 has been cancelled.";
    const match = matchRule("COMBANK", body);
    expect(match).not.toBeNull();
    expect(match!.rule.kind).toBe("cancellation");
    expect(match!.values["1"]).toBe("Keells Super");
    expect(match!.values["2"]).toBe("1234");
  });

  it("does not falsely match a normal purchase message", () => {
    const body =
      "Purchase at UBER 852 LK for LKR 362.73 on 13/09/26 08:33 AM has been authorised on your debit card ending #8662.";
    const match = matchRule("COMBANK", body);
    expect(match!.rule.kind).toBeUndefined();
  });
});

describe("matchRule — ComBank ATM withdrawal", () => {
  it("parses an ATM withdrawal as a transfer to cash, not an expense", () => {
    const body =
      "Withdrawal at ARPICO-DEHIWE RM DEHIWELA COLK for LKR 7,000.00 on 19/08/26 03:59 PM from card ending #8662.";
    const match = matchRule("COMBANK", body);
    expect(match).not.toBeNull();
    expect(match!.rule.label).toBe("ComBank ATM withdrawal");
    expect(match!.rule.defaults?.type).toBe("transfer");
    expect(match!.rule.defaults?.category).toBe("Cash Withdrawal");
    expect(parseAmount(match!.values["2"])).toBe(7000);
    expect(match!.values["4"]).toBe("8662");
  });
});

describe("matchRule — generic debit/credit (known bank senders only)", () => {
  it("matches a generic debit alert from a known bank sender", () => {
    const match = matchRule("COMBANK", "Rs 1,234.56 debited from your account.");
    expect(match).not.toBeNull();
    expect(match!.rule.label).toBe("Generic debit");
    expect(match!.confidence).toBe(0.4);
    expect(parseAmount(match!.values["1"])).toBe(1234.56);
  });

  it("does not match a generic debit alert from an unknown sender (avoids false positives)", () => {
    const match = matchRule("SOME-PROMO", "Rs 1,234.56 debited from your account.");
    expect(match).toBeNull();
  });

  it("matches a generic credit alert from a known bank sender", () => {
    const match = matchRule("Commercial Bank", "LKR 25,000.00 credited to your account.");
    expect(match).not.toBeNull();
    expect(match!.rule.label).toBe("Generic credit");
    expect(parseAmount(match!.values["1"])).toBe(25000);
  });
});

describe("matchRule — fuel purchase", () => {
  it("matches a fuel purchase from a known fuel sender", () => {
    const match = matchRule("Lanka IOC", "Rs 5,000.00 purchased at fuel station.");
    expect(match).not.toBeNull();
    expect(match!.rule.label).toBe("Fuel purchase");
    expect(match!.rule.defaults?.category).toBe("Fuel");
  });
});

describe("parseAmount", () => {
  it("parses plain thousand-separated amounts", () => {
    expect(parseAmount("1,234.56")).toBe(1234.56);
  });

  it("parses European-style decimal-comma amounts", () => {
    expect(parseAmount("1.234,56")).toBe(1234.56);
  });

  it("returns null for zero, negative, or unparseable amounts", () => {
    expect(parseAmount("0")).toBeNull();
    expect(parseAmount("")).toBeNull();
    expect(parseAmount("abc")).toBeNull();
  });
});

describe("parseSmsDate", () => {
  it("parses DD/MM/YY (2-digit year assumed 20xx)", () => {
    expect(parseSmsDate("19/08/26")).toBe("2026-08-19");
  });

  it("parses DD/MM/YYYY", () => {
    expect(parseSmsDate("19/08/2026")).toBe("2026-08-19");
  });

  it("parses '12 Mar 2026' style dates", () => {
    expect(parseSmsDate("12 Mar 2026")).toBe("2026-03-12");
  });

  it("returns null rather than guessing for a bare DD/MM with no year", () => {
    expect(parseSmsDate("19/08")).toBeNull();
  });
});
