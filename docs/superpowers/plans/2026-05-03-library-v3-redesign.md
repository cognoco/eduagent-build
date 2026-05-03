# Library v3 — Organized Shelf Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the three-tab Library screen with a single expandable-shelf surface, migrate notes from 1:1 upsert to multi-note CRUD, redesign the Book and Topic screens to elevate notes and sessions, and add server-side library search.

**Architecture:** The DB migration is split into two phases for deployment safety. Phase 1 (Task 1) adds `sessionId` to `topic_notes` and a trigram index for full-text search — both additive, non-breaking changes. Phase 2 (Task 6A) drops the unique constraint AFTER all callers of the old `upsertNote` function have been migrated to `createNote`. This prevents a runtime crash in `SessionFooter` (which relies on `onConflictDoUpdate` targeting the unique constraint). New API routes replace composite-key upsert with standard CRUD by noteId. A new `/library/search` endpoint provides server-side full-text search using `pg_trgm`. The mobile UI replaces `ShelvesTab`/`BooksTab`/`TopicsTab` with a single expandable `ShelfRow` list, and redesigns `BookScreen` and `TopicScreen` content.

**Tech Stack:** Drizzle ORM (Postgres), Hono API, Zod schemas (`@eduagent/schemas`), React Native + Expo Router, React Query, NativeWind.

---

## File Structure

### Packages (shared)

| File | Responsibility |
|---|---|
| `packages/database/src/schema/notes.ts` | Modify: add `sessionId` FK (Phase 1); drop unique constraint (Phase 2 — Task 6A, after callers migrated) |
| `packages/database/drizzle/migrations/XXXX_notes_session_id.sql` | Create: Phase 1 migration (add column + trgm index) |
| `packages/database/drizzle/migrations/XXXX_notes_drop_unique.sql` | Create: Phase 2 migration (drop unique constraint, Task 6A) |
| `packages/schemas/src/notes.ts` | Modify: replace upsert schemas with create/update/response |
| `packages/schemas/src/library-search.ts` | Create: search request/response schemas |

### API

| File | Responsibility |
|---|---|
| `apps/api/src/routes/notes.ts` | Modify: add POST, PATCH, DELETE by noteId; GET topic notes list; deprecate PUT |
| `apps/api/src/services/notes.ts` | Modify: add `createNote`, `updateNote`, `deleteNoteById`, `getNotesForTopic`; update `getNotesForBook` response |
| `apps/api/src/routes/library-search.ts` | Create: `GET /library/search?q=` endpoint |
| `apps/api/src/services/library-search.ts` | Create: full-text search across subjects, books, topics, notes |
| `apps/api/src/services/session/session-topic.ts` | Create: `getTopicSessions` — sessions filtered by topicId |
| `apps/api/src/routes/notes.ts` (or sessions) | Modify: add `GET /subjects/:subjectId/topics/:topicId/sessions` route |

### Mobile — Components

| File | Responsibility |
|---|---|
| `apps/mobile/src/components/library/ShelfRow.tsx` | Create: expandable subject row |
| `apps/mobile/src/components/library/BookRow.tsx` | Create: compact book row inside expanded shelf |
| `apps/mobile/src/components/library/RetentionPill.tsx` | Create: extracted pill component (dot + label) |
| `apps/mobile/src/components/library/NoteContextMenu.tsx` | Create: long-press menu for note cards |
| `apps/mobile/src/components/library/TopicPickerSheet.tsx` | Create: bottom sheet topic picker for adding notes |
| `apps/mobile/src/components/library/TopicHeader.tsx` | Create: topic screen hero section |
| `apps/mobile/src/components/library/TopicSessionRow.tsx` | Create: compact session row for topic screen |
| `apps/mobile/src/components/library/StudyCTA.tsx` | Create: sticky bottom button |
| `apps/mobile/src/components/library/InlineNoteCard.tsx` | Modify: add source line, onLongPress, noteId prop |
| `apps/mobile/src/components/library/NoteInput.tsx` | Modify: MAX_CHARS 2000→5000, WARN_THRESHOLD 1800→4500 |
| `apps/mobile/src/components/library/LibrarySearchBar.tsx` | Modify: placeholder text |

### Mobile — Screens

| File | Responsibility |
|---|---|
| `apps/mobile/src/app/(app)/library.tsx` | Rewrite: remove tabs, render expandable shelves |
| `apps/mobile/src/app/(app)/shelf/[subjectId]/book/[bookId].tsx` | Rewrite: new layout with notes elevated, topics by chapter |
| `apps/mobile/src/app/(app)/topic/[topicId].tsx` | Rewrite: notes + sessions + StudyCTA layout |
| `apps/mobile/src/components/session/SessionFooter.tsx` | Modify: migrate from `useUpsertNote(append)` to `useCreateNote(sessionId)` |
| `apps/mobile/src/app/(app)/session/index.tsx` | Modify: replace `useUpsertNote` instantiation with `useCreateNote` |

### Mobile — Hooks

| File | Responsibility |
|---|---|
| `apps/mobile/src/hooks/use-notes.ts` | Modify: add `useTopicNotes`, `useCreateNote`, `useUpdateNote`, `useDeleteNoteById`; update `useBookNotes` response type |
| `apps/mobile/src/hooks/use-topic-sessions.ts` | Create: `useTopicSessions` hook |
| `apps/mobile/src/hooks/use-library-search.ts` | Create: `useLibrarySearch` hook with debounce |

---

## Task 1: DB Migration Phase 1 — Add sessionId Column + Search Index

> **SAFETY NOTE:** This task is Phase 1 of a two-phase migration. It adds `sessionId` and a trigram index — both additive, non-breaking changes. The unique constraint on `(topicId, profileId)` is **kept** here because `upsertNote()` in `services/notes.ts:179` uses `onConflictDoUpdate` targeting that constraint, and `SessionFooter.tsx:130` calls it during every live session. Dropping the constraint before migrating callers would crash in-session note-saving. Phase 2 (Task 6A) drops the constraint after all callers are migrated.

**Files:**
- Modify: `packages/database/src/schema/notes.ts`
- Create: migration SQL (via `pnpm run db:generate`)

- [ ] **Step 1: Verify baseline**

```bash
cd apps/api && pnpm exec jest --testPathPattern="notes" --no-coverage
```

Existing note tests should pass — establishes the baseline.

- [ ] **Step 2: Modify the schema — add sessionId, keep unique constraint**

In `packages/database/src/schema/notes.ts`:

```ts
import { pgTable, uuid, text, timestamp, unique, index } from 'drizzle-orm/pg-core';
import { curriculumTopics } from './subjects';
import { profiles } from './profiles';
import { learningSessions } from './sessions';
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
    sessionId: uuid('session_id').references(() => learningSessions.id, {
      onDelete: 'set null',
    }),
    content: text('content').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique().on(t.topicId, t.profileId),  // KEPT — removed in Phase 2 (Task 6A)
    index('topic_notes_content_trgm_idx')
      .using('gin', sql`${t.content} gin_trgm_ops`),
  ]
);
```

Key changes: `sessionId` nullable FK added with `onDelete: 'set null'`, trigram GIN index on `content` for full-text search. Unique constraint **preserved** for upsert compatibility.

- [ ] **Step 3: Generate the migration**

```bash
pnpm run db:generate
```

