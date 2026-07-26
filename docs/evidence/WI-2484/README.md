# WI-2484 — dev notification-preferences FK revalidation

This packet records the WI-2484-specific verification of the development Neon
identity-v2 foreign keys. The broader dev repair had already been committed by
WI-2487 before this execution began, so this run performed no database
mutation. Replaying the repair would have been both redundant and unsafe.

## Scope and authority

- Neon project: `lingering-violet-30592106`
- Verified branch: `br-weathered-silence-agw4on4x` (MentoMate dev)
- Staging: untouched
- Production: untouched
- Historical mutation authority:
  [`../WI-2487/mutation-executed.sql`](../WI-2487/mutation-executed.sql)

The WI-2487 transaction repointed every compatible non-legacy child foreign
key from `profiles(id)` to `person(id)` in one bounded dev-only transaction.
This execution only queried the live catalog and ran integration tests.

## Exact before and after mapping

The legacy names and definitions are preserved by the original schema SQL
(`apps/api/drizzle/0019_dizzy_shooting_star.sql` and
`apps/api/drizzle/0000_lush_psylocke.sql`) and by the captured RED fixture in
`packages/database/scripts/check-identity-fk-drift.test.mjs`. WI-2487's
catalog-derived mutation changed only the referenced table and the constraint
name suffix, preserving columns and actions.

| Child | Before WI-2487 | Verified live state at 2026-07-26 18:47:39 UTC |
| --- | --- | --- |
| `learning_profiles` | `learning_profiles_profile_id_profiles_id_fk`: `FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE` | `learning_profiles_profile_id_person_id_fk`: `FOREIGN KEY (profile_id) REFERENCES person(id) ON DELETE CASCADE` |
| `notification_preferences` | `notification_preferences_profile_id_profiles_id_fk`: `FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE` | `notification_preferences_profile_id_person_id_fk`: `FOREIGN KEY (profile_id) REFERENCES person(id) ON DELETE CASCADE` |

The completeness guard also returned:

```text
identity FK freshness passed: no non-legacy child targets profiles.id
```

## Commands and results

All credentialed commands were explicitly scoped through Doppler config
`dev`; no connection string, credential, or row data was recorded.

```bash
pnpm db:check-identity-fks:dev
```

- Passed: zero non-legacy child constraints target `profiles(id)`.

```bash
node scripts/doppler-run.mjs run -c dev -- \
  pnpm exec jest --config apps/api/jest.integration.config.cjs \
  apps/api/src/services/learner-profile.integration.test.ts \
  --runInBand --forceExit \
  --testNamePattern='\[WI-2012\] memory channel toggle concurrency'
```

- Passed: 1 suite, 2 behavior cases.
- No learning-profile FK setup failure.

```bash
node scripts/doppler-run.mjs run -c dev -- \
  pnpm exec jest --config apps/api/jest.integration.config.cjs \
  apps/api/src/inngest/functions/weekly-progress-push.integration.test.ts \
  --runInBand --forceExit
```

- Passed: 1 suite, 9 cases.
- No notification-preferences legacy FK failure.
- Expected error-path logging appeared in the delivery-failure cases; the
  assertions passed.

## Rollback

[`rollback.sql`](rollback.sql) records the exact inverse for these two
constraints. It is an audit artifact, not an instruction to run it: applying
it would deliberately restore the identity-v1 drift. The script refuses any
target other than the exact dev project and branch and verifies the current
person-target state before changing either constraint.

