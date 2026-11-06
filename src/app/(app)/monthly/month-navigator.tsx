"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

function shift(value: string | null | undefined, delta: number): string {
  const now = new Date();
  let year = now.getFullYear();
  let month = now.getMonth() + 1;
  const m = value?.match(/^(\d{4})-(\d{1,2})$/);
  if (m) {
    year = Number(m[1]);
    month = Number(m[2]);
  }
  const d = new Date(year, month - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function MonthNavigator({ label }: { label: string }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const current = searchParams.get("month") ?? "";

  return (
    <div className="flex shrink-0 items-center gap-2">
      <Link
        href={`${pathname}?month=${shift(current, -1)}`}
        className="rounded-full border border-outline-variant px-3 py-1.5 text-sm font-medium text-on-surface-variant hover:bg-surface-container active:bg-surface-container-high"
      >
        ‹
      </Link>
      <span className="min-w-[7.5rem] text-center text-sm font-medium">{label}</span>
      <Link
        href={`${pathname}?month=${shift(current, 1)}`}
        className="rounded-full border border-outline-variant px-3 py-1.5 text-sm font-medium text-on-surface-variant hover:bg-surface-container active:bg-surface-container-high"
      >
        ›
      </Link>
    </div>
  );
}