---
name: Fix the root cause, not the symptom — user flags repeated bugs
description: When a bug is reported, investigate WHY it happens, don't add workarounds. User had to report the splash animation bug 3 times.
type: feedback
---

Fix the actual root cause of bugs, not just the visible symptom.

**Why:** On 2026-03-29, user reported the splash animation bug for the 3rd time. Previous "fixes" added safety timeouts and callback stabilization (treating the symptom: splash getting stuck), but never addressed the root cause (Android SVG elements not rendering because `useAnimatedProps` only animated `r` without `opacity`). The user was very frustrated about having to re-report the same issue.

**How to apply:**
1. When fixing a bug, ask "why does this happen?" not just "how do I make it go away?"
2. If the fix is a timeout, fallback, or workaround — that's a symptom fix. Keep digging for the root cause.
3. Test the fix on the ACTUAL platform where the bug occurs (Android APK, not just iOS simulator or web)
4. If you can't reproduce on device, document what you believe the root cause is and flag the uncertainty
