-- Migration 0008: Add language learning schema
-- These schema elements were added to the Drizzle schema during the language
-- pedagogy epic but never had a migration generated. Dev worked because
-- `drizzle-kit push` was used, but staging/production only run committed
-- migrations via `drizzle-kit migrate`.

-- Step 1: Create new enum types
CREATE TYPE "public"."pedagogy_mode" AS ENUM('socratic', 'four_strands');
--> statement-breakpoint
CREATE TYPE "public"."vocab_type" AS ENUM('word', 'chunk');
--> statement-breakpoint

-- Step 2: Add missing columns to subjects
ALTER TABLE "subjects" ADD COLUMN "pedagogy_mode" "pedagogy_mode" DEFAULT 'socratic' NOT NULL;
--> statement-breakpoint
ALTER TABLE "subjects" ADD COLUMN "language_code" text;
--> statement-breakpoint
ALTER TABLE "subjects" ADD COLUMN "urgency_boost_until" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "subjects" ADD COLUMN "urgency_boost_reason" text;
--> statement-breakpoint

-- Step 3: Create curriculum_books table (before adding FK from curriculum_topics)
CREATE TABLE "curriculum_books" (
	"id" uuid PRIMARY KEY NOT NULL,
	"subject_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"emoji" text,
	"sort_order" integer NOT NULL,
	"topics_generated" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- Step 4: Add missing columns to curriculum_topics
ALTER TABLE "curriculum_topics" ADD COLUMN "book_id" uuid;
--> statement-breakpoint
ALTER TABLE "curriculum_topics" ADD COLUMN "chapter" text;
--> statement-breakpoint
ALTER TABLE "curriculum_topics" ADD COLUMN "cefr_level" text;
--> statement-breakpoint
ALTER TABLE "curriculum_topics" ADD COLUMN "cefr_sublevel" text;
--> statement-breakpoint
ALTER TABLE "curriculum_topics" ADD COLUMN "target_word_count" integer;
--> statement-breakpoint
ALTER TABLE "curriculum_topics" ADD COLUMN "target_chunk_count" integer;
--> statement-breakpoint

-- Step 5: Create vocabulary table
CREATE TABLE "vocabulary" (
	"id" uuid PRIMARY KEY NOT NULL,
	"profile_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"term" text NOT NULL,
	"term_normalized" text NOT NULL,
	"translation" text NOT NULL,
	"type" "vocab_type" DEFAULT 'word' NOT NULL,
	"cefr_level" text,
	"milestone_id" uuid,
	"mastered" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- Step 6: Create vocabulary_retention_cards table
CREATE TABLE "vocabulary_retention_cards" (
	"id" uuid PRIMARY KEY NOT NULL,
	"profile_id" uuid NOT NULL,
	"vocabulary_id" uuid NOT NULL,
	"ease_factor" numeric(4, 2) DEFAULT '2.50' NOT NULL,
	"interval_days" integer DEFAULT 0 NOT NULL,
	"repetitions" integer DEFAULT 0 NOT NULL,
	"last_reviewed_at" timestamp with time zone,
	"next_review_at" timestamp with time zone,
	"failure_count" integer DEFAULT 0 NOT NULL,
	"consecutive_successes" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- Step 7: Add foreign keys for new tables and columns
ALTER TABLE "curriculum_books" ADD CONSTRAINT "curriculum_books_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "curriculum_topics" ADD CONSTRAINT "curriculum_topics_book_id_curriculum_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."curriculum_books"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "vocabulary" ADD CONSTRAINT "vocabulary_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "vocabulary" ADD CONSTRAINT "vocabulary_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "vocabulary" ADD CONSTRAINT "vocabulary_milestone_id_curriculum_topics_id_fk" FOREIGN KEY ("milestone_id") REFERENCES "public"."curriculum_topics"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "vocabulary_retention_cards" ADD CONSTRAINT "vocabulary_retention_cards_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "vocabulary_retention_cards" ADD CONSTRAINT "vocabulary_retention_cards_vocabulary_id_vocabulary_id_fk" FOREIGN KEY ("vocabulary_id") REFERENCES "public"."vocabulary"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

-- Step 8: Add indexes and unique constraints
ALTER TABLE "vocabulary" ADD CONSTRAINT "vocabulary_profile_subject_term_unique" UNIQUE("profile_id", "subject_id", "term_normalized");
--> statement-breakpoint
CREATE INDEX "vocabulary_profile_subject_idx" ON "vocabulary" USING btree ("profile_id", "subject_id");
--> statement-breakpoint
ALTER TABLE "vocabulary_retention_cards" ADD CONSTRAINT "vocab_retention_cards_vocabulary_unique" UNIQUE("vocabulary_id");
--> statement-breakpoint
CREATE INDEX "vocab_retention_cards_review_idx" ON "vocabulary_retention_cards" USING btree ("profile_id", "next_review_at");
