CREATE TYPE "public"."pending_notice_type" AS ENUM('consent_deleted', 'consent_archived');--> statement-breakpoint
ALTER TABLE "pending_notices" DROP CONSTRAINT "pending_notices_type_check";--> statement-breakpoint
ALTER TABLE "pending_notices" ALTER COLUMN "type" SET DATA TYPE "public"."pending_notice_type" USING "type"::"public"."pending_notice_type";