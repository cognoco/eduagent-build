---
name: Five systemic root causes of bugs
description: Cross-cutting analysis of 100+ findings reveals 5 root causes — typed errors, mock coverage, untriggered code, ownership checks, failure mode specs
type: feedback
---

Full-app audit (2026-04-05) across code reviews (Epics 1-13), security bug-fix-plan, 44 UX dead-ends, and mock-fix-plan revealed that nearly all bugs trace to five systemic root causes:

1. **No typed error hierarchy** → generic "connection error" everywhere. Fix: shared ApiError classes in schema package + API client middleware that classifies once.

2. **Mocks hiding real integration bugs** → 540 internal mock calls, fake Drizzle chains. Fix: never jest.mock own DB/services in integration tests. Mock only external boundaries.

3. **Wired but untriggered code** → review reminders, push crons exist but nothing dispatches events. Fix: end-to-end feature tracing check in code review.

4. **Missing ownership/scoping checks** → IDOR risks. Fix: RLS defense-in-depth + lint/grep for raw db.query in service files.

5. **No failure mode specification** → all 44 UX dead-ends were states never designed. Fix: mandatory Failure Modes table in every story.

**Why:** These 5 patterns account for nearly all 100+ findings across all audit documents.

**How to apply:**
- Global CLAUDE.md has all 5 rules
- BMAD architecture step-05 has UX Resilience Patterns section
- BMAD epic step-03 requires failure mode ACs in stories
- BMAD dev-story checklist has 5 new UX checks
- BMAD code-review checklist has 6 new UX checks
- `/ux-dead-end-audit` skill for on-demand audits
