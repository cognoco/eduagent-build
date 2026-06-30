## What was done

Added end-to-end dictation history persistence: source sentences are now stored server-side on every dictation completion and exposed via a new `GET /v1/dictation/history` endpoint. A new mobile screen (`app/(app)/dictation/history.tsx`) lets learners review their past sessions with full sentence text and mistake counts.

## What changed

- **DB migration 0126**: `ALTER TABLE dictation_results ADD COLUMN sentences jsonb` (nullable, additive).
- **Schema** (`packages/schemas/src/dictation.ts`): `sentences: z.array(z.string()).nullable()` added to `dictationResultSchema`; new `dictationHistorySchema` / `DictationHistory` type; new `DictationHistory` export.
- **API route** (`apps/api/src/routes/dictation.ts`): `GET /dictation/history` — thin handler calling `getDictationHistory(db, profileId)`, response shaped by `dictationHistorySchema`.
- **Service** (`apps/api/src/services/dictation/result.ts`): `getDictationHistory` uses `db.select()` directly with `WHERE profile_id = :profileId ORDER BY created_at DESC LIMIT 20` (AGENTS.md sanctioned pattern for ordered+limited single-table reads). `sentences` written on insert/upsert via existing `recordDictationResult`. Null-guard `!= null` (loose equality) prevents a retry without sentences from clobbering previously stored text.
- **Repository** (`packages/database/src/repository.ts`): reverted `dictationResults.findMany` to simple `(extraWhere?)` form; `sentences != null` conflict-update guard.
- **Mobile screen**: `history.tsx` — full-screen list with header, empty state, error fallback, and per-row sentence display. Polish i18n plural forms (`_one`/`_few`/`_many`/`_other` per CLDR).
- **Mobile hook** (`hooks/use-dictation-api.ts`): `useDictationHistory` — tanstack-query `useQuery` wrapping `GET /dictation/history`.
- **Route tests**: 4 new cases for `GET /v1/dictation/history` (200 happy path, delegation assertion, 400 missing profile, 401 unauthenticated).
- **Inngest annotation**: `billing-subscription-store-teardown.ts` annotated `@inngest-admin: no-db` (conflict resolved to main's phrasing from hotfix PR #1654).

## Verification

- All CI checks passed on PR #1618 (squash dd58d9bd): `main`, `Flag-ON integration (IDENTITY_V2_ENABLED)`, `claude-review` (APPROVED, 0 must-fix / 0 should-fix), `API Quality Gate`, `Merge completeness check`, `Playwright web smoke`, and all docs/tooling checks.
- Mobile manual-plural-guard green (Polish `_few`/`_many` forms added).
- Service-level result tests (`result.test.ts`, `result.context.test.ts`) pass.
- Schema tests (`dictation.test.ts`) pass with `sentences: null` and `sentences: [...]` fixtures.

## Caveats / Follow-ups

- GC6 deferred: `complete.test.tsx` has one pre-existing internal mock (`use-dictation-api`) converted to Pattern A in this PR; full drain to real QueryClient requires a separate spike.
- Plan file `_plan-WI-902.md` references migration `0125` (renamed to `0126` after numbering collision with main); minor doc drift, no functional impact.
