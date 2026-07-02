-- [ic-362] Edited post-commit, operator-authorized (deploy-unblock, WI-1128
-- slice): the legacy `profiles` table was dropped out-of-band on staging/prod
-- (v2-only; `person.birth_date` already carries this precision) before this
-- migration was ever applied there. Catalog-gated so the ALTERs no-op when
-- `profiles` is absent instead of aborting `drizzle-kit migrate` (see
-- scripts/migration-immutability-allowlist.json). This migration was never
-- applied to staging/prod, so editing it is runtime-safe. No v2-side change
-- needed — nothing added to `person`.
DO $$ BEGIN
  IF to_regclass('public.profiles') IS NOT NULL THEN
    ALTER TABLE "profiles" ADD COLUMN "birth_month" integer;
    ALTER TABLE "profiles" ADD COLUMN "birth_day" integer;
    ALTER TABLE "profiles" ADD CONSTRAINT "profiles_birth_month_range_check" CHECK ("profiles"."birth_month" IS NULL OR ("profiles"."birth_month" BETWEEN 1 AND 12));
    ALTER TABLE "profiles" ADD CONSTRAINT "profiles_birth_day_range_check" CHECK ("profiles"."birth_day" IS NULL OR ("profiles"."birth_day" BETWEEN 1 AND 31));
    ALTER TABLE "profiles" ADD CONSTRAINT "profiles_birth_month_day_pairwise_check" CHECK (("profiles"."birth_month" IS NULL) = ("profiles"."birth_day" IS NULL));
  END IF;
END $$;
