# Rollback: 0024 — Add `struggle_noticed`, `struggle_flagged`, `struggle_resolved` to `notification_type` enum

Migration adds three values to the `notification_type` enum via `ALTER TYPE ADD VALUE`.

## Rollback

- **(a) Rollback possible?** **No.** PostgreSQL does not support `ALTER TYPE ... DROP VALUE`. Once enum values are added they are permanent for the lifetime of the type. The only way to remove them is to recreate the enum and all dependent objects, which requires downtime and is destructive.

- **(b) Data lost?** No data is directly destroyed by the enum additions. However, if rows in any table (e.g. `notifications`) reference `type = 'struggle_noticed'`, `'struggle_flagged'`, or `'struggle_resolved'`, those rows would become invalid under a reconstructed enum that omits these values. Removing those rows constitutes data loss.

- **(c) Recovery procedure?** Rollback is not possible without recreating the enum.

  If recreation is absolutely required:
  1. Delete all rows in `notifications` (or other tables) where `type` is one of `struggle_noticed`, `struggle_flagged`, `struggle_resolved`.
  2. Drop all dependent objects (columns, constraints, indexes) that reference `notification_type`.
  3. Drop and recreate the enum without the unwanted values.
  4. Recreate all dependent objects.
  5. Rebuild and redeploy the API Worker.

  **Data loss is permanent** for any notification rows using these types.
