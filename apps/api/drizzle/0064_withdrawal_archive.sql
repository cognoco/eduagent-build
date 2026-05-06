CREATE TYPE "public"."withdrawal_archive_preference" AS ENUM('auto', 'always', 'never');--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'consent_archived';--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
CREATE TABLE "withdrawal_archive_preferences" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_profile_id" uuid NOT NULL,
	"preference" "withdrawal_archive_preference" DEFAULT 'auto' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "withdrawal_archive_preferences_owner_profile_id_unique" UNIQUE("owner_profile_id")
);
--> statement-breakpoint
CREATE TABLE "pending_notices" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_profile_id" uuid NOT NULL,
	"type" text NOT NULL,
	"payload_json" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"seen_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "withdrawal_archive_preferences" ADD CONSTRAINT "withdrawal_archive_preferences_owner_profile_id_profiles_id_fk" FOREIGN KEY ("owner_profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pending_notices" ADD CONSTRAINT "pending_notices_owner_profile_id_profiles_id_fk" FOREIGN KEY ("owner_profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "withdrawal_archive_preferences_owner_profile_id_idx" ON "withdrawal_archive_preferences" USING btree ("owner_profile_id");--> statement-breakpoint
CREATE INDEX "pending_notices_owner_unseen_idx" ON "pending_notices" USING btree ("owner_profile_id","seen_at");
