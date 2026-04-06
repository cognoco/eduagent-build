# Story 7.7: Library Search, Sort & Filter — Three-Tab Browsing

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the binary "Shelves / All Topics" toggle in the Library screen with three-tab browsing (Shelves / Books / Topics) and add search, sort, and filter controls to each tab — all client-side, no new API endpoints.

**Architecture:** Extract the monolithic `library.tsx` (942 lines) into focused tab components. Add a `useAllBooks` hook that uses `useQueries` to fetch books across all subjects client-side. Pure utility functions handle sorting and filtering. Each tab owns its own search/sort/filter state. The existing shelf-detail and book-detail drill-down navigation remains unchanged — tabs only replace the top-level Library view.

**Tech Stack:** React Native, NativeWind (Tailwind), TanStack Query (`useQueries`), Expo Router, `@eduagent/schemas` types, `@testing-library/react-native` for tests.

---

## File Structure

### New files

| File | Responsibility |
|------|---------------|
| `apps/mobile/src/components/library/LibraryTabs.tsx` | Three-tab segmented control with count badges |
| `apps/mobile/src/components/library/LibraryTabs.test.tsx` | Tests for tab rendering, selection, badge counts |
| `apps/mobile/src/components/library/LibrarySearchBar.tsx` | Text input with clear button |
| `apps/mobile/src/components/library/LibrarySearchBar.test.tsx` | Tests for search input behavior |
| `apps/mobile/src/components/library/SortFilterBar.tsx` | Sort selector + filter chips, generic for all tabs |
| `apps/mobile/src/components/library/SortFilterBar.test.tsx` | Tests for sort/filter controls |
| `apps/mobile/src/components/library/ShelvesTab.tsx` | Shelves tab content: subject cards with search/sort/filter |
| `apps/mobile/src/components/library/ShelvesTab.test.tsx` | Tests for shelves list, filtering, sorting |
| `apps/mobile/src/components/library/BooksTab.tsx` | Books tab content: flat book list with search/sort/filter |
| `apps/mobile/src/components/library/BooksTab.test.tsx` | Tests for books list, filtering, sorting |
| `apps/mobile/src/components/library/TopicsTab.tsx` | Topics tab content: flat topic list with search/sort/filter |
| `apps/mobile/src/components/library/TopicsTab.test.tsx` | Tests for topics list, filtering, sorting |
| `apps/mobile/src/components/library/LibraryEmptyState.tsx` | Reusable empty/no-results state |
| `apps/mobile/src/components/library/LibraryEmptyState.test.tsx` | Tests for empty states |
| `apps/mobile/src/hooks/use-all-books.ts` | Fetches books across all subjects via `useQueries` |
| `apps/mobile/src/hooks/use-all-books.test.ts` | Tests for book aggregation |
| `apps/mobile/src/lib/library-filters.ts` | Pure sort/filter/search functions for all three tabs |
| `apps/mobile/src/lib/library-filters.test.ts` | Unit tests for every sort/filter combination |

### Modified files

| File | Change |
|------|--------|
| `apps/mobile/src/app/(learner)/library.tsx` | Replace `showAllTopics` toggle with `LibraryTab` state. Replace inline `renderSubjectCards()` / `TopicRows` with tab components. Keep drill-down navigation (selectedSubjectId/selectedBookId) unchanged. |
| `apps/mobile/src/app/(learner)/library.test.tsx` | Update tests: new tab testIDs, three-tab switching, remove `library-view-all-topics` references. |

---

## Shared Types (used across tasks)

These types are defined in Task 1 (`library-filters.ts`) and imported by all tab components:

```typescript
// Tab enum
type LibraryTab = 'shelves' | 'books' | 'topics';

// Sort options per tab
type ShelvesSortKey = 'name-asc' | 'name-desc' | 'last-practiced-recent' | 'last-practiced-oldest' | 'progress' | 'retention';
type BooksSortKey = 'name-asc' | 'name-desc' | 'progress' | 'subject';
type TopicsSortKey = 'name-asc' | 'name-desc' | 'last-practiced' | 'retention' | 'repetitions';

// Filter options per tab
interface ShelvesFilters {
  status: Array<'active' | 'paused' | 'archived'>;
  retention: Array<'strong' | 'fading' | 'weak' | 'forgotten'>;
}
interface BooksFilters {
  subjectIds: string[];
  completion: Array<'not-started' | 'in-progress' | 'completed'>;
}
interface TopicsFilters {
  subjectIds: string[];
  bookIds: string[];
  retention: Array<'strong' | 'fading' | 'weak' | 'forgotten'>;
  needsAttention: boolean;
}

// Enriched book (book + parent subject name)
interface EnrichedBook {
  book: CurriculumBook;
  subjectId: string;
  subjectName: string;
  topicCount: number;
  completedCount: number;
  status: BookProgressStatus;
}

// EnrichedTopic — already defined in library.tsx, will be moved to library-filters.ts:
interface EnrichedTopic {
  topicId: string;
  subjectId: string;
  name: string;
  subjectName: string;
  subjectStatus: Subject['status'];
  bookId?: string | null;
  bookTitle?: string | null;
  chapter?: string | null;
  retention: RetentionStatus;
  lastReviewedAt: string | null;
  repetitions: number;
  failureCount: number;
}
```

---

## Task 1: Pure sort/filter/search utility functions

**Files:**
- Create: `apps/mobile/src/lib/library-filters.ts`
- Test: `apps/mobile/src/lib/library-filters.test.ts`

This task creates the pure-function engine that all three tabs will use. No React, no hooks — just data in, data out. This makes everything easy to test.

- [ ] **Step 1: Write failing tests for shelves filtering/sorting**

```typescript
// apps/mobile/src/lib/library-filters.test.ts
import {
  type LibraryTab,
  type ShelvesFilters,
  type BooksFilters,
  type TopicsFilters,
  type ShelvesSortKey,
  type BooksSortKey,
  type TopicsSortKey,
  type EnrichedBook,
  type EnrichedTopic,
  type ShelfItem,
  filterShelves,
  sortShelves,
  searchShelves,
  filterBooks,
  sortBooks,
  searchBooks,
  filterTopics,
  sortTopics,
  searchTopics,
} from './library-filters';
import type { SubjectProgress } from '@eduagent/schemas';

// ── Shelves fixtures ──

const mathShelf: ShelfItem = {
  subject: { id: 'sub-1', name: 'Mathematics', status: 'active', profileId: 'p1', pedagogyMode: 'four_strands', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  progress: { subjectId: 'sub-1', name: 'Mathematics', topicsTotal: 20, topicsCompleted: 10, topicsVerified: 5, urgencyScore: 0.3, retentionStatus: 'fading' as const, lastSessionAt: '2026-04-03T12:00:00Z' },
};

const historyShelf: ShelfItem = {
  subject: { id: 'sub-2', name: 'History', status: 'paused', profileId: 'p1', pedagogyMode: 'four_strands', createdAt: '2026-01-02T00:00:00Z', updatedAt: '2026-01-02T00:00:00Z' },
  progress: { subjectId: 'sub-2', name: 'History', topicsTotal: 15, topicsCompleted: 15, topicsVerified: 15, urgencyScore: 0, retentionStatus: 'strong' as const, lastSessionAt: '2026-04-04T08:00:00Z' },
};

const archivedShelf: ShelfItem = {
  subject: { id: 'sub-3', name: 'Art', status: 'archived', profileId: 'p1', pedagogyMode: 'four_strands', createdAt: '2026-01-03T00:00:00Z', updatedAt: '2026-01-03T00:00:00Z' },
  progress: { subjectId: 'sub-3', name: 'Art', topicsTotal: 5, topicsCompleted: 0, topicsVerified: 0, urgencyScore: 0.8, retentionStatus: 'weak' as const, lastSessionAt: null },
};

const allShelves = [mathShelf, historyShelf, archivedShelf];

describe('Shelves', () => {
  describe('searchShelves', () => {
    it('returns all shelves when query is empty', () => {
      expect(searchShelves(allShelves, '')).toEqual(allShelves);
    });

    it('filters by subject name case-insensitively', () => {
      expect(searchShelves(allShelves, 'math')).toEqual([mathShelf]);
    });

    it('returns empty array when nothing matches', () => {
      expect(searchShelves(allShelves, 'zzzzz')).toEqual([]);
    });
  });

  describe('filterShelves', () => {
    it('returns all when no filters active', () => {
      const filters: ShelvesFilters = { status: [], retention: [] };
      expect(filterShelves(allShelves, filters)).toEqual(allShelves);
    });

    it('filters by status', () => {
      const filters: ShelvesFilters = { status: ['paused'], retention: [] };
      expect(filterShelves(allShelves, filters)).toEqual([historyShelf]);
    });

    it('filters by retention', () => {
      const filters: ShelvesFilters = { status: [], retention: ['fading'] };
      expect(filterShelves(allShelves, filters)).toEqual([mathShelf]);
    });

    it('combines status + retention (AND logic)', () => {
      const filters: ShelvesFilters = { status: ['active'], retention: ['strong'] };
      expect(filterShelves(allShelves, filters)).toEqual([]);
    });
  });

  describe('sortShelves', () => {
    it('sorts by name A-Z', () => {
      const sorted = sortShelves(allShelves, 'name-asc');
      expect(sorted.map((s) => s.subject.name)).toEqual(['Art', 'History', 'Mathematics']);
    });

    it('sorts by name Z-A', () => {
      const sorted = sortShelves(allShelves, 'name-desc');
      expect(sorted.map((s) => s.subject.name)).toEqual(['Mathematics', 'History', 'Art']);
    });

    it('sorts by last practiced (recent first), nulls last', () => {
      const sorted = sortShelves(allShelves, 'last-practiced-recent');
      expect(sorted.map((s) => s.subject.name)).toEqual(['History', 'Mathematics', 'Art']);
    });

    it('sorts by progress (% complete descending)', () => {
      const sorted = sortShelves(allShelves, 'progress');
      expect(sorted.map((s) => s.subject.name)).toEqual(['History', 'Mathematics', 'Art']);
    });
  });
});
```

```typescript
// Continue in same file — Books fixtures + tests

const enrichedBook1: EnrichedBook = {
  book: { id: 'book-1', subjectId: 'sub-1', title: 'Algebra Basics', description: 'Intro to algebra', emoji: '📐', sortOrder: 1, topicsGenerated: true, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  subjectId: 'sub-1',
  subjectName: 'Mathematics',
  topicCount: 8,
  completedCount: 4,
  status: 'IN_PROGRESS',
};

const enrichedBook2: EnrichedBook = {
  book: { id: 'book-2', subjectId: 'sub-2', title: 'Ancient Egypt', description: 'Pyramids and pharaohs', emoji: '🏛️', sortOrder: 1, topicsGenerated: true, createdAt: '2026-01-02T00:00:00Z', updatedAt: '2026-01-02T00:00:00Z' },
  subjectId: 'sub-2',
  subjectName: 'History',
  topicCount: 6,
  completedCount: 6,
  status: 'COMPLETED',
};

const enrichedBook3: EnrichedBook = {
  book: { id: 'book-3', subjectId: 'sub-1', title: 'Geometry', description: null, emoji: '📏', sortOrder: 2, topicsGenerated: false, createdAt: '2026-01-03T00:00:00Z', updatedAt: '2026-01-03T00:00:00Z' },
  subjectId: 'sub-1',
  subjectName: 'Mathematics',
  topicCount: 0,
  completedCount: 0,
  status: 'NOT_STARTED',
};

const allBooks = [enrichedBook1, enrichedBook2, enrichedBook3];

describe('Books', () => {
  describe('searchBooks', () => {
    it('returns all when query is empty', () => {
      expect(searchBooks(allBooks, '')).toEqual(allBooks);
    });

    it('matches by title case-insensitively', () => {
      expect(searchBooks(allBooks, 'algebra')).toEqual([enrichedBook1]);
    });

    it('matches by description', () => {
      expect(searchBooks(allBooks, 'pyramids')).toEqual([enrichedBook2]);
    });
  });

  describe('filterBooks', () => {
    it('returns all when no filters active', () => {
      expect(filterBooks(allBooks, { subjectIds: [], completion: [] })).toEqual(allBooks);
    });

    it('filters by subject', () => {
      expect(filterBooks(allBooks, { subjectIds: ['sub-2'], completion: [] })).toEqual([enrichedBook2]);
    });

    it('filters by completion status', () => {
      expect(filterBooks(allBooks, { subjectIds: [], completion: ['completed'] })).toEqual([enrichedBook2]);
    });
  });

  describe('sortBooks', () => {
    it('sorts by name A-Z', () => {
      const sorted = sortBooks(allBooks, 'name-asc');
      expect(sorted.map((b) => b.book.title)).toEqual(['Algebra Basics', 'Ancient Egypt', 'Geometry']);
    });

    it('sorts by progress descending', () => {
      const sorted = sortBooks(allBooks, 'progress');
      expect(sorted.map((b) => b.book.title)).toEqual(['Ancient Egypt', 'Algebra Basics', 'Geometry']);
    });

    it('sorts by parent subject name', () => {
      const sorted = sortBooks(allBooks, 'subject');
      expect(sorted.map((b) => b.book.title)).toEqual(['Ancient Egypt', 'Algebra Basics', 'Geometry']);
    });
  });
});
```

