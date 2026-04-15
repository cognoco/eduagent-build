ALTER TABLE "learning_profiles" ADD COLUMN "recently_resolved_topics" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "curriculum_books_subject_sort_order_uq" ON "curriculum_books" USING btree ("subject_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "curriculum_topics_book_sort_order_uq" ON "curriculum_topics" USING btree ("curriculum_id","book_id","sort_order");
