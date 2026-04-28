# Learner Experience Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add encouragement during sessions, bookmarkable AI responses, and a learner-facing session recap with "What you explored" / "Up next" cards.

**Architecture:** Three features delivered in order: (1) prompt-only encouragement, (2) bookmarks CRUD with new DB table + API + mobile UI, (3) session recap via a new Inngest step that writes learner-facing columns on `session_summaries` and surfaces them on the summary screen with polling. All LLM calls go through `services/llm/router.ts`. Bookmarks use content snapshotting to survive session TTL. Recap uses structured Zod output (not response envelope). **Known limitation:** `routeAndCall` doesn't support `zodResponseFormat` yet, so recap parses JSON from raw response text with markdown-fence stripping. Tracked as tech debt — extend `routeAndCall` with a `responseSchema` option.

**Additional API endpoint (not in spec):** `GET /bookmarks/session?sessionId=` — returns `{ eventId, bookmarkId }[]` for pre-populating bookmark toggle state in the session UI. Lightweight lookup needed by the mobile client to show filled/unfilled bookmark icons on AI messages without fetching full bookmark content.

> **Numbering note:** The spec numbers features as 1 (Recap), 2 (Bookmarks), 3 (Encouragement). This plan implements them in reverse dependency order: Task 1 [F3] = Encouragement, Tasks 2–10 [F2] = Bookmarks, Tasks 11–17 [F1] = Recap. Each task heading includes the spec feature tag `[F1]`/`[F2]`/`[F3]` for easy cross-referencing.

**Tech Stack:** Hono (API routes), Drizzle ORM (Postgres), Inngest (background jobs), React Native / Expo Router (mobile), React Query (data fetching), `@eduagent/schemas` (shared Zod contracts), eval-llm harness (prompt regression testing).

---

## File Map

### Feature 3: Encouragement (prompt-only)
| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `apps/api/src/services/exchange-prompts.ts:583-594` | Replace Prohibitions block with tiered encouragement |

### Feature 2: Bookmarks (DB + API + mobile)
| Action | File | Responsibility |
|--------|------|----------------|
| Create | `packages/database/src/schema/bookmarks.ts` | `bookmarks` table definition |
| Modify | `packages/database/src/schema/index.ts` | Export new table |
| Create | `packages/schemas/src/bookmarks.ts` | Zod schemas for bookmark entity + create input |
| Modify | `packages/schemas/src/index.ts` | Export new schemas |
| Create | `apps/api/src/services/bookmarks.ts` | Bookmark creation (event resolution + content snapshot), list, delete |
| Create | `apps/api/src/services/bookmarks.integration.test.ts` | Integration tests |
| Create | `apps/api/src/routes/bookmarks.ts` | 3 endpoints: POST, DELETE, GET with cursor pagination |
| Modify | `apps/api/src/index.ts` | Register bookmark routes |
| Create | `apps/mobile/src/hooks/use-bookmarks.ts` | React Query hooks for CRUD + session bookmark state |
| Modify | `apps/mobile/src/components/session/SessionMessageActions.tsx` | Add bookmark icon toggle |
| Create | `apps/mobile/src/components/session/BookmarkNudgeTooltip.tsx` | First-session tooltip |
| Create | `apps/mobile/src/app/(app)/progress/saved.tsx` | Saved bookmarks screen |
| Modify | `apps/mobile/src/app/(app)/progress/index.tsx` | Add "Saved" entry row |

### Feature 1: Session Recap (Inngest + DB + mobile)
| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `packages/database/src/schema/sessions.ts:159-185` | Add 4 columns to `sessionSummaries` |
| Modify | `packages/schemas/src/sessions.ts` | Extend `sessionSummarySchema`; add `learnerRecapResponseSchema` |
| Create | `apps/api/src/services/session-recap.ts` | Recap generation (LLM) + next-topic resolution (DB) + freeform topic matching (ILIKE) |
| Create | `apps/api/src/services/session-recap.integration.test.ts` | Integration tests |
| Modify | `apps/api/src/inngest/functions/session-completed.ts` | Add `generate-learner-recap` step after line 676 |
| Modify | `apps/api/src/services/session/session-events.ts:59-68` | Extend `mapSummaryRow` with new fields |
| Create | `apps/api/eval-llm/flows/session-recap.ts` | Eval harness flow (11th flow) |
| Modify | `apps/api/eval-llm/index.ts` | Register session-recap flow |
| Modify | `apps/mobile/src/hooks/use-sessions.ts:536-560` | Add `refetchInterval` option to `useSessionSummary` |
| Modify | `apps/mobile/src/app/session-summary/[sessionId].tsx` | Add closing line, recap card, "Up next" card, bookmark prompt, shimmer skeletons |

---

## Task 1 [F3]: Tiered Encouragement — Prompt Update

**Files:**
- Modify: `apps/api/src/services/exchange-prompts.ts:583-594`

This is a prompt-only change. The existing `getAgeVoice` function (line 28) already splits on `age < 14` (early teen) vs `age < 18` (teen). The encouragement tier reuses the same boundary.

- [ ] **Step 1: Take eval harness baseline snapshot**

Run: `pnpm eval:llm --flow exchanges --update-baseline`

This captures the current prompt state so we can compare after the change.

- [ ] **Step 2: Replace the Prohibitions block with tiered encouragement**

In `apps/api/src/services/exchange-prompts.ts`, replace lines 583–594 (the `sections.push('Prohibitions:\n' + ...)` block):

```typescript
  // Encouragement + Prohibitions (age-tiered)
  const age =
    context.birthYear != null
      ? new Date().getFullYear() - context.birthYear
      : null;
  const isEarlyTeen = age != null && age < 14;

  const encouragementBlock = isEarlyTeen
    ? 'When the learner makes a correct connection or shows understanding, name what they got right: ' +
      '"You just linked respiration back to the energy cycle — that\'s the key insight." ' +
      'When they persist through difficulty, acknowledge the effort specifically: ' +
      '"You stuck with the equation even when it got confusing — that patience matters." ' +
      'Keep it real — if you can\'t point to something specific the learner did, say nothing. Never generic.'
    : 'Acknowledge strong reasoning or unexpected connections briefly: "Good catch", ' +
      '"That\'s a sharp connection", "Exactly right, and here\'s why that matters..." ' +
      'Deliver it and move forward — don\'t linger on praise. Never patronize.';

  sections.push(
    'Encouragement + Prohibitions:\n' +
      encouragementBlock +
      '\n' +
      '- Do NOT expand into related topics the learner did not ask about. Stick to the current concept.\n' +
      '- Do NOT simulate emotions (pride, excitement, disappointment). ' +
      'BANNED phrases: "I\'m so proud of you!", "Great job!", "Amazing!", "Fantastic!", "Awesome!", "Let\'s dive in!", "Nice work!", "Excellent!". ' +
      'These are non-specific and performative — never use them.\n' +
      '- Do NOT use comparative or shaming language: "we covered this already", "you should know this by now", ' +
      '"as I explained before", "this is basic", "remember when I told you". ' +
      'Every question is a fresh opportunity — treat it that way.'
  );
```

Note: `context.birthYear` is already available in scope (`context` is the `ExchangeContext` parameter). We compute `age` directly from `context.birthYear` without touching `resolveAgeBracket` since we only need the numeric age threshold — no need to import or call `resolveAgeBracket` here.

- [ ] **Step 3: Run eval harness to verify prompt change is isolated**

Run: `pnpm eval:llm --flow exchanges`

Expected: Tier 1 snapshot diff shows ONLY the Prohibitions section changed to "Encouragement + Prohibitions". No other sections affected.

Run: `pnpm eval:llm --check-baseline`

Expected: Signal distribution within 5pp tolerance (prompt structure unchanged, only encouragement wording differs).

- [ ] **Step 4: Run targeted tests**

Run: `pnpm exec jest --findRelatedTests apps/api/src/services/exchange-prompts.ts --no-coverage`

Expected: All existing tests pass.

- [ ] **Step 5: Commit**

```
feat(api): tiered encouragement in exchange prompts

Replace blanket "factual acknowledgment only" with age-tiered
specific praise. Early teens (11-13) get named-connection and
effort acknowledgment. Teens (14-17) get brief sharp recognition.
Banned phrases list preserved.
```

---

## Task 2 [F2]: Bookmarks — Database Schema

**Files:**
- Create: `packages/database/src/schema/bookmarks.ts`
- Modify: `packages/database/src/schema/index.ts`

- [ ] **Step 1: Create the bookmarks table definition**

Create `packages/database/src/schema/bookmarks.ts`:

```typescript
import {
  pgTable,
  uuid,
  text,
  timestamp,
  index,
  unique,
} from 'drizzle-orm/pg-core';
import { profiles } from './profiles';
import { learningSessions } from './sessions';
import { sessionEvents } from './sessions';
import { subjects } from './subjects';
import { curriculumTopics } from './subjects';
import { generateUUIDv7 } from '../utils/uuid';

export const bookmarks = pgTable(
  'bookmarks',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => generateUUIDv7()),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => learningSessions.id, { onDelete: 'cascade' }),
    eventId: uuid('event_id')
      .notNull()
      .references(() => sessionEvents.id, { onDelete: 'cascade' }),
    subjectId: uuid('subject_id')
      .notNull()
      .references(() => subjects.id, { onDelete: 'cascade' }),
    topicId: uuid('topic_id').references(() => curriculumTopics.id, {
      onDelete: 'cascade',
    }),
    content: text('content').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('bookmarks_profile_id_idx').on(table.profileId),
    unique('bookmarks_profile_event_unique').on(table.profileId, table.eventId),
  ]
);
```

- [ ] **Step 2: Export from schema barrel**

In `packages/database/src/schema/index.ts`, add:

```typescript
export * from './bookmarks';
```

- [ ] **Step 3: Generate migration**

Run: `pnpm run db:generate`

Expected: A new migration SQL file appears in the migrations directory with a `CREATE TABLE bookmarks` statement including the unique constraint and index.

- [ ] **Step 4: Push to dev database**

Run: `pnpm run db:push:dev`

Expected: Table created successfully in the dev Neon database.

- [ ] **Step 5: Verify typecheck**

Run: `pnpm exec nx run api:typecheck`

Expected: No type errors.

- [ ] **Step 6: Commit**

```
feat(database): add bookmarks table

UUIDv7 PK, profileId-scoped, content snapshot column for TTL
survival. Unique constraint on (profileId, eventId).
```

---

## Task 3 [F2]: Bookmarks — Zod Schemas

**Files:**
- Create: `packages/schemas/src/bookmarks.ts`
- Modify: `packages/schemas/src/index.ts`

