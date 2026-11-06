/**
 * Colombo timezone helpers (Asia/Colombo, UTC+5:30, no DST).
 *
 * Server-side "what is today" calculations must use Colombo time, not the
 * server's local clock (UTC on Vercel). All logic here uses
 * Intl.DateTimeFormat with an explicit timeZone so it stays correct even if
 * Node's ICU data or the server clock changes.
 */

const TZ = "Asia/Colombo";

function parts(now: Date): { year: number; month: number; day: number } {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const [year, month, day] = fmt.format(now).split("-").map(Number);
  return { year, month, day };
}

/** Current moment adjusted to Asia/Colombo, usable for calendar-day math. */
export function nowInColombo(): Date {
  const { year, month, day } = parts(new Date());
  // Local constructor is fine: we only use getFullYear/getMonth/getDate below,
  // so the components we care about are the Colombo date.
  return new Date(year, month - 1, day);
}

/** Today's date as YYYY-MM-DD in Colombo time. */
export function todayISOInColombo(): string {
  const { year, month, day } = parts(new Date());
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}