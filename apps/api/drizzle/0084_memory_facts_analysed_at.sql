ALTER TABLE "learning_profiles" ADD COLUMN IF NOT EXISTS "memory_facts_analysed_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "curriculum_adaptations_profile_id_idx" ON "curriculum_adaptations" USING btree ("profile_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "curriculum_adaptations_subject_id_idx" ON "curriculum_adaptations" USING btree ("subject_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "curriculum_adaptations_topic_id_idx" ON "curriculum_adaptations" USING btree ("topic_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "topic_connections_topic_a_id_idx" ON "topic_connections" USING btree ("topic_a_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "topic_connections_topic_b_id_idx" ON "topic_connections" USING btree ("topic_b_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "onboarding_drafts_profile_id_idx" ON "onboarding_drafts" USING btree ("profile_id");
