-- WI-767 (MMT-ADR-0022 arch E): drop the dead activity-ledger columns + enum.
-- /now is the sole reader and uses neither column — display copy is derived at
-- read time; visibility is self-only via profile scope + RLS (no stored flag).
--
-- ## Rollback
-- Reversible by re-creating the type + columns, but any data in the dropped
-- columns is unrecoverable. Pre-launch the table holds only disposable test
-- data, so the loss is immaterial. To roll back:
--   CREATE TYPE "public"."ledger_visibility" AS ENUM('self', 'supporter', 'both');
--   ALTER TABLE "mentor_activity_ledger" ADD COLUMN "template_key" text NOT NULL DEFAULT '';
--   ALTER TABLE "mentor_activity_ledger" ADD COLUMN "visibility" "public"."ledger_visibility" NOT NULL DEFAULT 'self';
ALTER TABLE "mentor_activity_ledger" DROP COLUMN "template_key";--> statement-breakpoint
ALTER TABLE "mentor_activity_ledger" DROP COLUMN "visibility";--> statement-breakpoint
DROP TYPE "public"."ledger_visibility";