ALTER TABLE "learning_profiles"
ADD COLUMN IF NOT EXISTS "celebration_level" "celebration_level" DEFAULT 'big_only' NOT NULL;
