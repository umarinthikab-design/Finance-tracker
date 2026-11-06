import { requireAuth } from "@/lib/auth";
import { getCardAccountMappings } from "@/lib/card-accounts";
import { CardsManager } from "./cards-manager";

export const revalidate = 0;

export default async function CardsRoute() {
  await requireAuth();
  const mappings = await getCardAccountMappings();
  return <CardsManager initial={mappings} />;
}