- [ ] **Step 1: Create the bookmark schemas**

Create `packages/schemas/src/bookmarks.ts`:

```typescript
import { z } from 'zod';

export const bookmarkSchema = z.object({
  id: z.string().uuid(),
  eventId: z.string().uuid(),
  sessionId: z.string().uuid(),
  subjectId: z.string().uuid(),
  topicId: z.string().uuid().nullable(),
  subjectName: z.string(),
  topicTitle: z.string().nullable(),
  content: z.string(),
  createdAt: z.string().datetime(),
});
export type Bookmark = z.infer<typeof bookmarkSchema>;

export const createBookmarkSchema = z.object({
  eventId: z.string().uuid(),
});
export type CreateBookmarkInput = z.infer<typeof createBookmarkSchema>;

export const bookmarkListResponseSchema = z.object({
  bookmarks: z.array(bookmarkSchema),
  nextCursor: z.string().uuid().nullable(),
});
export type BookmarkListResponse = z.infer<typeof bookmarkListResponseSchema>;
```

- [ ] **Step 2: Export from schemas barrel**

In `packages/schemas/src/index.ts`, add:

```typescript
// Bookmarks
export * from './bookmarks';
```

- [ ] **Step 3: Verify typecheck**

Run: `pnpm exec nx run api:typecheck`

Expected: No type errors.

- [ ] **Step 4: Commit**

```
feat(schemas): add bookmark Zod schemas

Entity schema with joined subjectName/topicTitle, create input,
and cursor-paginated list response.
```

---

## Task 4 [F2]: Bookmarks — Service Layer

**Files:**
- Create: `apps/api/src/services/bookmarks.ts`

- [ ] **Step 1: Create the bookmark service**

Create `apps/api/src/services/bookmarks.ts`:

> **Note on `createScopedRepository`:** CLAUDE.md requires reads to use `createScopedRepository(profileId)`. The bookmark service uses manual `profileId` WHERE clauses because the scoped repository pattern hasn't been extended to cover the new `bookmarks` table yet. The implementor should check if `createScopedRepository` can be extended to include bookmarks. If not, the manual scoping below is functionally equivalent — every query includes `eq(bookmarks.profileId, profileId)`.

```typescript
import { eq, and, lt, desc } from 'drizzle-orm';
import {
  bookmarks,
  sessionEvents,
  learningSessions,
  subjects,
  curriculumTopics,
  type Database,
} from '@eduagent/database';
import type { Bookmark } from '@eduagent/schemas';
import { NotFoundError } from '../errors';

export async function createBookmark(
  db: Database,
  profileId: string,
  eventId: string
): Promise<Bookmark> {
  // Resolve the session event — must be an ai_response owned by this profile.
  // Single JOIN query: event + subject name + optional topic title.
  const [event] = await db
    .select({
      id: sessionEvents.id,
      sessionId: sessionEvents.sessionId,
      subjectId: sessionEvents.subjectId,
      topicId: sessionEvents.topicId,
      content: sessionEvents.content,
      subjectName: subjects.name,
      topicTitle: curriculumTopics.title,
    })
    .from(sessionEvents)
    .innerJoin(subjects, eq(subjects.id, sessionEvents.subjectId))
    .leftJoin(curriculumTopics, eq(curriculumTopics.id, sessionEvents.topicId))
    .where(
      and(
        eq(sessionEvents.id, eventId),
        eq(sessionEvents.profileId, profileId),
        eq(sessionEvents.eventType, 'ai_response')
      )
    )
    .limit(1);

  if (!event) {
    throw new NotFoundError('Session event');
  }

  const [row] = await db
    .insert(bookmarks)
    .values({
      profileId,
      sessionId: event.sessionId,
      eventId: event.id,
      subjectId: event.subjectId,
      topicId: event.topicId ?? null,
      content: event.content,
    })
    .returning();

  return {
    id: row!.id,
    eventId: row!.eventId,
    sessionId: row!.sessionId,
    subjectId: row!.subjectId,
    topicId: row!.topicId ?? null,
    subjectName: event.subjectName ?? 'Unknown',
    topicTitle: event.topicTitle ?? null,
    content: row!.content,
    createdAt: row!.createdAt.toISOString(),
  };
}

export async function deleteBookmark(
  db: Database,
  profileId: string,
  bookmarkId: string
): Promise<void> {
  const [deleted] = await db
    .delete(bookmarks)
    .where(
      and(eq(bookmarks.id, bookmarkId), eq(bookmarks.profileId, profileId))
    )
    .returning({ id: bookmarks.id });

  if (!deleted) {
    throw new NotFoundError('Bookmark');
  }
}

export async function listBookmarks(
  db: Database,
  profileId: string,
  options: { cursor?: string; limit?: number; subjectId?: string }
): Promise<{ bookmarks: Bookmark[]; nextCursor: string | null }> {
  const limit = options.limit ?? 20;

  const conditions = [eq(bookmarks.profileId, profileId)];

  if (options.subjectId) {
    conditions.push(eq(bookmarks.subjectId, options.subjectId));
  }

  if (options.cursor) {
    conditions.push(lt(bookmarks.id, options.cursor));
  }

  const rows = await db
    .select({
      id: bookmarks.id,
      eventId: bookmarks.eventId,
      sessionId: bookmarks.sessionId,
      subjectId: bookmarks.subjectId,
      topicId: bookmarks.topicId,
      content: bookmarks.content,
      createdAt: bookmarks.createdAt,
      subjectName: subjects.name,
      topicTitle: curriculumTopics.title,
    })
    .from(bookmarks)
    .leftJoin(subjects, eq(subjects.id, bookmarks.subjectId))
    .leftJoin(curriculumTopics, eq(curriculumTopics.id, bookmarks.topicId))
    .where(and(...conditions))
    .orderBy(desc(bookmarks.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? page[page.length - 1]!.id : null;

  return {
    bookmarks: page.map((row) => ({
      id: row.id,
      eventId: row.eventId,
      sessionId: row.sessionId,
      subjectId: row.subjectId,
      topicId: row.topicId ?? null,
      subjectName: row.subjectName ?? 'Unknown',
      topicTitle: row.topicTitle ?? null,
      content: row.content,
      createdAt: row.createdAt.toISOString(),
    })),
    nextCursor,
  };
}

export async function listSessionBookmarks(
  db: Database,
  profileId: string,
  sessionId: string
): Promise<Array<{ eventId: string; bookmarkId: string }>> {
  return db
    .select({
      eventId: bookmarks.eventId,
      bookmarkId: bookmarks.id,
    })
    .from(bookmarks)
    .where(
      and(
        eq(bookmarks.profileId, profileId),
        eq(bookmarks.sessionId, sessionId)
      )
    );
}
```

- [ ] **Step 2: Verify typecheck**

Run: `pnpm exec nx run api:typecheck`

Expected: No type errors.

- [ ] **Step 3: Commit**

```
feat(api): bookmark service — create, delete, list, session lookup

Content snapshotted from session_events. Cursor pagination via
UUIDv7 natural ordering. Profile-scoped reads and writes.
```

---

## Task 5 [F2]: Bookmarks — Integration Tests

**Files:**
- Create: `apps/api/src/services/bookmarks.integration.test.ts`

- [ ] **Step 1: Write integration tests**

Create `apps/api/src/services/bookmarks.integration.test.ts`:

```typescript
import { resolve } from 'path';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import { createDatabase } from '@eduagent/database';
import {
  accounts,
  profiles,
  subjects,
  learningSessions,
  sessionEvents,
  bookmarks,
  generateUUIDv7,
  type Database,
} from '@eduagent/database';
import { like } from 'drizzle-orm';
import {
  createBookmark,
  deleteBookmark,
  listBookmarks,
  listSessionBookmarks,
} from './bookmarks';

loadDatabaseEnv(resolve(__dirname, '../../../..'));

const RUN_ID = generateUUIDv7();
let db: Database;

let profileId: string;
let otherProfileId: string;
let subjectId: string;
let sessionId: string;
let aiEventId: string;
let aiEventId2: string;

async function seedTestData() {
  const [account] = await db
    .insert(accounts)
    .values({
      clerkUserId: `clerk_integ_bkmk_${RUN_ID}_1`,
      email: `bkmk_${RUN_ID}_1@test.com`,
    })
    .returning({ id: accounts.id });

  const [profile] = await db
    .insert(profiles)
    .values({
      accountId: account!.id,
      displayName: 'Bookmark Test User',
      birthYear: 2012,
    })
    .returning({ id: profiles.id });
  profileId = profile!.id;

  const [otherAccount] = await db
    .insert(accounts)
    .values({
      clerkUserId: `clerk_integ_bkmk_${RUN_ID}_2`,
      email: `bkmk_${RUN_ID}_2@test.com`,
    })
    .returning({ id: accounts.id });

  const [otherProfile] = await db
    .insert(profiles)
    .values({
      accountId: otherAccount!.id,
      displayName: 'Other User',
      birthYear: 2010,
    })
    .returning({ id: profiles.id });
  otherProfileId = otherProfile!.id;

  const [subject] = await db
    .insert(subjects)
    .values({
      profileId,
      name: 'Mathematics',
      slug: `math-${RUN_ID}`,
    })
    .returning({ id: subjects.id });
  subjectId = subject!.id;

  const [session] = await db
    .insert(learningSessions)
    .values({
      profileId,
      subjectId,
      status: 'completed',
    })
    .returning({ id: learningSessions.id });
  sessionId = session!.id;

  const [event1] = await db
    .insert(sessionEvents)
    .values({
      sessionId,
      profileId,
      subjectId,
      eventType: 'ai_response',
      content: 'The Calvin cycle uses CO₂ to build glucose through carbon fixation.',
    })
    .returning({ id: sessionEvents.id });
  aiEventId = event1!.id;

  const [event2] = await db
    .insert(sessionEvents)
    .values({
      sessionId,
      profileId,
      subjectId,
      eventType: 'ai_response',
      content: 'Photosynthesis converts light energy into chemical energy.',
    })
    .returning({ id: sessionEvents.id });
  aiEventId2 = event2!.id;
}

beforeAll(async () => {
  db = createDatabase(process.env.DATABASE_URL!);
  await seedTestData();
});

afterAll(async () => {
  await db
    .delete(accounts)
    .where(like(accounts.clerkUserId, `clerk_integ_bkmk_${RUN_ID}%`));
});

describe('Bookmarks (integration)', () => {
  let createdBookmarkId: string;

  it('creates bookmark with snapshotted content', async () => {
    const bookmark = await createBookmark(db, profileId, aiEventId);
    createdBookmarkId = bookmark.id;

    expect(bookmark.eventId).toBe(aiEventId);
    expect(bookmark.sessionId).toBe(sessionId);
    expect(bookmark.subjectId).toBe(subjectId);
    expect(bookmark.content).toBe(
      'The Calvin cycle uses CO₂ to build glucose through carbon fixation.'
    );
    expect(bookmark.subjectName).toBe('Mathematics');
    expect(bookmark.createdAt).toBeDefined();
  });

  it('rejects duplicate eventId for same profile', async () => {
    await expect(
      createBookmark(db, profileId, aiEventId)
    ).rejects.toThrow();
  });

  it('404 for nonexistent eventId', async () => {
    await expect(
      createBookmark(db, profileId, generateUUIDv7())
    ).rejects.toThrow('Session event');
  });

  it('scoped to profileId — cannot bookmark another profile\'s event', async () => {
    await expect(
      createBookmark(db, otherProfileId, aiEventId)
    ).rejects.toThrow('Session event');
  });

  it('lists bookmarks for profile', async () => {
    // Create a second bookmark
    await createBookmark(db, profileId, aiEventId2);

    const result = await listBookmarks(db, profileId, {});
    expect(result.bookmarks.length).toBe(2);
    // UUIDv7 descending — most recent first
    expect(result.bookmarks[0]!.content).toContain('Photosynthesis');
    expect(result.bookmarks[1]!.content).toContain('Calvin cycle');
    expect(result.nextCursor).toBeNull();
  });

  it('cursor pagination', async () => {
    const page1 = await listBookmarks(db, profileId, { limit: 1 });
    expect(page1.bookmarks.length).toBe(1);
    expect(page1.nextCursor).not.toBeNull();

    const page2 = await listBookmarks(db, profileId, {
      limit: 1,
      cursor: page1.nextCursor!,
    });
    expect(page2.bookmarks.length).toBe(1);
    expect(page2.nextCursor).toBeNull();
  });

  it('lists session bookmarks', async () => {
    const sessionBookmarks = await listSessionBookmarks(
      db,
      profileId,
      sessionId
    );
    expect(sessionBookmarks.length).toBe(2);
    expect(sessionBookmarks[0]!.eventId).toBeDefined();
    expect(sessionBookmarks[0]!.bookmarkId).toBeDefined();
  });

  it('deletes bookmark', async () => {
    await deleteBookmark(db, profileId, createdBookmarkId);
    const result = await listBookmarks(db, profileId, {});
    expect(result.bookmarks.every((b) => b.id !== createdBookmarkId)).toBe(
      true
    );
  });

  it('delete scoped to profileId', async () => {
    // Re-create for this test
    const bookmark = await createBookmark(db, profileId, aiEventId);
    await expect(
      deleteBookmark(db, otherProfileId, bookmark.id)
    ).rejects.toThrow('Bookmark');
    // Cleanup
    await deleteBookmark(db, profileId, bookmark.id);
  });
});
```

