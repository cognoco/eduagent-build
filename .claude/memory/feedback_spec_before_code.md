---
name: Spec before code (BMAD docs)
description: Every new feature/epic must have PRD, architecture, epics/stories, and UX spec before implementation begins
type: feedback
---

Never implement features without specifications. Every new feature/epic requires: PRD section, architecture decisions, epic/story breakdown, and UX spec (if UI).

**Why:** The EduAgent codebase achieved exceptional consistency (1,443 tests, 23 route files following identical patterns, zero TODOs) because every feature was specified before coding. The BMAD-generated docs (prd.md, architecture.md, epics.md, ux-design-specification.md) gave Claude unambiguous requirements and architectural constraints. Skipping specs leads to scope drift, inconsistent patterns, and rework.

**How to apply:** If the user says "build X" and no spec exists, ask whether to create the spec first. Use BMAD commands (`/bmad:bmad-bmm-create-prd`, `/bmad:bmad-bmm-create-architecture`, etc.) for completeness. The value is in the documents produced, not the method itself — but BMAD enforces the completeness that matters.
