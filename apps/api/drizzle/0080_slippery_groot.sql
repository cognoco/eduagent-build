CREATE TABLE "challenge_round_cooldowns" (
	"id" uuid PRIMARY KEY NOT NULL,
	"profile_id" uuid NOT NULL,
	"topic_id" uuid NOT NULL,
	"last_offered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_outcome" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "challenge_round_cooldowns_last_outcome_range" CHECK ("last_outcome" IS NULL OR ("last_outcome" >= 0 AND "last_outcome" <= 3)),
	CONSTRAINT "challenge_round_cooldowns_profile_topic_unique" UNIQUE("profile_id","topic_id")
);
--> statement-breakpoint
ALTER TABLE "challenge_round_cooldowns" ADD CONSTRAINT "challenge_round_cooldowns_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenge_round_cooldowns" ADD CONSTRAINT "challenge_round_cooldowns_topic_id_curriculum_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."curriculum_topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenge_round_cooldowns" ENABLE ROW LEVEL SECURITY;
