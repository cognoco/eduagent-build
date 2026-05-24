ALTER TABLE "session_summaries" ADD COLUMN IF NOT EXISTS "narrative" text;
ALTER TABLE "session_summaries" ADD COLUMN IF NOT EXISTS "conversation_prompt" text;
ALTER TABLE "session_summaries" ADD COLUMN IF NOT EXISTS "engagement_signal" text;
