# Batch 3 — Notion Bug Verification

Branch: `codex/h1-progress-contract-migration` (HEAD `343b0502f`).
Note: actual checked-out branch differs from the prompt's `codex/h1-isowner-navigation-contract-sweep`, but HEAD matches.

---

### #65 — [PARENT-04/PARENT-05/PARENT-11] Seeded child session card missing for drill-down/recap flows
- **Verdict:** NEEDS_REVIEW
- **File(s):** `apps/api/src/services/test-seed.ts:946-973` (session1Id seed); `apps/api/src/services/dashboard.ts` (children sessions endpoint); `apps/mobile/src/app/(app)/child/[profileId]/topic/[topicId].tsx` (filter + render).
- **Evidence:** Code matches the resolution's investigation exactly — `parent-multi-child` seeds `session1Id` for Emma (child1) in Mathematics with CONSENTED GDPR (test-seed.ts:946-957 + consentStates row before that). No code-level defect found. Bug body itself acknowledges this may be transient seed/data state and asks for J-16/J-17 Playwright re-run against staging. Cannot resolve from code inspection alone.
- **Confidence:** HIGH (that code is correct); resolution depends on empirical Playwright run.
- **Notion sync action:** Investigate further (run J-16/J-17 against current staging; close as code-correct if green, refile if red).

### #265 — E2E flow rewrite — delete-account flows route through More → Privacy
- **Verdict:** PARTIALLY_FIXED
- **File(s):** `apps/mobile/src/app/delete-account.tsx:395,401` (warning body testIDs added); `apps/mobile/src/app/(app)/more/privacy.tsx:160` (more-row-delete-account row); `apps/mobile/e2e/flows/account/delete-account.yaml` (still tagged `nightly`, DEMOTED comment present); `apps/mobile/e2e/flows/account/delete-account-scheduled.yaml`.
- **Evidence:** Commit `e0c1c388d` ("fix(mobile): update delete-account E2E flows for M1-A routing refactor") rewrote both YAMLs to navigate More → Privacy → delete-account-row, added testID anchors, hideKeyboard, and post-cancel Privacy assertion. All code-side fixes are present on HEAD. Both YAMLs still carry the `nightly` tag and `DEMOTED 2026-05-19` comment — the explicit promotion gate ("Both flows 2x green on WHPX Pixel API 34") has not been recorded. Resolution narrative itself says: "Status kept In progress pending the promotion gate ... until that runs, the pr-blocking tag is reasoning-based, not empirically verified."
- **Confidence:** HIGH.
- **Notion sync action:** Leave Open (code rewrite done; still awaits empirical 2x-green promotion gate before re-tagging pr-blocking).

### #394 — [CR-2026-05-19-M10] Parent dashboard aggregation/timezone/cache-staleness in 5+ sites
- **Verdict:** STILL_OPEN (all 5 sub-sites unchanged)
- **File(s):**
  - `apps/api/src/services/dashboard.ts:763-769` (batch sessions — no `ne(status,'active')` filter)
  - `apps/api/src/services/dashboard.ts:1089-1095` (single-child sessions — same)
  - `apps/api/src/services/dashboard.ts:831-837` (consent dedup — `orderBy: desc(requestedAt)` only, no secondary key)
  - `apps/api/src/services/dashboard.ts:459-466` and `:654-661` (engagementTrend still fires 'declining' when `sessionsThisWeek === 0` past MIN_TREND_SESSIONS)
  - `apps/api/src/routes/dictation.ts:226` (`new Date().getFullYear() - profileMeta.birthYear` — still calendar-year math, not `computeAgeBracket`)
  - `apps/api/src/services/billing/trial.ts:231-238` (UTC-midnight day boundaries in `findExpiredTrialsByDaysSinceEnd`)
- **Evidence:** All five suggested fixes from the Notion body are unimplemented. Latest dashboard.ts touches (`ae5cacc8a` sweep WIP4, `407ca9d8a` wave 2) did not address these specific sub-issues. Latest dictation.ts touch (`040b32f43` birthYear null trap) did not switch to `computeAgeBracket`.
- **Confidence:** HIGH.
- **Notion sync action:** Leave Open.

### #430 — [CR-2026-05-21-025] exchangeEmptyReplyFallback bare-casts event.data
- **Verdict:** ALREADY_FIXED
- **File(s):** `apps/api/src/inngest/functions/exchange-empty-reply-fallback.ts:26-53`
- **Evidence:** Zod schema `exchangeEmptyReplyFallbackDataSchema` (sessionId/profileId/flow/exchangeCount/reason required, rawResponsePreview optional) is defined at lines 31-38; line 47 calls `safeParse(event.data)` and emits `exchange.empty_reply_fallback.invalid_payload` warn on failure. Inline comment explicitly cites `CR-2026-05-21-025`. Fixed in commit `07993f2bb` ("fix(apps/api): harden env-validation, deletion race, and empty-reply-fallback payload [CR-2026-05-21-099] [CR-2026-05-21-100] [CR-2026-05-21-025]").
- **Confidence:** HIGH.
- **Notion sync action:** Move to Resolved (fixed in `07993f2bb`).

