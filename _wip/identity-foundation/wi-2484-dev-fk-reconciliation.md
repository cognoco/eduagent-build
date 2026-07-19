# WI-2484 dev FK reconciliation record

Date: 2026-07-19
Environment: Doppler `mentomate/dev` database only

## Root cause and red evidence

The dev catalog retained 53 non-legacy foreign keys targeting legacy
`profiles.id`, although current TypeScript schema and migration
`0129_m_repoint.sql` target `person.id`. The canonical reviewer reached the
database successfully, then WI-2012 failed during fixture setup on
`learning_profiles_profile_id_profiles_id_fk`.

The new `pnpm db:check-identity-fks` assertion failed with all 53 constraints.
A preservation preflight found 52 constraints data-compatible with `person.id`;
five rows behind `support_messages_profile_id_profiles_id_fk` have no person twin,
so applying canonical migration 0129 wholesale would abort.

## Bounded dev-only repair

One atomic `DO` statement changed the two evidence-critical, data-compatible
constraints and no rows:

| Child column | Before | After |
|---|---|---|
| `learning_profiles.profile_id` | `learning_profiles_profile_id_profiles_id_fk` → `profiles.id` | `learning_profiles_profile_id_person_id_fk` → `person.id` |
| `notification_preferences.profile_id` | `notification_preferences_profile_id_profiles_id_fk` → `profiles.id` | `notification_preferences_profile_id_person_id_fk` → `person.id` |

Staging and production were not addressed or queried by the mutation command.
The broader preservation-safe convergence is WI-2487 (Complete dev Neon
identity-v2 FK repoint without losing legacy support messages).

## Verification

- WI-2012 focused real-Neon concurrency suite: 2 passed, 11 skipped; both
  reciprocal ordering cases exercised.
- Weekly-progress-push full suite advanced past notification-preferences setup,
  then exposed the next stale constraint at `progress_snapshots.profile_id`:
  2 passed, 7 failed. This is retained red evidence for WI-2487, not represented
  as a product failure.
- Catalog assertion after the bounded repair: 51 residual non-legacy constraints,
  all still reported explicitly. The guard does not conceal partial convergence.

## Rollback

If this dev-only repair must be reversed before WI-2487, run both changes in one
transaction after confirming the legacy `profiles` rows still cover all child IDs:

```sql
ALTER TABLE public.learning_profiles
  DROP CONSTRAINT learning_profiles_profile_id_person_id_fk,
  ADD CONSTRAINT learning_profiles_profile_id_profiles_id_fk
    FOREIGN KEY (profile_id) REFERENCES public.profiles(id)
    ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE public.notification_preferences
  DROP CONSTRAINT notification_preferences_profile_id_person_id_fk,
  ADD CONSTRAINT notification_preferences_profile_id_profiles_id_fk
    FOREIGN KEY (profile_id) REFERENCES public.profiles(id)
    ON DELETE CASCADE ON UPDATE NO ACTION;
```
