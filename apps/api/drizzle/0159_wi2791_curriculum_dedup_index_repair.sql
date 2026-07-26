-- WI-2791: restore the two curriculum dedup indexes whose catalog state can
-- drift from the Drizzle ledger. This is a forward-only repair: it never
-- replays the destructive cleanup in migration 0044 and never alters rows.
--
-- Abort before any DDL when historical duplicates exist. Operators must
-- resolve such data under a separately authorized procedure and retry this
-- migration; silently choosing canonical rows here would risk data loss.

DO $$
DECLARE
  book_duplicate_groups bigint;
  topic_duplicate_groups bigint;
BEGIN
  SELECT count(*)
  INTO book_duplicate_groups
  FROM (
    SELECT subject_id, lower(title)
    FROM curriculum_books
    GROUP BY subject_id, lower(title)
    HAVING count(*) > 1
  ) book_duplicates;

  SELECT count(*)
  INTO topic_duplicate_groups
  FROM (
    SELECT book_id, lower(title)
    FROM curriculum_topics
    GROUP BY book_id, lower(title)
    HAVING count(*) > 1
  ) topic_duplicates;

  IF book_duplicate_groups > 0 OR topic_duplicate_groups > 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = format(
        'Migration 0159 aborted: book duplicate groups=%s, topic duplicate groups=%s; repair data outside this migration, then retry.',
        book_duplicate_groups,
        topic_duplicate_groups
      );
  END IF;
END $$;
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "curriculum_books_subject_title_lower_uq"
  ON "curriculum_books" ("subject_id", lower("title"));
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "curriculum_topics_book_title_lower_uq"
  ON "curriculum_topics" ("book_id", lower("title"));

-- ## Rollback
-- Both changes are additive and data-safe to reverse:
--   DROP INDEX IF EXISTS "curriculum_books_subject_title_lower_uq";
--   DROP INDEX IF EXISTS "curriculum_topics_book_title_lower_uq";
