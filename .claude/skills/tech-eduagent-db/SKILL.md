---
name: tech-eduagent-db
description: >
  Use when writing or reviewing any database access code in this repo — reads,
  writes, multi-table joins, or schema migrations. Triggers on: createScopedRepository,
  profileId in a WHERE clause or update, parent-chain join, drizzle-kit push,
  drizzle-kit migrate, db:push:dev, migration rollback, dropping a column or table,
  "scoped repository", "profile isolation", "ownership check".
license: MIT
user-invocable: false
metadata:
  tags: drizzle, neon, postgres, profileId, scoped-repository, migrations, safety
---

# EduAgent DB — Repo Data-Access Contract

This skill covers the **repo-specific** data-access rules for the MentoMate
monorepo. It does **not** repeat the general Drizzle atomicity or Neon
connection patterns — load those first when they apply:

- **Atomicity, transactions, upserts, locking** → `tech/drizzle-atomicity`
- **Neon setup, connection methods, branching** → `tech/neon-postgres`

What this skill adds: the contract for profile-scoped reads, profileId write
protection, migration rollback discipline, and the dev-vs-prod deploy split.

---

## 1. Reading data — `createScopedRepository` vs parent-chain join

### When to use `createScopedRepository(profileId)`

Use `createScopedRepository(db, profileId)` from `@eduagent/database` for any
query that operates on a **single scoped table** — i.e., a table that carries
`profileId` directly as a column:

```typescript
import { createScopedRepository } from '@eduagent/database';

const repo = createScopedRepository(db, profileId);
const row = await repo.assessments.findFirst(eq(assessments.id, id));
```

The constructor validates that `profileId` is a non-empty string and throws
immediately if it is not (`packages/database/src/repository.ts:72-77`). This
is the fast-fail guard — never skip it by passing an empty or fabricated id.

### When to use the parent-chain join pattern instead

`createScopedRepository` cannot express multi-table joins. For queries that
traverse a parent hierarchy (e.g. `learning_sessions → curriculum_topics →
curriculum_books → subjects`), use `db.select()` directly and enforce
`profileId` via `subjects.profileId` (or the closest ancestor that owns the
data):

```typescript
// Canonical example: apps/api/src/services/session/session-topic.ts:21-51
// Profile ownership enforced through subjects.profileId (parent-chain pattern)
const rows = await db
  .select({ id: learningSessions.id, ... })
  .from(learningSessions)
  .innerJoin(subjects, eq(learningSessions.subjectId, subjects.id))
  .where(
    and(
      eq(learningSessions.topicId, topicId),
      eq(subjects.profileId, profileId),   // ← enforcement point
      inArray(learningSessions.status, ['completed', 'auto_closed']),
    ),
  );
```

Additional parent-chain examples:
- `apps/api/src/services/session/session-book.ts:31-58` — book → subjects join
- `apps/api/src/services/session/session-subject.ts:19-44` — subject sessions with ownership via `subjects.profileId`

**Choice rule:** one table with a `profileId` column → `createScopedRepository`.
Two or more tables joined through a parent → `db.select()` with `profileId`
in `WHERE` via the closest ancestor.

---

## 2. Writing data — profileId write-protection

Every write (`INSERT`, `UPDATE`, `DELETE`) on a scoped table must include
explicit `profileId` protection. The requirement is non-negotiable and
lint-enforced by the G1/G5 rules in `eslint.config.mjs`.

### Update — filter by both record id and profileId

```typescript
// ✅ Correct: ownership verified before the row changes
await db
  .update(learningSessions)
  .set({ topicId, filedAt: now, updatedAt: now })
  .where(
    and(
      eq(learningSessions.id, sessionId),
      eq(learningSessions.profileId, profileId),  // ← must be present
    ),
  );
```

Without `profileId` in the `WHERE`, a caller who supplies an arbitrary
`sessionId` can overwrite another user's data. The `AND profileId = ?` clause
is the hard stop.

Canonical example: `apps/api/src/services/session/session-book.ts:106-122`
(`markSessionFiled` — both `id` and `profileId` in `WHERE`).

### Update through a parent chain — verify ownership first

When the target table does not carry `profileId` directly, verify ownership
through the parent chain in a separate query before updating:

