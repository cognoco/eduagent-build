# UX & failure modes / dead-ends — Bug Review

Lens: UX & failure modes / dead-ends. Owned area: `apps/mobile/src/app/**`, `apps/mobile/src/components/**`, `apps/mobile/src/lib/{api-errors,format-api-error,api-client}*`.

## Summary

This codebase has clearly absorbed the prior 44-dead-end UX audit. The error-classification boundary (`api-client.ts` `customFetch` → typed errors; `format-api-error.ts` `classifyApiError`) is centralized and strong: every HTTP status is classified into a typed error class once at the client boundary, screens do NOT parse HTTP status codes (verified — every `.status ===` hit in `apps/mobile/src/app` is a domain-state check, not an HTTP read), and reusable `ErrorFallback` / `TimeoutLoader` / `EmptyStateCard` / `SessionErrorBoundary` components exist and are widely used. High-traffic flows (quiz play, session, vocabulary, child curriculum, consent gates, `+not-found`) all have loading/empty/error triads with retry + escape.

The residual findings are concentrated in ONE repeating anti-pattern: several screens surface a **raw `err.message`** to the user (alert body or inline error text) instead of routing through `formatApiError`. This is exactly the leak that `format-api-error.ts`'s `isTechnicalMessage` / `shouldPassThroughUserMessage` gates were built to prevent — these screens bypass that gate. Plus a cluster of hardcoded-English error copy (cross-lens i18n). No true escape-less dead-ends were found.

---

## Critical

None found. No screen was found that can strand the user with zero actionable affordance.

---

## High

### [High] Raw `err.message` leaks to users on the consent-withdraw / restore path (parent surface)
- File: `apps/mobile/src/app/(app)/child/[profileId]/index.tsx:552-556` (`consentMutationErrorMessage`), surfaced at `:638`
- What: `consentMutationErrorMessage(err)` returns `err instanceof Error ? err.message : 'Could not update consent…'`. The result is shown verbatim in the consent-management section after a failed `revokeConsent` / `restoreConsent` mutation (`:606`, `:617`, `:638`). The typed errors thrown by `customFetch` (`UpstreamError`, `ForbiddenError`, `NotFoundError`) carry the **server-side message string** verbatim, and a caught Hermes/runtime error would carry an engine string. None of these pass through `formatApiError`'s `isTechnicalMessage` filter.
- Impact: On a 5xx, proxy-mode rejection, or unexpected error during a legally sensitive consent action, the parent can see technical text (server stack fragment, "UPSTREAM_ERROR", Cloudflare "error code: 1102", or a JS engine message) instead of a friendly, actionable string. The action also gives no retry button — only an inline error line — so the recovery is "tap the original button again" with no guidance.
- Fix direction: Replace `consentMutationErrorMessage` body with `formatApiError(err)` (already imported elsewhere in the tree). Consider rendering the failure with `recoveryActions(classifyApiError(err), …)` so consent failures get a real retry/go-back affordance rather than a bare red line.

---

## Medium

### [Medium] Raw `err.message` surfaced on progress refresh failure
- File: `apps/mobile/src/app/(app)/progress/index.tsx:233-235`
- What: `const message = err instanceof Error ? err.message : t('progress.refreshFailed'); platformAlert(t('progress.refreshFailedTitle'), message)`. The raw error message is shown in the alert body instead of `formatApiError(err)`.
- Impact: A 5xx / network / runtime error during the progress snapshot refresh leaks the raw message (potentially "Internal server error", an upstream JSON fragment, or a Hermes string) to the learner. The classifier's friendly-message map and technical-message filter are bypassed.
- Fix direction: `platformAlert(t('progress.refreshFailedTitle'), formatApiError(err))`.

### [Medium] Raw `err.message` in bookmark-delete and bookmark-list error states
- File: `apps/mobile/src/app/(app)/progress/saved.tsx:121` (delete alert) and `:209-211` (list error body)
- What: Delete failure shows `error instanceof Error ? error.message : t('common.tryAgain')`; the list-error fallback shows `bookmarksQuery.error instanceof Error ? bookmarksQuery.error.message : t('progress.saved.errorNetwork')`. Both render the raw error string rather than `formatApiError`.
- Impact: Raw server/runtime text can reach the user. The list-error triad itself is otherwise good (retry + go-back present); only the body text is unsafe.
- Fix direction: Route both through `formatApiError(error)`.

