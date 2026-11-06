/**
 * Pure date math for recurring installments. Extracted out of
 * src/app/actions.ts (a "use server" module, which cannot export
 * non-async functions) so it can be unit tested directly.
 */

/** Add n months to a Y/M/D triple, clamping the day to the target month's
 * length (Jan 31 + 1mo -> Feb 28/29, not Mar 3). Returns YYYY-MM-DD. */
export function addMonthsClamped(
  y: number,
  m: number,
  d: number,
  n: number
): string {
  const t = new Date(Date.UTC(y, m - 1 + n, 1));
  const ny = t.getUTCFullYear();
  const nm = t.getUTCMonth() + 1;
  const lastDay = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
  const nd = Math.min(d, lastDay);
  return `${ny}-${String(nm).padStart(2, "0")}-${String(nd).padStart(2, "0")}`;
}

/** Advance a recurrence date by one cycle from an arbitrary base date,
 *  clamping the day to the target month's length and preserving the item's
 *  anchor day for monthly/yearly cycles. Returns YYYY-MM-DD. */
export function advanceDueDate(
  baseISO: string,
  cycle: string,
  anchorDay: number | null | undefined
): string {
  const [y, m, d] = baseISO.split("-").map(Number);
  const anchor =
    Number.isInteger(anchorDay) &&
    (anchorDay as number) >= 1 &&
    (anchorDay as number) <= 31
      ? (anchorDay as number)
      : d;
  if (cycle === "weekly") {
    const t = new Date(Date.UTC(y, m - 1, d + 7));
    return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-${String(t.getUTCDate()).padStart(2, "0")}`;
  }
  return addMonthsClamped(y, m, anchor, cycle === "yearly" ? 12 : 1);
}
