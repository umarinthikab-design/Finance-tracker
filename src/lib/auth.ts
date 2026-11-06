import { createHmac, timingSafeEqual } from "node:crypto";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSupabase } from "@/lib/supabase";

export const SESSION_COOKIE = "ft_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

function authSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set");
  return secret;
}

const PASSWORD_HASH_KEY = "password_hash";

/** Read the bcrypt hash of the app password from the database. */
async function getPasswordHash(): Promise<string | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", PASSWORD_HASH_KEY)
    .maybeSingle();
  if (error) throw error;
  return (data?.value as string | undefined) ?? null;
}

/** Verify a candidate password against the stored bcrypt hash. */
export async function verifyPassword(candidate: string): Promise<boolean> {
  const hash = await getPasswordHash();
  if (!hash) return false;
  return bcrypt.compare(candidate, hash);
}

/** Hash and store a new app password. */
export async function updatePassword(newPassword: string): Promise<void> {
  const supabase = getSupabase();
  const hash = await bcrypt.hash(newPassword, 10);
  await supabase
    .from("app_settings")
    .upsert({ key: PASSWORD_HASH_KEY, value: hash }, { onConflict: "key" });
}

function sign(payload: string): string {
  return createHmac("sha256", authSecret()).update(payload).digest("hex");
}

function verify(payload: string, sig: string): boolean {
  const expected = sign(payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Create the session cookie value (signed, with expiry timestamp). */
export function createSession(): string {
  const expires = (Date.now() + SESSION_TTL_MS).toString();
  const payload = Buffer.from(expires).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function isValidSession(value: string | undefined): boolean {
  if (!value) return false;
  const [payload, sig] = value.split(".");
  if (!payload || !sig) return false;
  if (!verify(payload, sig)) return false;
  const expires = Number(Buffer.from(payload, "base64url").toString());
  if (!Number.isFinite(expires) || expires < Date.now()) return false;
  return true;
}

/** Server-side: set the session cookie. Must be called in a Server Action or Route Handler. */
export async function setSessionCookie() {
  const store = await cookies();
  store.set(SESSION_COOKIE, createSession(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
}

/** Server-side: clear the session cookie. */
export async function clearSessionCookie() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

/** Check whether the current request is authenticated (server-side). */
export async function isAuthenticated(): Promise<boolean> {
  const store = await cookies();
  return isValidSession(store.get(SESSION_COOKIE)?.value);
}

/** Redirect to /login if not authenticated. Call at the top of protected pages. */
export async function requireAuth() {
  if (!(await isAuthenticated())) {
    redirect("/login");
  }
}

/** Redirect to / if already authenticated. Call at the top of the login page. */
export async function redirectIfAuthenticated() {
  if (await isAuthenticated()) {
    redirect("/");
  }
}