CREATE TABLE "supporter_encouragement_chips" (
	"id" uuid PRIMARY KEY NOT NULL,
	"supportership_id" uuid NOT NULL,
	"supporter_person_id" uuid NOT NULL,
	"supportee_person_id" uuid NOT NULL,
	"source" text NOT NULL,
	"suggested_text" text NOT NULL,
	"subject_id" uuid,
	"topic_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"dismissed_at" timestamp with time zone,
	"consumed_at" timestamp with time zone,
	CONSTRAINT "supporter_encouragement_chips_source_check" CHECK ("supporter_encouragement_chips"."source" IN ('kickstart','co_learning_payoff')),
	CONSTRAINT "supporter_encouragement_chips_text_not_blank" CHECK (length(trim("supporter_encouragement_chips"."suggested_text")) > 0)
);
--> statement-breakpoint
CREATE TABLE "supporter_feed_surface_state" (
	"id" uuid PRIMARY KEY NOT NULL,
	"viewer_person_id" uuid NOT NULL,
	"scope_kind" text NOT NULL,
	"source_kind" text NOT NULL,
	"source_key" text NOT NULL,
	"supportership_id" uuid,
	"target_person_id" uuid,
	"surface_count" integer DEFAULT 0 NOT NULL,
	"surfaced_at" timestamp with time zone,
	"snoozed_until" timestamp with time zone,
	"dismissed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "supporter_feed_surface_state_scope_kind_check" CHECK ("supporter_feed_surface_state"."scope_kind" IN ('supporter-hub','person')),
	CONSTRAINT "supporter_feed_surface_state_surface_count_check" CHECK ("supporter_feed_surface_state"."surface_count" >= 0)
);
--> statement-breakpoint
ALTER TABLE "supporter_encouragement_chips" ADD CONSTRAINT "supporter_encouragement_chips_supportership_id_supportership_id_fk" FOREIGN KEY ("supportership_id") REFERENCES "public"."supportership"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supporter_encouragement_chips" ADD CONSTRAINT "supporter_encouragement_chips_supporter_person_id_person_id_fk" FOREIGN KEY ("supporter_person_id") REFERENCES "public"."person"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supporter_encouragement_chips" ADD CONSTRAINT "supporter_encouragement_chips_supportee_person_id_person_id_fk" FOREIGN KEY ("supportee_person_id") REFERENCES "public"."person"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supporter_encouragement_chips" ADD CONSTRAINT "supporter_encouragement_chips_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supporter_encouragement_chips" ADD CONSTRAINT "supporter_encouragement_chips_topic_id_curriculum_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."curriculum_topics"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supporter_feed_surface_state" ADD CONSTRAINT "supporter_feed_surface_state_viewer_person_id_person_id_fk" FOREIGN KEY ("viewer_person_id") REFERENCES "public"."person"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supporter_feed_surface_state" ADD CONSTRAINT "supporter_feed_surface_state_supportership_id_supportership_id_fk" FOREIGN KEY ("supportership_id") REFERENCES "public"."supportership"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supporter_feed_surface_state" ADD CONSTRAINT "supporter_feed_surface_state_target_person_id_person_id_fk" FOREIGN KEY ("target_person_id") REFERENCES "public"."person"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "supporter_encouragement_chips_supportee_created_idx" ON "supporter_encouragement_chips" USING btree ("supportee_person_id","created_at");--> statement-breakpoint
CREATE INDEX "supporter_encouragement_chips_supporter_supportee_created_idx" ON "supporter_encouragement_chips" USING btree ("supporter_person_id","supportee_person_id","created_at");--> statement-breakpoint
CREATE INDEX "supporter_encouragement_chips_supportership_idx" ON "supporter_encouragement_chips" USING btree ("supportership_id");--> statement-breakpoint
CREATE UNIQUE INDEX "supporter_feed_surface_state_source_unique" ON "supporter_feed_surface_state" USING btree ("viewer_person_id","scope_kind","source_key");--> statement-breakpoint
CREATE INDEX "supporter_feed_surface_state_supportership_idx" ON "supporter_feed_surface_state" USING btree ("supportership_id");--> statement-breakpoint
CREATE INDEX "supporter_feed_surface_state_target_person_idx" ON "supporter_feed_surface_state" USING btree ("target_person_id");