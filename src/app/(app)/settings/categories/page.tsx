import { requireAuth } from "@/lib/auth";
import { getCategories } from "@/lib/dashboard";
import { CategoriesManager } from "./categories-manager";

export const revalidate = 0;

export default async function CategoriesPage() {
  await requireAuth();
  const categories = await getCategories(true);
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-6">
      <h1 className="text-headline-md text-on-surface">Categories</h1>
      <CategoriesManager initial={categories} />
    </main>
  );
}
