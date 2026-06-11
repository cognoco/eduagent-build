CREATE TABLE "feedback_retry_queue" (
	"id" uuid PRIMARY KEY NOT NULL,
	"profile_id" text NOT NULL,
	"user_id" text NOT NULL,
	"category" text NOT NULL,
	"message" text NOT NULL,
	"meta_lines" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