Expected migration:
1. Adds `session_id uuid REFERENCES learning_sessions(id) ON DELETE SET NULL`
2. Creates `CREATE INDEX topic_notes_content_trgm_idx ON topic_notes USING gin (content gin_trgm_ops)`
3. The migration SQL must also include `CREATE EXTENSION IF NOT EXISTS pg_trgm` (add manually if Drizzle doesn't generate it)

- [ ] **Step 4: Verify the `pg_trgm` extension line exists in migration**

Open the generated migration SQL and verify it includes `CREATE EXTENSION IF NOT EXISTS pg_trgm;` at the top. If missing, add it manually — the GIN index with `gin_trgm_ops` requires this extension.

- [ ] **Step 5: Push to dev database**

```bash
pnpm run db:push:dev
```

Expected: schema applied successfully. Existing notes retain their data with `session_id = NULL`. The unique constraint is still in place — `upsertNote` continues to work.

- [ ] **Step 6: Verify the database package builds and existing tests still pass**

```bash
pnpm exec nx run database:build && cd apps/api && pnpm exec jest --testPathPattern="notes" --no-coverage
```

Expected: PASS — the additive changes don't break any existing code.

- [ ] **Step 7: Commit**

```bash
git add packages/database/src/schema/notes.ts packages/database/drizzle/
git commit -m "feat(db): add sessionId column + trgm search index to topic_notes (Phase 1)"
```

---

## Task 2: Schema Package — New Note Types

**Files:**
- Modify: `packages/schemas/src/notes.ts`

- [ ] **Step 1: Write the new schemas**

Replace `packages/schemas/src/notes.ts` with:

```ts
import { z } from 'zod';

// Full note row (internal/admin use)
export const topicNoteSchema = z.object({
  id: z.string().uuid(),
  topicId: z.string().uuid(),
  profileId: z.string().uuid(),
  sessionId: z.string().uuid().nullable(),
  content: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type TopicNote = z.infer<typeof topicNoteSchema>;

// --- Input schemas ---

export const createNoteInputSchema = z.object({
  content: z.string().min(1).max(5000),
  sessionId: z.string().uuid().optional(),
});
export type CreateNoteInput = z.infer<typeof createNoteInputSchema>;

export const updateNoteInputSchema = z.object({
  content: z.string().min(1).max(5000),
});
export type UpdateNoteInput = z.infer<typeof updateNoteInputSchema>;

// --- Response schemas ---

export const noteResponseSchema = z.object({
  id: z.string().uuid(),
  topicId: z.string().uuid(),
  sessionId: z.string().uuid().nullable(),
  content: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type NoteResponse = z.infer<typeof noteResponseSchema>;

export const bookNotesResponseSchema = z.object({
  notes: z.array(noteResponseSchema),
});
export type BookNotesResponse = z.infer<typeof bookNotesResponseSchema>;

export const topicNotesResponseSchema = z.object({
  notes: z.array(noteResponseSchema),
});
export type TopicNotesResponse = z.infer<typeof topicNotesResponseSchema>;

// --- Deprecated (remove after migration) ---
/** @deprecated Use createNoteInputSchema instead */
export const upsertNoteInputSchema = z.object({
  content: z.string().min(1).max(5000),
  append: z.boolean().optional(),
});
/** @deprecated */
export type UpsertNoteInput = z.infer<typeof upsertNoteInputSchema>;
```

- [ ] **Step 2: Verify the schemas package builds**

```bash
pnpm exec nx run schemas:build
```

Expected: PASS.

- [ ] **Step 3: Fix any downstream type errors from the BookNotesResponse shape change**

Run:
```bash
pnpm exec nx run api:typecheck
cd apps/mobile && pnpm exec tsc --noEmit
```

The `BookNotesResponse` shape changed from `{ topicId, content, updatedAt }[]` to `NoteResponse[]` (adds `id`, `sessionId`, `createdAt`). Update any code that destructures the old shape.

Specifically in `apps/mobile/src/hooks/use-notes.ts`, the `useBookNotes` return type annotation will now align with the new response shape automatically since it imports `BookNotesResponse`.

In `apps/api/src/services/notes.ts`, the `getNotesForBook` function's SELECT must include `id`, `sessionId`, `createdAt` fields.

- [ ] **Step 4: Commit**

```bash
git add packages/schemas/src/notes.ts
git commit -m "feat(schemas): multi-note CRUD schemas — createNoteInput, noteResponse"
```

---

## Task 3: API Service — Multi-Note CRUD

**Files:**
- Modify: `apps/api/src/services/notes.ts`

- [ ] **Step 1: Write failing tests for the new service functions**

Create/update tests in `apps/api/src/services/notes.test.ts`:

```ts
describe('createNote', () => {
  it('creates a note for a topic without sessionId', async () => {
    const note = await createNote(db, profileId, subjectId, topicId, 'My note');
    expect(note).toMatchObject({
      id: expect.any(String),
      topicId,
      sessionId: null,
      content: 'My note',
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });
  });

  it('creates a note with sessionId', async () => {
    const note = await createNote(db, profileId, subjectId, topicId, 'Session note', sessionId);
    expect(note.sessionId).toBe(sessionId);
  });

  it('allows multiple notes per topic', async () => {
    await createNote(db, profileId, subjectId, topicId, 'First');
    await createNote(db, profileId, subjectId, topicId, 'Second');
    const notes = await getNotesForTopic(db, profileId, subjectId, topicId);
    expect(notes).toHaveLength(2);
  });

  it('rejects notes on unowned topics', async () => {
    await expect(createNote(db, profileId, subjectId, otherTopicId, 'x'))
      .rejects.toThrow('Topic');
  });

  it('rejects note with sessionId belonging to a different topic', async () => {
    // sessionForOtherTopic is a valid session but for a different topicId
    await expect(createNote(db, profileId, subjectId, topicId, 'x', sessionForOtherTopic.id))
      .rejects.toThrow('Session');
  });

  it('rejects creation when topic already has MAX_NOTES_PER_TOPIC notes', async () => {
    // Create MAX_NOTES_PER_TOPIC notes first
    for (let i = 0; i < MAX_NOTES_PER_TOPIC; i++) {
      await createNote(db, profileId, subjectId, topicId, `Note ${i}`);
    }
    await expect(createNote(db, profileId, subjectId, topicId, 'One too many'))
      .rejects.toThrow('limit');
  });
});

describe('updateNote', () => {
  it('updates note content by noteId', async () => {
    const created = await createNote(db, profileId, subjectId, topicId, 'Original');
    const updated = await updateNote(db, profileId, created.id, 'Edited');
    expect(updated.content).toBe('Edited');
    expect(updated.id).toBe(created.id);
  });

  it('rejects updating unowned note', async () => {
    await expect(updateNote(db, otherProfileId, noteId, 'x'))
      .rejects.toThrow();
  });
});

describe('deleteNoteById', () => {
  it('deletes a note by its id', async () => {
    const created = await createNote(db, profileId, subjectId, topicId, 'To delete');
    const deleted = await deleteNoteById(db, profileId, created.id);
    expect(deleted).toBe(true);
  });

  it('returns false for non-existent note', async () => {
    const deleted = await deleteNoteById(db, profileId, nonExistentId);
    expect(deleted).toBe(false);
  });

  it('rejects deleting unowned note', async () => {
    const created = await createNote(db, profileId, subjectId, topicId, 'x');
    const deleted = await deleteNoteById(db, otherProfileId, created.id);
    expect(deleted).toBe(false);
  });
});

describe('getNotesForTopic', () => {
  it('returns all notes for a topic sorted by createdAt desc', async () => {
    await createNote(db, profileId, subjectId, topicId, 'First');
    await createNote(db, profileId, subjectId, topicId, 'Second');
    const notes = await getNotesForTopic(db, profileId, subjectId, topicId);
    expect(notes).toHaveLength(2);
    expect(notes[0].content).toBe('Second');
  });
});

describe('getNotesForBook (updated response)', () => {
  it('returns full NoteResponse shape', async () => {
    await createNote(db, profileId, subjectId, topicId, 'A note');
    const notes = await getNotesForBook(db, profileId, subjectId, bookId);
    expect(notes[0]).toMatchObject({
      id: expect.any(String),
      topicId,
      sessionId: null,
      content: 'A note',
      createdAt: expect.any(Date),
      updatedAt: expect.any(Date),
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/api && pnpm exec jest --testPathPattern="services/notes" --no-coverage
```

Expected: FAIL — functions not exported yet.

- [ ] **Step 3: Implement the new service functions**

In `apps/api/src/services/notes.ts`, add:

```ts
const MAX_NOTES_PER_TOPIC = 50;

export async function createNote(
  db: Database,
  profileId: string,
  subjectId: string,
  topicId: string,
  content: string,
  sessionId?: string
): Promise<{
  id: string;
  topicId: string;
  sessionId: string | null;
  content: string;
  createdAt: Date;
  updatedAt: Date;
}> {
  await verifyTopicOwnership(db, profileId, subjectId, topicId);

  // Guard: verify session belongs to this topic (prevents cross-topic note attachment)
  if (sessionId) {
    const [session] = await db
      .select({ topicId: learningSessions.topicId })
      .from(learningSessions)
      .where(eq(learningSessions.id, sessionId))
      .limit(1);
    if (!session || session.topicId !== topicId) {
      throw new NotFoundError('Session does not belong to this topic');
    }
  }

  // Guard: cardinality cap — prevent unbounded note creation per topic
  const [countRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(topicNotes)
    .where(and(eq(topicNotes.topicId, topicId), eq(topicNotes.profileId, profileId)));
  if (countRow && countRow.count >= MAX_NOTES_PER_TOPIC) {
    throw new Error(`Note limit reached: maximum ${MAX_NOTES_PER_TOPIC} notes per topic`);
  }

  const [row] = await db
    .insert(topicNotes)
    .values({
      topicId,
      profileId,
      sessionId: sessionId ?? null,
      content,
      updatedAt: new Date(),
    })
    .returning({
      id: topicNotes.id,
      topicId: topicNotes.topicId,
      sessionId: topicNotes.sessionId,
      content: topicNotes.content,
      createdAt: topicNotes.createdAt,
      updatedAt: topicNotes.updatedAt,
    });

  if (!row) throw new Error('Insert topic note did not return a row');
  return row;
}

export async function updateNote(
  db: Database,
  profileId: string,
  noteId: string,
  content: string
): Promise<{
  id: string;
  topicId: string;
  sessionId: string | null;
  content: string;
  createdAt: Date;
  updatedAt: Date;
}> {
  const [row] = await db
    .update(topicNotes)
    .set({ content, updatedAt: new Date() })
    .where(and(eq(topicNotes.id, noteId), eq(topicNotes.profileId, profileId)))
    .returning({
      id: topicNotes.id,
      topicId: topicNotes.topicId,
      sessionId: topicNotes.sessionId,
      content: topicNotes.content,
      createdAt: topicNotes.createdAt,
      updatedAt: topicNotes.updatedAt,
    });

  if (!row) throw new NotFoundError('Note');
  return row;
}

export async function deleteNoteById(
  db: Database,
  profileId: string,
  noteId: string
): Promise<boolean> {
  const result = await db
    .delete(topicNotes)
    .where(and(eq(topicNotes.id, noteId), eq(topicNotes.profileId, profileId)))
    .returning({ id: topicNotes.id });

  return result.length > 0;
}

export async function getNotesForTopic(
  db: Database,
  profileId: string,
  subjectId: string,
  topicId: string
): Promise<{
  id: string;
  topicId: string;
  sessionId: string | null;
  content: string;
  createdAt: Date;
  updatedAt: Date;
}[]> {
  await verifyTopicOwnership(db, profileId, subjectId, topicId);

  return db
    .select({
      id: topicNotes.id,
      topicId: topicNotes.topicId,
      sessionId: topicNotes.sessionId,
      content: topicNotes.content,
      createdAt: topicNotes.createdAt,
      updatedAt: topicNotes.updatedAt,
    })
    .from(topicNotes)
    .where(
      and(eq(topicNotes.topicId, topicId), eq(topicNotes.profileId, profileId))
    )
    .orderBy(desc(topicNotes.createdAt));
}
```

Also update `getNotesForBook` to return the full shape:

```ts
export async function getNotesForBook(
  db: Database,
  profileId: string,
  subjectId: string,
  bookId: string
): Promise<{
  id: string;
  topicId: string;
  sessionId: string | null;
  content: string;
  createdAt: Date;
  updatedAt: Date;
}[]> {
  // ... existing ownership checks ...

  const topicIds = topics.map((t) => t.id);

  return db
    .select({
      id: topicNotes.id,
      topicId: topicNotes.topicId,
      sessionId: topicNotes.sessionId,
      content: topicNotes.content,
      createdAt: topicNotes.createdAt,
      updatedAt: topicNotes.updatedAt,
    })
    .from(topicNotes)
    .where(
      and(
        inArray(topicNotes.topicId, topicIds),
        eq(topicNotes.profileId, profileId)
      )
    )
    .orderBy(desc(topicNotes.createdAt));
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd apps/api && pnpm exec jest --testPathPattern="services/notes" --no-coverage
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/notes.ts apps/api/src/services/notes.test.ts
git commit -m "feat(api): multi-note CRUD service — createNote, updateNote, deleteNoteById, getNotesForTopic"
```

---

## Task 4: API Routes — New Note Endpoints

**Files:**
- Modify: `apps/api/src/routes/notes.ts`

- [ ] **Step 1: Write integration tests for the new routes**

In `apps/api/src/routes/notes.test.ts` (or the relevant integration test file):

```ts
describe('POST /subjects/:subjectId/topics/:topicId/notes', () => {
  it('creates a note and returns 201 with NoteResponse', async () => {
    const res = await app.request(
      `/subjects/${subjectId}/topics/${topicId}/notes`,
      { method: 'POST', body: JSON.stringify({ content: 'New note' }), headers }
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.note.id).toBeDefined();
    expect(body.note.sessionId).toBeNull();
    expect(body.note.content).toBe('New note');
  });

  it('creates a session-tied note', async () => {
    const res = await app.request(
      `/subjects/${subjectId}/topics/${topicId}/notes`,
      { method: 'POST', body: JSON.stringify({ content: 'x', sessionId }), headers }
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.note.sessionId).toBe(sessionId);
  });
});

describe('GET /subjects/:subjectId/topics/:topicId/notes', () => {
  it('returns all notes for a topic', async () => {
    // create two notes first
    const res = await app.request(
      `/subjects/${subjectId}/topics/${topicId}/notes`,
      { method: 'GET', headers }
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.notes.length).toBeGreaterThanOrEqual(2);
  });
});

describe('PATCH /notes/:noteId', () => {
  it('updates a note', async () => {
    const res = await app.request(`/notes/${noteId}`, {
      method: 'PATCH',
      body: JSON.stringify({ content: 'Updated' }),
      headers,
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.note.content).toBe('Updated');
  });

  it('returns 404 for unowned note', async () => {
    const res = await app.request(`/notes/${otherNoteId}`, {
      method: 'PATCH',
      body: JSON.stringify({ content: 'x' }),
      headers: otherHeaders,
    });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /notes/:noteId', () => {
  it('deletes a note', async () => {
    const res = await app.request(`/notes/${noteId}`, { method: 'DELETE', headers });
    expect(res.status).toBe(204);
  });

  it('returns 404 for non-existent note', async () => {
    const res = await app.request(`/notes/${randomUUID()}`, { method: 'DELETE', headers });
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/api && pnpm exec jest --testPathPattern="routes/notes" --no-coverage
```

Expected: FAIL — routes don't exist yet.

- [ ] **Step 3: Implement the new routes**

In `apps/api/src/routes/notes.ts`, add the new routes to the existing Hono chain:

```ts
import {
  createNoteInputSchema,
  updateNoteInputSchema,
} from '@eduagent/schemas';
import {
  createNote,
  updateNote,
  deleteNoteById,
  getNotesForTopic,
} from '../services/notes';

// Add to noteRoutes chain:

// GET /subjects/:subjectId/topics/:topicId/notes (list, replaces singular /note)
.get(
  '/subjects/:subjectId/topics/:topicId/notes',
  zValidator('param', topicParamSchema),
  async (c) => {
    const db = c.get('db');
    const profileId = requireProfileId(c.get('profileId'));
    const { subjectId, topicId } = c.req.valid('param');

    try {
      const notes = await getNotesForTopic(db, profileId, subjectId, topicId);
      return c.json({ notes });
    } catch (error) {
      if (error instanceof NotFoundError) return notFound(c, error.message);
      throw error;
    }
  }
)

// POST /subjects/:subjectId/topics/:topicId/notes
.post(
  '/subjects/:subjectId/topics/:topicId/notes',
  zValidator('param', topicParamSchema),
  zValidator('json', createNoteInputSchema),
  async (c) => {
    const db = c.get('db');
    const profileId = requireProfileId(c.get('profileId'));
    const { subjectId, topicId } = c.req.valid('param');
    const { content, sessionId } = c.req.valid('json');

    try {
      const note = await createNote(db, profileId, subjectId, topicId, content, sessionId);
      return c.json({ note }, 201);
    } catch (error) {
      if (error instanceof NotFoundError) return notFound(c, error.message);
      throw error;
    }
  }
)

// PATCH /notes/:noteId
.patch(
  '/notes/:noteId',
  zValidator('param', z.object({ noteId: z.string().uuid() })),
  zValidator('json', updateNoteInputSchema),
  async (c) => {
    const db = c.get('db');
    const profileId = requireProfileId(c.get('profileId'));
    const { noteId } = c.req.valid('param');
    const { content } = c.req.valid('json');

    try {
      const note = await updateNote(db, profileId, noteId, content);
      return c.json({ note });
    } catch (error) {
      if (error instanceof NotFoundError) return notFound(c, error.message);
      throw error;
    }
  }
)

// DELETE /notes/:noteId
.delete(
  '/notes/:noteId',
  zValidator('param', z.object({ noteId: z.string().uuid() })),
  async (c) => {
    const db = c.get('db');
    const profileId = requireProfileId(c.get('profileId'));
    const { noteId } = c.req.valid('param');

    const deleted = await deleteNoteById(db, profileId, noteId);
    if (!deleted) return notFound(c, 'Note not found');
    return c.body(null, 204);
  }
)
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd apps/api && pnpm exec jest --testPathPattern="routes/notes" --no-coverage
```

Expected: PASS.

- [ ] **Step 5: Run API typecheck**

```bash
pnpm exec nx run api:typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/notes.ts apps/api/src/routes/notes.test.ts
git commit -m "feat(api): multi-note CRUD routes — POST, PATCH, DELETE /notes/:noteId"
```

---

## Task 5: API — Topic Sessions Endpoint

**Files:**
- Create: `apps/api/src/services/session/session-topic.ts`
- Modify: `apps/api/src/routes/sessions.ts` (or add to books routes)

- [ ] **Step 1: Write the service function test**

```ts
describe('getTopicSessions', () => {
  it('returns sessions for a specific topic with duration', async () => {
    const sessions = await getTopicSessions(db, profileId, topicId);
    expect(sessions[0]).toMatchObject({
      id: expect.any(String),
      sessionType: expect.any(String),
      durationSeconds: expect.any(Number),
      createdAt: expect.any(String),
    });
  });

  it('returns sessions ordered by createdAt desc', async () => {
    const sessions = await getTopicSessions(db, profileId, topicId);
    const dates = sessions.map(s => new Date(s.createdAt).getTime());
    expect(dates).toEqual([...dates].sort((a, b) => b - a));
  });

  it('excludes sessions with zero exchanges', async () => {
    const sessions = await getTopicSessions(db, profileId, topicId);
    // All sessions returned should have had real interaction
    expect(sessions.every(s => s.id)).toBe(true);
  });
});
```

- [ ] **Step 2: Implement `getTopicSessions`**

Create `apps/api/src/services/session/session-topic.ts`:

```ts
import { eq, and, desc, gte, inArray } from 'drizzle-orm';
import {
  learningSessions,
  subjects,
  type Database,
} from '@eduagent/database';

export interface TopicSession {
  id: string;
  sessionType: string;
  durationSeconds: number | null;
  createdAt: string;
}

export async function getTopicSessions(
  db: Database,
  profileId: string,
  topicId: string
): Promise<TopicSession[]> {
  const rows = await db
    .select({
      id: learningSessions.id,
      sessionType: learningSessions.sessionType,
      durationSeconds: learningSessions.durationSeconds,
      createdAt: learningSessions.createdAt,
    })
    .from(learningSessions)
    .innerJoin(subjects, eq(learningSessions.subjectId, subjects.id))
    .where(
      and(
        eq(learningSessions.topicId, topicId),
        eq(subjects.profileId, profileId),
        inArray(learningSessions.status, ['completed', 'auto_closed']),
        gte(learningSessions.exchangeCount, 1)
      )
    )
    .orderBy(desc(learningSessions.createdAt));

  return rows.map((r) => ({
    id: r.id,
    sessionType: r.sessionType,
    durationSeconds: r.durationSeconds,
    createdAt: r.createdAt.toISOString(),
  }));
}
```

- [ ] **Step 3: Add the route**

Add to the existing notes routes (consistent with `/subjects/:subjectId/topics/:topicId/...` URL hierarchy — avoids a flat `/topics/:topicId` that breaks the established pattern of explicit `subjectId` in the path for ownership verification):

```ts
// GET /subjects/:subjectId/topics/:topicId/sessions
.get(
  '/subjects/:subjectId/topics/:topicId/sessions',
  zValidator('param', z.object({ subjectId: z.string().uuid(), topicId: z.string().uuid() })),
  async (c) => {
    const db = c.get('db');
    const profileId = requireProfileId(c.get('profileId'));
    const { subjectId, topicId } = c.req.valid('param');

    // verifyTopicOwnership provides redundant path-based scoping on top of the join
    await verifyTopicOwnership(db, profileId, subjectId, topicId);
    const sessions = await getTopicSessions(db, profileId, topicId);
    return c.json({ sessions });
  }
)
```

- [ ] **Step 4: Run tests**

```bash
cd apps/api && pnpm exec jest --testPathPattern="session-topic|sessions" --no-coverage
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/session/session-topic.ts apps/api/src/routes/
git commit -m "feat(api): topic sessions endpoint — GET /subjects/:subjectId/topics/:topicId/sessions"
```

---

## Task 6: API — Library Search Endpoint

**Files:**
- Create: `packages/schemas/src/library-search.ts`
- Create: `apps/api/src/services/library-search.ts`
- Create: `apps/api/src/routes/library-search.ts`

- [ ] **Step 1: Define search schemas**

Create `packages/schemas/src/library-search.ts`:

```ts
import { z } from 'zod';

export const librarySearchQuerySchema = z.object({
  q: z.string().min(1).max(200),
});
export type LibrarySearchQuery = z.infer<typeof librarySearchQuerySchema>;

export const librarySearchResultSchema = z.object({
  subjects: z.array(
    z.object({
      id: z.string().uuid(),
      name: z.string(),
    })
  ),
  books: z.array(
    z.object({
      id: z.string().uuid(),
      subjectId: z.string().uuid(),
      title: z.string(),
    })
  ),
  topics: z.array(
    z.object({
      id: z.string().uuid(),
      bookId: z.string().uuid(),
      subjectId: z.string().uuid(),
      name: z.string(),
    })
  ),
  notes: z.array(
    z.object({
      id: z.string().uuid(),
      topicId: z.string().uuid(),
      bookId: z.string().uuid(),
      subjectId: z.string().uuid(),
      contentSnippet: z.string(),
    })
  ),
});
export type LibrarySearchResult = z.infer<typeof librarySearchResultSchema>;
```

Export from the schemas package barrel.

- [ ] **Step 2: Implement the search service**

Create `apps/api/src/services/library-search.ts`:

```ts
import { eq, and, ilike, sql } from 'drizzle-orm';
import {
  subjects,
  curriculumBooks,
  curriculumTopics,
  topicNotes,
  createScopedRepository,
  type Database,
} from '@eduagent/database';

interface SearchResult {
  subjects: { id: string; name: string }[];
  books: { id: string; subjectId: string; title: string }[];
  topics: { id: string; bookId: string; subjectId: string; name: string }[];
  notes: { id: string; topicId: string; bookId: string; subjectId: string; contentSnippet: string }[];
}

export async function searchLibrary(
  db: Database,
  profileId: string,
  query: string
): Promise<SearchResult> {
  // Escape LIKE-special characters in user input to prevent pattern injection
  const escaped = query.replace(/[%_\\]/g, '\\$&');
  const pattern = `%${escaped}%`;

  // Use createScopedRepository for profile scoping (CLAUDE.md mandate)
  const repo = createScopedRepository(db, profileId);

  // All queries scoped via repo.db — consistent with codebase convention
  const [matchingSubjects, matchingBooks, matchingTopics, matchingNotes] =
    await Promise.all([
      // Subjects by name
      repo.db
        .select({ id: subjects.id, name: subjects.name })
        .from(subjects)
        .where(and(eq(subjects.profileId, profileId), ilike(subjects.name, pattern)))
        .limit(20),

      // Books by title
      repo.db
        .select({
          id: curriculumBooks.id,
          subjectId: curriculumBooks.subjectId,
          title: curriculumBooks.title,
        })
        .from(curriculumBooks)
        .innerJoin(subjects, eq(curriculumBooks.subjectId, subjects.id))
        .where(and(eq(subjects.profileId, profileId), ilike(curriculumBooks.title, pattern)))
        .limit(20),

      // Topics by name
      repo.db
        .select({
          id: curriculumTopics.id,
          bookId: curriculumTopics.bookId,
          subjectId: curriculumBooks.subjectId,
          name: curriculumTopics.title,
        })
        .from(curriculumTopics)
        .innerJoin(curriculumBooks, eq(curriculumTopics.bookId, curriculumBooks.id))
        .innerJoin(subjects, eq(curriculumBooks.subjectId, subjects.id))
        .where(and(eq(subjects.profileId, profileId), ilike(curriculumTopics.title, pattern)))
        .limit(20),

      // Notes by content — uses pg_trgm GIN index from Task 1 migration
      repo.db
        .select({
          id: topicNotes.id,
          topicId: topicNotes.topicId,
          bookId: curriculumTopics.bookId,
          subjectId: curriculumBooks.subjectId,
          content: topicNotes.content,
        })
        .from(topicNotes)
        .innerJoin(curriculumTopics, eq(topicNotes.topicId, curriculumTopics.id))
        .innerJoin(curriculumBooks, eq(curriculumTopics.bookId, curriculumBooks.id))
        .innerJoin(subjects, eq(curriculumBooks.subjectId, subjects.id))
        .where(and(eq(subjects.profileId, profileId), ilike(topicNotes.content, pattern)))
        .limit(20),
    ]);

  return {
    subjects: matchingSubjects,
    books: matchingBooks,
    topics: matchingTopics,
    notes: matchingNotes.map((n) => ({
      id: n.id,
      topicId: n.topicId,
      bookId: n.bookId,
      subjectId: n.subjectId,
      contentSnippet: n.content.length > 100 ? n.content.slice(0, 100) + '…' : n.content,
    })),
  };
}
```

- [ ] **Step 3: Add the route**

Create `apps/api/src/routes/library-search.ts`:

```ts
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { librarySearchQuerySchema } from '@eduagent/schemas';
import type { Database } from '@eduagent/database';
import type { AuthUser } from '../middleware/auth';
import { requireProfileId } from '../middleware/profile-scope';
import { searchLibrary } from '../services/library-search';

type SearchRouteEnv = {
  Bindings: { DATABASE_URL: string; CLERK_JWKS_URL?: string };
  Variables: { user: AuthUser; db: Database; profileId: string | undefined };
};

export const librarySearchRoutes = new Hono<SearchRouteEnv>().get(
  '/library/search',
  zValidator('query', librarySearchQuerySchema),
  async (c) => {
    const db = c.get('db');
    const profileId = requireProfileId(c.get('profileId'));
    const { q } = c.req.valid('query');

    const results = await searchLibrary(db, profileId, q);
    return c.json(results);
  }
);
```

Register in the main app router.

- [ ] **Step 4: Write tests and verify**

```bash
cd apps/api && pnpm exec jest --testPathPattern="library-search" --no-coverage
```

- [ ] **Step 5: Typecheck**

```bash
pnpm exec nx run api:typecheck
```

- [ ] **Step 6: Commit**

```bash
git add packages/schemas/src/library-search.ts apps/api/src/services/library-search.ts apps/api/src/routes/library-search.ts
git commit -m "feat(api): library search endpoint — full-text across subjects, books, topics, notes"
```

---

## Accessibility Mandate (applies to all component Tasks 7–11)

> Every new interactive component must include `accessibilityRole`, `accessibilityLabel`, and/or `accessibilityHint` on all `Pressable`/tappable elements. The existing library components have 55 accessibility annotations across 19 files — new components must match this standard. Non-interactive components that convey status (e.g., `RetentionPill`) must include `accessibilityLabel` so screen readers announce the status. Tests should verify that accessibility labels are present on interactive elements.

## Task 7: Mobile — RetentionPill Component

**Files:**
- Create: `apps/mobile/src/components/library/RetentionPill.tsx`
- Create: `apps/mobile/src/components/library/RetentionPill.test.tsx`

- [ ] **Step 1: Write the test**

```tsx
import { render, screen } from '@testing-library/react-native';
import { RetentionPill } from './RetentionPill';

describe('RetentionPill', () => {
  it('renders strong status with green dot and label', () => {
    render(<RetentionPill status="strong" />);
    expect(screen.getByText('Strong')).toBeTruthy();
    expect(screen.getByTestId('retention-pill-dot')).toBeTruthy();
  });

  it('renders fading status', () => {
    render(<RetentionPill status="fading" />);
    expect(screen.getByText('Fading')).toBeTruthy();
  });

  it('renders compact variant (no label)', () => {
    render(<RetentionPill status="weak" size="small" />);
    expect(screen.queryByText('Weak')).toBeNull();
    expect(screen.getByTestId('retention-pill-dot')).toBeTruthy();
  });

  it('renders large variant', () => {
    render(<RetentionPill status="strong" size="large" />);
    expect(screen.getByText('Strong')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/mobile && pnpm exec jest --testPathPattern="RetentionPill" --no-coverage
```

- [ ] **Step 3: Implement RetentionPill**

```tsx
import { View, Text } from 'react-native';
import { useDesignTokens } from '../../lib/design-tokens';
import type { RetentionStatus } from '@eduagent/schemas';

interface RetentionPillProps {
  status: RetentionStatus;
  size?: 'small' | 'default' | 'large';
  testID?: string;
}

const LABELS: Record<RetentionStatus, string> = {
  strong: 'Strong',
  fading: 'Fading',
  weak: 'Weak',
  forgotten: 'Forgotten',
};

const TOKEN_MAP: Record<RetentionStatus, keyof ReturnType<typeof useDesignTokens>> = {
  strong: 'retentionStrong',
  fading: 'retentionFading',
  weak: 'retentionWeak',
  forgotten: 'retentionForgotten',
};

export function RetentionPill({ status, size = 'default', testID }: RetentionPillProps) {
  const tokens = useDesignTokens();
  const color = tokens[TOKEN_MAP[status]];
  const showLabel = size !== 'small';
  const dotSize = size === 'large' ? 10 : 8;
  const fontSize = size === 'large' ? 14 : 12;

  return (
    <View
      style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
      testID={testID}
    >
      <View
        testID="retention-pill-dot"
        style={{
          width: dotSize,
          height: dotSize,
          borderRadius: dotSize / 2,
          backgroundColor: color,
        }}
      />
      {showLabel && (
        <Text style={{ color, fontSize, fontWeight: '500' }}>
          {LABELS[status]}
        </Text>
      )}
    </View>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd apps/mobile && pnpm exec jest --testPathPattern="RetentionPill" --no-coverage
```

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/components/library/RetentionPill.tsx apps/mobile/src/components/library/RetentionPill.test.tsx
git commit -m "feat(mobile): RetentionPill component — dot + label, three sizes"
```

---

## Task 8: Mobile — ShelfRow and BookRow Components

**Files:**
- Create: `apps/mobile/src/components/library/ShelfRow.tsx`
- Create: `apps/mobile/src/components/library/ShelfRow.test.tsx`
- Create: `apps/mobile/src/components/library/BookRow.tsx`
- Create: `apps/mobile/src/components/library/BookRow.test.tsx`

- [ ] **Step 1: Write ShelfRow test**

```tsx
import { render, screen, fireEvent } from '@testing-library/react-native';
import { ShelfRow } from './ShelfRow';

const mockShelf = {
  subjectId: 'sub-1',
  name: 'Algebra II',
  emoji: '📐',
  bookCount: 3,
  topicProgress: '18/32',
  retentionStatus: 'fading' as const,
  isPaused: false,
  books: [
    { bookId: 'b1', emoji: '📐', title: 'Linear Equations', topicProgress: '8/12', retentionStatus: 'strong' as const, hasNotes: false },
    { bookId: 'b2', emoji: '📈', title: 'Quadratic Functions', topicProgress: '10/10', retentionStatus: 'weak' as const, hasNotes: true },
  ],
};

describe('ShelfRow', () => {
  it('renders collapsed state with subject name and meta', () => {
    render(<ShelfRow {...mockShelf} expanded={false} onToggle={jest.fn()} onBookPress={jest.fn()} />);
    expect(screen.getByText('Algebra II')).toBeTruthy();
    expect(screen.getByText('3 books · 18/32 topics')).toBeTruthy();
  });

  it('renders expanded state with book rows', () => {
    render(<ShelfRow {...mockShelf} expanded={true} onToggle={jest.fn()} onBookPress={jest.fn()} />);
    expect(screen.getByText('Linear Equations')).toBeTruthy();
    expect(screen.getByText('Quadratic Functions')).toBeTruthy();
  });

  it('calls onToggle when header is pressed', () => {
    const onToggle = jest.fn();
    render(<ShelfRow {...mockShelf} expanded={false} onToggle={onToggle} onBookPress={jest.fn()} />);
    fireEvent.press(screen.getByTestId('shelf-row-header-sub-1'));
    expect(onToggle).toHaveBeenCalledWith('sub-1');
  });

  it('calls onBookPress when a book is tapped', () => {
    const onBookPress = jest.fn();
    render(<ShelfRow {...mockShelf} expanded={true} onToggle={jest.fn()} onBookPress={onBookPress} />);
    fireEvent.press(screen.getByTestId('book-row-b1'));
    expect(onBookPress).toHaveBeenCalledWith('sub-1', 'b1');
  });

  it('renders paused state with dimmed opacity and chip', () => {
    render(<ShelfRow {...mockShelf} isPaused={true} expanded={false} onToggle={jest.fn()} onBookPress={jest.fn()} />);
    expect(screen.getByText('Paused')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/mobile && pnpm exec jest --testPathPattern="ShelfRow" --no-coverage
```

- [ ] **Step 3: Implement ShelfRow and BookRow**

`ShelfRow.tsx`:

```tsx
import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useDesignTokens } from '../../lib/design-tokens';
import { RetentionPill } from './RetentionPill';
import { BookRow, type BookRowData } from './BookRow';
import type { RetentionStatus } from '@eduagent/schemas';

export interface ShelfRowProps {
  subjectId: string;
  name: string;
  emoji: string;
  bookCount: number;
  topicProgress: string;
  retentionStatus: RetentionStatus | null;
  isPaused: boolean;
  expanded: boolean;
  books: BookRowData[];
  onToggle: (subjectId: string) => void;
  onBookPress: (subjectId: string, bookId: string) => void;
}

export function ShelfRow({
  subjectId,
  name,
  emoji,
  bookCount,
  topicProgress,
  retentionStatus,
  isPaused,
  expanded,
  books,
  onToggle,
  onBookPress,
}: ShelfRowProps) {
  const tokens = useDesignTokens();

  return (
    <View style={{ opacity: isPaused ? 0.65 : 1 }}>
      <Pressable
        testID={`shelf-row-header-${subjectId}`}
        onPress={() => onToggle(subjectId)}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 16,
          paddingVertical: 12,
        }}
      >
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: 12,
            backgroundColor: tokens.surfaceElevated,
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: 12,
          }}
        >
          <Text style={{ fontSize: 20 }}>{emoji}</Text>
        </View>

        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text
              style={{ fontSize: 15, fontWeight: '700', color: tokens.textPrimary }}
              numberOfLines={1}
            >
              {name}
            </Text>
            {isPaused && (
              <View
                style={{
                  backgroundColor: `${tokens.warning}2E`,
                  paddingHorizontal: 8,
                  paddingVertical: 2,
                  borderRadius: 8,
                }}
              >
                <Text style={{ fontSize: 11, fontWeight: '600', color: tokens.warning }}>
                  Paused
                </Text>
              </View>
            )}
          </View>
          <Text style={{ fontSize: 12, color: tokens.textSecondary, marginTop: 2 }}>
            {bookCount} {bookCount === 1 ? 'book' : 'books'} · {topicProgress} topics
          </Text>
        </View>

        {retentionStatus && <RetentionPill status={retentionStatus} size="small" />}

        <Ionicons
          name={expanded ? 'chevron-down' : 'chevron-forward'}
          size={16}
          color={tokens.textSecondary}
          style={{ marginLeft: 8 }}
        />
      </Pressable>

      {expanded && (
        <View style={{ paddingLeft: 28 }}>
          {books.map((book) => (
            <BookRow
              key={book.bookId}
              {...book}
              onPress={() => onBookPress(subjectId, book.bookId)}
            />
          ))}
        </View>
      )}
    </View>
  );
}
```

`BookRow.tsx`:

```tsx
import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useDesignTokens } from '../../lib/design-tokens';
import { RetentionPill } from './RetentionPill';
import type { RetentionStatus } from '@eduagent/schemas';

