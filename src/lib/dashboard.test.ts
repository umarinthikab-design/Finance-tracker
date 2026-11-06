import { describe, it, expect, vi, beforeEach } from "vitest";

// getDashboardSummary pulls in a lot (balances, allowance range/flow, monthly
// reports for the year view). We only exercise the `period: "week"` path here
// and stub everything it touches so the allowanceEligibleExpenses / expenses
// split can be tested in isolation.

const mockTransactionsSelect = vi.fn();
const mockCategoriesSelect = vi.fn();

vi.mock("@/lib/supabase", () => ({
  getSupabase: () => ({
    from: (table: string) => {
      if (table === "opening_balances") {
        return {
          select: () => ({
            order: () => ({ data: [], error: null }),
          }),
        };
      }
      if (table === "transactions") {
        return {
          select: () => ({
            gte: () => ({
              lte: () => ({
                order: () => mockTransactionsSelect(),
              }),
            }),
          }),
        };
      }
      if (table === "categories") {
        return {
          select: () => ({
            order: () => {
              const result = mockCategoriesSelect();
              // getCategories(true) awaits the query right after .order(),
              // never calling .eq() — but also supports the includeHidden=false
              // path, which chains one more .eq("hidden", false).
              return { ...result, eq: () => result };
            },
          }),
        };
      }
      throw new Error(`unexpected table: ${table}`);
    },
  }),
}));

vi.mock("@/lib/timezone", () => ({
  nowInColombo: () => new Date(2026, 5, 15),
}));

vi.mock("@/lib/allowance", () => ({
  getAllowanceForRange: async () => 1000,
  getAllowanceFlow: async () => ({ cash: 100, bank: 200, combined: 300 }),
}));

vi.mock("@/lib/monthly", () => ({
  getMonthlyReport: async () => ({
    range: { label: "x" },
    income: 0,
    expenses: 0,
    savings: 0,
    balance: 0,
    allowanceIncome: 0,
    allowanceBalance: 0,
    needsReviewCount: 0,
    txnCount: 0,
  }),
}));

const { getDashboardSummary } = await import("@/lib/dashboard");

beforeEach(() => {
  mockTransactionsSelect.mockReset();
  mockCategoriesSelect.mockReset().mockReturnValue({
    data: [
      { name: "Food", type: "expense", hidden: false, counts_toward_allowance: true },
      { name: "Rent", type: "expense", hidden: false, counts_toward_allowance: false },
    ],
    error: null,
  });
});

function txn(overrides: Record<string, unknown>) {
  return {
    id: "t1",
    date: "2026-06-10",
    amount: 100,
    currency: "LKR",
    type: "expense",
    category: "Food",
    subcategory: null,
    merchant: null,
    source: "manual",
    raw_text: null,
    needs_review: false,
    account: "bank",
    counts_toward_allowance: true,
    created_at: "2026-06-10T00:00:00Z",
    ...overrides,
  };
}

describe("getDashboardSummary allowance-eligible expenses", () => {
  it("counts an eligible expense toward both plain expenses and allowanceEligibleExpenses", async () => {
    mockTransactionsSelect.mockReturnValue({
      data: [txn({ amount: 100, category: "Food", account: "bank" })],
      error: null,
    });
    const summary = await getDashboardSummary("week");
    expect(summary.expenses).toBe(100);
    expect(summary.allowanceBalance).toBe(1000 - 100);
  });

  it("excludes a savings-account transaction from allowanceEligibleExpenses but keeps it in plain expenses", async () => {
    mockTransactionsSelect.mockReturnValue({
      data: [txn({ amount: 250, category: "Food", account: "savings" })],
      error: null,
    });
    const summary = await getDashboardSummary("week");
    expect(summary.expenses).toBe(250);
    // allowanceBalance = allowanceIncome(1000) - allowanceEligibleExpenses(0)
    expect(summary.allowanceBalance).toBe(1000);
  });

  it("excludes a transaction flagged counts_toward_allowance=false from allowanceEligibleExpenses but keeps it in plain expenses", async () => {
    mockTransactionsSelect.mockReturnValue({
      data: [txn({ amount: 400, category: "Food", account: "bank", counts_toward_allowance: false })],
      error: null,
    });
    const summary = await getDashboardSummary("week");
    expect(summary.expenses).toBe(400);
    expect(summary.allowanceBalance).toBe(1000);
  });

  it("excludes a category not flagged eligible (e.g. Rent) from allowanceEligibleExpenses but keeps it in plain expenses", async () => {
    mockTransactionsSelect.mockReturnValue({
      data: [txn({ amount: 500, category: "Rent", account: "bank" })],
      error: null,
    });
    const summary = await getDashboardSummary("week");
    expect(summary.expenses).toBe(500);
    expect(summary.allowanceBalance).toBe(1000);
  });

  it("sums plain expenses across mixed eligible/excluded transactions while only eligible ones affect the allowance balance", async () => {
    mockTransactionsSelect.mockReturnValue({
      data: [
        txn({ amount: 100, category: "Food", account: "bank" }), // eligible
        txn({ amount: 200, category: "Food", account: "savings" }), // excluded: savings
        txn({ amount: 300, category: "Rent", account: "bank" }), // excluded: category
        txn({ amount: 50, category: "Food", account: "bank", counts_toward_allowance: false }), // excluded: flag
      ],
      error: null,
    });
    const summary = await getDashboardSummary("week");
    expect(summary.expenses).toBe(100 + 200 + 300 + 50);
    expect(summary.allowanceBalance).toBe(1000 - 100);
  });
});
