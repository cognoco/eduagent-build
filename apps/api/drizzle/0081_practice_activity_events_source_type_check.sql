ALTER TABLE "practice_activity_events"
  ADD CONSTRAINT "practice_activity_events_source_type_known"
  CHECK (
    "source_type" IN (
      'assessment',
      'book',
      'dictation_result',
      'home_surface_pending_celebration',
      'integration_test',
      'quiz_mastery_item',
      'quiz_round',
      'retention_card',
      'session_event',
      'topic',
      'vocabulary_retention_card'
    )
  ) NOT VALID;