```typescript
// 1. Confirm ownership via the nearest profileId-bearing ancestor
const [owned] = await db
  .select({ id: curriculumBooks.id })
  .from(curriculumBooks)
  .innerJoin(subjects, eq(subjects.id, curriculumBooks.subjectId))
  .where(and(eq(curriculumBooks.id, bookId), eq(subjects.profileId, profileId)))
  .limit(1);
if (!owned) return;   // or throw — caller's choice

// 2. Now safe to write
await db.update(curriculumBooks).set({ ... }).where(eq(curriculumBooks.id, bookId));
```

Canonical example: `apps/api/src/services/session/session-book.ts:36-44`
(ownership check before the session query).

### Insert — always include profileId in the values

```typescript
await db.insert(subjects).values({ profileId, title, ... });
```

There is no implicit profileId injection. A missing value means no row-level
ownership record exists, which breaks every downstream scoped read.

### Review checklist for writes

- [ ] Every `UPDATE` on a scoped table has `eq(table.profileId, profileId)` in `WHERE`.
- [ ] Every `DELETE` on a scoped table has `eq(table.profileId, profileId)` in `WHERE`.
- [ ] Every `INSERT` on a scoped table includes `profileId` in `values`.
- [ ] Writes to child tables (no `profileId` column) verify ownership through
      the parent chain before writing.

---

## 3. Migration discipline

### The dev-vs-prod split

| Command | Allowed environments | What it does |
|---|---|---|
| `pnpm run db:push:dev` | Dev only | Drizzle `push` — applies schema diff directly, no SQL file generated |
| `pnpm run db:generate:dev` | Dev, then commit output | Generates committed migration SQL from schema diff |
| `pnpm run db:migrate:dev` | Dev integration test | Applies committed migration SQL against dev DB |
| `drizzle-kit migrate` (CI/CD) | Staging + production | Applies committed migration SQL — the only safe path for shared DBs |

**Never run `drizzle-kit push` against staging or production.** It overwrites
schema without a traceable migration file and cannot be safely replicated
across team members or rolled back.

### Worker deploy does not migrate Neon

A Cloudflare Worker deploy (via Wrangler or CI) is **code only** — it does not
touch the database. If your code reads a new column, apply the migration SQL to
Neon **before** deploying the Worker that references it. The sequence is:

1. Commit and apply migration SQL (`drizzle-kit migrate` in the target env).
2. Verify column exists.
3. Deploy Worker code that reads the column.

Reversing this order causes a runtime `column does not exist` error in production.

### The `## Rollback` section requirement

Any migration that **drops** a column, table, index, constraint, or enum type
must include a `## Rollback` section in its accompanying plan or PR description.
The section must answer:

- Is rollback possible? (Answer for data-destroying drops: usually no.)
- What data is lost permanently?
- What is the recovery procedure if rollback is needed after partial rollout?

If rollback is impossible, say so explicitly — reviewers must know before
approving. Migrations that add columns or create new tables do not require a
Rollback section (they are non-destructive and trivially reversible by dropping
the new object).

Example outline for a destructive migration:

```markdown
## Rollback

- **Reversible?** No — dropped column `profiles.legacy_persona` cannot be
  restored from this migration alone.
- **Data loss:** All `legacy_persona` values are permanently deleted.
- **Recovery:** Restore from a Neon branch snapshot taken before the migration.
  See runbook: `docs/runbooks/neon-branch-restore.md`.
- **Risk window:** Between migration apply and Worker deploy (~5 minutes in
  blue-green). During that window old Worker code that references the column
  will error — coordinate a maintenance window or deploy atomically.
```

---

## 4. Summary — decision tree

```
Writing a query?
├── Single scoped table (has profileId column)?
│   └── Use createScopedRepository(db, profileId)
└── Multi-table join through a parent hierarchy?
    └── Use db.select() with eq(ancestor.profileId, profileId) in WHERE

Writing data?
├── Table has profileId column → include it in WHERE (updates/deletes) or values (inserts)
└── Table is a child (no profileId) → verify ownership via parent chain first, then write

Changing schema?
├── Dev iteration → pnpm run db:push:dev (never against stg/prod)
├── Ready to commit → pnpm run db:generate:dev → commit SQL → pnpm run db:migrate:dev
├── New column read by Worker → migrate Neon first, deploy Worker second
└── Dropping anything → add ## Rollback section to the plan/PR
```
