---
name: Always sweep for repeated bug patterns
description: When a bug or issue could plausibly be a repeated pattern, sweep the codebase for siblings before declaring the work done.
type: feedback
---

When finding or fixing a bug, always ask whether the root cause could plausibly exist elsewhere. If yes, do a systematic codebase sweep for the pattern before declaring the work done.

**Why:** The sign-in "empty screen after verification" bug was fixed in sign-in.tsx but the identical pattern existed in sign-up.tsx. The user had to discover this themselves during testing — wasting a full debug cycle.

**How to apply:**
- During bug investigation, identify whether the root cause is pattern-shaped: repeated lifecycle assumptions, stale cache invalidation, duplicated handlers, parallel screens, shared error handling, auth/profile scoping, schema drift, route params, or platform assumptions.
- If a pattern is plausible, grep/search for the same pattern across the entire codebase before calling the fix done.
- If the fix involves a shared concept (e.g., session activation, error handling, state management), check ALL screens/components that use that concept
- If the fix requires a shared utility (like auth-transition.ts), extract it immediately rather than duplicating the fix per-file
- Explicitly list in your response: "Checked for the same issue in: [files]. Found in: [files]. Fixed."
