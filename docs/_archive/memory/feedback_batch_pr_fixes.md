---
name: Batch PR review fixes
description: Apply all PR review findings in one pass with local validation before pushing
type: feedback
---

When addressing PR review findings, apply ALL fixes in a single pass. Run the full test suite and type checker locally. Only commit and push once everything passes.

**Why:** Insights analysis (2026-03-27) found multiple sessions with iterative fix-push-wait loops where each fix introduced new issues. Sessions that succeeded quickly applied all fixes at once and validated locally before pushing.

**How to apply:** Treat PR review fixes as a batch operation. Read all findings first, apply all fixes, validate locally (tsc + tests), then push once. Use `/fix-ci` skill for structured CI repair loops.
