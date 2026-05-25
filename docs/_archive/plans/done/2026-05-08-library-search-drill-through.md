# Library Search Drill-Through Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the unused `librarySearchResultSchema` payload to typed result rows with correct drill-through navigation, add session-summary search as a fifth result type, and delete the dead `library-filters.ts` file.

**Architecture:** Extend `librarySearchResultSchema` with display-name fields (subjectName, bookTitle, topicName, createdAt) and a new `sessions` array; update `searchLibrary` to project these; create a `LibrarySearchResults` component that renders five typed sections; replace the current "narrow the shelf grid" search behavior in `library.tsx` with the typed result rows when a query is active.

**Tech Stack:** Drizzle ORM, `@eduagent/schemas` (Zod), React Native + NativeWind, Expo Router, React Query, Jest + RNTL.

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `packages/schemas/src/library-search.ts` | Modify | Add `subjectName`, `bookTitle`, `topicName`, `createdAt` to existing types; add `sessionId` to notes; add `sessions` array |
| `apps/api/src/services/library-search.ts` | Modify | Project new fields; add fifth sessions query |
| `apps/api/src/services/library-search.integration.test.ts` | Create | API integration tests: new fields, sessions query, scoping |
| `apps/mobile/src/i18n/locales/en.json` | Modify | Add section header keys: `library.search.sections.*` |
| `apps/mobile/src/components/library/LibrarySearchResults.tsx` | Create | Typed result rows component |
| `apps/mobile/src/components/library/LibrarySearchResults.test.tsx` | Create | Unit tests for the component |
| `apps/mobile/src/app/(app)/library.tsx` | Modify | Replace grid-narrowing with `LibrarySearchResults`; add 5 nav handlers |
| `apps/mobile/src/app/(app)/library.test.tsx` | Modify | Add navigation integration tests |
| `apps/mobile/src/hooks/use-all-books.ts` | No change | `EnrichedBook` already inline (lines 9-16); no import to remove |
| `apps/mobile/src/lib/library-filters.ts` | Already deleted | File does not exist in main source; Task 8 is verification-only |

---

## Task 1: Write failing API integration tests

**Files:**
- Create: `apps/api/src/services/library-search.integration.test.ts`

- [ ] **Step 1: Create the test file**

```ts
import { resolve } from 'path';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import {
  accounts,
  createDatabase,
  generateUUIDv7,
  profiles,
  subjects,
  curriculumBooks,
  curriculumTopics,
  topicNotes,
  learningSessions,
  sessionSummaries,
  type Database,
} from '@eduagent/database';
import { searchLibrary } from './library-search';

loadDatabaseEnv(resolve(__dirname, '../../../..'));

let db: Database;
const RUN_ID = generateUUIDv7();
let counter = 0;

beforeAll(async () => {
  db = createDatabase();
});

async function seedProfile(): Promise<{ profileId: string }> {
  const idx = ++counter;
  const clerkUserId = `clerk_libsearch_${RUN_ID}_${idx}`;
  const email = `libsearch-${RUN_ID}-${idx}@test.invalid`;
  const [account] = await db
    .insert(accounts)
    .values({ clerkUserId, email })
    .returning({ id: accounts.id });
  const [profile] = await db
    .insert(profiles)
    .values({
      accountId: account!.id,
      displayName: 'Search Learner',
      birthYear: 2012,
      isOwner: true,
    })
    .returning({ id: profiles.id });
  return { profileId: profile!.id };
}

describe('searchLibrary', () => {
  describe('notes: sessionId field', () => {
    it('returns sessionId on matched note rows', async () => {
      const { profileId } = await seedProfile();
      const [subject] = await db.insert(subjects).values({ profileId, name: 'Biology', language: 'en' }).returning({ id: subjects.id });
      const [book] = await db.insert(curriculumBooks).values({ subjectId: subject!.id, title: 'Cell Biology', topicsGenerated: true }).returning({ id: curriculumBooks.id });
      const [topic] = await db.insert(curriculumTopics).values({ bookId: book!.id, title: 'Mitosis', position: 0 }).returning({ id: curriculumTopics.id });
      const [session] = await db.insert(learningSessions).values({ profileId, subjectId: subject!.id, topicId: topic!.id }).returning({ id: learningSessions.id });
      await db.insert(topicNotes).values({ topicId: topic!.id, profileId, sessionId: session!.id, content: 'mitochondria powerhouse' });

      const result = await searchLibrary(db, profileId, 'mitochondria');

      expect(result.notes).toHaveLength(1);
      expect(result.notes[0]!.sessionId).toBe(session!.id);
    });

    it('returns null sessionId when note has no source session', async () => {
      const { profileId } = await seedProfile();
      const [subject] = await db.insert(subjects).values({ profileId, name: 'Chemistry', language: 'en' }).returning({ id: subjects.id });
      const [book] = await db.insert(curriculumBooks).values({ subjectId: subject!.id, title: 'Organic Chemistry', topicsGenerated: true }).returning({ id: curriculumBooks.id });
      const [topic] = await db.insert(curriculumTopics).values({ bookId: book!.id, title: 'Alkenes', position: 0 }).returning({ id: curriculumTopics.id });
      await db.insert(topicNotes).values({ topicId: topic!.id, profileId, sessionId: null, content: 'double bond alkene' });

      const result = await searchLibrary(db, profileId, 'double bond');

      expect(result.notes).toHaveLength(1);
      expect(result.notes[0]!.sessionId).toBeNull();
    });
  });

  describe('notes: display-name fields', () => {
    it('returns subjectName, topicName, createdAt on note rows', async () => {
      const { profileId } = await seedProfile();
      const [subject] = await db.insert(subjects).values({ profileId, name: 'Physics', language: 'en' }).returning({ id: subjects.id });
      const [book] = await db.insert(curriculumBooks).values({ subjectId: subject!.id, title: 'Mechanics', topicsGenerated: true }).returning({ id: curriculumBooks.id });
      const [topic] = await db.insert(curriculumTopics).values({ bookId: book!.id, title: 'Newton Laws', position: 0 }).returning({ id: curriculumTopics.id });
      await db.insert(topicNotes).values({ topicId: topic!.id, profileId, content: 'inertia resist change' });

      const result = await searchLibrary(db, profileId, 'inertia');

      expect(result.notes[0]).toMatchObject({
        subjectName: 'Physics',
        topicName: 'Newton Laws',
        createdAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      });
    });
  });

  describe('sessions search', () => {
    it('returns sessions that match summary content', async () => {
      const { profileId } = await seedProfile();
      const [subject] = await db.insert(subjects).values({ profileId, name: 'History', language: 'en' }).returning({ id: subjects.id });
      const [book] = await db.insert(curriculumBooks).values({ subjectId: subject!.id, title: 'World Wars', topicsGenerated: true }).returning({ id: curriculumBooks.id });
      const [topic] = await db.insert(curriculumTopics).values({ bookId: book!.id, title: 'WWI Causes', position: 0 }).returning({ id: curriculumTopics.id });
      const [session] = await db.insert(learningSessions).values({ profileId, subjectId: subject!.id, topicId: topic!.id }).returning({ id: learningSessions.id });
      await db.insert(sessionSummaries).values({
        profileId,
        sessionId: session!.id,
        topicId: topic!.id,
        status: 'accepted',
        content: 'assassination of archduke triggered the war',
      });

      const result = await searchLibrary(db, profileId, 'archduke');

      expect(result.sessions).toHaveLength(1);
      expect(result.sessions[0]).toMatchObject({
        sessionId: session!.id,
        topicId: topic!.id,
        topicTitle: 'WWI Causes',
        subjectId: subject!.id,
        subjectName: 'History',
        snippet: expect.stringContaining('archduke'),
        occurredAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      });
    });

    it('matches across narrative, learnerRecap, aiFeedback, highlight, closingLine fields', async () => {
      const { profileId } = await seedProfile();
      const [subject] = await db.insert(subjects).values({ profileId, name: 'Geography', language: 'en' }).returning({ id: subjects.id });
      const [session] = await db.insert(learningSessions).values({ profileId, subjectId: subject!.id }).returning({ id: learningSessions.id });
      await db.insert(sessionSummaries).values({
        profileId,
        sessionId: session!.id,
        status: 'submitted',
        narrative: 'tectonic plates collide to form mountains',
      });

      const result = await searchLibrary(db, profileId, 'tectonic');

      expect(result.sessions).toHaveLength(1);
      expect(result.sessions[0]!.snippet).toContain('tectonic');
    });

    it('excludes purged session summaries', async () => {
      const { profileId } = await seedProfile();
      const [subject] = await db.insert(subjects).values({ profileId, name: 'Music', language: 'en' }).returning({ id: subjects.id });
      const [session] = await db.insert(learningSessions).values({ profileId, subjectId: subject!.id }).returning({ id: learningSessions.id });
      await db.insert(sessionSummaries).values({
        profileId,
        sessionId: session!.id,
        status: 'accepted',
        content: 'sonata form exposition development recapitulation',
        purgedAt: new Date(),
      });

      const result = await searchLibrary(db, profileId, 'sonata');

      expect(result.sessions).toHaveLength(0);
    });

    it('excludes pending and skipped summaries', async () => {
      const { profileId } = await seedProfile();
      const [subject] = await db.insert(subjects).values({ profileId, name: 'Art', language: 'en' }).returning({ id: subjects.id });
      const [sessionA] = await db.insert(learningSessions).values({ profileId, subjectId: subject!.id }).returning({ id: learningSessions.id });
      const [sessionB] = await db.insert(learningSessions).values({ profileId, subjectId: subject!.id }).returning({ id: learningSessions.id });
      await db.insert(sessionSummaries).values([
        { profileId, sessionId: sessionA!.id, status: 'pending', content: 'impressionism brushstroke technique' },
        { profileId, sessionId: sessionB!.id, status: 'skipped', content: 'impressionism light and shadow' },
      ]);

      const result = await searchLibrary(db, profileId, 'impressionism');

      expect(result.sessions).toHaveLength(0);
    });

    it('includes freeform sessions with topicId null', async () => {
      const { profileId } = await seedProfile();
      const [subject] = await db.insert(subjects).values({ profileId, name: 'Science', language: 'en' }).returning({ id: subjects.id });
      const [session] = await db.insert(learningSessions).values({ profileId, subjectId: subject!.id, topicId: null }).returning({ id: learningSessions.id });
      await db.insert(sessionSummaries).values({
        profileId,
        sessionId: session!.id,
        topicId: null,
        status: 'auto_closed',
        content: 'photosynthesis freeform exploration',
      });

      const result = await searchLibrary(db, profileId, 'photosynthesis');

      expect(result.sessions).toHaveLength(1);
      expect(result.sessions[0]!.topicId).toBeNull();
      expect(result.sessions[0]!.topicTitle).toBeNull();
      expect(result.sessions[0]!.bookId).toBeNull();
    });

    it('does not return another profile\'s session summaries', async () => {
      const { profileId: profileA } = await seedProfile();
      const { profileId: profileB } = await seedProfile();
      const [subject] = await db.insert(subjects).values({ profileId: profileA, name: 'Philosophy', language: 'en' }).returning({ id: subjects.id });
      const [session] = await db.insert(learningSessions).values({ profileId: profileA, subjectId: subject!.id }).returning({ id: learningSessions.id });
      await db.insert(sessionSummaries).values({
        profileId: profileA,
        sessionId: session!.id,
        status: 'accepted',
        content: 'cogito ergo sum',
      });

      const result = await searchLibrary(db, profileB, 'cogito');

      expect(result.sessions).toHaveLength(0);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/api && pnpm exec jest src/services/library-search.integration.test.ts --no-coverage
```