### #500 — [CR-2026-05-21-095] jwt.ts importRSAPublicKey hardcodes RS256
- **Verdict:** STILL_OPEN
- **File(s):** `apps/api/src/middleware/jwt.ts:206-220`, used at `:248-259`
- **Evidence:** `importRSAPublicKey` hardcodes `alg: 'RS256'` (line 213) and `hash: 'SHA-256'` (line 216); `verifyJWT` (lines 229-263) never reads `header.alg`, never validates against an allowlist, never explicitly rejects `alg=none` / `HS*`. Latest touches `fb2397f05` and `02ed38610` addressed JWKS key-rotation and timeout, not alg enforcement.
- **Confidence:** HIGH.
- **Notion sync action:** Leave Open.

### #524 — [CR-2026-05-21-119] Cross-tab push from progress to weekly-report/[id] skips intermediate segment
- **Verdict:** STILL_OPEN
- **File(s):** `apps/mobile/src/app/(app)/progress/index.tsx:791-807` and `:836-839`; directories `apps/mobile/src/app/(app)/child/[profileId]/weekly-report/` and `…/report/` (no `_layout.tsx`, no `index.tsx`).
- **Evidence:** `handleOpenWeeklyReport` (lines 836-839) and the parallel report handler (lines 819-822) push 2 segments deep cross-tab into `/(app)/child/[profileId]/weekly-report/[weeklyReportId]` and `/(app)/child/[profileId]/report/[reportId]`. Directory listing confirms only `[weeklyReportId].tsx` and `[reportId].tsx` exist in those subdirs — no `_layout.tsx` to seed `unstable_settings.initialRouteName`. The 'push the chain' or 'add _layout' fix from the Notion body has not been applied.
- **Confidence:** HIGH.
- **Notion sync action:** Leave Open.

### #580 — [CR-2026-05-21-175] Classification observability events have every field optional
- **Verdict:** STILL_OPEN
- **File(s):** `packages/schemas/src/inngest-events.ts:176-207`
- **Evidence:** `classificationCompletedEventSchema` (lines 176-182), `classificationSkippedEventSchema` (187-192), and `classificationFailedEventSchema` (197-204) all have every field optional — `safeParse({})` would succeed on each. `sessionId` is not required on any of the three. No fix in latest touches (`32946837b`, `ae5cacc8a`, `41dc5878d`).
- **Confidence:** HIGH.
- **Notion sync action:** Leave Open.

### #601 — [SUBJECT-01] Child curriculum cannot create or manage child-scoped subjects
- **Verdict:** STILL_OPEN
- **File(s):** `apps/mobile/src/app/create-subject.tsx:251-321`; `apps/mobile/src/hooks/use-subjects.ts:109-132`; `apps/api/src/routes/subjects.ts:88-99`; `apps/mobile/src/app/(app)/child/[profileId]/subjects/[subjectId].tsx` (read-only).
- **Evidence:** `create-subject.tsx` still drives adult subject creation (`createSubject.mutateAsync({ name, ... })` at :251 with no `forProfileId` / child scoping). `useCreateSubject` posts via `client.subjects.$post` to the active profile, no child-profile parameter. `POST /subjects` at routes/subjects.ts:88-99 still uses `requireProfileId(c.get('profileId'))` (active scoped profile) + `assertNotProxyMode(c)` — there is no parent-on-behalf-of-child write path. Grep across `apps/mobile/src/app/(app)/child/**` finds zero references to `create-subject` or `useCreateSubject` — confirming child surfaces are read-only.
- **Confidence:** HIGH.
- **Notion sync action:** Leave Open.

### #614 — [BILLING-08] Pro family owner does not load family-pool details on Subscription
- **Verdict:** STILL_OPEN
- **File(s):** `apps/mobile/src/app/(app)/subscription.tsx:645-646`; `packages/schemas/src/billing.ts:119-128,169` (schema confirms `family` plan shape).
- **Evidence:** Line 646: `useFamilySubscription(subscription?.tier === 'family')` — query is enabled only when tier is exactly `family`. Pro tier (which the bug body says is also multi-profile family-capable per schema) is excluded, so the family pool section is omitted for Pro owners. Latest touches (`98eceea66`, `b4c0ef185`, `c925a91a4`) did not widen this predicate. No `tier === 'pro'` branch added.
- **Confidence:** HIGH.
- **Notion sync action:** Leave Open.

---

## Summary

| BugId | CR / Tag | Verdict | Confidence |
|-------|----------|---------|-----------|
| #65   | PARENT-04/05/11           | NEEDS_REVIEW    | HIGH |
| #265  | E2E delete-account rewrite | PARTIALLY_FIXED | HIGH |
| #394  | CR-2026-05-19-M10          | STILL_OPEN       | HIGH |
| #430  | CR-2026-05-21-025          | ALREADY_FIXED    | HIGH |
| #500  | CR-2026-05-21-095          | STILL_OPEN       | HIGH |
| #524  | CR-2026-05-21-119          | STILL_OPEN       | HIGH |
| #580  | CR-2026-05-21-175          | STILL_OPEN       | HIGH |
| #601  | SUBJECT-01                 | STILL_OPEN       | HIGH |
| #614  | BILLING-08                 | STILL_OPEN       | HIGH |
