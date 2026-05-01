---
name: No suppression — fix the root cause
description: Never use eslint-disable or suppress warnings to make lint pass. Always fix the actual code or improve the lint rule.
type: feedback
originSessionId: 2c882213-ae9f-4ede-b553-f6733ee6bedc
---
No suppression, no shortcuts — always address the root of the error.

**Why:** The user considers eslint-disable comments a shortcut that hides problems rather than solving them. Even when the code is architecturally valid (e.g., cross-function error propagation), the right response is to improve the lint rule to handle the pattern, not suppress the warning.

**How to apply:** When a lint rule produces a false positive:
1. Improve the rule to correctly handle the pattern (e.g., detect `return mutateAsync()` as error propagation)
2. Or restructure the code so the pattern is detectable
3. NEVER use `eslint-disable` as a first resort
