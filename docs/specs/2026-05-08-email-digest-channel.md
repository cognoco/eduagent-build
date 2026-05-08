# Email Channel for Parent Digests

**Date:** 2026-05-08
**Owner:** ZK
**Size:** S
**Status:** Spec — not yet implemented

## Goal

Add an email delivery channel for the two parent digest notifications:

- `weekly_progress` (Mondays, 9am local)
- `monthly_report` (1st of month, 9am local)

Both currently push-only. Email is more durable, scannable, and survives push-permission gaps. Both digests should also include a brief struggle watch-line per child when relevant.

**Out of scope:** `trial_expiry` (Apple/Google + RevenueCat already send billing receipts and trial-ending warnings — duplicating would confuse). Standalone struggle emails (push only — already shipped with consent gate `2292b415`). Recall nudges and ephemeral push types (email turns into spam).

## What exists today

- `services/notifications.ts:265` — `sendEmail()` via Resend, idempotency-key support, graceful degrade on missing API key, PII-safe error logging.
- `services/notifications.ts:317` — pattern for email formatters (`formatConsentRequestEmail`, etc.).
- `inngest/functions/weekly-progress-push.ts` — fan-out cron + per-parent generator. Persists `weeklyReports` row per child idempotently. Sends one push with concatenated child summaries.
- `inngest/functions/monthly-report-cron.ts` — same shape, monthly cadence.
- `packages/database/src/schema/progress.ts:103` — `notificationPreferences.weeklyProgressPush` boolean default true. No email-channel flags yet.
- `accounts.email` — parent email available, populated from Clerk.
- `learning_profiles.struggles` JSONB array of `{topic, subject}` — canonical current-struggles state, maintained by the LLM analyzeOutcome step on every session.

## What this PR adds

### Schema

Two new boolean columns on `notification_preferences` (default `true`, mirroring push defaults):

- `weekly_progress_email`
- `monthly_progress_email`

### Service

In `services/notifications.ts`:

- `formatWeeklyProgressEmail(parentEmail, childSummaries[], struggleLines[])` → `EmailPayload`
- `formatMonthlyProgressEmail(parentEmail, monthlyReportSummary, struggleLines[])` → `EmailPayload`
- New `EmailPayload.type` enum entries: `weekly_progress`, `monthly_progress`.

### Inngest

- `weekly-progress-push.ts` per-parent generator: after the existing push send, also call `sendEmail` when `weekly_progress_email = true` AND parent has `accounts.email`. Use idempotency key `weekly-${parentId}-${reportWeek}` (Resend dedupes within 24h, Inngest step retries are safe).
- `monthly-report-cron.ts` per-pair generator: same pattern. Idempotency key `monthly-${parentId}-${reportMonth}`.

### Struggle watch-line (path A — minimal)

Per child summary:

1. Read `learning_profiles.struggles` for the child.
2. If empty → omit the watch-line entirely (quiet default).
3. If non-empty → render one line per topic, max 2 topics, format:
   > *You might want to keep an eye on **{topic}**.*

No "especially when YYYY" context in v1 — the canonical struggles JSONB stores topic + subject only. The future enrichment path (path B) is documented below.

### Struggle context — future path B (not in this PR)

Extend `learning_profiles.struggles` JSONB shape to `{topic, subject, contextNote}`. Update the analyzeOutcome LLM prompt to fill `contextNote` at struggle-detection time ("during dictation", "when working under time pressure"). Backfill is unnecessary — the field is additive, the digest just renders the YYYY clause when present:

> *You might want to keep an eye on **long division**, especially when working under time pressure.*

This is the right place to add the context — the LLM that detects the struggle has the session context already; asking again at digest time would duplicate work.

## Walkthrough per surface

**Parent with weekly+email enabled, has children with activity, child has struggles:** Push fires as today. Email also sent: per-child stats lines + per-child struggle watch-lines (if any). Risk: low.

**Parent with weekly+email enabled, child has no struggles:** Email contains the stats, no watch-line. Risk: low.

**Parent with weekly+push but email disabled:** Push only, no email. Existing behavior. Risk: zero.

**Parent has no children:** Existing skip path applies; no email. Risk: zero.

