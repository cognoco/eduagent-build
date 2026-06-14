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
explicit `profileId` protection. The requirement is non-negotiable, but it is
**not** lint-enforced — there is no eslint rule that checks for `profileId` in a
write's `WHERE`/`values`. It is enforced by **code review** (the checklist below)
and by preferring `createScopedRepository` where the table shape allows. (The
G1/G5 rules in `eslint.config.mjs` enforce route/service *boundary* separation —
keeping business logic out of route handlers — **not** write-ownership scoping;
do not rely on them to catch a missing `profileId`.)

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

### Update through a parent chain — enforce ownership atomically

When the target table does not carry `profileId` directly, enforce ownership
through the parent chain **inside the write statement itself**, so the check and
the write cannot be separated by a race.

**⚠️ Do not** verify ownership in one statement and then write by bare id in a
second. That is a TOCTOU (time-of-check-to-time-of-use) gap: between the check
and the write, a concurrent transaction can re-parent the row (e.g. reassign the
book's subject), and the by-id write then lands on a row the caller no longer
owns.

```typescript
// ✅ Ownership enforced inline — the UPDATE touches the row only while its parent
//    subject still belongs to profileId. Check and write are one atomic statement.
import { and, eq, exists, sql } from 'drizzle-orm';

await db
  .update(curriculumBooks)
  .set({ ... })
  .where(
    and(
      eq(curriculumBooks.id, bookId),
      exists(
        db
          .select({ one: sql`1` })
          .from(subjects)
          .where(
            and(
              eq(subjects.id, curriculumBooks.subjectId),
              eq(subjects.profileId, profileId),
            ),
          ),
      ),
    ),
  );
```

If you genuinely need a *separate* check (e.g. to distinguish a 404 from a 403),
wrap the check **and** the write in one transaction and lock the ownership row
(`.for('update')`) so it cannot be re-parented in between — never a bare
check-then-write on the same connection without a lock.

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
- [ ] Writes to child tables (no `profileId` column) enforce ownership through
      the parent chain **inside the write** (or in one locked transaction) — never
      a bare check-then-write by id.

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
└── Table is a child (no profileId) → enforce ownership via parent chain inline in the write (or one locked transaction)

Changing schema?
├── Dev iteration → pnpm run db:push:dev (never against stg/prod)
├── Ready to commit → pnpm run db:generate:dev → commit SQL → pnpm run db:migrate:dev
├── New column read by Worker → migrate Neon first, deploy Worker second
└── Dropping anything → add ## Rollback section to the plan/PR
```
