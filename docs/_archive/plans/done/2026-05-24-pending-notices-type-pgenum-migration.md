# Pending Notices `type` Column — pgEnum Migration Plan

**ID:** CR-2026-05-21-166 / BUG-571
**Status:** Design — not yet executed
**Owner:** TBD
**Target:** Sprint after current bug-fix batch
**Risk:** Medium (data migration + cross-package coordination)

## Problem

`packages/database/src/schema/profiles.ts:165-191` defines `pending_notices.type` as
`text` plus a CHECK constraint:

```ts
type: text('type').notNull(),
// ...
check(
  'pending_notices_type_check',
  sql`${table.type} in ('consent_deleted', 'consent_archived')`,
),
```

Every other categorical column in the schema uses `pgEnum` (see `notificationTypeEnum`,
`celebrationLevelEnum`, `assessmentStatusEnum`, ...). The text+CHECK approach for
`pending_notices.type` is the only outlier and fragments the enum surface — drift-prone,
inconsistent with the rest of the schema, and harder to evolve (adding a value via CHECK
requires `DROP CONSTRAINT … ADD CONSTRAINT`; adding a value to a pgEnum is one line).

## Why this was NOT executed in the same PR

Switching `text → enum` in Postgres is a structural change. The migration steps:

1. `CREATE TYPE pending_notice_type AS ENUM ('consent_deleted', 'consent_archived');`
2. `ALTER TABLE pending_notices ALTER COLUMN type DROP DEFAULT;` (n/a here, no default)
3. `ALTER TABLE pending_notices ALTER COLUMN type TYPE pending_notice_type USING type::pending_notice_type;`
4. `ALTER TABLE pending_notices DROP CONSTRAINT pending_notices_type_check;`

Step 3 fails if **any** row contains a value outside the enum members. Today the CHECK
constraint should guarantee that, but the CHECK was added retroactively — historical
rows written before the CHECK landed may contain typos or removed values. A scan of
existing rows is required before running the migration, and a recovery plan for any
non-conforming row.

Per project rules, this exceeds the scope of a "minimal fix" and is being deferred
to a dedicated PR with its own rollback section.

## Proposed change

```ts
// packages/database/src/schema/profiles.ts

export const pendingNoticeTypeEnum = pgEnum('pending_notice_type', [
  'consent_deleted',
  'consent_archived',
]);

export const pendingNotices = pgTable(
  'pending_notices',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => generateUUIDv7()),
    ownerProfileId: uuid('owner_profile_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    type: pendingNoticeTypeEnum('type').notNull(),
    payloadJson: jsonb('payload_json').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    seenAt: timestamp('seen_at', { withTimezone: true }),
  },
  (table) => [
    index('pending_notices_owner_unseen_idx').on(
      table.ownerProfileId,
      table.seenAt,
    ),
    // CHECK constraint removed — pgEnum supersedes it.
  ],
);
```

## Migration SQL (must be hand-edited after `db:generate:dev` emits the auto file)

```sql
-- 1. Pre-flight: scan existing rows for any non-conforming values.
--    The current CHECK should make this a no-op, but verify before proceeding.
SELECT type, count(*) FROM pending_notices GROUP BY type;
-- Expected: only 'consent_deleted' and 'consent_archived'. Stop the migration
-- if any other value appears and resolve those rows first.

-- 2. Create the enum type.
CREATE TYPE pending_notice_type AS ENUM ('consent_deleted', 'consent_archived');

-- 3. Convert the column. USING clause is mandatory — Postgres will not auto-cast
--    text → enum even when every value is a valid enum member.
ALTER TABLE pending_notices
  ALTER COLUMN type TYPE pending_notice_type
  USING type::pending_notice_type;

-- 4. Drop the now-redundant CHECK constraint.
ALTER TABLE pending_notices DROP CONSTRAINT pending_notices_type_check;
```

## Rollback

Rollback is **possible but lossy of the type-safety guarantee**:

```sql
-- Restore the text column.
ALTER TABLE pending_notices
  ALTER COLUMN type TYPE text USING type::text;

-- Restore the CHECK constraint.
ALTER TABLE pending_notices
  ADD CONSTRAINT pending_notices_type_check
  CHECK (type IN ('consent_deleted', 'consent_archived'));

-- Drop the orphaned enum type.
DROP TYPE pending_notice_type;
```

No data is lost on rollback — the text representation of the enum is the same
string. Any code paths that started typing against the enum's TS type would
need to be reverted alongside the SQL.

## Acceptance criteria

- [ ] `packages/database/src/schema/profiles.ts` uses `pgEnum` for `pending_notices.type`.
- [ ] Migration SQL is hand-reviewed (not just `db:generate:dev` output) to ensure
      the `USING type::pending_notice_type` cast is present in step 3.
- [ ] Pre-flight row scan documented in PR description with the actual production count.
- [ ] All callers of `pendingNotices.type` (see `apps/api/src/services/notices.ts`,
      `apps/api/src/services/dashboard.ts`, `apps/api/src/routes/notices.integration.test.ts`)
      compile cleanly against the new enum type.
- [ ] Integration tests in `apps/api/src/routes/notices.integration.test.ts` pass.
