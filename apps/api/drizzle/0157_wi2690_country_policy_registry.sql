CREATE TABLE "country_policy_registry" (
	"id" uuid PRIMARY KEY NOT NULL,
	"country_code" text NOT NULL,
	"country_name" text NOT NULL,
	"regime_id" uuid NOT NULL,
	"article8_threshold" smallint NOT NULL,
	"authorization_form" text NOT NULL,
	"launch_status" text NOT NULL,
	"launch_block_reason" text,
	"legal_verification_status" text NOT NULL,
	"legal_reviewed_at" timestamp with time zone NOT NULL,
	"legal_review_valid_until" timestamp with time zone NOT NULL,
	"launch_day_review_required" boolean DEFAULT false NOT NULL,
	"processing_location_class" text NOT NULL,
	"policy_version" text NOT NULL,
	"effective_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone,
	"source_provenance" jsonb NOT NULL,
	"controller_gates" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "country_policy_registry_country_code_valid" CHECK ("country_policy_registry"."country_code" ~ '^[A-Z]{2}$'),
	CONSTRAINT "country_policy_registry_threshold_valid" CHECK ("country_policy_registry"."article8_threshold" BETWEEN 13 AND 16),
	CONSTRAINT "country_policy_registry_authorization_form_valid" CHECK ("country_policy_registry"."authorization_form" IN ('self', 'guardian', 'joint_child_guardian')),
	CONSTRAINT "country_policy_registry_launch_status_valid" CHECK ("country_policy_registry"."launch_status" IN ('enabled', 'blocked')),
	CONSTRAINT "country_policy_registry_legal_verification_valid" CHECK ("country_policy_registry"."legal_verification_status" IN ('verified', 'unverified')),
	CONSTRAINT "country_policy_registry_processing_location_valid" CHECK ("country_policy_registry"."processing_location_class" IN ('eea_only', 'blocked')),
	CONSTRAINT "country_policy_registry_enabled_requires_verified" CHECK ("country_policy_registry"."launch_status" <> 'enabled' OR "country_policy_registry"."legal_verification_status" = 'verified'),
	CONSTRAINT "country_policy_registry_blocked_requires_reason" CHECK ("country_policy_registry"."launch_status" <> 'blocked' OR "country_policy_registry"."launch_block_reason" IS NOT NULL),
	CONSTRAINT "country_policy_registry_effective_window_valid" CHECK ("country_policy_registry"."expires_at" IS NULL OR "country_policy_registry"."expires_at" > "country_policy_registry"."effective_at")
);
--> statement-breakpoint
ALTER TABLE "country_policy_registry" ADD CONSTRAINT "country_policy_registry_regime_id_regimes_id_fk" FOREIGN KEY ("regime_id") REFERENCES "public"."regimes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "country_policy_registry_unique" ON "country_policy_registry" USING btree ("country_code","effective_at");--> statement-breakpoint
CREATE INDEX "idx_country_policy_registry_lookup" ON "country_policy_registry" USING btree ("country_code","effective_at" DESC NULLS LAST);