CREATE TABLE "guardian_authority_redemptions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"verifier_handle_digest" text NOT NULL,
	"command_binding_digest" text NOT NULL,
	"status" text DEFAULT 'redeeming' NOT NULL,
	"guardian_person_id" uuid NOT NULL,
	"charge_person_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"jurisdiction" text NOT NULL,
	"policy_version" text NOT NULL,
	"authorization_form" text NOT NULL,
	"purpose_set_digest" text NOT NULL,
	"assurance_method" text,
	"evidence_id" text,
	"qualification" text,
	"learner_assent_at" timestamp with time zone,
	"issued_at" timestamp with time zone,
	"not_before" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"authority_token_digest" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "guardian_authority_redemptions_handle_digest_valid" CHECK ("guardian_authority_redemptions"."verifier_handle_digest" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "guardian_authority_redemptions_binding_digest_valid" CHECK ("guardian_authority_redemptions"."command_binding_digest" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "guardian_authority_redemptions_purpose_digest_valid" CHECK ("guardian_authority_redemptions"."purpose_set_digest" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "guardian_authority_redemptions_token_digest_valid" CHECK ("guardian_authority_redemptions"."authority_token_digest" IS NULL OR "guardian_authority_redemptions"."authority_token_digest" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "guardian_authority_redemptions_status_valid" CHECK ("guardian_authority_redemptions"."status" IN ('redeeming', 'issued', 'rejected')),
	CONSTRAINT "guardian_authority_redemptions_authorization_form_valid" CHECK ("guardian_authority_redemptions"."authorization_form" IN ('guardian', 'joint_child_guardian')),
	CONSTRAINT "guardian_authority_redemptions_issued_complete" CHECK ("guardian_authority_redemptions"."status" <> 'issued' OR ("guardian_authority_redemptions"."assurance_method" IS NOT NULL AND "guardian_authority_redemptions"."evidence_id" IS NOT NULL AND "guardian_authority_redemptions"."qualification" IS NOT NULL AND "guardian_authority_redemptions"."issued_at" IS NOT NULL AND "guardian_authority_redemptions"."not_before" IS NOT NULL AND "guardian_authority_redemptions"."expires_at" IS NOT NULL AND "guardian_authority_redemptions"."authority_token_digest" IS NOT NULL)),
	CONSTRAINT "guardian_authority_redemptions_unissued_has_no_token" CHECK ("guardian_authority_redemptions"."status" = 'issued' OR "guardian_authority_redemptions"."authority_token_digest" IS NULL),
	CONSTRAINT "guardian_authority_redemptions_window_valid" CHECK ("guardian_authority_redemptions"."expires_at" IS NULL OR ("guardian_authority_redemptions"."not_before" IS NOT NULL AND "guardian_authority_redemptions"."issued_at" IS NOT NULL AND "guardian_authority_redemptions"."expires_at" > "guardian_authority_redemptions"."not_before" AND "guardian_authority_redemptions"."not_before" >= "guardian_authority_redemptions"."issued_at"))
);
--> statement-breakpoint
ALTER TABLE "guardian_authority_redemptions" ADD CONSTRAINT "guardian_authority_redemptions_guardian_person_id_person_id_fk" FOREIGN KEY ("guardian_person_id") REFERENCES "public"."person"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guardian_authority_redemptions" ADD CONSTRAINT "guardian_authority_redemptions_charge_person_id_person_id_fk" FOREIGN KEY ("charge_person_id") REFERENCES "public"."person"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guardian_authority_redemptions" ADD CONSTRAINT "guardian_authority_redemptions_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "guardian_authority_redemptions_handle_unique" ON "guardian_authority_redemptions" USING btree ("verifier_handle_digest");--> statement-breakpoint
CREATE UNIQUE INDEX "guardian_authority_redemptions_evidence_unique" ON "guardian_authority_redemptions" USING btree ("evidence_id") WHERE "guardian_authority_redemptions"."evidence_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "guardian_authority_redemptions_charge_idx" ON "guardian_authority_redemptions" USING btree ("charge_person_id");--> statement-breakpoint
CREATE INDEX "guardian_authority_redemptions_expiry_idx" ON "guardian_authority_redemptions" USING btree ("expires_at");