Expected: FAIL — `result.notes[0].sessionId` is undefined, `result.sessions` is undefined.

- [ ] **Step 3: Commit the failing tests**

```bash
git add apps/api/src/services/library-search.integration.test.ts
git commit -m "test(library-search): add failing integration tests for drill-through fields and sessions query"
```

---

## Task 2: Extend schema + API service (make Task 1 tests pass)

**Files:**
- Modify: `packages/schemas/src/library-search.ts`
- Modify: `apps/api/src/services/library-search.ts`

- [ ] **Step 1: Extend `librarySearchResultSchema`**

Replace the entire contents of `packages/schemas/src/library-search.ts`:

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
      subjectName: z.string(),
      title: z.string(),
    })
  ),
  topics: z.array(
    z.object({
      id: z.string().uuid(),
      bookId: z.string().uuid(),
      bookTitle: z.string(),
      subjectId: z.string().uuid(),
      subjectName: z.string(),
      name: z.string(),
    })
  ),
  notes: z.array(
    z.object({
      id: z.string().uuid(),
      sessionId: z.string().uuid().nullable(),
      topicId: z.string().uuid(),
      topicName: z.string(),
      bookId: z.string().uuid(),
      subjectId: z.string().uuid(),
      subjectName: z.string(),
      contentSnippet: z.string(),
      createdAt: z.string().datetime(),
    })
  ),
  sessions: z.array(
    z.object({
      sessionId: z.string().uuid(),
      topicId: z.string().uuid().nullable(),
      topicTitle: z.string().nullable(),
      bookId: z.string().uuid().nullable(),
      subjectId: z.string().uuid(),
      subjectName: z.string(),
      snippet: z.string(),
      occurredAt: z.string().datetime(),
    })
  ),
});
export type LibrarySearchResult = z.infer<typeof librarySearchResultSchema>;
```

- [ ] **Step 2: Update `searchLibrary` service**

Replace `apps/api/src/services/library-search.ts`:

```ts
import {
  eq,
  and,
  ilike,
  asc,
  desc,
  or,
  isNull,
  inArray,
} from 'drizzle-orm';
import {
  subjects,
  curriculumBooks,
  curriculumTopics,
  topicNotes,
  learningSessions,
  sessionSummaries,
  createScopedRepository,
  type Database,
} from '@eduagent/database';
import type { LibrarySearchResult } from '@eduagent/schemas';

