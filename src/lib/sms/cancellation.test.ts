import { describe, it, expect, vi, beforeEach } from "vitest";

// Generic chainable Supabase query-builder stub: any method call (eq, gte,
// order, limit, not, select, ...) returns the same proxy so the exact chain
// shape doesn't need to be replicated; awaiting it resolves via `.then` to
// the configured result.
function chain(result: unknown) {
  const proxy: unknown = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === "then") {
          return (resolve: (v: unknown) => void) => resolve(result);
        }
        return () => proxy;
      },
    }
  );
  return proxy;
}

const mockLinkedResult = vi.fn();
const mockTransactionsResult = vi.fn();

// findCancellationCandidates takes the Supabase client as a plain argument
// (not via getSupabase()), so the mock is just an object passed in directly.
const mockSupabase = {
  from: (table: string) => {
    if (table === "sms_cancellations") return chain(mockLinkedResult());
    if (table === "transactions") return chain(mockTransactionsResult());
    throw new Error(`unexpected table: ${table}`);
  },
} as never;

const { findCancellationCandidates, MAX_CANCELLATION_CANDIDATES } = await import(
  "@/lib/sms/cancellation"
);

function txn(overrides: Record<string, unknown>) {
  return {
    id: "t1",
    amount: 362.73,
    date: "2026-09-13",
    merchant: "UBER 852 LK",
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

beforeEach(() => {
  mockLinkedResult.mockReset().mockReturnValue({ data: [], error: null });
  mockTransactionsResult.mockReset().mockReturnValue({ data: [], error: null });
});

describe("findCancellationCandidates", () => {
  it("matches a recent SMS-sourced expense on the resolved account by fuzzy merchant", async () => {
    mockTransactionsResult.mockReturnValue({
      data: [txn({ id: "t1", merchant: "UBER 852 LK" })],
      error: null,
    });
    const { candidates, tooMany } = await findCancellationCandidates(
      mockSupabase,
      { merchant: "UBER", account: "bank" }
    );
    expect(tooMany).toBe(false);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toEqual({ id: "t1", amount: 362.73, date: "2026-09-13", merchant: "UBER 852 LK" });
  });

  it("excludes transactions whose merchant doesn't fuzzy-match", async () => {
    mockTransactionsResult.mockReturnValue({
      data: [
        txn({ id: "t1", merchant: "UBER 852 LK" }),
        txn({ id: "t2", merchant: "KEELLS SUPER DEHIWELA" }),
      ],
      error: null,
    });
    const { candidates } = await findCancellationCandidates(mockSupabase, {
      merchant: "UBER",
      account: "bank",
    });
    expect(candidates.map((c) => c.id)).toEqual(["t1"]);
  });

  it("excludes a transaction already linked to a resolved cancellation notice", async () => {
    mockLinkedResult.mockReturnValue({
      data: [{ matched_transaction_id: "t1" }],
      error: null,
    });
    mockTransactionsResult.mockReturnValue({
      data: [txn({ id: "t1", merchant: "UBER 852 LK" }), txn({ id: "t2", merchant: "UBER 852 LK" })],
      error: null,
    });
    const { candidates } = await findCancellationCandidates(mockSupabase, {
      merchant: "UBER",
      account: "bank",
    });
    expect(candidates.map((c) => c.id)).toEqual(["t2"]);
  });

  it("flags tooMany instead of returning a long candidate list past the cap", async () => {
    const rows = Array.from({ length: MAX_CANCELLATION_CANDIDATES + 1 }, (_, i) =>
      txn({ id: `t${i}`, merchant: "UBER 852 LK" })
    );
    mockTransactionsResult.mockReturnValue({ data: rows, error: null });
    const { candidates, tooMany } = await findCancellationCandidates(mockSupabase, {
      merchant: "UBER",
      account: "bank",
    });
    expect(tooMany).toBe(true);
    expect(candidates).toEqual([]);
  });

  it("returns an empty (not tooMany) result when nothing matches", async () => {
    mockTransactionsResult.mockReturnValue({ data: [], error: null });
    const { candidates, tooMany } = await findCancellationCandidates(mockSupabase, {
      merchant: "UBER",
      account: "bank",
    });
    expect(candidates).toEqual([]);
    expect(tooMany).toBe(false);
  });
});
