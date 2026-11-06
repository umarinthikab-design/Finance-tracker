import { isAuthenticated } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import type { Transaction } from "@/lib/dashboard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function csvEscape(value: string): string {
  // Neutralize spreadsheet formula injection: values starting with =, +, -,
  // @, or tab/CR are prefixed with a single quote so Excel/Sheets treat them
  // as text, not formulas. (Dashes like negative numbers are ambiguous, but
  // amounts are exported as plain digits and this route has no negative
  // inputs, so escaping leading "-" is safe.)
  const valueOut = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  if (/[",\n\r]/.test(valueOut)) {
    return `"${valueOut.replace(/"/g, '""')}"`;
  }
  return valueOut;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: Request) {
  if (!(await isAuthenticated())) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const start = url.searchParams.get("start") ?? undefined;
  const end = url.searchParams.get("end") ?? undefined;
  if (start && !DATE_RE.test(start)) {
    return Response.json({ error: "start must be YYYY-MM-DD" }, { status: 400 });
  }
  if (end && !DATE_RE.test(end)) {
    return Response.json({ error: "end must be YYYY-MM-DD" }, { status: 400 });
  }

  const supabase = getSupabase();
  let query = supabase
    .from("transactions")
    .select("*")
    .order("date", { ascending: false })
    .order("created_at", { ascending: false });
  if (start) query = query.gte("date", start);
  if (end) query = query.lte("date", end);
  const { data, error } = await query;

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  const txns = (data ?? []) as Transaction[];
  const headers = [
    "Date",
    "Amount",
    "Currency",
    "Type",
    "Category",
    "Source",
    "Needs Review",
    "Notes",
    "Created At",
  ];

  const rows = txns.map((t) =>
    [
      t.date,
      String(Number(t.amount).toFixed(2)),
      t.currency,
      t.type,
      t.category ?? "",
      t.source,
      t.needs_review ? "yes" : "",
      t.raw_text ?? "",
      t.created_at,
    ]
      .map(csvEscape)
      .join(",")
  );

  const csv = `\uFEFF${headers.map(csvEscape).join(",")}\r\n${rows.join("\r\n")}\r\n`;

  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="finance-tracker-${new Date()
        .toISOString()
        .slice(0, 10)}.csv"`,
    },
  });
}