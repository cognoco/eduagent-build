CREATE TABLE "evidence_links" (
	"id" uuid PRIMARY KEY NOT NULL,
	"profile_id" uuid NOT NULL,
	"from_kind" text NOT NULL,
	"from_id" uuid NOT NULL,
	"to_kind" text NOT NULL,
	"to_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "evidence_links" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='evidence_links' AND policyname='evidence_links_profile_isolation') THEN
    CREATE POLICY "evidence_links_profile_isolation" ON "evidence_links"
      USING ("profile_id" = NULLIF(current_setting('app.current_profile_id', true), '')::uuid)
      WITH CHECK ("profile_id" = NULLIF(current_setting('app.current_profile_id', true), '')::uuid);
  END IF;
END $$;--> statement-breakpoint
-- Expand phase: the previously deployed Worker explicitly writes NULL.
-- Keep this column nullable until a later contraction migration, after the
-- whole fleet writes non-NULL artifact sources.
ALTER TABLE "topic_notes" ALTER COLUMN "artifact_source" SET DEFAULT 'learner_authored_note';--> statement-breakpoint
UPDATE "topic_notes" SET "artifact_source" = 'learner_authored_note' WHERE "artifact_source" IS NULL;--> statement-breakpoint
ALTER TABLE "bookmarks" ADD COLUMN "artifact_source" text DEFAULT 'freeform_keep' NOT NULL;--> statement-breakpoint
ALTER TABLE "bookmarks" ADD COLUMN "verification_state" text DEFAULT 'unverified' NOT NULL;--> statement-breakpoint
ALTER TABLE "topic_notes" ADD COLUMN "verification_state" text DEFAULT 'unverified' NOT NULL;--> statement-breakpoint
UPDATE "topic_notes" SET "verification_state" = 'verified' WHERE "artifact_source" = 'challenge_drafted_note';--> statement-breakpoint
ALTER TABLE "evidence_links" ADD CONSTRAINT "evidence_links_profile_id_person_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."person"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "evidence_links_profile_from_idx" ON "evidence_links" USING btree ("profile_id","from_kind","from_id");--> statement-breakpoint
CREATE INDEX "evidence_links_profile_to_idx" ON "evidence_links" USING btree ("profile_id","to_kind","to_id");--> statement-breakpoint
CREATE UNIQUE INDEX "evidence_links_profile_endpoints_unique" ON "evidence_links" USING btree ("profile_id","from_kind","from_id","to_kind","to_id");--> statement-breakpoint
ALTER TABLE "topic_notes" ADD CONSTRAINT "topic_notes_artifact_source_check" CHECK ("artifact_source" IN ('challenge_solid_quote', 'challenge_drafted_note', 'learner_authored_note'));--> statement-breakpoint
ALTER TABLE "topic_notes" ADD CONSTRAINT "topic_notes_verification_state_check" CHECK ("verification_state" IN ('unverified', 'verified'));--> statement-breakpoint
ALTER TABLE "bookmarks" ADD CONSTRAINT "bookmarks_artifact_source_check" CHECK ("artifact_source" = 'freeform_keep');--> statement-breakpoint
ALTER TABLE "bookmarks" ADD CONSTRAINT "bookmarks_verification_state_check" CHECK ("verification_state" = 'unverified');--> statement-breakpoint
ALTER TABLE "evidence_links" ADD CONSTRAINT "evidence_links_from_kind_check" CHECK ("from_kind" IN ('artifact', 'exchange'));--> statement-breakpoint
ALTER TABLE "evidence_links" ADD CONSTRAINT "evidence_links_to_kind_check" CHECK ("to_kind" IN ('note', 'bookmark', 'transcript_excerpt', 'homework_ocr'));
