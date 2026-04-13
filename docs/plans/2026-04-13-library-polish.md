# Library Polish — Implementation Plan

**Date:** 2026-04-13
**Branch:** bugfix2
**Scope:** Four targeted improvements to the library/shelf/book screens

---

## Summary

Four independent library improvements, ordered by data dependency:

1. **Book Uniqueness Constraints** (schema, no UI) — migration only
2. **Book Status: COMPLETED / REVIEW_DUE** (API + mobile) — `computeBookStatus` is already complete; the bug is in the _shelf screen_ which has its own local `getBookStatus` helper that ignores the API-computed status
3. **Shelf Progress Bar** (mobile only) — requires the subject-level topic count query in the API
4. **Inline Notes on Book Screen** (mobile only) — the `useBookNotes` hook already fetches notes; this is purely a render change

**Dependency order:** Items 1 and 2 are independent. Items 3 and 4 are independent of each other but both assume item 2 is done so the shelf shows meaningful status.

---

## Item 1 — Book Uniqueness Constraints

### Problem

`curriculum_books` has no unique constraint on `(subject_id, sort_order)`. `curriculum_topics` has no unique constraint on `(book_id, sort_order)`. The filing service computes `maxOrder + 1` inside a transaction with a `FOR UPDATE` lock on the shelf, so concurrent corruption is currently prevented by locking logic. A DB-level constraint makes this bulletproof and documents the intent.

### Current schema state

- `curriculum_books`: `subject_id` FK + `sort_order` integer, no uniqueness enforced
- `curriculum_topics`: `book_id` FK + `sort_order` integer, no uniqueness enforced
- The `curricula` table already has `UNIQUE(subject_id, version)` as a reference pattern (migration `0000_lush_psylocke.sql`, confirmed in `subjects.ts` schema `uniqueIndex('curricula_subject_version_idx')`)

### Migration SQL

File: `apps/api/drizzle/0021_book_sort_order_unique.sql`

```sql
-- Unique sort order within a subject's books
CREATE UNIQUE INDEX "curriculum_books_subject_sort_order_uq"
  ON "curriculum_books" USING btree ("subject_id", "sort_order");
--> statement-breakpoint
-- Unique sort order within a book's topics
CREATE UNIQUE INDEX "curriculum_topics_book_sort_order_uq"
  ON "curriculum_topics" USING btree ("book_id", "sort_order");
```

> **Important:** Use `UNIQUE INDEX` (not `UNIQUE CONSTRAINT`) to match the existing pattern in this codebase (e.g., `milestones_scope_uq`, `monthly_reports_parent_child_month_uq` in `0020_lyrical_blue_blade.sql`).

### Drizzle schema update

File: `packages/database/src/schema/subjects.ts`

Change `curriculumBooks` table definition from:

```typescript
export const curriculumBooks = pgTable('curriculum_books', {
  // ... fields
});
```

To:

```typescript
export const curriculumBooks = pgTable(
  'curriculum_books',
  {
    // ... same fields as before, unchanged
  },
  (table) => [
    uniqueIndex('curriculum_books_subject_sort_order_uq').on(
      table.subjectId,
      table.sortOrder
    ),
  ]
);
```

Change `curriculumTopics` table definition similarly:

```typescript
export const curriculumTopics = pgTable(
  'curriculum_topics',
  {
    // ... same fields as before, unchanged
  },
  (table) => [
    uniqueIndex('curriculum_topics_book_sort_order_uq').on(
      table.bookId,
      table.sortOrder
    ),
  ]
);
```

### Pre-migration data check

Before running the migration, verify there are no existing duplicates:

```sql
-- Check for duplicate sort orders in curriculum_books
SELECT subject_id, sort_order, COUNT(*) FROM curriculum_books
GROUP BY subject_id, sort_order HAVING COUNT(*) > 1;

-- Check for duplicate sort orders in curriculum_topics
SELECT book_id, sort_order, COUNT(*) FROM curriculum_topics
GROUP BY book_id, sort_order HAVING COUNT(*) > 1;
```

