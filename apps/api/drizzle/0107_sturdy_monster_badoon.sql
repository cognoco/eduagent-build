CREATE TYPE "public"."nudge_direction" AS ENUM('guardian_to_learner', 'learner_to_guardian');--> statement-breakpoint
ALTER TYPE "public"."nudge_template" ADD VALUE 'thanks';--> statement-breakpoint
ALTER TYPE "public"."nudge_template" ADD VALUE 'need_help';--> statement-breakpoint
ALTER TYPE "public"."nudge_template" ADD VALUE 'proud_moment';--> statement-breakpoint
ALTER TABLE "nudges" ADD COLUMN "direction" "nudge_direction" DEFAULT 'guardian_to_learner' NOT NULL;

-- Rollback note:
-- PostgreSQL enum values cannot be removed in place. To roll back after this
-- migration has been applied, deploy code that no longer writes the new
-- templates/direction, migrate or delete rows using learner_to_guardian or the
-- thanks/need_help/proud_moment templates, then rebuild the nudge_template enum
-- without those values in a separate maintenance migration. The direction column
-- can be dropped only after reader code no longer references it.