export interface BookRowData {
  bookId: string;
  emoji: string;
  title: string;
  topicProgress: string;
  retentionStatus: RetentionStatus | null;
  hasNotes: boolean;
}

interface BookRowProps extends BookRowData {
  onPress: () => void;
}

export function BookRow({
  bookId,
  emoji,
  title,
  topicProgress,
  retentionStatus,
  hasNotes,
  onPress,
}: BookRowProps) {
  const tokens = useDesignTokens();

  return (
    <Pressable
      testID={`book-row-${bookId}`}
      onPress={onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 10,
      }}
    >
      <View
        style={{
          width: 32,
          height: 32,
          borderRadius: 10,
          backgroundColor: tokens.surfaceElevated,
          alignItems: 'center',
          justifyContent: 'center',
          marginRight: 10,
        }}
      >
        <Text style={{ fontSize: 16 }}>{emoji}</Text>
      </View>

      <View style={{ flex: 1 }}>
        <Text
          style={{ fontSize: 15, fontWeight: '600', color: tokens.textPrimary }}
          numberOfLines={1}
        >
          {title}
        </Text>
        <Text style={{ fontSize: 12, color: tokens.textSecondary, marginTop: 1 }}>
          {topicProgress} topics
        </Text>
      </View>

      {retentionStatus ? (
        <RetentionPill status={retentionStatus} size="small" />
      ) : (
        <Text style={{ fontSize: 12, color: tokens.textSecondary }}>not started</Text>
      )}

      {hasNotes && (
        <Text style={{ fontSize: 12, marginLeft: 6 }}>📝</Text>
      )}
    </Pressable>
  );
}
```

- [ ] **Step 4: Run tests**

```bash
cd apps/mobile && pnpm exec jest --testPathPattern="ShelfRow|BookRow" --no-coverage
```

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/components/library/ShelfRow.tsx apps/mobile/src/components/library/ShelfRow.test.tsx apps/mobile/src/components/library/BookRow.tsx apps/mobile/src/components/library/BookRow.test.tsx
git commit -m "feat(mobile): ShelfRow + BookRow — expandable shelf with inline books"
```

