import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/auth";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  if (await isAuthenticated()) {
    redirect("/");
  }

  return (
    <main className="flex min-h-full flex-1 items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <h1 className="mb-1 text-headline-md">Finance Tracker</h1>
        <p className="mb-6 text-sm text-on-surface-variant">Enter your password to continue</p>
        <LoginForm />
      </div>
    </main>
  );
}