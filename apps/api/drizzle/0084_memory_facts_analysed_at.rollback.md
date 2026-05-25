# Rollback: 0084 — Add `memory_facts_analysed_at` to `learning_profiles`; add indexes on `curriculum_adaptations`, `topic_connections`, `onboarding_drafts`

Migration:
- Adds `memory_facts_analysed_at timestamp with time zone` (nullable) column to `learning_profiles`
- Creates `curriculum_adaptations_profile_id_idx`, `curriculum_adaptations_subject_id_idx`, `curriculum_adaptations_topic_id_idx` indexes on `curriculum_adaptations`
- Creates `topic_connections_topic_a_id_idx`, `topic_connections_topic_b_id_idx` indexes on `topic_connections`
- Creates `onboarding_drafts_profile_id_idx` index on `onboarding_drafts`

## Rollback

- **(a) Rollback possible?** Yes.

- **(b) Data lost?** The `memory_facts_analysed_at` timestamp for all profiles is lost — any record of when memory facts were last analysed is permanently deleted. The indexes are non-destructive; dropping them loses only query-performance benefit, not data.

- **(c) Recovery procedure?**

  1. Apply the following SQL against the target database:
     ```sql
     ALTER TABLE "learning_profiles" DROP COLUMN IF EXISTS "memory_facts_analysed_at";
     DROP INDEX IF EXISTS "curriculum_adaptations_profile_id_idx";
     DROP INDEX IF EXISTS "curriculum_adaptations_subject_id_idx";
     DROP INDEX IF EXISTS "curriculum_adaptations_topic_id_idx";
     DROP INDEX IF EXISTS "topic_connections_topic_a_id_idx";
     DROP INDEX IF EXISTS "topic_connections_topic_b_id_idx";
     DROP INDEX IF EXISTS "onboarding_drafts_profile_id_idx";
     ```
  2. Revert the schema commit that added `memoryFactsAnalysedAt` to `learning_profiles` in `packages/database/src/schema/`.
  3. Revert any service code that reads or writes `memoryFactsAnalysedAt`.
  4. Rebuild and redeploy the API Worker.