export async function searchLibrary(
  db: Database,
  profileId: string,
  query: string
): Promise<LibrarySearchResult> {
  const escaped = query.replace(/[%_\\]/g, '\\$&');
  const pattern = `%${escaped}%`;

  const repo = createScopedRepository(db, profileId);

  const [
    matchingSubjects,
    matchingBooks,
    matchingTopics,
    matchingNotes,
    matchingSessions,
  ] = await Promise.all([
    repo.db
      .select({ id: subjects.id, name: subjects.name })
      .from(subjects)
      .where(and(eq(subjects.profileId, profileId), ilike(subjects.name, pattern)))
      .orderBy(asc(subjects.name), asc(subjects.id))
      .limit(20),

    repo.db
      .select({
        id: curriculumBooks.id,
        subjectId: curriculumBooks.subjectId,
        subjectName: subjects.name,
        title: curriculumBooks.title,
      })
      .from(curriculumBooks)
      .innerJoin(subjects, eq(curriculumBooks.subjectId, subjects.id))
      .where(
        and(
          eq(subjects.profileId, profileId),
          ilike(curriculumBooks.title, pattern)
        )
      )
      .orderBy(asc(subjects.name), asc(curriculumBooks.title), asc(curriculumBooks.id))
      .limit(20),

    repo.db
      .select({
        id: curriculumTopics.id,
        bookId: curriculumTopics.bookId,
        bookTitle: curriculumBooks.title,
        subjectId: curriculumBooks.subjectId,
        subjectName: subjects.name,
        name: curriculumTopics.title,
      })
      .from(curriculumTopics)
      .innerJoin(curriculumBooks, eq(curriculumTopics.bookId, curriculumBooks.id))
      .innerJoin(subjects, eq(curriculumBooks.subjectId, subjects.id))
      .where(
        and(
          eq(subjects.profileId, profileId),
          ilike(curriculumTopics.title, pattern)
        )
      )
      .orderBy(asc(subjects.name), asc(curriculumTopics.title), asc(curriculumTopics.id))
      .limit(20),

    repo.db
      .select({
        id: topicNotes.id,
        sessionId: topicNotes.sessionId,
        topicId: topicNotes.topicId,
        topicName: curriculumTopics.title,
        bookId: curriculumTopics.bookId,
        subjectId: curriculumBooks.subjectId,
        subjectName: subjects.name,
        content: topicNotes.content,
        createdAt: topicNotes.createdAt,
      })
      .from(topicNotes)
      .innerJoin(curriculumTopics, eq(topicNotes.topicId, curriculumTopics.id))
      .innerJoin(curriculumBooks, eq(curriculumTopics.bookId, curriculumBooks.id))
      .innerJoin(subjects, eq(curriculumBooks.subjectId, subjects.id))
      .where(
        and(
          eq(topicNotes.profileId, profileId),
          eq(subjects.profileId, profileId),
          ilike(topicNotes.content, pattern)
        )
      )
      .orderBy(asc(subjects.name), asc(topicNotes.id))
      .limit(20),

    repo.db
      .select({
        sessionId: sessionSummaries.sessionId,
        topicId: learningSessions.topicId,
        topicTitle: curriculumTopics.title,
        bookId: curriculumTopics.bookId,
        subjectId: subjects.id,
        subjectName: subjects.name,
        content: sessionSummaries.content,
        narrative: sessionSummaries.narrative,
        learnerRecap: sessionSummaries.learnerRecap,
        aiFeedback: sessionSummaries.aiFeedback,
        highlight: sessionSummaries.highlight,
        closingLine: sessionSummaries.closingLine,
        occurredAt: learningSessions.startedAt,
      })
      .from(sessionSummaries)
      .innerJoin(learningSessions, eq(sessionSummaries.sessionId, learningSessions.id))
      .innerJoin(subjects, eq(learningSessions.subjectId, subjects.id))
      .leftJoin(curriculumTopics, eq(learningSessions.topicId, curriculumTopics.id))
      .leftJoin(curriculumBooks, eq(curriculumTopics.bookId, curriculumBooks.id))
      .where(
        and(
          eq(learningSessions.profileId, profileId),
          isNull(sessionSummaries.purgedAt),
          inArray(sessionSummaries.status, ['submitted', 'accepted', 'auto_closed']),
          or(
            ilike(sessionSummaries.content, pattern),
            ilike(sessionSummaries.narrative, pattern),
            ilike(sessionSummaries.learnerRecap, pattern),
            ilike(sessionSummaries.aiFeedback, pattern),
            ilike(sessionSummaries.highlight, pattern),
            ilike(sessionSummaries.closingLine, pattern)
          )
        )
      )
      .orderBy(asc(subjects.name), desc(learningSessions.startedAt))
      .limit(20),
  ]);

  return {
    subjects: matchingSubjects,
    books: matchingBooks,
    topics: matchingTopics,
    notes: matchingNotes.map((n) => ({
      id: n.id,
      sessionId: n.sessionId ?? null,
      topicId: n.topicId,
      topicName: n.topicName,
      bookId: n.bookId,
      subjectId: n.subjectId,
      subjectName: n.subjectName,
      contentSnippet:
        n.content.length > 100 ? n.content.slice(0, 100) + '…' : n.content,
      createdAt: n.createdAt.toISOString(),
    })),
    sessions: matchingSessions.map((s) => {
      const fields = [
        s.content,
        s.narrative,
        s.learnerRecap,
        s.aiFeedback,
        s.highlight,
        s.closingLine,
      ].filter((f): f is string => f != null && f.toLowerCase().includes(query.toLowerCase()));
      const best = fields.sort((a, b) => b.length - a.length)[0] ?? s.content ?? '';
      const snippet = best.length > 100 ? best.slice(0, 100) + '…' : best;
      return {
        sessionId: s.sessionId,
        topicId: s.topicId ?? null,
        topicTitle: s.topicTitle ?? null,
        bookId: s.bookId ?? null,
        subjectId: s.subjectId,
        subjectName: s.subjectName,
        snippet,
        occurredAt: s.occurredAt.toISOString(),
      };
    }),
  };
}
```

- [ ] **Step 3: Run the integration tests**

```bash
cd apps/api && pnpm exec jest src/services/library-search.integration.test.ts --no-coverage
```

Expected: All tests PASS.

- [ ] **Step 4: Run typecheck**

```bash
pnpm exec nx run api:typecheck
```

Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add packages/schemas/src/library-search.ts apps/api/src/services/library-search.ts
git commit -m "feat(library-search): add sessionId, display names, and sessions search to API contract"
```

---

## Task 3: Add i18n keys

**Files:**
- Modify: `apps/mobile/src/i18n/locales/en.json` (and the other 6 locale files with same keys)

The existing `library.search` block in `en.json` (around line 734) needs new keys for section headers and the freeform fallback.

- [ ] **Step 1: Add keys to `en.json`**

