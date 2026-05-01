# 0045 Rollback — Interaction Durability Layer 1

Per `~/.claude/CLAUDE.md` "Destructive Migrations Need a Rollback Section".
Companion to plan `docs/superpowers/plans/2026-05-01-interaction-durability-layer-1-outbox-idempotency.md`.

## Scope of rollback

This migration is **purely additive**:

1. **`support_messages` table** — new greenfield table. No prior data exists.
2. **`session_events.client_id` column** — new nullable column. Pre-existing rows are unaffected; nullability means writes that omitted it remain valid.
3. **`support_messages_profile_idx`** — index on the new table.
4. **`support_messages_profile_client_id_uniq`** — unique index on the new table.
5. **`session_events_session_client_id_uniq`** — partial unique index on `(session_id, client_id) WHERE client_id IS NOT NULL`. Drops cleanly with the column.
6. **FK `support_messages.profile_id → profiles.id ON DELETE CASCADE`** — drops with the table.

## Is rollback possible?

**YES** — fully reversible. Every artifact this migration creates is greenfield or additive.

## Data lost

- `support_messages` rows: **all rows are lost** when the table is dropped. These rows represent client outbox spillover entries (escalations the mobile outbox could not deliver). Loss is acceptable on rollback because:
  - The mobile outbox keeps a local copy until the user acks the in-app banner.
  - These entries are operational telemetry, not the source of truth for any user-visible artifact.
- `session_events.client_id` values written since the migration: lost when the column is dropped. Loss is acceptable: `client_id` is an idempotency dedup key, not user content. The next request after rollback simply cannot dedupe against in-flight pre-rollback writes — duplicate user_message rows become possible for ~the dedup window. Re-running 0045 forward would not restore the lost values; replays would write fresh client_ids.

## Recovery procedure

In dev/staging:

```sql
-- 1. Drop partial unique index on session_events (drops with column on next step,
--    but explicit for clarity)
DROP INDEX IF EXISTS "session_events_session_client_id_uniq";

-- 2. Drop the additive column
ALTER TABLE "session_events" DROP COLUMN "client_id";

-- 3. Drop the new table (cascades the FK + indexes)
DROP TABLE "support_messages";
```

Then revert the merge commit on `main` and redeploy. The `IDEMPOTENCY_KV` namespace (added separately via wrangler) does not need to be deleted — an empty KV is harmless and cheap to leave behind.

## Safe-rollback invariant

Before dropping `session_events.client_id`:

- Verify no code path depends on the column. Grep `apps/api/src` for `client_id` and `clientId` usages on `sessionEvents`/`session_events`.
- Specifically check the idempotency path:
  - `apps/api/src/middleware/idempotency.ts`
  - `apps/api/src/services/idempotency-assistant-state.ts`
  - `apps/api/src/services/idempotency-marker.ts`
  - `apps/api/src/services/session/session-exchange.ts` (ON CONFLICT clause)
  - `apps/api/src/routes/interview.ts`, `apps/api/src/routes/sessions.ts` (header plumbing)
- Roll back code first, schema second. If schema is dropped while code still references the column, every session insert/replay will throw `column "client_id" does not exist`.

Before dropping `support_messages`:

- Verify the spillover write path is offline:
  - `apps/api/src/routes/support.ts` — `POST /support/outbox-spillover`
  - `apps/api/src/services/support/spillover.ts` — `recordOutboxSpillover()`
- The mobile client will continue to attempt spillover POSTs after rollback unless the route is also removed; the requests will 500 but the mobile outbox tolerates that and keeps re-queuing locally.

## Linked tickets

- Finding ID: `[INTERACTION-DUR-L1]`.
- Plan: `docs/superpowers/plans/2026-05-01-interaction-durability-layer-1-outbox-idempotency.md`.
- Spec: `docs/specs/2026-05-01-interaction-durability.md` — Layer 1 scope.
