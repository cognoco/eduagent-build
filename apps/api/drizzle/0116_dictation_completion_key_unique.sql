-- 0116_dictation_completion_key_unique.sql
-- Contract step (completes the WI-84 expand/contract): make dictation_results
-- uniqueness key (profile_id, completion_key) instead of (profile_id, date,
-- mode). The legacy date/mode unique index was the data-loss source — two
-- distinct same-day same-mode dictation sessions collided on it and the upsert
-- overwrote the first. completion_key has been NOT NULL with a
-- gen_random_uuid() default and written by the service since the expand phase.
--
-- Data safety: the legacy unique index guarantees ≤1 row per
-- (profile_id, date, mode) today, and completion_key is unique-by-default per
-- row, so promoting the completion_key index to UNIQUE cannot fail on existing
-- data.
--
-- ## Rollback
-- Possible only if no duplicate same-day same-mode rows have been written since
-- this migration deployed (after the fix, distinct-completion_key sessions
-- legitimately coexist). Recreating "uniq_dictation_results_profile_date_mode"
-- would otherwise fail the unique build. Recovery: de-duplicate offending rows
-- (keep the most recent completion_key per (profile_id, date, mode)), then
-- recreate the legacy unique index and drop the unique completion_key index.
-- No data is destroyed by the forward migration itself.

DROP INDEX "uniq_dictation_results_profile_date_mode";--> statement-breakpoint
DROP INDEX "idx_dictation_results_profile_completion_key";--> statement-breakpoint
CREATE UNIQUE INDEX "idx_dictation_results_profile_completion_key" ON "dictation_results" USING btree ("profile_id","completion_key");