If duplicates exist, they must be resolved before the migration can run. The resolution is: for each duplicate set, keep the oldest row and increment the `sort_order` of the newer rows sequentially. Add a data-fixup SQL block at the top of the migration file if duplicates are found in staging.

### Rollback

The migration only adds indexes; it does not drop columns or modify data. Rollback:

```sql
DROP INDEX IF EXISTS "curriculum_books_subject_sort_order_uq";
DROP INDEX IF EXISTS "curriculum_topics_book_sort_order_uq";
```

Rollback is **safe and lossless** — no data is modified or destroyed.

### Verification

- `test: manual` — Run the pre-migration data check against staging before applying.
- `test: manual` — After migration, attempt to insert a duplicate sort_order via psql and confirm the constraint fires with a unique violation error.
- `test: apps/api/src/services/curriculum.ts` — existing `createBooks` / `persistBookTopics` tests still pass (sort order is set correctly and not duplicated within them).

---

## Item 2 — COMPLETED / REVIEW_DUE Book Status

### Problem

`computeBookStatus` in `apps/api/src/services/curriculum.ts` (lines 223–288) already returns `COMPLETED` and `REVIEW_DUE` correctly. The API route `/subjects/:subjectId/books` calls `getBooks`, which returns `CurriculumBook[]` — raw book rows **without** status. Status is only computed inside `getBookWithTopics` (the per-book detail endpoint).

The shelf screen (`apps/mobile/src/app/(app)/shelf/[subjectId]/index.tsx`, lines 143–148) has a local `getBookStatus` function that only checks `book.topicsGenerated`:

```typescript
const getBookStatus = (bookId: string): BookProgressStatus => {
  const book = books.find((b) => b.id === bookId);
  if (!book) return 'NOT_STARTED';
  if (!book.topicsGenerated) return 'NOT_STARTED';
  return 'IN_PROGRESS';
};
```

This means every book with `topicsGenerated = true` shows as `IN_PROGRESS` even when completed or review-due.

### Fix: Add status to the books list API response

The cleanest fix is to compute and return status in `getBooks`. This avoids N+1 calls on the shelf screen and keeps status logic server-side.

**Step 1 — Update `getBooks` in `apps/api/src/services/curriculum.ts`**

The current `getBooks` returns `CurriculumBook[]`. Extend it to also return `status` per book. Since `CurriculumBook` is the shared schema type (defined in `@eduagent/schemas`), we need to either:

- Option A: Extend `CurriculumBook` in `@eduagent/schemas` to include an optional `status` field
- Option B: Return a new type `CurriculumBookWithStatus` and update the API response shape

**Choose Option A** — it is backward-compatible (status is optional) and avoids a new response type that mobile has to track separately.

File: `packages/schemas/src/subjects.ts`

Change `curriculumBookSchema`:

```typescript
export const curriculumBookSchema = z.object({
  id: z.string().uuid(),
  subjectId: z.string().uuid(),
  title: z.string(),
  description: z.string().nullable(),
  emoji: z.string().nullable(),
  sortOrder: z.number().int(),
  topicsGenerated: z.boolean(),
  status: bookProgressStatusSchema.optional(),  // add this line
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
```

File: `apps/api/src/services/curriculum.ts`

Update `getBooks` to compute status for each book. Because `computeBookStatus` takes `topicIds[]` and makes DB calls, batch-compute all books at once using a single topics query to avoid N+1:

