CREATE TABLE "family_join_journey" (
	"id" uuid PRIMARY KEY NOT NULL,
	"invite_id" uuid NOT NULL,
	"charge_person_id" uuid NOT NULL,
	"family_org_id" uuid NOT NULL,
	"state" text NOT NULL,
	"jurisdiction" text NOT NULL,
	"policy_version" text NOT NULL,
	"authorization_form" text NOT NULL,
	"learner_assented_at" timestamp with time zone,
	"learner_supportership_preference" text,
	"supportership_authority" text NOT NULL,
	"supportership_decision" text,
	"guardian_person_id" uuid,
	"guardian_authority_redemption_id" uuid,
	"visibility_contract_id" uuid,
	"bound_at" timestamp with time zone DEFAULT now() NOT NULL,
	"guardian_completed_at" timestamp with time zone,
	"declined_at" timestamp with time zone,
	"withdrawn_at" timestamp with time zone,
	"joined_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "family_join_journey_state_valid" CHECK ("family_join_journey"."state" IN ('awaiting_guardian','ready_to_join','joined','declined','withdrawn')),
	CONSTRAINT "family_join_journey_authorization_form_valid" CHECK ("family_join_journey"."authorization_form" IS NULL OR "family_join_journey"."authorization_form" IN ('self','guardian','joint_child_guardian')),
	CONSTRAINT "family_join_journey_learner_supportership_preference_valid" CHECK ("family_join_journey"."learner_supportership_preference" IS NULL OR "family_join_journey"."learner_supportership_preference" IN ('accept','decline')),
	CONSTRAINT "family_join_journey_supportership_authority_valid" CHECK ("family_join_journey"."supportership_authority" IS NULL OR "family_join_journey"."supportership_authority" IN ('learner','guardian')),
	CONSTRAINT "family_join_journey_supportership_decision_valid" CHECK ("family_join_journey"."supportership_decision" IS NULL OR "family_join_journey"."supportership_decision" IN ('accept','decline')),
	CONSTRAINT "family_join_journey_legal_posture_complete" CHECK (("family_join_journey"."jurisdiction" IS NULL AND "family_join_journey"."policy_version" IS NULL AND "family_join_journey"."authorization_form" IS NULL) OR ("family_join_journey"."jurisdiction" IS NOT NULL AND "family_join_journey"."policy_version" IS NOT NULL AND "family_join_journey"."authorization_form" IS NOT NULL)),
	CONSTRAINT "family_join_journey_decision_authority_complete" CHECK ("family_join_journey"."supportership_decision" IS NULL OR "family_join_journey"."supportership_authority" IS NOT NULL),
	CONSTRAINT "family_join_journey_guardian_completion_complete" CHECK ("family_join_journey"."guardian_completed_at" IS NULL OR "family_join_journey"."state" = 'joined' OR ("family_join_journey"."guardian_person_id" IS NOT NULL AND "family_join_journey"."guardian_authority_redemption_id" IS NOT NULL)),
	CONSTRAINT "family_join_journey_posture_consistent" CHECK (("family_join_journey"."state" = 'awaiting_guardian' AND "family_join_journey"."learner_assented_at" IS NOT NULL AND "family_join_journey"."learner_supportership_preference" IS NOT NULL AND "family_join_journey"."authorization_form" IN ('guardian','joint_child_guardian') AND "family_join_journey"."supportership_authority" = 'guardian' AND "family_join_journey"."supportership_decision" IS NULL AND "family_join_journey"."guardian_completed_at" IS NULL) OR ("family_join_journey"."state" IN ('ready_to_join','joined') AND "family_join_journey"."learner_assented_at" IS NOT NULL AND "family_join_journey"."learner_supportership_preference" IS NOT NULL AND "family_join_journey"."supportership_decision" IS NOT NULL AND (("family_join_journey"."supportership_authority" = 'learner' AND "family_join_journey"."authorization_form" = 'self') OR ("family_join_journey"."supportership_authority" = 'guardian' AND "family_join_journey"."authorization_form" IN ('guardian','joint_child_guardian') AND "family_join_journey"."guardian_completed_at" IS NOT NULL))) OR "family_join_journey"."state" IN ('declined','withdrawn')),
	CONSTRAINT "family_join_journey_terminal_timestamp_valid" CHECK (("family_join_journey"."state" = 'joined') = ("family_join_journey"."joined_at" IS NOT NULL) AND ("family_join_journey"."state" = 'declined') = ("family_join_journey"."declined_at" IS NOT NULL) AND ("family_join_journey"."state" = 'withdrawn') = ("family_join_journey"."withdrawn_at" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "family_join_journey" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "family_join_invite" DROP CONSTRAINT "family_join_invite_status_check";--> statement-breakpoint
ALTER TABLE "support_visibility_audit_events" DROP CONSTRAINT "support_visibility_audit_events_type_check";--> statement-breakpoint
ALTER TABLE "family_join_journey" ADD CONSTRAINT "family_join_journey_invite_id_family_join_invite_id_fk" FOREIGN KEY ("invite_id") REFERENCES "public"."family_join_invite"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_join_journey" ADD CONSTRAINT "family_join_journey_charge_person_id_person_id_fk" FOREIGN KEY ("charge_person_id") REFERENCES "public"."person"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_join_journey" ADD CONSTRAINT "family_join_journey_family_org_id_organization_id_fk" FOREIGN KEY ("family_org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_join_journey" ADD CONSTRAINT "family_join_journey_guardian_person_id_person_id_fk" FOREIGN KEY ("guardian_person_id") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_join_journey" ADD CONSTRAINT "family_join_journey_guardian_authority_redemption_id_guardian_authority_redemptions_id_fk" FOREIGN KEY ("guardian_authority_redemption_id") REFERENCES "public"."guardian_authority_redemptions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_join_journey" ADD CONSTRAINT "family_join_journey_visibility_contract_id_support_visibility_contracts_id_fk" FOREIGN KEY ("visibility_contract_id") REFERENCES "public"."support_visibility_contracts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "family_join_journey_invite_unique" ON "family_join_journey" USING btree ("invite_id");--> statement-breakpoint
CREATE UNIQUE INDEX "family_join_journey_charge_active_unique" ON "family_join_journey" USING btree ("charge_person_id") WHERE "family_join_journey"."state" IN ('awaiting_guardian','ready_to_join');--> statement-breakpoint
CREATE INDEX "family_join_journey_family_org_idx" ON "family_join_journey" USING btree ("family_org_id");--> statement-breakpoint
CREATE INDEX "family_join_journey_guardian_idx" ON "family_join_journey" USING btree ("guardian_person_id") WHERE "family_join_journey"."guardian_person_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "family_join_journey_guardian_redemption_unique" ON "family_join_journey" USING btree ("guardian_authority_redemption_id") WHERE "family_join_journey"."guardian_authority_redemption_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "family_join_journey_visibility_contract_unique" ON "family_join_journey" USING btree ("visibility_contract_id") WHERE "family_join_journey"."visibility_contract_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "family_join_invite" ADD CONSTRAINT "family_join_invite_status_check" CHECK ("family_join_invite"."status" IN ('pending','bound','accepted','declined','withdrawn'));--> statement-breakpoint
ALTER TABLE "support_visibility_audit_events" ADD CONSTRAINT "support_visibility_audit_events_type_check" CHECK ("support_visibility_audit_events"."event_type" IN ('contract_initiated','contract_accepted','appeal_requested','supportership_revoked','graduation_restamped','authority_invalidated'));