CREATE TYPE "public"."nudge_template" AS ENUM (
  'you_got_this',
  'proud_of_you',
  'quick_session',
  'thinking_of_you'
);

CREATE TABLE "nudges" (
  "id" uuid PRIMARY KEY NOT NULL,
  "from_profile_id" uuid NOT NULL,
  "to_profile_id" uuid NOT NULL,
  "template" "nudge_template" NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "read_at" timestamp with time zone
);

ALTER TABLE "nudges"
  ADD CONSTRAINT "nudges_from_profile_id_profiles_id_fk"
  FOREIGN KEY ("from_profile_id") REFERENCES "public"."profiles"("id")
  ON DELETE cascade ON UPDATE no action;

ALTER TABLE "nudges"
  ADD CONSTRAINT "nudges_to_profile_id_profiles_id_fk"
  FOREIGN KEY ("to_profile_id") REFERENCES "public"."profiles"("id")
  ON DELETE cascade ON UPDATE no action;

CREATE INDEX "nudges_to_profile_read_at_idx"
  ON "nudges" USING btree ("to_profile_id", "read_at");

CREATE INDEX "nudges_from_to_created_at_idx"
  ON "nudges" USING btree ("from_profile_id", "to_profile_id", "created_at");
