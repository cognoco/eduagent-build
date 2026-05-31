ALTER TABLE "memberships" ADD CONSTRAINT "memberships_roles_no_null" CHECK (array_position("memberships"."roles", NULL::"public"."membership_role") IS NULL);--> statement-breakpoint
CREATE TABLE "organization_invitations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"invited_roles" "membership_role"[] NOT NULL,
	"target_profile_id" uuid,
	"token_hash" text NOT NULL,
	"email_hint" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"accepted_at" timestamp with time zone,
	"accepted_by_profile_id" uuid,
	CONSTRAINT "organization_invitations_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "organization_invitations_kind_check" CHECK ("organization_invitations"."kind" IN ('invite', 'claim')),
	CONSTRAINT "organization_invitations_status_check" CHECK ("organization_invitations"."status" IN ('pending', 'accepted', 'revoked', 'expired')),
	CONSTRAINT "organization_invitations_roles_non_empty" CHECK (cardinality("organization_invitations"."invited_roles") >= 1)
);
--> statement-breakpoint
ALTER TABLE "organization_invitations" ADD CONSTRAINT "organization_invitations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_invitations" ADD CONSTRAINT "organization_invitations_target_profile_id_profiles_id_fk" FOREIGN KEY ("target_profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_invitations" ADD CONSTRAINT "organization_invitations_accepted_by_profile_id_profiles_id_fk" FOREIGN KEY ("accepted_by_profile_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;