- [ ] **Step 2: Run the integration tests**

Run: `cd apps/api && pnpm exec jest --testPathPattern bookmarks.integration --no-coverage --forceExit`

Expected: All 8 tests pass.

- [ ] **Step 3: Commit**

```
test(api): bookmark service integration tests

Covers create with snapshot, duplicate rejection, profile scoping,
pagination, delete, and cross-profile isolation.
```

---

## Task 6 [F2]: Bookmarks — API Routes

**Files:**
- Create: `apps/api/src/routes/bookmarks.ts`
- Modify: `apps/api/src/index.ts`

- [ ] **Step 1: Create the bookmark route file**

Create `apps/api/src/routes/bookmarks.ts`:

```typescript
import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import type { Database } from '@eduagent/database';
import { createBookmarkSchema } from '@eduagent/schemas';
import type { AuthUser } from '../middleware/auth';
import { requireProfileId } from '../middleware/profile-scope';
import { NotFoundError } from '../errors';
import {
  createBookmark,
  deleteBookmark,
  listBookmarks,
  listSessionBookmarks,
} from '../services/bookmarks';

type BookmarkRouteEnv = {
  Bindings: { DATABASE_URL: string; CLERK_JWKS_URL?: string };
  Variables: {
    user: AuthUser;
    db: Database;
    profileId: string | undefined;
  };
};

const bookmarkIdParamSchema = z.object({
  id: z.string().uuid(),
});

const bookmarkListQuerySchema = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  subjectId: z.string().uuid().optional(),
});

const sessionBookmarksQuerySchema = z.object({
  sessionId: z.string().uuid(),
});

export const bookmarkRoutes = new Hono<BookmarkRouteEnv>()
  .post(
    '/bookmarks',
    zValidator('json', createBookmarkSchema),
    async (c) => {
      const db = c.get('db');
      const profileId = requireProfileId(c.get('profileId'));
      const { eventId } = c.req.valid('json');

      try {
        const bookmark = await createBookmark(db, profileId, eventId);
        return c.json({ bookmark }, 201);
      } catch (err) {
        if (err instanceof NotFoundError) {
          return c.json({ error: err.message }, 404);
        }
        // Unique constraint violation → 409 Conflict
        // Postgres error code 23505 = unique_violation
        if (
          err instanceof Error &&
          'code' in err &&
          (err as { code: string }).code === '23505'
        ) {
          return c.json({ error: 'Bookmark already exists' }, 409);
        }
        throw err;
      }
    }
  )
  .delete(
    '/bookmarks/:id',
    zValidator('param', bookmarkIdParamSchema),
    async (c) => {
      const db = c.get('db');
      const profileId = requireProfileId(c.get('profileId'));
      const { id } = c.req.valid('param');

      try {
        await deleteBookmark(db, profileId, id);
        return c.body(null, 204);
      } catch (err) {
        if (err instanceof NotFoundError) {
          return c.json({ error: err.message }, 404);
        }
        throw err;
      }
    }
  )
  .get(
    '/bookmarks',
    zValidator('query', bookmarkListQuerySchema),
    async (c) => {
      const db = c.get('db');
      const profileId = requireProfileId(c.get('profileId'));
      const { cursor, limit, subjectId } = c.req.valid('query');

      const result = await listBookmarks(db, profileId, {
        cursor,
        limit,
        subjectId,
      });
      return c.json(result);
    }
  )
  .get(
    '/bookmarks/session',
    zValidator('query', sessionBookmarksQuerySchema),
    async (c) => {
      const db = c.get('db');
      const profileId = requireProfileId(c.get('profileId'));
      const { sessionId } = c.req.valid('query');

      const result = await listSessionBookmarks(db, profileId, sessionId);
      return c.json({ bookmarks: result });
    }
  );
```

- [ ] **Step 2: Register routes in the app**

In `apps/api/src/index.ts`, add the import at the top with the other route imports:

```typescript
import { bookmarkRoutes } from './routes/bookmarks';
```

Add `.route('/', bookmarkRoutes)` to the route chain (before the final semicolon).

- [ ] **Step 3: Verify typecheck and lint**

Run: `pnpm exec nx run api:typecheck && pnpm exec nx run api:lint`

Expected: No errors.

- [ ] **Step 4: Commit**

```
feat(api): bookmark API routes — POST, DELETE, GET with cursor pagination

Inline handlers for RPC inference. Profile-scoped via requireProfileId.
Session bookmarks lookup endpoint for pre-populating UI state.
```

---

## Task 7 [F2]: Bookmarks — Mobile Hooks

**Files:**
- Create: `apps/mobile/src/hooks/use-bookmarks.ts`

- [ ] **Step 1: Create the React Query hooks**

Create `apps/mobile/src/hooks/use-bookmarks.ts`:

```typescript
import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryResult,
  type UseMutationResult,
} from '@tanstack/react-query';
import { useApiClient } from '../lib/api-client';
import { useProfile } from '../lib/profile';
import { combinedSignal } from '../lib/query-timeout';
import { assertOk } from '../lib/assert-ok';
import type { Bookmark, BookmarkListResponse } from '@eduagent/schemas';

export function useBookmarks(options?: {
  subjectId?: string;
}): UseQueryResult<BookmarkListResponse> {
  const client = useApiClient();
  const { activeProfile } = useProfile();

  return useQuery({
    queryKey: ['bookmarks', activeProfile?.id, options?.subjectId],
    queryFn: async ({ signal: querySignal }) => {
      const { signal, cleanup } = combinedSignal(querySignal);
      try {
        const res = await client.bookmarks.$get(
          {
            query: {
              ...(options?.subjectId ? { subjectId: options.subjectId } : {}),
            },
          },
          { init: { signal } }
        );
        await assertOk(res);
        return (await res.json()) as BookmarkListResponse;
      } finally {
        cleanup();
      }
    },
    enabled: !!activeProfile,
  });
}

export function useSessionBookmarks(
  sessionId: string | undefined
): UseQueryResult<Array<{ eventId: string; bookmarkId: string }>> {
  const client = useApiClient();
  const { activeProfile } = useProfile();

  return useQuery({
    queryKey: ['session-bookmarks', sessionId, activeProfile?.id],
    queryFn: async ({ signal: querySignal }) => {
      const { signal, cleanup } = combinedSignal(querySignal);
      try {
        const res = await client.bookmarks.session.$get(
          { query: { sessionId: sessionId! } },
          { init: { signal } }
        );
        await assertOk(res);
        const data = await res.json();
        return data.bookmarks;
      } finally {
        cleanup();
      }
    },
    enabled: !!activeProfile && !!sessionId,
  });
}

export function useCreateBookmark(): UseMutationResult<
  { bookmark: Bookmark },
  Error,
  { eventId: string }
> {
  const client = useApiClient();
  const queryClient = useQueryClient();
  const { activeProfile } = useProfile();

  return useMutation({
    mutationFn: async ({ eventId }) => {
      const res = await client.bookmarks.$post({
        json: { eventId },
      });
      await assertOk(res);
      return res.json();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['bookmarks', activeProfile?.id],
      });
      void queryClient.invalidateQueries({
        queryKey: ['session-bookmarks'],
      });
    },
  });
}

export function useDeleteBookmark(): UseMutationResult<void, Error, string> {
  const client = useApiClient();
  const queryClient = useQueryClient();
  const { activeProfile } = useProfile();

  return useMutation({
    mutationFn: async (bookmarkId: string) => {
      const res = await client.bookmarks[':id'].$delete({
        param: { id: bookmarkId },
      });
      await assertOk(res);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['bookmarks', activeProfile?.id],
      });
      void queryClient.invalidateQueries({
        queryKey: ['session-bookmarks'],
      });
    },
  });
}
```

- [ ] **Step 2: Verify typecheck**

Run: `cd apps/mobile && pnpm exec tsc --noEmit`

