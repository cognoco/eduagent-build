---
name: Verify full CI, not just the mentioned file
description: When user reports a CI failure, run full validation (typecheck + lint + test) even if a specific file is mentioned — the real failure may be elsewhere
type: feedback
---

When a user reports a CI failure, always run the full CI validation suite (typecheck, lint, test) for affected projects — not just the specific file mentioned in the error report.

**Why:** User reported a failing CI job with an OCR file analysis pasted. I verified only that file's tests, declared "no fix needed," and missed a completely unrelated typecheck failure in billing.ts. The pasted analysis was context/history, not necessarily the current blocker.

**How to apply:** Treat "CI is failing" as "run the same checks CI runs." Even if the user pastes a specific error, verify the full pipeline before declaring things clean. A single test passing ≠ CI passing.