In `apps/mobile/src/i18n/locales/en.json`, extend the `"library"."search"` object to add section keys:

```json
"search": {
  "searching": "Searching…",
  "noResults": "No results for \"{{query}}\"",
  "clear": "Clear search",
  "placeholder": "Search books, topics, notes…",
  "sections": {
    "subjects": "Subjects",
    "books": "Books",
    "topics": "Topics",
    "notes": "Notes",
    "sessions": "Sessions"
  },
  "freeformSession": "Freeform",
  "error": "Couldn't search right now."
}
```

- [ ] **Step 2: Add the same keys to the other 6 locale files**

For each of `de.json`, `es.json`, `nb.json`, `pl.json`, `pt.json`, `ja.json`, add identical English fallback values (same text as `en.json`) inside the same `"library"."search"` block. The translation team will replace these — adding English placeholders keeps the app functional in all locales on day one.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/i18n/locales/
git commit -m "feat(i18n): add library search section header and error keys"
```

---

## Task 4: Write failing `LibrarySearchResults` unit tests

**Files:**
- Create: `apps/mobile/src/components/library/LibrarySearchResults.test.tsx`

- [ ] **Step 1: Create the test file**

```tsx
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import type { LibrarySearchResult } from '@eduagent/schemas';

jest.mock('react-i18next', () => require('../../../test-utils/mock-i18n').i18nMock);

jest.mock('../../lib/theme', () => ({
  useThemeColors: () => ({
    textPrimary: '#111',
    textSecondary: '#666',
    border: '#e5e7eb',
    surface: '#fff',
  }),
  useSubjectTint: () => ({ soft: '#e0f2fe', solid: '#0ea5e9' }),
}));

jest.mock('../library/ShelfRow', () => ({
  ShelfRow: ({
    subjectId,
    name,
    onPress,
  }: {
    subjectId: string;
    name: string;
    onPress: (id: string) => void;
  }) => {
    const { Pressable, Text } = require('react-native');
    return (
      <Pressable testID={`search-subject-row-${subjectId}`} onPress={() => onPress(subjectId)}>
        <Text>{name}</Text>
      </Pressable>
    );
  },
}));

// LibrarySearchResults is the component under test — import after mocks
const { LibrarySearchResults } = require('./LibrarySearchResults');

const EMPTY_DATA: LibrarySearchResult = {
  subjects: [],
  books: [],
  topics: [],
  notes: [],
  sessions: [],
};

const FULL_DATA: LibrarySearchResult = {
  subjects: [{ id: 'sub-1', name: 'Biology' }],
  books: [{ id: 'book-1', subjectId: 'sub-1', subjectName: 'Biology', title: 'Cell Biology' }],
  topics: [{ id: 'top-1', bookId: 'book-1', bookTitle: 'Cell Biology', subjectId: 'sub-1', subjectName: 'Biology', name: 'Mitosis' }],
  notes: [{
    id: 'note-1', sessionId: 'sess-1', topicId: 'top-1', topicName: 'Mitosis',
    bookId: 'book-1', subjectId: 'sub-1', subjectName: 'Biology',
    contentSnippet: 'mitochondria powerhouse', createdAt: '2026-01-01T00:00:00.000Z',
  }],
  sessions: [{
    sessionId: 'sess-1', topicId: 'top-1', topicTitle: 'Mitosis',
    bookId: 'book-1', subjectId: 'sub-1', subjectName: 'Biology',
    snippet: 'cell division was explored', occurredAt: '2026-01-01T00:00:00.000Z',
  }],
};

const CROSS_SUBJECT_DATA: LibrarySearchResult = {
  subjects: [],
  books: [],
  topics: [
    { id: 'top-a', bookId: 'book-a', bookTitle: 'Bio Book', subjectId: 'sub-a', subjectName: 'Biology', name: 'Microbes' },
    { id: 'top-b', bookId: 'book-b', bookTitle: 'Chem Book', subjectId: 'sub-b', subjectName: 'Chemistry', name: 'Microbes' },
  ],
  notes: [],
  sessions: [],
};

const baseProps = {
  query: 'test',
  enrichedSubjects: [],
  onSubjectPress: jest.fn(),
  onBookPress: jest.fn(),
  onTopicPress: jest.fn(),
  onNotePress: jest.fn(),
  onSessionPress: jest.fn(),
  onRetry: jest.fn(),
};

