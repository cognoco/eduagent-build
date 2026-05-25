# Rollback: 0005 — Add `session_event_type` enum values (`quick_action`, `user_feedback`, `ocr_correction`, `homework_problem_started`, `homework_problem_completed`)

Migration adds five values to the `session_event_type` enum via `ALTER TYPE ADD VALUE IF NOT EXISTS`.

## Rollback

- **(a) Rollback possible?** **No.** PostgreSQL does not support `ALTER TYPE ... DROP VALUE`. Once enum values are added to a type they are permanent for the lifetime of that type. The only way to remove them is to recreate the enum type from scratch and update all dependent objects, which requires downtime and is risky in production.

- **(b) Data lost?** No data is directly destroyed by the enum additions themselves. However, if rows in `session_events` reference these event types (e.g. `type = 'quick_action'`) and you attempt to reconstruct the enum without those values, those rows would become invalid — you would need to delete or reclassify them before the type drop.

- **(c) Recovery procedure?** Rollback is not practically possible without recreating the enum.

  If recreation is absolutely required:
  1. Delete or reclassify all `session_events` rows where `type` is one of `quick_action`, `user_feedback`, `ocr_correction`, `homework_problem_started`, `homework_problem_completed`.
  2. Drop all dependent objects (indexes, constraints, columns) that reference `session_event_type`.
  3. Drop and recreate the enum without the unwanted values.
  4. Recreate the dependent objects.
  5. Rebuild and redeploy the API Worker.

  In practice this is a destructive operation: **data loss is permanent** for any events using the dropped types.