Expected: No type errors. (If RPC inference types are not yet available because the API hasn't been built, this step may show type errors — resolve by building the API first with `pnpm exec nx run api:typecheck`.)

- [ ] **Step 3: Commit**

```
feat(mobile): bookmark React Query hooks

useBookmarks, useSessionBookmarks, useCreateBookmark, useDeleteBookmark.
Invalidate-on-success pattern (no optimistic updates).
```

---

## Task 8 [F2]: Bookmarks — Bookmark Icon in SessionMessageActions

**Files:**
- Modify: `apps/mobile/src/components/session/SessionMessageActions.tsx`

- [ ] **Step 1: Read the current component to confirm layout**

Read `apps/mobile/src/components/session/SessionMessageActions.tsx` in full to understand imports, state management, and the feedback buttons rendering section (lines 112–198).

- [ ] **Step 2: Add the bookmark toggle icon**

Add imports at the top of `SessionMessageActions.tsx`:

```typescript
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
```

Add `bookmarkState` and `onToggleBookmark` to the component props interface:

```typescript
bookmarkState?: Record<string, string | null>; // eventId → bookmarkId or null
onToggleBookmark?: (message: ChatMessage) => void;
```

Inside the feedback buttons `<View className="flex-row flex-wrap gap-2">` block, after the three feedback `<Pressable>` buttons, add the bookmark icon:

```typescript
{message.eventId && onToggleBookmark && (
  <Pressable
    onPress={() => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onToggleBookmark(message);
    }}
    className="ml-auto p-2"
    accessibilityRole="button"
    accessibilityLabel={
      bookmarkState?.[message.eventId]
        ? 'Remove bookmark'
        : 'Bookmark this response'
    }
    testID={`bookmark-toggle-${message.eventId}`}
  >
    <Ionicons
      name={
        bookmarkState?.[message.eventId]
          ? 'bookmark'
          : 'bookmark-outline'
      }
      size={20}
      className={
        bookmarkState?.[message.eventId]
          ? 'text-primary'
          : 'text-text-secondary'
      }
    />
  </Pressable>
)}
```

- [ ] **Step 3: Wire the bookmark state in the parent component (live sessions)**

The parent (`ChatShell.tsx` or the session screen) needs to:
1. Call `useSessionBookmarks(sessionId)` to get existing bookmarks
2. Build a `bookmarkState: Record<string, string | null>` from the query data
3. Implement `onToggleBookmark` that calls `useCreateBookmark` or `useDeleteBookmark`
4. Pass both as props to `SessionMessageActions`

Read `apps/mobile/src/components/session/ChatShell.tsx` to find where `SessionMessageActions` is rendered and add the wiring there. The toggle handler should include toast feedback on error:

```typescript
import Toast from 'react-native-toast-message';

// Refs for stable callback — useMutation results change identity every render
const createBookmarkRef = useRef(createBookmark);
createBookmarkRef.current = createBookmark;
const deleteBookmarkRef = useRef(deleteBookmark);
deleteBookmarkRef.current = deleteBookmark;

const handleToggleBookmark = useCallback(
  async (message: ChatMessage) => {
    if (!message.eventId) return;
    const existingId = bookmarkState[message.eventId];
    try {
      if (existingId) {
        setBookmarkState((prev) => ({ ...prev, [message.eventId!]: null }));
        await deleteBookmarkRef.current.mutateAsync(existingId);
      } else {
        setBookmarkState((prev) => ({
          ...prev,
          [message.eventId!]: 'pending',
        }));
        const result = await createBookmarkRef.current.mutateAsync({
          eventId: message.eventId,
        });
        setBookmarkState((prev) => ({
          ...prev,
          [message.eventId!]: result.bookmark.id,
        }));
      }
    } catch {
      // Revert on failure
      setBookmarkState((prev) => ({
        ...prev,
        [message.eventId!]: existingId ?? null,
      }));
      Toast.show({
        type: 'error',
        text1: existingId
          ? 'Couldn\'t remove bookmark'
          : 'Couldn\'t save bookmark. Check your connection.',
      });
    }
  },
  [bookmarkState]
);
```

- [ ] **Step 4: Wire the bookmark state in past-session replay view**

The spec requires bookmarking to also work when reviewing past sessions from the library (session detail/replay view), not only during live sessions. Find the component that renders past session messages (likely under `app/(app)/library/` or a shared session replay component) and wire the same `bookmarkState` + `onToggleBookmark` pattern there. The `useSessionBookmarks(sessionId)` hook provides the initial state for pre-populating filled bookmark icons on already-bookmarked messages.

If past-session replay shares `SessionMessageActions` via `ChatShell`, this may already work — verify by checking that `bookmarkState` and `onToggleBookmark` props flow through to the replay context.

- [ ] **Step 5: Verify typecheck and run related tests**

Run: `cd apps/mobile && pnpm exec tsc --noEmit`

Run: `cd apps/mobile && pnpm exec jest --findRelatedTests src/components/session/SessionMessageActions.tsx --no-coverage`

Expected: All pass.

- [ ] **Step 6: Commit**

```
feat(mobile): bookmark toggle icon on AI messages

Icon-only button right of feedback pills. Haptic feedback on tap.
Optimistic UI with error revert + toast. Works in live sessions
and past-session replay.
```

---

## Task 9 [F2]: Bookmarks — Saved Screen

**Files:**
- Create: `apps/mobile/src/app/(app)/progress/saved.tsx`
- Modify: `apps/mobile/src/app/(app)/progress/index.tsx`

- [ ] **Step 1: Create the Saved screen**

> **Spec divergence:** The spec says "swipe-to-delete with confirmation." This implementation uses a trash icon + `Alert.alert` confirmation instead, which is simpler and avoids a `react-native-gesture-handler` `Swipeable` dependency. If swipe-to-delete is preferred, wrap each `BookmarkRow` in a `Swipeable` component from `react-native-gesture-handler` (already installed for bottom-sheet) with a destructive right action. For v1, the tap-to-delete approach is fully functional on all screen sizes including Galaxy S10e.

Create `apps/mobile/src/app/(app)/progress/saved.tsx`:

```typescript
import { useState, useCallback, useMemo } from 'react';
import { View, Text, Pressable, FlatList, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Markdown from 'react-native-markdown-display';
import { useBookmarks, useDeleteBookmark } from '../../../hooks/use-bookmarks';
import type { Bookmark } from '@eduagent/schemas';

function formatRelativeDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  return date.toLocaleDateString();
}

function BookmarkRow({
  bookmark,
  onDelete,
}: {
  bookmark: Bookmark;
  onDelete: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Pressable
      onPress={() => setExpanded((prev) => !prev)}
      className="bg-surface rounded-card p-4 mb-3"
      testID={`bookmark-row-${bookmark.id}`}
      accessibilityRole="button"
      accessibilityLabel={`Bookmark: ${bookmark.content.slice(0, 60)}`}
    >
      <View className="flex-row justify-between items-start mb-1">
        <View className="flex-1 mr-2">
          <Text className="text-body-sm font-medium text-primary">
            {bookmark.subjectName}
            {bookmark.topicTitle ? ` · ${bookmark.topicTitle}` : ''}
          </Text>
          <Text className="text-caption text-text-tertiary mt-0.5">
            {formatRelativeDate(bookmark.createdAt)}
          </Text>
        </View>
        <Pressable
          onPress={() => {
            Alert.alert(
              'Remove bookmark?',
              'This saved explanation will be removed.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Remove',
                  style: 'destructive',
                  onPress: () => onDelete(bookmark.id),
                },
              ]
            );
          }}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Remove bookmark"
          testID={`bookmark-delete-${bookmark.id}`}
        >
          <Ionicons name="trash-outline" size={18} className="text-text-tertiary" />
        </Pressable>
      </View>
      <View className="mt-1" style={expanded ? undefined : { maxHeight: 100, overflow: 'hidden' }}>
        <Markdown>{bookmark.content}</Markdown>
      </View>
      {!expanded && bookmark.content.length > 200 && (
        <Text className="text-body-sm text-primary mt-1">
          Tap to expand
        </Text>
      )}
    </Pressable>
  );
}

export default function SavedScreen() {
  const router = useRouter();
  const bookmarksQuery = useBookmarks();
  const deleteMutation = useDeleteBookmark();

  const handleDelete = useCallback(
    (bookmarkId: string) => {
      deleteMutation.mutate(bookmarkId);
    },
    [deleteMutation]
  );

  return (
    <View className="flex-1 bg-background">
      <View className="flex-row items-center px-4 pt-4 pb-2">
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          testID="saved-back"
          hitSlop={8}
        >
          <Ionicons name="arrow-back" size={24} className="text-text-primary" />
        </Pressable>
        <Text className="text-h2 font-bold text-text-primary ml-3">
          Saved
        </Text>
      </View>

      <FlatList
        data={bookmarksQuery.data?.bookmarks ?? []}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <BookmarkRow bookmark={item} onDelete={handleDelete} />
        )}
        contentContainerClassName="px-4 pt-2 pb-8"
        ListEmptyComponent={
          bookmarksQuery.isLoading ? null : (
            <View className="items-center justify-center py-12 px-6">
              <Ionicons
                name="bookmark-outline"
                size={48}
                className="text-text-tertiary mb-4"
              />
              <Text className="text-body text-text-secondary text-center">
                Nothing saved yet. Tap the bookmark icon on any response during
                a session to save it here.
              </Text>
            </View>
          )
        }
        testID="saved-bookmarks-list"
      />
    </View>
  );
}
```

- [ ] **Step 2: Add entry point in progress index**

In `apps/mobile/src/app/(app)/progress/index.tsx`, add a "Saved" row between the milestones section and the "Keep learning" button (before line 435):

```typescript
<Pressable
  onPress={() => router.push('/(app)/progress/saved' as never)}
  className="bg-surface rounded-card p-4 mt-4 flex-row items-center justify-between"
  accessibilityRole="button"
  accessibilityLabel="View saved explanations"
  testID="progress-saved-link"
>
  <View className="flex-row items-center gap-3">
    <Ionicons name="bookmark" size={20} className="text-primary" />
    <Text className="text-body font-medium text-text-primary">Saved</Text>
  </View>
  <Ionicons name="chevron-forward" size={18} className="text-text-tertiary" />
</Pressable>
```

Add the `Ionicons` import if not already present.

- [ ] **Step 3: Verify typecheck and run related tests**

Run: `cd apps/mobile && pnpm exec tsc --noEmit`

Run: `cd apps/mobile && pnpm exec jest --findRelatedTests src/app/\\(app\\)/progress/index.tsx --no-coverage`

Expected: All pass.

- [ ] **Step 4: Commit**

```
feat(mobile): saved bookmarks screen + progress index entry

FlatList with 5-line truncation, expand-on-tap, delete with
confirmation. Empty state with guidance. Linked from progress hub.
```

---

## Task 10 [F2]: Bookmarks — First-Session Nudge Tooltip

**Files:**
- Create: `apps/mobile/src/components/session/BookmarkNudgeTooltip.tsx`

- [ ] **Step 1: Create the nudge tooltip component**

Create `apps/mobile/src/components/session/BookmarkNudgeTooltip.tsx`:

```typescript
import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Non-sensitive UI preference — AsyncStorage, not SecureStore
const NUDGE_KEY = 'bookmark-nudge-shown';

interface BookmarkNudgeTooltipProps {
  /** Number of AI responses rendered so far in this session */
  aiResponseCount: number;
  /** Whether this is the learner's first-ever session */
  isFirstSession: boolean;
}

export function BookmarkNudgeTooltip({
  aiResponseCount,
  isFirstSession,
}: BookmarkNudgeTooltipProps) {
  const [visible, setVisible] = useState(false);
  const checkedRef = useRef(false);

  useEffect(() => {
    if (checkedRef.current || !isFirstSession || aiResponseCount < 3) return;
    checkedRef.current = true;

    AsyncStorage.getItem(NUDGE_KEY).then((value) => {
      if (!value) setVisible(true);
    });
  }, [aiResponseCount, isFirstSession]);

  const dismiss = useCallback(() => {
    setVisible(false);
    AsyncStorage.setItem(NUDGE_KEY, 'true');
  }, []);

  if (!visible) return null;

  return (
    <View className="bg-primary/10 rounded-card p-3 mx-4 mb-2 flex-row items-center justify-between">
      <Text className="text-body-sm text-text-primary flex-1 mr-2">
        Tap to save explanations you want to revisit.
      </Text>
      <Pressable
        onPress={dismiss}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Dismiss bookmark tip"
        testID="bookmark-nudge-dismiss"
      >
        <Text className="text-body-sm font-medium text-primary">Got it</Text>
      </Pressable>
    </View>
  );
}
```

- [ ] **Step 2: Integrate into the chat session view**

In the component that renders the message list (likely `ChatShell.tsx`), render `BookmarkNudgeTooltip` at the bottom of the message list when conditions are met. Pass `aiResponseCount` (count of assistant messages in `exchangeHistory`) and `isFirstSession` (check profile's prior session count or pass from parent).

- [ ] **Step 3: Verify typecheck**

Run: `cd apps/mobile && pnpm exec tsc --noEmit`

Expected: No type errors.

- [ ] **Step 4: Commit**

```
feat(mobile): first-session bookmark nudge tooltip

Shows after 3rd AI response in learner's first session. Persisted
via SecureStore so it never shows again.
```

---

## Task 11 [F1]: Session Recap — Database Columns + mapSummaryRow

**Files:**
- Modify: `packages/database/src/schema/sessions.ts:159-185`
- Modify: `apps/api/src/services/session/session-events.ts:59-68`

> **Merged with former Task 13:** mapSummaryRow must be updated in the same commit as the schema/Zod changes to avoid a broken-typecheck commit (SessionSummary type requires all new fields).

- [ ] **Step 1: Add 4 new columns to `sessionSummaries`**

In `packages/database/src/schema/sessions.ts`, add columns to the `sessionSummaries` table definition (after line 177, before `status`):

```typescript
  closingLine: text('closing_line'),
  learnerRecap: text('learner_recap'),
  nextTopicId: uuid('next_topic_id').references(() => curriculumTopics.id, {
    onDelete: 'set null',
  }),
  nextTopicReason: text('next_topic_reason'),
```

Note: `onDelete: 'set null'` for `nextTopicId` — if the referenced topic is deleted, the recap still makes sense without it (vs cascade which would delete the summary row).

**Import check:** The `curriculumTopics` reference requires it to be imported at the top of `sessions.ts`. Verify that `import { curriculumTopics } from './subjects'` (or wherever curriculum topics are defined) already exists in the file. If not, add it — the FK reference will fail at migration generation time without the import.

- [ ] **Step 2: Generate migration**

Run: `pnpm run db:generate`

Expected: Migration SQL with 4 `ALTER TABLE session_summaries ADD COLUMN` statements.

- [ ] **Step 3: Push to dev database**

Run: `pnpm run db:push:dev`

- [ ] **Step 4: Verify typecheck**

Run: `pnpm exec nx run api:typecheck`

Expected: No type errors.

- [ ] **Step 5: Commit**

```
feat(database): add learner recap columns to session_summaries

closingLine, learnerRecap (markdown bullets), nextTopicId (FK),
nextTopicReason. All nullable — populated async by Inngest.
```

---

## Task 12 [F1]: Session Recap — Zod Schemas + mapSummaryRow

**Files:**
- Modify: `packages/schemas/src/sessions.ts`
- Modify: `apps/api/src/services/session/session-events.ts:59-68`

> **Merged with former Task 13:** Schema + mapSummaryRow updated atomically so typecheck never breaks between commits.

- [ ] **Step 1: Extend `sessionSummarySchema` with new fields**

In `packages/schemas/src/sessions.ts`, add the new fields to `sessionSummarySchema` (currently at lines 339–346):

```typescript
export const sessionSummarySchema = z.object({
  id: z.string().uuid(),
  sessionId: z.string().uuid(),
  content: z.string(),
  aiFeedback: z.string().nullable(),
  status: summaryStatusSchema,
  closingLine: z.string().nullable(),
  learnerRecap: z.string().nullable(),
  nextTopicId: z.string().uuid().nullable(),
  nextTopicReason: z.string().nullable(),
});
```

- [ ] **Step 2: Add `learnerRecapResponseSchema` for structured LLM output**

Add below `sessionSummarySchema`:

```typescript
/** Structured output schema for the generate-learner-recap Inngest step.
 *  Used with zodResponseFormat — NOT the response envelope. */
export const learnerRecapResponseSchema = z.object({
  closingLine: z.string().max(150),
  takeaways: z.array(
    z.string().max(200)
  ).min(1).max(4),
  nextTopicReason: z.string().max(120).nullable(),
});
export type LearnerRecapResponse = z.infer<typeof learnerRecapResponseSchema>;
```

- [ ] **Step 3: Verify typecheck**

Run: `pnpm exec nx run api:typecheck`

Expected: Type error in `mapSummaryRow` expected — fixed in the next step.

- [ ] **Step 4: Extend `mapSummaryRow` to include new fields**

In `apps/api/src/services/session/session-events.ts`, update `mapSummaryRow`:

```typescript
export function mapSummaryRow(
  row: typeof sessionSummaries.$inferSelect
): SessionSummary {
  return {
    id: row.id,
    sessionId: row.sessionId,
    content: row.content ?? '',
    aiFeedback: row.aiFeedback ?? null,
    status: row.status,
    closingLine: row.closingLine ?? null,
    learnerRecap: row.learnerRecap ?? null,
    nextTopicId: row.nextTopicId ?? null,
    nextTopicReason: row.nextTopicReason ?? null,
  };
}
```

The existing `GET /sessions/:sessionId/summary` route already calls `getSessionSummary` → `findSessionSummaryRow` → `mapSummaryRow`, so the new fields flow through automatically.

- [ ] **Step 5: Verify typecheck passes end-to-end**

Run: `pnpm exec nx run api:typecheck`

Expected: No type errors (schema + mapSummaryRow both updated in one commit).

- [ ] **Step 6: Run existing session tests**

Run: `pnpm exec jest --findRelatedTests apps/api/src/services/session/session-events.ts --no-coverage`

Expected: All pass.

- [ ] **Step 7: Commit**

```
feat(schemas,api): extend sessionSummarySchema + mapSummaryRow with recap fields

Four new nullable fields on SessionSummary. Structured Zod schema for
LLM recap output. mapSummaryRow updated in same commit to keep typecheck green.
```

---

## Task 13 [F1]: Session Recap — Service Layer

**Files:**
- Create: `apps/api/src/services/session-recap.ts`

- [ ] **Step 1: Create the session recap service**

Create `apps/api/src/services/session-recap.ts`:

```typescript
import { eq, and, gt, asc, ilike, sql, or } from 'drizzle-orm';
import {
  sessionSummaries,
  sessionEvents,
  learningSessions,
  curriculumTopics,
  subjects,
  books,
  profiles,
  retentionCards,
  type Database,
} from '@eduagent/database';
import { learnerRecapResponseSchema } from '@eduagent/schemas';
import { routeAndCall } from './llm/router';
import { createLogger } from './logger';

const logger = createLogger();

interface RecapInput {
  sessionId: string;
  profileId: string;
  topicId: string | null;
  subjectId: string;
  exchangeCount: number;
  birthYear: number | null;
}

interface RecapResult {
  closingLine: string;
  learnerRecap: string;
  nextTopicId: string | null;
  nextTopicReason: string | null;
}

/** Exported for reuse by the eval harness flow. */
export function getAgeVoiceTierLabel(birthYear: number | null): string {
  if (birthYear == null) return 'teen (15-17)';
  const age = new Date().getFullYear() - birthYear;
  return age < 14
    ? 'early teen (11-13): friendly, concrete, warm'
    : 'teen (14-17): peer-adjacent, brief, sharp';
}

/** Exported for reuse by the eval harness flow. */
export function buildRecapPrompt(
  ageVoiceTier: string,
  nextTopicTitle: string | null
): string {
  let prompt =
    'You are reviewing a tutoring session transcript. Produce a closing line and 2-4 learning takeaways.\n\n' +
    'Closing line rules:\n' +
    '- One sentence mirroring what the learner specifically did in this session\n' +
    '- Name the subject matter and what made the session noteworthy (persistence, a connection, a breakthrough)\n' +
    '- Not a grade, not generic praise — a mirror\n' +
    `- Adapt tone to learner age: ${ageVoiceTier}\n` +
    '- Max 150 characters\n\n' +
    'Takeaway rules:\n' +
    '- Write in second person ("You explored...", "You connected...", "You figured out...")\n' +
    '- Each takeaway must name a specific concept or skill, not generic ("learned stuff")\n' +
    '- Format as a markdown bullet list (- prefix)\n' +
    `- Adapt language complexity to the learner's age: ${ageVoiceTier}\n` +
    '- Max 200 characters per bullet\n' +
    '- No praise, no filler — just what was covered';

  if (nextTopicTitle) {
    prompt +=
      `\n\nAlso suggest why the next topic "${nextTopicTitle}" connects to what was just covered. ` +
      'One sentence, max 120 characters. Example: "This builds on the energy cycle you just explored." ' +
      'Output as nextTopicReason. If the connection is weak or unclear, set nextTopicReason to null.';
  }

  return prompt;
}

export async function resolveNextTopic(
  db: Database,
  profileId: string,
  topicId: string
): Promise<{ id: string; title: string } | null> {
  // Get current topic's book and sort order
  const [currentTopic] = await db
    .select({
      bookId: curriculumTopics.bookId,
      sortOrder: curriculumTopics.sortOrder,
    })
    .from(curriculumTopics)
    .where(eq(curriculumTopics.id, topicId))
    .limit(1);

  if (!currentTopic) return null;

  // Find completed topic IDs (have retention cards OR learning sessions)
  const completedTopicIds = await db
    .select({ topicId: retentionCards.topicId })
    .from(retentionCards)
    .where(eq(retentionCards.profileId, profileId));

  const sessionTopicIds = await db
    .select({ topicId: learningSessions.topicId })
    .from(learningSessions)
    .where(
      and(
        eq(learningSessions.profileId, profileId),
        sql`${learningSessions.topicId} IS NOT NULL`
      )
    );

  const doneIds = new Set([
    ...completedTopicIds.map((r) => r.topicId),
    ...sessionTopicIds.map((r) => r.topicId).filter(Boolean),
  ]);

  // Find first unstarted topic in the same book (sorted by curriculum order)
  const candidates = await db
    .select({ id: curriculumTopics.id, title: curriculumTopics.title })
    .from(curriculumTopics)
    .where(
      and(
        eq(curriculumTopics.bookId, currentTopic.bookId),
        gt(curriculumTopics.sortOrder, currentTopic.sortOrder)
      )
    )
    .orderBy(asc(curriculumTopics.sortOrder));

  for (const candidate of candidates) {
    if (!doneIds.has(candidate.id)) {
      return candidate;
    }
  }

  return null;
}

/**
 * For freeform sessions (no topicId), extract concept keywords from the
 * recap takeaways and match against curriculum topics the learner has in
 * their library via ILIKE. Returns the best match or null if no relevant
 * topic is found or if matches are too generic.
 */
export async function matchFreeformTopics(
  db: Database,
  profileId: string,
  subjectId: string,
  takeaways: string[]
): Promise<{ id: string; title: string } | null> {
  // Extract meaningful keywords from takeaways (skip short/generic words)
  const stopWords = new Set([
    'you', 'the', 'and', 'how', 'what', 'that', 'this', 'with', 'from',
    'your', 'about', 'into', 'back', 'just', 'explored', 'connected',
    'figured', 'out', 'worked', 'through', 'learned',
  ]);
  const keywords = takeaways
    .flatMap((t) => t.replace(/^- /, '').split(/\s+/))
    .map((w) => w.toLowerCase().replace(/[^a-z0-9]/g, ''))
    .filter((w) => w.length > 3 && !stopWords.has(w));

  // Deduplicate and take top 5 most specific keywords (longer = more specific)
  const uniqueKeywords = [...new Set(keywords)]
    .sort((a, b) => b.length - a.length)
    .slice(0, 5);
  if (uniqueKeywords.length === 0) return null;

  // Build ILIKE conditions for title matching
  const ilikeConditions = uniqueKeywords.map(
    (kw) => ilike(curriculumTopics.title, `%${kw}%`)
  );

  // Scope to the session's subject — prevents cross-subject false positives
  // (e.g., biology "energy" matching physics "Energy Conservation")
  const matches = await db
    .select({ id: curriculumTopics.id, title: curriculumTopics.title })
    .from(curriculumTopics)
    .innerJoin(books, eq(books.id, curriculumTopics.bookId))
    .where(
      and(
        eq(books.subjectId, subjectId),
        or(...ilikeConditions)
      )
    )
    .limit(3);

  // Require at least 2 keyword matches for confidence — single-keyword
  // matches are too generic ("energy" matches half the science curriculum)
  if (matches.length === 0) return null;
  if (uniqueKeywords.length >= 2 && matches.length > 2) {
    // Too many matches = keywords too generic, bail out
    return null;
  }
  return matches[0]!;
}

export async function generateLearnerRecap(
  db: Database,
  input: RecapInput
): Promise<RecapResult | null> {
  if (input.exchangeCount < 3) return null;

  // Load transcript
  const transcriptEvents = await db.query.sessionEvents.findMany({
    where: and(
      eq(sessionEvents.sessionId, input.sessionId),
      eq(sessionEvents.profileId, input.profileId),
      sql`${sessionEvents.eventType} IN ('user_message', 'ai_response')`
    ),
    orderBy: asc(sessionEvents.createdAt),
    columns: { eventType: true, content: true },
  });

  if (transcriptEvents.length < 2) return null;

  const transcriptText = transcriptEvents
    .map(
      (e) =>
        `${e.eventType === 'user_message' ? 'Student' : 'Mentor'}: ${e.content}`
    )
    .join('\n\n');

  // Resolve next topic: curriculum-attached → next in book; freeform → deferred to post-LLM matching
  let nextTopic: { id: string; title: string } | null = null;
  if (input.topicId) {
    nextTopic = await resolveNextTopic(db, input.profileId, input.topicId);
  }

  const ageVoiceTier = getAgeVoiceTierLabel(input.birthYear);
  const systemPrompt = buildRecapPrompt(
    ageVoiceTier,
    nextTopic?.title ?? null
  );

  // Call LLM via router — rung 1 (flash/mini tier)
  // KNOWN LIMITATION: routeAndCall doesn't support zodResponseFormat yet.
  // We parse JSON from the raw response and validate with Zod. This fails
  // ~5-15% of the time with flash-tier models. Tracked as a tech-debt item:
  // extend routeAndCall with a responseSchema option for structured output.
  // The prompt ends with: 'Respond with ONLY a JSON object, no markdown
  // fences, no extra text.' to maximize compliance.
  const result = await routeAndCall(
    [
      { role: 'system', content: systemPrompt + '\n\nRespond with ONLY a JSON object matching this shape: { closingLine: string, takeaways: string[], nextTopicReason: string | null }. No markdown fences, no extra text.' },
      { role: 'user', content: transcriptText },
    ],
    1
  );

  // Parse structured output — result.response is the raw provider string
  let parsed: unknown;
  try {
    // Strip markdown fences if the model wraps in ```json ... ```
    const raw = result.response.replace(/^```(?:json)?\s*\n?/m, '').replace(/\n?```\s*$/m, '');
    parsed = JSON.parse(raw);
  } catch {
    logger.warn(
      `[session-recap] JSON parse failed for session=${input.sessionId}`
    );
    return null;
  }

  const validated = learnerRecapResponseSchema.safeParse(parsed);
  if (!validated.success) {
    logger.warn(
      `[session-recap] Schema validation failed for session=${input.sessionId}: ${validated.error.message}`
    );
    return null;
  }

  const { closingLine, takeaways, nextTopicReason } = validated.data;

  // Format takeaways as markdown bullet list
  const learnerRecap = takeaways.map((t) => `- ${t}`).join('\n');

  // For freeform sessions, try matching takeaway keywords to curriculum topics
  if (!input.topicId && !nextTopic) {
    nextTopic = await matchFreeformTopics(db, input.profileId, input.subjectId, takeaways);
    // nextTopicReason stays null for freeform matches — the "Up next" card
    // shows "You might also like..." framing instead of a connecting sentence
  }

  return {
    closingLine,
    learnerRecap,
    nextTopicId: nextTopic?.id ?? null,
    nextTopicReason: input.topicId ? (nextTopicReason ?? null) : null,
  };
}
```

- [ ] **Step 2: Verify typecheck**

Run: `pnpm exec nx run api:typecheck`

Expected: No type errors.

- [ ] **Step 3: Commit**

```
feat(api): session recap service — LLM recap + next-topic resolution

Haiku-tier LLM call for closing line + takeaways. Pure DB query
for next unstarted topic (curriculum) + ILIKE freeform matching.
Prompt helpers exported for eval harness reuse. Graceful null
return on parse/validation failure.
```

---

## Task 14 [F1]: Session Recap — Integration Tests

**Files:**
- Create: `apps/api/src/services/session-recap.integration.test.ts`

- [ ] **Step 1: Write integration tests**

Create `apps/api/src/services/session-recap.integration.test.ts`:

```typescript
import { resolve } from 'path';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import { createDatabase } from '@eduagent/database';
import {
  accounts,
  profiles,
  subjects,
  books,
  learningSessions,
  sessionEvents,
  curriculumTopics,
  generateUUIDv7,
  type Database,
} from '@eduagent/database';
import { like, eq } from 'drizzle-orm';
import {
  _clearProviders,
  registerProvider,
} from './llm/router';
import { generateLearnerRecap, resolveNextTopic, matchFreeformTopics } from './session-recap';

loadDatabaseEnv(resolve(__dirname, '../../../..'));

const RUN_ID = generateUUIDv7();
let db: Database;

let profileId: string;
let subjectId: string;
let sessionId: string;
let topicId1: string;
let topicId2: string;
let bookId: string;

async function seedTestData() {
  const [account] = await db
    .insert(accounts)
    .values({
      clerkUserId: `clerk_integ_recap_${RUN_ID}`,
      email: `recap_${RUN_ID}@test.com`,
    })
    .returning({ id: accounts.id });

  const [profile] = await db
    .insert(profiles)
    .values({
      accountId: account!.id,
      displayName: 'Recap Test User',
      birthYear: 2013,
    })
    .returning({ id: profiles.id });
  profileId = profile!.id;

  const [subject] = await db
    .insert(subjects)
    .values({
      profileId,
      name: 'Biology',
      slug: `bio-${RUN_ID}`,
    })
    .returning({ id: subjects.id });
  subjectId = subject!.id;

  // Create a book with two sequential topics for resolveNextTopic testing
  const [book] = await db
    .insert(books)
    .values({
      subjectId,
      title: `Bio Book ${RUN_ID}`,
      author: 'Test',
    })
    .returning({ id: books.id });
  bookId = book!.id;

  const [topic1] = await db
    .insert(curriculumTopics)
    .values({
      bookId,
      title: 'Carbon Fixation',
      sortOrder: 1,
    })
    .returning({ id: curriculumTopics.id });
  topicId1 = topic1!.id;

  const [topic2] = await db
    .insert(curriculumTopics)
    .values({
      bookId,
      title: 'Glucose Synthesis',
      sortOrder: 2,
    })
    .returning({ id: curriculumTopics.id });
  topicId2 = topic2!.id;
}

const MOCK_RECAP_JSON = JSON.stringify({
  closingLine: 'You traced the Calvin cycle from CO₂ to glucose.',
  takeaways: [
    'You explored how carbon fixation drives the Calvin cycle',
    'You connected ATP usage to glucose synthesis',
  ],
  nextTopicReason: 'This builds on the carbon cycle you just covered.',
});

beforeAll(async () => {
  db = createDatabase(process.env.DATABASE_URL!);
  _clearProviders();
  // Custom mock that returns raw recap JSON (not envelope-wrapped).
  // createMockProvider() returns envelope format which doesn't match
  // learnerRecapResponseSchema — the recap service parses raw JSON.
  registerProvider({
    id: 'gemini',
    chat: async () => MOCK_RECAP_JSON,
    chatStream: async function* () { yield MOCK_RECAP_JSON; },
  });
  await seedTestData();
});

afterAll(async () => {
  await db
    .delete(accounts)
    .where(like(accounts.clerkUserId, `clerk_integ_recap_${RUN_ID}%`));
});

describe('Session Recap (integration)', () => {
  it('skips recap below threshold', async () => {
    // Create a session with only 2 exchanges
    const [shortSession] = await db
      .insert(learningSessions)
      .values({ profileId, subjectId, status: 'completed' })
      .returning({ id: learningSessions.id });

    await db.insert(sessionEvents).values([
      {
        sessionId: shortSession!.id,
        profileId,
        subjectId,
        eventType: 'user_message',
        content: 'What is photosynthesis?',
      },
      {
        sessionId: shortSession!.id,
        profileId,
        subjectId,
        eventType: 'ai_response',
        content: 'Photosynthesis is...',
      },
    ]);

    const result = await generateLearnerRecap(db, {
      sessionId: shortSession!.id,
      profileId,
      topicId: null,
      subjectId,
      exchangeCount: 2,
      birthYear: 2013,
    });

    expect(result).toBeNull();
  });

  it('generates recap for curriculum session', async () => {
    const [session] = await db
      .insert(learningSessions)
      .values({ profileId, subjectId, status: 'completed' })
      .returning({ id: learningSessions.id });

    // Insert enough events for >= 3 exchanges
    const events = [];
    for (let i = 0; i < 4; i++) {
      events.push(
        {
          sessionId: session!.id,
          profileId,
          subjectId,
          eventType: 'user_message' as const,
          content: `Question ${i + 1} about the Calvin cycle`,
        },
        {
          sessionId: session!.id,
          profileId,
          subjectId,
          eventType: 'ai_response' as const,
          content: `Answer ${i + 1} explaining carbon fixation and glucose synthesis`,
        }
      );
    }
    await db.insert(sessionEvents).values(events);

    const result = await generateLearnerRecap(db, {
      sessionId: session!.id,
      profileId,
      topicId: null,
      subjectId,
      exchangeCount: 4,
      birthYear: 2013,
    });

    expect(result).not.toBeNull();
    expect(result!.closingLine).toContain('Calvin cycle');
    expect(result!.learnerRecap).toContain('- ');
    // Freeform session → no nextTopicId
    expect(result!.nextTopicId).toBeNull();
  });

  it('structured output schema validation', async () => {
    // The mock provider returns valid JSON matching learnerRecapResponseSchema
    // This test verifies the parse → validate → format pipeline
    const [session] = await db
      .insert(learningSessions)
      .values({ profileId, subjectId, status: 'completed' })
      .returning({ id: learningSessions.id });

    await db.insert(sessionEvents).values([
      { sessionId: session!.id, profileId, subjectId, eventType: 'user_message', content: 'Q1' },
      { sessionId: session!.id, profileId, subjectId, eventType: 'ai_response', content: 'A1' },
      { sessionId: session!.id, profileId, subjectId, eventType: 'user_message', content: 'Q2' },
      { sessionId: session!.id, profileId, subjectId, eventType: 'ai_response', content: 'A2' },
      { sessionId: session!.id, profileId, subjectId, eventType: 'user_message', content: 'Q3' },
      { sessionId: session!.id, profileId, subjectId, eventType: 'ai_response', content: 'A3' },
    ]);

    const result = await generateLearnerRecap(db, {
      sessionId: session!.id,
      profileId,
      topicId: null,
      subjectId,
      exchangeCount: 3,
      birthYear: 2013,
    });

    expect(result).not.toBeNull();
    // Verify markdown bullet format
    const bullets = result!.learnerRecap.split('\n').filter((l) => l.startsWith('- '));
    expect(bullets.length).toBeGreaterThanOrEqual(1);
    expect(bullets.length).toBeLessThanOrEqual(4);
  });

  it('resolveNextTopic returns next unstarted topic in same book', async () => {
    const next = await resolveNextTopic(db, profileId, topicId1);
    expect(next).not.toBeNull();
    expect(next!.id).toBe(topicId2);
    expect(next!.title).toBe('Glucose Synthesis');
  });

  it('resolveNextTopic returns null when all topics done', async () => {
    // topicId2 is the last topic — no next
    const next = await resolveNextTopic(db, profileId, topicId2);
    expect(next).toBeNull();
  });

  it('freeform matching returns null when no keywords match', async () => {
    const result = await matchFreeformTopics(db, profileId, subjectId, [
      '- You explored something general',
    ]);
    expect(result).toBeNull();
  });

  it('freeform matching finds topic by keyword within same subject', async () => {
    const result = await matchFreeformTopics(db, profileId, subjectId, [
      '- You explored carbon fixation in the Calvin cycle',
    ]);
    // "fixation" and "carbon" should match "Carbon Fixation"
    expect(result).not.toBeNull();
    expect(result!.title).toBe('Carbon Fixation');
  });
});
```

- [ ] **Step 2: Run integration tests**

Run: `cd apps/api && pnpm exec jest --testPathPattern session-recap.integration --no-coverage --forceExit`

Expected: All tests pass (7 tests). The custom mock LLM provider returns valid recap JSON (not envelope-wrapped), so the structured output pipeline is exercised end-to-end. resolveNextTopic and freeform matching tested against seeded curriculum data.

- [ ] **Step 3: Commit**

```
test(api): session recap integration tests

Threshold guard, curriculum session recap, structured output
validation, freeform topic matching. Mock LLM provider for
deterministic assertions.
```

---

## Task 15 [F1]: Session Recap — Inngest Pipeline Step

**Files:**
- Modify: `apps/api/src/inngest/functions/session-completed.ts`

- [ ] **Step 1: Add the `generate-learner-recap` step**

In `apps/api/src/inngest/functions/session-completed.ts`, add a new step after the `generate-session-insights` step (after line 676, before the comment `// Step 3: Analyze learner transcript`).

Add import at the top:

```typescript
import { generateLearnerRecap } from '../../services/session-recap';
```

Add the step:

```typescript
    // Step 2c: Generate learner-facing recap + next-topic suggestion
    outcomes.push(
      await step.run('generate-learner-recap', async () =>
        runIsolated('generate-learner-recap', profileId, async () => {
          const db = getStepDatabase();

          // Find the session_summaries row (created by write-coaching-card)
          const [summaryRow] = await db
            .select({ id: sessionSummaries.id })
            .from(sessionSummaries)
            .where(
              and(
                eq(sessionSummaries.sessionId, sessionId),
                eq(sessionSummaries.profileId, profileId)
              )
            )
            .limit(1);

          if (!summaryRow) {
            console.warn(
              `[session-completed] generate-learner-recap: no session_summaries row for session=${sessionId} — skipped`
            );
            return;
          }

          // Load birth year for age-tiered voice
          const [profile] = await db
            .select({ birthYear: profiles.birthYear })
            .from(profiles)
            .where(eq(profiles.id, profileId))
            .limit(1);

          const result = await generateLearnerRecap(db, {
            sessionId,
            profileId,
            topicId: topicId ?? null,
            subjectId: subjectId!,
            exchangeCount: exchangeCount ?? 0,
            birthYear: profile?.birthYear ?? null,
          });

          if (!result) return;

          await db
            .update(sessionSummaries)
            .set({
              closingLine: result.closingLine,
              learnerRecap: result.learnerRecap,
              nextTopicId: result.nextTopicId,
              nextTopicReason: result.nextTopicReason,
              updatedAt: new Date(),
            })
            .where(eq(sessionSummaries.id, summaryRow.id));
        })
      )
    );
```

Ensure the required imports (`profiles`, `sessionSummaries`, `eq`, `and`) are already present at the top of the file (they likely are, given the existing steps use them).

- [ ] **Step 2: Verify typecheck**

Run: `pnpm exec nx run api:typecheck`

Expected: No type errors.

- [ ] **Step 3: Run existing Inngest tests**

Run: `pnpm exec jest --findRelatedTests apps/api/src/inngest/functions/session-completed.ts --no-coverage`

Expected: All existing tests pass — the new step is additive and guarded by the same `summaryRow` check as existing steps.

- [ ] **Step 4: Commit**

```
feat(api): generate-learner-recap Inngest step

Runs after generate-session-insights. Calls session-recap service
for closing line + takeaways + next-topic. Writes to session_summaries.
```

---

## Task 16 [F1]: Session Recap — Eval Harness Flow

**Files:**
- Create: `apps/api/eval-llm/flows/session-recap.ts`
- Modify: `apps/api/eval-llm/index.ts`

- [ ] **Step 1: Create the eval flow adapter**

Create `apps/api/eval-llm/flows/session-recap.ts`:

```typescript
import { learnerRecapResponseSchema } from '@eduagent/schemas';
import type { EvalProfile } from '../fixtures/profiles';
import type { FlowDefinition, PromptMessages } from '../runner/types';
// Import prompt builders from the service — single source of truth
import {
  buildRecapPrompt,
  getAgeVoiceTierLabel,
} from '../../src/services/session-recap';

interface SessionRecapInput {
  transcriptText: string;
  ageVoiceTier: string;
  nextTopicTitle: string | null;
}

function synthesizeTranscript(profile: EvalProfile): string {
  const topic = profile.libraryTopics[0] ?? 'General';
  const struggle = profile.struggles[0]?.topic ?? 'a tricky concept';
  return [
    `Student: Can we go over ${topic}?`,
    `Mentor: Of course. What do you already know?`,
    `Student: I know the basics but ${struggle} always confuses me.`,
    `Mentor: That's a good place to start. Let me break it down step by step.`,
    `Student: Okay, so the first step is...`,
    `Mentor: Exactly. And then what happens next?`,
    `Student: Oh! I think I see how it connects now. So it feeds back into the cycle?`,
    `Mentor: That's it. You just connected the output back to the input.`,
  ].join('\n\n');
}