```typescript
export async function getBooks(
  db: Database,
  profileId: string,
  subjectId: string
): Promise<CurriculumBook[]> {
  const repo = createScopedRepository(db, profileId);
  const subject = await repo.subjects.findFirst(eq(subjects.id, subjectId));
  if (!subject) {
    throw new NotFoundError('Subject');
  }

  const rows = await db.query.curriculumBooks.findMany({
    where: eq(curriculumBooks.subjectId, subjectId),
    orderBy: [asc(curriculumBooks.sortOrder), asc(curriculumBooks.createdAt)],
  });

  if (rows.length === 0) return [];

  // Batch: fetch all topic IDs for all books in one query, then compute status
  const allTopicRows = await db
    .select({ id: curriculumTopics.id, bookId: curriculumTopics.bookId })
    .from(curriculumTopics)
    .where(
      and(
        inArray(
          curriculumTopics.bookId,
          rows.map((b) => b.id)
        ),
        eq(curriculumTopics.skipped, false)
      )
    );

  const topicsByBook = new Map<string, string[]>();
  for (const t of allTopicRows) {
    const existing = topicsByBook.get(t.bookId) ?? [];
    existing.push(t.id);
    topicsByBook.set(t.bookId, existing);
  }

  const statusResults = await Promise.all(
    rows.map((book) =>
      computeBookStatus(db, profileId, topicsByBook.get(book.id) ?? [])
    )
  );

  return rows.map((book, i) => ({
    ...mapBookRow(book),
    status: statusResults[i]!.status,
  }));
}
```

**Step 2 — Update the shelf screen to use API-provided status**

File: `apps/mobile/src/app/(app)/shelf/[subjectId]/index.tsx`

Replace the local `getBookStatus` helper (lines 143–148) and the `suggestedBookId` computation (lines 150–156) with:

```typescript
// Status is now server-computed and returned in the book object itself.
// Fall back to topicsGenerated heuristic only if status is absent (old cache).
const getBookStatus = (bookId: string): BookProgressStatus => {
  const book = books.find((b) => b.id === bookId);
  if (!book) return 'NOT_STARTED';
  if (book.status) return book.status;
  if (!book.topicsGenerated) return 'NOT_STARTED';
  return 'IN_PROGRESS';
};
```

The `suggestedBookId` logic remains unchanged — `REVIEW_DUE` books should also be highlighted as suggested (they have sessions, they just need review). Update the priority:

```typescript
const suggestedBookId = (() => {
  const reviewDue = books.find((b) => getBookStatus(b.id) === 'REVIEW_DUE');
  if (reviewDue) return reviewDue.id;
  const inProgress = books.find((b) => getBookStatus(b.id) === 'IN_PROGRESS');
  if (inProgress) return inProgress.id;
  const notStarted = books.find((b) => getBookStatus(b.id) === 'NOT_STARTED');
  if (notStarted) return notStarted.id;
  return null;
})();
```

**Step 3 — Update `use-all-books.ts` hook**

File: `apps/mobile/src/hooks/use-all-books.ts` (lines 72–76)

The heuristic `book.topicsGenerated ? 'IN_PROGRESS' : 'NOT_STARTED'` can now use `book.status`:

```typescript
status: (book.status ??
  (book.topicsGenerated ? 'IN_PROGRESS' : 'NOT_STARTED')) as BookProgressStatus,
```

### Verification

- `test: apps/api/src/routes/books.test.ts:"GET /subjects/:subjectId/books"` — add a test asserting status is present and correct for `NOT_STARTED`, `IN_PROGRESS`, `COMPLETED`, `REVIEW_DUE` cases.
- `test: manual` — open a shelf screen with at least one completed book and confirm `BookCard` renders the green `COMPLETED` badge.

---

## Item 3 — Shelf Progress Bar

### Problem

The shelf screen header shows `{books.length} books` (line 243–244). There is no subject-level indicator of how many topics the learner has covered across all books on the shelf. The "magic library" feel requires this.

### Data needed

Count of topics with at least one completed session / total topics for the subject. This is not available in any existing endpoint. `getBooks` (updated in Item 2) returns per-book status but not raw topic counts. The `useBooks` hook returns `CurriculumBook[]` without topic counts.

The `BookWithTopics` endpoint (per-book detail) includes `completedTopicCount` and `topics.length`, but loading it for every book on the shelf is N+1.

**Approach:** Add a lightweight aggregated query to the `getBooks` response: include `topicCount` and `completedTopicCount` per book in the list response. This extends what Item 2 already does.

### Schema changes

None — no migration required.

### API changes

File: `packages/schemas/src/subjects.ts`

