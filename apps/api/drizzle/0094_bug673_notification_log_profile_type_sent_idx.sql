DROP INDEX "notification_log_profile_sent_idx";--> statement-breakpoint
CREATE INDEX "notification_log_profile_type_sent_idx" ON "notification_log" USING btree ("profile_id","type","sent_at");
