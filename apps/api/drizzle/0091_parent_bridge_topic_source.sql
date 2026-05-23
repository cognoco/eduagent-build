ALTER TYPE curriculum_topic_source ADD VALUE IF NOT EXISTS 'parent_bridge';

-- Repair staging DBs where the old deploy baseline step recorded 0090 without
-- running its SQL. The column/index are also created by 0090 for fresh DBs.
ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "last_stripe_event_id" text;

CREATE UNIQUE INDEX IF NOT EXISTS "subscriptions_account_stripe_event_id_idx"
  ON "subscriptions" USING btree ("account_id", "last_stripe_event_id")
  WHERE "subscriptions"."last_stripe_event_id" IS NOT NULL;

ALTER TABLE curriculum_topics
  ADD COLUMN IF NOT EXISTS source_child_profile_id UUID
    REFERENCES profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_curriculum_topics_source_child
  ON curriculum_topics (source_child_profile_id)
  WHERE source_child_profile_id IS NOT NULL;