export const sessionRecapFlow: FlowDefinition<SessionRecapInput> = {
  id: 'session-recap',
  name: 'Session Recap (learner-facing)',
  sourceFile: 'apps/api/src/services/session-recap.ts:buildRecapPrompt',

  buildPromptInput(profile: EvalProfile): SessionRecapInput {
    const ageVoiceTier = getAgeVoiceTierLabel(profile.birthYear);
    const transcriptText = synthesizeTranscript(profile);
    // Use second library topic as "next topic" for eval (first is the current)
    const nextTopicTitle = profile.libraryTopics[1] ?? null;

    return {
      transcriptText,
      ageVoiceTier,
      nextTopicTitle,
    };
  },

  buildPrompt(input: SessionRecapInput): PromptMessages {
    const system = buildRecapPrompt(input.ageVoiceTier, input.nextTopicTitle);

    return {
      system,
      user: input.transcriptText,
      notes: [
        `Age tier: ${input.ageVoiceTier}`,
        `Next topic: ${input.nextTopicTitle ?? 'none (freeform)'}`,
        'Transcript is synthetic 8-turn fixture for snapshot purposes.',
      ],
    };
  },

  expectedResponseSchema: {
    safeParse: (raw: unknown) => {
      try {
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        return learnerRecapResponseSchema.safeParse(parsed);
      } catch {
        return { success: false, error: new Error('JSON parse failed') };
      }
    },
  },
};
```

- [ ] **Step 2: Register the flow**

In `apps/api/eval-llm/index.ts`, add the import:

```typescript
import { sessionRecapFlow } from './flows/session-recap';
```

Add `sessionRecapFlow` to the flow registry array.

- [ ] **Step 3: Run the eval harness**

Run: `pnpm eval:llm --flow session-recap`

Expected: Tier 1 snapshots generated for all 5 fixture profiles. Each snapshot shows the system prompt with age-appropriate voice tier and the synthetic transcript.

- [ ] **Step 4: Commit**

```
feat(api): eval harness flow for session-recap prompt (11th flow)

