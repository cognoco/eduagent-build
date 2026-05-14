ALTER TABLE "celebration_events"
  ADD CONSTRAINT "celebration_events_source_type_known"
  CHECK (
    "source_type" IS NULL
    OR "source_type" IN (
      'assessment',
      'dictation_result',
      'home_surface_pending_celebration',
      'quiz_mastery_item',
      'quiz_round',
      'session_event',
      'vocabulary_retention_card'
    )
  ) NOT VALID;
