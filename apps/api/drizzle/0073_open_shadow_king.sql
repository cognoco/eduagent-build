ALTER TABLE "quiz_rounds" ADD COLUMN "subject_id" uuid;--> statement-breakpoint
ALTER TABLE "quiz_rounds" ADD CONSTRAINT "quiz_rounds_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_quiz_rounds_profile_subject" ON "quiz_rounds" USING btree ("profile_id","subject_id");