import type {
  Subject,
  CurriculumBook,
  BookProgressStatus,
  SubjectProgress,
} from '@eduagent/schemas';
import type { RetentionStatus } from '../components/progress';

// ---------------------------------------------------------------------------
// Tab identifier
// ---------------------------------------------------------------------------

export type LibraryTab = 'shelves' | 'books' | 'topics';

// ---------------------------------------------------------------------------
// Shelves types
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Books types
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Topics types
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

export function formatLastPracticed(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  const diffDays = Math.floor(
    (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24)
  );
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const RETENTION_ORDER: Record<string, number> = {
  forgotten: 0,
  weak: 1,
  fading: 2,
  strong: 3,
};

// ---------------------------------------------------------------------------
// Shelves — search / filter / sort
// ---------------------------------------------------------------------------

export function searchShelves(items: ShelfItem[], query: string): ShelfItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  return items.filter((item) => item.subject.name.toLowerCase().includes(q));
}

export function filterShelves(
  items: ShelfItem[],
  filters: ShelvesFilters
): ShelfItem[] {
  const { status, retention } = filters;
  const hasStatus = status.length > 0;
  const hasRetention = retention.length > 0;
  if (!hasStatus && !hasRetention) return items;

  return items.filter((item) => {
    const matchesStatus = !hasStatus || status.includes(item.subject.status);
    const matchesRetention =
      !hasRetention ||
      (item.progress != null &&
        retention.includes(item.progress.retentionStatus as RetentionStatus));
    return matchesStatus && matchesRetention;
  });
}

export function sortShelves(
  items: ShelfItem[],
  key: ShelvesSortKey
): ShelfItem[] {
  const sorted = [...items];
  switch (key) {
    case 'name-asc':
      sorted.sort((a, b) => a.subject.name.localeCompare(b.subject.name));
      break;
    case 'name-desc':
      sorted.sort((a, b) => b.subject.name.localeCompare(a.subject.name));
      break;
    case 'last-practiced-recent':
      sorted.sort((a, b) => {
        const aTime = a.progress?.lastSessionAt
          ? new Date(a.progress.lastSessionAt).getTime()
          : -Infinity;
        const bTime = b.progress?.lastSessionAt
          ? new Date(b.progress.lastSessionAt).getTime()
          : -Infinity;
        return bTime - aTime;
      });
      break;
    case 'last-practiced-oldest':
      sorted.sort((a, b) => {
        const aTime = a.progress?.lastSessionAt
          ? new Date(a.progress.lastSessionAt).getTime()
          : Infinity;
        const bTime = b.progress?.lastSessionAt
          ? new Date(b.progress.lastSessionAt).getTime()
          : Infinity;
        return aTime - bTime;
      });
      break;
    case 'progress':
      sorted.sort((a, b) => {
        const aPct = a.progress
          ? a.progress.topicsTotal > 0
            ? a.progress.topicsCompleted / a.progress.topicsTotal
            : 0
          : -1;
        const bPct = b.progress
          ? b.progress.topicsTotal > 0
            ? b.progress.topicsCompleted / b.progress.topicsTotal
            : 0
          : -1;
        return bPct - aPct;
      });
      break;
    case 'retention':
      sorted.sort((a, b) => {
        const aOrder =
          a.progress != null
            ? RETENTION_ORDER[a.progress.retentionStatus] ?? 999
            : 999;
        const bOrder =
          b.progress != null
            ? RETENTION_ORDER[b.progress.retentionStatus] ?? 999
            : 999;
        return aOrder - bOrder;
      });
      break;
  }
  return sorted;
}

// ---------------------------------------------------------------------------
// Books — search / filter / sort
// ---------------------------------------------------------------------------

export function searchBooks(
  items: EnrichedBook[],
  query: string
): EnrichedBook[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  return items.filter(
    (item) =>
      item.book.title.toLowerCase().includes(q) ||
      (item.book.description ?? '').toLowerCase().includes(q) ||
      item.subjectName.toLowerCase().includes(q)
  );
}

