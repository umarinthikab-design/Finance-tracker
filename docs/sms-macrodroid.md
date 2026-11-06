# Phase 3 — SMS capture via MacroDroid

This doc describes how to wire your Android phone to push bank SMS alerts to the
`/api/sms-webhook` endpoint. Only the pieces that need your phone are here; the
webhook itself is already deployed.

The phone-side automation app in use is **MacroDroid** (Tasker is not involved).
Two macros:

1. **SMS forwarder** — fires whenever a bank SMS arrives and POSTs it to the
   webhook.
2. **Heartbeat** — a timer macro that GETs `/api/sms-health` every 6 hours so a
   dead forwarder shows up on the Dashboard within a day instead of silently.

## How it works

1. MacroDroid's SMS-Received trigger fires on an SMS from the bank sender.
2. The forwarder macro HTTP-POSTs the raw SMS text + sender to your Vercel URL.
3. The webhook regex-parses it, or falls back to an LLM call, and inserts a
   transaction flagged `needs_review` when confidence is low.

## Endpoint

```
POST https://finance-tracker-ruby-eight-39.vercel.app/api/sms-webhook
Header:  x-webhook-secret: <SMS_WEBHOOK_SECRET>
Body (JSON):
{
  "sender": "COMBANK",
  "body": "Dear Cardholder, Purchase at ... for LKR 1,470.00 on 27/08/26 ...",
  "received_at": "2026-08-20T10:30:00+05:30"
}
```

Your `SMS_WEBHOOK_SECRET` is in `.env.local` (also set on Vercel).

## Prerequisites / permissions

- MacroDroid installed with SMS access granted (Android Settings → Apps →
  MacroDroid → SMS/Notifications) and the MacroDroid accessibility/helper
  service enabled.
- **Battery optimization:** Settings → Apps → MacroDroid → Battery →
  Unrestricted. Without this, Android silently kills MacroDroid after a few
  days — the most common cause of the forwarder "just stopping".
- The two macros below fit the free version's 2-macro limit; PRO is not
  required.

## Macro 1 — SMS forwarder

### Trigger (event)

**(+)** → **Triggers → Phone → SMS Received** with:

- **SMS sender / contains:** `COMBANK` (your confirmed bank sender ID)

### Action

**(+)** → **Actions → Net → HTTP Request** with:

| Field        | Value |
|--------------|-------|
| URL          | `https://finance-tracker-ruby-eight-39.vercel.app/api/sms-webhook` |
| Method       | `POST` |
| Headers      | `x-webhook-secret` header with value `<SMS_WEBHOOK_SECRET>` (add as a JSON object entry, e.g. `{"x-webhook-secret":"<SMS_WEBHOOK_SECRET>"}`) |
| Content Type | `application/json` |
| Body         | `{"sender":"{sms_number}","body":"{sms_message}"}` |
| Timeout      | `30` (seconds) |

Variable names are MacroDroid's **magic text** from the SMS-Received trigger
(pick them via the "..." magic-text button next to a field, or type exactly):

- `{sms_number}` — the SMS sender address (e.g. `COMBANK` or a shortcode).
  Use this, not `{sms_name}`: `{sms_name}` resolves only for contacts you've
  saved and is empty for bank senders.
- `{sms_message}` — the full SMS text.

Notes:

- The webhook reads the sender from the JSON body, so the trigger's sender
  filter is just to avoid POSTing non-bank messages.
- Bank alerts are single-line plain text, so raw substitution into the JSON
  string is safe. If a message ever contains quotes/newlines you may see HTTP
  400 "Missing sender or body" — that's the webhook failing to parse the JSON,
  not a lost SMS; keep an eye on `lastError` in `/api/sms-health` for repeats.

## Macro 2 — heartbeat (liveness check)

### Trigger

**(+)** → **Triggers → Day/Time → Time interval**, repeat **every 6 hours**
(Day/Time lets you pick a recurring interval; pick any start time — the
interval is what matters).

### Action

**(+)** → **Actions → Net → HTTP Request** with:

| Field   | Value |
|---------|-------|
| URL     | `https://finance-tracker-ruby-eight-39.vercel.app/api/sms-health?secret=<SMS_WEBHOOK_SECRET>` |
| Method  | `GET` |
| Timeout | `15` (seconds) |

The `/api/sms-health` GET requires the webhook secret as a `?secret=` query
param (constant-time compared, same secret as the webhook) and returns 401
without it — so keep the full URL above as-is. It exposes only timestamps, no
transaction data. When the response says `healthy: false`, the forwarder
(macro 1) has been silent for 48+ hours and the phone needs attention.

## Enable & test

- Toggle both macros **on**.
- **Macro 1 test:** send yourself a test bank SMS (or make a real small
  purchase). The row should appear on the app's Review/Transactions screen, and
  `/api/sms-health` should show `attempts` increasing with `lastMethod` =
  `regex`, `llm`, or `dropped`.
- **Macro 2 test:** run the macro manually; open
  `https://finance-tracker-ruby-eight-39.vercel.app/api/sms-health?secret=<SMS_WEBHOOK_SECRET>`
  in a phone browser — it should respond with JSON.
- If nothing arrives after a test SMS: check the trigger's sender filter still
  matches the actual SMS sender ID, MacroDroid isn't battery-optimized away,
  and the SMS permission is still granted.

## Testing (developer/computer side)

From a terminal:

```bash
curl -X POST https://finance-tracker-ruby-eight-39.vercel.app/api/sms-webhook \
  -H "Content-Type: application/json" \
  -H "x-webhook-secret: <SMS_WEBHOOK_SECRET>" \
  -d '{"sender":"SAMPBANK","body":"Dear Customer, Rs 12,500.00 debited from your account. Ref 123456."}'
```

Expected response (regex path):

```json
{
  "ok": true,
  "inserted": true,
  "method": "regex",
  "parsed": { "amount": 12500, "type": "expense", "category": "Other", "needsReview": true }
}
```

Low-confidence / unparseable messages go to the LLM path and are always flagged
`needs_review: true`. Review them in the app under **Review**.

## Bank sender ID

- Confirmed: `COMBANK` (Commercial Bank alert sender).
- Card purchase + ATM withdrawal messages both match the ComBank rules and
  parse at 0.95 confidence (no review flag needed).

## Health check (forwarder liveness)

The server stamps a heartbeat row every time it receives a webhook POST. If
macro 1 silently dies (battery kill, disabled macro, sender-ID change), the
server stops hearing from the phone and you'll see a red banner on the
Dashboard after the silence threshold:

- **Dashboard banner:** "No bank SMS auto-captured for X — the phone's SMS
  forwarder may have stopped." Links to the health endpoint.
- **Health endpoint:** `GET https://finance-tracker-ruby-eight-39.vercel.app/api/sms-health?secret=<SMS_WEBHOOK_SECRET>`
  returns JSON like `{"healthy": true|false, "lastSmsAt": ..., "hoursSince": 123, ...}`.
  Open it in a browser or via macro 2 above to check the forwarder without
  waiting for a banner. The `?secret=` query param is required (401 without
  it). Threshold is 48 hours.
- The heartbeat also records how many POSTs the server has handled and the
  outcome of the last one (`lastMethod`: regex / llm / duplicate / dropped /
  error / invalid), so a browser hit to `/api/sms-health` shows whether SMS are
  reaching the server but failing to parse, versus never arriving at all.