**Parent has no `accounts.email` (Clerk sync gap):** Push sends; email skipped with structured log + Sentry escalation. No silent recovery. Risk: low.

**Inngest step retried after partial success:** Resend `Idempotency-Key` dedupes within 24h; weeklyReports row already idempotent. No double-send. Risk: low.

**Solo learner / no parent profile:** No change. Email is parent-only. Risk: zero.

## Failure modes

| State | Trigger | User sees | Recovery |
|---|---|---|---|
| Resend API key missing in env | Doppler not set | Push delivers, email skipped, structured log | Add `RESEND_API_KEY` to Doppler |
| Resend API 5xx | Transient outage | Push delivers, email skipped, Sentry escalation | Inngest retries; idempotency-key prevents double-send |
| Parent has no email | Clerk webhook race / soft-deleted account | Push delivers, email skipped + Sentry | Investigate via Sentry; user re-syncs |
| Child consent WITHDRAWN / PENDING / PARENTAL_CONSENT_REQUESTED | Active consent restriction | Restricted children's rows are omitted from both push and email digests. If all linked children are restricted, the digest is skipped entirely for that period (no empty digest sent). Mirrors the `hasRestrictedConsent` rule in `ParentDashboardSummary` and the struggle notification gate (`2292b415`). | Restored when consent flips back to CONSENTED |
| `learning_profiles.struggles` malformed JSON | Schema drift | Watch-line skipped, Sentry escalation, digest still sends | Investigate schema |
| Parent email bounces (hard) | Stale email | Resend webhook event fires; downstream owner queue (existing `routes/resend-webhook.ts`) | Existing infra |
| Email rendered without rendering struggles for a child whose struggles include a long-archived topic | Stale struggles JSONB | Topic name appears in email but not on dashboard | Path B fixes by forcing fresh detection on each session |

## Decisions

1. **Consent gate parity — RESOLVED 2026-05-08.** Both push and email digests redact restricted-consent children's rows, mirroring `ParentDashboardSummary.hasRestrictedConsent` and the struggle notification gate (`2292b415`). When a child's `consent_states.status` is anything other than `CONSENTED` (i.e. `PENDING`, `PARENTAL_CONSENT_REQUESTED`, `WITHDRAWN`), their summary line is omitted. If all linked children are restricted, the digest is skipped for that period — no "empty" digest sent. **This applies to the existing push path as well**, not just the new email path: the spec ships a fix for the push gap alongside the email channel.
2. **Default state of new email preferences — RESOLVED 2026-05-08.** Both `weekly_progress_email` and `monthly_progress_email` default to `true`, matching the existing `weekly_progress_push` default. Digests are transactional (not marketing) and parents have already consented to platform comms. Settings UI to opt out lands in a follow-up; until then everyone with `weekly_progress_push = true` and a known email gets the email.

## Tests

Break tests required:

1. Email sent when both preference + parent email present.
2. Email skipped (push still fires) when `weekly_progress_email = false`.
3. Email skipped when parent has no `accounts.email`; Sentry called.
4. Struggle watch-line rendered with topic name when `learning_profiles.struggles` non-empty.
5. Watch-line omitted entirely when struggles empty.
6. Resend `Idempotency-Key` set per `parentId + reportWeek/Month`.
7. Inngest retry after transient Resend failure does not double-send.
8. Restricted-consent child's row is redacted from both push and email digests (test all three restricted statuses: `PENDING`, `PARENTAL_CONSENT_REQUESTED`, `WITHDRAWN`).
9. When all linked children are restricted, the digest is skipped entirely (no push, no email, no Sentry escalation).
10. Mixed case: parent with one CONSENTED child + one WITHDRAWN child gets a digest containing only the CONSENTED child's row.

## Sequencing

1. Schema: add the two preference columns + Drizzle migration.
2. Service: formatters + integration into the per-parent/per-pair generators.
3. Tests.
4. Doppler: confirm `RESEND_API_KEY` set on stg + prod (already used by consent emails — should already be there).
5. Mobile settings UI: not in this PR. Existing notification settings screen will need toggles before any user can opt out — track as a follow-up. Until then, default-on applies and everyone gets emails.

## Rollback

Drop the two `notification_preferences` columns. No data loss — they're additive flags. Email send is gated by the flag, so disabling the column read disables the channel.