```typescript
// Continue in same file — Topics fixtures + tests

const topic1: EnrichedTopic = {
  topicId: 'topic-1', subjectId: 'sub-1', name: 'Fractions',
  subjectName: 'Mathematics', subjectStatus: 'active',
  bookId: 'book-1', bookTitle: 'Algebra Basics', chapter: 'Ch 1',
  retention: 'strong', lastReviewedAt: '2026-04-04T10:00:00Z',
  repetitions: 5, failureCount: 0,
};

const topic2: EnrichedTopic = {
  topicId: 'topic-2', subjectId: 'sub-2', name: 'Pharaohs',
  subjectName: 'History', subjectStatus: 'paused',
  bookId: 'book-2', bookTitle: 'Ancient Egypt', chapter: null,
  retention: 'forgotten', lastReviewedAt: '2026-03-01T10:00:00Z',
  repetitions: 1, failureCount: 4,
};

const topic3: EnrichedTopic = {
  topicId: 'topic-3', subjectId: 'sub-1', name: 'Decimals',
  subjectName: 'Mathematics', subjectStatus: 'active',
  bookId: null, bookTitle: null, chapter: null,
  retention: 'fading', lastReviewedAt: null,
  repetitions: 0, failureCount: 0,
};

const allTopicsFixture = [topic1, topic2, topic3];

describe('Topics', () => {
  describe('searchTopics', () => {
    it('filters by name case-insensitively', () => {
      expect(searchTopics(allTopicsFixture, 'frac')).toEqual([topic1]);
    });
  });

  describe('filterTopics', () => {
    it('returns all when no filters active', () => {
      expect(filterTopics(allTopicsFixture, { subjectIds: [], bookIds: [], retention: [], needsAttention: false })).toEqual(allTopicsFixture);
    });

    it('filters by subject', () => {
      expect(filterTopics(allTopicsFixture, { subjectIds: ['sub-2'], bookIds: [], retention: [], needsAttention: false })).toEqual([topic2]);
    });

    it('filters by book', () => {
      expect(filterTopics(allTopicsFixture, { subjectIds: [], bookIds: ['book-1'], retention: [], needsAttention: false })).toEqual([topic1]);
    });

    it('filters by retention', () => {
      expect(filterTopics(allTopicsFixture, { subjectIds: [], bookIds: [], retention: ['forgotten'], needsAttention: false })).toEqual([topic2]);
    });

    it('filters needs attention (failureCount >= 3)', () => {
      expect(filterTopics(allTopicsFixture, { subjectIds: [], bookIds: [], retention: [], needsAttention: true })).toEqual([topic2]);
    });
  });

  describe('sortTopics', () => {
    it('sorts by name A-Z', () => {
      const sorted = sortTopics(allTopicsFixture, 'name-asc');
      expect(sorted.map((t) => t.name)).toEqual(['Decimals', 'Fractions', 'Pharaohs']);
    });

    it('sorts by retention urgency (forgotten first)', () => {
      const sorted = sortTopics(allTopicsFixture, 'retention');
      expect(sorted.map((t) => t.name)).toEqual(['Pharaohs', 'Decimals', 'Fractions']);
    });

    it('sorts by repetition count descending', () => {
      const sorted = sortTopics(allTopicsFixture, 'repetitions');
      expect(sorted.map((t) => t.name)).toEqual(['Fractions', 'Pharaohs', 'Decimals']);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/mobile && pnpm exec jest src/lib/library-filters.test.ts --no-coverage`
Expected: FAIL — `Cannot find module './library-filters'`

- [ ] **Step 3: Implement the library-filters module**

```typescript
// apps/mobile/src/lib/library-filters.ts
import type {
  Subject,
  CurriculumBook,
  BookProgressStatus,
  SubjectProgress,
} from '@eduagent/schemas';
import type { RetentionStatus } from '../components/progress';

// ── Tab type ──

export type LibraryTab = 'shelves' | 'books' | 'topics';

// ── Shelf types ──

export interface ShelfItem {
  subject: Subject;
  progress: SubjectProgress | undefined;
}

export type ShelvesSortKey =
  | 'name-asc'
  | 'name-desc'
  | 'last-practiced-recent'
  | 'last-practiced-oldest'
  | 'progress'
  | 'retention';

export interface ShelvesFilters {
  status: Array<Subject['status']>;
  retention: RetentionStatus[];
}

// ── Book types ──

export interface EnrichedBook {
  book: CurriculumBook;
  subjectId: string;
  subjectName: string;
  topicCount: number;
  completedCount: number;
  status: BookProgressStatus;
}

export type BooksSortKey = 'name-asc' | 'name-desc' | 'progress' | 'subject';

export interface BooksFilters {
  subjectIds: string[];
  completion: Array<'not-started' | 'in-progress' | 'completed'>;
}

// ── Topic types ──

export interface EnrichedTopic {
  topicId: string;
  subjectId: string;
  name: string;
  subjectName: string;
  subjectStatus: Subject['status'];
  bookId?: string | null;
  bookTitle?: string | null;
  chapter?: string | null;
  retention: RetentionStatus;
  lastReviewedAt: string | null;
  repetitions: number;
  failureCount: number;
}

export type TopicsSortKey =
  | 'name-asc'
  | 'name-desc'
  | 'last-practiced'
  | 'retention'
  | 'repetitions';

export interface TopicsFilters {
  subjectIds: string[];
  bookIds: string[];
  retention: RetentionStatus[];
  needsAttention: boolean;
}

// ── Shelves functions ──

export function searchShelves(shelves: ShelfItem[], query: string): ShelfItem[] {
  if (!query.trim()) return shelves;
  const q = query.toLowerCase();
  return shelves.filter((s) => s.subject.name.toLowerCase().includes(q));
}

export function filterShelves(shelves: ShelfItem[], filters: ShelvesFilters): ShelfItem[] {
  return shelves.filter((s) => {
    if (filters.status.length > 0 && !filters.status.includes(s.subject.status)) return false;
    if (filters.retention.length > 0) {
      const retention = s.progress?.retentionStatus;
      if (!retention || !filters.retention.includes(retention)) return false;
    }
    return true;
  });
}

function shelfProgress(s: ShelfItem): number {
  const total = s.progress?.topicsTotal ?? 0;
  return total > 0 ? (s.progress?.topicsCompleted ?? 0) / total : 0;
}

const RETENTION_ORDER: Record<string, number> = {
  forgotten: 0,
  weak: 1,
  fading: 2,
  strong: 3,
};

export function sortShelves(shelves: ShelfItem[], key: ShelvesSortKey): ShelfItem[] {
  const copy = [...shelves];
  switch (key) {
    case 'name-asc':
      return copy.sort((a, b) => a.subject.name.localeCompare(b.subject.name));
    case 'name-desc':
      return copy.sort((a, b) => b.subject.name.localeCompare(a.subject.name));
    case 'last-practiced-recent':
      return copy.sort((a, b) => {
        const aTime = a.progress?.lastSessionAt ? new Date(a.progress.lastSessionAt).getTime() : 0;
        const bTime = b.progress?.lastSessionAt ? new Date(b.progress.lastSessionAt).getTime() : 0;
        return bTime - aTime;
      });
    case 'last-practiced-oldest':
      return copy.sort((a, b) => {
        const aTime = a.progress?.lastSessionAt ? new Date(a.progress.lastSessionAt).getTime() : Infinity;
        const bTime = b.progress?.lastSessionAt ? new Date(b.progress.lastSessionAt).getTime() : Infinity;
        return aTime - bTime;
      });
    case 'progress':
      return copy.sort((a, b) => shelfProgress(b) - shelfProgress(a));
    case 'retention':
      return copy.sort(
        (a, b) =>
          (RETENTION_ORDER[a.progress?.retentionStatus ?? 'weak'] ?? 1) -
          (RETENTION_ORDER[b.progress?.retentionStatus ?? 'weak'] ?? 1)
      );
    default:
      return copy;
  }
}

// ── Books functions ──

export function searchBooks(books: EnrichedBook[], query: string): EnrichedBook[] {
  if (!query.trim()) return books;
  const q = query.toLowerCase();
  return books.filter(
    (b) =>
      b.book.title.toLowerCase().includes(q) ||
      (b.book.description?.toLowerCase().includes(q) ?? false)
  );
}

const COMPLETION_MAP: Record<string, BookProgressStatus[]> = {
  'not-started': ['NOT_STARTED'],
  'in-progress': ['IN_PROGRESS', 'REVIEW_DUE'],
  completed: ['COMPLETED'],
};

export function filterBooks(books: EnrichedBook[], filters: BooksFilters): EnrichedBook[] {
  return books.filter((b) => {
    if (filters.subjectIds.length > 0 && !filters.subjectIds.includes(b.subjectId)) return false;
    if (filters.completion.length > 0) {
      const allowed = filters.completion.flatMap((c) => COMPLETION_MAP[c] ?? []);
      if (!allowed.includes(b.status)) return false;
    }
    return true;
  });
}

function bookProgress(b: EnrichedBook): number {
  return b.topicCount > 0 ? b.completedCount / b.topicCount : 0;
}

export function sortBooks(books: EnrichedBook[], key: BooksSortKey): EnrichedBook[] {
  const copy = [...books];
  switch (key) {
    case 'name-asc':
      return copy.sort((a, b) => a.book.title.localeCompare(b.book.title));
    case 'name-desc':
      return copy.sort((a, b) => b.book.title.localeCompare(a.book.title));
    case 'progress':
      return copy.sort((a, b) => bookProgress(b) - bookProgress(a));
    case 'subject':
      return copy.sort((a, b) => a.subjectName.localeCompare(b.subjectName));
    default:
      return copy;
  }
}

// ── Topics functions ──

export function searchTopics(topics: EnrichedTopic[], query: string): EnrichedTopic[] {
  if (!query.trim()) return topics;
  const q = query.toLowerCase();
  return topics.filter((t) => t.name.toLowerCase().includes(q));
}

export function filterTopics(topics: EnrichedTopic[], filters: TopicsFilters): EnrichedTopic[] {
  return topics.filter((t) => {
    if (filters.subjectIds.length > 0 && !filters.subjectIds.includes(t.subjectId)) return false;
    if (filters.bookIds.length > 0 && (!t.bookId || !filters.bookIds.includes(t.bookId))) return false;
    if (filters.retention.length > 0 && !filters.retention.includes(t.retention)) return false;
    if (filters.needsAttention && t.failureCount < 3) return false;
    return true;
  });
}

export function sortTopics(topics: EnrichedTopic[], key: TopicsSortKey): EnrichedTopic[] {
  const copy = [...topics];
  switch (key) {
    case 'name-asc':
      return copy.sort((a, b) => a.name.localeCompare(b.name));
    case 'name-desc':
      return copy.sort((a, b) => b.name.localeCompare(a.name));
    case 'last-practiced':
      return copy.sort((a, b) => {
        const aTime = a.lastReviewedAt ? new Date(a.lastReviewedAt).getTime() : 0;
        const bTime = b.lastReviewedAt ? new Date(b.lastReviewedAt).getTime() : 0;
        return bTime - aTime;
      });
    case 'retention':
      return copy.sort(
        (a, b) => (RETENTION_ORDER[a.retention] ?? 1) - (RETENTION_ORDER[b.retention] ?? 1)
      );
    case 'repetitions':
      return copy.sort((a, b) => b.repetitions - a.repetitions);
    default:
      return copy;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/mobile && pnpm exec jest src/lib/library-filters.test.ts --no-coverage`
Expected: All 20+ tests PASS

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/lib/library-filters.ts apps/mobile/src/lib/library-filters.test.ts
git commit -m "feat(mobile): add pure sort/filter/search utilities for library tabs [7.7]"
```

---

## Task 2: `useAllBooks` hook — aggregate books across subjects

**Files:**
- Create: `apps/mobile/src/hooks/use-all-books.ts`
- Test: `apps/mobile/src/hooks/use-all-books.test.ts`
- Read: `apps/mobile/src/hooks/use-books.ts` (existing pattern to follow)

The Books tab needs a flat list of all books across all subjects. Since the spec says "no new API endpoints", we use `useQueries` to fetch books per subject and merge them. This follows the existing `retentionQueries` pattern in library.tsx (line 280).

- [ ] **Step 1: Write failing test**

```typescript
// apps/mobile/src/hooks/use-all-books.test.ts
import { renderHook, waitFor } from '@testing-library/react-native';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { CurriculumBook, BookWithTopics } from '@eduagent/schemas';

