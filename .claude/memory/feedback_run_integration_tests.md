---
name: Always run integration tests before committing
description: Run nx test:integration api locally before every commit that touches API code — never rely on CI alone
type: feedback
---

Always run integration tests locally before committing API changes.

**Why:** Integration tests caught failures (profileId mock missing) that unit tests didn't. Pushing without running them caused multiple CI fix rounds and wasted time.

**How to apply:** Before any commit that touches `apps/api/` or `tests/integration/`, run:
```bash
pnpm exec nx test:integration api
```
Wait for all 16 suites to pass. Only then commit and push. This is in addition to the existing `findRelatedTests` loop for unit tests.
