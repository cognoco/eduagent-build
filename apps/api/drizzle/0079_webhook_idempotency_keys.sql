CREATE TABLE "webhook_idempotency_keys" (
	"source" text NOT NULL,
	"webhook_id" text NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "webhook_idempotency_keys_source_webhook_id_pk" PRIMARY KEY("source","webhook_id")
);
--> statement-breakpoint
CREATE INDEX "webhook_idempotency_keys_received_at_idx" ON "webhook_idempotency_keys" USING btree ("received_at");