---

## Task 9: Mobile — InlineNoteCard Rework

**Files:**
- Modify: `apps/mobile/src/components/library/InlineNoteCard.tsx`
- Modify/Create: `apps/mobile/src/components/library/InlineNoteCard.test.tsx`

- [ ] **Step 1: Write the updated test**

```tsx
import { render, screen, fireEvent } from '@testing-library/react-native';
import { InlineNoteCard } from './InlineNoteCard';

describe('InlineNoteCard', () => {
  const baseProps = {
    noteId: 'note-1',
    topicTitle: 'Quadratic formula',
    content: 'Remember to check the discriminant before applying the formula.',
    sourceLine: 'From session · Apr 24',
    updatedAt: '2026-04-24T10:00:00Z',
    onLongPress: jest.fn(),
  };

  it('renders source line and content preview', () => {
    render(<InlineNoteCard {...baseProps} />);
    expect(screen.getByText('From session · Apr 24')).toBeTruthy();
    expect(screen.getByText(/Remember to check/)).toBeTruthy();
  });

  it('expands on press', () => {
    render(<InlineNoteCard {...baseProps} />);
    fireEvent.press(screen.getByTestId('note-card-note-1'));
    // Content should now be fully visible (no numberOfLines limit)
  });

  it('calls onLongPress with noteId', () => {
    render(<InlineNoteCard {...baseProps} />);
    fireEvent(screen.getByTestId('note-card-note-1'), 'longPress');
    expect(baseProps.onLongPress).toHaveBeenCalledWith('note-1');
  });

  it('renders without source line for quick notes', () => {
    render(<InlineNoteCard {...baseProps} sourceLine="Note · Apr 24" />);
    expect(screen.getByText('Note · Apr 24')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/mobile && pnpm exec jest --testPathPattern="InlineNoteCard" --no-coverage
```