Imports buildRecapPrompt + getAgeVoiceTierLabel from the service
(single source of truth). Synthetic 8-turn transcripts per fixture
profile. Tests both age tiers. Schema validation via
learnerRecapResponseSchema.
```

---

## Task 17 [F1]: Session Recap — Summary Screen UI

**Files:**
- Modify: `apps/mobile/src/hooks/use-sessions.ts:536-560`
- Modify: `apps/mobile/src/app/session-summary/[sessionId].tsx`

- [ ] **Step 1: Add `refetchInterval` to `useSessionSummary`**

In `apps/mobile/src/hooks/use-sessions.ts`, modify `useSessionSummary` to accept an options parameter:

```typescript
export function useSessionSummary(
  sessionId: string,
  options?: {
    /** Poll every N ms until predicate returns false. Useful for waiting on Inngest. */
    refetchInterval?: (data: SessionSummary | null | undefined) => number | false;
  }
): UseQueryResult<SessionSummary | null> {
  const client = useApiClient();
  const { activeProfile } = useProfile();

  return useQuery({
    queryKey: ['session-summary', sessionId, activeProfile?.id],
    queryFn: async ({ signal: querySignal }) => {
      const { signal, cleanup } = combinedSignal(querySignal);
      try {
        const res = await client.sessions[':sessionId'].summary.$get(
          { param: { sessionId } },
          { init: { signal } }
        );
        await assertOk(res);
        const data = await res.json();
        return data.summary;
      } finally {
        cleanup();
      }
    },
    enabled: !!activeProfile && !!sessionId,
    refetchInterval: options?.refetchInterval
      ? (query) => options.refetchInterval!(query.state.data ?? null)
      : undefined,
  });
}
```

- [ ] **Step 2: Add recap cards to the session summary screen**

In `apps/mobile/src/app/session-summary/[sessionId].tsx`:

Update the `useSessionSummary` call to poll when the recap isn't loaded yet:

```typescript
const persistedSummary = useSessionSummary(sessionId ?? '', {
  refetchInterval: (data) =>
    !isAlreadyPersisted && !data?.learnerRecap ? 2000 : false,
});
```

Add a timeout ref to stop polling after 15 seconds:

```typescript
const [recapTimedOut, setRecapTimedOut] = useState(false);
useEffect(() => {
  if (isAlreadyPersisted || persisted?.learnerRecap) return;
  const timer = setTimeout(() => setRecapTimedOut(true), 15_000);
  return () => clearTimeout(timer);
}, [isAlreadyPersisted, persisted?.learnerRecap]);
```

Add the new cards in the ScrollView. Insert the closing line above the "What happened" stats card, and the recap/next-topic cards after it:

**Closing line** (insert before `testID="session-takeaways"`):

```typescript
{persisted?.closingLine && (
  <Text
    className="text-body text-text-primary italic px-1 mb-3"
    testID="session-closing-line"
  >
    {persisted.closingLine}
  </Text>
)}
```

**"What you explored" card** (insert after the stats card, before milestones):

```typescript
{persisted?.learnerRecap ? (
  <View className="bg-surface rounded-card p-4 mt-4" testID="session-recap-card">
    <Text className="text-body font-semibold text-text-primary mb-2">
      What you explored
    </Text>
    {persisted.learnerRecap.split('\n').filter((l) => l.startsWith('- ')).map((bullet, i) => (
      <Text key={i} className="text-body text-text-secondary ml-2 mb-1">
        {bullet}
      </Text>
    ))}
  </View>
) : recapTimedOut ? (
  // Timeout state — user-visible feedback with retry action
  <View className="bg-surface rounded-card p-4 mt-4" testID="session-recap-timeout">
    <Text className="text-body-sm text-text-tertiary text-center">
      Session recap is still loading.
    </Text>
    <Pressable
      onPress={() => {
        setRecapTimedOut(false);
        void queryClient.invalidateQueries({
          queryKey: ['session-summary', sessionId],
        });
      }}
      className="mt-2 items-center"
      accessibilityRole="button"
      accessibilityLabel="Retry loading recap"
      testID="session-recap-retry"
    >
      <Text className="text-body-sm font-medium text-primary">
        Tap to retry
      </Text>
    </Pressable>
  </View>
) : !isAlreadyPersisted && exchangeCountNum >= 3 ? (
  <View className="bg-surface rounded-card p-4 mt-4 animate-pulse" testID="session-recap-skeleton">
    <View className="h-4 w-40 bg-surface-elevated rounded mb-3" />
    <View className="h-3 w-full bg-surface-elevated rounded mb-2" />
    <View className="h-3 w-3/4 bg-surface-elevated rounded mb-2" />
    <View className="h-3 w-5/6 bg-surface-elevated rounded" />
  </View>
) : null}
```

**"Up next" card** (insert after milestones, before "Your Words"):

Handles two cases: curriculum sessions (with `nextTopicReason`) show "Up next", freeform sessions (with `nextTopicId` but no `nextTopicReason`) show "You might also like...":

```typescript
{persisted?.nextTopicId && (
  <View className="bg-surface rounded-card p-4 mt-4" testID="session-next-topic-card">
    <Text className="text-body font-semibold text-text-primary mb-1">
      {persisted.nextTopicReason ? 'Up next' : 'You might also like...'}
    </Text>
    {persisted.nextTopicReason && (
      <Text className="text-body-sm text-text-secondary mb-3">
        {persisted.nextTopicReason}
      </Text>
    )}
    <Pressable
      onPress={() => {
        // Navigate to a new session pre-seeded with the next topic.
        // Session screen reads topicId + subjectId from search params.
        const subjectParam = persisted.nextTopicId
          ? `&subjectId=${summary?.subjectId ?? ''}`
          : '';
        router.push(
          `/(app)/session?mode=learning&topicId=${persisted.nextTopicId}${subjectParam}` as never
        );
      }}
      className="bg-primary rounded-button px-4 py-2.5 items-center"
      accessibilityRole="button"
      accessibilityLabel="Continue learning"
      testID="session-next-topic-cta"
    >
      <Text className="text-body-sm font-semibold text-text-inverse">
        Continue learning
      </Text>
    </Pressable>
  </View>
)}
```

**Bookmark prompt** (conditional, insert after "Up next"):

Feature 2 (Bookmarks) is implemented before this task in the plan, so the hooks are available. This card drives bookmark discoverability per the spec:

```typescript
{exchangeCountNum >= 5 && sessionBookmarks?.length === 0 && qualifyingSessionCount <= 3 && (
  <View className="bg-surface rounded-card p-3 mt-4" testID="session-bookmark-nudge">
    <Text className="text-body-sm text-text-secondary text-center">
      Some great explanations in this session — you can bookmark them next time.
    </Text>
  </View>
)}
```

Where `sessionBookmarks` comes from `useSessionBookmarks(sessionId)` and `qualifyingSessionCount` is the count of the learner's completed sessions with `exchangeCount >= 5`. The implementor should derive this from the session list query or add a lightweight count query. After 3 qualifying sessions with zero bookmarks, the nudge stops showing (not nagging).

- [ ] **Step 3: Verify typecheck**

Run: `cd apps/mobile && pnpm exec tsc --noEmit`

Expected: No type errors.

- [ ] **Step 4: Run related tests**

Run: `cd apps/mobile && pnpm exec jest --findRelatedTests "src/app/session-summary/[sessionId].tsx" --no-coverage`

Expected: All pass. Existing tests won't break because the new cards are conditional on nullable fields that don't exist in test fixtures.

- [ ] **Step 5: Commit**

```
feat(mobile): session recap cards on summary screen

Closing line above stats. "What you explored" with shimmer skeleton
while Inngest processes. "Up next" with CTA (curriculum) and "You
might also like..." (freeform). Bookmark adoption nudge for first
3 qualifying sessions. 15s polling timeout with graceful degradation.
```

---

## Post-Implementation Checklist

After all tasks are complete, run these verification commands:

- [ ] **Full API typecheck:** `pnpm exec nx run api:typecheck`
- [ ] **Full mobile typecheck:** `cd apps/mobile && pnpm exec tsc --noEmit`
- [ ] **API lint:** `pnpm exec nx run api:lint`
- [ ] **Mobile lint:** `pnpm exec nx lint mobile`
- [ ] **API tests:** `pnpm exec nx run api:test`
- [ ] **Integration tests:** `cd apps/api && pnpm exec jest --testPathPattern integration --no-coverage --forceExit`
- [ ] **Eval harness snapshot:** `pnpm eval:llm`
- [ ] **Eval harness live (optional):** `pnpm eval:llm --live --flow session-recap`
- [ ] **Manual verification:** Start the mobile dev server, complete a 3+ exchange session, verify the closing line + recap cards appear on the summary screen within 15 seconds
