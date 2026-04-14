-- Pre-flight: abort if duplicate sort orders exist (would cause unique index creation to fail)
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM curriculum_books
    GROUP BY subject_id, sort_order HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate (subject_id, sort_order) values exist in curriculum_books — run dedup script before applying this migration.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM curriculum_topics
    GROUP BY curriculum_id, book_id, sort_order HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate (curriculum_id, book_id, sort_order) values exist in curriculum_topics — run dedup script before applying this migration.';
  END IF;
END $$;
--> statement-breakpoint
-- Unique sort order within a subject's books
CREATE UNIQUE INDEX IF NOT EXISTS "curriculum_books_subject_sort_order_uq"
  ON "curriculum_books" USING btree ("subject_id", "sort_order");
--> statement-breakpoint
-- Unique sort order within a book's topics, scoped to a curriculum version
CREATE UNIQUE INDEX IF NOT EXISTS "curriculum_topics_book_sort_order_uq"
  ON "curriculum_topics" USING btree ("curriculum_id", "book_id", "sort_order");
