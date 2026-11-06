import { createHmac, timingSafeEqual } from "node:crypto";

/** Constant-time string comparison (guards against timing attacks). */
export function safeEqual(a: string, b: string): boolean {
  const ha = createHmac("sha256", "sms-webhook").update(a).digest();
  const hb = createHmac("sha256", "sms-webhook").update(b).digest();
  return timingSafeEqual(ha, hb);
}

/** True only when a non-empty candidate matches the configured webhook secret. */
export function verifySmsWebhookSecret(candidate: string): boolean {
  const secret = process.env.SMS_WEBHOOK_SECRET;
  return !!secret && candidate.length > 0 && safeEqual(candidate, secret);
}