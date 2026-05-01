---
name: Epic 16 code review — all fixable findings resolved 2026-04-10
description: Epic 16 committed as 54d657e. Follow-up review found prior 4 Criticals already fixed, plus fixable leftovers (WT-3, IMP-5, WT-1, NEW-1) all resolved in this session. WT-2 was a false positive (schema already correct). IMP-1 is a systemic 48-file pattern, explicitly out of scope for an Epic 16 fix.
type: project
---

Epic 16 (Adaptive Memory) code review follow-up + fixes, 2026-04-10.
Commit reviewed: `54d657e` (parent `03770a7`) PLUS uncommitted working tree.

**Final verdict: READY TO COMMIT** — all actionable findings resolved.

## Prior Critical issues — all fixed in 54d657e

| ID | Status | Evidence |
|----|--------|----------|
| CR-1 (step ordering) | FIXED | `session-completed.ts:425` write-coaching-card before `:450` analyze-learner-profile |
| CR-2 (ORM in route) | FIXED | `services/family-access.ts` owns ORM; `routes/learner-profile.ts` has zero drizzle imports |
| CR-3 (missing IDOR test) | FIXED | `routes/learner-profile.test.ts` — 379 lines, 5 cross-family 403 assertions |
| CR-4 (GDPR UPDATE vs DELETE) | FIXED | `services/learner-profile.ts:1034-1041` does hard `db.delete` |

## Fixes applied this session

| ID | Fix | File:line |
|----|-----|-----------|
| WT-3 | Reverted migration 0017/0018 modifications — migrations are immutable once applied. `git checkout --` on both SQL files. | `drizzle/0017_*.sql`, `drizzle/0018_*.sql` |
| IMP-5 | Added `console.warn` with structured fields to inner catch in `parseLearnerInputToAnalysis`. LLM parse failures are now observable. | `learner-input.ts:127-137` |
| WT-1 | Root-cause fix: reverted 5 defensive guards in `snapshot-aggregation.ts`; added `progressSnapshots` + `milestones` to BOTH test mocks that needed them (`session-completed.test.ts` db mock and `dashboard.test.ts` createMockDb + module-level table stubs). | `session-completed.test.ts`, `dashboard.test.ts` |
| NEW-1 | Added `analyze-learner-profile step` describe block with 4 tests: pending consent skips, consent granted + collection disabled skips, happy path calls applyAnalysis, null analysis does not call applyAnalysis. Required mocking `../../services/learner-profile` module + adding `learningSessions.findFirst` to db mock. | `session-completed.test.ts` (+127 lines) |

## False positives (no action needed)

- **WT-2**: reviewer said `packages/schemas/src/profiles.ts:43` had `.nullable()` on birthYear. Actual state: already non-nullable. The uncommitted `export.ts` / `profile.ts` changes removing `?? null` are correct cleanup, not a contract violation.

## Out of scope (systemic)

- **IMP-1** (`jest.mock('@eduagent/database')`): 48 test files in the API follow this pattern. Fixing just Epic 16's two files would be inconsistent — the pattern is the established convention (Hono route tests = wire tests, service integration tests handle DB concerns). Full remediation requires a whole-codebase migration, not an Epic 16 fix.

## Validation

- `session-completed.test.ts`: 65 tests pass (including 4 new `analyze-learner-profile` tests)
- `dashboard.test.ts`: 36 tests pass
- `learner-profile.test.ts` (routes + service): 16 tests pass
- Related tests sweep: **668 tests across 36 suites all pass**
- `apps/api` tsc typecheck: clean
- `packages/schemas` tsc typecheck: clean

## How to apply

All Epic 16-scoped findings are resolved. Safe to commit the Epic 16 + Epic 12 cleanup work together. The middleware, mobile, docs, and other in-progress uncommitted changes are separate and not touched by this fix pass.
