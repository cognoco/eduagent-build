---
name: Always spec failure modes before coding
description: Full-app UX audit (2026-04-05) found 44 dead-end states across all flows — design gaps, not coding mistakes. Spec template now mandates a Failure Modes table.
type: feedback
---

Rule lives in `CLAUDE.md` § "Inherited Rules" → "Spec Failure Modes Before Coding". This entry preserves the historical context.

**Why this exists:** Full-app UX audit (2026-04-05) found 44 dead-end states across all flows — consent, sessions, library, onboarding, parent dashboard, subscriptions. Nearly all were design gaps, not coding mistakes — states that were never considered during planning. Happy paths were well-built; unhappy paths were never specified.

**Infrastructure that codifies this:**

- BMAD story template has a mandatory Failure Modes section
- BMAD code review checklist includes UX dead-end checks
- `ux-dead-end-audit` skill available for on-demand audits
