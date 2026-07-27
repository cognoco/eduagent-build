CREATE TABLE "family_join_invite" (
	"id" uuid PRIMARY KEY NOT NULL,
	"inviter_person_id" uuid NOT NULL,
	"family_org_id" uuid NOT NULL,
	"invited_email" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"token" text,
	"token_expires_at" timestamp with time zone,
	"resend_count" integer DEFAULT 0 NOT NULL,
	"recipient_change_count" integer DEFAULT 0 NOT NULL,
	"accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "family_join_invite_status_check" CHECK ("family_join_invite"."status" IN ('pending','accepted')),
	CONSTRAINT "family_join_invite_resend_count_check" CHECK ("family_join_invite"."resend_count" >= 0),
	CONSTRAINT "family_join_invite_recipient_change_count_check" CHECK ("family_join_invite"."recipient_change_count" >= 0)
);
--> statement-breakpoint
ALTER TABLE "family_join_invite" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "person" ADD COLUMN "migration_pending_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "family_join_invite" ADD CONSTRAINT "family_join_invite_inviter_person_id_person_id_fk" FOREIGN KEY ("inviter_person_id") REFERENCES "public"."person"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_join_invite" ADD CONSTRAINT "family_join_invite_family_org_id_organization_id_fk" FOREIGN KEY ("family_org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "family_join_invite_inviter_org_unique" ON "family_join_invite" USING btree ("inviter_person_id","family_org_id");--> statement-breakpoint
CREATE INDEX "family_join_invite_token_idx" ON "family_join_invite" USING btree ("token") WHERE "family_join_invite"."token" IS NOT NULL;