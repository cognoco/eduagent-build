-- Unique sort order within a subject's books
CREATE UNIQUE INDEX IF NOT EXISTS "curriculum_books_subject_sort_order_uq"
  ON "curriculum_books" USING btree ("subject_id", "sort_order");
--> statement-breakpoint
-- Unique sort order within a book's topics
CREATE UNIQUE INDEX IF NOT EXISTS "curriculum_topics_book_sort_order_uq"
  ON "curriculum_topics" USING btree ("book_id", "sort_order");
