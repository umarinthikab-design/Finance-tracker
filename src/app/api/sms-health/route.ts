import { NextRequest } from "next/server";
import {
  getSmsHeartbeat,
  SMS_SILENCE_THRESHOLD_HOURS,
  formatHeartbeatAge,
} from "@/lib/sms-health";
import { verifySmsWebhookSecret } from "@/lib/sms/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Out-of-band SMS set-up check, reachable from the phone's MacroDroid
 * heartbeat macro. Requires the webhook secret as a `?secret=` query param,
 * compared in constant time against SMS_WEBHOOK_SECRET (same helper the
 * sms-webhook route uses). Exposes only timestamps — no transaction data.
 */
export async function GET(req: NextRequest) {
  const provided = req.nextUrl.searchParams.get("secret") ?? "";
  if (!verifySmsWebhookSecret(provided)) {
    return new Response("Unauthorized", { status: 401 });
  }
  const hb = await getSmsHeartbeat();
  return Response.json({
    ok: true,
    healthy: hb.healthy,
    lastSmsAt: hb.lastSmsAt,
    hoursSince: hb.hoursSince,
    age: hb.hoursSince === null ? null : formatHeartbeatAge(hb.hoursSince),
    attempts: hb.attempts,
    lastMethod: hb.lastMethod,
    lastError: hb.lastError,
    lastDroppedBody: hb.lastDroppedBody,
    thresholdHours: SMS_SILENCE_THRESHOLD_HOURS,
  });
}