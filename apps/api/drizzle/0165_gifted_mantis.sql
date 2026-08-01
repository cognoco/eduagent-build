CREATE TABLE "pending_clerk_erasure" (
	"clerk_user_id_digest" text PRIMARY KEY NOT NULL,
	"erasure_set_digest" text NOT NULL,
	"release_after" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pending_clerk_erasure_user_digest_valid" CHECK ("pending_clerk_erasure"."clerk_user_id_digest" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "pending_clerk_erasure_set_digest_valid" CHECK ("pending_clerk_erasure"."erasure_set_digest" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
CREATE INDEX "pending_clerk_erasure_release_after_idx" ON "pending_clerk_erasure" USING btree ("release_after");