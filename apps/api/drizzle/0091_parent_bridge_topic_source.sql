ALTER TYPE curriculum_topic_source ADD VALUE IF NOT EXISTS 'parent_bridge';

ALTER TABLE curriculum_topics
  ADD COLUMN IF NOT EXISTS source_child_profile_id UUID
    REFERENCES profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_curriculum_topics_source_child
  ON curriculum_topics (source_child_profile_id)
  WHERE source_child_profile_id IS NOT NULL;
