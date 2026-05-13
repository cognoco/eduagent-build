---
name: E2E Notion cascade — treat as one bug, not N
description: When 20+ Notion bugs filed same day share a "Cascading X failure" pattern in Found In, treat as single infrastructure root cause rather than N independent defects.
type: feedback
originSessionId: 2450d58c-4af7-4307-bc69-deb4ac51ef00
---
When the Bug Tracker shows a burst of same-day bugs whose `Found In` field contains a shared "Cascading …" phrase (e.g. "Cascading sign-in failure — bundle proxy degraded"), do NOT pick 10 to close individually. Investigate the upstream cause first.

**Why:** On 2026-04-22 an E2E regression run on `testing` branch produced 51 failing flows and 27 Notion bugs (BUG-594..622) that were all cascades from five infrastructure pitfalls documented in `docs/_vault/emulator-2026-04-30/E2Edocs/e2e-session-2026-04-22-struggles.md`. Picking 10 and marking Done individually would have been a shortcut violating `feedback_fix_root_cause.md` — and the same cascade would refile them on the next broken run. The actual fix was an automated preflight (`apps/mobile/e2e/scripts/e2e-preflight.sh`, commit `03507f33`, finding `E2E-PROXY-2026-04-22`) that blocks the batch before it starts producing false positives.

**How to apply:**
1. Query Notion with `sorts: [{property: "Reported", direction: "descending"}]` and inspect `Found In`. If >3 bugs share a cascade phrase on the same day, pause and read the E2E session log for that date before touching any individual bug.
2. The fix goes into `apps/mobile/e2e/scripts/e2e-preflight.sh` (or an equivalent infra guard), not into app code.
3. Mark the bugs In progress (to claim them), set `Resolution` + `Fixed In` + finding ID, but leave status as In progress until a fresh regression run on healthy infra confirms each scenario passes. Only after a clean run flip to Done — per `feedback_verify_before_marking_done.md`.
4. If a scenario still fails with preflight green, THAT is the real app bug — file it separately with a distinct finding ID.
