# @eduagent/database

Drizzle ORM schema, migrations, and scoped repository for Neon (PostgreSQL) + pgvector.

## Overview

| Attribute | Value |
|-----------|-------|
| ORM | Drizzle ORM |
| Database | Neon (PostgreSQL) with pgvector extension |
| Driver | `@neondatabase/serverless` |
| Auth isolation | Profile-scoped repository pattern + RLS |

## Structure

```
src/
  schema/           Drizzle table definitions (one file per domain)
  client.ts         Neon database client factory
  repository.ts     createScopedRepository — profile-isolated read helper
  account-repository.ts  Account-level (cross-profile) queries
  rls.ts            Row-level security helpers
  queries/          Embeddings and other complex queries
  utils/            UUID helpers
  streaks-rules.ts  Streak calculation logic
```

## Key Patterns

### Reading data

Always use `createScopedRepository(profileId)` for queries on a single scoped table:

```typescript
const repo = createScopedRepository(db, profileId);
const row = await repo.assessments.findFirst(eq(assessments.id, id));
```

For multi-table joins through a parent chain, use `db.select()` directly and enforce `profileId` via the closest ancestor:

```typescript
// Correct: profile enforced via subjects.profileId (parent chain)
await db.select()
  .from(learningSession)
  .innerJoin(curriculumTopics, eq(learningSession.topicId, curriculumTopics.id))
  .innerJoin(subjects, eq(curriculumTopics.subjectId, subjects.id))
  .where(eq(subjects.profileId, profileId));
```

### Writing data

Include explicit `profileId` protection in every write:

```typescript
await db.update(subjects)
  .set({ ... })
  .where(and(eq(subjects.id, id), eq(subjects.profileId, profileId)));
```

## Schema Migration

```bash
# Dev: push schema directly (never use against staging/production)
pnpm run db:push:dev

# Generate migration SQL
pnpm run db:generate:dev

# Apply migration
pnpm run db:migrate:dev

# Open Drizzle Studio
pnpm run db:studio:dev
```

**Never run `drizzle-kit push` against staging or production.** Use committed migration SQL + `drizzle-kit migrate`.

Any migration that drops columns, tables, or types must include a `## Rollback` section specifying reversibility and data loss.

## Testing

Integration tests run against a real Neon database. Never mock the database in integration tests.

```bash
pnpm exec nx run database:test
```