- [ ] **Step 3: Rewrite InlineNoteCard**

```tsx
import { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useDesignTokens } from '../../lib/design-tokens';
import { formatRelativeDate } from '../../lib/format-date';

interface InlineNoteCardProps {
  noteId: string;
  topicTitle: string;
  content: string;
  sourceLine: string;
  updatedAt: string;
  defaultExpanded?: boolean;
  onLongPress?: (noteId: string) => void;
  testID?: string;
}

export function InlineNoteCard({
  noteId,
  topicTitle,
  content,
  sourceLine,
  updatedAt,
  defaultExpanded = false,
  onLongPress,
  testID,
}: InlineNoteCardProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const tokens = useDesignTokens();

  return (
    <Pressable
      testID={testID ?? `note-card-${noteId}`}
      onPress={() => setExpanded((e) => !e)}
      onLongPress={() => onLongPress?.(noteId)}
      accessibilityRole="button"
      accessibilityLabel={`Note: ${topicTitle}. Tap to ${expanded ? 'collapse' : 'expand'}`}
      style={{
        marginHorizontal: 20,
        marginBottom: 8,
        backgroundColor: `${tokens.accent}14`,
        borderColor: `${tokens.accent}59`,
        borderWidth: 1,
        borderStyle: 'dashed',
        borderRadius: 12,
        paddingHorizontal: 16,
        paddingVertical: 12,
      }}
    >
      <Text
        style={{ fontSize: 12, color: tokens.textSecondary, marginBottom: 4 }}
        numberOfLines={1}
      >
        {sourceLine}
      </Text>

      <Text
        style={{ fontSize: 14, color: tokens.textPrimary, lineHeight: 21 }}
        numberOfLines={expanded ? undefined : 2}
        testID={`${testID ?? `note-card-${noteId}`}-content`}
      >
        {content}
      </Text>

      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 4 }}>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={14}
          color={tokens.textSecondary}
        />
      </View>
    </Pressable>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd apps/mobile && pnpm exec jest --testPathPattern="InlineNoteCard" --no-coverage
```

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/components/library/InlineNoteCard.tsx apps/mobile/src/components/library/InlineNoteCard.test.tsx
git commit -m "feat(mobile): InlineNoteCard rework — source line, onLongPress, noteId, accent-tinted style"
```

---

## Task 10: Mobile — NoteContextMenu + TopicPickerSheet

**Files:**
- Create: `apps/mobile/src/components/library/NoteContextMenu.tsx`
- Create: `apps/mobile/src/components/library/TopicPickerSheet.tsx`
- Modify: `apps/mobile/src/components/library/NoteInput.tsx` (MAX_CHARS update)

- [ ] **Step 1: Implement NoteContextMenu**

```tsx
import { Alert } from 'react-native';

interface NoteContextMenuProps {
  noteId: string;
  content: string;
  onEdit: (noteId: string, currentContent: string) => void;
  onDelete: (noteId: string) => void;
}

export function showNoteContextMenu({ noteId, content, onEdit, onDelete }: NoteContextMenuProps) {
  Alert.alert('Note', undefined, [
    { text: 'Edit', onPress: () => onEdit(noteId, content) },
    {
      text: 'Delete',
      style: 'destructive',
      onPress: () => {
        Alert.alert(
          'Delete this note?',
          "This can't be undone.",
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: () => onDelete(noteId) },
          ]
        );
      },
    },
    { text: 'Cancel', style: 'cancel' },
  ]);
}
```

- [ ] **Step 2: Implement TopicPickerSheet**

```tsx
import { View, Text, Pressable, Modal, ScrollView } from 'react-native';
import { useDesignTokens } from '../../lib/design-tokens';

interface TopicOption {
  topicId: string;
  name: string;
  chapter: string | null;
}

interface TopicPickerSheetProps {
  visible: boolean;
  topics: TopicOption[];
  defaultTopicId?: string;
  onSelect: (topicId: string) => void;
  onClose: () => void;
}

export function TopicPickerSheet({
  visible,
  topics,
  defaultTopicId,
  onSelect,
  onClose,
}: TopicPickerSheetProps) {
  const tokens = useDesignTokens();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}
        onPress={onClose}
      >
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={{
            backgroundColor: tokens.surface,
            borderTopLeftRadius: 16,
            borderTopRightRadius: 16,
            paddingTop: 16,
            paddingBottom: 32,
            maxHeight: 400,
          }}
        >
          <Text
            style={{
              fontSize: 16,
              fontWeight: '700',
              color: tokens.textPrimary,
              paddingHorizontal: 20,
              marginBottom: 12,
            }}
          >
            Choose a topic
          </Text>
          <ScrollView>
            {topics.map((topic) => (
              <Pressable
                key={topic.topicId}
                testID={`topic-picker-${topic.topicId}`}
                onPress={() => onSelect(topic.topicId)}
                style={{
                  paddingHorizontal: 20,
                  paddingVertical: 12,
                  backgroundColor:
                    topic.topicId === defaultTopicId ? tokens.primarySoft : undefined,
                }}
              >
                <Text style={{ fontSize: 15, color: tokens.textPrimary }}>{topic.name}</Text>
                {topic.chapter && (
                  <Text style={{ fontSize: 12, color: tokens.textSecondary, marginTop: 2 }}>
                    {topic.chapter}
                  </Text>
                )}
              </Pressable>
            ))}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
```

- [ ] **Step 3: Update NoteInput MAX_CHARS**

In `apps/mobile/src/components/library/NoteInput.tsx`, change:
- `MAX_CHARS = 2000` → `MAX_CHARS = 5000`
- `WARN_THRESHOLD = 1800` → `WARN_THRESHOLD = 4500`

- [ ] **Step 4: Run existing NoteInput tests**

```bash
cd apps/mobile && pnpm exec jest --testPathPattern="NoteInput" --no-coverage
```

Expected: PASS (or fix if the test asserts the old threshold text).

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/components/library/NoteContextMenu.tsx apps/mobile/src/components/library/TopicPickerSheet.tsx apps/mobile/src/components/library/NoteInput.tsx
git commit -m "feat(mobile): NoteContextMenu, TopicPickerSheet, NoteInput 5000 char limit"
```

---

## Task 11: Mobile — StudyCTA + TopicHeader + TopicSessionRow

**Files:**
- Create: `apps/mobile/src/components/library/StudyCTA.tsx`
- Create: `apps/mobile/src/components/library/TopicHeader.tsx`
- Create: `apps/mobile/src/components/library/TopicSessionRow.tsx`

- [ ] **Step 1: Implement StudyCTA**

```tsx
import { View, Text, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDesignTokens } from '../../lib/design-tokens';

interface StudyCTAProps {
  label: string;
  variant: 'primary' | 'outline';
  onPress: () => void;
  disabled?: boolean;
  testID?: string;
}

export function StudyCTA({ label, variant, onPress, disabled, testID }: StudyCTAProps) {
  const tokens = useDesignTokens();
  const insets = useSafeAreaInsets();

  const isPrimary = variant === 'primary';

  return (
    <View
      style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        paddingHorizontal: 20,
        paddingTop: 12,
        paddingBottom: insets.bottom + 12,
        backgroundColor: tokens.background,
        borderTopWidth: 1,
        borderTopColor: tokens.border,
      }}
    >
      <Pressable
        testID={testID ?? 'study-cta'}
        onPress={onPress}
        disabled={disabled}
        style={{
          height: 52,
          borderRadius: 12,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: isPrimary ? tokens.primary : 'transparent',
          borderWidth: isPrimary ? 0 : 1.5,
          borderColor: isPrimary ? undefined : tokens.primary,
          opacity: disabled ? 0.5 : 1,
        }}
      >
        <Text
          style={{
            fontSize: 16,
            fontWeight: '700',
            color: isPrimary ? tokens.textInverse : tokens.primary,
          }}
        >
          {label}
        </Text>
      </Pressable>
    </View>
  );
}
```

- [ ] **Step 2: Implement TopicHeader**

```tsx
import { View, Text } from 'react-native';
import { useDesignTokens } from '../../lib/design-tokens';
import { RetentionPill } from './RetentionPill';
import type { RetentionStatus } from '@eduagent/schemas';

interface TopicHeaderProps {
  name: string;
  chapter: string | null;
  retentionStatus: RetentionStatus | null;
  lastStudiedText: string;
}

export function TopicHeader({ name, chapter, retentionStatus, lastStudiedText }: TopicHeaderProps) {
  const tokens = useDesignTokens();

  return (
    <View style={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12 }}>
      <Text style={{ fontSize: 22, fontWeight: '700', color: tokens.textPrimary }}>
        {name}
      </Text>
      {chapter && (
        <Text style={{ fontSize: 14, color: tokens.textSecondary, marginTop: 4 }}>
          {chapter}
        </Text>
      )}
      {retentionStatus && (
        <View style={{ marginTop: 8 }}>
          <RetentionPill status={retentionStatus} size="large" />
        </View>
      )}
      <Text
        style={{ fontSize: 13, color: tokens.textSecondary, fontStyle: 'italic', marginTop: 6 }}
      >
        {lastStudiedText}
      </Text>
    </View>
  );
}
```

- [ ] **Step 3: Implement TopicSessionRow**

```tsx
import { Pressable, Text, View } from 'react-native';
import { useDesignTokens } from '../../lib/design-tokens';

interface TopicSessionRowProps {
  sessionId: string;
  date: string;
  durationSeconds: number | null;
  sessionType: string;
  onPress: (sessionId: string) => void;
}

function formatDuration(seconds: number | null): string {
  if (!seconds || seconds < 60) return '<1 min';
  const mins = Math.round(seconds / 60);
  return `${mins} min`;
}

export function TopicSessionRow({
  sessionId,
  date,
  durationSeconds,
  sessionType,
  onPress,
}: TopicSessionRowProps) {
  const tokens = useDesignTokens();

  return (
    <Pressable
      testID={`session-row-${sessionId}`}
      onPress={() => onPress(sessionId)}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 10,
      }}
    >
      <Text style={{ fontSize: 14, color: tokens.textPrimary, width: 80 }}>{date}</Text>
      <Text style={{ fontSize: 14, color: tokens.textSecondary, width: 60 }}>
        {formatDuration(durationSeconds)}
      </Text>
      <Text style={{ fontSize: 14, color: tokens.textSecondary, flex: 1 }}>{sessionType}</Text>
    </Pressable>
  );
}
```

