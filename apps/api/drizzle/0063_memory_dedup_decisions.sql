CREATE TABLE IF NOT EXISTS "memory_dedup_decisions" (
  "profile_id" uuid NOT NULL,
  "pair_key" text NOT NULL,
  "decision" text NOT NULL,
  "merged_text" text,
  "model_version" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "memory_dedup_decisions_profile_id_pair_key_pk"
    PRIMARY KEY ("profile_id", "pair_key"),
  CONSTRAINT "memory_dedup_decisions_profile_id_profiles_id_fk"
    FOREIGN KEY ("profile_id") REFERENCES "profiles"("id")
    ON DELETE CASCADE,
  CONSTRAINT "memory_dedup_decisions_decision_check"
    CHECK ("decision" IN ('merge', 'supersede', 'keep_both', 'discard_new'))
);
