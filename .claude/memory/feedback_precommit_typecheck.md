---
name: Pre-commit type checking
description: Always run tsc --noEmit and lint before committing to avoid multi-round CI fix-push cycles
type: feedback
---

Always run `pnpm exec tsc --noEmit` and lint the affected project before every commit.

**Why:** Insights analysis (2026-03-27) found multiple sessions with 3-4 push-fix-push CI cycles for issues like unused variables, type mismatches, and lint errors that could have been caught locally. These cycles burned ~30 min each.

**How to apply:** Before every `git commit`, run type checker and linter. Fix all errors before committing. This is now also codified in CLAUDE.md under Quality Rules.
