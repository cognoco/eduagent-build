---
name: Verify before declaring done
description: Never declare a fix done without testing it — changed code is not fixed code
type: feedback
---

Never declare a UI fix "done" or tell the user to reload without first verifying the fix actually works.

**Why:** User had to point out phantom tabs were still showing after I declared the fix complete. The first approach (`tabBarItemStyle: { display: 'none' }`) didn't work, and I should have caught that before pushing OTA.

**How to apply:** After any UI fix, run the app or tests that exercise the exact visual state the user reported. If you can't visually verify (e.g., no emulator), say so explicitly rather than declaring it fixed. For OTA pushes, be upfront that the user needs to verify after reload.
