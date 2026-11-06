"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Export button with optional start/end date filters. Omitted values mean
 * all-time, keeping the plain "Export CSV" behavior intact for manual use.
 */
export function ExportCsv() {
  const router = useRouter();
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (start) params.set("start", start);
    if (end) params.set("end", end);
    const qs = params.toString();
    router.push(`/api/export${qs ? `?${qs}` : ""}`);
  };

  const inputCls =
    "w-[8.5rem] rounded-md border border-outline-variant bg-surface-container-lowest px-2 py-1.5 text-sm text-on-surface outline-none focus:border-primary";

  return (
    <form
      onSubmit={onSubmit}
      className="flex items-center gap-1.5"
      title="Leave dates empty to export everything"
    >
      <input
        type="date"
        value={start}
        max={end || undefined}
        onChange={(e) => setStart(e.target.value)}
        aria-label="Export from date"
        className={inputCls}
      />
      <span className="text-sm text-on-surface-variant">→</span>
      <input
        type="date"
        value={end}
        min={start || undefined}
        onChange={(e) => setEnd(e.target.value)}
        aria-label="Export to date"
        className={inputCls}
      />
      <button
        type="submit"
        className="rounded-full border border-outline-variant px-3 py-1.5 text-sm font-medium text-on-surface-variant hover:bg-surface-container active:bg-surface-container-high"
      >
        Export CSV
      </button>
    </form>
  );
}