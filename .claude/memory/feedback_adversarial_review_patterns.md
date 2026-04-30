---
name: Adversarial Review Patterns — Recurring Pitfalls
description: Four recurring bug categories from the 2026-04-05 UX-resilience pass. Specific bug examples below; general rules in CLAUDE.md.
type: feedback
---

Code Quality Guards in `CLAUDE.md` (Inherited Rules) codify the rules. This entry preserves the specific bug examples that surfaced them.

**1. Response Body Double-Consumption** — `assert-ok.ts` had a catch branch that called `res.text()` after `res.json()` had already consumed the stream. Fallback message logic could never fire.

**2. Error Classifier Must Run on Raw Errors** — `isReconnectableSessionError` string-matched for "network", "timed out", etc., but `formatApiError` transforms those into "Something unexpected happened" which matches none. Reconnect button never appeared.

**3. Clean Up Dead Code During Refactors** — `PersonaType` type still declared after persona removal. `parseApiStatus` fallback unreachable after `parseApiBody`. Legacy `RECOVERY_KEY` markers orphaned in SecureStore forever.

**4. Verify JSX Handler References Exist** — `library.tsx` referenced `handleRetry` in a "Check again" button but the function was never defined — guaranteed `ReferenceError` at runtime.
