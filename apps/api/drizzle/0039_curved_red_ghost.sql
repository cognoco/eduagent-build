ALTER TABLE "retention_cards" ALTER COLUMN "ease_factor" SET DEFAULT 2.5;--> statement-breakpoint
ALTER TABLE "vocabulary_retention_cards" ALTER COLUMN "ease_factor" SET DEFAULT 2.5;--> statement-breakpoint
ALTER TABLE "vocabulary_retention_cards" ALTER COLUMN "interval_days" SET DEFAULT 1;--> statement-breakpoint
ALTER TABLE "quiz_mastery_items" ALTER COLUMN "ease_factor" SET DEFAULT 2.5;--> statement-breakpoint
CREATE INDEX "assessments_profile_topic_idx" ON "assessments" USING btree ("profile_id","topic_id");--> statement-breakpoint
CREATE INDEX "assessments_topic_id_idx" ON "assessments" USING btree ("topic_id");--> statement-breakpoint
CREATE INDEX "needs_deepening_profile_topic_idx" ON "needs_deepening_topics" USING btree ("profile_id","topic_id");--> statement-breakpoint
CREATE INDEX "needs_deepening_topic_id_idx" ON "needs_deepening_topics" USING btree ("topic_id");--> statement-breakpoint
CREATE INDEX "curriculum_topics_book_id_idx" ON "curriculum_topics" USING btree ("book_id");--> statement-breakpoint
CREATE INDEX "learning_sessions_profile_subject_exchange_idx" ON "learning_sessions" USING btree ("profile_id","subject_id","exchange_count");--> statement-breakpoint
CREATE INDEX "session_events_profile_event_created_idx" ON "session_events" USING btree ("profile_id","event_type","created_at");--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_mastery_score_range" CHECK ("assessments"."mastery_score" IS NULL OR ("assessments"."mastery_score" >= 0 AND "assessments"."mastery_score" <= 1));--> statement-breakpoint
UPDATE "vocabulary_retention_cards" SET "interval_days" = 1 WHERE "interval_days" < 1;--> statement-breakpoint
ALTER TABLE "vocabulary_retention_cards" ADD CONSTRAINT "vocab_retention_cards_interval_days_positive" CHECK ("vocabulary_retention_cards"."interval_days" >= 1);