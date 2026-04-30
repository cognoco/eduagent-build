---
name: Always spec failure modes before coding
description: Every screen/flow spec must include a failure modes table with recovery paths — learned from 44 dead-end bugs found in full-app audit
type: feedback
---

Every feature spec and story must include a Failure Modes table before implementation begins. If the "Recovery" column is empty, the design is incomplete.

**Why:** Full-app UX audit (2026-04-05) found 44 dead-end states across all flows — consent, sessions, library, onboarding, parent dashboard, subscriptions. Nearly all were "design gaps, not coding mistakes" — states that were never considered during planning. The happy path was well-built; the unhappy paths were never specified.

**How to apply:**
- BMAD story template now has a Failure Modes section (mandatory)
- BMAD code review checklist now includes UX dead-end checks
- Global CLAUDE.md has UX Resilience Rules section
- `/ux-dead-end-audit` skill available for on-demand audits
- Every `mutateAsync` catch block must show user-visible feedback
- Every error screen needs both "Retry" AND "Go Back/Home"