const mockUseSubjects = jest.fn();
const mockApiClient = {
  subjects: {
    ':subjectId': {
      books: {
        $get: jest.fn(),
        ':bookId': {
          $get: jest.fn(),
        },
      },
    },
  },
};

jest.mock('./use-subjects', () => ({
  useSubjects: () => mockUseSubjects(),
}));

jest.mock('../lib/api-client', () => ({
  useApiClient: () => mockApiClient,
}));

jest.mock('../lib/profile', () => ({
  useProfile: () => ({ activeProfile: { id: 'profile-1' } }),
}));

jest.mock('../lib/query-timeout', () => ({
  combinedSignal: (signal?: AbortSignal) => ({ signal: signal ?? new AbortController().signal, cleanup: () => {} }),
}));

jest.mock('../lib/assert-ok', () => ({
  assertOk: () => {},
}));

jest.mock('../components/progress', () => ({
  RetentionSignal: () => null,
}));

import { useAllBooks } from './use-all-books';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

describe('useAllBooks', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns empty array when there are no subjects', () => {
    mockUseSubjects.mockReturnValue({ data: [], isLoading: false });

    const { result } = renderHook(() => useAllBooks(), { wrapper: createWrapper() });

    expect(result.current.books).toEqual([]);
    expect(result.current.isLoading).toBe(false);
  });

  it('aggregates books from multiple subjects', async () => {
    const mathBooks: CurriculumBook[] = [
      { id: 'book-1', subjectId: 'sub-1', title: 'Algebra', description: 'Intro', emoji: '📐', sortOrder: 1, topicsGenerated: true, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
    ];
    const historyBooks: CurriculumBook[] = [
      { id: 'book-2', subjectId: 'sub-2', title: 'Egypt', description: null, emoji: '🏛️', sortOrder: 1, topicsGenerated: true, createdAt: '2026-01-02T00:00:00Z', updatedAt: '2026-01-02T00:00:00Z' },
    ];

    mockUseSubjects.mockReturnValue({
      data: [
        { id: 'sub-1', name: 'Math', status: 'active' },
        { id: 'sub-2', name: 'History', status: 'active' },
      ],
      isLoading: false,
    });

    mockApiClient.subjects[':subjectId'].books.$get
      .mockResolvedValueOnce({ ok: true, json: async () => ({ books: mathBooks }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ books: historyBooks }) });

    const { result } = renderHook(() => useAllBooks(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.books.length).toBe(2);
    });

    expect(result.current.books[0].subjectName).toBe('Math');
    expect(result.current.books[1].subjectName).toBe('History');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/mobile && pnpm exec jest src/hooks/use-all-books.test.ts --no-coverage`
Expected: FAIL — `Cannot find module './use-all-books'`

- [ ] **Step 3: Implement the hook**

```typescript
// apps/mobile/src/hooks/use-all-books.ts
import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import type { CurriculumBook } from '@eduagent/schemas';
import { useApiClient } from '../lib/api-client';
import { useProfile } from '../lib/profile';
import { useSubjects } from './use-subjects';
import { combinedSignal } from '../lib/query-timeout';
import { assertOk } from '../lib/assert-ok';
import type { EnrichedBook } from '../lib/library-filters';

interface UseAllBooksResult {
  books: EnrichedBook[];
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

export function useAllBooks(): UseAllBooksResult {
  const client = useApiClient();
  const { activeProfile } = useProfile();
  const subjectsQuery = useSubjects({ includeInactive: true });
  const subjects = subjectsQuery.data ?? [];

  const bookQueries = useQueries({
    queries: subjects.map((subject) => ({
      queryKey: ['books', subject.id, activeProfile?.id],
      queryFn: async ({ signal: querySignal }: { signal?: AbortSignal }) => {
        const { signal, cleanup } = combinedSignal(querySignal);
        try {
          const res = await client.subjects[':subjectId'].books.$get({
            param: { subjectId: subject.id },
            init: { signal },
          } as never);
          await assertOk(res);
          const data = (await res.json()) as { books: CurriculumBook[] };
          return { subjectId: subject.id, subjectName: subject.name, books: data.books };
        } finally {
          cleanup();
        }
      },
      enabled: !!activeProfile && !!subject.id,
    })),
  });

  const books = useMemo<EnrichedBook[]>(() => {
    return bookQueries.flatMap((query) => {
      if (!query.data) return [];
      return query.data.books.map((book) => ({
        book,
        subjectId: query.data.subjectId,
        subjectName: query.data.subjectName,
        // topic counts are filled when BookWithTopics detail is loaded;
        // default to 0 for the flat list view
        topicCount: 0,
        completedCount: 0,
        status: (book.topicsGenerated ? 'IN_PROGRESS' : 'NOT_STARTED') as const,
      }));
    });
  }, [bookQueries]);

  const isLoading = subjectsQuery.isLoading || bookQueries.some((q) => q.isLoading);
  const isError = subjectsQuery.isError || bookQueries.some((q) => q.isError);

  const refetch = (): void => {
    void subjectsQuery.refetch();
    bookQueries.forEach((q) => void q.refetch());
  };

  return { books, isLoading, isError, refetch };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/mobile && pnpm exec jest src/hooks/use-all-books.test.ts --no-coverage`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/hooks/use-all-books.ts apps/mobile/src/hooks/use-all-books.test.ts
git commit -m "feat(mobile): add useAllBooks hook for cross-subject book aggregation [7.7]"
```

---

## Task 3: `LibraryEmptyState` component

**Files:**
- Create: `apps/mobile/src/components/library/LibraryEmptyState.tsx`
- Test: `apps/mobile/src/components/library/LibraryEmptyState.test.tsx`

Two modes: (1) "no matches" with a "Clear" button, (2) "no content at all" with an "Add Subject" button. Used by all three tabs.

- [ ] **Step 1: Write failing test**

```typescript
// apps/mobile/src/components/library/LibraryEmptyState.test.tsx
import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { LibraryEmptyState } from './LibraryEmptyState';

describe('LibraryEmptyState', () => {
  it('shows no-results message with clear button', () => {
    const onClear = jest.fn();
    render(
      <LibraryEmptyState
        variant="no-results"
        entityName="books"
        onClear={onClear}
      />
    );

    expect(screen.getByText('No books match your search')).toBeTruthy();
    expect(screen.getByTestId('library-clear-search')).toBeTruthy();

    fireEvent.press(screen.getByTestId('library-clear-search'));
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it('shows no-content message with add subject button', () => {
    const onAddSubject = jest.fn();
    render(
      <LibraryEmptyState
        variant="no-content"
        onAddSubject={onAddSubject}
      />
    );

    expect(screen.getByText('Add a subject to start building your library')).toBeTruthy();
    expect(screen.getByTestId('library-add-subject-empty')).toBeTruthy();

    fireEvent.press(screen.getByTestId('library-add-subject-empty'));
    expect(onAddSubject).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/mobile && pnpm exec jest src/components/library/LibraryEmptyState.test.tsx --no-coverage`
Expected: FAIL — `Cannot find module './LibraryEmptyState'`

- [ ] **Step 3: Implement the component**

```typescript
// apps/mobile/src/components/library/LibraryEmptyState.tsx
import { Pressable, Text, View } from 'react-native';

type LibraryEmptyStateProps =
  | {
      variant: 'no-results';
      entityName: string;
      onClear: () => void;
    }
  | {
      variant: 'no-content';
      onAddSubject: () => void;
    };

export function LibraryEmptyState(props: LibraryEmptyStateProps): React.ReactElement {
  if (props.variant === 'no-results') {
    return (
      <View className="bg-surface rounded-card px-4 py-6 items-center" testID="library-no-results">
        <Text className="text-body text-text-secondary text-center mb-4">
          No {props.entityName} match your search
        </Text>
        <Pressable
          onPress={props.onClear}
          className="bg-surface-elevated rounded-button px-5 py-3 items-center"
          testID="library-clear-search"
        >
          <Text className="text-body font-semibold text-primary">
            Clear search
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View className="bg-surface rounded-card px-4 py-6 items-center" testID="library-no-content">
      <Text className="text-body text-text-secondary text-center mb-4">
        Add a subject to start building your library
      </Text>
      <Pressable
        onPress={props.onAddSubject}
        className="bg-primary rounded-button px-5 py-3 items-center"
        testID="library-add-subject-empty"
      >
        <Text className="text-body font-semibold text-text-inverse">
          Add Subject
        </Text>
      </Pressable>
    </View>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/mobile && pnpm exec jest src/components/library/LibraryEmptyState.test.tsx --no-coverage`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/components/library/LibraryEmptyState.tsx apps/mobile/src/components/library/LibraryEmptyState.test.tsx
git commit -m "feat(mobile): add LibraryEmptyState component [7.7]"
```

---

## Task 4: `LibraryTabs` component — three-tab segmented control with badges

**Files:**
- Create: `apps/mobile/src/components/library/LibraryTabs.tsx`
- Test: `apps/mobile/src/components/library/LibraryTabs.test.tsx`

Replaces the existing 2-button toggle. Shows count badges and uses the required testIDs from the spec.

- [ ] **Step 1: Write failing test**

```typescript
// apps/mobile/src/components/library/LibraryTabs.test.tsx
import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { LibraryTabs } from './LibraryTabs';
import type { LibraryTab } from '../../lib/library-filters';

describe('LibraryTabs', () => {
  const defaultProps = {
    activeTab: 'shelves' as LibraryTab,
    onTabChange: jest.fn(),
    counts: { shelves: 4, books: 12, topics: 87 },
  };

  it('renders all three tabs with count badges', () => {
    render(<LibraryTabs {...defaultProps} />);

    expect(screen.getByTestId('library-tab-shelves')).toBeTruthy();
    expect(screen.getByTestId('library-tab-books')).toBeTruthy();
    expect(screen.getByTestId('library-tab-topics')).toBeTruthy();

    expect(screen.getByText('Shelves (4)')).toBeTruthy();
    expect(screen.getByText('Books (12)')).toBeTruthy();
    expect(screen.getByText('Topics (87)')).toBeTruthy();
  });

  it('highlights the active tab', () => {
    render(<LibraryTabs {...defaultProps} activeTab="books" />);

    // The active tab should have the primary background styling
    // We verify via testID + accessibility state
    const booksTab = screen.getByTestId('library-tab-books');
    expect(booksTab).toBeTruthy();
  });

  it('calls onTabChange when a tab is pressed', () => {
    const onTabChange = jest.fn();
    render(<LibraryTabs {...defaultProps} onTabChange={onTabChange} />);

    fireEvent.press(screen.getByTestId('library-tab-books'));
    expect(onTabChange).toHaveBeenCalledWith('books');

    fireEvent.press(screen.getByTestId('library-tab-topics'));
    expect(onTabChange).toHaveBeenCalledWith('topics');
  });

  it('shows zero counts', () => {
    render(
      <LibraryTabs
        activeTab="shelves"
        onTabChange={jest.fn()}
        counts={{ shelves: 0, books: 0, topics: 0 }}
      />
    );

    expect(screen.getByText('Shelves (0)')).toBeTruthy();
    expect(screen.getByText('Books (0)')).toBeTruthy();
    expect(screen.getByText('Topics (0)')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/mobile && pnpm exec jest src/components/library/LibraryTabs.test.tsx --no-coverage`
Expected: FAIL — `Cannot find module './LibraryTabs'`

- [ ] **Step 3: Implement the component**

```typescript
// apps/mobile/src/components/library/LibraryTabs.tsx
import { Pressable, Text, View } from 'react-native';
import type { LibraryTab } from '../../lib/library-filters';

interface LibraryTabsProps {
  activeTab: LibraryTab;
  onTabChange: (tab: LibraryTab) => void;
  counts: Record<LibraryTab, number>;
}

const TAB_CONFIG: Array<{ key: LibraryTab; label: string }> = [
  { key: 'shelves', label: 'Shelves' },
  { key: 'books', label: 'Books' },
  { key: 'topics', label: 'Topics' },
];

export function LibraryTabs({
  activeTab,
  onTabChange,
  counts,
}: LibraryTabsProps): React.ReactElement {
  return (
    <View className="flex-row items-center mb-4 gap-2">
      {TAB_CONFIG.map(({ key, label }) => {
        const isActive = activeTab === key;
        return (
          <Pressable
            key={key}
            onPress={() => onTabChange(key)}
            className={`rounded-full px-4 py-2 ${
              isActive ? 'bg-primary' : 'bg-surface-elevated'
            }`}
            testID={`library-tab-${key}`}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
          >
            <Text
              className={`text-body-sm font-semibold ${
                isActive ? 'text-text-inverse' : 'text-text-secondary'
              }`}
            >
              {label} ({counts[key]})
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/mobile && pnpm exec jest src/components/library/LibraryTabs.test.tsx --no-coverage`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/components/library/LibraryTabs.tsx apps/mobile/src/components/library/LibraryTabs.test.tsx
git commit -m "feat(mobile): add LibraryTabs three-tab segmented control with badges [7.7]"
```

---

## Task 5: `LibrarySearchBar` component

**Files:**
- Create: `apps/mobile/src/components/library/LibrarySearchBar.tsx`
- Test: `apps/mobile/src/components/library/LibrarySearchBar.test.tsx`

A search input with a clear button. Used by all three tabs.

- [ ] **Step 1: Write failing test**

```typescript
// apps/mobile/src/components/library/LibrarySearchBar.test.tsx
import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { LibrarySearchBar } from './LibrarySearchBar';

jest.mock('../../lib/theme', () => ({
  useThemeColors: () => ({ accent: '#2563eb' }),
}));

describe('LibrarySearchBar', () => {
  it('renders with placeholder', () => {
    render(
      <LibrarySearchBar value="" onChangeText={jest.fn()} placeholder="Search shelves..." />
    );

    expect(screen.getByTestId('library-search-input')).toBeTruthy();
    expect(screen.getByPlaceholderText('Search shelves...')).toBeTruthy();
  });

  it('calls onChangeText when typing', () => {
    const onChangeText = jest.fn();
    render(
      <LibrarySearchBar value="" onChangeText={onChangeText} placeholder="Search..." />
    );

    fireEvent.changeText(screen.getByTestId('library-search-input'), 'math');
    expect(onChangeText).toHaveBeenCalledWith('math');
  });

  it('shows clear button when value is non-empty', () => {
    const onChangeText = jest.fn();
    render(
      <LibrarySearchBar value="math" onChangeText={onChangeText} placeholder="Search..." />
    );

    expect(screen.getByTestId('library-search-clear')).toBeTruthy();

    fireEvent.press(screen.getByTestId('library-search-clear'));
    expect(onChangeText).toHaveBeenCalledWith('');
  });

  it('hides clear button when value is empty', () => {
    render(
      <LibrarySearchBar value="" onChangeText={jest.fn()} placeholder="Search..." />
    );

    expect(screen.queryByTestId('library-search-clear')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/mobile && pnpm exec jest src/components/library/LibrarySearchBar.test.tsx --no-coverage`
Expected: FAIL — `Cannot find module './LibrarySearchBar'`

- [ ] **Step 3: Implement the component**

```typescript
// apps/mobile/src/components/library/LibrarySearchBar.tsx
import { Pressable, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '../../lib/theme';

interface LibrarySearchBarProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
}

export function LibrarySearchBar({
  value,
  onChangeText,
  placeholder,
}: LibrarySearchBarProps): React.ReactElement {
  const themeColors = useThemeColors();

  return (
    <View className="flex-row items-center bg-surface rounded-card px-3 py-2 mb-3">
      <Ionicons name="search" size={18} color={themeColors.accent} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#999"
        className="flex-1 text-body text-text-primary ms-2 py-1"
        testID="library-search-input"
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
      />
      {value.length > 0 && (
        <Pressable
          onPress={() => onChangeText('')}
          className="p-1"
          testID="library-search-clear"
          accessibilityLabel="Clear search"
        >
          <Ionicons name="close-circle" size={18} color="#999" />
        </Pressable>
      )}
    </View>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/mobile && pnpm exec jest src/components/library/LibrarySearchBar.test.tsx --no-coverage`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/components/library/LibrarySearchBar.tsx apps/mobile/src/components/library/LibrarySearchBar.test.tsx
git commit -m "feat(mobile): add LibrarySearchBar component [7.7]"
```

---

## Task 6: `SortFilterBar` component

**Files:**
- Create: `apps/mobile/src/components/library/SortFilterBar.tsx`
- Test: `apps/mobile/src/components/library/SortFilterBar.test.tsx`

A generic bar with a sort dropdown and filter chips. Each tab passes its own sort options and filter configuration. Uses a bottom sheet modal for filter selection.

- [ ] **Step 1: Write failing test**

```typescript
// apps/mobile/src/components/library/SortFilterBar.test.tsx
import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { SortFilterBar } from './SortFilterBar';

describe('SortFilterBar', () => {
  const sortOptions = [
    { key: 'name-asc', label: 'Name (A-Z)' },
    { key: 'name-desc', label: 'Name (Z-A)' },
    { key: 'progress', label: 'Progress' },
  ];

  const filterGroups = [
    {
      key: 'status',
      label: 'Status',
      options: [
        { key: 'active', label: 'Active' },
        { key: 'paused', label: 'Paused' },
      ],
      selected: [] as string[],
    },
  ];

  it('renders sort button with current sort label', () => {
    render(
      <SortFilterBar
        sortOptions={sortOptions}
        activeSortKey="name-asc"
        onSortChange={jest.fn()}
        filterGroups={filterGroups}
        onFilterChange={jest.fn()}
        activeFilterCount={0}
      />
    );

    expect(screen.getByTestId('library-sort-button')).toBeTruthy();
    expect(screen.getByText('Name (A-Z)')).toBeTruthy();
  });

  it('renders filter button with active count badge', () => {
    render(
      <SortFilterBar
        sortOptions={sortOptions}
        activeSortKey="name-asc"
        onSortChange={jest.fn()}
        filterGroups={filterGroups}
        onFilterChange={jest.fn()}
        activeFilterCount={2}
      />
    );

    expect(screen.getByTestId('library-filter-button')).toBeTruthy();
    expect(screen.getByText('Filter (2)')).toBeTruthy();
  });

  it('shows sort options when sort button is pressed', () => {
    const onSortChange = jest.fn();
    render(
      <SortFilterBar
        sortOptions={sortOptions}
        activeSortKey="name-asc"
        onSortChange={onSortChange}
        filterGroups={filterGroups}
        onFilterChange={jest.fn()}
        activeFilterCount={0}
      />
    );

    fireEvent.press(screen.getByTestId('library-sort-button'));
    // Sort options should be visible
    expect(screen.getByText('Name (Z-A)')).toBeTruthy();
    expect(screen.getByText('Progress')).toBeTruthy();

    fireEvent.press(screen.getByText('Progress'));
    expect(onSortChange).toHaveBeenCalledWith('progress');
  });

  it('shows filter options when filter button is pressed', () => {
    const onFilterChange = jest.fn();
    render(
      <SortFilterBar
        sortOptions={sortOptions}
        activeSortKey="name-asc"
        onSortChange={jest.fn()}
        filterGroups={filterGroups}
        onFilterChange={onFilterChange}
        activeFilterCount={0}
      />
    );

    fireEvent.press(screen.getByTestId('library-filter-button'));
    // Filter group heading and options should be visible
    expect(screen.getByText('Status')).toBeTruthy();
    expect(screen.getByText('Active')).toBeTruthy();
    expect(screen.getByText('Paused')).toBeTruthy();

    fireEvent.press(screen.getByText('Active'));
    expect(onFilterChange).toHaveBeenCalledWith('status', 'active');
  });

  it('shows "Filter" without count when zero filters active', () => {
    render(
      <SortFilterBar
        sortOptions={sortOptions}
        activeSortKey="name-asc"
        onSortChange={jest.fn()}
        filterGroups={filterGroups}
        onFilterChange={jest.fn()}
        activeFilterCount={0}
      />
    );

    expect(screen.getByText('Filter')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/mobile && pnpm exec jest src/components/library/SortFilterBar.test.tsx --no-coverage`
Expected: FAIL — `Cannot find module './SortFilterBar'`

- [ ] **Step 3: Implement the component**

```typescript
// apps/mobile/src/components/library/SortFilterBar.tsx
import { useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface SortOption {
  key: string;
  label: string;
}

interface FilterGroup {
  key: string;
  label: string;
  options: Array<{ key: string; label: string }>;
  selected: string[];
}

interface SortFilterBarProps {
  sortOptions: SortOption[];
  activeSortKey: string;
  onSortChange: (key: string) => void;
  filterGroups: FilterGroup[];
  onFilterChange: (groupKey: string, optionKey: string) => void;
  activeFilterCount: number;
}

export function SortFilterBar({
  sortOptions,
  activeSortKey,
  onSortChange,
  filterGroups,
  onFilterChange,
  activeFilterCount,
}: SortFilterBarProps): React.ReactElement {
  const [showSort, setShowSort] = useState(false);
  const [showFilter, setShowFilter] = useState(false);

  const activeSortLabel =
    sortOptions.find((o) => o.key === activeSortKey)?.label ?? 'Sort';

  return (
    <>
      <View className="flex-row items-center gap-2 mb-3">
        <Pressable
          onPress={() => setShowSort(true)}
          className="flex-row items-center bg-surface rounded-full px-3 py-2 gap-1"
          testID="library-sort-button"
        >
          <Ionicons name="swap-vertical" size={16} color="#888" />
          <Text className="text-caption font-medium text-text-secondary">
            {activeSortLabel}
          </Text>
        </Pressable>

        <Pressable
          onPress={() => setShowFilter(true)}
          className="flex-row items-center bg-surface rounded-full px-3 py-2 gap-1"
          testID="library-filter-button"
        >
          <Ionicons name="funnel-outline" size={16} color="#888" />
          <Text className="text-caption font-medium text-text-secondary">
            {activeFilterCount > 0 ? `Filter (${activeFilterCount})` : 'Filter'}
          </Text>
        </Pressable>
      </View>

      {/* Sort modal */}
      <Modal visible={showSort} transparent animationType="fade" onRequestClose={() => setShowSort(false)}>
        <Pressable className="flex-1 bg-black/40 justify-end" onPress={() => setShowSort(false)}>
          <View className="bg-background rounded-t-3xl px-5 pt-5 pb-8">
            <Text className="text-h3 font-semibold text-text-primary mb-4">Sort by</Text>
            {sortOptions.map((option) => (
              <Pressable
                key={option.key}
                onPress={() => {
                  onSortChange(option.key);
                  setShowSort(false);
                }}
                className={`rounded-card px-4 py-3 mb-2 ${
                  option.key === activeSortKey ? 'bg-primary/10' : 'bg-surface'
                }`}
              >
                <Text
                  className={`text-body ${
                    option.key === activeSortKey
                      ? 'font-semibold text-primary'
                      : 'text-text-primary'
                  }`}
                >
                  {option.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>

      {/* Filter modal */}
      <Modal visible={showFilter} transparent animationType="fade" onRequestClose={() => setShowFilter(false)}>
        <Pressable className="flex-1 bg-black/40 justify-end" onPress={() => setShowFilter(false)}>
          <View className="bg-background rounded-t-3xl px-5 pt-5 pb-8">
            <Text className="text-h3 font-semibold text-text-primary mb-4">Filters</Text>
            <ScrollView style={{ maxHeight: 400 }}>
              {filterGroups.map((group) => (
                <View key={group.key} className="mb-4">
                  <Text className="text-body-sm font-semibold text-text-secondary mb-2">
                    {group.label}
                  </Text>
                  <View className="flex-row flex-wrap gap-2">
                    {group.options.map((option) => {
                      const isSelected = group.selected.includes(option.key);
                      return (
                        <Pressable
                          key={option.key}
                          onPress={() => onFilterChange(group.key, option.key)}
                          className={`rounded-full px-3 py-1.5 ${
                            isSelected ? 'bg-primary' : 'bg-surface-elevated'
                          }`}
                        >
                          <Text
                            className={`text-caption font-medium ${
                              isSelected ? 'text-text-inverse' : 'text-text-secondary'
                            }`}
                          >
                            {option.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              ))}
            </ScrollView>
            <Pressable onPress={() => setShowFilter(false)} className="items-center py-3 mt-2">
              <Text className="text-body font-semibold text-text-secondary">Done</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/mobile && pnpm exec jest src/components/library/SortFilterBar.test.tsx --no-coverage`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/components/library/SortFilterBar.tsx apps/mobile/src/components/library/SortFilterBar.test.tsx
git commit -m "feat(mobile): add SortFilterBar component with sort/filter modals [7.7]"
```

---

## Task 7: `ShelvesTab` component

**Files:**
- Create: `apps/mobile/src/components/library/ShelvesTab.tsx`
- Test: `apps/mobile/src/components/library/ShelvesTab.test.tsx`
- Read: `apps/mobile/src/app/(learner)/library.tsx:398-484` (existing `renderSubjectCards` to extract from)

Extracts the existing subject cards rendering from `library.tsx` and adds search/sort/filter on top.

- [ ] **Step 1: Write failing test**

```typescript
// apps/mobile/src/components/library/ShelvesTab.test.tsx
import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { ShelvesTab } from './ShelvesTab';
import type { ShelfItem } from '../../lib/library-filters';

jest.mock('../../lib/theme', () => ({
  useThemeColors: () => ({ accent: '#2563eb' }),
}));

jest.mock('../../components/progress', () => ({
  RetentionSignal: ({ status }: { status: string }) => {
    const { Text } = require('react-native');
    return <Text>{status}</Text>;
  },
}));

const mathShelf: ShelfItem = {
  subject: { id: 'sub-1', name: 'Mathematics', status: 'active', profileId: 'p1', pedagogyMode: 'four_strands', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  progress: { subjectId: 'sub-1', name: 'Mathematics', topicsTotal: 20, topicsCompleted: 10, topicsVerified: 5, urgencyScore: 0.3, retentionStatus: 'fading' as const, lastSessionAt: '2026-04-03T12:00:00Z' },
};

const historyShelf: ShelfItem = {
  subject: { id: 'sub-2', name: 'History', status: 'paused', profileId: 'p1', pedagogyMode: 'four_strands', createdAt: '2026-01-02T00:00:00Z', updatedAt: '2026-01-02T00:00:00Z' },
  progress: { subjectId: 'sub-2', name: 'History', topicsTotal: 15, topicsCompleted: 15, topicsVerified: 15, urgencyScore: 0, retentionStatus: 'strong' as const, lastSessionAt: null },
};

describe('ShelvesTab', () => {
  const defaultProps = {
    shelves: [mathShelf, historyShelf],
    onShelfPress: jest.fn(),
    onAddSubject: jest.fn(),
  };

  it('renders shelf cards', () => {
    render(<ShelvesTab {...defaultProps} />);

    expect(screen.getByText('Mathematics')).toBeTruthy();
    expect(screen.getByText('History')).toBeTruthy();
    expect(screen.getByText('10/20 topics')).toBeTruthy();
  });

  it('filters shelves by search text', () => {
    render(<ShelvesTab {...defaultProps} />);

    fireEvent.changeText(screen.getByTestId('library-search-input'), 'math');

    expect(screen.getByText('Mathematics')).toBeTruthy();
    expect(screen.queryByText('History')).toBeNull();
  });

  it('shows no-results state when search matches nothing', () => {
    render(<ShelvesTab {...defaultProps} />);

    fireEvent.changeText(screen.getByTestId('library-search-input'), 'zzzzz');

    expect(screen.getByText('No shelves match your search')).toBeTruthy();
    expect(screen.getByTestId('library-clear-search')).toBeTruthy();
  });

  it('clears search when clear button is pressed', () => {
    render(<ShelvesTab {...defaultProps} />);

    fireEvent.changeText(screen.getByTestId('library-search-input'), 'zzzzz');
    fireEvent.press(screen.getByTestId('library-clear-search'));

    expect(screen.getByText('Mathematics')).toBeTruthy();
    expect(screen.getByText('History')).toBeTruthy();
  });

  it('calls onShelfPress when a shelf card is tapped', () => {
    const onShelfPress = jest.fn();
    render(<ShelvesTab {...defaultProps} onShelfPress={onShelfPress} />);

    fireEvent.press(screen.getByTestId('subject-card-sub-1'));
    expect(onShelfPress).toHaveBeenCalledWith('sub-1');
  });

  it('shows empty state when no shelves exist', () => {
    const onAddSubject = jest.fn();
    render(<ShelvesTab shelves={[]} onShelfPress={jest.fn()} onAddSubject={onAddSubject} />);

    expect(screen.getByText('Add a subject to start building your library')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/mobile && pnpm exec jest src/components/library/ShelvesTab.test.tsx --no-coverage`
Expected: FAIL — `Cannot find module './ShelvesTab'`

- [ ] **Step 3: Implement the component**

```typescript
// apps/mobile/src/components/library/ShelvesTab.tsx
import { useMemo, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { RetentionSignal } from '../progress';
import { LibrarySearchBar } from './LibrarySearchBar';
import { SortFilterBar } from './SortFilterBar';
import { LibraryEmptyState } from './LibraryEmptyState';
import {
  type ShelfItem,
  type ShelvesSortKey,
  type ShelvesFilters,
  searchShelves,
  filterShelves,
  sortShelves,
} from '../../lib/library-filters';

interface ShelvesTabProps {
  shelves: ShelfItem[];
  onShelfPress: (subjectId: string) => void;
  onAddSubject: () => void;
}

function formatLastPracticed(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  const diffDays = Math.floor(
    (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24)
  );
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function SubjectStatusPill({ status }: { status: string }): React.ReactElement | null {
  if (status === 'active') return null;
  return (
    <View
      className={
        status === 'paused'
          ? 'rounded-full px-2 py-1 bg-warning/15'
          : 'rounded-full px-2 py-1 bg-text-secondary/15'
      }
    >
      <Text
        className={
          status === 'paused'
            ? 'text-caption font-medium text-warning'
            : 'text-caption font-medium text-text-secondary'
        }
      >
        {status === 'paused' ? 'Paused' : 'Archived'}
      </Text>
    </View>
  );
}

const SORT_OPTIONS = [
  { key: 'name-asc', label: 'Name (A-Z)' },
  { key: 'name-desc', label: 'Name (Z-A)' },
  { key: 'last-practiced-recent', label: 'Last practiced (recent)' },
  { key: 'last-practiced-oldest', label: 'Last practiced (oldest)' },
  { key: 'progress', label: 'Progress' },
  { key: 'retention', label: 'Retention status' },
];

export function ShelvesTab({
  shelves,
  onShelfPress,
  onAddSubject,
}: ShelvesTabProps): React.ReactElement {
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<ShelvesSortKey>('name-asc');
  const [filters, setFilters] = useState<ShelvesFilters>({
    status: [],
    retention: [],
  });

  const filtered = useMemo(() => {
    let result = searchShelves(shelves, search);
    result = filterShelves(result, filters);
    result = sortShelves(result, sortKey);
    return result;
  }, [shelves, search, filters, sortKey]);

  const activeFilterCount = filters.status.length + filters.retention.length;

  const handleFilterChange = (groupKey: string, optionKey: string): void => {
    setFilters((prev) => {
      const group = groupKey as keyof ShelvesFilters;
      const current = prev[group] as string[];
      const next = current.includes(optionKey)
        ? current.filter((k) => k !== optionKey)
        : [...current, optionKey];
      return { ...prev, [group]: next };
    });
  };

  const clearSearch = (): void => {
    setSearch('');
    setFilters({ status: [], retention: [] });
  };

  if (shelves.length === 0) {
    return <LibraryEmptyState variant="no-content" onAddSubject={onAddSubject} />;
  }

  const filterGroups = [
    {
      key: 'status',
      label: 'Status',
      options: [
        { key: 'active', label: 'Active' },
        { key: 'paused', label: 'Paused' },
        { key: 'archived', label: 'Archived' },
      ],
      selected: filters.status,
    },
    {
      key: 'retention',
      label: 'Retention',
      options: [
        { key: 'strong', label: 'Strong' },
        { key: 'fading', label: 'Fading' },
        { key: 'weak', label: 'Weak' },
        { key: 'forgotten', label: 'Forgotten' },
      ],
      selected: filters.retention,
    },
  ];

  return (
    <View className="flex-1">
      <LibrarySearchBar
        value={search}
        onChangeText={setSearch}
        placeholder="Search shelves..."
      />
      <SortFilterBar
        sortOptions={SORT_OPTIONS}
        activeSortKey={sortKey}
        onSortChange={(key) => setSortKey(key as ShelvesSortKey)}
        filterGroups={filterGroups}
        onFilterChange={handleFilterChange}
        activeFilterCount={activeFilterCount}
      />

      {filtered.length === 0 ? (
        <LibraryEmptyState
          variant="no-results"
          entityName="shelves"
          onClear={clearSearch}
        />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.subject.id}
          renderItem={({ item }) => {
            const progress = item.progress;
            const progressLabel =
              progress && progress.topicsTotal > 0
                ? `${progress.topicsCompleted}/${progress.topicsTotal} topics`
                : 'Shelf ready to explore';

            return (
              <Pressable
                onPress={() => onShelfPress(item.subject.id)}
                className="bg-surface rounded-card px-4 py-4 mb-3"
                testID={`subject-card-${item.subject.id}`}
              >
                <View className="flex-row items-start justify-between">
                  <View className="flex-1 me-3">
                    <View className="flex-row items-center mb-1">
                      <Text className="text-body font-semibold text-text-primary">
                        {item.subject.name}
                      </Text>
                      <View className="ms-2">
                        <SubjectStatusPill status={item.subject.status} />
                      </View>
                    </View>
                    <Text className="text-body-sm text-text-secondary">
                      {progressLabel}
                    </Text>
                    {progress?.lastSessionAt && (
                      <Text className="text-caption text-text-tertiary mt-2">
                        Last session: {formatLastPracticed(progress.lastSessionAt)}
                      </Text>
                    )}
                  </View>
                  <View className="items-end">
                    {progress && item.subject.status === 'active' && (
                      <RetentionSignal status={progress.retentionStatus} compact />
                    )}
                    <Text className="text-caption text-primary mt-3">
                      Open shelf
                    </Text>
                  </View>
                </View>
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/mobile && pnpm exec jest src/components/library/ShelvesTab.test.tsx --no-coverage`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/components/library/ShelvesTab.tsx apps/mobile/src/components/library/ShelvesTab.test.tsx
git commit -m "feat(mobile): add ShelvesTab with search/sort/filter [7.7]"
```

---

## Task 8: `BooksTab` component

**Files:**
- Create: `apps/mobile/src/components/library/BooksTab.tsx`
- Test: `apps/mobile/src/components/library/BooksTab.test.tsx`
- Read: `apps/mobile/src/components/library/BookCard.tsx` (reuse existing card)

Flat list of all books across subjects. Each card shows the parent subject name. Tapping navigates to the book's topic list.

- [ ] **Step 1: Write failing test**

```typescript
// apps/mobile/src/components/library/BooksTab.test.tsx
import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { BooksTab } from './BooksTab';
import type { EnrichedBook } from '../../lib/library-filters';

jest.mock('../../lib/theme', () => ({
  useThemeColors: () => ({ accent: '#2563eb' }),
}));

const algebraBook: EnrichedBook = {
  book: { id: 'book-1', subjectId: 'sub-1', title: 'Algebra Basics', description: 'Intro to algebra', emoji: '📐', sortOrder: 1, topicsGenerated: true, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  subjectId: 'sub-1',
  subjectName: 'Mathematics',
  topicCount: 8,
  completedCount: 4,
  status: 'IN_PROGRESS',
};

const egyptBook: EnrichedBook = {
  book: { id: 'book-2', subjectId: 'sub-2', title: 'Ancient Egypt', description: 'Pyramids and pharaohs', emoji: '🏛️', sortOrder: 1, topicsGenerated: true, createdAt: '2026-01-02T00:00:00Z', updatedAt: '2026-01-02T00:00:00Z' },
  subjectId: 'sub-2',
  subjectName: 'History',
  topicCount: 6,
  completedCount: 6,
  status: 'COMPLETED',
};

describe('BooksTab', () => {
  const defaultProps = {
    books: [algebraBook, egyptBook],
    subjects: [
      { id: 'sub-1', name: 'Mathematics' },
      { id: 'sub-2', name: 'History' },
    ],
    onBookPress: jest.fn(),
    onAddSubject: jest.fn(),
  };

  it('renders book cards with parent subject name', () => {
    render(<BooksTab {...defaultProps} />);

    expect(screen.getByText('Algebra Basics')).toBeTruthy();
    expect(screen.getByText('Ancient Egypt')).toBeTruthy();
    expect(screen.getByText('Mathematics')).toBeTruthy();
    expect(screen.getByText('History')).toBeTruthy();
  });

  it('filters books by search text (title)', () => {
    render(<BooksTab {...defaultProps} />);

    fireEvent.changeText(screen.getByTestId('library-search-input'), 'algebra');

    expect(screen.getByText('Algebra Basics')).toBeTruthy();
    expect(screen.queryByText('Ancient Egypt')).toBeNull();
  });

  it('filters books by search text (description)', () => {
    render(<BooksTab {...defaultProps} />);

    fireEvent.changeText(screen.getByTestId('library-search-input'), 'pyramids');

    expect(screen.queryByText('Algebra Basics')).toBeNull();
    expect(screen.getByText('Ancient Egypt')).toBeTruthy();
  });

  it('shows no-results state', () => {
    render(<BooksTab {...defaultProps} />);

    fireEvent.changeText(screen.getByTestId('library-search-input'), 'zzzzz');

    expect(screen.getByText('No books match your search')).toBeTruthy();
  });

  it('calls onBookPress with subjectId and bookId', () => {
    const onBookPress = jest.fn();
    render(<BooksTab {...defaultProps} onBookPress={onBookPress} />);

    fireEvent.press(screen.getByTestId('book-card-book-1'));
    expect(onBookPress).toHaveBeenCalledWith('sub-1', 'book-1');
  });

  it('shows empty state when no books exist', () => {
    render(<BooksTab books={[]} subjects={[]} onBookPress={jest.fn()} onAddSubject={jest.fn()} />);

    expect(screen.getByText('Add a subject to start building your library')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/mobile && pnpm exec jest src/components/library/BooksTab.test.tsx --no-coverage`
Expected: FAIL — `Cannot find module './BooksTab'`

- [ ] **Step 3: Implement the component**

```typescript
// apps/mobile/src/components/library/BooksTab.tsx
import { useMemo, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { LibrarySearchBar } from './LibrarySearchBar';
import { SortFilterBar } from './SortFilterBar';
import { LibraryEmptyState } from './LibraryEmptyState';
import {
  type EnrichedBook,
  type BooksSortKey,
  type BooksFilters,
  searchBooks,
  filterBooks,
  sortBooks,
} from '../../lib/library-filters';

interface BooksTabProps {
  books: EnrichedBook[];
  subjects: Array<{ id: string; name: string }>;
  onBookPress: (subjectId: string, bookId: string) => void;
  onAddSubject: () => void;
}

const STATUS_STYLES: Record<string, string> = {
  NOT_STARTED: 'bg-surface',
  IN_PROGRESS: 'bg-primary/10',
  COMPLETED: 'bg-success/10',
  REVIEW_DUE: 'bg-warning/10',
};

const STATUS_LABELS: Record<string, string> = {
  NOT_STARTED: 'Not started',
  IN_PROGRESS: 'In progress',
  COMPLETED: 'Complete',
  REVIEW_DUE: 'Review due',
};

const SORT_OPTIONS = [
  { key: 'name-asc', label: 'Name (A-Z)' },
  { key: 'name-desc', label: 'Name (Z-A)' },
  { key: 'progress', label: 'Progress' },
  { key: 'subject', label: 'Subject' },
];

export function BooksTab({
  books,
  subjects,
  onBookPress,
  onAddSubject,
}: BooksTabProps): React.ReactElement {
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<BooksSortKey>('name-asc');
  const [filters, setFilters] = useState<BooksFilters>({
    subjectIds: [],
    completion: [],
  });

  const filtered = useMemo(() => {
    let result = searchBooks(books, search);
    result = filterBooks(result, filters);
    result = sortBooks(result, sortKey);
    return result;
  }, [books, search, filters, sortKey]);

  const activeFilterCount = filters.subjectIds.length + filters.completion.length;

  const handleFilterChange = (groupKey: string, optionKey: string): void => {
    setFilters((prev) => {
      if (groupKey === 'subject') {
        const current = prev.subjectIds;
        const next = current.includes(optionKey)
          ? current.filter((k) => k !== optionKey)
          : [...current, optionKey];
        return { ...prev, subjectIds: next };
      }
      const current = prev.completion;
      const next = current.includes(optionKey)
        ? current.filter((k) => k !== optionKey)
        : [...current, optionKey];
      return { ...prev, completion: next as BooksFilters['completion'] };
    });
  };

  const clearSearch = (): void => {
    setSearch('');
    setFilters({ subjectIds: [], completion: [] });
  };

  if (books.length === 0) {
    return <LibraryEmptyState variant="no-content" onAddSubject={onAddSubject} />;
  }

  const filterGroups = [
    {
      key: 'subject',
      label: 'Subject',
      options: subjects.map((s) => ({ key: s.id, label: s.name })),
      selected: filters.subjectIds,
    },
    {
      key: 'completion',
      label: 'Completion',
      options: [
        { key: 'not-started', label: 'Not started' },
        { key: 'in-progress', label: 'In progress' },
        { key: 'completed', label: 'Completed' },
      ],
      selected: filters.completion,
    },
  ];

  return (
    <View className="flex-1">
      <LibrarySearchBar
        value={search}
        onChangeText={setSearch}
        placeholder="Search books..."
      />
      <SortFilterBar
        sortOptions={SORT_OPTIONS}
        activeSortKey={sortKey}
        onSortChange={(key) => setSortKey(key as BooksSortKey)}
        filterGroups={filterGroups}
        onFilterChange={handleFilterChange}
        activeFilterCount={activeFilterCount}
      />

      {filtered.length === 0 ? (
        <LibraryEmptyState
          variant="no-results"
          entityName="books"
          onClear={clearSearch}
        />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.book.id}
          renderItem={({ item }) => {
            const progressLabel =
              item.topicCount > 0
                ? `${item.completedCount}/${item.topicCount} topics`
                : item.book.topicsGenerated
                ? 'Ready to open'
                : 'Build this book';

            return (
              <Pressable
                onPress={() => onBookPress(item.subjectId, item.book.id)}
                className={`rounded-card px-4 py-4 mb-3 ${STATUS_STYLES[item.status] ?? 'bg-surface'}`}
                testID={`book-card-${item.book.id}`}
              >
                <View className="flex-row items-start">
                  <View className="w-12 h-12 rounded-2xl bg-surface-elevated items-center justify-center me-3">
                    <Text className="text-2xl">{item.book.emoji ?? '📘'}</Text>
                  </View>
                  <View className="flex-1">
                    <View className="flex-row items-start justify-between">
                      <Text className="text-body font-semibold text-text-primary flex-1 me-3">
                        {item.book.title}
                      </Text>
                      <Text className="text-caption font-semibold text-text-secondary">
                        {STATUS_LABELS[item.status] ?? ''}
                      </Text>
                    </View>
                    {item.book.description && (
                      <Text className="text-body-sm text-text-secondary mt-1">
                        {item.book.description}
                      </Text>
                    )}
                    <Text className="text-caption text-primary mt-1">
                      {item.subjectName}
                    </Text>
                    <Text className="text-caption text-text-tertiary mt-1">
                      {progressLabel}
                    </Text>
                  </View>
                </View>
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/mobile && pnpm exec jest src/components/library/BooksTab.test.tsx --no-coverage`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/components/library/BooksTab.tsx apps/mobile/src/components/library/BooksTab.test.tsx
git commit -m "feat(mobile): add BooksTab with search/sort/filter [7.7]"
```

---

## Task 9: `TopicsTab` component

**Files:**
- Create: `apps/mobile/src/components/library/TopicsTab.tsx`
- Test: `apps/mobile/src/components/library/TopicsTab.test.tsx`
- Read: `apps/mobile/src/app/(learner)/library.tsx:121-184` (existing `TopicRows` to replace)

Replaces the inline `TopicRows` component. Adds search/sort/filter. Shows parent subject, book, chapter, repetitions, retention, last practiced.

- [ ] **Step 1: Write failing test**

```typescript
// apps/mobile/src/components/library/TopicsTab.test.tsx
import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { TopicsTab } from './TopicsTab';
import type { EnrichedTopic } from '../../lib/library-filters';

jest.mock('../../lib/theme', () => ({
  useThemeColors: () => ({ accent: '#2563eb' }),
}));

jest.mock('../../components/progress', () => ({
  RetentionSignal: ({ status }: { status: string }) => {
    const { Text } = require('react-native');
    return <Text testID={`retention-${status}`}>{status}</Text>;
  },
}));

const topic1: EnrichedTopic = {
  topicId: 'topic-1', subjectId: 'sub-1', name: 'Fractions',
  subjectName: 'Mathematics', subjectStatus: 'active',
  bookId: 'book-1', bookTitle: 'Algebra Basics', chapter: 'Ch 1',
  retention: 'strong', lastReviewedAt: '2026-04-04T10:00:00Z',
  repetitions: 5, failureCount: 0,
};

const topic2: EnrichedTopic = {
  topicId: 'topic-2', subjectId: 'sub-2', name: 'Pharaohs',
  subjectName: 'History', subjectStatus: 'active',
  bookId: 'book-2', bookTitle: 'Ancient Egypt', chapter: null,
  retention: 'forgotten', lastReviewedAt: '2026-03-01T10:00:00Z',
  repetitions: 1, failureCount: 4,
};

const topic3: EnrichedTopic = {
  topicId: 'topic-3', subjectId: 'sub-1', name: 'Decimals',
  subjectName: 'Mathematics', subjectStatus: 'active',
  bookId: null, bookTitle: null, chapter: null,
  retention: 'fading', lastReviewedAt: null,
  repetitions: 0, failureCount: 0,
};

describe('TopicsTab', () => {
  const defaultProps = {
    topics: [topic1, topic2, topic3],
    subjects: [
      { id: 'sub-1', name: 'Mathematics' },
      { id: 'sub-2', name: 'History' },
    ],
    books: [
      { id: 'book-1', title: 'Algebra Basics' },
      { id: 'book-2', title: 'Ancient Egypt' },
    ],
    onTopicPress: jest.fn(),
    onAddSubject: jest.fn(),
  };

  it('renders topic rows with subject and book info', () => {
    render(<TopicsTab {...defaultProps} />);

    expect(screen.getByText('Fractions')).toBeTruthy();
    expect(screen.getByText('Pharaohs')).toBeTruthy();
    expect(screen.getByText('Decimals')).toBeTruthy();
    // Subject names shown
    expect(screen.getAllByText('Mathematics').length).toBeGreaterThanOrEqual(1);
  });

  it('shows needs-attention warning for high failure count', () => {
    render(<TopicsTab {...defaultProps} />);

    expect(screen.getByText('Needs attention')).toBeTruthy();
  });

  it('filters topics by search text', () => {
    render(<TopicsTab {...defaultProps} />);

    fireEvent.changeText(screen.getByTestId('library-search-input'), 'frac');

    expect(screen.getByText('Fractions')).toBeTruthy();
    expect(screen.queryByText('Pharaohs')).toBeNull();
    expect(screen.queryByText('Decimals')).toBeNull();
  });

  it('shows no-results state', () => {
    render(<TopicsTab {...defaultProps} />);

    fireEvent.changeText(screen.getByTestId('library-search-input'), 'zzzzz');

    expect(screen.getByText('No topics match your search')).toBeTruthy();
  });

  it('calls onTopicPress with topicId and subjectId', () => {
    const onTopicPress = jest.fn();
    render(<TopicsTab {...defaultProps} onTopicPress={onTopicPress} />);

    fireEvent.press(screen.getByTestId('topic-row-topic-1'));
    expect(onTopicPress).toHaveBeenCalledWith('topic-1', 'sub-1');
  });

  it('shows empty state when no topics exist', () => {
    render(
      <TopicsTab
        topics={[]}
        subjects={[]}
        books={[]}
        onTopicPress={jest.fn()}
        onAddSubject={jest.fn()}
      />
    );

    expect(screen.getByText('Add a subject to start building your library')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/mobile && pnpm exec jest src/components/library/TopicsTab.test.tsx --no-coverage`
Expected: FAIL — `Cannot find module './TopicsTab'`

- [ ] **Step 3: Implement the component**

```typescript
// apps/mobile/src/components/library/TopicsTab.tsx
import { useMemo, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { RetentionSignal } from '../progress';
import { LibrarySearchBar } from './LibrarySearchBar';
import { SortFilterBar } from './SortFilterBar';
import { LibraryEmptyState } from './LibraryEmptyState';
import {
  type EnrichedTopic,
  type TopicsSortKey,
  type TopicsFilters,
  searchTopics,
  filterTopics,
  sortTopics,
} from '../../lib/library-filters';

interface TopicsTabProps {
  topics: EnrichedTopic[];
  subjects: Array<{ id: string; name: string }>;
  books: Array<{ id: string; title: string }>;
  onTopicPress: (topicId: string, subjectId: string) => void;
  onAddSubject: () => void;
}

function formatLastPracticed(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  const diffDays = Math.floor(
    (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24)
  );
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

const SORT_OPTIONS = [
  { key: 'name-asc', label: 'Name (A-Z)' },
  { key: 'name-desc', label: 'Name (Z-A)' },
  { key: 'last-practiced', label: 'Last practiced' },
  { key: 'retention', label: 'Retention urgency' },
  { key: 'repetitions', label: 'Repetition count' },
];

export function TopicsTab({
  topics,
  subjects,
  books,
  onTopicPress,
  onAddSubject,
}: TopicsTabProps): React.ReactElement {
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<TopicsSortKey>('name-asc');
  const [filters, setFilters] = useState<TopicsFilters>({
    subjectIds: [],
    bookIds: [],
    retention: [],
    needsAttention: false,
  });

  const filtered = useMemo(() => {
    let result = searchTopics(topics, search);
    result = filterTopics(result, filters);
    result = sortTopics(result, sortKey);
    return result;
  }, [topics, search, filters, sortKey]);

  const activeFilterCount =
    filters.subjectIds.length +
    filters.bookIds.length +
    filters.retention.length +
    (filters.needsAttention ? 1 : 0);

  const handleFilterChange = (groupKey: string, optionKey: string): void => {
    setFilters((prev) => {
      if (groupKey === 'subject') {
        const next = prev.subjectIds.includes(optionKey)
          ? prev.subjectIds.filter((k) => k !== optionKey)
          : [...prev.subjectIds, optionKey];
        return { ...prev, subjectIds: next };
      }
      if (groupKey === 'book') {
        const next = prev.bookIds.includes(optionKey)
          ? prev.bookIds.filter((k) => k !== optionKey)
          : [...prev.bookIds, optionKey];
        return { ...prev, bookIds: next };
      }
      if (groupKey === 'attention') {
        return { ...prev, needsAttention: !prev.needsAttention };
      }
      // retention
      const next = prev.retention.includes(optionKey as never)
        ? prev.retention.filter((k) => k !== optionKey)
        : [...prev.retention, optionKey as typeof prev.retention[number]];
      return { ...prev, retention: next };
    });
  };

  const clearSearch = (): void => {
    setSearch('');
    setFilters({ subjectIds: [], bookIds: [], retention: [], needsAttention: false });
  };

  if (topics.length === 0) {
    return <LibraryEmptyState variant="no-content" onAddSubject={onAddSubject} />;
  }

  const filterGroups = [
    {
      key: 'subject',
      label: 'Subject',
      options: subjects.map((s) => ({ key: s.id, label: s.name })),
      selected: filters.subjectIds,
    },
    {
      key: 'book',
      label: 'Book',
      options: books.map((b) => ({ key: b.id, label: b.title })),
      selected: filters.bookIds,
    },
    {
      key: 'retention',
      label: 'Retention',
      options: [
        { key: 'strong', label: 'Strong' },
        { key: 'fading', label: 'Fading' },
        { key: 'weak', label: 'Weak' },
        { key: 'forgotten', label: 'Forgotten' },
      ],
      selected: filters.retention,
    },
    {
      key: 'attention',
      label: 'Needs attention',
      options: [{ key: 'yes', label: '3+ failures' }],
      selected: filters.needsAttention ? ['yes'] : [],
    },
  ];

  return (
    <View className="flex-1">
      <LibrarySearchBar
        value={search}
        onChangeText={setSearch}
        placeholder="Search topics..."
      />
      <SortFilterBar
        sortOptions={SORT_OPTIONS}
        activeSortKey={sortKey}
        onSortChange={(key) => setSortKey(key as TopicsSortKey)}
        filterGroups={filterGroups}
        onFilterChange={handleFilterChange}
        activeFilterCount={activeFilterCount}
      />

      {filtered.length === 0 ? (
        <LibraryEmptyState
          variant="no-results"
          entityName="topics"
          onClear={clearSearch}
        />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => `${item.subjectId}-${item.topicId}`}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => onTopicPress(item.topicId, item.subjectId)}
              className="bg-surface rounded-card px-4 py-3 mb-2"
              testID={`topic-row-${item.topicId}`}
            >
              <View className="flex-row items-center justify-between">
                <View className="flex-1 me-3">
                  <Text className="text-body font-medium text-text-primary">
                    {item.name}
                  </Text>
                  <View className="flex-row items-center mt-1 gap-2 flex-wrap">
                    <Text className="text-caption text-text-secondary">
                      {item.subjectName}
                    </Text>
                    {item.bookTitle && (
                      <Text className="text-caption text-text-tertiary">
                        {item.bookTitle}
                      </Text>
                    )}
                    {item.chapter && (
                      <Text className="text-caption text-text-tertiary">
                        {item.chapter}
                      </Text>
                    )}
                    {item.repetitions > 0 && (
                      <Text className="text-caption text-text-secondary">
                        {item.repetitions} {item.repetitions === 1 ? 'session' : 'sessions'}
                      </Text>
                    )}
                  </View>
                  {item.failureCount >= 3 && (
                    <Text className="text-caption text-warning mt-0.5">
                      Needs attention
                    </Text>
                  )}
                  {formatLastPracticed(item.lastReviewedAt) && (
                    <Text className="text-caption text-text-tertiary mt-0.5">
                      Last practiced: {formatLastPracticed(item.lastReviewedAt)}
                    </Text>
                  )}
                </View>
                <RetentionSignal status={item.retention} />
              </View>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/mobile && pnpm exec jest src/components/library/TopicsTab.test.tsx --no-coverage`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/components/library/TopicsTab.tsx apps/mobile/src/components/library/TopicsTab.test.tsx
git commit -m "feat(mobile): add TopicsTab with search/sort/filter [7.7]"
```

---

## Task 10: Wire up `library.tsx` — replace toggle with three tabs

**Files:**
- Modify: `apps/mobile/src/app/(learner)/library.tsx`
- Modify: `apps/mobile/src/app/(learner)/library.test.tsx`

This is the integration task. Replace the `showAllTopics` boolean with a `LibraryTab` state. Replace the inline `renderSubjectCards()` and `TopicRows` with the new tab components. The drill-down navigation (selectedSubjectId → ShelfView → ChapterTopicList) remains unchanged — tabs only affect the top-level library view (when `selectedSubjectId === null`).

- [ ] **Step 1: Update library.tsx — imports and state**

In `apps/mobile/src/app/(learner)/library.tsx`:

Replace the `showAllTopics` state and related imports. Add new imports at the top:

```typescript
// ADD these imports (after existing imports)
import type { LibraryTab, ShelfItem, EnrichedTopic as FilterEnrichedTopic } from '../../lib/library-filters';
import { LibraryTabs } from '../../components/library/LibraryTabs';
import { ShelvesTab } from '../../components/library/ShelvesTab';
import { BooksTab } from '../../components/library/BooksTab';
import { TopicsTab } from '../../components/library/TopicsTab';
import { useAllBooks } from '../../hooks/use-all-books';
```

Replace the state declaration:

```typescript
// REMOVE:
const [showAllTopics, setShowAllTopics] = useState(false);

// ADD:
const [activeTab, setActiveTab] = useState<LibraryTab>('shelves');
```

- [ ] **Step 2: Add `useAllBooks` and build shelf items**

After the existing `retentionQueries` block (~line 299), add the allBooks hook:

```typescript
const allBooksQuery = useAllBooks();
```

Build `shelves` array for the ShelvesTab:

```typescript
const shelves = useMemo<ShelfItem[]>(() => {
  return (subjectsQuery.data ?? []).map((subject) => ({
    subject,
    progress: progressBySubjectId.get(subject.id),
  }));
}, [subjectsQuery.data, progressBySubjectId]);
```

Enrich the `allTopics` memo to include `bookId` and `bookTitle` (needed by TopicsTab). Update the existing `allTopics` memo (lines 301-318) to add book info from retention data:

```typescript
const allTopics = useMemo<FilterEnrichedTopic[]>(() => {
  if (!subjectsQuery.data) return [];
  return subjectsQuery.data.flatMap((subject, index) => {
    const data = retentionQueries[index]?.data;
    if (!data?.topics) return [];
    return data.topics.map((topic) => ({
      topicId: topic.topicId,
      subjectId: subject.id,
      name: topic.topicTitle ?? topic.topicId,
      subjectName: subject.name,
      subjectStatus: subject.status,
      bookId: null,     // retention endpoint doesn't include bookId
      bookTitle: null,   // can be enriched later when curriculum data is available
      chapter: null,
      retention: getTopicRetention(topic),
      lastReviewedAt: topic.lastReviewedAt,
      repetitions: topic.repetitions,
      failureCount: topic.failureCount,
    }));
  });
}, [retentionQueries, subjectsQuery.data]);
```

- [ ] **Step 3: Compute tab counts**

Add after the `allTopics` memo:

```typescript
const tabCounts = useMemo(() => ({
  shelves: subjectsQuery.data?.length ?? 0,
  books: allBooksQuery.books.length,
  topics: allTopics.length,
}), [subjectsQuery.data, allBooksQuery.books, allTopics]);
```

- [ ] **Step 4: Update `handleBack` and `canGoBack`**

Replace the `canGoBack` computation:

```typescript
// REMOVE:
const canGoBack = showAllTopics || selectedSubjectId !== null;

// ADD:
const canGoBack = selectedSubjectId !== null;
```

Update `handleBack`:

```typescript
// REMOVE the showAllTopics branch at the end:
// setShowAllTopics(false);

// The new handleBack only handles drill-down:
const handleBack = (): void => {
  if (selectedBookId) {
    setSelectedBookId(null);
    return;
  }
  if (selectedSubjectId) {
    setSelectedSubjectId(null);
    return;
  }
};
```

- [ ] **Step 5: Update the `useEffect` for routeSubjectId**

```typescript
// REMOVE: setShowAllTopics(false);
// It now becomes:
useEffect(() => {
  if (routeSubjectId) {
    setSelectedSubjectId(routeSubjectId);
    setSelectedBookId(null);
  }
}, [routeSubjectId]);
```

- [ ] **Step 6: Update `headerTitle`**

```typescript
// REMOVE:
// : showAllTopics
// ? 'All Topics'
// : 'Library';

// REPLACE the headerTitle computation:
const headerTitle = selectedBookId
  ? activeBook?.book.title ?? selectedBook?.title ?? 'Book'
  : selectedSubjectId
  ? selectedSubject?.name ?? 'Shelf'
  : 'Library';
```

- [ ] **Step 7: Replace `renderSubjectCards` and the `showAllTopics` branch in `renderContent`**

Delete the entire `renderSubjectCards` function (lines 398-484) and the inline `TopicRows` component (lines 121-184).

In the `renderContent` function, replace the last two branches (the `showAllTopics` branch and the default `renderSubjectCards()` call):

```typescript
// REMOVE these two blocks at the end of renderContent:
//   if (showAllTopics) { ... TopicRows ... }
//   if ((subjectsQuery.data?.length ?? 0) === 0) { ... empty ... }
//   return renderSubjectCards();

// REPLACE with: (this is the new final return of renderContent when no subject is selected)
if (!selectedSubjectId) {
  const subjectList = (subjectsQuery.data ?? []).map((s) => ({ id: s.id, name: s.name }));
  const bookList = allBooksQuery.books.map((b) => ({ id: b.book.id, title: b.book.title }));

  return (
    <>
      <LibraryTabs
        activeTab={activeTab}
        onTabChange={(tab) => {
          setActiveTab(tab);
        }}
        counts={tabCounts}
      />
      {activeTab === 'shelves' && (
        <ShelvesTab
          shelves={shelves}
          onShelfPress={(subjectId) => {
            setSelectedSubjectId(subjectId);
            setSelectedBookId(null);
          }}
          onAddSubject={() => router.push('/create-subject')}
        />
      )}
      {activeTab === 'books' && (
        <BooksTab
          books={allBooksQuery.books}
          subjects={subjectList}
          onBookPress={(subjectId, bookId) => {
            setSelectedSubjectId(subjectId);
            setSelectedBookId(bookId);
          }}
          onAddSubject={() => router.push('/create-subject')}
        />
      )}
      {activeTab === 'topics' && (
        <TopicsTab
          topics={allTopics}
          subjects={subjectList}
          books={bookList}
          onTopicPress={(topicId, subjectId) => openTopic(topicId, subjectId)}
          onAddSubject={() => router.push('/create-subject')}
        />
      )}
    </>
  );
}

// Keep the existing "empty" check for selectedSubjectId branches above
```

- [ ] **Step 8: Remove the `SubjectStatusPill` and `TopicRows` from library.tsx**

These components now live in `ShelvesTab.tsx` and `TopicsTab.tsx` respectively. Delete the `SubjectStatusPill` function (lines 94-119) and `TopicRows` function (lines 121-184) from `library.tsx`. Also remove the `EnrichedTopic` interface (lines 50-60) since it's now in `library-filters.ts`. Keep the `SubjectRetentionTopic`, `SubjectRetentionResponse` interfaces and `getTopicRetention`, `formatLastPracticed`, `findSuggestedNext` functions — they're still used by the drill-down views.

- [ ] **Step 9: Run typecheck to verify no errors**

Run: `cd apps/mobile && pnpm exec tsc --noEmit`
Expected: No errors. Fix any type issues.

- [ ] **Step 10: Commit the library.tsx changes**

```bash
git add apps/mobile/src/app/(learner)/library.tsx
git commit -m "refactor(mobile): wire three-tab browsing into Library screen [7.7]"
```

---

## Task 11: Update library.test.tsx

**Files:**
- Modify: `apps/mobile/src/app/(learner)/library.test.tsx`

Update the existing tests to work with the new three-tab structure. The key changes: `library-view-shelves` → `library-tab-shelves`, `library-view-all-topics` → `library-tab-topics`, add `library-tab-books`.

- [ ] **Step 1: Add the `useAllBooks` mock**

```typescript
// Add to the mock section at the top of the file:
const mockUseAllBooks = jest.fn();

jest.mock('../../hooks/use-all-books', () => ({
  useAllBooks: () => mockUseAllBooks(),
}));
```

Update `beforeEach` to set default mock return:

```typescript
beforeEach(() => {
  jest.clearAllMocks();
  mockUseQueries.mockReturnValue([]);
  mockUseBooks.mockReturnValue({ data: [], isLoading: false });
  mockUseBookWithTopics.mockReturnValue({ data: null, isLoading: false });
  mockUseGenerateBookTopics.mockReturnValue({
    data: null,
    isPending: false,
    mutate: jest.fn(),
  });
  mockUseCurriculum.mockReturnValue({ data: null, isLoading: false });
  // ADD:
  mockUseAllBooks.mockReturnValue({ books: [], isLoading: false, isError: false, refetch: jest.fn() });
});
```

- [ ] **Step 2: Update the "shows all topics" test**

Replace the test `it('shows all topics view when the toggle is pressed', ...)`:

```typescript
it('shows topics tab when Topics tab is pressed', () => {
  mockUseSubjects.mockReturnValue({
    data: [{ id: 'sub-1', name: 'Math', status: 'active' }],
    isLoading: false,
  });
  mockUseOverallProgress.mockReturnValue({
    data: { subjects: [], totalTopicsCompleted: 0, totalTopicsVerified: 0 },
    isLoading: false,
  });
  mockUseQueries.mockReturnValue([
    {
      data: {
        topics: [
          {
            topicId: 'topic-1',
            topicTitle: 'Fractions',
            easeFactor: 2.5,
            repetitions: 2,
            lastReviewedAt: null,
            xpStatus: 'verified',
            failureCount: 0,
          },
        ],
        reviewDueCount: 0,
      },
      isLoading: false,
    },
  ]);

  render(<LibraryScreen />, { wrapper: createWrapper() });

  // Press Topics tab (was "All Topics" toggle)
  fireEvent.press(screen.getByTestId('library-tab-topics'));

  expect(screen.getByTestId('topic-row-topic-1')).toBeTruthy();

  fireEvent.press(screen.getByTestId('topic-row-topic-1'));

  expect(mockPush).toHaveBeenCalledWith({
    pathname: '/(learner)/session',
    params: { mode: 'learning', subjectId: 'sub-1', topicId: 'topic-1' },
  });
});
```

- [ ] **Step 3: Update the "renders subject cards as shelves by default" test**

The test should verify that the Shelves tab is selected by default and tab badges appear:

```typescript
it('renders subject cards as shelves by default with tab badges', () => {
  mockUseSubjects.mockReturnValue({
    data: [{ id: 'sub-1', name: 'History', status: 'active' }],
    isLoading: false,
  });
  mockUseOverallProgress.mockReturnValue({
    data: {
      subjects: [
        {
          subjectId: 'sub-1', name: 'History',
          topicsTotal: 12, topicsCompleted: 3, topicsVerified: 1,
          urgencyScore: 0, retentionStatus: 'fading', lastSessionAt: null,
        },
      ],
    },
    isLoading: false,
  });

  render(<LibraryScreen />, { wrapper: createWrapper() });

  // Three tabs are visible
  expect(screen.getByTestId('library-tab-shelves')).toBeTruthy();
  expect(screen.getByTestId('library-tab-books')).toBeTruthy();
  expect(screen.getByTestId('library-tab-topics')).toBeTruthy();

  // Shelves tab shows subject card by default
  expect(screen.getByTestId('subject-card-sub-1')).toBeTruthy();
  expect(screen.getByText('History')).toBeTruthy();
});
```

- [ ] **Step 4: Add Books tab integration test**

```typescript
it('shows books tab with all books across subjects', () => {
  mockUseSubjects.mockReturnValue({
    data: [
      { id: 'sub-1', name: 'Math', status: 'active' },
      { id: 'sub-2', name: 'History', status: 'active' },
    ],
    isLoading: false,
  });
  mockUseOverallProgress.mockReturnValue({
    data: { subjects: [] },
    isLoading: false,
  });
  mockUseAllBooks.mockReturnValue({
    books: [
      {
        book: { id: 'book-1', subjectId: 'sub-1', title: 'Algebra', description: null, emoji: '📐', sortOrder: 1, topicsGenerated: true, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
        subjectId: 'sub-1', subjectName: 'Math',
        topicCount: 5, completedCount: 2, status: 'IN_PROGRESS',
      },
    ],
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  });

  render(<LibraryScreen />, { wrapper: createWrapper() });

  fireEvent.press(screen.getByTestId('library-tab-books'));

  expect(screen.getByText('Algebra')).toBeTruthy();
  expect(screen.getByText('Math')).toBeTruthy();
});
```

- [ ] **Step 5: Run all library tests**

Run: `cd apps/mobile && pnpm exec jest src/app/\\(learner\\)/library.test.tsx --no-coverage`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/app/(learner)/library.test.tsx
git commit -m "test(mobile): update library tests for three-tab browsing [7.7]"
```

---

## Task 12: Final validation — typecheck + lint + all related tests

**Files:**
- All files touched in Tasks 1-11

This task verifies the full implementation passes all quality gates.

- [ ] **Step 1: Run typecheck**

Run: `cd apps/mobile && pnpm exec tsc --noEmit`
Expected: No errors

- [ ] **Step 2: Run lint**

Run: `pnpm exec nx lint mobile`
Expected: No errors (or only pre-existing warnings)

- [ ] **Step 3: Run all related tests**

Run: `cd apps/mobile && pnpm exec jest --findRelatedTests src/lib/library-filters.ts src/hooks/use-all-books.ts src/components/library/LibraryTabs.tsx src/components/library/LibrarySearchBar.tsx src/components/library/SortFilterBar.tsx src/components/library/ShelvesTab.tsx src/components/library/BooksTab.tsx src/components/library/TopicsTab.tsx src/components/library/LibraryEmptyState.tsx src/app/\\(learner\\)/library.tsx --no-coverage`
Expected: All tests PASS

- [ ] **Step 4: Fix any remaining issues**

If typecheck or lint shows errors, fix them. Common issues:
- Missing `type` keyword on type-only imports
- Unused variables from removed code
- NativeWind className type annotations

- [ ] **Step 5: Final commit if fixes were needed**

```bash
git add -A
git commit -m "fix(mobile): resolve typecheck/lint issues from library tabs [7.7]"
```

---

## Spec Coverage Checklist

| Spec Requirement | Task |
|-----------------|------|
| Three tabs (Shelves/Books/Topics) with count badges | Task 4 (LibraryTabs), Task 10 (wire-up) |
| Shelves tab is default | Task 10 (state init), Task 11 (test) |
| Shelves search by name | Task 1 (searchShelves), Task 7 (ShelvesTab) |
| Shelves sort: name, last practiced, progress, retention | Task 1 (sortShelves), Task 7 (SORT_OPTIONS) |
| Shelves filter: status, retention urgency | Task 1 (filterShelves), Task 7 (filterGroups) |
| Books tab: flat list all books, emoji, title, desc, parent subject, chapter count, progress | Task 8 (BooksTab) |
| Books search by title/description | Task 1 (searchBooks), Task 8 |
| Books sort: name, progress, parent subject | Task 1 (sortBooks), Task 8 |
| Books filter: subject multi-select, completion status | Task 1 (filterBooks), Task 8 |
| Topics tab: flat list all topics | Task 9 (TopicsTab) |
| Topic row: name, parent subject, parent book, chapter, repetitions, retention, last practiced | Task 9 |
| Topics search by name | Task 1 (searchTopics), Task 9 |
| Topics sort: name, last practiced, retention, repetitions | Task 1 (sortTopics), Task 9 |
| Topics filter: subject, book, retention, needs attention | Task 1 (filterTopics), Task 9 |
| Search cleared on tab switch | Task 10 (each tab has own state, new instance on switch) |
| Sort/filter preserved per-tab for session | Task 10 (each tab component holds own state) |
| Zero results: "No [X] match" + clear button | Task 3 (LibraryEmptyState no-results), Tasks 7-9 |
| No content: "(0)" counts + "Add Subject" button | Task 3 (LibraryEmptyState no-content), Tasks 7-9 |
| Client-side search, no new API endpoints | Task 1 (pure functions), Task 2 (useQueries reuse) |
| testIDs: library-tab-shelves/books/topics, search-input, sort-button, filter-button | Tasks 4-6 |
| FlatList for virtualized lists | Tasks 7-9 (FlatList replaces ScrollView) |

## Failure Modes Addressed

| Failure Mode | Implementation |
|-------------|---------------|
| Books query fails | `useAllBooks` has `isError` flag, refetch method, handled in library.tsx existing error branch |
| Filter produces zero results | `LibraryEmptyState` variant="no-results" with "Clear all filters" button in each tab |
| Large library (100+ topics) | FlatList used in all three tabs for virtualized rendering |
| Tab count stale after add | Existing TanStack Query invalidation on focus + `useAllBooks` shares query keys with `useBooks` |

---

## Code Review Findings (2026-04-05)

Post-implementation adversarial review. Findings are grouped by severity.

### MUST FIX — Ship-Blocking

| # | Finding | Why it's critical | Fix direction | Verified By |
|---|---------|-------------------|---------------|-------------|
| CR-2 | `useAllBooks` hardcodes `topicCount: 0`, `completedCount: 0`, fake status | "Completed" filter chip is a dead button. Progress sort treats all books as equal. Users see 0% everywhere. | Either add a batch endpoint that returns book progress, or cross-reference with retentionQueries topic data to count per-book completion client-side. The data exists in the retention response — it just needs correlating. | |
| CR-3 | `allTopics` sets `bookId: null` for every topic | "Filter by Book" in Topics tab matches nothing. Users see the filter, tap a book name, get zero results with no explanation. | The retention endpoint returns `topicId` — cross-reference against `allBooksQuery.books` data (which has topic lists via the curriculum) to backfill `bookId`/`bookTitle`. Or add `bookId` to the retention endpoint response. | |
| CR-4/16 | Tab state destroyed on drill-down + checklist lies about it | User sets up filters → taps a shelf → drills in → comes back → all filters gone. Spec checklist line 3012 claims "preserved per-tab for session" — that's false. | Lift search/sort/filter state to the parent `library.tsx` as `useRef` or `useState` keyed by tab. Pass down as props. Tabs become controlled, not self-managing. | |
| CR-10 | `searchTopics` only matches `name`, `searchBooks` skips `subjectName` | User types "Math" in Topics tab → zero results (topics are named "Fractions", "Decimals", etc.). Feels broken. | Add `subjectName` to `searchTopics` and `searchBooks` filter predicates. Already confirmed in `library-filters.ts:275-277` — it only checks `item.name`. Two-line fix per function. | |
| CR-9 | "Clear search" button silently also clears all filters | Button label says "Clear search" but the handler resets filters too. If user had filters + no search text, pressing "Clear search" nukes their filter work. | Either: (a) separate "Clear search" and "Clear filters" actions, or (b) rename to "Clear all" with copy like "No books match your search and filters". | |

### SHOULD FIX — Rule Violations or Real Bugs

| # | Finding | Impact | Fix | Verified By |
|---|---------|--------|-----|-------------|
| CR-7 | Hardcoded `#999` and `#888` hex colors | Violates CLAUDE.md's "Use semantic tokens, not hardcoded hex colors." Breaks in theme switches. | Replace with `themeColors.textSecondary` or equivalent NativeWind class. | |
| CR-5 | `useMemo` depends on `bookQueries` (new array ref every render) | Memo never caches — recomputes every render cycle, cascading to all downstream memos/components. | Depend on stable values: `bookQueries.map(q => q.dataUpdatedAt).join(',')` or use `useMemo` on the `.data` values only. | |
| CR-14 | Failure Modes table uses wrong format, only 4 modes | CLAUDE.md requires `| State | Trigger | User sees | Recovery |` format with comprehensive coverage. Current table is incomplete. | Rewrite Failure Modes section to match required format and add missing modes (offline, expired session, partial data load, auth loss). | |
| CR-13 | Sort/filter modals missing accessibility | `<Modal>` has no `accessibilityRole`, filter chips don't communicate selected state. Screen reader users can't tell which filters are active. | Add `accessibilityRole="dialog"` to Modal, `accessibilityState={{ selected }}` to filter chips. | |

### LOW PRIORITY — Fix if Easy, Defer if Not

| # | Finding | Verdict |
|---|---------|---------|
| CR-17 | No keyboard dismiss on search submit | Real but trivial: add `onSubmitEditing={() => Keyboard.dismiss()}`. |
| CR-8 | Duplicate `formatLastPracticed` | Real: extract to `library-filters.ts`. Easy refactor. |
| CR-12 | No sort tiebreakers | Minor: Hermes uses stable TimSort. Add name/id tiebreaker if touching sort code anyway. |
| CR-15 | `as never` type cast in Hono RPC call | Known pattern across the codebase. Risk accepted — not unique to this plan. |
