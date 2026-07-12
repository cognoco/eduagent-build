CREATE TABLE "speaking_practice_attempts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"session_id" uuid NOT NULL,
	"profile_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"mode" text NOT NULL,
	"target_text" text NOT NULL,
	"transcript" text NOT NULL,
	"locale" text NOT NULL,
	"attempt_number" integer NOT NULL,
	"lexical_match_score" real NOT NULL,
	"missing_words" jsonb NOT NULL,
	"extra_words" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "speaking_practice_attempts" ADD CONSTRAINT "speaking_practice_attempts_session_id_learning_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."learning_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "speaking_practice_attempts" ADD CONSTRAINT "speaking_practice_attempts_profile_id_person_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."person"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "speaking_practice_attempts" ADD CONSTRAINT "speaking_practice_attempts_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- WI-1777 review rework: closes a read-then-write race on attempt_number —
-- two concurrent submits for the same (profile, session, target) could both
-- read the same prior count and both insert the same attempt_number. The
-- service (attempt.ts) retries on violation of this constraint.
ALTER TABLE "speaking_practice_attempts" ADD CONSTRAINT "speaking_practice_attempts_profile_session_target_attempt_uq" UNIQUE("profile_id","session_id","target_text","attempt_number");--> statement-breakpoint
CREATE INDEX "speaking_practice_attempts_session_id_idx" ON "speaking_practice_attempts" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "speaking_practice_attempts_profile_created_idx" ON "speaking_practice_attempts" USING btree ("profile_id","created_at");--> statement-breakpoint
-- [ASSUMP-F14] Profile-scoped table — RLS must be enabled in the same
-- migration that creates it (F14 was caused by these landing in separate
-- migrations and the second being forgotten).
ALTER TABLE "speaking_practice_attempts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='speaking_practice_attempts' AND policyname='speaking_practice_attempts_profile_isolation') THEN
    CREATE POLICY "speaking_practice_attempts_profile_isolation" ON "speaking_practice_attempts"
      USING ("profile_id" = NULLIF(current_setting('app.current_profile_id', true), '')::uuid)
      WITH CHECK ("profile_id" = NULLIF(current_setting('app.current_profile_id', true), '')::uuid);
  END IF;
END $$;