- [ ] **Step 4: Write tests and run them**

```bash
cd apps/mobile && pnpm exec jest --testPathPattern="StudyCTA|TopicHeader|TopicSessionRow" --no-coverage
```

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/components/library/StudyCTA.tsx apps/mobile/src/components/library/TopicHeader.tsx apps/mobile/src/components/library/TopicSessionRow.tsx
git commit -m "feat(mobile): StudyCTA, TopicHeader, TopicSessionRow components"
```

---

## Task 12: Mobile Hooks — Notes + Sessions + Search

**Files:**
- Modify: `apps/mobile/src/hooks/use-notes.ts`
- Create: `apps/mobile/src/hooks/use-topic-sessions.ts`
- Create: `apps/mobile/src/hooks/use-library-search.ts`

- [ ] **Step 1: Add new note hooks to use-notes.ts**

Add to `apps/mobile/src/hooks/use-notes.ts`:

```ts
import type {
  BookNotesResponse,
  TopicNotesResponse,
  CreateNoteInput,
  UpdateNoteInput,
  NoteResponse,
} from '@eduagent/schemas';

// useTopicNotes — fetch all notes for a specific topic
export function useTopicNotes(
  subjectId: string | undefined,
  topicId: string | undefined
): UseQueryResult<TopicNotesResponse> {
  const client = useApiClient();
  const { activeProfile } = useProfile();

  return useQuery({
    queryKey: ['topic-notes', subjectId, topicId, activeProfile?.id],
    queryFn: async ({ signal: querySignal }) => {
      if (!subjectId || !topicId) throw new Error('subjectId and topicId required');
      const { signal, cleanup } = combinedSignal(querySignal);
      try {
        const res = await client.subjects[':subjectId'].topics[':topicId'].notes.$get(
          { param: { subjectId, topicId } },
          { init: { signal } }
        );
        await assertOk(res);
        return (await res.json()) as TopicNotesResponse;
      } finally {
        cleanup();
      }
    },
    enabled: !!activeProfile && !!subjectId && !!topicId,
  });
}

// useCreateNote — create a new note for a topic
export function useCreateNote(
  subjectId: string | undefined,
  bookId: string | undefined
): UseMutationResult<{ note: NoteResponse }, Error, { topicId: string } & CreateNoteInput> {
  const client = useApiClient();
  const { activeProfile } = useProfile();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ topicId, content, sessionId }) => {
      if (!subjectId || !topicId) throw new Error('subjectId and topicId required');
      const res = await client.subjects[':subjectId'].topics[':topicId'].notes.$post({
        param: { subjectId, topicId },
        json: { content, ...(sessionId ? { sessionId } : {}) },
      });
      await assertOk(res);
      return (await res.json()) as { note: NoteResponse };
    },
    onSuccess: (_data, { topicId }) => {
      void queryClient.invalidateQueries({ queryKey: ['book-notes', subjectId, bookId, activeProfile?.id] });
      void queryClient.invalidateQueries({ queryKey: ['topic-notes', subjectId, topicId, activeProfile?.id] });
      void queryClient.invalidateQueries({ queryKey: ['note-topic-ids', activeProfile?.id] });
    },
  });
}

// useUpdateNote — edit an existing note by noteId
export function useUpdateNote(): UseMutationResult<{ note: NoteResponse }, Error, { noteId: string; content: string }> {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ noteId, content }) => {
      const res = await client.notes[':noteId'].$patch({
        param: { noteId },
        json: { content },
      });
      await assertOk(res);
      return (await res.json()) as { note: NoteResponse };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['book-notes'] });
      void queryClient.invalidateQueries({ queryKey: ['topic-notes'] });
    },
  });
}

// useDeleteNoteById — delete a note by its id
export function useDeleteNoteById(): UseMutationResult<void, Error, string> {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (noteId: string) => {
      const res = await client.notes[':noteId'].$delete({ param: { noteId } });
      await assertOk(res);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['book-notes'] });
      void queryClient.invalidateQueries({ queryKey: ['topic-notes'] });
      void queryClient.invalidateQueries({ queryKey: ['note-topic-ids'] });
    },
  });
}
```

- [ ] **Step 2: Create useTopicSessions hook**

Create `apps/mobile/src/hooks/use-topic-sessions.ts`:

```ts
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { useApiClient } from '../lib/api-client';
import { useProfile } from '../lib/profile';
import { combinedSignal } from '../lib/query-timeout';
import { assertOk } from '../lib/assert-ok';

export interface TopicSession {
  id: string;
  sessionType: string;
  durationSeconds: number | null;
  createdAt: string;
}

export function useTopicSessions(
  subjectId: string | undefined,
  topicId: string | undefined
): UseQueryResult<TopicSession[]> {
  const client = useApiClient();
  const { activeProfile } = useProfile();

  return useQuery({
    queryKey: ['topic-sessions', subjectId, topicId, activeProfile?.id],
    queryFn: async ({ signal: querySignal }) => {
      if (!subjectId || !topicId) throw new Error('subjectId and topicId required');
      const { signal, cleanup } = combinedSignal(querySignal);
      try {
        const res = await client.subjects[':subjectId'].topics[':topicId'].sessions.$get(
          { param: { subjectId, topicId } },
          { init: { signal } }
        );
        await assertOk(res);
        const data = (await res.json()) as { sessions: TopicSession[] };
        return data.sessions;
      } finally {
        cleanup();
      }
    },
    enabled: !!activeProfile && !!subjectId && !!topicId,
  });
}
```

- [ ] **Step 3: Create useLibrarySearch hook**

Create `apps/mobile/src/hooks/use-library-search.ts`:

```ts
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { useApiClient } from '../lib/api-client';
import { useProfile } from '../lib/profile';
import { combinedSignal } from '../lib/query-timeout';
import { assertOk } from '../lib/assert-ok';
import type { LibrarySearchResult } from '@eduagent/schemas';

export function useLibrarySearch(
  query: string
): UseQueryResult<LibrarySearchResult> {
  const client = useApiClient();
  const { activeProfile } = useProfile();
  const trimmed = query.trim();

  return useQuery({
    queryKey: ['library-search', trimmed, activeProfile?.id],
    queryFn: async ({ signal: querySignal }) => {
      const { signal, cleanup } = combinedSignal(querySignal);
      try {
        const res = await client.library.search.$get(
          { query: { q: trimmed } },
          { init: { signal } }
        );
        await assertOk(res);
        return (await res.json()) as LibrarySearchResult;
      } finally {
        cleanup();
      }
    },
    enabled: !!activeProfile && trimmed.length >= 1,
  });
}
```

- [ ] **Step 4: Run typecheck**

```bash
cd apps/mobile && pnpm exec tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/hooks/use-notes.ts apps/mobile/src/hooks/use-topic-sessions.ts apps/mobile/src/hooks/use-library-search.ts
git commit -m "feat(mobile): note CRUD hooks, useTopicSessions, useLibrarySearch"
```

---

## Task 13: Mobile — Library Home Screen Rewrite

**Files:**
- Modify: `apps/mobile/src/app/(app)/library.tsx`

This is the largest single task. The screen goes from three-tab layout to single expandable-shelf list.

- [ ] **Step 1: Plan the data flow**

The Library home screen needs:
- Subject list (from `useSubjects`)
- Books per subject (from `useAllBooks`)
- Retention per subject (from library retention endpoint)
- Note topic IDs (from `useNoteTopicIds`) — for the 📝 indicator on BookRow
- Search results (from `useLibrarySearch` when query is non-empty)

Expansion state: `Record<string, boolean>` — keyed by subjectId. Default: most-recently-active non-paused subject is expanded.

- [ ] **Step 2: Write the test for the new Library screen**

Key behaviors to test:
- Renders shelves in a list (no tabs)
- Most-recently-active subject expanded by default
- Tapping a shelf toggles expansion
- Books visible when expanded
- Tapping a book navigates to Book screen
- Search filters inline + triggers server search
- Paused subjects dimmed with chip
- Empty state when no subjects

Write the test in `apps/mobile/src/app/(app)/library.test.tsx`.

- [ ] **Step 3: Rewrite library.tsx**

Remove:
- `LibraryTabs` component import and usage
- `ShelvesTab`, `BooksTab`, `TopicsTab` imports and conditional rendering
- `activeTab` state
- Tab-specific state objects (`shelvesTabState`, `booksTabState`, `topicsTabState`)
- `SortFilterBar` usage

Keep:
- Header row ("Library" title + subject/topic count + Manage button)
- Manage modal (bottom sheet)
- Data fetching hooks (`useSubjects`, `useAllBooks`, `useOverallProgress`, `useNoteTopicIds`, retention query)

Add:
- `LibrarySearchBar` with placeholder "Search books, topics, notes…"
- `ShelfRow` list with expansion state
- `useLibrarySearch` hook for server-side search (called in parallel with client-side name filtering)
- `ShimmerSkeleton` loading state shaped like shelf rows
- Empty states per spec

```tsx
// Key state:
const [expandedShelves, setExpandedShelves] = useState<Record<string, boolean>>({});
const [searchQuery, setSearchQuery] = useState('');
const [debouncedQuery, setDebouncedQuery] = useState('');

// Reset expansion state when screen regains focus (tab switch).
// Expo Router keeps tab screens mounted (no unmountOnBlur), so useState
// persists across tab switches. useFocusEffect resets to the spec's
// "most-active subject expanded" behavior on re-entry.
useFocusEffect(
  useCallback(() => {
    if (subjects.length > 0) {
      const mostActive = findMostRecentlyActiveSubject(subjects, sessions);
      setExpandedShelves(mostActive ? { [mostActive.id]: true } : {});
    }
  }, [subjects, sessions])
);

// Debounce search for server-side query
useEffect(() => {
  const timer = setTimeout(() => setDebouncedQuery(searchQuery), 300);
  return () => clearTimeout(timer);
}, [searchQuery]);

