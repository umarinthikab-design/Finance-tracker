import { getSupabase } from "./supabase";

export const SMS_SILENCE_THRESHOLD_HOURS = 48;

export interface SmsHeartbeat {
  lastSmsAt: string | null;
  hoursSince: number | null;
  attempts: number;
  lastMethod: string | null;
  lastError: string | null;
  lastDroppedBody: string | null;
  healthy: boolean;
}

interface HeartbeatRow {
  last_seen_at: string;
  attempts: number;
  last_method: string | null;
  last_error: string | null;
  last_dropped_body: string | null;
}

/**
 * Record that the server received (and authenticated) an SMS webhook POST.
 * Single-row upsert; swallows failures so a missing/unmigrated table can never
 * break the webhook itself. If the forwarder dies, this row goes stale and
 * getSmsHeartbeat() reports it.
 */
export async function touchSmsHeartbeat(info: {
  method?: string;
  error?: string;
  droppedBody?: string;
}): Promise<void> {
  try {
    const supabase = getSupabase();
    const now = new Date().toISOString();
    const { data: cur } = await supabase
      .from("sms_heartbeat")
      .select("attempts")
      .eq("id", 1)
      .maybeSingle<{ attempts: number }>();
    const payload: Record<string, unknown> = {
      id: 1,
      last_seen_at: now,
      attempts: (cur?.attempts ?? 0) + 1,
      last_method: info.method ?? null,
      last_error: info.error ?? null,
      updated_at: now,
    };
    // Only overwrite the last-dropped body when a drop actually happened, so a
    // later successful insert doesn't wipe the last diagnostic evidence.
    if (info.droppedBody !== undefined) {
      payload.last_dropped_body = info.droppedBody;
    }
    await supabase.from("sms_heartbeat").upsert(payload);
  } catch (err) {
    console.error("[sms-heartbeat] touch failed:", err instanceof Error ? err.message : err);
  }
}

/**
 * How long since the server last heard from the phone's SMS forwarder.
 * Prefers the heartbeat table; before the migration is applied, falls back to
 * the newest SMS-sourced transaction so the "no SMS for Xh" signal still
 * works.
 */
export async function getSmsHeartbeat(): Promise<SmsHeartbeat> {
  const supabase = getSupabase();
  const none: SmsHeartbeat = {
    lastSmsAt: null,
    hoursSince: null,
    attempts: 0,
    lastMethod: null,
    lastError: null,
    lastDroppedBody: null,
    healthy: true,
  };

  try {
    let { data: row } = await supabase
      .from("sms_heartbeat")
      .select("last_seen_at, attempts, last_method, last_error, last_dropped_body")
      .eq("id", 1)
      .maybeSingle<HeartbeatRow>();

    if (!row) {
      // last_dropped_body column not applied yet (pre-09-03 migration) —
      // retry with the original columns so health still works.
      const res = await supabase
        .from("sms_heartbeat")
        .select("last_seen_at, attempts, last_method, last_error")
        .eq("id", 1)
        .maybeSingle<HeartbeatRow>();
      row = res.data ? { ...res.data, last_dropped_body: null } : null;
    }

    let lastSeen = row?.last_seen_at ?? null;
    const attempts = row?.attempts ?? 0;
    const lastMethod = row?.last_method ?? null;
    const lastError = row?.last_error ?? null;
    const lastDroppedBody = row?.last_dropped_body ?? null;

    if (!lastSeen) {
      // Migration not applied yet — derive from the transactions table.
      const { data: txn } = await supabase
        .from("transactions")
        .select("created_at")
        .eq("source", "sms")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle<{ created_at: string }>();
      lastSeen = txn?.created_at ?? null;
    }

    if (!lastSeen) {
      return { ...none, attempts, lastMethod, lastError, lastDroppedBody };
    }

    const hours = (Date.now() - new Date(lastSeen).getTime()) / 3_600_000;
    return {
      lastSmsAt: lastSeen,
      hoursSince: Math.round(hours * 10) / 10,
      attempts,
      lastMethod,
      lastError,
      lastDroppedBody,
      healthy: hours < SMS_SILENCE_THRESHOLD_HOURS,
    };
  } catch (err) {
    console.error("[sms-heartbeat] read failed:", err instanceof Error ? err.message : err);
    return none;
  }
}

/** "3h ago" / "6d ago" style, for the banner. */
export function formatHeartbeatAge(hoursSince: number): string {
  if (hoursSince < 1) return `${Math.round(hoursSince * 60)}m ago`;
  if (hoursSince < 24) return `${Math.round(hoursSince)}h ago`;
  return `${Math.round(hoursSince / 24)}d ago`;
}