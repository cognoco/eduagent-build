# WI-2895 — credentialed Person account invariant

Status: Complete

## Goal

Make the persisted identity graph agree with its credential binding: a Person
with the owner bootstrap's Login/link pair has `has_own_account = true`, while a
managed Person without a Login remains false. Repair previously-created
credentialed rows without widening organization authority or changing the
supporter cold-start credential predicate.

## File map

- `apps/api/src/services/identity-v2/identity-graph.ts`
  - Write the flag in the same transaction as Person/Login creation.
  - Converge a same-Clerk idempotent replay by Person id only.
- `apps/api/src/services/identity-v2/identity-graph.test.ts`
  - Unit regression proving the production Person insert requests the true
    value.
- `apps/api/src/services/identity-v2/identity-graph.integration.test.ts`
  - Real-database assertions for new bootstrap and legacy replay convergence.
- `apps/api/src/services/identity-v2/child-profile-v2.integration.test.ts`
  - Pin the managed/no-Login false variant.
- `apps/api/drizzle/0165_wi2895_credentialed_person_account_flag.sql`
  - Bounded, idempotent repair for rows whose Person/Login circular link is
    complete.
- `apps/api/drizzle/meta/_journal.json`
  - Append migration 0165 to the effective chain.
- Existing supporter cold-start tests/fixtures
  - Correct stale “no production writer” prose while retaining Login presence
    as the credential predicate.

## Acceptance mapping

1. New owner: set `hasOwnAccount: true` on the Person insert inside the existing
   graph transaction; prove via unit and real-DB tests.
2. Managed Person: leave the schema default untouched in child creation and
   assert `loginId = null` plus `hasOwnAccount = false` against the real DB.
3. Replay/reclaim: on a same-email/same-Clerk existing graph, update only the
   Person reached through that Login before returning the resolved graph; assert
   organization/membership identity is unchanged. Different-Clerk reclaim stays
   fail-closed.
4. Existing rows: migration updates only `person` rows whose `login_id` points
   back to the matching `login.person_id`; incomplete and managed rows remain
   untouched. The update is idempotent.
5. Scope boundary: no supporter cold-start behavior change; Login presence
   remains its credential source.

## Verification

- Demonstrate red before implementation for the named unit regression and the
  real-DB owner assertion.
- Run focused unit tests.
- Run identity graph and managed-child integration tests on an isolated
  disposable PostgreSQL database with `IDENTITY_V2_REPOINTED=true`.
- Exercise migration 0165 twice against seeded credentialed, incomplete, and
  managed rows and verify only the complete credential binding changes.
- Run API typecheck, lint for changed TypeScript, migration/journal guards, and
  the repository change-class gate.
- Perform an explicit red-green-revert against the owner insert before commit.

## Rollback

The runtime change can be reverted without schema changes. Migration 0165 is a
data consistency repair and is intentionally not reversed: setting a complete
Person/Login credential binding back to false would recreate the contradiction.