describe('LibrarySearchResults', () => {
  beforeEach(() => jest.clearAllMocks());

  it('shows empty state when all arrays are empty', () => {
    render(
      <LibrarySearchResults
        {...baseProps}
        data={EMPTY_DATA}
        isLoading={false}
        isError={false}
      />
    );
    expect(screen.getByTestId('search-results-empty')).toBeTruthy();
  });

  it('hides sections that have no results', () => {
    const noNotes = { ...FULL_DATA, notes: [] };
    render(
      <LibrarySearchResults
        {...baseProps}
        data={noNotes}
        isLoading={false}
        isError={false}
      />
    );
    expect(screen.queryByTestId('search-section-notes')).toBeNull();
    expect(screen.getByTestId('search-section-books')).toBeTruthy();
  });

  it('shows all five section headers when all arrays are non-empty', () => {
    render(
      <LibrarySearchResults
        {...baseProps}
        data={FULL_DATA}
        enrichedSubjects={[{
          id: 'sub-1', name: 'Biology', bookCount: 1,
          topicProgress: '1/2', retentionStatus: null, isPaused: false,
        }]}
        isLoading={false}
        isError={false}
      />
    );
    expect(screen.getByTestId('search-section-subjects')).toBeTruthy();
    expect(screen.getByTestId('search-section-books')).toBeTruthy();
    expect(screen.getByTestId('search-section-topics')).toBeTruthy();
    expect(screen.getByTestId('search-section-notes')).toBeTruthy();
    expect(screen.getByTestId('search-section-sessions')).toBeTruthy();
  });

  it('shows freeform fallback for session with null topicId', () => {
    const freeformData: LibrarySearchResult = {
      ...EMPTY_DATA,
      sessions: [{
        sessionId: 'sess-free', topicId: null, topicTitle: null,
        bookId: null, subjectId: 'sub-1', subjectName: 'Biology',
        snippet: 'explored cells freeform', occurredAt: '2026-01-01T00:00:00.000Z',
      }],
    };
    render(
      <LibrarySearchResults
        {...baseProps}
        data={freeformData}
        isLoading={false}
        isError={false}
      />
    );
    expect(screen.getByTestId('session-row-sess-free-topic')).toHaveTextContent('Freeform');
  });

  it('cross-subject collision: two topics with same name show distinguishable rows', () => {
    render(
      <LibrarySearchResults
        {...baseProps}
        data={CROSS_SUBJECT_DATA}
        isLoading={false}
        isError={false}
      />
    );
    const rows = screen.getAllByTestId(/topic-row-/);
    expect(rows).toHaveLength(2);
    expect(screen.getByTestId('topic-row-top-a-subject')).toHaveTextContent('Biology');
    expect(screen.getByTestId('topic-row-top-b-subject')).toHaveTextContent('Chemistry');
  });

  it('shows error state and retry button', () => {
    const onRetry = jest.fn();
    render(
      <LibrarySearchResults
        {...baseProps}
        data={undefined}
        isLoading={false}
        isError={true}
        onRetry={onRetry}
      />
    );
    const retryBtn = screen.getByTestId('search-results-retry');
    fireEvent.press(retryBtn);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('calls onBookPress when a book row is tapped', () => {
    const onBookPress = jest.fn();
    render(
      <LibrarySearchResults
        {...baseProps}
        data={FULL_DATA}
        isLoading={false}
        isError={false}
        onBookPress={onBookPress}
      />
    );
    fireEvent.press(screen.getByTestId('book-row-book-1'));
    expect(onBookPress).toHaveBeenCalledWith('sub-1', 'book-1');
  });

  it('calls onTopicPress when a topic row is tapped', () => {
    const onTopicPress = jest.fn();
    render(
      <LibrarySearchResults
        {...baseProps}
        data={FULL_DATA}
        isLoading={false}
        isError={false}
        onTopicPress={onTopicPress}
      />
    );
    fireEvent.press(screen.getByTestId('topic-row-top-1'));
    expect(onTopicPress).toHaveBeenCalledWith('top-1');
  });

  it('calls onNotePress with topicId when a note row is tapped', () => {
    const onNotePress = jest.fn();
    render(
      <LibrarySearchResults
        {...baseProps}
        data={FULL_DATA}
        isLoading={false}
        isError={false}
        onNotePress={onNotePress}
      />
    );
    fireEvent.press(screen.getByTestId('note-row-note-1'));
    expect(onNotePress).toHaveBeenCalledWith('top-1');
  });

  it('calls onSessionPress with sessionId, subjectId, topicId when a session row is tapped', () => {
    const onSessionPress = jest.fn();
    render(
      <LibrarySearchResults
        {...baseProps}
        data={FULL_DATA}
        isLoading={false}
        isError={false}
        onSessionPress={onSessionPress}
      />
    );
    fireEvent.press(screen.getByTestId('session-row-sess-1'));
    expect(onSessionPress).toHaveBeenCalledWith('sess-1', 'sub-1', 'top-1');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd apps/mobile && pnpm exec jest src/components/library/LibrarySearchResults.test.tsx --no-coverage
```

Expected: FAIL — `LibrarySearchResults` module not found.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/components/library/LibrarySearchResults.test.tsx
git commit -m "test(library): add failing unit tests for LibrarySearchResults component"
```

---

## Task 5: Create `LibrarySearchResults` component

**Files:**
- Create: `apps/mobile/src/components/library/LibrarySearchResults.tsx`

- [ ] **Step 1: Create the component**

```tsx
import { Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { LibrarySearchResult, RetentionStatus } from '@eduagent/schemas';
import { useSubjectTint, useThemeColors } from '../../lib/theme';
import { formatRelativeDate } from '../../lib/format-relative-date';
import { ShelfRow } from './ShelfRow';

export interface EnrichedSubjectResult {
  id: string;
  name: string;
  bookCount: number;
  topicProgress: string;
  retentionStatus: RetentionStatus | null;
  isPaused: boolean;
}

interface LibrarySearchResultsProps {
  data: LibrarySearchResult | undefined;
  isLoading: boolean;
  isError: boolean;
  query: string;
  enrichedSubjects: EnrichedSubjectResult[];
  onSubjectPress: (subjectId: string) => void;
  onBookPress: (subjectId: string, bookId: string) => void;
  onTopicPress: (topicId: string) => void;
  onNotePress: (topicId: string) => void;
  onSessionPress: (sessionId: string, subjectId: string, topicId: string | null) => void;
  onRetry: () => void;
}

function SectionHeader({ testID, label }: { testID: string; label: string }) {
  const colors = useThemeColors();
  return (
    <Text
      testID={testID}
      style={{
        fontSize: 11,
        fontWeight: '700',
        color: colors.textSecondary,
        letterSpacing: 0.5,
        textTransform: 'uppercase',
        paddingHorizontal: 16,
        paddingTop: 16,
        paddingBottom: 4,
      }}
    >
      {label}
    </Text>
  );
}

function SubjectPill({ subjectName, subjectId }: { subjectName: string; subjectId: string }) {
  const tint = useSubjectTint(subjectName || subjectId);
  return (
    <View
      style={{
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: tint.solid,
        marginRight: 4,
      }}
    />
  );
}

function BookRow({
  item,
  onPress,
}: {
  item: LibrarySearchResult['books'][number];
  onPress: (subjectId: string, bookId: string) => void;
}) {
  const colors = useThemeColors();
  return (
    <Pressable
      testID={`book-row-${item.id}`}
      onPress={() => onPress(item.subjectId, item.id)}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 10,
        paddingHorizontal: 16,
        gap: 8,
      }}
    >
      <SubjectPill subjectName={item.subjectName} subjectId={item.subjectId} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 15, color: colors.textPrimary }} numberOfLines={1}>
          {item.title}
        </Text>
        <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 1 }} numberOfLines={1}>
          {item.subjectName}
        </Text>
      </View>
    </Pressable>
  );
}

function TopicRow({
  item,
  onPress,
}: {
  item: LibrarySearchResult['topics'][number];
  onPress: (topicId: string) => void;
}) {
  const colors = useThemeColors();
  return (
    <Pressable
      testID={`topic-row-${item.id}`}
      onPress={() => onPress(item.id)}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 10,
        paddingHorizontal: 16,
        gap: 8,
      }}
    >
      <SubjectPill subjectName={item.subjectName} subjectId={item.subjectId} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 15, color: colors.textPrimary }} numberOfLines={1}>
          {item.name}
        </Text>
        <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 1 }} numberOfLines={1}>
          <Text testID={`topic-row-${item.id}-subject`}>{item.bookTitle} · {item.subjectName}</Text>
        </Text>
      </View>
    </Pressable>
  );
}

function NoteRow({
  item,
  onPress,
}: {
  item: LibrarySearchResult['notes'][number];
  onPress: (topicId: string) => void;
}) {
  const colors = useThemeColors();
  return (
    <Pressable
      testID={`note-row-${item.id}`}
      onPress={() => onPress(item.topicId)}
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        paddingVertical: 10,
        paddingHorizontal: 16,
        gap: 8,
      }}
    >
      <View style={{ marginTop: 5 }}>
        <SubjectPill subjectName={item.subjectName} subjectId={item.subjectId} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 14, color: colors.textPrimary, lineHeight: 20 }} numberOfLines={2}>
          {item.contentSnippet}
        </Text>
        <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2 }} numberOfLines={1}>
          {item.topicName} · {item.subjectName} · {formatRelativeDate(item.createdAt)}
        </Text>
      </View>
    </Pressable>
  );
}

function SessionRow({
  item,
  onPress,
}: {
  item: LibrarySearchResult['sessions'][number];
  onPress: (sessionId: string, subjectId: string, topicId: string | null) => void;
}) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const topicLabel = item.topicTitle ?? t('library.search.freeformSession');
  return (
    <Pressable
      testID={`session-row-${item.sessionId}`}
      onPress={() => onPress(item.sessionId, item.subjectId, item.topicId)}
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        paddingVertical: 10,
        paddingHorizontal: 16,
        gap: 8,
      }}
    >
      <View style={{ marginTop: 5 }}>
        <SubjectPill subjectName={item.subjectName} subjectId={item.subjectId} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 14, color: colors.textPrimary, lineHeight: 20 }} numberOfLines={2}>
          {item.snippet}
        </Text>
        <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2 }} numberOfLines={1}>
          <Text testID={`session-row-${item.sessionId}-topic`}>{topicLabel}</Text>
          {' · '}{item.subjectName} · {formatRelativeDate(item.occurredAt)}
        </Text>
      </View>
    </Pressable>
  );
}

export function LibrarySearchResults({
  data,
  isLoading: _isLoading,
  isError,
  query,
  enrichedSubjects,
  onSubjectPress,
  onBookPress,
  onTopicPress,
  onNotePress,
  onSessionPress,
  onRetry,
}: LibrarySearchResultsProps): React.ReactElement {
  const { t } = useTranslation();
  const colors = useThemeColors();

  if (isError) {
    return (
      <View
        style={{ paddingHorizontal: 16, paddingVertical: 12 }}
        testID="search-results-error"
      >
        <Text style={{ fontSize: 14, color: colors.textSecondary }}>
          {t('library.search.error')}
        </Text>
        <Pressable
          testID="search-results-retry"
          onPress={onRetry}
          style={{
            marginTop: 8,
            paddingHorizontal: 16,
            paddingVertical: 8,
            borderRadius: 8,
            backgroundColor: colors.border,
            alignSelf: 'flex-start',
          }}
        >
          <Text style={{ fontSize: 14, fontWeight: '600', color: colors.textPrimary }}>
            {t('common.retry')}
          </Text>
        </Pressable>
      </View>
    );
  }

  if (!data || (
    data.subjects.length === 0 &&
    data.books.length === 0 &&
    data.topics.length === 0 &&
    data.notes.length === 0 &&
    data.sessions.length === 0
  )) {
    return (
      <View
        style={{ paddingHorizontal: 16, paddingVertical: 20 }}
        testID="search-results-empty"
      >
        <Text style={{ fontSize: 14, color: colors.textSecondary, textAlign: 'center' }}>
          {t('library.search.noResults', { query })}
        </Text>
      </View>
    );
  }

  return (
    <View>
      {enrichedSubjects.length > 0 && (
        <>
          <SectionHeader testID="search-section-subjects" label={t('library.search.sections.subjects')} />
          {enrichedSubjects.map((s) => (
            <ShelfRow
              key={s.id}
              subjectId={s.id}
              name={s.name}
              bookCount={s.bookCount}
              topicProgress={s.topicProgress}
              retentionStatus={s.retentionStatus}
              isPaused={s.isPaused}
              onPress={onSubjectPress}
            />
          ))}
        </>
      )}

      {data.books.length > 0 && (
        <>
          <SectionHeader testID="search-section-books" label={t('library.search.sections.books')} />
          {data.books.map((b) => (
            <BookRow key={b.id} item={b} onPress={onBookPress} />
          ))}
        </>
      )}

      {data.topics.length > 0 && (
        <>
          <SectionHeader testID="search-section-topics" label={t('library.search.sections.topics')} />
          {data.topics.map((topic) => (
            <TopicRow key={topic.id} item={topic} onPress={onTopicPress} />
          ))}
        </>
      )}

      {data.notes.length > 0 && (
        <>
          <SectionHeader testID="search-section-notes" label={t('library.search.sections.notes')} />
          {data.notes.map((n) => (
            <NoteRow key={n.id} item={n} onPress={onNotePress} />
          ))}
        </>
      )}

      {data.sessions.length > 0 && (
        <>
          <SectionHeader testID="search-section-sessions" label={t('library.search.sections.sessions')} />
          {data.sessions.map((s) => (
            <SessionRow key={s.sessionId} item={s} onPress={onSessionPress} />
          ))}
        </>
      )}
    </View>
  );
}
```

- [ ] **Step 2: Run the component unit tests**

```bash
cd apps/mobile && pnpm exec jest src/components/library/LibrarySearchResults.test.tsx --no-coverage
```

Expected: All tests PASS.

- [ ] **Step 3: Run typecheck**

```bash
cd apps/mobile && pnpm exec tsc --noEmit
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/components/library/LibrarySearchResults.tsx
git commit -m "feat(library): add LibrarySearchResults component with five typed sections"
```

---

## Task 6: Write failing library navigation tests

**Files:**
- Modify: `apps/mobile/src/app/(app)/library.test.tsx`

- [ ] **Step 1: Add navigation tests to the existing describe block**

Add these tests inside the `describe('LibraryScreen', () => {` block at the bottom of `library.test.tsx`. The existing `useLibrarySearch` mock at the top of the file returns `{ data: null, isLoading: false, isError: false }` by default. These tests will override it per-test using `jest.mocked`.

First, change the top-level mock to use a variable that can be overridden:

In the existing `jest.mock('../../hooks/use-library-search', ...)` at the top of the file, change it to:

```ts
const mockUseLibrarySearch = jest.fn();

jest.mock('../../hooks/use-library-search', () => ({
  useLibrarySearch: (...args: unknown[]) => mockUseLibrarySearch(...args),
}));
```

Then add this `beforeEach` reset inside the describe block alongside the existing one:
```ts
mockUseLibrarySearch.mockReturnValue({ data: null, isLoading: false, isError: false });
```

Then add these tests:

```tsx
describe('search result navigation', () => {
  const SEARCH_DATA = {
    subjects: [{ id: 'sub-1', name: 'Biology' }],
    books: [{ id: 'book-1', subjectId: 'sub-1', subjectName: 'Biology', title: 'Cell Biology' }],
    topics: [{ id: 'top-1', bookId: 'book-1', bookTitle: 'Cell Biology', subjectId: 'sub-1', subjectName: 'Biology', name: 'Mitosis' }],
    notes: [{
      id: 'note-1', sessionId: 'sess-1', topicId: 'top-1', topicName: 'Mitosis',
      bookId: 'book-1', subjectId: 'sub-1', subjectName: 'Biology',
      contentSnippet: 'powerhouse of the cell', createdAt: '2026-01-01T00:00:00.000Z',
    }],
    sessions: [{
      sessionId: 'sess-1', topicId: 'top-1', topicTitle: 'Mitosis',
      bookId: 'book-1', subjectId: 'sub-1', subjectName: 'Biology',
      snippet: 'explored cells today', occurredAt: '2026-01-01T00:00:00.000Z',
    }],
  };

  function renderSearching() {
    mockUseSubjects.mockReturnValue({
      data: [{ id: 'sub-1', name: 'Biology', status: 'active' }],
      isLoading: false,
      isError: false,
    });
    mockUseOverallProgress.mockReturnValue({
      data: { subjects: [{ subjectId: 'sub-1', topicsTotal: 5, topicsCompleted: 2, topicsVerified: 2 }] },
      isLoading: false,
      isError: false,
    });
    mockUseLibrarySearch.mockReturnValue({ data: SEARCH_DATA, isLoading: false, isError: false });
    render(<LibraryScreen />, { wrapper: TestWrapper });
    // Trigger search to reveal results
    fireEvent.changeText(screen.getByTestId('library-search-input'), 'test');
    jest.runAllTimers();
  }

  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('subject row tap calls router.push to shelf', () => {
    renderSearching();
    fireEvent.press(screen.getByTestId('search-subject-row-sub-1'));
    expect(mockPush).toHaveBeenCalledWith(
      expect.objectContaining({
        pathname: '/(app)/shelf/[subjectId]',
        params: { subjectId: 'sub-1' },
      })
    );
  });

  it('book row tap pushes shelf then book (two calls)', () => {
    renderSearching();
    fireEvent.press(screen.getByTestId('book-row-book-1'));
    expect(mockPush).toHaveBeenCalledTimes(2);
    expect(mockPush).toHaveBeenNthCalledWith(1,
      expect.objectContaining({
        pathname: '/(app)/shelf/[subjectId]',
        params: { subjectId: 'sub-1' },
      })
    );
    expect(mockPush).toHaveBeenNthCalledWith(2,
      expect.objectContaining({
        pathname: '/(app)/shelf/[subjectId]/book/[bookId]',
        params: { subjectId: 'sub-1', bookId: 'book-1' },
      })
    );
  });

  it('topic row tap pushes to topic screen', () => {
    renderSearching();
    fireEvent.press(screen.getByTestId('topic-row-top-1'));
    expect(mockPush).toHaveBeenCalledWith(
      expect.objectContaining({
        pathname: '/(app)/topic/[topicId]',
        params: { topicId: 'top-1' },
      })
    );
  });

  it('note row tap pushes to parent topic (not session)', () => {
    renderSearching();
    fireEvent.press(screen.getByTestId('note-row-note-1'));
    expect(mockPush).toHaveBeenCalledWith(
      expect.objectContaining({
        pathname: '/(app)/topic/[topicId]',
        params: { topicId: 'top-1' },
      })
    );
  });

  it('session row tap pushes to root session-summary route', () => {
    renderSearching();
    fireEvent.press(screen.getByTestId('session-row-sess-1'));
    expect(mockPush).toHaveBeenCalledWith(
      expect.objectContaining({
        pathname: '/session-summary/[sessionId]',
        params: expect.objectContaining({
          sessionId: 'sess-1',
          subjectId: 'sub-1',
        }),
      })
    );
  });
});
```

- [ ] **Step 2: Run to verify failures**

```bash
cd apps/mobile && pnpm exec jest src/app/\\(app\\)/library.test.tsx --no-coverage
```

Expected: New tests FAIL — `useLibrarySearch` mock pattern changed, `search-subject-row-sub-1` not found because `LibrarySearchResults` not yet wired into `library.tsx`.

- [ ] **Step 3: Commit**

```bash
git add "apps/mobile/src/app/(app)/library.test.tsx"
git commit -m "test(library): add failing navigation tests for search result drill-through"
```

---

## Task 7: Wire `LibrarySearchResults` into `library.tsx`

**Files:**
- Modify: `apps/mobile/src/app/(app)/library.tsx`

- [ ] **Step 1: Update the `useLibrarySearch` mock in the test file first**

The test file change in Task 6 introduced `mockUseLibrarySearch`. If you haven't already done so during Task 6, find the existing mock and change it to:

```ts
const mockUseLibrarySearch = jest.fn();
jest.mock('../../hooks/use-library-search', () => ({
  useLibrarySearch: (...args: unknown[]) => mockUseLibrarySearch(...args),
}));
```

And in `beforeEach`:
```ts
mockUseLibrarySearch.mockReturnValue({ data: null, isLoading: false, isError: false });
```

- [ ] **Step 2: Import the new component and types in `library.tsx`**

Add to the imports at the top of `apps/mobile/src/app/(app)/library.tsx`:

```ts
import {
  LibrarySearchResults,
  type EnrichedSubjectResult,
} from '../../components/library/LibrarySearchResults';
```

- [ ] **Step 3: Add the five navigation handlers**

Add these after the `handleShelfPress` handler (after line 270 in the original file):

```ts
const handleBookPress = useCallback(
  (subjectId: string, bookId: string) => {
    router.push({
      pathname: '/(app)/shelf/[subjectId]',
      params: { subjectId },
    } as never);
    router.push({
      pathname: '/(app)/shelf/[subjectId]/book/[bookId]',
      params: { subjectId, bookId },
    } as never);
  },
  [router],
);

const handleTopicPress = useCallback(
  (topicId: string) => {
    router.push({
      pathname: '/(app)/topic/[topicId]',
      params: { topicId },
    } as never);
  },
  [router],
);

const handleNotePress = useCallback(
  (topicId: string) => {
    router.push({
      pathname: '/(app)/topic/[topicId]',
      params: { topicId },
    } as never);
  },
  [router],
);

const handleSessionPress = useCallback(
  (sessionId: string, subjectId: string, topicId: string | null) => {
    router.push({
      pathname: '/session-summary/[sessionId]',
      params: {
        sessionId,
        subjectId,
        ...(topicId ? { topicId } : {}),
      },
    } as never);
  },
  [router],
);
```

- [ ] **Step 4: Add `enrichedSubjectResults` memo**

Add after the `serverMatchSubjectIds` useMemo (after line 258 in the original):

```ts
const enrichedSubjectResults = useMemo<EnrichedSubjectResult[]>(() => {
  if (!searchResult.data) return [];
  return searchResult.data.subjects.map((s) => {
    const subject = subjects.find((sub) => sub.id === s.id);
    const retData = retentionDataBySubjectId.get(s.id);
    const retentionStatus = computeShelfRetention(retData);
    const books = booksBySubjectId.get(s.id) ?? [];
    const progress = progressBySubjectId.get(s.id);
    return {
      id: s.id,
      name: s.name,
      bookCount: books.length,
      topicProgress: `${progress?.topicsCompleted ?? 0}/${progress?.topicsTotal ?? 0}`,
      retentionStatus,
      isPaused: subject?.status !== 'active',
    };
  });
}, [searchResult.data, subjects, retentionDataBySubjectId, booksBySubjectId, progressBySubjectId]);
```

- [ ] **Step 5: Replace the search loading/empty/grid block in `renderContent`**

Currently in `renderContent`, find the section that starts with `{/* Server search loading indicator */}` (around line 498) and goes through `{/* Subject shelf list */}` (around line 531–555). Replace this entire block with:

```tsx
{/* Search results (when query is active) */}
{isSearching && (
  <>
    {searchResult.isLoading && (
      <View
        className="flex-row items-center px-1 mb-2"
        testID="library-search-server-loading"
      >
        <ActivityIndicator size="small" />
        <Text className="text-body-sm text-text-secondary ms-2">
          {t('library.search.searching')}
        </Text>
      </View>
    )}
    {!searchResult.isLoading && (
      <LibrarySearchResults
        data={searchResult.data ?? undefined}
        isLoading={searchResult.isLoading}
        isError={searchResult.isError}
        query={debouncedQuery}
        enrichedSubjects={enrichedSubjectResults}
        onSubjectPress={handleShelfPress}
        onBookPress={handleBookPress}
        onTopicPress={handleTopicPress}
        onNotePress={handleNotePress}
        onSessionPress={handleSessionPress}
        onRetry={() => void searchResult.refetch()}
      />
    )}
  </>
)}

{/* Subject shelf list (hidden when searching) */}
{!isSearching && (
  <View testID="shelves-list">
    {visibleSubjects.map((subject) => {
      const retData = retentionDataBySubjectId.get(subject.id);
      const retentionStatus = computeShelfRetention(retData);
      const books = booksBySubjectId.get(subject.id) ?? [];
      const bookCount = books.length;
      const progress = progressBySubjectId.get(subject.id);
      const topicsTotal = progress?.topicsTotal ?? 0;
      const topicsCompleted = progress?.topicsCompleted ?? 0;
      const topicProgress = `${topicsCompleted}/${topicsTotal}`;

      return (
        <ShelfRow
          key={subject.id}
          subjectId={subject.id}
          name={subject.name}
          bookCount={bookCount}
          topicProgress={topicProgress}
          retentionStatus={retentionStatus}
          isPaused={subject.status !== 'active'}
          onPress={handleShelfPress}
        />
      );
    })}
  </View>
)}
```

- [ ] **Step 6: Run all library tests**

```bash
cd apps/mobile && pnpm exec jest src/app/\\(app\\)/library.test.tsx --no-coverage
```

Expected: All tests PASS.

- [ ] **Step 7: Run typecheck**

```bash
cd apps/mobile && pnpm exec tsc --noEmit
```

Expected: No errors.

- [ ] **Step 8: Commit**

```bash
git add "apps/mobile/src/app/(app)/library.tsx" "apps/mobile/src/app/(app)/library.test.tsx"
git commit -m "feat(library): wire LibrarySearchResults into library screen with five-type navigation"
```

---

## Task 8: Cleanup — verify `library-filters.ts` is gone

> **Pre-flight note (verified 2026-05-08):** `apps/mobile/src/lib/library-filters.ts` does NOT exist in the main source tree — it was already removed. `EnrichedBook` is already defined inline in `use-all-books.ts` (lines 9-16) with no import from `library-filters`. Task 8 is therefore a verification-only step, not a deletion step. Do NOT attempt to remove an import that doesn't exist or add an interface that's already there.

**Files:**
- No file changes expected. This task is a guard check only.

- [ ] **Step 1: Verify no callers of `library-filters` remain**

```bash
grep -r "library-filters" apps/mobile/src/
```

Expected: No output. If any output appears, remove those imports and re-run typecheck.

- [ ] **Step 2: Verify `EnrichedBook` is exported from `use-all-books.ts`**

Confirm `apps/mobile/src/hooks/use-all-books.ts` contains `export interface EnrichedBook` (it should — lines 9-16). No changes needed.

- [ ] **Step 3: Run typecheck and lint**

```bash
cd apps/mobile && pnpm exec tsc --noEmit
pnpm exec nx run mobile:lint
```

Expected: No errors.

- [ ] **Step 4: No commit needed**

If Steps 1-3 are all clean, there is nothing to commit for Task 8. If Step 1 surfaced stray imports, commit only those removals:

```bash
git add <affected files>
git commit -m "chore(library): remove stale library-filters imports"
```

---

## Self-Review Against Spec

**Spec Coverage Check:**

| Requirement | Task |
|---|---|
| `librarySearchResultSchema` extended with `sessionId` on notes | Task 2 |
| New `sessions` array in schema | Task 2 |
| Session query filters `purgedAt IS NULL`, excludes `pending`/`skipped` | Task 2 |
| Session query scoped via `learning_sessions.profileId` | Task 2 |
| API integration tests (cross-profile, purged, freeform, status filters) | Task 1 |
| Subject rows reuse `ShelfRow` with full density | Task 5 |
| All five sections render with correct grouping + headers | Task 5 |
| Subject color pill on each non-subject row | Task 5 (SubjectPill) |
| Note secondary: `Topic · Subject · {date}` | Task 5 (NoteRow) |
| Session secondary: `Topic · Subject · {date}`, "Freeform" fallback | Task 5 (SessionRow) |
| Each type drills to correct screen | Tasks 6+7 |
| Book push is two-step (shelf→book) | Task 7 (`handleBookPress`) |
| Note drills to parent topic (not session) | Task 7 (`handleNotePress`) |
| Session drills to root `/session-summary/[sessionId]` | Task 7 (`handleSessionPress`) |
| Cross-subject collision renders distinguishable rows | Task 5+6 (secondary line + pill) |
| Empty state copy | Task 5 |
| Error state with retry | Task 5 |
| `library-filters.ts` deleted, `EnrichedBook` inlined | Task 8 |
| i18n keys added | Task 3 |
| Shelf grid hidden when searching | Task 7 (conditional render) |

**Spec items explicitly out of scope:** match highlighting, ranking, recent history, type filter chips, subject filter chips, cross-subject smart ranking, per-subject limits, transcript search, status badge treatment on result rows. None of these should appear in this PR.

**Known dead code after this PR:** `serverMatchSubjectIds` in `library.tsx` feeds `visibleSubjects`, which is only rendered in `{!isSearching && ...}`. When `!isSearching`, the query is empty so all subjects are returned regardless of `serverMatchSubjectIds`. During search, `visibleSubjects` is not rendered. The memo therefore runs on every search keystroke but its output is never consumed. Removal is a safe follow-up; do not touch it in this PR.

**Display fields on existing types (subjectName, bookTitle, topicName, createdAt):** Not explicitly listed as "API Contract Changes" in the spec, but required for the specced UI. Included in Task 2 as a pragmatic extension — the joins were already in the queries.

**Sort order within sections:** Queries in Task 2 use `ORDER BY subjects.name ASC, <intrinsic field>` matching the spec. ✓

**`library.search.sections.subjects` et al. i18n keys:** Task 3. The component test uses the `mock-i18n` utility which reads `en.json`, so Task 5's tests will fail if the keys are missing — run Task 3 before Task 5. ✓ (order preserved in task sequence)

**Placeholder scan:** None found. All code blocks are complete.

**Type consistency:** `EnrichedSubjectResult` defined in `LibrarySearchResults.tsx` and imported in `library.tsx`. `LibrarySearchResult` type flows from schema through hook to component. `handleBookPress(subjectId, bookId)` matches `onBookPress: (subjectId: string, bookId: string) => void` in component props. ✓
