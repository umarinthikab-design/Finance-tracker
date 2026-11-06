import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import { AppNav } from "./nav";

export const metadata: Metadata = {
  title: "Finance Tracker",
};

async function getReviewCount(): Promise<number> {
  const { count, error } = await getSupabase()
    .from("transactions")
    .select("id", { count: "exact", head: true })
    .eq("needs_review", true);
  return error ? 0 : (count ?? 0);
}

export default async function AppLayout({
  children,
}: LayoutProps<"/">) {
  if (!(await isAuthenticated())) {
    redirect("/login");
  }
  const reviewCount = await getReviewCount();
  return (
    <>
      <AppNav reviewCount={reviewCount} />
      {/* Clear the fixed desktop sidebar (220px) at ≥640px; the mobile
          bottom padding gives the fixed tab bar clearance below the last
          element, plus its own safe-area-inset-bottom padding (home
          indicator) so content never sits underneath it. */}
      <div className="pb-[calc(5rem+env(safe-area-inset-bottom))] sm:pb-0 sm:pl-[220px]">
        {children}
      </div>
    </>
  );
}