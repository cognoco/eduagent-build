## What was done:

Fixed the FK-ordering bug in `deleteOrganizationGraph()` (`apps/api/src/services/test-seed.ts`), the shared test-seed teardown used by `resetDatabase()` and the idempotent pre-seed cleanup in `seedScenario()`. The teardown now deletes `consent_request` rows before `consent_grant` rows, so consent-journey teardown no longer fails with a Postgres FK violation and no longer leaves seeded accounts behind.

## What changed:

- `apps/api/src/services/test-seed.ts`: `deleteOrganizationGraph()` now issues an org-scoped `DELETE FROM consent_request WHERE organization_id IN (...)` immediately before the existing `consent_grant` delete. Reason: `consent_request.consent_grant_id -> consent_grant.id` is a NO ACTION (RESTRICT) FK with no `ON DELETE` clause (`packages/database/src/schema/identity.ts:833`); after a J-13 approval or J-21 withdrawal journey an approved/withdrawn `consent_request` back-links a grant, so deleting the grant first violates the constraint. The request's own `organization_id`/`charge_person_id` CASCADEs only fire on person/org delete (later steps), too late. The new delete is unconditional and org-scoped, covering the approved, withdrawn, and failed/partial J-13/J-21 variants plus repeated reseeding of the same alias. Ordering comments updated.
- `apps/api/src/services/test-seed.integration.test.ts` (new): real-DB regression test (no internal mocks; GC1/GC6 clean) exercising the real `resetDatabase` for the approved and withdrawn variants. Inserts org/person/login/membership/consent_grant/consent_request directly (no Clerk) and asserts teardown exits cleanly and removes the grant, request, person, and org rows.
- `apps/api/src/services/test-seed.test.ts`: delete-count assertion bumped 5 -> 6 for the new delete.

## Verification:

- Red-green proof (real stg DB): with the fix reverted, both regression cases fail with `update or delete on table "consent_grant" violates foreign key constraint "consent_request_consent_grant_id_consent_grant_id_fk"` thrown by `resetDatabase`; with the fix restored, both pass.
- Unit test (`test-seed.test.ts`) passes with the 5 -> 6 delete-count update.
- `nx run api:typecheck` green; pre-commit (eslint/prettier/sync-skills) and pre-push (`tsc --build` + surgical jest, 1044 tests) green.
- CI on PR #1310: all required checks pass — `main`, `Playwright web smoke`, `API Quality Gate`, `Merge completeness check`. `claude-review` APPROVED (0 must-fix/should-fix/consider). The regression test passed in the flag-ON integration run. Addressed CodeRabbit's one minor suggestion (added person/org deletion assertions to the withdrawn variant for symmetry).
- Merged to `main` via squash: merge commit `f969400fd6f44c00b400f0349d1623f9f270ca99`.

## Caveats / Follow-ups:

- The non-required `Flag-ON integration (IDENTITY_V2_ENABLED)` job shows 2 red tests in `family-bridge.undo-orphan.integration.test.ts` (`subjects_profile_id_profiles_id_fk` seed-insert failure). This is PRE-EXISTING on `main` (verified failing identically on the latest main commit `f41344ba3`, whose overall CI is nonetheless green because the job is non-blocking) and is unrelated to this consent-teardown change. Not introduced or worsened here; out of scope for WI-880. Worth a separate WI to fix the identity-v2 `profiles`/`person` seed path in that test.
