DO $$ BEGIN
 CREATE TYPE "practice_activity_type" AS ENUM (
  'quiz',
  'review',
  'assessment',
  'dictation',
  'recitation',
  'fluency_drill'
 );
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "practice_activity_events" (
  "id" uuid PRIMARY KEY NOT NULL,
  "profile_id" uuid NOT NULL,
  "subject_id" uuid,
  "activity_type" "practice_activity_type" NOT NULL,
  "activity_subtype" text,
  "completed_at" timestamp with time zone DEFAULT now() NOT NULL,
  "points_earned" integer DEFAULT 0 NOT NULL,
  "score" integer,
  "total" integer,
  "source_type" text NOT NULL,
  "source_id" text NOT NULL,
  "dedupe_key" text NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "celebration_events" (
  "id" uuid PRIMARY KEY NOT NULL,
  "profile_id" uuid NOT NULL,
  "celebrated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "celebration_type" text NOT NULL,
  "reason" text NOT NULL,
  "source_type" text,
  "source_id" text,
  "dedupe_key" text NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
 ALTER TABLE "practice_activity_events"
 ADD CONSTRAINT "practice_activity_events_profile_id_profiles_id_fk"
 FOREIGN KEY ("profile_id") REFERENCES "profiles"("id")
 ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "practice_activity_events"
 ADD CONSTRAINT "practice_activity_events_subject_id_subjects_id_fk"
 FOREIGN KEY ("subject_id") REFERENCES "subjects"("id")
 ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "celebration_events"
 ADD CONSTRAINT "celebration_events_profile_id_profiles_id_fk"
 FOREIGN KEY ("profile_id") REFERENCES "profiles"("id")
 ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "practice_activity_events_profile_dedupe_uq"
  ON "practice_activity_events" ("profile_id", "dedupe_key");

CREATE INDEX IF NOT EXISTS "practice_activity_events_profile_completed_idx"
  ON "practice_activity_events" ("profile_id", "completed_at");

CREATE INDEX IF NOT EXISTS "practice_activity_events_profile_type_completed_idx"
  ON "practice_activity_events" ("profile_id", "activity_type", "completed_at");

CREATE INDEX IF NOT EXISTS "practice_activity_events_profile_subject_completed_idx"
  ON "practice_activity_events" ("profile_id", "subject_id", "completed_at");

CREATE UNIQUE INDEX IF NOT EXISTS "celebration_events_profile_dedupe_uq"
  ON "celebration_events" ("profile_id", "dedupe_key");

CREATE INDEX IF NOT EXISTS "celebration_events_profile_celebrated_idx"
  ON "celebration_events" ("profile_id", "celebrated_at");

ALTER TABLE "practice_activity_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "celebration_events" ENABLE ROW LEVEL SECURITY;