/** Maps user-facing completion labels to BookProgressStatus values. */
const COMPLETION_STATUS_MAP: Record<string, BookProgressStatus[]> = {
  'not-started': ['NOT_STARTED'],
  'in-progress': ['IN_PROGRESS', 'REVIEW_DUE'],
  completed: ['COMPLETED'],
};

export function filterBooks(
  items: EnrichedBook[],
  filters: BooksFilters
): EnrichedBook[] {
  const { subjectIds, completion } = filters;
  const hasSubjects = subjectIds.length > 0;
  const hasCompletion = completion.length > 0;
  if (!hasSubjects && !hasCompletion) return items;

  const allowedStatuses = hasCompletion
    ? completion.flatMap((c) => COMPLETION_STATUS_MAP[c] ?? [])
    : null;

  return items.filter((item) => {
    const matchesSubject = !hasSubjects || subjectIds.includes(item.subjectId);
    const matchesCompletion =
      allowedStatuses == null || allowedStatuses.includes(item.status);
    return matchesSubject && matchesCompletion;
  });
}

export function sortBooks(
  items: EnrichedBook[],
  key: BooksSortKey
): EnrichedBook[] {
  const sorted = [...items];
  switch (key) {
    case 'name-asc':
      sorted.sort((a, b) => a.book.title.localeCompare(b.book.title));
      break;
    case 'name-desc':
      sorted.sort((a, b) => b.book.title.localeCompare(a.book.title));
      break;
    case 'progress':
      sorted.sort((a, b) => {
        const aPct = a.topicCount > 0 ? a.completedCount / a.topicCount : -1;
        const bPct = b.topicCount > 0 ? b.completedCount / b.topicCount : -1;
        return bPct - aPct;
      });
      break;
    case 'subject':
      sorted.sort((a, b) => a.subjectName.localeCompare(b.subjectName));
      break;
  }
  return sorted;
}

// ---------------------------------------------------------------------------
// Topics — search / filter / sort
// ---------------------------------------------------------------------------

export function searchTopics(
  items: EnrichedTopic[],
  query: string
): EnrichedTopic[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  return items.filter(
    (item) =>
      item.name.toLowerCase().includes(q) ||
      item.subjectName.toLowerCase().includes(q)
  );
}

export function filterTopics(
  items: EnrichedTopic[],
  filters: TopicsFilters
): EnrichedTopic[] {
  const { subjectIds, bookIds, retention, needsAttention } = filters;
  const hasSubjects = subjectIds.length > 0;
  const hasBooks = bookIds.length > 0;
  const hasRetention = retention.length > 0;

  if (!hasSubjects && !hasBooks && !hasRetention && !needsAttention) {
    return items;
  }

  return items.filter((item) => {
    if (hasSubjects && !subjectIds.includes(item.subjectId)) return false;
    if (hasBooks && (!item.bookId || !bookIds.includes(item.bookId)))
      return false;
    if (hasRetention && !retention.includes(item.retention)) return false;
    if (needsAttention && item.failureCount < 3) return false;
    return true;
  });
}

export function sortTopics(
  items: EnrichedTopic[],
  key: TopicsSortKey
): EnrichedTopic[] {
  const sorted = [...items];
  switch (key) {
    case 'name-asc':
      sorted.sort((a, b) => a.name.localeCompare(b.name));
      break;
    case 'name-desc':
      sorted.sort((a, b) => b.name.localeCompare(a.name));
      break;
    case 'last-practiced':
      sorted.sort((a, b) => {
        const aTime = a.lastReviewedAt
          ? new Date(a.lastReviewedAt).getTime()
          : -Infinity;
        const bTime = b.lastReviewedAt
          ? new Date(b.lastReviewedAt).getTime()
          : -Infinity;
        return bTime - aTime;
      });
      break;
    case 'retention':
      sorted.sort((a, b) => {
        const aOrder = RETENTION_ORDER[a.retention] ?? 999;
        const bOrder = RETENTION_ORDER[b.retention] ?? 999;
        return aOrder - bOrder;
      });
      break;
    case 'repetitions':
      sorted.sort((a, b) => b.repetitions - a.repetitions);
      break;
  }
  return sorted;
}
