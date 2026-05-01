---
name: When testing flows, track silently — don't narrate
description: During exploratory / end-user-style testing of flows, do not report intermediate observations. Only keep internal track of flows exercised and bugs found; surface the consolidated list at the end.
type: feedback
---

When the user asks to "test" a feature or flow (e.g. "test all the new quiz functionality"), do NOT narrate each step, screen, or observation. The user does not want a running commentary.

**Why:** The user is reviewing the bug list, not the testing process. Play-by-play narration clutters the transcript and buries the signal. Stated explicitly 2026-04-19 after the quiz test request.

**How to apply:**
- Work silently through the flow — click, navigate, verify — without writing prose between each tool call.
- Keep a private todo/tracker of: (a) flows exercised, (b) bugs/issues found.
- At the end, produce one consolidated output: list of flows tested + list of bugs with severity and repro steps.
- If you hit a blocker that stops testing entirely, you may surface it mid-run — otherwise stay quiet.
