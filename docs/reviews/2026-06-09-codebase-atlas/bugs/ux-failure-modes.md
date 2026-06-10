# UX & failure modes / dead-ends — Bug Review

> **Pruned 2026-06-10** — findings verified FIXED against `new-llm` HEAD were removed in this pass; only still-live findings remain below. Full original review is in git history.

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

_All previously-listed items verified fixed on 2026-06-10 and pruned._

---

## Low

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

- **i18n / hardcoded English (belongs to the i18n lens):** Hardcoded user-visible English strings on recovery and list surfaces — `child/[profileId]/index.tsx:555` fallback string. These match the documented "Known gap (tracked separately)" in CLAUDE.md (hardcoded JSX literals bypass the `t()` orphan-key checker, Phase 3 ratchet TBD). Flagged here because they land on error/empty recovery copy, but the fix is i18n-lens.

- **Security / data-integrity (belongs to the auth/scoping lens):** The raw-`err.message` leak on `child/[profileId]/index.tsx` consent path (High above) is also a minor information-disclosure concern if server error messages ever embed internal identifiers — worth a second look from the security lens on what the consent-mutation endpoints put in their error bodies.

- **Billing (belongs to the billing lens):** Did not deep-audit `subscription.tsx` / `_subscription/purchase-errors.ts` purchase-failure dead-ends in this pass beyond confirming `ErrorFallback`/`classifyApiError` usage exists; the billing lens should verify the RevenueCat purchase-error discriminator (referenced in `format-api-error.ts:10-11` as having "their own discriminator in subscription.tsx") gives every failed-purchase state an escape.
