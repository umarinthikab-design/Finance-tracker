import Link from "next/link";
import type { Period } from "@/lib/dashboard";

export function PeriodSwitcher({ period }: { period: Period }) {
  const items: { value: Period; label: string; href: string }[] = [
    { value: "week", label: "Week", href: "/?period=week" },
    { value: "month", label: "Month", href: "/" },
    { value: "year", label: "Year", href: "/?period=year" },
  ];
  return (
    <div className="flex rounded-full border border-outline-variant p-0.5 text-sm">
      {items.map((item) => (
        <Link
          key={item.value}
          href={item.href}
          className={`rounded-full px-3 py-1 transition-colors ${
            period === item.value
              ? "bg-primary text-on-primary"
              : "text-on-surface-variant hover:bg-surface-container-low active:bg-surface-container"
          }`}
        >
          {item.label}
        </Link>
      ))}
    </div>
  );
}