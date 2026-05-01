---
name: Pre-commit type checking
description: tsc + lint locally before committing — skipping costs ~30 min per push-fix-push CI cycle.
type: feedback
---

Rule is in `CLAUDE.md` § "Required Validation". This entry preserves the cost rationale.

**Why this exists:** Insights analysis (2026-03-27) found multiple sessions with 3-4 push-fix-push CI cycles for unused variables, type mismatches, lint errors. Each cycle burned ~30 min — a real and recurring cost when pre-commit checks are skipped.
