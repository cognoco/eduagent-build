# [MEDIUM] Freeform filing retry transmits learner transcript to LLM without re-checking GDPR consent

**File:** [`apps/api/src/inngest/functions/freeform-filing.ts`](https://github.com/cognoco/eduagent-build//blob/main/apps/api/src/inngest/functions/freeform-filing.ts#L148-L176) (lines 148, 161, 169, 176)
**Project:** eduagent-build
**Severity:** MEDIUM  •  **Confidence:** medium  •  **Slug:** `other-missing-gdpr-consent-gate`

## Owners

**Suggested assignee:** `zuzana.kopecna@zwizzly.com` _(via last-committer)_

## Finding

The `app/filing.retry` handler (`runFreeformFiling`) builds a session transcript — either from the event payload or by self-healing via `getSessionTranscript(db, profileId, sessionId)` — and passes it to `fileToLibrary({ sessionTranscript, sessionMode }, libraryIndex, routeAndCall)` (L169-176). `fileToLibrary` (services/filing.ts:306-344) embeds the transcript into a prompt and calls `routeAndCall(messages, 1)`, transmitting the learner's conversation to an external LLM provider — the regulated processing act under GDPR Art. 7(3).

This handler does NOT call `isGdprProcessingAllowed(db, profileId)` before that transmission. This is a drift from the codebase's own established, documented pattern: at least seven sibling background jobs re-check consent at execution time before sending learner data to an LLM (progress-summary.ts, post-session-suggestions.ts, subject-prewarm-curriculum.ts, subject-retry-curriculum.ts, monthly-report-cron.ts, session-completed.ts, and the notification service). Most tellingly, session-completed.ts:1391-1396 gates the *identical* transcript→LLM operation and carries the comment: "...transcript would still be transmitted to the external LLM provider (the regulated processing act under GDPR Art. 7(3)) before applyAnalysis later blocks only the write." CLAUDE.md and the project threat model both state background jobs run outside the HTTP consent middleware and must re-check consent before sending learner data to an LLM.

Attack/trigger window: consent is withdrawn for a child after a session but before its filing retry runs. The profile still exists during the 7-day revocation grace period, and `filing-timed-out-observe.ts` auto-dispatches `app/filing.retry`, so a transcript belonging to a profile whose consent was withdrawn can be reprocessed by the external LLM with no gate. The self-heal `fetch-transcript` step checks only `transcript.archived`, not consent, and the event-supplied transcript path skips even that. This is a privacy/regulatory-compliance gap (processing personal data after consent withdrawal), not a cross-tenant access issue — `createScopedRepository(profileId)` correctly prevents the retry from filing into another profile's library.

## Recommendation

Inside `runFreeformFiling`, before building/sending the transcript to the LLM, add the same gate the sibling jobs use, e.g. a `step.run('check-gdpr-consent', ...)` that calls `isGdprProcessingAllowed(db, profileId)` and short-circuits (NonRetriableError or a 'consent_blocked' no-op return) when it returns false. Place it before the `fetch-transcript`/`retry-filing` steps so neither the DB transcript fetch nor the LLM call occurs for a withdrawn-consent profile. Add a red-green regression test asserting that `routeAndCall`/`fileToLibrary` is never invoked when consent is PENDING/PARENTAL_CONSENT_REQUESTED/WITHDRAWN, mirroring the session-completed.ts consent-gate test.

## Revalidation

**Verdict:** true-positive

Confirmed real. `runFreeformFiling` (handler for `app/filing.retry`, registered lines 218-226) builds a session transcript either from the event payload or by self-healing via `getSessionTranscript(db, profileId, sessionId)` (lines 148-161 — which checks only `transcript.archived`, NOT consent), then calls `fileToLibrary({ sessionTranscript, sessionMode }, libraryIndex, routeAndCall)` (172-176). I verified `fileToLibrary` (services/filing.ts:306-344) embeds the transcript into `buildPostSessionPrompt` and calls `routeAndCall(messages, 1)` (line 344) — the external-LLM transmission that is the regulated processing act. The file imports no consent helper and calls `isGdprProcessingAllowed` nowhere (grep: 0 matches). This is a clear drift from an established, deliberate pattern: the IDENTICAL transcript→LLM operation in session-completed.ts:1387-1396 is gated by `isGdprProcessingAllowed` BEFORE the LLM call, with a `[WI-221]` comment stating that without it 'a withdrawn-but-memory-granted profile's transcript would still be transmitted to the external LLM provider (the regulated processing act under GDPR Art. 7(3))' — and that the memory/archival guards are insufficient because `revokeConsent` sets GDPR status to WITHDRAWN without clearing them. All four sibling jobs reviewed above gate consent; freeform-filing does not. Reachability is strong: `app/filing.retry` is dispatched from production routes (routes/filing.ts:110/176/245, routes/sessions.ts:352) and auto-dispatched by filing-timed-out-observe.ts:182 with a transcript-less payload that forces the self-heal path (consent-blind `archived`-only check). Trigger window: consent withdrawn (revokeConsent → WITHDRAWN, consent.ts:1139+) after a session but before its filing retry runs; the profile/transcript still exist during the revocation grace period, so the transcript is re-sent to the LLM for a withdrawn-consent profile. This is a genuine GDPR-compliance gap (processing after withdrawal), correctly scoped by the finding as NOT a cross-tenant issue since `createScopedRepository(profileId)` still prevents cross-profile filing. MEDIUM severity is appropriate: full-transcript sensitivity is high, but the trigger requires a timeout/retry-or-replay coinciding with an in-window withdrawal, and no access boundary is crossed.

## Recent committers (`git log`)

- Zuzana Kopečná <zuzana.kopecna@zwizzly.com> (2026-05-29)
