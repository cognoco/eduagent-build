-- 0119_email_suppressions.sql
-- Permanently-dead recipient addresses. The Resend webhook records a row here
-- on a HARD bounce (`bounce.type === 'Permanent'`) or a spam complaint; the
-- send path (sendEmail) skips any address present here. Soft/transient bounces
-- are NOT recorded — they may accept mail again. The address is the primary
-- key, so re-suppression is an idempotent no-op.
--
-- ## Rollback
-- Trivially reversible. Lossless to the application: `DROP TABLE
-- "email_suppressions";`. The only data lost is the suppression list itself —
-- after a rollback the send path stops skipping dead addresses (reverting to
-- the pre-fix behaviour of re-sending to them) until the table is restored.
-- No user-facing or learning data is stored here.

CREATE TABLE "email_suppressions" (
	"email" text PRIMARY KEY NOT NULL,
	"reason" text NOT NULL,
	"email_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "email_suppressions_created_at_idx" ON "email_suppressions" USING btree ("created_at");