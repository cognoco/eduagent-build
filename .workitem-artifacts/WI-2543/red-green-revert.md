# WI-2543 red → green → production-revert → restore evidence

Date: 2026-07-31

All four functional runs used the same focused Jest invocation:

```text
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/mentomate_test \
pnpm exec jest --config apps/api/jest.config.cjs --runInBand --silent \
  apps/api/src/services/assessments-submit-answer.test.ts \
  apps/api/src/services/suggestions.test.ts \
  apps/api/src/services/curriculum.test.ts \
  apps/api/src/services/session/session-crud.test.ts \
  apps/api/src/services/subject.test.ts \
  apps/api/src/routes/books.test.ts \
  apps/api/src/routes/sessions.test.ts \
  apps/api/src/routes/subjects.test.ts \
  apps/api/src/routes/assessments.test.ts \
  apps/api/src/routes/book-suggestions.test.ts \
  apps/api/src/middleware/metering.coverage.guard.test.ts
```

The localhost URL was scoped to the test process so the repository harness did
not consult its configured shared-staging fallback. These unit/route/guard
tests did not connect to or mutate a database.

## RED — tests before production

- Exit: 1
- Suites: 11 failed, 11 total
- Tests: 32 failed, 523 passed, 555 total
- Expected failures included all five route over-gates, absent service consent
  dependencies/calls, and all new structural guard assertions.

An earlier invocation without the explicit localhost URL was rejected during
test setup by `assertLocalDopplerSource`; zero tests loaded, so it is excluded
from RED evidence.

## GREEN — production implementation

- Exit: 0
- Suites: 11 passed, 11 total
- Tests: 555 passed, 555 total
## Production-revert RED

Temporary production-only mutation: removed the six new consent calls from
`generateBookTopicsWithFallback`, focused-book materialization,
`matchTopicByIntent`, `createSubjectWithStructure`, `submitAssessmentAnswer`,
and suggestion top-up. Tests, dependency seams, route changes, and the forward
guard remained untouched.

- Exit: 1
- Suites: 7 failed, 4 passed, 11 total
- Tests: 16 failed, 539 passed, 555 total
- Failures included each service fail-closed assertion, the books route 403
  assertion, and all six service-boundary guard rows.

## Restored GREEN

Restored the exact six production consent calls with `apply_patch`.

- Exit: 0
- Suites: 11 passed, 11 total
- Tests: 555 passed, 555 total