### [Medium] Raw `err.message` surfaced in dictation result-save failures
- File: `apps/mobile/src/app/(app)/dictation/review.tsx:76-78` and `apps/mobile/src/app/(app)/dictation/complete.tsx:258, 305-306`
- What: On a failed `recordResult` mutation the alert body is `err instanceof Error && err.message ? err.message : t('dictation.review.couldNotSaveResult')` (and equivalent in `complete.tsx`). Raw message, not `formatApiError`. (Note: the recovery itself is good — both offer Retry + "Continue without saving", so there is no dead-end here, only a message-hygiene leak.)
- Impact: Technical strings can leak into the save-failure alert. Lower reach than progress/consent because dictation is a narrower flow.
- Fix direction: Replace the raw-message ternaries with `formatApiError(err)`.

### [Medium] Raw `err.message` in vocabulary-subject screen error
- File: `apps/mobile/src/app/(app)/vocabulary/[subjectId].tsx:149` (raw `err.message` in error path)
- What: An error path surfaces `err.message` directly rather than the classified message.
- Impact: Same leak class on the vocabulary detail screen.
- Fix direction: Use `formatApiError(err)`.

### [Medium] `SessionErrorBoundary` renders the raw crash `error.message` to the user
- File: `apps/mobile/src/app/(app)/session/_components/SessionErrorBoundary.tsx:74`
- What: The session crash boundary shows `{this.state.error?.message ?? 'Unknown error'}` as user-facing body copy (not gated behind `__DEV__` — only the stack trace at `:87` is dev-gated). The heading is the hardcoded English "Session screen crashed" (`:64`).
- Impact: On any uncaught render exception in the session screen (the app's core flow), the user sees the raw JS error message (e.g. "Cannot read properties of undefined…", "Property 'crypto' doesn't exist") — exactly the class of string `format-api-error.ts` documents (`:160-166`) must never reach a user. The Try Again / Go Home escapes are present (good — no dead-end), but the copy is a developer message. Also not localized.
- Fix direction: Show a fixed friendly i18n string as the body (e.g. `errors.generic`), keep the raw `error.message` for Sentry/`__DEV__` only. Localize the heading.

### [Medium] `my-notes` list error/empty/loading copy is hardcoded English (bypasses i18n)
- File: `apps/mobile/src/app/(app)/my-notes/[kind].tsx:495` ("Couldn't load …"), `:511` ("No … yet"), `:515` ("They'll show up here…"), and section titles `titleForKind` `:64-73` ("Notes"/"Bookmarks"/"Sessions"), subtitle builder `:75-85`
- What: The error, empty, and loading states (and the screen title/subtitle) are built from hardcoded English literals rather than `t(...)`. The triad logic itself is correct (loading spinner, error with retry at `:497-507`, empty state), but the strings render English to every locale.
- Impact: Non-English users (de/es/ja/nb/pl/pt and the conversation-only locales) see English in the My Notes archive, including the error-recovery button. Functional, not a dead-end, but a localization failure on a user-visible recovery surface.
- Fix direction: Move all literals to `t(...)` keys in `en.json` and run `pnpm translate`. (Cross-lens: i18n.)

---

## Low

### [Low] Hardcoded English in session challenge-round and note error alerts
- File: `apps/mobile/src/app/(app)/session/index.tsx:993, 1004, 1012, 1027` and `:1066-1067` ("Couldn't save the note" / "Please try again." / "Couldn't start the challenge round" / "Could not skip warm-up")
- What: Several catch-block `platformAlert(...)` calls in the session screen use hardcoded English titles and the literal body "Please try again." instead of `t(...)`. Recovery exists (the alert dismisses and the user can retry the action), so no dead-end — but the copy is unlocalized and the body is generic rather than classified.
- Impact: English error toasts for non-English users on the core session surface; generic "Please try again." hides the actual reason (e.g. quota, network) that `formatApiError` would surface.
- Fix direction: Localize via `t(...)`; pass `formatApiError(err)` as the body where an error object is available (the `runChallengeAction` catch currently swallows the error entirely — capture it and format it).

### [Low] `speech.error` surfaced raw to the microphone alert
- File: `apps/mobile/src/app/(app)/homework/camera.tsx:195-198`
- What: `platformAlert(t('homework.microphoneUnavailableTitle'), speech.error)` — the raw speech-recognition error string is the alert body. (Contrast with the OCR path right below at `:210-219`, which correctly maps a typed `errorCode` to localized copy and keeps the raw string for Sentry only.)
- Impact: A native speech-module error string can leak to the user, unlocalized. Low reach (voice-input path only).
- Fix direction: Map `speech.error` / a speech error code to a localized message, mirroring the OCR `errorCode` pattern at `:214-216`; keep the raw string for diagnostics only.

### [Low] `TimeoutLoader` 15s escape is opt-in; long-loading screens that use a bare `ActivityIndicator` have no timeout escape
- File: `apps/mobile/src/components/common/TimeoutLoader.tsx` (the component is correct); gap is at consumer sites that use a bare `ActivityIndicator` for the loading branch — e.g. `apps/mobile/src/app/(app)/my-notes/[kind].tsx:488-490`, `apps/mobile/src/app/(app)/progress/saved.tsx:188-194`, `apps/mobile/src/app/(app)/child/[profileId]/curriculum.tsx:229-238`
- What: `TimeoutLoader` gives a 15s "still loading… here's an escape" fallback, but it is only used on a handful of screens. Most list/detail loading states render a bare `<ActivityIndicator />` inside `ListEmptyComponent`. If the underlying query hangs (TanStack Query default has no hard timeout; `customFetch` only throws `NetworkError` when fetch itself rejects), these screens spin indefinitely with no escape — the user must background-kill or hit the OS back gesture.
- Impact: A wedged request (server accepted the socket but never responds) leaves the user on an infinite spinner with no in-screen action. Lower severity because most of these screens still have a header back button; pure full-screen-spinner branches (e.g. `child/[profileId]/curriculum.tsx:229-238`) have no back affordance during the spinner.
- Fix direction: Adopt `TimeoutLoader` (or a shared `isError`-style timeout) for full-screen loading branches, especially ones without a persistent header back button. Alternatively set a query-level timeout that flips `isError` so the existing error triad fires.

### [Low] `progress/saved` empty-state CTA is library-only; no path for a learner with no library yet
- File: `apps/mobile/src/app/(app)/progress/saved.tsx:250-264`
- What: The bookmarks empty state offers a single CTA "Go to Library" (`router.replace('/(app)/library')`). For a brand-new learner who has no subjects/library content, this routes to a (likely also-empty) Library rather than to a start-learning action.
- Impact: Mild — not a dead-end (Library has its own empty state), but the CTA can chain empty→empty. Low.
- Fix direction: Consider routing to the start-a-subject / home action when the learner has no subjects, mirroring the new-learner branching used in `progress/vocabulary.tsx:250-272`.

---

## Cross-lens findings

- **i18n / hardcoded English (belongs to the i18n lens):** Hardcoded user-visible English strings on recovery and list surfaces — `my-notes/[kind].tsx:64-85, 495, 511, 515`; `session/index.tsx:993, 1004, 1012, 1027, 1067`; `SessionErrorBoundary.tsx:64`; `child/[profileId]/index.tsx:555` fallback string. These match the documented "Known gap (tracked separately)" in CLAUDE.md (hardcoded JSX literals bypass the `t()` orphan-key checker, Phase 3 ratchet TBD). Flagged here because they land on error/empty recovery copy, but the fix is i18n-lens.

- **LLM-envelope / streaming reliability (belongs to the session/LLM lens):** `session/index.tsx` `runChallengeAction` (`:989-998`) swallows the caught error entirely (`catch { platformAlert(title, 'Please try again.') }`) — no Sentry capture and no `formatApiError`. The "Silent recovery without escalation is banned" rule (CLAUDE.md Fix Development Rules) suggests these catch blocks should at least `Sentry.captureException`. Reliability/observability lens should confirm whether the challenge-round mutation failures are tracked anywhere.

- **Security / data-integrity (belongs to the auth/scoping lens):** The raw-`err.message` leak on `child/[profileId]/index.tsx` consent path (High above) is also a minor information-disclosure concern if server error messages ever embed internal identifiers — worth a second look from the security lens on what the consent-mutation endpoints put in their error bodies.

- **Billing (belongs to the billing lens):** Did not deep-audit `subscription.tsx` / `_subscription/purchase-errors.ts` purchase-failure dead-ends in this pass beyond confirming `ErrorFallback`/`classifyApiError` usage exists; the billing lens should verify the RevenueCat purchase-error discriminator (referenced in `format-api-error.ts:10-11` as having "their own discriminator in subscription.tsx") gives every failed-purchase state an escape.
