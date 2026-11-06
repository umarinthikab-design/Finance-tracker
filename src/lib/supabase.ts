import { createClient, type SupabaseClient } from "@supabase/supabase-js";

declare global {
  var __financeSupabase: SupabaseClient | undefined;
}

/**
 * Server-only Supabase client using the service role key.
 * All reads/writes go through Next.js server code; the anon key is
 * never used because the app has no Supabase Auth (password gate only).
 */
export function getSupabase(): SupabaseClient {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set");
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  }

  if (!global.__financeSupabase) {
    global.__financeSupabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } }
    );
  }
  return global.__financeSupabase;
}