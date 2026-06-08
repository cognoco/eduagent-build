## Rollback

Drop `concept_mastery`, then `concepts`, then the `concept_mastery_status` enum. Safe: pre-launch the captured data is test-only and no shipped surface depends on these tables, so star/correction surfaces degrade to neutral and review is unaffected. No production data loss.
