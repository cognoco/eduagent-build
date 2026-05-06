CREATE TABLE IF NOT EXISTS "memory_facts" (
  "id" uuid PRIMARY KEY NOT NULL,
  "profile_id" uuid NOT NULL,
  "category" text NOT NULL,
  "text" text NOT NULL,
  "text_normalized" text NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "source_session_ids" uuid[] DEFAULT ARRAY[]::uuid[] NOT NULL,
  "source_event_ids" uuid[] DEFAULT ARRAY[]::uuid[] NOT NULL,
  "observed_at" timestamp with time zone NOT NULL,
  "superseded_by" uuid,
  "superseded_at" timestamp with time zone,
  "embedding" vector(1024),
  "confidence" text DEFAULT 'medium' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "memory_facts_superseded_by_fk"
    FOREIGN KEY ("superseded_by") REFERENCES "memory_facts"("id")
    ON DELETE SET NULL,
  CONSTRAINT "memory_facts_profile_id_profiles_id_fk"
    FOREIGN KEY ("profile_id") REFERENCES "profiles"("id")
    ON DELETE CASCADE,
  CONSTRAINT "memory_facts_confidence_check"
    CHECK ("confidence" IN ('low', 'medium', 'high'))
);

ALTER TABLE "learning_profiles"
  ADD COLUMN IF NOT EXISTS "memory_facts_backfilled_at" timestamp with time zone;

CREATE INDEX IF NOT EXISTS "memory_facts_profile_category_idx"
  ON "memory_facts" ("profile_id", "category");

CREATE INDEX IF NOT EXISTS "memory_facts_profile_created_idx"
  ON "memory_facts" ("profile_id", "created_at");

CREATE INDEX IF NOT EXISTS "memory_facts_active_idx"
  ON "memory_facts" ("profile_id", "category")
  WHERE "superseded_by" IS NULL;

CREATE INDEX IF NOT EXISTS "memory_facts_profile_text_normalized_idx"
  ON "memory_facts" ("profile_id", "text_normalized");

CREATE UNIQUE INDEX IF NOT EXISTS "memory_facts_active_unique_idx"
  ON "memory_facts" (
    "profile_id",
    "category",
    COALESCE("metadata"->>'subject', ''),
    COALESCE("metadata"->>'context', ''),
    "text_normalized"
  )
  WHERE "superseded_by" IS NULL;

CREATE INDEX IF NOT EXISTS "memory_facts_embedding_hnsw_idx"
  ON "memory_facts" USING hnsw ("embedding" vector_cosine_ops)
  WHERE "superseded_by" IS NULL;
