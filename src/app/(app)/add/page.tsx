import { getCategories } from "@/lib/dashboard";
import { AddForm } from "./add-form";

export const dynamic = "force-dynamic";

export default async function AddPage() {
  const categories = await getCategories();
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 py-6">
      <h1 className="mb-4 text-headline-md">Add transaction</h1>
      <AddForm categories={categories} />
    </main>
  );
}