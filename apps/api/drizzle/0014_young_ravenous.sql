ALTER TYPE "public"."notification_type" ADD VALUE 'recall_nudge';--> statement-breakpoint
CREATE TABLE "topic_notes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"topic_id" uuid NOT NULL,
	"profile_id" uuid NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "topic_notes_topic_id_profile_id_unique" UNIQUE("topic_id","profile_id")
);
--> statement-breakpoint
-- [CFG-12 / BUG-MIGRATE-0014] Historical artefact: this backfill assumed a
-- "subject_id" column on curriculum_topics that was never declared by any
-- committed migration (it existed transiently in earlier `drizzle-kit push`
-- environments and was dropped before the schema was committed). On
-- staging/prod this UPDATE happened to run when the column briefly existed;
-- on fresh databases it parses against the current schema and fails with
-- `column ct.subject_id does not exist`. Switching CI to drizzle-kit migrate
-- exposed this. Wrapping in a column-existence guard makes the statement a
-- no-op on fresh DBs (no rows to backfill anyway — table is empty) while
-- preserving the original intent on any DB where the column once existed.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'curriculum_topics'
      AND column_name = 'subject_id'
  ) THEN
    EXECUTE $sql$
      UPDATE "curriculum_topics" ct
      SET "book_id" = (
        SELECT b.id FROM "curriculum_books" b
        WHERE b.subject_id = ct.subject_id
        ORDER BY b.created_at
        LIMIT 1
      )
      WHERE ct.book_id IS NULL
    $sql$;
  END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM curriculum_topics WHERE book_id IS NULL) THEN
    RAISE EXCEPTION 'Migration aborted: curriculum_topics rows with no matching book found. Backfill required before applying NOT NULL constraint.';
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "curriculum_topics" ALTER COLUMN "book_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "topic_notes" ADD CONSTRAINT "topic_notes_topic_id_curriculum_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."curriculum_topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topic_notes" ADD CONSTRAINT "topic_notes_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;