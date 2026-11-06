import { NextRequest } from "next/server";
import { processSmsMessage } from "@/lib/sms/process";
import { safeEqual } from "@/lib/sms/auth";
import { touchSmsHeartbeat } from "@/lib/sms-health";
import { webhookRateLimiter } from "@/lib/rate-limit";
import type { SmsMessage } from "@/lib/sms/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const secret = process.env.SMS_WEBHOOK_SECRET;
  if (!secret) {
    return Response.json(
      { ok: false, error: "SMS_WEBHOOK_SECRET not configured" },
      { status: 500 }
    );
  }

  // Rate limit by IP. In-memory stopgap — see rate-limit.ts note.
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
  if (webhookRateLimiter(`ip:${ip}`)) {
    return Response.json(
      { ok: false, error: "Rate limit exceeded" },
      { status: 429 }
    );
  }

  const authHeader = req.headers.get("x-webhook-secret") ?? "";
  const bodyJson = await req.clone().json().catch(() => null);

  // Accept the secret via header or in the JSON body. Compare in
  // constant time to avoid leaking timing information.
  const bodySecret = typeof bodyJson?.secret === "string" ? bodyJson.secret : "";
  const authOk =
    authHeader.length > 0
      ? safeEqual(authHeader, secret)
      : bodySecret.length > 0 && safeEqual(bodySecret, secret);

  if (!authOk) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const sender = String(bodyJson?.sender ?? bodyJson?.from ?? "").trim();
  const body = String(bodyJson?.body ?? bodyJson?.message ?? "").trim();
  const receivedAt = String(bodyJson?.received_at ?? bodyJson?.timestamp ?? "").trim();

  if (!sender || !body) {
    await touchSmsHeartbeat({ method: "invalid" });
    return Response.json(
      { ok: false, error: "Missing sender or body" },
      { status: 400 }
    );
  }

  const msg: SmsMessage = { sender, body, receivedAt: receivedAt || undefined };

  const result = await processSmsMessage(msg);

  if (result.method === "error") {
    await touchSmsHeartbeat({ method: result.method, error: result.error });
    return Response.json(
      { ok: false, error: result.error ?? "Insert failed" },
      { status: 500 }
    );
  }

  await touchSmsHeartbeat({
    method: result.method,
    error:
      result.method === "dropped"
        ? result.parsed?.reason ?? "no rule or LLM match"
        : undefined,
    // Capture what the phone actually POSTed so a parsing mismatch can be
    // compared against the raw SMS text (truncated to keep the row small).
    droppedBody: result.method === "dropped" ? msg.body.slice(0, 300) : undefined,
  });
  return Response.json({ ok: true, ...result });
}

export async function GET() {
  return Response.json({ ok: true, message: "sms-webhook is live. POST JSON with sender + body." });
}