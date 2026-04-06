# Library UX Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract Shelf and Book screens from the monolith library.tsx, add Topic Notes with voice/text capture, simplify Library to a browsing hub.

**Architecture:** Two new Expo Router routes (`shelf/[subjectId]`, `shelf/[subjectId]/book/[bookId]`) replace the state-based drill-down in library.tsx. A new `topic_notes` table stores per-topic notes. Session system prompt gains a mid-session note trigger (max once), and a post-session note prompt. `curriculum_topics.bookId` becomes non-nullable — every topic belongs to a book.

**Tech Stack:** Expo Router (file-based routing), React Native + NativeWind, TanStack React Query, Hono (API), Drizzle ORM (Postgres/Neon), Zod validation, React Native Reanimated (animations), expo-speech-recognition (voice).

**Spec:** `docs/superpowers/specs/2026-04-06-library-ux-refactor-design.md`

---

## File Structure

### New Files

```
packages/database/src/schema/notes.ts                         — topic_notes Drizzle table
packages/schemas/src/notes.ts                                 — TopicNote Zod schema + types
apps/api/src/services/notes.ts                                — getNotesForBook, upsertNote, deleteNote
apps/api/src/routes/notes.ts                                  — GET/PUT/DELETE note endpoints
apps/api/src/routes/notes.test.ts                             — route integration tests
apps/mobile/src/hooks/use-notes.ts                            — useBookNotes, useUpsertNote, useDeleteNote
apps/mobile/src/hooks/use-notes.test.ts                       — hook tests
apps/mobile/src/components/library/CollapsibleChapter.tsx      — animated expand/collapse chapter
apps/mobile/src/components/library/CollapsibleChapter.test.tsx — component test
apps/mobile/src/components/library/NoteDisplay.tsx             — inline note view with edit/delete
apps/mobile/src/components/library/NoteDisplay.test.tsx        — component test
apps/mobile/src/components/library/NoteInput.tsx               — text + voice note input
apps/mobile/src/components/library/NoteInput.test.tsx          — component test
apps/mobile/src/app/(learner)/shelf/[subjectId]/index.tsx      — Shelf screen
apps/mobile/src/app/(learner)/shelf/[subjectId]/_layout.tsx    — Stack layout for shelf routes
apps/mobile/src/app/(learner)/shelf/[subjectId]/book/[bookId].tsx — Book screen
apps/mobile/src/app/(parent)/shelf/[subjectId]/index.tsx       — parent re-export
apps/mobile/src/app/(parent)/shelf/[subjectId]/_layout.tsx     — parent re-export layout
apps/mobile/src/app/(parent)/shelf/[subjectId]/book/[bookId].tsx — parent re-export
```

### Modified Files

```
packages/database/src/schema/index.ts                          — add notes export
packages/database/src/schema/subjects.ts                       — bookId .notNull()
packages/schemas/src/index.ts                                  — add notes export
packages/schemas/src/subjects.ts                               — bookId non-nullable in Zod
apps/api/src/index.ts                                          — mount noteRoutes
apps/mobile/src/app/(learner)/library.tsx                      — remove drill-down, wire routes
apps/mobile/src/lib/library-filters.ts                         — add hasNotes to TopicsFilters + EnrichedTopic
apps/mobile/src/components/library/TopicsTab.tsx               — add hasNotes filter chip
```

### Removed Files

```
apps/mobile/src/components/library/ShelfView.tsx               — replaced by Shelf screen
apps/mobile/src/components/library/ChapterTopicList.tsx         — replaced by CollapsibleChapter
```

---

## Task 1: Schema — topic_notes table + bookId non-nullable

**Files:**
- Create: `packages/database/src/schema/notes.ts`
- Modify: `packages/database/src/schema/index.ts`
- Modify: `packages/database/src/schema/subjects.ts:130` (bookId column)

- [ ] **Step 1: Create the topic_notes table definition**

Create `packages/database/src/schema/notes.ts`:

```typescript
import { pgTable, uuid, text, timestamp, unique } from 'drizzle-orm/pg-core';
import { curriculumTopics } from './subjects';
import { profiles } from './profiles';
import { generateUUIDv7 } from '../utils/uuid';

export const topicNotes = pgTable(
  'topic_notes',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => generateUUIDv7()),
    topicId: uuid('topic_id')
      .notNull()
      .references(() => curriculumTopics.id, { onDelete: 'cascade' }),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    content: text('content').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [unique().on(t.topicId, t.profileId)],
);
```

- [ ] **Step 2: Export from schema barrel**

In `packages/database/src/schema/index.ts`, add after the last export:

```typescript
export * from './notes';
```

- [ ] **Step 3: Make bookId non-nullable in Drizzle schema**

In `packages/database/src/schema/subjects.ts`, change line 130 from:

```typescript
  bookId: uuid('book_id').references(() => curriculumBooks.id, {
    onDelete: 'cascade',
  }),
```

to:

```typescript
  bookId: uuid('book_id')
    .notNull()
    .references(() => curriculumBooks.id, { onDelete: 'cascade' }),
```

- [ ] **Step 4: Generate migrations**

Run:

```bash
cd packages/database && pnpm exec drizzle-kit generate
```

This produces two SQL migration files in `apps/api/drizzle/`:
1. CREATE TABLE `topic_notes` with unique constraint
2. ALTER `curriculum_topics.book_id` SET NOT NULL

**Important:** The bookId NOT NULL migration requires a backfill first. Run the backfill within a transaction before running `drizzle-kit migrate` in staging/prod. If the backfill isn't run first, the ALTER will fail on any NULL rows.

```sql
BEGIN;

-- Step 1: Create a book for each subject that has orphan topics (bookId IS NULL)
-- Uses gen_random_uuid() because generateUUIDv7 is app-level; DB migrations use Postgres-native UUIDs.
-- The app uses UUIDv7 for new rows, but backfill rows only need unique valid UUIDs.
INSERT INTO curriculum_books (id, subject_id, title, sort_order, topics_generated, created_at, updated_at)
SELECT
  gen_random_uuid(),
  c.subject_id,
  s.name,
  0,
  true,
  now(),
  now()
FROM (
  SELECT DISTINCT cur.subject_id
  FROM curriculum_topics ct
  JOIN curricula cur ON cur.id = ct.curriculum_id
  WHERE ct.book_id IS NULL
) c
JOIN subjects s ON s.id = c.subject_id
-- Don't create duplicate books if subject already has a sort_order=0 book
WHERE NOT EXISTS (
  SELECT 1 FROM curriculum_books cb
  WHERE cb.subject_id = c.subject_id AND cb.sort_order = 0
);

-- Step 2: Assign orphan topics to their subject's backfill book
UPDATE curriculum_topics
SET book_id = cb.id
FROM curricula c
JOIN curriculum_books cb ON cb.subject_id = c.subject_id AND cb.sort_order = 0
WHERE curriculum_topics.curriculum_id = c.id
  AND curriculum_topics.book_id IS NULL;

-- Step 3: Verify no NULLs remain before committing
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM curriculum_topics WHERE book_id IS NULL) THEN
    RAISE EXCEPTION 'Backfill incomplete: NULL book_id rows still exist';
  END IF;
END $$;

COMMIT;
```

For dev, `pnpm run db:push:dev` handles everything (schema is pushed directly, no migration needed).

- [ ] **Step 5: Verify schema pushes cleanly in dev**

Run:

```bash
pnpm run db:push:dev
```

Expected: No errors. Schema changes applied.

- [ ] **Step 6: Typecheck**

Run:

```bash
pnpm exec nx run api:typecheck
```

Expected: Clean pass.

- [ ] **Step 7: Commit**

```bash
git add packages/database/src/schema/notes.ts packages/database/src/schema/index.ts packages/database/src/schema/subjects.ts apps/api/drizzle/
git commit -m "feat(db): add topic_notes table, make bookId non-nullable [7.8]"
```

---

## Task 2: Schemas package — TopicNote Zod type

**Files:**
- Create: `packages/schemas/src/notes.ts`
- Modify: `packages/schemas/src/index.ts`
- Modify: `packages/schemas/src/subjects.ts:109` (bookId field)

- [ ] **Step 1: Create TopicNote Zod schema**

Create `packages/schemas/src/notes.ts`:

```typescript
import { z } from 'zod';

export const topicNoteSchema = z.object({
  id: z.string().uuid(),
  topicId: z.string().uuid(),
  profileId: z.string().uuid(),
  content: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type TopicNote = z.infer<typeof topicNoteSchema>;

export const upsertNoteInputSchema = z.object({
  content: z.string().min(1).max(5000),
  append: z.boolean().optional(),
});
export type UpsertNoteInput = z.infer<typeof upsertNoteInputSchema>;

export const bookNotesResponseSchema = z.object({
  notes: z.array(
    z.object({
      topicId: z.string().uuid(),
      content: z.string(),
      updatedAt: z.string().datetime(),
    }),
  ),
});
export type BookNotesResponse = z.infer<typeof bookNotesResponseSchema>;
```

- [ ] **Step 2: Export from schemas barrel**

In `packages/schemas/src/index.ts`, add:

```typescript
export * from './notes';
```

- [ ] **Step 3: Make bookId non-nullable in CurriculumTopic Zod schema**

In `packages/schemas/src/subjects.ts`, change the `bookId` field (line ~109) from:

```typescript
  bookId: z.string().uuid().nullable().optional(),
```

to:

```typescript
  bookId: z.string().uuid(),
```

- [ ] **Step 4: Typecheck both packages**

Run:

```bash
pnpm exec nx run api:typecheck && cd apps/mobile && pnpm exec tsc --noEmit
```

Expected: Pass. Any type errors from `bookId` becoming required indicate callsites that need updating — fix them before proceeding (likely in mock data in test files).

- [ ] **Step 5: Fix any type errors from bookId change**

Search for test files and mock data that use `bookId: null` or omit `bookId`. Update them to provide a valid UUID string. Common locations:
- `apps/api/src/routes/books.test.ts` — mock topic objects
- `apps/mobile/src/hooks/use-books.test.ts` — mock data
- `apps/mobile/src/components/library/` test files

- [ ] **Step 6: Run tests to verify no regressions**

Run:

```bash
pnpm exec nx run api:test && cd apps/mobile && pnpm exec jest --no-coverage
```

Expected: All existing tests pass.

