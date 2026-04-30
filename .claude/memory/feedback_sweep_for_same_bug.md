---
name: Always sweep for the same bug across the entire codebase
description: When fixing a bug, search for the same pattern everywhere — not just the file where it was reported. Fix systematically.
type: feedback
---

When fixing a bug, always check whether the same issue exists elsewhere in the codebase before declaring it done. Do a systematic sweep.

**Why:** The sign-in "empty screen after verification" bug was fixed in sign-in.tsx but the identical pattern existed in sign-up.tsx. The user had to discover this themselves during testing — wasting a full debug cycle.

**How to apply:**
- After fixing a bug in one file, grep/search for the same pattern across the entire codebase
- If the fix involves a shared concept (e.g., session activation, error handling, state management), check ALL screens/components that use that concept
- If the fix requires a shared utility (like auth-transition.ts), extract it immediately rather than duplicating the fix per-file
- Explicitly list in your response: "Checked for the same issue in: [files]. Found in: [files]. Fixed."
