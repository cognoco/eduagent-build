CREATE TABLE "terminal_deletion_failure_outbox" (
	"signal_id" text PRIMARY KEY NOT NULL,
	"event_name" text NOT NULL,
	"account_id" text,
	"run_id" text,
	"error_name" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "terminal_deletion_failure_outbox_event_name_check" CHECK ("terminal_deletion_failure_outbox"."event_name" IN ('app/account.deletion_teardown.failed', 'app/billing.subscription_store_teardown.failed')),
	CONSTRAINT "terminal_deletion_failure_outbox_error_name_check" CHECK ("terminal_deletion_failure_outbox"."error_name" IN ('Error', 'NonError', 'TypeError', 'TimeoutError'))
);
--> statement-breakpoint
CREATE INDEX "terminal_deletion_failure_outbox_created_at_idx" ON "terminal_deletion_failure_outbox" USING btree ("created_at");