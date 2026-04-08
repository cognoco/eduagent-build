CREATE TYPE "public"."filed_from" AS ENUM('pre_generated', 'session_filing', 'freeform_filing');--> statement-breakpoint
CREATE TABLE "book_suggestions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"subject_id" uuid NOT NULL,
	"title" text NOT NULL,
	"emoji" text,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"picked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "topic_suggestions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"book_id" uuid NOT NULL,
	"title" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"used_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "curriculum_topics" ADD COLUMN "filed_from" "filed_from" DEFAULT 'pre_generated' NOT NULL;--> statement-breakpoint
ALTER TABLE "curriculum_topics" ADD COLUMN "session_id" uuid;--> statement-breakpoint
ALTER TABLE "learning_sessions" ADD COLUMN "raw_input" text;--> statement-breakpoint
ALTER TABLE "book_suggestions" ADD CONSTRAINT "book_suggestions_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topic_suggestions" ADD CONSTRAINT "topic_suggestions_book_id_curriculum_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."curriculum_books"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curriculum_topics" ADD CONSTRAINT "curriculum_topics_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."learning_sessions"("id") ON DELETE set null ON UPDATE no action;