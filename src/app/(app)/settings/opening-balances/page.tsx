import { getSupabase } from "@/lib/supabase";
import { requireAuth } from "@/lib/auth";
import OpeningBalancesPage from "./opening-balances-page";

export const revalidate = 0;

interface OpeningBalance {
  id: string;
  label: string;
  amount: number;
  as_of_date: string;
  kind?: string | null;
}

export default async function OpeningBalancesRoute() {
  await requireAuth();
  const supabase = getSupabase();
  const { data } = await supabase
    .from("opening_balances")
    .select("*")
    .order("as_of_date", { ascending: true });
  return <OpeningBalancesPage balances={(data ?? []) as OpeningBalance[]} />;
}