Extend `curriculumBookSchema` further (building on Item 2's change):

```typescript
export const curriculumBookSchema = z.object({
  // ... existing fields
  status: bookProgressStatusSchema.optional(),
  topicCount: z.number().int().optional(),      // add this
  completedTopicCount: z.number().int().optional(), // add this
});
```

File: `apps/api/src/services/curriculum.ts`

In the updated `getBooks` (from Item 2), `statusResults[i]` already has `completedTopicCount`. The `topicsByBook` map already has total topic count per book. Return both:

```typescript
return rows.map((book, i) => ({
  ...mapBookRow(book),
  status: statusResults[i]!.status,
  topicCount: (topicsByBook.get(book.id) ?? []).length,
  completedTopicCount: statusResults[i]!.completedTopicCount,
}));
```

### Mobile changes

File: `apps/mobile/src/app/(app)/shelf/[subjectId]/index.tsx`

**Compute aggregate progress from the books array:**

```typescript
const totalTopics = books.reduce((sum, b) => sum + (b.topicCount ?? 0), 0);
const completedTopics = books.reduce(
  (sum, b) => sum + (b.completedTopicCount ?? 0),
  0
);
const showProgress = totalTopics > 0;
```

**Add progress bar below the header subtitle** (after line 244 — the `{books.length} books` text):

```tsx
{showProgress && (
  <View className="mt-2">
    <Text className="text-caption text-text-secondary mb-1">
      {completedTopics}/{totalTopics} topics
    </Text>
    <View className="h-1.5 bg-surface-elevated rounded-full overflow-hidden">
      <View
        className="h-full bg-primary rounded-full"
        style={{ width: `${Math.round((completedTopics / totalTopics) * 100)}%` }}
      />
    </View>
  </View>
)}
```

The `style` width uses an inline style (not NativeWind class) because the percentage is dynamic. The outer track uses `bg-surface-elevated` for the unfilled portion.

**testIDs to add:**

- `testID="shelf-progress-label"` on the `Text`
- `testID="shelf-progress-bar"` on the inner fill `View`

### Verification

- `test: manual` — open a shelf with at least one book that has sessions; confirm `{completedTopics}/{totalTopics} topics` renders below the books count.
- `test: manual` — open a shelf with no sessions; confirm the progress bar is not shown (not `0/N`, just hidden).
- `test: apps/api/src/routes/books.test.ts` — add assertion that `topicCount` and `completedTopicCount` are present in the list response.

---

## Item 4 — Inline Notes on Book Screen

### Problem

The book screen (`apps/mobile/src/app/(app)/shelf/[subjectId]/book/[bookId].tsx`) already fetches notes via `useBookNotes` (line 111). Notes are used to:

- Build `noteTopicIds` (a `Set<string>`) — used to show a note indicator dot on each `SessionRow`
- Show a note count in the stats row (lines 583–595)

But the actual note content is never displayed. Learners have no way to read what they wrote without tapping into a session.

### Data model

`BookNotesResponse` contains `notes: Array<{ topicId, content, updatedAt }>`. One note per topic per profile (enforced by the `unique` constraint on `topicNotes`). The `updatedAt` field is the last edit timestamp. There is no `createdAt` in the `bookNotesResponseSchema` (though the DB row has it). The API service `getNotesForBook` only returns `topicId`, `content`, `updatedAt`.

To show date separators, we need the date of each note. `updatedAt` is good enough — it represents the last time the note was modified.

### UI Design

**Placement:** Below the "Past sessions" section, above the floating "Start learning" button. Only rendered when `notes.length > 0`.

**Component: `InlineNoteCard`** (new, co-located in `apps/mobile/src/components/library/InlineNoteCard.tsx`)

Props:
```typescript
interface InlineNoteCardProps {
  topicTitle: string;
  content: string;
  updatedAt: string; // ISO datetime
  defaultExpanded?: boolean;
  testID?: string;
}
```

Behavior:
- Default state: shows topic title + first 2 lines of content (truncated with `numberOfLines={2}`).
- Tap to expand: shows full content. Tap again to collapse.
- Shows `updatedAt` formatted as a relative date (reuse `formatRelativeDate` already in `[bookId].tsx`).

**Date separators:** Group notes by calendar month of `updatedAt`. Render a `<Text>` separator (e.g., `"March 2026"`) between groups. Use the same pattern as `ChapterDivider` — a lightweight component, not the full `ChapterDivider`.

**Joining topic title:** `notes` from `useBookNotes` only has `topicId`, not the topic title. The `topics` array is available from `bookQuery.data.topics`. Build a lookup map:

```typescript
const topicTitleMap = useMemo(() => {
  const map = new Map<string, string>();
  for (const t of topics) map.set(t.id, t.title);
  return map;
}, [topics]);
```

**Full section render** (insert after the session list, before the `completedTopicCount >= topics.length` block):

```tsx
{notes.length > 0 && (
  <View className="mb-4" testID="book-notes-section">
    <Text className="text-body-sm font-semibold text-text-secondary mb-1 px-5 uppercase tracking-wide">
      My notes
    </Text>
    {notes.map((note) => (
      <InlineNoteCard
        key={note.topicId}
        topicTitle={topicTitleMap.get(note.topicId) ?? 'Topic'}
        content={note.content}
        updatedAt={note.updatedAt}
        testID={`note-${note.topicId}`}
      />
    ))}
  </View>
)}
```

Date separators are rendered by grouping notes by month inside the map loop. A simple approach is to track the last-rendered month in a mutable variable during the map and emit a separator `<Text>` when the month changes. Since `notes` is already sorted by `updatedAt` descending (the API orders `topicNotes` by `desc(topicNotes.updatedAt)` — confirmed in `notes.ts` line 109: no explicit order, but the `getNotesForBook` query has no `orderBy`), we should sort client-side:

```typescript
const sortedNotes = useMemo(
  () => [...notes].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
  [notes]
);
```

Then group by month:

```typescript
function formatMonthYear(isoDate: string): string {
  const d = new Date(isoDate);
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}
```

In the render loop, track `lastMonth` and emit a separator when it changes.

### `InlineNoteCard` implementation

File: `apps/mobile/src/components/library/InlineNoteCard.tsx`

```typescript
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '../../lib/theme';

interface InlineNoteCardProps {
  topicTitle: string;
  content: string;
  updatedAt: string;
  defaultExpanded?: boolean;
  testID?: string;
}

function formatRelativeDate(isoDate: string): string {
  // Same implementation as in [bookId].tsx — extracted here or import from a shared lib
  // ...
}

export function InlineNoteCard({
  topicTitle,
  content,
  updatedAt,
  defaultExpanded = false,
  testID,
}: InlineNoteCardProps): React.ReactElement {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const themeColors = useThemeColors();

  return (
    <Pressable
      onPress={() => setExpanded((v) => !v)}
      className="mx-5 mb-2 bg-surface rounded-card px-4 py-3"
      accessibilityRole="button"
      accessibilityLabel={`Note for ${topicTitle}. Tap to ${expanded ? 'collapse' : 'expand'}.`}
      testID={testID}
    >
      <View className="flex-row items-center justify-between mb-1">
        <Text className="text-caption font-semibold text-text-secondary flex-1 me-2" numberOfLines={1}>
          {topicTitle}
        </Text>
        <Text className="text-caption text-text-tertiary me-1">
          {formatRelativeDate(updatedAt)}
        </Text>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={14}
          color={themeColors.textSecondary}
        />
      </View>
      <Text
        className="text-body-sm text-text-primary"
        numberOfLines={expanded ? undefined : 2}
        testID={testID ? `${testID}-content` : undefined}
      >
        {content}
      </Text>
    </Pressable>
  );
}
```

**Note on `formatRelativeDate`:** This function is currently inlined in `[bookId].tsx` (lines 37–55). Extract it to `apps/mobile/src/lib/format-relative-date.ts` and import it in both files. Do not duplicate.

### Verification

- `test: manual` — create a note in a session, go to the book screen, confirm the note appears with topic title and truncated content.
- `test: manual` — tap the card, confirm it expands to show full content.
- `test: manual` — with 0 notes, confirm the "My notes" section is not rendered.
- `test: apps/mobile/src/components/library/InlineNoteCard.test.tsx` — add unit tests for collapsed/expanded states and relative date display.

---

## Failure Modes Table

| State | Trigger | User sees | Recovery |
|-------|---------|-----------|----------|
| Migration fails — duplicate sort orders exist | Unique index creation rejected by Postgres | Migration blocked, no prod deploy | Run pre-migration data check, fix duplicates, re-run |
| `getBooks` status query slow | N sessions × N books | Shelf screen takes >3s to load | Use batch query (described above) — single topic fetch for all books |
| `computeBookStatus` returns wrong REVIEW_DUE | retention_cards has a future `nextReviewAt` that becomes past | Book shows `COMPLETED` instead of `REVIEW_DUE` — stale cache | React Query auto-refetches on focus; acceptable eventual consistency |
| `book.status` absent on old cached response | Client cache from before the API update | Falls back to `topicsGenerated` heuristic in `getBookStatus` | Cache invalidated on next navigation |
| Shelf progress bar shows `0/0` | Book exists but `topicsGenerated = false`, no topics yet | Bar not shown (guarded by `totalTopics > 0`) | None needed |
| Note content missing topic title | `topicId` in note has no match in `topics` array | "Topic" shown as fallback | Acceptable — topics may not yet be loaded |
| Notes section renders stale after new note added | `useBookNotes` cache not yet refreshed | Old count in stats row, old or missing note inline | `useUpsertNote` already invalidates `['book-notes', subjectId, bookId, profileId]` on success |
| `InlineNoteCard` expand crashes | `undefined` returned by `numberOfLines` | RN renders full content — no crash | Correct behavior |

---

## Dependencies Between Items

```
Item 1 (migration)      ─ independent, deploy first
Item 2 (book status)    ─ independent of Item 1, deploy before Item 3
Item 3 (progress bar)   ─ depends on Item 2 (reuses the same getBooks extension)
Item 4 (inline notes)   ─ independent of all above
```

Items 2 and 3 share the same `getBooks` function modification. Implement them in the same commit to avoid two separate schema/service changes.

---

## File Change Summary

| File | Change |
|------|--------|
| `apps/api/drizzle/0021_book_sort_order_unique.sql` | New migration — add unique indexes |
| `packages/database/src/schema/subjects.ts` | Add `uniqueIndex` to `curriculumBooks` and `curriculumTopics` table definitions |
| `packages/schemas/src/subjects.ts` | Add optional `status`, `topicCount`, `completedTopicCount` to `curriculumBookSchema` |
| `apps/api/src/services/curriculum.ts` | Update `getBooks` to batch-compute status + topic counts |
| `apps/api/src/routes/books.test.ts` | Add tests for status + counts in list response |
| `apps/mobile/src/app/(app)/shelf/[subjectId]/index.tsx` | Replace local `getBookStatus`, add `suggestedBookId` priority for REVIEW_DUE, add progress bar |
| `apps/mobile/src/hooks/use-all-books.ts` | Use `book.status` when available |
| `apps/mobile/src/lib/format-relative-date.ts` | **New** — extract `formatRelativeDate` helper |
| `apps/mobile/src/app/(app)/shelf/[subjectId]/book/[bookId].tsx` | Import `formatRelativeDate` from shared lib, add notes section |
| `apps/mobile/src/components/library/InlineNoteCard.tsx` | **New** component |
| `apps/mobile/src/components/library/InlineNoteCard.test.tsx` | **New** co-located tests |

---

## Commit Sequence

1. `fix(db): add unique sort_order indexes on curriculum_books and curriculum_topics [LIB-01]`
2. `feat(api,mobile): surface COMPLETED/REVIEW_DUE book status in shelf screen + progress bar [LIB-02, LIB-03]`
3. `feat(mobile): inline note display on book screen [LIB-04]`

Run before each commit:
```bash
pnpm exec nx run api:typecheck
pnpm exec nx run api:lint
cd apps/mobile && pnpm exec tsc --noEmit
pnpm exec nx lint mobile
pnpm exec jest --findRelatedTests <changed files> --no-coverage
```
