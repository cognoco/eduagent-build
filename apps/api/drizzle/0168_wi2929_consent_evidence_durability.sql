ALTER TABLE "consent_grant" ADD COLUMN "policy_version" text;--> statement-breakpoint
ALTER TABLE "consent_receipt" ADD COLUMN "policy_version" text;--> statement-breakpoint
ALTER TABLE "consent_receipt" ADD COLUMN "consent_grant_id" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX "consent_receipt_consent_grant_id_idx" ON "consent_receipt" USING btree ("consent_grant_id") WHERE "consent_receipt"."consent_grant_id" IS NOT NULL;