- [ ] **Step 7: Commit**

```bash
git add packages/schemas/src/notes.ts packages/schemas/src/index.ts packages/schemas/src/subjects.ts
git commit -m "feat(schemas): add TopicNote types, bookId now required [7.8]"
```

---

## Task 3: API — Notes service + routes + tests

**Files:**
- Create: `apps/api/src/services/notes.ts`
- Create: `apps/api/src/routes/notes.ts`
- Create: `apps/api/src/routes/notes.test.ts`
- Modify: `apps/api/src/index.ts:179` (mount routes)

- [ ] **Step 1: Write the notes service**

Create `apps/api/src/services/notes.ts`:

```typescript
import { eq, and, inArray } from 'drizzle-orm';
import type { Database } from '@eduagent/database';
import { topicNotes, curriculumTopics, curriculumBooks, subjects } from '@eduagent/database';

export async function getNotesForBook(
  db: Database,
  profileId: string,
  subjectId: string,
  bookId: string,
): Promise<Array<{ topicId: string; content: string; updatedAt: Date }>> {
  // Verify book belongs to this subject (ownership through parent chain)
  const [book] = await db
    .select({ id: curriculumBooks.id })
    .from(curriculumBooks)
    .where(
      and(
        eq(curriculumBooks.id, bookId),
        eq(curriculumBooks.subjectId, subjectId),
      ),
    );
  if (!book) return [];

  // Get all topic IDs for this book, then fetch notes
  const topics = await db
    .select({ id: curriculumTopics.id })
    .from(curriculumTopics)
    .where(eq(curriculumTopics.bookId, bookId));

  if (topics.length === 0) return [];

  const topicIds = topics.map((t) => t.id);

  const notes = await db
    .select({
      topicId: topicNotes.topicId,
      content: topicNotes.content,
      updatedAt: topicNotes.updatedAt,
    })
    .from(topicNotes)
    .where(
      and(
        inArray(topicNotes.topicId, topicIds),
        eq(topicNotes.profileId, profileId),
      ),
    );

  return notes;
}

export async function upsertNote(
  db: Database,
  profileId: string,
  topicId: string,
  content: string,
  append?: boolean,
): Promise<{ id: string; topicId: string; content: string; updatedAt: Date }> {
  // If append mode, fetch existing content first to concatenate
  if (append) {
    const existing = await db
      .select({ id: topicNotes.id, content: topicNotes.content })
      .from(topicNotes)
      .where(
        and(
          eq(topicNotes.topicId, topicId),
          eq(topicNotes.profileId, profileId),
        ),
      )
      .then((rows) => rows[0] ?? null);

    if (existing) {
      const newContent = `${existing.content}\n${content}`;
      const [updated] = await db
        .update(topicNotes)
        .set({ content: newContent, updatedAt: new Date() })
        .where(eq(topicNotes.id, existing.id))
        .returning();
      return updated;
    }
    // No existing note — fall through to insert below
  }

  // Atomic upsert using ON CONFLICT to avoid TOCTOU race.
  // Two concurrent inserts for the same (topicId, profileId) won't crash —
  // the loser updates instead of failing on the unique constraint.
  const [result] = await db
    .insert(topicNotes)
    .values({ topicId, profileId, content })
    .onConflictDoUpdate({
      target: [topicNotes.topicId, topicNotes.profileId],
      set: { content, updatedAt: new Date() },
    })
    .returning();
  return result;
}

export async function deleteNote(
  db: Database,
  profileId: string,
  topicId: string,
): Promise<boolean> {
  const result = await db
    .delete(topicNotes)
    .where(
      and(
        eq(topicNotes.topicId, topicId),
        eq(topicNotes.profileId, profileId),
      ),
    )
    .returning({ id: topicNotes.id });
  return result.length > 0;
}
```

- [ ] **Step 2: Write the notes routes**

Create `apps/api/src/routes/notes.ts`:

```typescript
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { upsertNoteInputSchema } from '@eduagent/schemas';
import type { Database } from '@eduagent/database';
import type { AuthUser } from '../middleware/auth';
import { requireProfileId } from '../middleware/profile-scope';
import { eq } from 'drizzle-orm';
import { topicNotes } from '@eduagent/database';
import { getNotesForBook, upsertNote, deleteNote } from '../services/notes';

const bookNotesParamSchema = z.object({
  subjectId: z.string().uuid(),
  bookId: z.string().uuid(),
});

const topicNoteParamSchema = z.object({
  subjectId: z.string().uuid(),
  topicId: z.string().uuid(),
});

type NoteRouteEnv = {
  Bindings: { DATABASE_URL: string; CLERK_JWKS_URL?: string };
  Variables: {
    user: AuthUser;
    db: Database;
    profileId: string | undefined;
  };
};

export const noteRoutes = new Hono<NoteRouteEnv>()
  // Get all notes for topics in a book
  .get(
    '/subjects/:subjectId/books/:bookId/notes',
    zValidator('param', bookNotesParamSchema),
    async (c) => {
      const db = c.get('db');
      const profileId = requireProfileId(c.get('profileId'));
      const { bookId } = c.req.valid('param');
      const notes = await getNotesForBook(db, profileId, c.req.valid('param').subjectId, bookId);
      return c.json({
        notes: notes.map((n) => ({
          topicId: n.topicId,
          content: n.content,
          updatedAt: n.updatedAt.toISOString(),
        })),
      });
    },
  )
  // Upsert a note for a topic
  .put(
    '/subjects/:subjectId/topics/:topicId/note',
    zValidator('param', topicNoteParamSchema),
    zValidator('json', upsertNoteInputSchema),
    async (c) => {
      const db = c.get('db');
      const profileId = requireProfileId(c.get('profileId'));
      const { topicId } = c.req.valid('param');
      const { content, append } = c.req.valid('json');
      const note = await upsertNote(db, profileId, topicId, content, append);
      return c.json({
        note: {
          id: note.id,
          topicId: note.topicId,
          content: note.content,
          updatedAt: note.updatedAt.toISOString(),
        },
      });
    },
  )
  // Get all topic IDs that have notes (for Library Topics tab "Has notes" filter)
  .get('/notes/topic-ids', async (c) => {
    const db = c.get('db');
    const profileId = requireProfileId(c.get('profileId'));
    const rows = await db
      .select({ topicId: topicNotes.topicId })
      .from(topicNotes)
      .where(eq(topicNotes.profileId, profileId));
    return c.json({ topicIds: rows.map((r) => r.topicId) });
  })
  // Delete a note for a topic
  .delete(
    '/subjects/:subjectId/topics/:topicId/note',
    zValidator('param', topicNoteParamSchema),
    async (c) => {
      const db = c.get('db');
      const profileId = requireProfileId(c.get('profileId'));
      const { topicId } = c.req.valid('param');
      const deleted = await deleteNote(db, profileId, topicId);
      if (!deleted) {
        return c.json({ error: 'Note not found' }, 404);
      }
      return c.body(null, 204);
    },
  );
```

- [ ] **Step 3: Mount routes in API app**

In `apps/api/src/index.ts`, add the import near the other route imports:

```typescript
import { noteRoutes } from './routes/notes';
```

Then add to the route chain (after `bookRoutes`):

```typescript
  .route('/', noteRoutes)
```

- [ ] **Step 4: Write route integration tests**

Create `apps/api/src/routes/notes.test.ts`:

```typescript
import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// Mock JWT before any imports
jest.mock('../middleware/jwt', () => ({
  verifyJWT: jest.fn().mockResolvedValue({
    sub: 'clerk-user-id',
    email: 'test@test.com',
    exp: Math.floor(Date.now() / 1000) + 3600,
  }),
}));

jest.mock('@eduagent/database', () => ({
  createDatabase: jest.fn().mockReturnValue({}),
}));

const mockGetNotesForBook = jest.fn<any>();
const mockUpsertNote = jest.fn<any>();
const mockDeleteNote = jest.fn<any>();

jest.mock('../services/notes', () => ({
  getNotesForBook: (...args: unknown[]) => mockGetNotesForBook(...args),
  upsertNote: (...args: unknown[]) => mockUpsertNote(...args),
  deleteNote: (...args: unknown[]) => mockDeleteNote(...args),
}));

jest.mock('../services/account', () => ({
  getOrCreateAccount: jest.fn().mockResolvedValue({ id: 'account-1' }),
}));

jest.mock('../services/profile', () => ({
  getProfileById: jest.fn().mockResolvedValue({
    id: 'profile-1',
    accountId: 'account-1',
    displayName: 'Test',
  }),
}));

// Import app AFTER mocks — uses named export, synchronous import
import { app } from '../index';

const TEST_ENV = { CLERK_JWKS_URL: 'https://example.com/.well-known/jwks.json' };
const AUTH_HEADERS = {
  Authorization: 'Bearer test-token',
  'X-Profile-Id': 'profile-1',
  'Content-Type': 'application/json',
};

const SUBJECT_ID = '00000000-0000-0000-0000-000000000001';
const BOOK_ID = '00000000-0000-0000-0000-000000000002';
const TOPIC_ID = '00000000-0000-0000-0000-000000000003';

describe('Note routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /v1/subjects/:subjectId/books/:bookId/notes', () => {
    it('returns notes for a book', async () => {
      mockGetNotesForBook.mockResolvedValueOnce([
        {
          topicId: TOPIC_ID,
          content: 'Pyramids are big triangles',
          updatedAt: new Date('2026-04-06T10:00:00Z'),
        },
      ]);

      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/books/${BOOK_ID}/notes`,
        { headers: AUTH_HEADERS },
        TEST_ENV,
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.notes).toHaveLength(1);
      expect(data.notes[0].topicId).toBe(TOPIC_ID);
      expect(data.notes[0].content).toBe('Pyramids are big triangles');
    });

    it('returns empty array when no notes exist', async () => {
      mockGetNotesForBook.mockResolvedValueOnce([]);

      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/books/${BOOK_ID}/notes`,
        { headers: AUTH_HEADERS },
        TEST_ENV,
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.notes).toEqual([]);
    });
  });

  describe('PUT /v1/subjects/:subjectId/topics/:topicId/note', () => {
    it('creates a new note', async () => {
      mockUpsertNote.mockResolvedValueOnce({
        id: 'note-1',
        topicId: TOPIC_ID,
        content: 'The Nile flows north',
        updatedAt: new Date('2026-04-06T10:00:00Z'),
      });

      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/topics/${TOPIC_ID}/note`,
        {
          method: 'PUT',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ content: 'The Nile flows north' }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.note.content).toBe('The Nile flows north');
    });

    it('appends to existing note when append=true', async () => {
      mockUpsertNote.mockResolvedValueOnce({
        id: 'note-1',
        topicId: TOPIC_ID,
        content: 'First note\nAppended note',
        updatedAt: new Date('2026-04-06T10:00:00Z'),
      });

      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/topics/${TOPIC_ID}/note`,
        {
          method: 'PUT',
          headers: AUTH_HEADERS,
          body: JSON.stringify({
            content: 'Appended note',
            append: true,
          }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.note.content).toContain('Appended note');
    });

    it('rejects empty content', async () => {
      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/topics/${TOPIC_ID}/note`,
        {
          method: 'PUT',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ content: '' }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /v1/subjects/:subjectId/topics/:topicId/note', () => {
    it('deletes a note', async () => {
      mockDeleteNote.mockResolvedValueOnce(true);

      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/topics/${TOPIC_ID}/note`,
        { method: 'DELETE', headers: AUTH_HEADERS },
        TEST_ENV,
      );

      expect(res.status).toBe(204);
    });
  });
});
```

- [ ] **Step 5: Run tests**

Run:

```bash
cd apps/api && pnpm exec jest src/routes/notes.test.ts --no-coverage
```

Expected: All 5 tests pass.

- [ ] **Step 6: Typecheck**

Run:

```bash
pnpm exec nx run api:typecheck && pnpm exec nx run api:lint
```

Expected: Clean pass.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/services/notes.ts apps/api/src/routes/notes.ts apps/api/src/routes/notes.test.ts apps/api/src/index.ts
git commit -m "feat(api): topic notes CRUD endpoints [7.9]"
```

---

## Task 4: Mobile — useBookNotes hook

**Files:**
- Create: `apps/mobile/src/hooks/use-notes.ts`
- Create: `apps/mobile/src/hooks/use-notes.test.ts`

- [ ] **Step 1: Write the hook tests**

Create `apps/mobile/src/hooks/use-notes.test.ts`:

```typescript
import { renderHook, waitFor, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useBookNotes, useUpsertNote, useDeleteNote } from './use-notes';

const mockFetch = jest.fn<any>();
jest.mock('../lib/api-client', () => ({
  useApiClient: () => ({
    subjects: {
      ':subjectId': {
        books: {
          ':bookId': {
            notes: {
              $get: ({ param }: any) => mockFetch(`/subjects/${param.subjectId}/books/${param.bookId}/notes`),
            },
          },
        },
        topics: {
          ':topicId': {
            note: {
              $put: ({ param, json }: any) =>
                mockFetch(`/subjects/${param.subjectId}/topics/${param.topicId}/note`, 'PUT', json),
              $delete: ({ param }: any) =>
                mockFetch(`/subjects/${param.subjectId}/topics/${param.topicId}/note`, 'DELETE'),
            },
          },
        },
      },
    },
  }),
}));

jest.mock('../lib/profile', () => ({
  useProfile: () => ({ activeProfile: { id: 'test-profile' } }),
}));

let queryClient: QueryClient;

function createWrapper() {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

afterEach(() => {
  queryClient?.clear();
  jest.clearAllMocks();
});

describe('useBookNotes', () => {
  it('fetches notes for a book', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          notes: [
            { topicId: 'topic-1', content: 'My note', updatedAt: '2026-04-06T10:00:00Z' },
          ],
        }),
        { status: 200 },
      ),
    );

    const { result } = renderHook(
      () => useBookNotes('subject-1', 'book-1'),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.notes).toHaveLength(1);
    expect(result.current.data?.notes[0].content).toBe('My note');
  });
});

