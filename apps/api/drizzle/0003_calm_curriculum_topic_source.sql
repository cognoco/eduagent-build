CREATE TYPE "public"."curriculum_topic_source" AS ENUM('generated', 'user');
--> statement-breakpoint
ALTER TABLE "curriculum_topics"
ADD COLUMN "source" "curriculum_topic_source" DEFAULT 'generated' NOT NULL;