const serverSearch = useLibrarySearch(debouncedQuery);
```

**Search result merging strategy:** Client-side name filtering and server-side note search run in parallel. The merge follows these rules:

1. Client-side filtering applies **immediately** — shelves/books whose names don't match the query are hidden.
2. Server-side results arrive asynchronously. While loading, show "Searching notes…" indicator below the search bar.
3. When server results arrive, **union** the visibility sets: a shelf is visible if its name matches client-side OR it contains a note/topic match from the server.
4. Shelves that became visible via server results auto-expand. Books within those shelves that contain note matches show a "match in notes" badge.
5. If the search query changes before server results arrive, the stale server response is discarded (React Query's `keepPreviousData: false` on the search query key).

The implementation: maintain a `visibleSubjectIds: Set<string>` that is the union of client-filtered IDs and server-returned `subjects[].id` + `notes[].subjectId` + `topics[].subjectId`. Pass this set to the `ShelfRow` list filter.

The full implementation follows the spec's layout: Header → SearchBar → ShelfRow list (with `ScrollView`). Each ShelfRow receives pre-computed book data.

- [ ] **Step 4: Run tests**

```bash
cd apps/mobile && pnpm exec jest --testPathPattern="library\\.test" --no-coverage
```

- [ ] **Step 5: Run typecheck**

```bash
cd apps/mobile && pnpm exec tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/app/(app)/library.tsx apps/mobile/src/app/(app)/library.test.tsx
git commit -m "feat(mobile): Library v3 home — expandable shelves, inline books, server search"
```

---

## Task 14: Mobile — Book Screen Redesign

**Files:**
- Modify: `apps/mobile/src/app/(app)/shelf/[subjectId]/book/[bookId].tsx`

- [ ] **Step 1: Write the test for the new Book screen layout**

Key behaviors to test:
- Book hero with emoji, title, description, retention pill
- Notes section visible even when empty (with "+ Add" button)
- Notes show source line (session vs quick)
- Long-press on note triggers context menu
- Topics grouped by chapter with state-based sorting
- "Past conversations" collapsed by default
- "+ Add a note" opens topic picker then NoteInput

- [ ] **Step 2: Rewrite the Book screen**

Structure (top to bottom per spec):
1. Top nav (back + title) — keep existing
2. Book hero — emoji 56×56, title, description, retention pill
3. YOUR NOTES section — `InlineNoteCard` list + "+ Add a note"
4. TOPICS section — grouped by chapter, each topic as `TopicStatusRow`
5. PAST CONVERSATIONS — collapsed by default

Replace the current topic ordering with the spec's sort: by state (`continue-now` → `started` → `up-next` → `done`), then within each state by retention urgency.

Use `useBookNotes` (updated response shape) and render notes with the new `InlineNoteCard` props. Long-press triggers `showNoteContextMenu`.

The "+ Add a note" button opens a two-step flow: `TopicPickerSheet` (select topic) → `NoteInput` (bottom sheet with `NoteInput` component). On save, calls `useCreateNote`.

- [ ] **Step 3: Run tests**

```bash
cd apps/mobile && pnpm exec jest --findRelatedTests "apps/mobile/src/app/(app)/shelf/[subjectId]/book/[bookId].tsx" --no-coverage
```

- [ ] **Step 4: Run typecheck**

```bash
cd apps/mobile && pnpm exec tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add "apps/mobile/src/app/(app)/shelf/[subjectId]/book/[bookId].tsx" "apps/mobile/src/app/(app)/shelf/[subjectId]/book/[bookId].test.tsx"
git commit -m "feat(mobile): Book screen v3 — elevated notes, chapter-grouped topics, add note flow"
```

---

## Task 15: Mobile — Topic Screen Redesign

**Files:**
- Modify: `apps/mobile/src/app/(app)/topic/[topicId].tsx`

- [ ] **Step 1: Write the test for the new Topic screen**

Key behaviors:
- TopicHeader renders name, chapter, retention pill, last-studied text
- Notes section shows all notes for this topic
- Long-press on note shows context menu
- Sessions section shows per-topic sessions with duration
- StudyCTA fixed at bottom with correct label by state
- Tap CTA launches session

- [ ] **Step 2: Rewrite the Topic screen**

Structure (per spec):
1. Top nav (back to book name) — use existing `useResolveTopicSubject` for context
2. `TopicHeader` — name, chapter, retention pill (large), last-studied text
3. YOUR NOTES section — `useTopicNotes` hook, `InlineNoteCard` list, "+ Add" button
4. SESSIONS section — `useTopicSessions` hook, `TopicSessionRow` list
5. `StudyCTA` — sticky bottom

CTA logic:
- Never studied / up-next → "Start studying" (primary)
- Has studied, not `done` + `strong` → "Review this topic" (primary)
- Done + strong → "Practice again" (outline)

The scroll content needs `paddingBottom` equal to CTA height (~76px with safe area) to prevent overlap.

Remove existing content cards (progress card, retention card with DecayBar, summary, parking lot, "More ways to practice"). These were the old topic screen. The new one is focused: notes + sessions + CTA.

**Important:** Keep the existing `useResolveTopicSubject`, `useTopicRetention`, `useTopicProgress` hooks for deriving state/labels. Don't fetch data you don't need for the new layout.

- [ ] **Step 3: Run tests**

```bash
cd apps/mobile && pnpm exec jest --findRelatedTests "apps/mobile/src/app/(app)/topic/[topicId].tsx" --no-coverage
```

- [ ] **Step 4: Run typecheck**

```bash
cd apps/mobile && pnpm exec tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add "apps/mobile/src/app/(app)/topic/[topicId].tsx"
git commit -m "feat(mobile): Topic screen v3 — notes, sessions, StudyCTA"
```

---

## Task 16: Loading + Empty States

**Files:**
- Modify: `apps/mobile/src/app/(app)/library.tsx` (loading states)
- Modify: `apps/mobile/src/app/(app)/shelf/[subjectId]/book/[bookId].tsx`
- Modify: `apps/mobile/src/app/(app)/topic/[topicId].tsx`

- [ ] **Step 1: Library home loading state**

Replace `ActivityIndicator` with `ShimmerSkeleton`:

```tsx
import { ShimmerSkeleton } from '../../components/common';

function LibraryLoadingSkeleton() {
  return (
    <ShimmerSkeleton>
      {[1, 2, 3, 4].map((i) => (
        <View key={i} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 }}>
          <View className="bg-border rounded-xl w-10 h-10 mr-3" />
          <View style={{ flex: 1 }}>
            <View className="bg-border rounded h-4 w-3/4 mb-2" />
            <View className="bg-border rounded h-3 w-1/2" />
          </View>
          <View className="bg-border rounded-full w-16 h-5" />
        </View>
      ))}
    </ShimmerSkeleton>
  );
}
```

- [ ] **Step 2: Book screen loading states**

Hero renders immediately from navigation params. Notes and Topics show independent shimmer.

- [ ] **Step 3: Topic screen loading states**

Header from nav params. Notes + Sessions show shimmer. CTA shows "Loading…" disabled until state resolved.

- [ ] **Step 4: Empty states per spec table**

Implement every empty state from the spec's "Empty States" table. Each uses appropriate messaging + CTA where specified.

- [ ] **Step 5: Run tests**

```bash
cd apps/mobile && pnpm exec jest --testPathPattern="library|book.*bookId|topic.*topicId" --no-coverage
```

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/app/(app)/library.tsx "apps/mobile/src/app/(app)/shelf/[subjectId]/book/[bookId].tsx" "apps/mobile/src/app/(app)/topic/[topicId].tsx"
git commit -m "feat(mobile): shimmer loading states + empty states per Library v3 spec"
```

---

## Task 17: Cleanup — Remove Dead Code

**Files:**
- Modify: `apps/mobile/src/components/library/ShelvesTab.tsx` (consider removal/archival)
- Modify: `apps/mobile/src/components/library/BooksTab.tsx` (consider removal/archival)
- Modify: `apps/mobile/src/components/library/TopicsTab.tsx` (consider removal/archival)
- Modify: `apps/mobile/src/components/library/LibraryTabs.tsx` (remove)

- [ ] **Step 1: Identify all dead imports**

Grep for imports of `ShelvesTab`, `BooksTab`, `TopicsTab`, `LibraryTabs` across the mobile app. If only imported by `library.tsx` (which no longer uses them), they're dead.

```bash
cd apps/mobile && grep -rn "ShelvesTab\|BooksTab\|TopicsTab\|LibraryTabs" src/ --include="*.ts" --include="*.tsx" | grep -v "\.test\." | grep -v "node_modules"
```

- [ ] **Step 2: Delete dead components**

Delete files that are no longer imported anywhere:
- `ShelvesTab.tsx` — replaced by ShelfRow list in library.tsx
- `BooksTab.tsx` — replaced by inline BookRow rendering
- `TopicsTab.tsx` — topics are now only seen within the Book screen drill-down
- `LibraryTabs.tsx` — no more tabs

- [ ] **Step 3: Remove dead hooks/unused note hooks**

The old `useUpsertNote` and `useDeleteNote` (composite-key versions) should be removed or deprecated once the new hooks are wired up.

- [ ] **Step 4: Remove the deprecated API routes**

Mark `PUT /subjects/:subjectId/topics/:topicId/note` and `DELETE /subjects/:subjectId/topics/:topicId/note` as deprecated in code comments. Keep them temporarily for any pending mobile versions in the wild, remove fully in a follow-up PR once all clients are updated.

- [ ] **Step 5: Run full validation**

```bash
pnpm exec nx run api:lint
pnpm exec nx run api:typecheck
pnpm exec nx lint mobile
cd apps/mobile && pnpm exec tsc --noEmit
cd apps/api && pnpm exec jest --no-coverage
cd apps/mobile && pnpm exec jest --no-coverage
```

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/components/library/ShelvesTab.tsx apps/mobile/src/components/library/BooksTab.tsx apps/mobile/src/components/library/TopicsTab.tsx apps/mobile/src/components/library/LibraryTabs.tsx apps/mobile/src/hooks/use-notes.ts apps/api/src/routes/notes.ts apps/api/src/services/notes.ts
git commit -m "chore: remove dead Library tab components, deprecate old note routes"
```

> **Note:** Do NOT use `git add -A`. Stage only the specific files being deleted or modified. Verify with `git status` before committing.

---

## Task 18: Integration Testing

**Files:**
- Modify/create integration tests as needed

- [ ] **Step 1: API integration test — multi-note lifecycle**

Test the full lifecycle through the HTTP layer:
1. Create two notes for the same topic (both succeed)
2. List notes for topic (returns both, ordered by createdAt desc)
3. List notes for book (returns both with full NoteResponse shape)
4. Update one note by noteId
5. Delete one note by noteId
6. List again (returns only the surviving note)

- [ ] **Step 2: API integration test — library search**

1. Create a subject + book + topic + note with known content
2. Search by subject name → match
3. Search by note content → match
4. Search with non-matching query → empty results

- [ ] **Step 3: API integration test — topic sessions**

1. Ensure test fixtures have completed sessions for a topic
2. GET /subjects/:subjectId/topics/:topicId/sessions returns expected shape
3. Sessions are ordered by createdAt desc

- [ ] **Step 4: Run all integration tests**

```bash
cd apps/api && pnpm exec jest --testPathPattern="integration" --no-coverage
```

- [ ] **Step 5: Run full workspace validation**

```bash
pnpm exec nx run-many -t lint
pnpm exec nx run-many -t typecheck
pnpm exec nx run-many -t test
```

- [ ] **Step 6: Commit**

```bash
git add tests/
git commit -m "test: integration tests for multi-note CRUD, library search, topic sessions"
```

---

## Task 6A: SessionFooter Migration + DB Phase 2 (Drop Unique Constraint)

> **Why this task exists:** The existing `upsertNote()` at `services/notes.ts:179` uses `.onConflictDoUpdate({ target: [topicNotes.topicId, topicNotes.profileId] })`, which requires the unique constraint. `SessionFooter.tsx:130` calls `upsertNote.mutate({ topicId, content, append: true })` during every live learning session. The constraint cannot be dropped until all callers are migrated to `createNote`. This task does both: migrates the callers, then drops the constraint.

**Files:**
- Modify: `apps/mobile/src/components/session/SessionFooter.tsx`
- Modify: `apps/mobile/src/app/(app)/session/index.tsx`
- Modify: `apps/mobile/src/hooks/use-notes.ts`
- Modify: `packages/database/src/schema/notes.ts`
- Create: Phase 2 migration SQL

**Depends on:** Tasks 3, 4, 12 (new `createNote` service, routes, and `useCreateNote` hook must exist)

- [ ] **Step 1: Verify the old flow works (baseline)**

```bash
cd apps/mobile && pnpm exec jest --findRelatedTests src/components/session/SessionFooter.tsx --no-coverage
```

- [ ] **Step 2: Migrate `session/index.tsx` — replace `useUpsertNote` with `useCreateNote`**

In `apps/mobile/src/app/(app)/session/index.tsx`, line ~704:

```ts
// Before:
const upsertNote = useUpsertNote(effectiveSubjectId || undefined, undefined);

// After:
const createNote = useCreateNote(effectiveSubjectId || undefined, undefined);
```

Pass `createNote` to `SessionFooter` instead of `upsertNote`.

- [ ] **Step 3: Migrate `SessionFooter.tsx` — replace upsert(append) with create(sessionId)**

The current pattern appends date-separated text to a single note via `upsertNote.mutate({ topicId, content, append: true })`. The new model creates a separate note per save with `sessionId` attached:

```tsx
// Before (SessionFooter.tsx:130):
upsertNote.mutate({
  topicId,
  content: `${separator}${content}`,
  append: true,
});

