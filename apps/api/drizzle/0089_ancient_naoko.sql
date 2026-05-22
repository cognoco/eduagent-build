-- 0089_ancient_naoko.sql
-- PR 2 navigation contract rollout: persist each profile's default app
-- context for V1 mode navigation. NULL preserves existing behaviour until a
-- user explicitly chooses study/family under the V1 flag.
--
-- ## Rollback
-- Rollback is possible. Dropping default_app_context loses users' persisted
-- study/family preference and mobile will fall back to study or legacy V0
-- derivation. Recovery is to reapply this migration and let users choose again.

ALTER TABLE "profiles" ADD COLUMN "default_app_context" text;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_default_app_context_check" CHECK ("profiles"."default_app_context" IS NULL OR "profiles"."default_app_context" IN ('study','family'));
