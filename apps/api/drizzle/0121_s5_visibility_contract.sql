CREATE TABLE "support_visibility_audit_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"supportership_id" uuid NOT NULL,
	"contract_id" uuid,
	"actor_person_id" uuid,
	"event_type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "support_visibility_audit_events_type_check" CHECK ("support_visibility_audit_events"."event_type" IN ('contract_initiated','contract_accepted','appeal_requested','supportership_revoked','graduation_restamped'))
);
--> statement-breakpoint
CREATE TABLE "support_visibility_contracts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"supportership_id" uuid NOT NULL,
	"supporter_person_id" uuid NOT NULL,
	"supportee_person_id" uuid NOT NULL,
	"relation" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"contract_version" integer DEFAULT 1 NOT NULL,
	"reportable_kinds" text[] NOT NULL,
	"artifact_wall" boolean DEFAULT true NOT NULL,
	"render_equivalence" boolean DEFAULT true NOT NULL,
	"safety_exception" boolean DEFAULT true NOT NULL,
	"supporter_accepted_at" timestamp with time zone,
	"supportee_accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "support_visibility_contracts_relation_check" CHECK ("support_visibility_contracts"."relation" IN ('parent','sibling','teacher','other')),
	CONSTRAINT "support_visibility_contracts_status_check" CHECK ("support_visibility_contracts"."status" IN ('pending','accepted','revoked','restamped','lapsed')),
	CONSTRAINT "support_visibility_contracts_kinds_check" CHECK ("support_visibility_contracts"."reportable_kinds" <@ ARRAY['mastery','effort','observable_engagement']::text[] AND cardinality("support_visibility_contracts"."reportable_kinds") >= 1),
	CONSTRAINT "support_visibility_contracts_trust_invariants_check" CHECK ("support_visibility_contracts"."artifact_wall" = true AND "support_visibility_contracts"."render_equivalence" = true AND "support_visibility_contracts"."safety_exception" = true)
);
--> statement-breakpoint
CREATE TABLE "support_visibility_notices" (
	"id" uuid PRIMARY KEY NOT NULL,
	"supportership_id" uuid NOT NULL,
	"contract_id" uuid,
	"notice_type" text NOT NULL,
	"target_audience" text NOT NULL,
	"target_person_id" uuid NOT NULL,
	"payload" jsonb NOT NULL,
	"acknowledged_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "support_visibility_notices_type_check" CHECK ("support_visibility_notices"."notice_type" IN ('support_link_ended','graduation_contract_restamped')),
	CONSTRAINT "support_visibility_notices_audience_check" CHECK ("support_visibility_notices"."target_audience" IN ('supporter','supportee'))
);
--> statement-breakpoint
ALTER TABLE "support_visibility_audit_events" ADD CONSTRAINT "support_visibility_audit_events_supportership_id_supportership_id_fk" FOREIGN KEY ("supportership_id") REFERENCES "public"."supportership"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_visibility_audit_events" ADD CONSTRAINT "support_visibility_audit_events_contract_id_support_visibility_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."support_visibility_contracts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_visibility_audit_events" ADD CONSTRAINT "support_visibility_audit_events_actor_person_id_person_id_fk" FOREIGN KEY ("actor_person_id") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_visibility_contracts" ADD CONSTRAINT "support_visibility_contracts_supportership_id_supportership_id_fk" FOREIGN KEY ("supportership_id") REFERENCES "public"."supportership"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_visibility_contracts" ADD CONSTRAINT "support_visibility_contracts_supporter_person_id_person_id_fk" FOREIGN KEY ("supporter_person_id") REFERENCES "public"."person"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_visibility_contracts" ADD CONSTRAINT "support_visibility_contracts_supportee_person_id_person_id_fk" FOREIGN KEY ("supportee_person_id") REFERENCES "public"."person"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_visibility_notices" ADD CONSTRAINT "support_visibility_notices_supportership_id_supportership_id_fk" FOREIGN KEY ("supportership_id") REFERENCES "public"."supportership"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_visibility_notices" ADD CONSTRAINT "support_visibility_notices_contract_id_support_visibility_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."support_visibility_contracts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_visibility_notices" ADD CONSTRAINT "support_visibility_notices_target_person_id_person_id_fk" FOREIGN KEY ("target_person_id") REFERENCES "public"."person"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "support_visibility_audit_events_supportership_created_idx" ON "support_visibility_audit_events" USING btree ("supportership_id","created_at");--> statement-breakpoint
CREATE INDEX "support_visibility_audit_events_actor_idx" ON "support_visibility_audit_events" USING btree ("actor_person_id");--> statement-breakpoint
CREATE UNIQUE INDEX "support_visibility_contracts_supportership_active_unique" ON "support_visibility_contracts" USING btree ("supportership_id") WHERE "support_visibility_contracts"."status" IN ('pending','accepted','restamped');--> statement-breakpoint
CREATE INDEX "support_visibility_contracts_supporter_idx" ON "support_visibility_contracts" USING btree ("supporter_person_id");--> statement-breakpoint
CREATE INDEX "support_visibility_contracts_supportee_idx" ON "support_visibility_contracts" USING btree ("supportee_person_id");--> statement-breakpoint
CREATE INDEX "support_visibility_notices_target_created_idx" ON "support_visibility_notices" USING btree ("target_person_id","created_at");--> statement-breakpoint
CREATE INDEX "support_visibility_notices_supportership_idx" ON "support_visibility_notices" USING btree ("supportership_id");