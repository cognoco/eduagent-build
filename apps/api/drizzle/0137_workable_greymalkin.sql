ALTER TYPE "public"."notification_type" ADD VALUE 'payment_failed' BEFORE 'streak_warning';--> statement-breakpoint
CREATE TABLE "billing_alerts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"subscription_id" uuid NOT NULL,
	"source_event_id" text NOT NULL,
	"source" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"push_status" text,
	"push_failure_reason" text,
	"email_status" text,
	"email_failure_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "billing_alerts_source_check" CHECK ("billing_alerts"."source" IN ('stripe', 'revenuecat', 'unknown')),
	CONSTRAINT "billing_alerts_push_status_check" CHECK ("billing_alerts"."push_status" IS NULL OR "billing_alerts"."push_status" IN ('sent', 'failed')),
	CONSTRAINT "billing_alerts_email_status_check" CHECK ("billing_alerts"."email_status" IS NULL OR "billing_alerts"."email_status" IN ('sent', 'failed'))
);
--> statement-breakpoint
ALTER TABLE "billing_alerts" ADD CONSTRAINT "billing_alerts_subscription_id_subscription_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscription"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "billing_alerts_source_event_id_uq" ON "billing_alerts" USING btree ("source_event_id");--> statement-breakpoint
CREATE INDEX "billing_alerts_subscription_occurred_id_idx" ON "billing_alerts" USING btree ("subscription_id","occurred_at" DESC NULLS LAST,"id" DESC NULLS LAST);