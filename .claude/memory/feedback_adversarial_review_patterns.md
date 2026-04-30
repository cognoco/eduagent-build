---
name: Adversarial Review Patterns — Recurring Pitfalls
description: Three recurring bug categories found in the 2026-04-05 UX-resilience pass — response body double-consumption, error classifier ordering, and dead code from incremental refactors
type: feedback
---

Three systemic patterns surfaced during the adversarial review of the UX-resilience branch (2026-04-05, 35 files). Apply these checks whenever writing or reviewing similar code.

## 1. Response Body Double-Consumption

`fetch` Response bodies are single-use streams. If `res.json()` throws, calling `res.text()` afterward returns empty or throws again.

**Rule:** Never call both `.json()` and `.text()` on the same Response. Either clone first (`res.clone()`) or read as `.text()` once and `JSON.parse` manually.

**Why:** `assert-ok.ts` had a catch branch that called `res.text()` after `res.json()` had already consumed the stream — the fallback message logic could never fire.

**How to apply:** In any `assertOk`-style helper, error-extraction middleware, or SSE error handler that needs both JSON and raw text from a response.

## 2. Error Classifier Must Run on Raw Errors

When you have a raw-error classifier (e.g., `isReconnectableSessionError`) and a user-facing formatter (`formatApiError`), the classifier must inspect the **raw** error object, never the formatted string.

**Rule:** Always classify errors before formatting. The formatter strips status codes, error codes, and keywords that classifiers depend on.

**Why:** `isReconnectableSessionError` string-matched for "network", "timed out", etc. — but `formatApiError` transforms those into "Something unexpected happened" which matches none of those keywords. Reconnect button would never appear.

**How to apply:** In session screens, SSE error handlers, and any code that branches on error *type* vs. error *presentation*. Classify first, format for display second.

## 3. Clean Up Dead Code During Incremental Refactors

When removing a feature (persona picker, legacy recovery keys, error code fallbacks), delete **all** artifacts: types, imports, commented-out JSX, and fallback code paths that are now unreachable.

**Rule:** After removing a feature, grep for all references. Orphaned types, unreachable fallback branches, and legacy SecureStore keys are bugs — they create false confidence in test coverage and leak storage.

**Why:** `PersonaType` type was still declared after persona removal. `parseApiStatus` fallback was unreachable after `parseApiBody` was added (same regex). Legacy `RECOVERY_KEY` fallback read was removed but markers written under the old key are now orphaned in SecureStore forever.

**How to apply:** After any refactor that removes a code path, run a project-wide grep for the removed identifier/key/constant. If anything references it, either delete the reference or explain why it must stay.

## 4. Undefined References in JSX — Always Verify Handlers Exist

When adding UI elements that reference callback functions (`onPress={handleRetry}`), verify the function is defined in the component scope.

**Rule:** Every `onPress`, `onSubmit`, or event handler referenced in JSX must be defined or imported. A missing handler is a **runtime crash**, not a lint warning.

**Why:** `library.tsx` referenced `handleRetry` in a "Check again" button but the function was never defined — guaranteed `ReferenceError` at runtime.

**How to apply:** After adding any Pressable/Button with an `onPress`, search the file for the handler name. If it doesn't exist, define it before committing.