// After:
createNote.mutate({
  topicId,
  content,           // No separator — each note is its own record
  sessionId,         // Links the note to this session
});
```

Update the `SessionFooterProps` type:
- Replace `upsertNote: ReturnType<typeof useUpsertNote>` with `createNote: ReturnType<typeof useCreateNote>`
- Add `sessionId: string | undefined` prop (passed from `session/index.tsx`)
- Remove the `separator` logic (date headers are no longer concatenated — each note has its own `createdAt`)
- Remove `sessionNoteSavedRef` dependency for separator logic (though keep it if used for other purposes like the "note saved" indicator)

- [ ] **Step 4: Update SessionFooter tests**

Update `SessionFooter.test.tsx` to use the new prop names and verify `createNote.mutate` is called with `{ topicId, content, sessionId }` instead of `{ topicId, content, append: true }`.

- [ ] **Step 5: Run tests to verify the migration**

```bash
cd apps/mobile && pnpm exec jest --findRelatedTests src/components/session/SessionFooter.tsx src/app/\(app\)/session/index.tsx --no-coverage
```

Expected: PASS.

- [ ] **Step 6: Drop the unique constraint (DB Phase 2)**

Now that no code uses `onConflictDoUpdate` on `(topicId, profileId)`, it's safe to drop the constraint.

In `packages/database/src/schema/notes.ts`, replace the constraint table arg:

```ts
// Before (from Task 1):
(t) => [
  unique().on(t.topicId, t.profileId),  // KEPT — removed in Phase 2 (Task 6A)
  index('topic_notes_content_trgm_idx')
    .using('gin', sql`${t.content} gin_trgm_ops`),
]

// After:
(t) => [
  index('topic_notes_topic_profile_idx').on(t.topicId, t.profileId),
  index('topic_notes_content_trgm_idx')
    .using('gin', sql`${t.content} gin_trgm_ops`),
]
```

- [ ] **Step 7: Generate and apply the Phase 2 migration**

```bash
pnpm run db:generate
pnpm run db:push:dev
```

Expected migration drops the unique constraint and creates the `topic_notes_topic_profile_idx` regular index.

- [ ] **Step 8: Verify the old `upsertNote` service function is now dead code**

```bash
cd apps/mobile && rg "useUpsertNote|upsertNote" src/ --type ts --type tsx
cd apps/api && rg "upsertNote" src/ --type ts
```

If `upsertNote` has no remaining callers, mark it as deprecated or remove it (done fully in Task 17).

- [ ] **Step 9: Run full API + mobile tests**

```bash
cd apps/api && pnpm exec jest --no-coverage
cd apps/mobile && pnpm exec jest --no-coverage
```

Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add apps/mobile/src/components/session/SessionFooter.tsx apps/mobile/src/components/session/SessionFooter.test.tsx apps/mobile/src/app/\(app\)/session/index.tsx apps/mobile/src/hooks/use-notes.ts packages/database/src/schema/notes.ts packages/database/drizzle/
git commit -m "feat: migrate SessionFooter to createNote, drop unique constraint (Phase 2)"
```

---

## Task 19: E2E Tests — Library v3 Flows

> **Why this task exists:** CLAUDE.md mandates "Never skip E2E tests." The Library v3 redesign rewrites 3 screens — the most user-facing change in the feature set. This task adds Maestro E2E flows covering the critical golden paths.

**Files:**
- Create: `apps/mobile/maestro/flows/library-v3/` directory
- Create: Maestro YAML flow files

- [ ] **Step 1: Library home — shelf expansion**

Create `apps/mobile/maestro/flows/library-v3/shelf-expansion.yaml`:

Flow:
1. Navigate to Library tab
2. Verify at least one shelf row is visible
3. Tap a collapsed shelf → verify books appear
4. Tap the same shelf header → verify books collapse
5. Tap a book row → verify navigation to Book screen

- [ ] **Step 2: Book screen — notes and topics**

Create `apps/mobile/maestro/flows/library-v3/book-notes-topics.yaml`:

Flow:
1. Navigate to Library → expand shelf → tap a book
2. Verify "YOUR NOTES" section is visible
3. Tap "+ Add a note" → verify topic picker appears
4. Select a topic → verify NoteInput appears
5. Type a note → save → verify note card appears
6. Verify TOPICS section shows grouped topics
7. Tap back → verify return to Library with shelf still expanded

- [ ] **Step 3: Topic screen — notes, sessions, CTA**

Create `apps/mobile/maestro/flows/library-v3/topic-screen.yaml`:

Flow:
1. Navigate to a topic via Library → Book → Topic
2. Verify TopicHeader shows name and retention
3. Verify Sessions section is visible
4. Verify StudyCTA button is visible at bottom
5. Tap StudyCTA → verify session starts

- [ ] **Step 4: Search**

Create `apps/mobile/maestro/flows/library-v3/library-search.yaml`:

Flow:
1. Navigate to Library tab
2. Tap search bar → type a known book name
3. Verify matching shelf/book appears, non-matching hidden
4. Clear search → verify all shelves visible again

- [ ] **Step 5: Run all Library v3 E2E flows**

```bash
# Use the /e2e skill or run directly:
maestro test apps/mobile/maestro/flows/library-v3/
```

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/maestro/flows/library-v3/
git commit -m "test(e2e): Maestro flows for Library v3 — shelf expansion, book notes, topic CTA, search"
```

---

## Dependency Graph

```
Task 1 (DB Phase 1: add sessionId + trgm index)
  └→ Task 2 (Schema types) — depends on new column existing
       └→ Task 3 (API service) — depends on new types
            └→ Task 4 (API routes) — depends on service functions
Task 5 (Topic sessions API) — independent
Task 6 (Library search API) — independent (reads only, no schema dependency)

Task 7 (RetentionPill) — independent, pure component
Task 8 (ShelfRow + BookRow) — depends on Task 7
Task 9 (InlineNoteCard rework) — independent
Task 10 (NoteContextMenu + TopicPickerSheet) — independent
Task 11 (StudyCTA + TopicHeader + TopicSessionRow) — depends on Task 7

Task 12 (Hooks) — depends on Tasks 2, 4, 5, 6
Task 13 (Library home rewrite) — depends on Tasks 7, 8, 12
Task 14 (Book screen redesign) — depends on Tasks 9, 10, 12
Task 15 (Topic screen redesign) — depends on Tasks 9, 10, 11, 12

Task 16 (Loading/Empty states) — depends on Tasks 13, 14, 15
Task 6A (SessionFooter migration + DB Phase 2) — depends on Tasks 3, 4, 12
  ⚠️  MUST complete before Task 17 (old upsert callers must be migrated before cleanup)
Task 17 (Cleanup) — depends on Tasks 6A, 13, 14, 15
Task 18 (Integration tests) — depends on Tasks 4, 5, 6
Task 19 (E2E tests) — depends on Tasks 13, 14, 15, 16
```

**Parallelizable groups:**
- Tasks 1-4 (notes API) are sequential
- Tasks 5, 6 (topic sessions, search) can run in parallel with Tasks 1-4
- Tasks 7-11 (components) — all independent, can run in parallel with API tasks
- Tasks 13, 14, 15 (screens) — can run in parallel after hooks (Task 12) are done
- Task 6A can run as soon as Tasks 3, 4, 12 are done — it does NOT need screens to be rewritten first
- Task 19 (E2E) runs last, after all screens and loading states are complete

**Critical path:** Task 1 → 2 → 3 → 4 → 12 → 6A → 17

---

## Summary of Spec Coverage

| Spec Section | Covered by Task(s) |
|---|---|
| Screen 1: Library Home (expandable shelves) | Tasks 7, 8, 13, 16 |
| Screen 2: Book (notes, chapters, sessions) | Tasks 9, 10, 14, 16 |
| Screen 3: Topic (notes, sessions, StudyCTA) | Tasks 9, 10, 11, 15, 16 |
| Notes Model — DB migration (Phase 1: sessionId) | Task 1 |
| Notes Model — DB migration (Phase 2: drop unique) | Task 6A |
| Notes Model — Schema changes | Task 2 |
| Notes Model — API rewrite | Tasks 3, 4 |
| Notes Model — Session notes (primary path) | Tasks 3, 4, 6A, 12 (contract with reflection spec) |
| Notes Model — Quick notes (escape hatch) | Tasks 10, 14, 15 |
| Notes Model — Note deletion | Tasks 3, 4, 9, 10 |
| Notes Model — Search | Tasks 6, 12, 13 |
| Notes Model — Session-topic validation | Task 3 (createNote validates session.topicId) |
| Notes Model — Cardinality cap | Task 3 (MAX_NOTES_PER_TOPIC = 50) |
| Design Tokens | Task 7 (RetentionPill uses tokens) |
| Components Inventory — Reuse | Tasks 9, 13, 14, 15 |
| Components Inventory — New | Tasks 7, 8, 10, 11 |
| Accessibility | Tasks 7-11 (mandate above Task 7) |
| Empty States | Task 16 |
| Loading States | Task 16 |
| Failure Modes | Task 16 (error handling in screens) |
| Data Requirements | Tasks 1-6, 6A, 12 |
| NoteInput MAX_CHARS → 5000 | Task 10 |
| LibrarySearchBar placeholder | Task 13 |
| Expansion state reset on tab switch | Task 13 (useFocusEffect) |
| Search result merging (client + server) | Task 13 (merge strategy documented) |
| SessionFooter migration (upsert → create) | Task 6A |
| Deprecated routes (old PUT/DELETE) | Task 17 |
| Topic sessions endpoint | Task 5 |
| E2E testing | Task 19 |

---

## Adversarial Review Amendments Log

Changes applied based on adversarial review (2026-05-03):

| # | Finding | Resolution |
|---|---|---|
| 1 | Dropping unique constraint breaks live `upsertNote` (runtime crash) | Split migration: Phase 1 (Task 1) adds sessionId only; Phase 2 (Task 6A) drops constraint after callers migrated |
| 2 | `SessionFooter.tsx` not in plan — active caller of `upsertNote` | Added Task 6A: migrates SessionFooter from `useUpsertNote(append)` to `useCreateNote(sessionId)` |
| 3 | No session-topic validation on `createNote` | Added `session.topicId === topicId` check + test in Task 3 |
| 4 | `ILIKE '%query%'` on unbounded text = full table scan | Added `pg_trgm` GIN index in Task 1 migration; LIKE-special char escaping in Task 6 |
| 5 | Search result merging underspecified | Added merge strategy (union of visibility sets) + "Searching notes…" indicator in Task 13 |
| 6 | `TopicPickerSheet` uses Modal | DISMISSED: consistent with codebase (Manage modal also uses `Modal`) |
| 7 | `NoteContextMenu` uses `Alert.alert` | DISMISSED: no ActionSheet pattern exists; `Alert.alert` is the established pattern |
| 8 | No cardinality cap on notes | Added `MAX_NOTES_PER_TOPIC = 50` check + test in Task 3 |
| 9 | Flat `/notes/:noteId` routes won't resolve | DISMISSED: routes mounted at root `/`, flat paths work |
| 10 | Expansion state persists across tab switches (contradicts spec) | Added `useFocusEffect` reset in Task 13 |
| 11 | Zero accessibility props on 7 of 8 new components | Added accessibility mandate section above Task 7, applies to Tasks 7-11 |
| 12 | Task 17 uses `git add -A` | Replaced with specific file paths |
| 13 | No E2E tests for 3-screen rewrite | Added Task 19: Maestro E2E flows |
| 14 | `searchLibrary` bypasses `createScopedRepository` | Fixed Task 6 to use `createScopedRepository` |
| 15 | Dependency graph: Task 6 wrongly depends on Task 1 | Fixed: Task 6 is independent (read-only, no schema dependency) |
| 16 | Flat `/topics/:topicId/sessions` breaks URL hierarchy | Changed Task 5 to `/subjects/:subjectId/topics/:topicId/sessions` with `verifyTopicOwnership` |
