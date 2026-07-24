# Notion Bug Verification — Batch 8

Branch: `codex/h1-progress-contract-migration` @ HEAD `343b0502f`
Verified: 2026-05-23

---

### #84 — Extract reusable SaaS mobile template repo
- **Verdict:** NEEDS_REVIEW
- **File(s):** N/A — this is a product/initiative, not a code-defect bug. No code site to verify.
- **Evidence:** Notion body says "Extract a template-repo from the Mentomate codebase…" with bottom-up extraction layers. It's a P3 feature/spike, not a defect. No commits or branches named `template-repo` exist (`git log --all --grep "template"` empty for an extraction work-stream).
- **Confidence:** HIGH (that this is not a verifiable code bug)
- **Notion sync action:** Leave Open (it's a deferred initiative, not a fixable defect)

---

### #385 — [CR-2026-05-19-M1] Silent fallback without metric in 7+ billing/auth/webhook sites
- **Verdict:** PARTIALLY_FIXED
- **File(s):**
  - Fixed: `apps/api/src/services/safe-refresh-kv-cache.ts:36-78` (new helper used by 14+ webhook sites, with `captureException`)
  - Fixed: `apps/api/src/routes/revenuecat-webhook.ts:785-803` (unresolvable `app_user_id` now calls `captureException` + structured logger.error)
  - Fixed: `apps/api/src/middleware/profile-scope.ts:135-144` (`captureException(err, { extra: { context: 'profile-scope.auto_resolve_owner', ... } })`)
  - STILL OPEN: `apps/api/src/middleware/metering.ts:336-374` — `safeWriteKV` (L342-349) and `safeDeleteKV` (L361-373) still use `logger.warn` only, no `captureException`/`safeSend`. (Notion bug cited `services/billing/metering.ts:313` — actual location is `middleware/metering.ts`.)
  - STILL OPEN: `apps/api/src/services/quiz/complete-round.ts:553-560` — mastery upsert failure uses `logger.error` only.
  - STILL OPEN: `apps/api/src/inngest/functions/session-completed.ts:117-127` — embed failures use `logger.warn` only (the file actually is `memory-facts-embed-backfill.ts` but pattern persists).
  - STILL OPEN: `apps/api/src/services/suggestions.ts:50, 152-153` — returns `[]` / `'skipped'` sentinel with no metric.
- **Evidence:** Commit `717887d3f` (Wave 7) introduced `safeRefreshKvCache` and added `captureException` to the two webhook unresolvable-id paths, but the middleware KV write/delete wrappers and the three non-webhook silent-fallback sites listed in the Notion body remain unchanged.
- **Confidence:** HIGH
- **Notion sync action:** Investigate further — update finding to scope down to the four remaining sites; do NOT mark Resolved.

---

### #405 — [CR-2026-05-19-M21] profiles_conversation_language_check constraint drift
- **Verdict:** ALREADY_FIXED
- **File(s):**
  - `apps/api/drizzle/0087_bug405_language_check_idempotent.sql` (renumbered from the 0089 referenced in the Notion resolution comment)
  - `apps/api/src/services/onboarding-language.integration.test.ts` (guard test exists)
- **Evidence:** Migration uses the documented `DROP CONSTRAINT IF EXISTS` + `ADD CONSTRAINT … NOT VALID` + `VALIDATE CONSTRAINT` pattern with the full 10-language list (en, cs, es, fr, de, it, pt, pl, ja, nb). The Notion body's "VERIFICATION FAILED" callout from 2026-05-22 noted the file was missing on the `i18n-translations` branch — but on this branch (`codex/h1-progress-contract-migration`) the migration and guard test are both present.
- **Confidence:** HIGH
- **Notion sync action:** Move to Resolved (fixed in migration 0087 + guard test on this branch; merge timing depends on which branch lands first).

---

### #472 — [CR-2026-05-21-067] storeMilestones inserts each milestone in a separate round-trip
- **Verdict:** STILL_OPEN
- **File(s):** `apps/api/src/services/milestone-detection.ts:209-226`
- **Evidence:** The `for (const milestone of detected) { await db.insert(milestones)…onConflictDoNothing().returning(); }` loop is unchanged. Single-batched insert with `.values(detected.map(...))` not implemented.
- **Confidence:** HIGH
- **Notion sync action:** Leave Open.

---

### #515 — [CR-2026-05-21-110] SSO callback maybeCompleteAuthSession failure leaves user 10s
- **Verdict:** ALREADY_FIXED
- **File(s):** `apps/mobile/src/app/sso-callback.tsx:36-65`
- **Evidence:** Both fixes the Notion bug requested are implemented and explicitly tagged `[CR-2026-05-21-110]`:
  - L42-44: `handleError` calls `setShowFallback(true)` immediately rather than waiting 10s.
  - L60-65: New `useEffect` watches `useAuth().isSignedIn` and `router.replace('/')` when signed in.
- **Confidence:** HIGH
- **Notion sync action:** Move to Resolved (fixed on this branch; check `git log --grep "CR-2026-05-21-110"` for the commit hash).

---

### #561 — [CR-2026-05-21-156] format-api-error TypeError network branch unreachable
- **Verdict:** PARTIALLY_FIXED
- **File(s):** `apps/mobile/src/lib/format-api-error.ts:382-401`
- **Evidence:** A typed `NetworkError` classifier was added at L382-389 (handles `customFetch`-wrapped calls). The brittle `TypeError`/`msg.includes('fetch') || msg.includes('network')` branch is retained at L391-401 and now labeled "Legacy TypeError from native fetch (raw fetch calls outside customFetch)". The Notion bug's full ask was "Audit remaining raw fetch() callsites; route through wrapper that throws typed NetworkError. Then delete this branch." The deletion has not happened; raw fetch callsites have not been swept.
- **Confidence:** HIGH
- **Notion sync action:** Investigate further — update finding to "audit raw fetch callsites and delete legacy TypeError branch"; keep Open at lower priority.

---

### #591 — [AUTH-02] Email sign-up never reaches verification on web
- **Verdict:** STILL_OPEN
- **File(s):** `apps/mobile/src/app/(auth)/sign-up.tsx:244-271` + Clerk Smart CAPTCHA mount
- **Evidence:**
  - `onSignUpPress` (L256-265) calls `signUp.create()` then `signUp.prepareEmailAddressVerification({ strategy: 'email_code' })` then `setPendingVerification(true)`.
  - No `<div id="clerk-captcha" />` exists in the mobile codebase (grep `clerk-captcha|captcha` against `apps/mobile` returns zero hits).
  - The Notion bug's reported console message ("Cannot initialize Smart CAPTCHA widget because the clerk-captcha DOM element was not found; falling back to Invisible CAPTCHA widget") indicates the web build needs the Smart CAPTCHA mount point. No commit named `AUTH-02` or `captcha` exists in `git log --all --grep`.
- **Confidence:** MEDIUM (high that the captcha mount is missing; medium that this is the actual cause of the stall — could also be a Clerk web SDK error swallowed by the catch block since the bug reports "no visible error").
- **Notion sync action:** Leave Open (P1; needs web-platform captcha element + visible error surfacing).

---

### #607 — [CC-11] Subscription and child paywall ignore app language
- **Verdict:** STILL_OPEN
- **File(s):** `apps/mobile/src/app/(app)/subscription.tsx`
- **Evidence:** All hardcoded English strings cited in the Notion body are still hardcoded:
  - L491 "Back"; L497 "Nice work so far!"; L501-504 "You learned X topics and earned Y XP — great work!"; L507-508 "You've used all your free questions. Ask your parent to upgrade…"; L520-521 "Parent already notified" / "Notify my parent"; L531 "Parent notified" / "Notify My Parent"; L566/569 "Browse Library"; L578/581 "See your progress"; L762-763 "Restore failed" / "Could not restore purchases. Please try again."; L1761-1767 "Verifying purchase…" / "Restoring…" / "Restore Purchases"; L1900 "Bring your own key"; L1904-1906 BYOK body; L1916-1917 BYOK accessibility labels.
  - `useTranslation` is imported at L25 and `t()` initialized at L625-626 (Notion-cited lines), but the paywall/restore/BYOK blocks were not migrated.
- **Confidence:** HIGH
- **Notion sync action:** Leave Open (P2; needs i18n migration sweep across this file).

---

## Summary

| BugId | CR / Tag | Verdict | Confidence |
|-------|----------|---------|------------|
| #84   | Template repo (initiative) | NEEDS_REVIEW | HIGH |
| #385  | CR-2026-05-19-M1 | PARTIALLY_FIXED | HIGH |
| #405  | CR-2026-05-19-M21 | ALREADY_FIXED | HIGH |
| #472  | CR-2026-05-21-067 | STILL_OPEN | HIGH |
| #515  | CR-2026-05-21-110 | ALREADY_FIXED | HIGH |
| #561  | CR-2026-05-21-156 | PARTIALLY_FIXED | HIGH |
| #591  | AUTH-02 | STILL_OPEN | MEDIUM |
| #607  | CC-11 | STILL_OPEN | HIGH |
