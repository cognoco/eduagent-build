---
name: EAS Build — never retry, always investigate first
description: NEVER retry eas build on failure. Investigate root cause, check dashboard, confirm with user before ANY re-attempt. Builds cost money.
type: feedback
---

NEVER kick off multiple EAS builds. Builds cost money and credits are limited.

**Why:** On 2026-03-29, blindly retrying `eas build` after a "Build request failed" error resulted in 5 duplicate builds on EAS (4 errored, 1 queued). The CLI error was misleading — uploads succeeded but the local fingerprint step threw a non-fatal error. Each retry burned a build credit. User was very frustrated.

**How to apply:**
1. After ANY `eas build` attempt — successful OR failed — run `eas build:list` to check what actually happened
2. If the CLI shows "✔ Uploaded to EAS", the build was submitted regardless of subsequent errors
3. NEVER run `eas build` more than ONCE. If it fails, STOP and investigate the root cause
4. Always confirm with the user before attempting another build
5. If investigating a build failure, check logs via `eas build:view <id>` or the EAS dashboard — do NOT retry the build to "see if it works"