describe('useUpsertNote', () => {
  it('creates a note and invalidates book notes query', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          note: { id: 'note-1', topicId: 'topic-1', content: 'New note', updatedAt: '2026-04-06T10:00:00Z' },
        }),
        { status: 200 },
      ),
    );

    const { result } = renderHook(
      () => useUpsertNote('subject-1', 'book-1'),
      { wrapper: createWrapper() },
    );

    await act(async () => {
      result.current.mutate({ topicId: 'topic-1', content: 'New note' });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
cd apps/mobile && pnpm exec jest --findRelatedTests src/hooks/use-notes.test.ts --no-coverage
```

Expected: FAIL — module `./use-notes` not found.

- [ ] **Step 3: Write the hooks**

Create `apps/mobile/src/hooks/use-notes.ts`:

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { BookNotesResponse, UpsertNoteInput } from '@eduagent/schemas';
import { useApiClient } from '../lib/api-client';
import { useProfile } from '../lib/profile';
import { assertOk } from '../lib/assert-ok';
import { combinedSignal } from '../lib/query-timeout';

export function useBookNotes(
  subjectId: string | undefined,
  bookId: string | undefined,
) {
  const client = useApiClient();
  const { activeProfile } = useProfile();

  return useQuery({
    queryKey: ['book-notes', subjectId, bookId, activeProfile?.id],
    queryFn: async ({ signal: querySignal }) => {
      const { signal, cleanup } = combinedSignal(querySignal);
      try {
        const res = await client.subjects[':subjectId'].books[':bookId'].notes.$get(
          { param: { subjectId: subjectId!, bookId: bookId! } },
          { init: { signal } },
        );
        await assertOk(res);
        return (await res.json()) as BookNotesResponse;
      } finally {
        cleanup();
      }
    },
    enabled: !!activeProfile && !!subjectId && !!bookId,
  });
}

export function useUpsertNote(
  subjectId: string | undefined,
  bookId: string | undefined,
) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  const { activeProfile } = useProfile();

  return useMutation({
    mutationFn: async (input: { topicId: string } & UpsertNoteInput) => {
      const res = await client.subjects[':subjectId'].topics[':topicId'].note.$put({
        param: { subjectId: subjectId!, topicId: input.topicId },
        json: { content: input.content, append: input.append },
      });
      await assertOk(res);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['book-notes', subjectId, bookId, activeProfile?.id],
      });
    },
  });
}

export function useNoteTopicIds() {
  const client = useApiClient();
  const { activeProfile } = useProfile();

  return useQuery({
    queryKey: ['note-topic-ids', activeProfile?.id],
    queryFn: async ({ signal: querySignal }) => {
      const { signal, cleanup } = combinedSignal(querySignal);
      try {
        const res = await client.notes['topic-ids'].$get({}, { init: { signal } });
        await assertOk(res);
        return (await res.json()) as { topicIds: string[] };
      } finally {
        cleanup();
      }
    },
    enabled: !!activeProfile,
  });
}

export function useDeleteNote(
  subjectId: string | undefined,
  bookId: string | undefined,
) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  const { activeProfile } = useProfile();

  return useMutation({
    mutationFn: async (topicId: string) => {
      const res = await client.subjects[':subjectId'].topics[':topicId'].note.$delete({
        param: { subjectId: subjectId!, topicId },
      });
      await assertOk(res);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['book-notes', subjectId, bookId, activeProfile?.id],
      });
    },
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
cd apps/mobile && pnpm exec jest --findRelatedTests src/hooks/use-notes.test.ts --no-coverage
```

Expected: All tests pass.

**Hono RPC type verification:** The mock in the test assumes the RPC client shape `client.subjects[':subjectId'].books[':bookId'].notes.$get()`. This depends on how Hono merges types when routes are mounted via `.route('/', noteRoutes)`. If the TypeScript compiler rejects the hook code, inspect the actual inferred RPC type by hovering over `client` in the IDE and adjust the property path accordingly. The test mock must match the real client shape.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/hooks/use-notes.ts apps/mobile/src/hooks/use-notes.test.ts
git commit -m "feat(mobile): useBookNotes, useUpsertNote, useDeleteNote hooks [7.9]"
```

---

## Task 5: Mobile — CollapsibleChapter component

**Files:**
- Create: `apps/mobile/src/components/library/CollapsibleChapter.tsx`
- Create: `apps/mobile/src/components/library/CollapsibleChapter.test.tsx`

- [ ] **Step 1: Write the test**

Create `apps/mobile/src/components/library/CollapsibleChapter.test.tsx`:

```typescript
import { render, fireEvent } from '@testing-library/react-native';
import { CollapsibleChapter } from './CollapsibleChapter';

const mockTopics = [
  { id: 'topic-1', title: 'The Nile', sortOrder: 0, skipped: false },
  { id: 'topic-2', title: 'Geography', sortOrder: 1, skipped: false },
  { id: 'topic-3', title: 'Climate', sortOrder: 2, skipped: true },
];

describe('CollapsibleChapter', () => {
  it('renders chapter header with title and count', () => {
    const { getByText } = render(
      <CollapsibleChapter
        title="The Land"
        topics={mockTopics}
        completedCount={1}
        initiallyExpanded
        onTopicPress={jest.fn()}
      />,
    );

    expect(getByText(/The Land/)).toBeTruthy();
    expect(getByText(/1\/3/)).toBeTruthy();
  });

  it('shows topics when expanded', () => {
    const { getByText } = render(
      <CollapsibleChapter
        title="The Land"
        topics={mockTopics}
        completedCount={0}
        initiallyExpanded
        onTopicPress={jest.fn()}
      />,
    );

    expect(getByText('The Nile')).toBeTruthy();
    expect(getByText('Geography')).toBeTruthy();
  });

  it('hides topics when collapsed', () => {
    const { queryByText } = render(
      <CollapsibleChapter
        title="The Land"
        topics={mockTopics}
        completedCount={0}
        initiallyExpanded={false}
        onTopicPress={jest.fn()}
      />,
    );

    expect(queryByText('The Nile')).toBeNull();
  });

  it('toggles on header press', () => {
    const { getByTestId, queryByText } = render(
      <CollapsibleChapter
        title="The Land"
        topics={mockTopics}
        completedCount={0}
        initiallyExpanded={false}
        onTopicPress={jest.fn()}
      />,
    );

    fireEvent.press(getByTestId('chapter-header-The Land'));
    expect(queryByText('The Nile')).toBeTruthy();
  });

  it('calls onTopicPress with topic id', () => {
    const onPress = jest.fn();
    const { getByText } = render(
      <CollapsibleChapter
        title="The Land"
        topics={mockTopics}
        completedCount={0}
        initiallyExpanded
        onTopicPress={onPress}
      />,
    );

    fireEvent.press(getByText('The Nile'));
    expect(onPress).toHaveBeenCalledWith('topic-1', 'The Nile');
  });

  it('shows note icon when topic has a note', () => {
    const { getByTestId } = render(
      <CollapsibleChapter
        title="The Land"
        topics={mockTopics}
        completedCount={0}
        initiallyExpanded
        onTopicPress={jest.fn()}
        noteTopicIds={new Set(['topic-1'])}
        onNotePress={jest.fn()}
      />,
    );

    expect(getByTestId('note-icon-topic-1')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd apps/mobile && pnpm exec jest --findRelatedTests src/components/library/CollapsibleChapter.test.tsx --no-coverage
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write the component**

Create `apps/mobile/src/components/library/CollapsibleChapter.tsx`:

```tsx
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { RetentionStatus } from '../progress';
import { RetentionSignal } from '../progress/RetentionSignal';
import { useThemeColors } from '../../lib/theme';

interface ChapterTopic {
  id: string;
  title: string;
  sortOrder: number;
  skipped: boolean;
}

interface CollapsibleChapterProps {
  title: string;
  topics: ChapterTopic[];
  completedCount: number;
  initiallyExpanded: boolean;
  suggestedNextId?: string;
  onTopicPress: (topicId: string, topicName: string) => void;
  noteTopicIds?: Set<string>;
  onNotePress?: (topicId: string) => void;
  topicRetention?: Record<string, RetentionStatus>;
}

export function CollapsibleChapter({
  title,
  topics,
  completedCount,
  initiallyExpanded,
  suggestedNextId,
  onTopicPress,
  noteTopicIds,
  onNotePress,
  topicRetention,
}: CollapsibleChapterProps): React.ReactElement {
  const [expanded, setExpanded] = useState(initiallyExpanded);
  const colors = useThemeColors();
  const totalCount = topics.filter((t) => !t.skipped).length;
  const allComplete = completedCount >= totalCount && totalCount > 0;

  return (
    <View className="mb-2">
      {/* Chapter header */}
      <Pressable
        testID={`chapter-header-${title}`}
        className="flex-row items-center justify-between bg-surface-elevated rounded-lg px-4 py-3"
        onPress={() => setExpanded((prev) => !prev)}
      >
        <View className="flex-row items-center flex-1">
          <Ionicons
            name={expanded ? 'chevron-down' : 'chevron-forward'}
            size={16}
            color={colors.textSecondary}
          />
          <Text className="text-body font-semibold text-text-primary ml-2 flex-1">
            {title}
          </Text>
          {allComplete && (
            <Ionicons name="checkmark-circle" size={16} color={colors.success} />
          )}
        </View>
        <Text className="text-caption text-text-secondary ml-2">
          {completedCount}/{totalCount}
        </Text>
      </Pressable>

      {/* Topic list */}
      {expanded && (
        <View className="mt-1 ml-4">
          {topics
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map((topic) => {
              const isSuggested = topic.id === suggestedNextId;
              const hasNote = noteTopicIds?.has(topic.id);
              const retention = topicRetention?.[topic.id];

              return (
                <Pressable
                  key={topic.id}
                  testID={`topic-row-${topic.id}`}
                  className={`flex-row items-center px-3 py-2.5 rounded-md mb-0.5 ${
                    isSuggested ? 'bg-primary/5' : ''
                  } ${topic.skipped ? 'opacity-50' : ''}`}
                  onPress={() => onTopicPress(topic.id, topic.title)}
                >
                  <Text className="text-caption text-text-secondary w-6">
                    {topic.sortOrder + 1}.
                  </Text>
                  <Text className="text-body text-text-primary flex-1">
                    {topic.title}
                  </Text>
                  {isSuggested && (
                    <Text className="text-caption font-semibold text-primary mr-2">
                      Next
                    </Text>
                  )}
                  {retention && (
                    <View className="mr-1">
                      <RetentionSignal status={retention} compact />
                    </View>
                  )}
                  {hasNote && (
                    <Pressable
                      testID={`note-icon-${topic.id}`}
                      onPress={() => {
                        // Note: React Native Pressable doesn't support stopPropagation.
                        // The parent Pressable won't fire because this Pressable
                        // consumes the touch event natively (nested Pressable behavior).
                        onNotePress?.(topic.id);
                      }}
                      hitSlop={8}
                    >
                      <Ionicons name="document-text" size={16} color={colors.primary} />
                    </Pressable>
                  )}
                </Pressable>
              );
            })}
        </View>
      )}
    </View>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
cd apps/mobile && pnpm exec jest --findRelatedTests src/components/library/CollapsibleChapter.test.tsx --no-coverage
```

Expected: All 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/components/library/CollapsibleChapter.tsx apps/mobile/src/components/library/CollapsibleChapter.test.tsx
git commit -m "feat(mobile): CollapsibleChapter component with note icon [7.8]"
```

---

## Task 6: Mobile — NoteInput + NoteDisplay components

**Files:**
- Create: `apps/mobile/src/components/library/NoteInput.tsx`
- Create: `apps/mobile/src/components/library/NoteInput.test.tsx`
- Create: `apps/mobile/src/components/library/NoteDisplay.tsx`
- Create: `apps/mobile/src/components/library/NoteDisplay.test.tsx`

- [ ] **Step 1: Write NoteDisplay test**

Create `apps/mobile/src/components/library/NoteDisplay.test.tsx`:

```typescript
import { render, fireEvent } from '@testing-library/react-native';
import { NoteDisplay } from './NoteDisplay';

describe('NoteDisplay', () => {
  it('shows note content', () => {
    const { getByText } = render(
      <NoteDisplay
        content="Pyramids are tombs for pharaohs"
        onEdit={jest.fn()}
        onDelete={jest.fn()}
      />,
    );
    expect(getByText('Pyramids are tombs for pharaohs')).toBeTruthy();
  });

  it('shows edit and delete buttons', () => {
    const { getByTestId } = render(
      <NoteDisplay
        content="Some note"
        onEdit={jest.fn()}
        onDelete={jest.fn()}
      />,
    );
    expect(getByTestId('note-edit-button')).toBeTruthy();
    expect(getByTestId('note-delete-button')).toBeTruthy();
  });

  it('hides edit/delete in read-only mode', () => {
    const { queryByTestId } = render(
      <NoteDisplay content="Some note" readOnly />,
    );
    expect(queryByTestId('note-edit-button')).toBeNull();
    expect(queryByTestId('note-delete-button')).toBeNull();
  });

  it('renders session separators as visual dividers', () => {
    const content = 'First note\n--- Apr 5 ---\nSecond note';
    const { getByText } = render(
      <NoteDisplay content={content} readOnly />,
    );
    expect(getByText('Apr 5')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Write NoteDisplay component**

Create `apps/mobile/src/components/library/NoteDisplay.tsx`:

```tsx
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '../../lib/theme';

interface NoteDisplayProps {
  content: string;
  readOnly?: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
}

const SESSION_SEPARATOR_REGEX = /^--- (.+) ---$/;

export function NoteDisplay({
  content,
  readOnly,
  onEdit,
  onDelete,
}: NoteDisplayProps): React.ReactElement {
  const colors = useThemeColors();

  // Split content into segments, rendering session separators as styled dividers
  const segments = content.split('\n');

  return (
    <View className="bg-surface rounded-lg px-3 py-2 mt-1 mb-2">
      <View>
        {segments.map((line, i) => {
          const separatorMatch = line.match(SESSION_SEPARATOR_REGEX);
          if (separatorMatch) {
            return (
              <View
                key={i}
                className="flex-row items-center my-1.5"
              >
                <View className="flex-1 h-px bg-border" />
                <Text className="text-caption text-text-secondary mx-2">
                  {separatorMatch[1]}
                </Text>
                <View className="flex-1 h-px bg-border" />
              </View>
            );
          }
          if (line.trim() === '') return null;
          return (
            <Text key={i} className="text-body text-text-primary leading-5">
              {line}
            </Text>
          );
        })}
      </View>

      {!readOnly && (
        <View className="flex-row justify-end mt-2 gap-3">
          <Pressable
            testID="note-edit-button"
            onPress={onEdit}
            className="flex-row items-center"
            hitSlop={8}
          >
            <Ionicons name="pencil" size={14} color={colors.primary} />
            <Text className="text-caption text-primary ml-1">Edit</Text>
          </Pressable>
          <Pressable
            testID="note-delete-button"
            onPress={onDelete}
            className="flex-row items-center"
            hitSlop={8}
          >
            <Ionicons name="trash-outline" size={14} color={colors.error} />
            <Text className="text-caption text-error ml-1">Delete</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}
```

- [ ] **Step 3: Write NoteInput test**

Create `apps/mobile/src/components/library/NoteInput.test.tsx`:

```typescript
import { render, fireEvent } from '@testing-library/react-native';
import { NoteInput } from './NoteInput';

// Mock speech recognition
jest.mock('../../hooks/use-speech-recognition', () => ({
  useSpeechRecognition: () => ({
    status: 'idle',
    transcript: '',
    isListening: false,
    startListening: jest.fn(),
    stopListening: jest.fn(),
    clearTranscript: jest.fn(),
  }),
}));

describe('NoteInput', () => {
  it('renders text input and buttons', () => {
    const { getByTestId, getByText } = render(
      <NoteInput onSave={jest.fn()} onCancel={jest.fn()} />,
    );
    expect(getByTestId('note-text-input')).toBeTruthy();
    expect(getByText('Save')).toBeTruthy();
    expect(getByText('Cancel')).toBeTruthy();
  });

  it('calls onSave with text content', () => {
    const onSave = jest.fn();
    const { getByTestId, getByText } = render(
      <NoteInput onSave={onSave} onCancel={jest.fn()} />,
    );

    fireEvent.changeText(getByTestId('note-text-input'), 'My note about pyramids');
    fireEvent.press(getByText('Save'));
    expect(onSave).toHaveBeenCalledWith('My note about pyramids');
  });

  it('calls onCancel when cancel pressed', () => {
    const onCancel = jest.fn();
    const { getByText } = render(
      <NoteInput onSave={jest.fn()} onCancel={onCancel} />,
    );

    fireEvent.press(getByText('Cancel'));
    expect(onCancel).toHaveBeenCalled();
  });

  it('shows initial value when provided', () => {
    const { getByTestId } = render(
      <NoteInput
        onSave={jest.fn()}
        onCancel={jest.fn()}
        initialValue="Existing note"
      />,
    );
    expect(getByTestId('note-text-input').props.value).toBe('Existing note');
  });

  it('shows character count nudge near limit', () => {
    const longText = 'a'.repeat(1900);
    const { getByTestId, getByText } = render(
      <NoteInput onSave={jest.fn()} onCancel={jest.fn()} />,
    );
    fireEvent.changeText(getByTestId('note-text-input'), longText);
    expect(getByText(/getting long/i)).toBeTruthy();
  });
});
```

- [ ] **Step 4: Write NoteInput component**

Create `apps/mobile/src/components/library/NoteInput.tsx`:

```tsx
import { useState, useEffect, useRef } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSpeechRecognition } from '../../hooks/use-speech-recognition';
import { useThemeColors } from '../../lib/theme';

const SOFT_LIMIT = 2000;
const WARN_THRESHOLD = 1800;

interface NoteInputProps {
  onSave: (content: string) => void;
  onCancel: () => void;
  initialValue?: string;
  saving?: boolean;
}

export function NoteInput({
  onSave,
  onCancel,
  initialValue = '',
  saving = false,
}: NoteInputProps): React.ReactElement {
  const [text, setText] = useState(initialValue);
  const colors = useThemeColors();
  const wasListening = useRef(false);
  const {
    status,
    transcript,
    isListening,
    startListening,
    stopListening,
    clearTranscript,
  } = useSpeechRecognition();

  // Append transcript to text when listening stops and final transcript arrives.
  // This avoids the race condition of reading transcript synchronously after stopListening(),
  // since transcription completes asynchronously via state update.
  useEffect(() => {
    if (wasListening.current && !isListening && transcript) {
      setText((prev) => (prev ? `${prev} ${transcript}` : transcript));
      clearTranscript();
    }
    wasListening.current = isListening;
  }, [isListening, transcript, clearTranscript]);

  const handleMicPress = () => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  };

  const handleSave = () => {
    const trimmed = text.trim();
    if (trimmed) {
      onSave(trimmed);
    }
  };

  const showWarning = text.length >= WARN_THRESHOLD;

  return (
    <View className="bg-surface-elevated rounded-lg p-3 mt-1 mb-2">
      <View className="flex-row items-start">
        <TextInput
          testID="note-text-input"
          className="flex-1 text-body text-text-primary min-h-[60px] p-0"
          placeholder="Write your note..."
          placeholderTextColor={colors.textSecondary}
          value={text}
          onChangeText={setText}
          multiline
          textAlignVertical="top"
          maxLength={SOFT_LIMIT + 200}
        />
        <Pressable
          testID="note-mic-button"
          onPress={handleMicPress}
          className="ml-2 p-2"
          hitSlop={8}
        >
          <Ionicons
            name={isListening ? 'mic' : 'mic-outline'}
            size={22}
            color={isListening ? colors.error : colors.primary}
          />
        </Pressable>
      </View>

      {isListening && (
        <Text className="text-caption text-primary mt-1">Listening...</Text>
      )}
      {status === 'processing' && (
        <Text className="text-caption text-text-secondary mt-1">
          Processing...
        </Text>
      )}

      {showWarning && (
        <Text className="text-caption text-warning mt-1">
          Your note is getting long! ({text.length}/{SOFT_LIMIT})
        </Text>
      )}

      <View className="flex-row justify-end mt-2 gap-3">
        <Pressable onPress={onCancel} className="px-3 py-1.5" hitSlop={8}>
          <Text className="text-body text-text-secondary">Cancel</Text>
        </Pressable>
        <Pressable
          onPress={handleSave}
          disabled={!text.trim() || saving}
          className="bg-primary px-4 py-1.5 rounded-md"
        >
          <Text className="text-body text-white font-semibold">
            {saving ? 'Saving...' : 'Save'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
```

- [ ] **Step 5: Run all component tests**

Run:

```bash
cd apps/mobile && pnpm exec jest --findRelatedTests src/components/library/NoteDisplay.test.tsx src/components/library/NoteInput.test.tsx --no-coverage
```

Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/components/library/NoteInput.tsx apps/mobile/src/components/library/NoteInput.test.tsx apps/mobile/src/components/library/NoteDisplay.tsx apps/mobile/src/components/library/NoteDisplay.test.tsx
git commit -m "feat(mobile): NoteInput (voice+text) and NoteDisplay components [7.9]"
```

---

## Task 7: Mobile — Shelf screen + parent re-export

**Files:**
- Create: `apps/mobile/src/app/(learner)/shelf/[subjectId]/_layout.tsx`
- Create: `apps/mobile/src/app/(learner)/shelf/[subjectId]/index.tsx`
- Create: `apps/mobile/src/app/(parent)/shelf/[subjectId]/_layout.tsx`
- Create: `apps/mobile/src/app/(parent)/shelf/[subjectId]/index.tsx`

- [ ] **Step 1: Create Stack layout for shelf routes**

Create `apps/mobile/src/app/(learner)/shelf/[subjectId]/_layout.tsx`:

```tsx
import { Stack } from 'expo-router';

export default function ShelfLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
```

- [ ] **Step 2: Create the Shelf screen**

Create `apps/mobile/src/app/(learner)/shelf/[subjectId]/index.tsx`:

```tsx
import { useEffect, useMemo } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { CurriculumBook, BookProgressStatus } from '@eduagent/schemas';
import { BookCard } from '../../../../components/library/BookCard';
import {
  BookPageFlipAnimation,
} from '../../../../components/common';
import { useBooks } from '../../../../hooks/use-books';
import { useSubjects } from '../../../../hooks/use-subjects';
import { useOverallProgress } from '../../../../hooks/use-progress';
import { useThemeColors } from '../../../../lib/theme';

function computeSuggestedBookId(
  books: CurriculumBook[],
  summaries: Record<string, { status: BookProgressStatus }>,
): string | undefined {
  // First IN_PROGRESS, then first NOT_STARTED
  const inProgress = books.find((b) => summaries[b.id]?.status === 'IN_PROGRESS');
  if (inProgress) return inProgress.id;
  const notStarted = books.find(
    (b) =>
      !summaries[b.id] ||
      summaries[b.id].status === 'NOT_STARTED',
  );
  return notStarted?.id;
}

export default function ShelfScreen() {
  const { subjectId } = useLocalSearchParams<{ subjectId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();

  const { data: subjects } = useSubjects();
  const subject = subjects?.find((s) => s.id === subjectId);
  const { data: books, isLoading, isError, refetch } = useBooks(subjectId);
  const { data: progress } = useOverallProgress();

  const subjectProgress = progress?.subjects?.find(
    (s: { subjectId: string }) => s.subjectId === subjectId,
  );

  // Build summary map (status per book)
  const bookSummaries = useMemo(() => {
    const map: Record<string, { status: BookProgressStatus; topicCount: number; completedCount: number }> = {};
    if (books) {
      for (const book of books) {
        map[book.id] = {
          status: book.topicsGenerated ? 'IN_PROGRESS' : 'NOT_STARTED',
          topicCount: 0,
          completedCount: 0,
        };
      }
    }
    return map;
  }, [books]);

  const suggestedBookId = useMemo(
    () => (books ? computeSuggestedBookId(books, bookSummaries) : undefined),
    [books, bookSummaries],
  );

  // Single-book auto-skip: navigate directly to book screen
  useEffect(() => {
    if (books && books.length === 1 && subjectId) {
      router.replace({
        pathname: '/(learner)/shelf/[subjectId]/book/[bookId]',
        params: { subjectId, bookId: books[0].id },
      });
    }
  }, [books, subjectId, router]);

  // Don't render shelf UI if auto-skipping
  if (books && books.length === 1) return null;

  if (isLoading) {
    return (
      <View className="flex-1 bg-background items-center justify-center" style={{ paddingTop: insets.top }}>
        <BookPageFlipAnimation />
        <Text className="text-body text-text-secondary mt-4">Loading this shelf...</Text>
      </View>
    );
  }

  if (isError) {
    return (
      <View className="flex-1 bg-background items-center justify-center" style={{ paddingTop: insets.top }}>
        <Text className="text-body text-text-secondary mb-4">
          Couldn't load this shelf
        </Text>
        <Pressable onPress={() => refetch()} className="bg-primary px-4 py-2 rounded-md">
          <Text className="text-body text-white font-semibold">Retry</Text>
        </Pressable>
      </View>
    );
  }

  const completedCount = subjectProgress?.topicsCompleted ?? 0;
  const totalCount = subjectProgress?.topicsTotal ?? 0;
  const progressPercent = totalCount > 0 ? completedCount / totalCount : 0;

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      {/* Header */}
      <View className="flex-row items-center justify-between px-4 py-3">
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </Pressable>
        <Pressable
          onPress={() =>
            router.push({
              pathname: '/(learner)/subject/[subjectId]',
              params: { subjectId: subjectId! },
            })
          }
          hitSlop={12}
        >
          <Ionicons name="settings-outline" size={22} color={colors.textSecondary} />
        </Pressable>
      </View>

      {/* Subject info */}
      <View className="px-4 pb-4">
        <Text className="text-title font-bold text-text-primary">
          {subject?.name ?? 'Subject'}
        </Text>
        {totalCount > 0 && (
          <>
            <View className="h-2 bg-surface-elevated rounded-full mt-2 overflow-hidden">
              <View
                className="h-full bg-primary rounded-full"
                style={{ width: `${progressPercent * 100}%` }}
              />
            </View>
            <Text className="text-caption text-text-secondary mt-1">
              {completedCount}/{totalCount} topics
            </Text>
          </>
        )}
      </View>

      {/* Book list */}
      <FlatList
        data={books ?? []}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
        renderItem={({ item }) => {
          const summary = bookSummaries[item.id];
          return (
            <BookCard
              book={item}
              status={summary?.status ?? 'NOT_STARTED'}
              topicCount={summary?.topicCount}
              completedCount={summary?.completedCount}
              highlighted={suggestedBookId === item.id}
              onPress={() =>
                router.push({
                  pathname: '/(learner)/shelf/[subjectId]/book/[bookId]',
                  params: { subjectId: subjectId!, bookId: item.id },
                })
              }
            />
          );
        }}
        ListEmptyComponent={
          <View className="bg-surface rounded-card px-4 py-6 items-center">
            <Text className="text-body text-text-secondary">
              No books on this shelf yet.
            </Text>
          </View>
        }
      />
    </View>
  );
}
```

- [ ] **Step 3: Create parent re-exports**

Create `apps/mobile/src/app/(parent)/shelf/[subjectId]/_layout.tsx`:

```tsx
export { default } from '../../../(learner)/shelf/[subjectId]/_layout';
```

Create `apps/mobile/src/app/(parent)/shelf/[subjectId]/index.tsx`:

```tsx
export { default } from '../../../(learner)/shelf/[subjectId]/index';
```

**Re-export path verification:** These multi-level relative paths through Expo Router group directories are fragile. After creating them, verify the app builds and the parent routes resolve:

```bash
cd apps/mobile && pnpm exec expo export --platform android --dump-sourcemap 2>&1 | head -5
```

If the re-exports fail to resolve, switch to a shared component approach: extract the screen content into `apps/mobile/src/screens/ShelfScreen.tsx` and import it from both route files directly.

- [ ] **Step 4: Typecheck**

Run:

```bash
cd apps/mobile && pnpm exec tsc --noEmit
```

Expected: Clean pass.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/app/(learner)/shelf/ apps/mobile/src/app/(parent)/shelf/
git commit -m "feat(mobile): Shelf screen with auto-skip for single-book subjects [7.8]"
```

---

## Task 8: Mobile — Book screen + parent re-export

**Files:**
- Create: `apps/mobile/src/app/(learner)/shelf/[subjectId]/book/[bookId].tsx`
- Create: `apps/mobile/src/app/(parent)/shelf/[subjectId]/book/[bookId].tsx`

- [ ] **Step 1: Create the Book screen**

Create `apps/mobile/src/app/(learner)/shelf/[subjectId]/book/[bookId].tsx`:

```tsx
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { CurriculumTopic } from '@eduagent/schemas';
import type { RetentionStatus } from '../../../../components/progress';
import {
  BookPageFlipAnimation,
  BrandCelebration,
  PenWritingAnimation,
} from '../../../../components/common';
import { CollapsibleChapter } from '../../../../components/library/CollapsibleChapter';
import { NoteDisplay } from '../../../../components/library/NoteDisplay';
import { NoteInput } from '../../../../components/library/NoteInput';
import {
  useBookWithTopics,
  useGenerateBookTopics,
} from '../../../../hooks/use-books';
import { useBookNotes, useUpsertNote, useDeleteNote } from '../../../../hooks/use-notes';
import { useThemeColors } from '../../../../lib/theme';
import { formatApiError } from '../../../../lib/format-api-error';

type GenerationState = 'idle' | 'slow' | 'timed_out';

function groupTopicsByChapter(topics: CurriculumTopic[]) {
  const chapters = new Map<string, CurriculumTopic[]>();
  for (const topic of topics) {
    const key = topic.chapter ?? 'Topics';
    const group = chapters.get(key) ?? [];
    group.push(topic);
    chapters.set(key, group);
  }
  return chapters;
}

function findSuggestedNext(topics: CurriculumTopic[], completedIds: Set<string>): string | undefined {
  const sorted = [...topics].sort((a, b) => a.sortOrder - b.sortOrder);
  const next = sorted.find((t) => !t.skipped && !completedIds.has(t.id));
  return next?.id;
}

export default function BookScreen() {
  const { subjectId, bookId } = useLocalSearchParams<{
    subjectId: string;
    bookId: string;
  }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();

  // Data
  const bookQuery = useBookWithTopics(subjectId, bookId);
  const notesQuery = useBookNotes(subjectId, bookId);
  const generateMutation = useGenerateBookTopics(subjectId, bookId);
  const upsertMutation = useUpsertNote(subjectId, bookId);
  const deleteMutation = useDeleteNote(subjectId, bookId);

  // Generation state
  const [genState, setGenState] = useState<GenerationState>('idle');
  const alreadyPending = useRef(false);
  const slowTimer = useRef<ReturnType<typeof setTimeout>>();
  const timeoutTimer = useRef<ReturnType<typeof setTimeout>>();

  // Note editing state
  const [expandedNoteTopicId, setExpandedNoteTopicId] = useState<string | null>(null);
  const [editingNoteTopicId, setEditingNoteTopicId] = useState<string | null>(null);

  const book = bookQuery.data?.book;
  const topics = bookQuery.data?.topics ?? [];
  const completedTopicCount = bookQuery.data?.completedTopicCount ?? 0;
  const bookStatus = bookQuery.data?.status ?? 'NOT_STARTED';

  // Auto-trigger generation for un-generated books
  useEffect(() => {
    if (
      book &&
      !book.topicsGenerated &&
      !alreadyPending.current &&
      !generateMutation.isPending
    ) {
      alreadyPending.current = true;
      setGenState('idle');

      slowTimer.current = setTimeout(() => setGenState('slow'), 30_000);
      timeoutTimer.current = setTimeout(() => setGenState('timed_out'), 60_000);

      generateMutation.mutate(undefined, {
        onSuccess: () => {
          clearTimeout(slowTimer.current);
          clearTimeout(timeoutTimer.current);
          setGenState('idle');
        },
        onError: (err) => {
          clearTimeout(slowTimer.current);
          clearTimeout(timeoutTimer.current);
          setGenState('idle');
          Alert.alert('Could not generate topics', formatApiError(err));
        },
      });
    }

    return () => {
      clearTimeout(slowTimer.current);
      clearTimeout(timeoutTimer.current);
    };
  }, [book]);

  // Derived data
  const chapters = useMemo(() => groupTopicsByChapter(topics), [topics]);
  const completedIds = useMemo(() => {
    // Topics with at least one session are "completed" for suggestion purposes
    const ids = new Set<string>();
    // completedTopicCount tells us how many are done, but we need IDs
    // For now, mark first N by sortOrder as complete (approximation)
    const sorted = [...topics].sort((a, b) => a.sortOrder - b.sortOrder);
    for (let i = 0; i < completedTopicCount && i < sorted.length; i++) {
      ids.add(sorted[i].id);
    }
    return ids;
  }, [topics, completedTopicCount]);

  const suggestedNextId = useMemo(
    () => findSuggestedNext(topics, completedIds),
    [topics, completedIds],
  );

  const noteMap = useMemo(() => {
    const map = new Map<string, { content: string; updatedAt: string }>();
    for (const note of notesQuery.data?.notes ?? []) {
      map.set(note.topicId, { content: note.content, updatedAt: note.updatedAt });
    }
    return map;
  }, [notesQuery.data]);

  const noteTopicIds = useMemo(
    () => new Set(noteMap.keys()),
    [noteMap],
  );

  const handleTopicPress = (topicId: string, _topicName: string) => {
    router.push({
      pathname: '/(learner)/session',
      params: { mode: 'learning', subjectId: subjectId!, topicId },
    } as never);
  };

  const handleNoteSave = (topicId: string, content: string) => {
    upsertMutation.mutate(
      { topicId, content },
      {
        onSuccess: () => {
          setEditingNoteTopicId(null);
        },
        onError: (err) => {
          Alert.alert("Couldn't save your note", formatApiError(err));
        },
      },
    );
  };

  const handleNoteDelete = (topicId: string) => {
    Alert.alert('Delete note?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          deleteMutation.mutate(topicId, {
            onSuccess: () => {
              setExpandedNoteTopicId(null);
              setEditingNoteTopicId(null);
            },
            onError: (err) => {
              Alert.alert("Couldn't delete note", formatApiError(err));
            },
          });
        },
      },
    ]);
  };

  // --- RENDER ---

  // Loading
  if (bookQuery.isLoading && !book) {
    return (
      <View className="flex-1 bg-background items-center justify-center" style={{ paddingTop: insets.top }}>
        <BookPageFlipAnimation />
      </View>
    );
  }

  // Error
  if (bookQuery.isError && !book) {
    return (
      <View className="flex-1 bg-background items-center justify-center" style={{ paddingTop: insets.top }}>
        <Text className="text-body text-text-secondary mb-4">
          Couldn't load this book
        </Text>
        <Pressable onPress={() => bookQuery.refetch()} className="bg-primary px-4 py-2 rounded-md">
          <Text className="text-body text-white font-semibold">Retry</Text>
        </Pressable>
        <Pressable onPress={() => router.back()} className="mt-3">
          <Text className="text-body text-text-secondary">Go back</Text>
        </Pressable>
      </View>
    );
  }

  // Generation in progress
  const isGenerating = book && !book.topicsGenerated;
  if (isGenerating) {
    return (
      <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
        <Pressable onPress={() => router.back()} className="px-4 py-3" hitSlop={12}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </Pressable>
        <View className="flex-1 items-center justify-center px-6">
          {book.emoji && (
            <Text className="text-3xl mb-2">{book.emoji}</Text>
          )}
          <Text className="text-title font-bold text-text-primary text-center mb-2">
            {book.title}
          </Text>
          {book.description && (
            <Text className="text-body text-text-secondary text-center mb-6">
              {book.description}
            </Text>
          )}
          {genState === 'timed_out' ? (
            <>
              <Text className="text-body text-text-secondary text-center mb-4">
                Couldn't finish this book right now
              </Text>
              <Pressable
                onPress={() => {
                  alreadyPending.current = false;
                  setGenState('idle');
                }}
                className="bg-primary px-4 py-2 rounded-md"
              >
                <Text className="text-body text-white font-semibold">Retry</Text>
              </Pressable>
            </>
          ) : (
            <>
              <PenWritingAnimation />
              <Text className="text-body text-text-secondary mt-4">
                Writing your book...
              </Text>
              {genState === 'slow' && (
                <Text className="text-caption text-text-secondary mt-2">
                  Taking a little longer than usual...
                </Text>
              )}
            </>
          )}
        </View>
      </View>
    );
  }

  // Topics loaded — main view
  const allComplete = bookStatus === 'COMPLETED';
  const chapterEntries = Array.from(chapters.entries());
  let firstIncompleteChapter: string | undefined;
  for (const [chapterTitle, chapterTopics] of chapterEntries) {
    if (chapterTopics.some((t) => !t.skipped && !completedIds.has(t.id))) {
      firstIncompleteChapter = chapterTitle;
      break;
    }
  }

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      {/* Header */}
      <View className="flex-row items-center px-4 py-3">
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </Pressable>
        <Text className="text-body text-text-secondary ml-auto">
          {/* Parent subject name from subjects query could be added */}
        </Text>
      </View>

      <ScrollView className="flex-1" contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}>
        {/* Book info */}
        <View className="mb-4">
          {book?.emoji && (
            <Text className="text-2xl mb-1">{book.emoji}</Text>
          )}
          <Text className="text-title font-bold text-text-primary">
            {book?.title}
          </Text>
          {topics.length > 0 && (
            <>
              <View className="h-2 bg-surface-elevated rounded-full mt-2 overflow-hidden">
                <View
                  className="h-full bg-primary rounded-full"
                  style={{
                    width: `${topics.length > 0 ? (completedTopicCount / topics.length) * 100 : 0}%`,
                  }}
                />
              </View>
              <Text className="text-caption text-text-secondary mt-1">
                {completedTopicCount}/{topics.length} topics
              </Text>
            </>
          )}
        </View>

        {/* Celebration */}
        {allComplete && (
          <View className="bg-success/10 rounded-lg px-4 py-3 mb-4">
            <Text className="text-body font-semibold text-success">
              You've covered everything here!
            </Text>
          </View>
        )}

        {/* Continue CTA */}
        {suggestedNextId && !allComplete && (
          <Pressable
            className="bg-primary/10 rounded-lg px-4 py-3 mb-4 flex-row items-center"
            onPress={() => {
              const topic = topics.find((t) => t.id === suggestedNextId);
              if (topic) handleTopicPress(topic.id, topic.title);
            }}
          >
            <Ionicons name="play-circle" size={20} color={colors.primary} />
            <Text className="text-body font-semibold text-primary ml-2">
              Continue: {topics.find((t) => t.id === suggestedNextId)?.title}
            </Text>
          </Pressable>
        )}

        {/* Chapters */}
        {chapterEntries.map(([chapterTitle, chapterTopics]) => {
          const chapterCompleted = chapterTopics.filter(
            (t) => !t.skipped && completedIds.has(t.id),
          ).length;

          return (
            <View key={chapterTitle}>
              <CollapsibleChapter
                title={chapterTitle}
                topics={chapterTopics.map((t) => ({
                  id: t.id,
                  title: t.title,
                  sortOrder: t.sortOrder,
                  skipped: t.skipped,
                }))}
                completedCount={chapterCompleted}
                initiallyExpanded={chapterTitle === firstIncompleteChapter}
                suggestedNextId={suggestedNextId}
                onTopicPress={handleTopicPress}
                noteTopicIds={noteTopicIds}
                onNotePress={(topicId) =>
                  setExpandedNoteTopicId(
                    expandedNoteTopicId === topicId ? null : topicId,
                  )
                }
              />

              {/* Inline note display for expanded topic */}
              {chapterTopics.map((t) => {
                if (t.id !== expandedNoteTopicId) return null;
                const note = noteMap.get(t.id);
                if (editingNoteTopicId === t.id) {
                  return (
                    <NoteInput
                      key={`edit-${t.id}`}
                      initialValue={note?.content ?? ''}
                      onSave={(content) => handleNoteSave(t.id, content)}
                      onCancel={() => setEditingNoteTopicId(null)}
                      saving={upsertMutation.isPending}
                    />
                  );
                }
                if (note) {
                  return (
                    <NoteDisplay
                      key={`note-${t.id}`}
                      content={note.content}
                      onEdit={() => setEditingNoteTopicId(t.id)}
                      onDelete={() => handleNoteDelete(t.id)}
                    />
                  );
                }
                // No note yet — show input to create
                return (
                  <NoteInput
                    key={`new-${t.id}`}
                    onSave={(content) => handleNoteSave(t.id, content)}
                    onCancel={() => setExpandedNoteTopicId(null)}
                    saving={upsertMutation.isPending}
                  />
                );
              })}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}
```

- [ ] **Step 2: Create parent re-export**

Create `apps/mobile/src/app/(parent)/shelf/[subjectId]/book/[bookId].tsx`:

```tsx
export { default } from '../../../../(learner)/shelf/[subjectId]/book/[bookId]';
```

- [ ] **Step 3: Typecheck**

Run:

```bash
cd apps/mobile && pnpm exec tsc --noEmit
```

Expected: Clean pass.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/app/(learner)/shelf/[subjectId]/book/ apps/mobile/src/app/(parent)/shelf/[subjectId]/book/
git commit -m "feat(mobile): Book screen with collapsible chapters, notes, generation [7.8]"
```

---

## Task 9: Mobile — Library screen simplification

**Files:**
- Modify: `apps/mobile/src/app/(learner)/library.tsx`
- Modify: `apps/mobile/src/lib/library-filters.ts:83-88`
- Modify: `apps/mobile/src/components/library/TopicsTab.tsx`
- Delete: `apps/mobile/src/components/library/ShelfView.tsx`
- Delete: `apps/mobile/src/components/library/ChapterTopicList.tsx`

- [ ] **Step 1: Add hasNotes to TopicsFilters and EnrichedTopic**

In `apps/mobile/src/lib/library-filters.ts`, add `hasNotes` to `TopicsFilters` (line 87):

Change:

```typescript
export interface TopicsFilters {
  subjectIds: string[];
  bookIds: string[];
  retention: RetentionStatus[];
  needsAttention: boolean;
}
```

to:

```typescript
export interface TopicsFilters {
  subjectIds: string[];
  bookIds: string[];
  retention: RetentionStatus[];
  needsAttention: boolean;
  hasNotes: boolean;
}
```

Also add `hasNote` to `EnrichedTopic` (after `failureCount` at line ~73):

```typescript
  hasNote: boolean;
```

Then add a filter function (at the bottom of the file, before the closing):

```typescript
export function filterTopicsByNotes(
  topics: EnrichedTopic[],
  hasNotes: boolean,
): EnrichedTopic[] {
  if (!hasNotes) return topics;
  return topics.filter((t) => t.hasNote);
}
```

- [ ] **Step 2: Update TopicsTab to support hasNotes filter**

In `apps/mobile/src/components/library/TopicsTab.tsx`, add the "Has notes" filter chip to the filter configuration. Find the filter groups array and add:

```typescript
{
  key: 'hasNotes',
  label: 'Has notes',
  type: 'toggle' as const,
}
```

Apply the filter in the `useMemo` that computes filtered topics:

```typescript
// After existing filters, add:
if (filters.hasNotes) {
  filtered = filterTopicsByNotes(filtered, true);
}
```

In `TopicsTab.tsx`, update the initial state export:

```typescript
// Change TOPICS_TAB_INITIAL_STATE filters from:
export const TOPICS_TAB_INITIAL_STATE: TopicsTabState = {
  search: '',
  sortKey: 'name-asc',
  filters: { subjectIds: [], bookIds: [], retention: [], needsAttention: false },
};
// To:
export const TOPICS_TAB_INITIAL_STATE: TopicsTabState = {
  search: '',
  sortKey: 'name-asc',
  filters: { subjectIds: [], bookIds: [], retention: [], needsAttention: false, hasNotes: false },
};
```

In `library.tsx`, import `useNoteTopicIds` and pass the set to `TopicsTab`:

```typescript
import { useNoteTopicIds } from '../../hooks/use-notes';

// Inside the component, alongside other hooks:
const noteTopicIdsQuery = useNoteTopicIds();
const noteIdSet = useMemo(
  () => new Set(noteTopicIdsQuery.data?.topicIds ?? []),
  [noteTopicIdsQuery.data],
);

// Pass to TopicsTab:
<TopicsTab
  // ...existing props...
  noteTopicIds={noteIdSet}
/>
```

In `TopicsTab.tsx`, accept the new prop and populate `hasNote` on `EnrichedTopic`:

```typescript
interface TopicsTabProps {
  // ...existing props...
  noteTopicIds: Set<string>;
}

// In the useMemo that builds EnrichedTopic[], add hasNote:
const enrichedTopics = useMemo(() => {
  return rawTopics.map((t) => ({
    ...t,
    hasNote: noteTopicIds.has(t.topicId),
  }));
}, [rawTopics, noteTopicIds]);
```

Add the "Has notes" filter chip to the filter groups in `TopicsTab.tsx`:

```typescript
// In the filter configuration array, add:
{
  key: 'hasNotes',
  label: 'Has notes',
  options: [{ value: true, label: 'Has notes' }],
}
```

- [ ] **Step 3: Simplify library.tsx — remove drill-down, wire routes**

This is the largest edit. In `apps/mobile/src/app/(learner)/library.tsx`:

**Remove these imports:**
- `ShelfView` from `../../components/library/ShelfView`
- `ChapterTopicList` from `../../components/library/ChapterTopicList`
- `useBookWithTopics`, `useGenerateBookTopics` from `../../hooks/use-books`
- `combinedSignal` from `../../lib/query-timeout`
- `PenWritingAnimation` from `../../components/common`

**Remove these state variables:**
- `selectedSubjectId` + `setSelectedSubjectId`
- `selectedBookId` + `setSelectedBookId`
- `bookGenerationState` + `setBookGenerationState`

**Remove:**
- The entire generation `useEffect` (the one with slowTimer/timeoutTimer)
- The `useBookWithTopics(selectedSubjectId, selectedBookId)` query
- The `useGenerateBookTopics(selectedSubjectId, selectedBookId)` mutation
- The `useCurriculum(selectedSubjectId)` query (only needed for drill-down)
- All conditional rendering for drill-down levels (the blocks that check `selectedBookId` and `selectedSubjectId`)
- The back button logic for drill-down reversal

**Change callbacks:**
- `ShelvesTab.onShelfPress`: from `setSelectedSubjectId(id)` to:
  ```typescript
  router.push({
    pathname: '/(learner)/shelf/[subjectId]',
    params: { subjectId: id },
  })
  ```
- `BooksTab.onBookPress`: from `setSelectedBookId(bookId)` to:
  ```typescript
  router.push({
    pathname: '/(learner)/shelf/[subjectId]/book/[bookId]',
    params: { subjectId: book.subjectId, bookId: book.id },
  })
  ```
- `TopicsTab.onTopicPress`: keep existing navigation to topic session.

**Keep everything else:** tabs, search/sort/filter, useSubjects(), useAllBooks(), retention queries, subject management modal, empty states.

- [ ] **Step 4: Delete replaced components**

Delete:
- `apps/mobile/src/components/library/ShelfView.tsx`
- `apps/mobile/src/components/library/ChapterTopicList.tsx`

- [ ] **Step 5: Typecheck and lint**

Run:

```bash
cd apps/mobile && pnpm exec tsc --noEmit && pnpm exec nx lint mobile
```

Expected: Clean pass. Fix any remaining references to deleted components or removed state.

- [ ] **Step 6: Run all mobile tests**

Run:

```bash
cd apps/mobile && pnpm exec jest --no-coverage
```

Expected: All pass. Verified: no test files exist for ShelfView or ChapterTopicList (confirmed via glob search), so no test cleanup is needed when deleting those components.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor(mobile): simplify library.tsx, route-based navigation, hasNotes filter [7.8]"
```

---

## Task 10: Session — Note trigger integration

**Files:**
- Modify: `apps/api/src/services/exchanges.ts:393` (system prompt — add note trigger instruction)
- Modify: `apps/api/src/services/exchanges.ts:82-96` (ExchangeResult — add notePrompt field)
- Modify: `apps/api/src/routes/sessions.ts:185-191` (SSE done event — emit notePrompt)
- Modify: `apps/mobile/src/lib/sse.ts:16-40` (StreamDoneEvent — add notePrompt field)
- Modify: `apps/mobile/src/hooks/use-sessions.ts:260-328` (stream handler — pass notePrompt)
- Modify: `apps/mobile/src/app/(learner)/session/index.tsx` (note prompt UI)

- [ ] **Step 1: Add note trigger instruction to system prompt**

In `apps/api/src/services/exchanges.ts`, in the `buildSystemPrompt()` function, add this block before the "Prohibitions" section (around line 393):

```typescript
  // Knowledge capture prompt (note trigger)
  sections.push(`
KNOWLEDGE CAPTURE:
After the learner has exchanged at least 5 messages with you, if they give a correct answer where they explain something in their own words (not short factual recall like "yes", a number, or a single term), respond naturally to their answer and then ask: "Shall we put down this knowledge?"
When you ask this, append a JSON block at the very end of your response on its own line: {"notePrompt": true}
Only ask this ONCE per session. After asking once (whether the learner agrees or not), never ask again in this session.
At the end of the session, in your final closing message, ask: "Want to put down what you learned today?" and append: {"notePrompt": true, "postSession": true}
The JSON block will be stripped before the learner sees it — they will only see your conversational text.`);
```

This follows the same pattern as EVALUATE and TEACH_BACK modes which already use JSON annotation blocks in the LLM response (lines 351-380).

- [ ] **Step 2: Add notePrompt to ExchangeResult**

In `apps/api/src/services/exchanges.ts`, add to the `ExchangeResult` interface (line ~96):

```typescript
  notePrompt?: boolean;
  notePromptPostSession?: boolean;
```

In the response processing (inside `processExchange` or `streamExchange`), after receiving the LLM response text, extract the JSON annotation:

```typescript
// Extract notePrompt JSON annotation from LLM response (same pattern as structuredAssessment)
const notePromptMatch = response.match(/\n?\{"notePrompt":\s*true(?:,\s*"postSession":\s*true)?\}\s*$/);
let notePrompt = false;
let notePromptPostSession = false;
if (notePromptMatch) {
  response = response.slice(0, notePromptMatch.index).trimEnd();
  notePrompt = true;
  notePromptPostSession = notePromptMatch[0].includes('"postSession"');
}
```

Include in the returned result:

```typescript
return {
  response,
  // ...existing fields...
  notePrompt,
  notePromptPostSession,
};
```

- [ ] **Step 3: Emit notePrompt in SSE done event**

In `apps/api/src/routes/sessions.ts`, where the `done` SSE event is emitted (around line 185-191), add the notePrompt fields:

```typescript
// Change from:
sendEvent('done', {
  exchangeCount: result.exchangeCount,
  escalationRung: result.escalationRung,
  expectedResponseMinutes: result.expectedResponseMinutes,
  aiEventId: result.eventId,
});

// To:
sendEvent('done', {
  exchangeCount: result.exchangeCount,
  escalationRung: result.escalationRung,
  expectedResponseMinutes: result.expectedResponseMinutes,
  aiEventId: result.eventId,
  notePrompt: result.notePrompt || undefined,
  notePromptPostSession: result.notePromptPostSession || undefined,
});
```

- [ ] **Step 4: Update SSE types on client**

In `apps/mobile/src/lib/sse.ts`, add to the `StreamDoneEvent` interface:

```typescript
interface StreamDoneEvent {
  type: 'done';
  exchangeCount: number;
  escalationRung?: number;
  isComplete?: boolean;
  expectedResponseMinutes?: number;
  aiEventId?: string;
  notePrompt?: boolean;           // NEW
  notePromptPostSession?: boolean; // NEW
}
```

- [ ] **Step 5: Pass notePrompt through streaming hook**

In `apps/mobile/src/hooks/use-sessions.ts`, in the `useStreamMessage` hook's `onDone` callback (around line 280), pass the new fields:

```typescript
onDone({
  exchangeCount: event.exchangeCount,
  escalationRung: event.escalationRung ?? 0,
  expectedResponseMinutes: event.expectedResponseMinutes,
  aiEventId: event.aiEventId,
  notePrompt: event.notePrompt,           // NEW
  notePromptPostSession: event.notePromptPostSession, // NEW
});
```

- [ ] **Step 6: Add note prompt UI to session screen**

In `apps/mobile/src/app/(learner)/session/index.tsx`, add state and the note input UI:

```typescript
import { NoteInput } from '../../../components/library/NoteInput';
import { useUpsertNote } from '../../../hooks/use-notes';

// Inside the component, alongside existing state:
const [notePromptOffered, setNotePromptOffered] = useState(false);
const [showNoteInput, setShowNoteInput] = useState(false);
const sessionNoteSaved = useRef(false);

// Get subjectId and topicId from route params (already available)
const upsertNote = useUpsertNote(subjectId, /* bookId not available here — pass undefined */undefined);
```

In the `onDone` handler where `streamMessage.stream()` completes:

```typescript
// After existing onDone logic:
if (doneData.notePrompt && !notePromptOffered) {
  setNotePromptOffered(true);
  // Show a "Write a note" button after the AI message
  // The button is rendered below the last message bubble
}
if (doneData.notePromptPostSession) {
  // Always show for post-session, even if mid-session was shown
  // (post-session is separate per spec)
  setShowNoteInput(true);
}
```

Render the note prompt below the chat messages (inside the ScrollView, after the message list):

```tsx
{notePromptOffered && !showNoteInput && !sessionNoteSaved.current && (
  <Pressable
    className="bg-primary/10 rounded-lg px-4 py-3 mx-4 mb-2 flex-row items-center"
    onPress={() => setShowNoteInput(true)}
  >
    <Ionicons name="document-text-outline" size={18} color={colors.primary} />
    <Text className="text-body text-primary font-semibold ml-2">
      Write a note
    </Text>
  </Pressable>
)}

{showNoteInput && (
  <View className="px-4 mb-2">
    <NoteInput
      onSave={(content) => {
        // Add session date separator if note already exists from a previous session
        const separator = !sessionNoteSaved.current
          ? `--- ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} ---\n`
          : '';
        upsertNote.mutate(
          {
            topicId: topicId!,
            content: `${separator}${content}`,
            append: true,
          },
          {
            onSuccess: () => {
              sessionNoteSaved.current = true;
              setShowNoteInput(false);
            },
            onError: (err) => {
              Alert.alert("Couldn't save your note", formatApiError(err));
            },
          },
        );
      }}
      onCancel={() => setShowNoteInput(false)}
      saving={upsertNote.isPending}
    />
  </View>
)}
```

**Note on bookId:** The session screen doesn't have `bookId` readily available (only `subjectId` and `topicId`). The `useUpsertNote` hook is called with `bookId: undefined` — this is fine because the mutation only uses `subjectId` and `topicId` for the PUT endpoint (`/subjects/:subjectId/topics/:topicId/note`). The `bookId` is only used for query invalidation; post-mutation, the Book screen's `useBookNotes` will refetch when the user navigates back.

- [ ] **Step 7: Typecheck and test**

Run:

```bash
pnpm exec nx run api:typecheck && pnpm exec nx run api:lint && cd apps/mobile && pnpm exec tsc --noEmit
```

Expected: Clean pass.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/services/exchanges.ts apps/api/src/routes/sessions.ts apps/mobile/src/lib/sse.ts apps/mobile/src/hooks/use-sessions.ts apps/mobile/src/app/(learner)/session/index.tsx
git commit -m "feat(mobile,api): mid-session and post-session note triggers [7.9]"
```

---

## Execution Order & Dependencies

```
Task 1 (Schema)
  ↓
Task 2 (Zod types) ──────────┐
  ↓                           │
Task 3 (API routes) ─────────┤
  ↓                           │
Task 4 (useBookNotes hook)    │
                              │
Task 5 (CollapsibleChapter) ──┤── can run in parallel with Tasks 3-4
Task 6 (NoteInput/Display) ───┘
  ↓
Task 7 (Shelf screen) ── depends on existing hooks only
Task 8 (Book screen) ─── depends on Tasks 4, 5, 6
  ↓
Task 9 (Library simplification) ── depends on Tasks 7, 8
  ↓
Task 10 (Session triggers) ── depends on Task 6 (NoteInput)
```

**Parallelizable:** Tasks 5+6 can run alongside Tasks 3+4. Task 7 can start as soon as Task 2 is done.

---

## Verification Checklist

After all tasks are complete, run the full validation suite:

```bash
# API
pnpm exec nx run api:typecheck
pnpm exec nx run api:lint
pnpm exec nx run api:test

# Mobile
cd apps/mobile && pnpm exec tsc --noEmit
pnpm exec nx lint mobile
cd apps/mobile && pnpm exec jest --no-coverage

# Cross-package
pnpm exec nx run-many -t typecheck
```

All must pass before declaring this work complete.
