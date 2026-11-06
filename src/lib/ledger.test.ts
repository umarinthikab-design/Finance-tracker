import { describe, it, expect, vi, beforeEach } from "vitest";

const mockInsert = vi.fn();
const mockLoanSingle = vi.fn();

vi.mock("@/lib/supabase", () => ({
  getSupabase: () => ({
    from: (table: string) => {
      if (table === "transactions") {
        return { insert: (row: unknown) => mockInsert(row) };
      }
      if (table === "loans") {
        return {
          select: () => ({
            eq: () => ({
              single: () => mockLoanSingle(),
            }),
          }),
        };
      }
      throw new Error(`unexpected table: ${table}`);
    },
  }),
}));

vi.mock("@/lib/timezone", () => ({
  todayISOInColombo: () => "2026-06-15",
}));

const { logLoanCreation, logLoanPayment } = await import("@/lib/ledger");

beforeEach(() => {
  mockInsert.mockReset().mockReturnValue({ data: null, error: null });
  mockLoanSingle.mockReset();
});

describe("logLoanCreation", () => {
  it("logs an expense for a payable loan created with an initial paid amount", async () => {
    await logLoanCreation({ direction: "payable", paid: 5000 });
    expect(mockInsert).toHaveBeenCalledTimes(1);
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 5000, type: "expense", category: "Loans" })
    );
  });

  it("logs income for a receivable loan created with an initial paid amount", async () => {
    await logLoanCreation({ direction: "receivable", paid: 3000 });
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 3000, type: "income", category: "Loans" })
    );
  });

  it("logs nothing when the initial paid amount is zero or negative", async () => {
    await logLoanCreation({ direction: "payable", paid: 0 });
    await logLoanCreation({ direction: "receivable", paid: -100 });
    expect(mockInsert).not.toHaveBeenCalled();
  });
});

describe("logLoanPayment", () => {
  it("logs only the incremental delta as an expense for a payable loan (not the full paid amount)", async () => {
    mockLoanSingle.mockReturnValue({ data: { paid: 1000, direction: "payable" }, error: null });
    const result = await logLoanPayment({ loanId: "loan-1", newPaid: 1500 });
    expect(result).toEqual({ delta: 500, type: "expense" });
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 500, type: "expense", category: "Loans" })
    );
  });

  it("logs the incremental delta as income for a receivable loan", async () => {
    mockLoanSingle.mockReturnValue({ data: { paid: 1000, direction: "receivable" }, error: null });
    const result = await logLoanPayment({ loanId: "loan-1", newPaid: 4000 });
    expect(result).toEqual({ delta: 3000, type: "income" });
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 3000, type: "income", category: "Loans" })
    );
  });

  it("logs a reversal (opposite type) with the absolute delta when paid is corrected downward on a payable loan", async () => {
    mockLoanSingle.mockReturnValue({ data: { paid: 2000, direction: "payable" }, error: null });
    const result = await logLoanPayment({ loanId: "loan-1", newPaid: 1200 });
    // paid went down by 800 on a payable loan -> reversal is logged as income.
    expect(result).toEqual({ delta: -800, type: "income" });
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 800, type: "income", category: "Loans" })
    );
  });

  it("logs a reversal (opposite type) with the absolute delta when paid is corrected downward on a receivable loan", async () => {
    mockLoanSingle.mockReturnValue({ data: { paid: 2000, direction: "receivable" }, error: null });
    const result = await logLoanPayment({ loanId: "loan-1", newPaid: 1500 });
    // paid went down by 500 on a receivable loan -> reversal is logged as expense.
    expect(result).toEqual({ delta: -500, type: "expense" });
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 500, type: "expense", category: "Loans" })
    );
  });

  it("logs nothing and inserts no transaction when paid is unchanged", async () => {
    mockLoanSingle.mockReturnValue({ data: { paid: 1000, direction: "payable" }, error: null });
    const result = await logLoanPayment({ loanId: "loan-1", newPaid: 1000 });
    expect(result).toEqual({ delta: 0, type: null });
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("defaults to a payable direction and zero prior paid when the loan row is missing fields", async () => {
    mockLoanSingle.mockReturnValue({ data: null, error: null });
    const result = await logLoanPayment({ loanId: "loan-1", newPaid: 200 });
    expect(result).toEqual({ delta: 200, type: "expense" });
  });
});
