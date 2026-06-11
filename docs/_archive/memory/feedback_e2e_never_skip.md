---
name: Never skip E2E tests
description: Always run E2E tests after implementing features — never silently skip them
type: feedback
---

Always run E2E tests after implementing or fixing features. Never skip them or declare work done without running them.

**Why:** Insights analysis (2026-03-27) found Claude skipped E2E tests in 4-5 sessions, requiring the user to correct it — sometimes twice in the same session. This is a recurring pattern the user finds frustrating.

**How to apply:** After any feature implementation or bug fix that touches UI or API behavior, run E2E tests. If infrastructure is down (Metro, emulator), explicitly report that rather than silently skipping. Use `/e2e` skill for structured preflight + execution.
