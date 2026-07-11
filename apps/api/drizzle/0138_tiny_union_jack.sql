CREATE TABLE "blocked_safety_daily_buckets" (
	"bucket_date" date PRIMARY KEY NOT NULL,
	"dangerous_procedure_blocked_count" integer DEFAULT 0 NOT NULL,
	"minor_pii_echo_redacted_count" integer DEFAULT 0 NOT NULL,
	"suitability_blocked_count" integer DEFAULT 0 NOT NULL,
	"delivered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "blocked_safety_daily_buckets_dangerous_count_nonnegative" CHECK ("blocked_safety_daily_buckets"."dangerous_procedure_blocked_count" >= 0),
	CONSTRAINT "blocked_safety_daily_buckets_minor_pii_count_nonnegative" CHECK ("blocked_safety_daily_buckets"."minor_pii_echo_redacted_count" >= 0),
	CONSTRAINT "blocked_safety_daily_buckets_suitability_count_nonnegative" CHECK ("blocked_safety_daily_buckets"."suitability_blocked_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "blocked_safety_digest_receipts" (
	"event_id" uuid PRIMARY KEY NOT NULL,
	"event_name" text NOT NULL,
	"bucket_date" date NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "blocked_safety_digest_receipts_event_name_check" CHECK ("blocked_safety_digest_receipts"."event_name" IN ('app/safety.dangerous_procedure_blocked', 'app/safety.minor_pii_echo_redacted', 'app/safety.suitability_blocked'))
);
