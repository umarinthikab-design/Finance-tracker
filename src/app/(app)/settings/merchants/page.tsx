import { requireAuth } from "@/lib/auth";
import { getMerchantCategories } from "@/lib/merchant";
import { getCategories } from "@/lib/dashboard";
import MerchantsManager from "./merchants-manager";

export const revalidate = 0;

export default async function MerchantsRoute() {
  await requireAuth();
  const [rules, categories] = await Promise.all([
    getMerchantCategories(),
    getCategories(true),
  ]);
  return <MerchantsManager rules={rules} categories={categories} />;
}
