CREATE TABLE "bookmarks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"profile_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"topic_id" uuid,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "session_summaries" ADD COLUMN "closing_line" text;--> statement-breakpoint
ALTER TABLE "session_summaries" ADD COLUMN "learner_recap" text;--> statement-breakpoint
ALTER TABLE "session_summaries" ADD COLUMN "next_topic_id" uuid;--> statement-breakpoint
ALTER TABLE "session_summaries" ADD COLUMN "next_topic_reason" text;--> statement-breakpoint
ALTER TABLE "bookmarks" ADD CONSTRAINT "bookmarks_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookmarks" ADD CONSTRAINT "bookmarks_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookmarks" ADD CONSTRAINT "bookmarks_topic_id_curriculum_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."curriculum_topics"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bookmarks_profile_id_idx" ON "bookmarks" USING btree ("profile_id");--> statement-breakpoint
CREATE INDEX "bookmarks_session_id_idx" ON "bookmarks" USING btree ("session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "bookmarks_profile_event_unique" ON "bookmarks" USING btree ("profile_id","event_id");--> statement-breakpoint
ALTER TABLE "session_summaries" ADD CONSTRAINT "session_summaries_next_topic_id_curriculum_topics_id_fk" FOREIGN KEY ("next_topic_id") REFERENCES "public"."curriculum_topics"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookmarks" ENABLE ROW LEVEL SECURITY;
