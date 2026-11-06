import { requireAuth } from "@/lib/auth";
import { nowInColombo, todayISOInColombo } from "@/lib/timezone";
import {
  bucketLabel,
  computeBuckets,
  getActiveAllowanceSetting,
  getAllAllowanceOverrides,
  getCycleConfig,
} from "@/lib/allowance";
import AllowancePage from "./allowance-page";

export const revalidate = 0;

export default async function AllowanceRoute() {
  await requireAuth();
  const now = nowInColombo();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const [active, overrides, config] = await Promise.all([
    getActiveAllowanceSetting(todayISOInColombo()),
    getAllAllowanceOverrides(),
    getCycleConfig(),
  ]);

  // Resolved buckets for the month being viewed (current month).
  const buckets = computeBuckets(config, year, month);

  // Human label for each override, resolved against its own month.
  const overrideLabels: Record<string, string> = {};
  const seenMonths = new Set<string>();
  for (const o of overrides) {
    const mk = `${o.year}-${o.month}`;
    if (!seenMonths.has(mk)) {
      seenMonths.add(mk);
      for (const b of computeBuckets(config, o.year, o.month)) {
        overrideLabels[`${mk}-${b.bucketNumber}`] = bucketLabel(b);
      }
    }
  }

  return (
    <AllowancePage
      active={active}
      overrides={overrides}
      config={config}
      viewYear={year}
      viewMonth={month}
      buckets={buckets}
      overrideLabels={overrideLabels}
    />
  );
}
