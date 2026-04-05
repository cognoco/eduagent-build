import type { Subject, SubjectProgress } from '@eduagent/schemas';
import {
  searchShelves,
  filterShelves,
  sortShelves,
  searchBooks,
  filterBooks,
  sortBooks,
  searchTopics,
  filterTopics,
  sortTopics,
  type ShelfItem,
  type ShelvesFilters,
  type EnrichedBook,
  type BooksFilters,
  type EnrichedTopic,
  type TopicsFilters,
} from './library-filters';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeSubject(overrides: Partial<Subject> = {}): Subject {
  return {
    id: 'sub-1',
    profileId: 'profile-1',
    name: 'Mathematics',
    rawInput: null,
    status: 'active',
    pedagogyMode: 'socratic',
    languageCode: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeProgress(
  overrides: Partial<SubjectProgress> = {}
): SubjectProgress {
  return {
    subjectId: 'sub-1',
    name: 'Mathematics',
    topicsTotal: 10,
    topicsCompleted: 5,
    topicsVerified: 3,
    urgencyScore: 0.5,
    retentionStatus: 'strong',
    lastSessionAt: '2026-03-01T10:00:00Z',
    ...overrides,
  };
}

function makeShelf(
  overrides: {
    subject?: Partial<Subject>;
    progress?: Partial<SubjectProgress> | undefined;
  } = {}
): ShelfItem {
  const subject = makeSubject(overrides.subject);
  const progress =
    overrides.progress === undefined && !('progress' in overrides)
      ? makeProgress({ subjectId: subject.id, name: subject.name })
      : overrides.progress !== undefined
      ? makeProgress({
          subjectId: subject.id,
          name: subject.name,
          ...overrides.progress,
        })
      : undefined;
  return { subject, progress };
}

function makeBook(overrides: Partial<EnrichedBook> = {}): EnrichedBook {
  return {
    book: {
      id: 'book-1',
      subjectId: 'sub-1',
      title: 'Algebra Basics',
      description: 'Introduction to algebra',
      emoji: '📘',
      sortOrder: 0,
      topicsGenerated: true,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    },
    subjectId: 'sub-1',
    subjectName: 'Mathematics',
    topicCount: 10,
    completedCount: 5,
    status: 'IN_PROGRESS',
    ...overrides,
  };
}

function makeTopic(overrides: Partial<EnrichedTopic> = {}): EnrichedTopic {
  return {
    topicId: 'topic-1',
    subjectId: 'sub-1',
    name: 'Quadratic Equations',
    subjectName: 'Mathematics',
    subjectStatus: 'active',
    bookId: 'book-1',
    bookTitle: 'Algebra Basics',
    chapter: 'Chapter 3',
    retention: 'strong',
    lastReviewedAt: '2026-03-01T10:00:00Z',
    repetitions: 5,
    failureCount: 0,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Shelves — search
// ---------------------------------------------------------------------------

describe('searchShelves', () => {
  it('returns all items for empty query', () => {
    const items = [
      makeShelf(),
      makeShelf({ subject: { id: 'sub-2', name: 'Physics' } }),
    ];
    expect(searchShelves(items, '')).toHaveLength(2);
  });

  it('returns all items for whitespace-only query', () => {
    const items = [makeShelf()];
    expect(searchShelves(items, '   ')).toHaveLength(1);
  });

  it('matches case-insensitively', () => {
    const items = [makeShelf({ subject: { name: 'Mathematics' } })];
    expect(searchShelves(items, 'math')).toHaveLength(1);
    expect(searchShelves(items, 'MATH')).toHaveLength(1);
    expect(searchShelves(items, 'MaTh')).toHaveLength(1);
  });

  it('returns empty for no match', () => {
    const items = [makeShelf({ subject: { name: 'Mathematics' } })];
    expect(searchShelves(items, 'physics')).toHaveLength(0);
  });

  it('handles empty input array', () => {
    expect(searchShelves([], 'math')).toHaveLength(0);
  });

  it('matches partial substrings', () => {
    const items = [makeShelf({ subject: { name: 'Computer Science' } })];
    expect(searchShelves(items, 'sci')).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Shelves — filter
// ---------------------------------------------------------------------------

describe('filterShelves', () => {
  const active = makeShelf({ subject: { id: 'sub-1', status: 'active' } });
  const paused = makeShelf({
    subject: { id: 'sub-2', name: 'Physics', status: 'paused' },
    progress: { retentionStatus: 'weak' },
  });
  const archived = makeShelf({
    subject: { id: 'sub-3', name: 'History', status: 'archived' },
    progress: { retentionStatus: 'fading' },
  });
  const items = [active, paused, archived];

  it('returns all items when both filter arrays are empty', () => {
    const filters: ShelvesFilters = { status: [], retention: [] };
    expect(filterShelves(items, filters)).toHaveLength(3);
  });

  it('filters by single status', () => {
    const filters: ShelvesFilters = { status: ['active'], retention: [] };
    const result = filterShelves(items, filters);
    expect(result).toHaveLength(1);
    expect(result[0]!.subject.status).toBe('active');
  });

  it('filters by multiple statuses (OR within group)', () => {
    const filters: ShelvesFilters = {
      status: ['active', 'paused'],
      retention: [],
    };
    expect(filterShelves(items, filters)).toHaveLength(2);
  });

  it('filters by retention status', () => {
    const filters: ShelvesFilters = { status: [], retention: ['weak'] };
    const result = filterShelves(items, filters);
    expect(result).toHaveLength(1);
    expect(result[0]!.subject.name).toBe('Physics');
  });

  it('combines status and retention with AND', () => {
    const filters: ShelvesFilters = {
      status: ['paused', 'archived'],
      retention: ['weak'],
    };
    const result = filterShelves(items, filters);
    expect(result).toHaveLength(1);
    expect(result[0]!.subject.name).toBe('Physics');
  });

  it('handles items without progress for retention filter', () => {
    const noProgress: ShelfItem = {
      subject: makeSubject({ id: 'sub-4', name: 'Art' }),
      progress: undefined,
    };
    const filters: ShelvesFilters = { status: [], retention: ['strong'] };
    expect(filterShelves([noProgress], filters)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Shelves — sort
// ---------------------------------------------------------------------------

describe('sortShelves', () => {
  it('sorts name-asc by localeCompare', () => {
    const items = [
      makeShelf({ subject: { id: 'sub-2', name: 'Physics' } }),
      makeShelf({ subject: { id: 'sub-1', name: 'Mathematics' } }),
    ];
    const result = sortShelves(items, 'name-asc');
    expect(result[0]!.subject.name).toBe('Mathematics');
    expect(result[1]!.subject.name).toBe('Physics');
  });

  it('sorts name-desc', () => {
    const items = [
      makeShelf({ subject: { id: 'sub-1', name: 'Mathematics' } }),
      makeShelf({ subject: { id: 'sub-2', name: 'Physics' } }),
    ];
    const result = sortShelves(items, 'name-desc');
    expect(result[0]!.subject.name).toBe('Physics');
    expect(result[1]!.subject.name).toBe('Mathematics');
  });

  it('sorts last-practiced-recent with nulls last', () => {
    const recent = makeShelf({
      subject: { id: 'sub-1' },
      progress: { lastSessionAt: '2026-04-01T10:00:00Z' },
    });
    const older = makeShelf({
      subject: { id: 'sub-2', name: 'Physics' },
      progress: { lastSessionAt: '2026-03-01T10:00:00Z' },
    });
    const never: ShelfItem = {
      subject: makeSubject({ id: 'sub-3', name: 'History' }),
      progress: undefined,
    };
    const result = sortShelves([never, older, recent], 'last-practiced-recent');
    expect(result[0]!.subject.id).toBe('sub-1');
    expect(result[1]!.subject.id).toBe('sub-2');
    expect(result[2]!.subject.id).toBe('sub-3');
  });

  it('sorts last-practiced-oldest with nulls last', () => {
    const recent = makeShelf({
      subject: { id: 'sub-1' },
      progress: { lastSessionAt: '2026-04-01T10:00:00Z' },
    });
    const older = makeShelf({
      subject: { id: 'sub-2', name: 'Physics' },
      progress: { lastSessionAt: '2026-03-01T10:00:00Z' },
    });
    const never: ShelfItem = {
      subject: makeSubject({ id: 'sub-3', name: 'History' }),
      progress: undefined,
    };
    const result = sortShelves([never, recent, older], 'last-practiced-oldest');
    expect(result[0]!.subject.id).toBe('sub-2');
    expect(result[1]!.subject.id).toBe('sub-1');
    expect(result[2]!.subject.id).toBe('sub-3');
  });

  it('sorts by progress descending (% completed)', () => {
    const high = makeShelf({
      subject: { id: 'sub-1' },
      progress: { topicsTotal: 10, topicsCompleted: 8 },
    });
    const low = makeShelf({
      subject: { id: 'sub-2', name: 'Physics' },
      progress: { topicsTotal: 10, topicsCompleted: 2 },
    });
    const noProgress: ShelfItem = {
      subject: makeSubject({ id: 'sub-3', name: 'History' }),
      progress: undefined,
    };
    const result = sortShelves([low, noProgress, high], 'progress');
    expect(result[0]!.subject.id).toBe('sub-1');
    expect(result[1]!.subject.id).toBe('sub-2');
    expect(result[2]!.subject.id).toBe('sub-3');
  });

  it('sorts by retention (forgotten -> strong)', () => {
    const strong = makeShelf({
      subject: { id: 'sub-1' },
      progress: { retentionStatus: 'strong' },
    });
    const weak = makeShelf({
      subject: { id: 'sub-2', name: 'Physics' },
      progress: { retentionStatus: 'weak' },
    });
    const fading = makeShelf({
      subject: { id: 'sub-3', name: 'History' },
      progress: { retentionStatus: 'fading' },
    });
    const result = sortShelves([strong, fading, weak], 'retention');
    expect(result[0]!.subject.id).toBe('sub-2');
    expect(result[1]!.subject.id).toBe('sub-3');
    expect(result[2]!.subject.id).toBe('sub-1');
  });

  it('does not mutate original array', () => {
    const items = [
      makeShelf({ subject: { id: 'sub-2', name: 'Physics' } }),
      makeShelf({ subject: { id: 'sub-1', name: 'Mathematics' } }),
    ];
    const original = [...items];
    sortShelves(items, 'name-asc');
    expect(items[0]!.subject.id).toBe(original[0]!.subject.id);
  });
});

// ---------------------------------------------------------------------------
// Books — search
// ---------------------------------------------------------------------------

describe('searchBooks', () => {
  it('returns all for empty query', () => {
    const items = [
      makeBook(),
      makeBook({
        book: { ...makeBook().book, id: 'book-2', title: 'Geometry' },
      }),
    ];
    expect(searchBooks(items, '')).toHaveLength(2);
  });

  it('matches on title case-insensitively', () => {
    const items = [
      makeBook({ book: { ...makeBook().book, title: 'Algebra Basics' } }),
    ];
    expect(searchBooks(items, 'algebra')).toHaveLength(1);
    expect(searchBooks(items, 'ALGEBRA')).toHaveLength(1);
  });

  it('matches on description', () => {
    const items = [
      makeBook({
        book: { ...makeBook().book, description: 'Introduction to algebra' },
      }),
    ];
    expect(searchBooks(items, 'introduction')).toHaveLength(1);
  });

  it('does not match when no title or description matches', () => {
    const items = [makeBook()];
    expect(searchBooks(items, 'chemistry')).toHaveLength(0);
  });

  it('handles null description gracefully', () => {
    const items = [
      makeBook({ book: { ...makeBook().book, description: null } }),
    ];
    expect(searchBooks(items, 'something')).toHaveLength(0);
  });

  it('handles empty input array', () => {
    expect(searchBooks([], 'test')).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Books — filter
// ---------------------------------------------------------------------------

describe('filterBooks', () => {
  const notStarted = makeBook({
    book: { ...makeBook().book, id: 'b1' },
    subjectId: 'sub-1',
    status: 'NOT_STARTED',
  });
  const inProgress = makeBook({
    book: { ...makeBook().book, id: 'b2' },
    subjectId: 'sub-2',
    subjectName: 'Physics',
    status: 'IN_PROGRESS',
  });
  const reviewDue = makeBook({
    book: { ...makeBook().book, id: 'b3' },
    subjectId: 'sub-2',
    subjectName: 'Physics',
    status: 'REVIEW_DUE',
  });
  const completed = makeBook({
    book: { ...makeBook().book, id: 'b4' },
    subjectId: 'sub-3',
    subjectName: 'History',
    status: 'COMPLETED',
  });
  const items = [notStarted, inProgress, reviewDue, completed];

  it('returns all when both filter arrays empty', () => {
    const filters: BooksFilters = { subjectIds: [], completion: [] };
    expect(filterBooks(items, filters)).toHaveLength(4);
  });

  it('filters by subjectIds', () => {
    const filters: BooksFilters = { subjectIds: ['sub-2'], completion: [] };
    expect(filterBooks(items, filters)).toHaveLength(2);
  });

  it('filters by completion not-started', () => {
    const filters: BooksFilters = {
      subjectIds: [],
      completion: ['not-started'],
    };
    const result = filterBooks(items, filters);
    expect(result).toHaveLength(1);
    expect(result[0]!.status).toBe('NOT_STARTED');
  });

  it('filters by completion in-progress (includes IN_PROGRESS and REVIEW_DUE)', () => {
    const filters: BooksFilters = {
      subjectIds: [],
      completion: ['in-progress'],
    };
    const result = filterBooks(items, filters);
    expect(result).toHaveLength(2);
    expect(result.map((b) => b.status).sort()).toEqual([
      'IN_PROGRESS',
      'REVIEW_DUE',
    ]);
  });

  it('filters by completion completed', () => {
    const filters: BooksFilters = {
      subjectIds: [],
      completion: ['completed'],
    };
    const result = filterBooks(items, filters);
    expect(result).toHaveLength(1);
    expect(result[0]!.status).toBe('COMPLETED');
  });

  it('combines subjectIds and completion with AND', () => {
    const filters: BooksFilters = {
      subjectIds: ['sub-2'],
      completion: ['in-progress'],
    };
    const result = filterBooks(items, filters);
    expect(result).toHaveLength(2);
  });

  it('OR within completion group', () => {
    const filters: BooksFilters = {
      subjectIds: [],
      completion: ['not-started', 'completed'],
    };
    expect(filterBooks(items, filters)).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Books — sort
// ---------------------------------------------------------------------------

describe('sortBooks', () => {
  it('sorts name-asc by localeCompare on title', () => {
    const a = makeBook({
      book: { ...makeBook().book, id: 'b1', title: 'Algebra' },
    });
    const g = makeBook({
      book: { ...makeBook().book, id: 'b2', title: 'Geometry' },
    });
    const result = sortBooks([g, a], 'name-asc');
    expect(result[0]!.book.title).toBe('Algebra');
    expect(result[1]!.book.title).toBe('Geometry');
  });

  it('sorts name-desc', () => {
    const a = makeBook({
      book: { ...makeBook().book, id: 'b1', title: 'Algebra' },
    });
    const g = makeBook({
      book: { ...makeBook().book, id: 'b2', title: 'Geometry' },
    });
    const result = sortBooks([a, g], 'name-desc');
    expect(result[0]!.book.title).toBe('Geometry');
    expect(result[1]!.book.title).toBe('Algebra');
  });

  it('sorts by progress desc (% completed)', () => {
    const high = makeBook({
      book: { ...makeBook().book, id: 'b1' },
      topicCount: 10,
      completedCount: 8,
    });
    const low = makeBook({
      book: { ...makeBook().book, id: 'b2' },
      topicCount: 10,
      completedCount: 2,
    });
    const zero = makeBook({
      book: { ...makeBook().book, id: 'b3' },
      topicCount: 0,
      completedCount: 0,
    });
    const result = sortBooks([low, zero, high], 'progress');
    expect(result[0]!.book.id).toBe('b1');
    expect(result[1]!.book.id).toBe('b2');
    expect(result[2]!.book.id).toBe('b3');
  });

  it('sorts by subject name via localeCompare', () => {
    const math = makeBook({
      book: { ...makeBook().book, id: 'b1' },
      subjectName: 'Mathematics',
    });
    const phys = makeBook({
      book: { ...makeBook().book, id: 'b2' },
      subjectName: 'Physics',
    });
    const art = makeBook({
      book: { ...makeBook().book, id: 'b3' },
      subjectName: 'Art',
    });
    const result = sortBooks([phys, math, art], 'subject');
    expect(result[0]!.subjectName).toBe('Art');
    expect(result[1]!.subjectName).toBe('Mathematics');
    expect(result[2]!.subjectName).toBe('Physics');
  });

  it('does not mutate original array', () => {
    const items = [
      makeBook({ book: { ...makeBook().book, id: 'b2', title: 'Geometry' } }),
      makeBook({ book: { ...makeBook().book, id: 'b1', title: 'Algebra' } }),
    ];
    const firstId = items[0]!.book.id;
    sortBooks(items, 'name-asc');
    expect(items[0]!.book.id).toBe(firstId);
  });
});

// ---------------------------------------------------------------------------
// Topics — search
// ---------------------------------------------------------------------------

describe('searchTopics', () => {
  it('returns all for empty query', () => {
    const items = [
      makeTopic(),
      makeTopic({ topicId: 'topic-2', name: 'Linear Algebra' }),
    ];
    expect(searchTopics(items, '')).toHaveLength(2);
  });

  it('matches case-insensitively on name', () => {
    const items = [makeTopic({ name: 'Quadratic Equations' })];
    expect(searchTopics(items, 'quadratic')).toHaveLength(1);
    expect(searchTopics(items, 'QUADRATIC')).toHaveLength(1);
  });

  it('returns empty for no match', () => {
    const items = [makeTopic({ name: 'Quadratic Equations' })];
    expect(searchTopics(items, 'biology')).toHaveLength(0);
  });

  it('handles empty input', () => {
    expect(searchTopics([], 'test')).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Topics — filter
// ---------------------------------------------------------------------------

describe('filterTopics', () => {
  const topic1 = makeTopic({
    topicId: 't1',
    subjectId: 'sub-1',
    bookId: 'b1',
    retention: 'strong',
    failureCount: 0,
  });
  const topic2 = makeTopic({
    topicId: 't2',
    subjectId: 'sub-2',
    bookId: 'b2',
    retention: 'weak',
    failureCount: 5,
    name: 'Thermodynamics',
    subjectName: 'Physics',
  });
  const topic3 = makeTopic({
    topicId: 't3',
    subjectId: 'sub-1',
    bookId: null,
    retention: 'forgotten',
    failureCount: 1,
    name: 'History overview',
    subjectName: 'Mathematics',
  });
  const items = [topic1, topic2, topic3];

  it('returns all when all filter arrays empty and needsAttention false', () => {
    const filters: TopicsFilters = {
      subjectIds: [],
      bookIds: [],
      retention: [],
      needsAttention: false,
    };
    expect(filterTopics(items, filters)).toHaveLength(3);
  });

  it('filters by subjectIds', () => {
    const filters: TopicsFilters = {
      subjectIds: ['sub-1'],
      bookIds: [],
      retention: [],
      needsAttention: false,
    };
    expect(filterTopics(items, filters)).toHaveLength(2);
  });

  it('filters by bookIds (only topics with a bookId match)', () => {
    const filters: TopicsFilters = {
      subjectIds: [],
      bookIds: ['b1'],
      retention: [],
      needsAttention: false,
    };
    const result = filterTopics(items, filters);
    expect(result).toHaveLength(1);
    expect(result[0]!.topicId).toBe('t1');
  });

  it('bookIds filter excludes topics without bookId', () => {
    const filters: TopicsFilters = {
      subjectIds: [],
      bookIds: ['b1', 'b2'],
      retention: [],
      needsAttention: false,
    };
    const result = filterTopics(items, filters);
    expect(result).toHaveLength(2);
    expect(result.map((t) => t.topicId).sort()).toEqual(['t1', 't2']);
  });

  it('filters by retention', () => {
    const filters: TopicsFilters = {
      subjectIds: [],
      bookIds: [],
      retention: ['weak', 'forgotten'],
      needsAttention: false,
    };
    expect(filterTopics(items, filters)).toHaveLength(2);
  });

  it('filters by needsAttention (failureCount >= 3)', () => {
    const filters: TopicsFilters = {
      subjectIds: [],
      bookIds: [],
      retention: [],
      needsAttention: true,
    };
    const result = filterTopics(items, filters);
    expect(result).toHaveLength(1);
    expect(result[0]!.topicId).toBe('t2');
  });

  it('combines multiple filters with AND', () => {
    const filters: TopicsFilters = {
      subjectIds: ['sub-2'],
      bookIds: [],
      retention: ['weak'],
      needsAttention: true,
    };
    const result = filterTopics(items, filters);
    expect(result).toHaveLength(1);
    expect(result[0]!.topicId).toBe('t2');
  });

  it('combined filters can yield empty result', () => {
    const filters: TopicsFilters = {
      subjectIds: ['sub-1'],
      bookIds: [],
      retention: [],
      needsAttention: true,
    };
    expect(filterTopics(items, filters)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Topics — sort
// ---------------------------------------------------------------------------

describe('sortTopics', () => {
  it('sorts name-asc', () => {
    const items = [
      makeTopic({ topicId: 't1', name: 'Zeta Functions' }),
      makeTopic({ topicId: 't2', name: 'Alpha Particles' }),
    ];
    const result = sortTopics(items, 'name-asc');
    expect(result[0]!.name).toBe('Alpha Particles');
    expect(result[1]!.name).toBe('Zeta Functions');
  });

  it('sorts name-desc', () => {
    const items = [
      makeTopic({ topicId: 't1', name: 'Alpha Particles' }),
      makeTopic({ topicId: 't2', name: 'Zeta Functions' }),
    ];
    const result = sortTopics(items, 'name-desc');
    expect(result[0]!.name).toBe('Zeta Functions');
    expect(result[1]!.name).toBe('Alpha Particles');
  });

  it('sorts last-practiced recent first, nulls last', () => {
    const recent = makeTopic({
      topicId: 't1',
      lastReviewedAt: '2026-04-01T10:00:00Z',
    });
    const older = makeTopic({
      topicId: 't2',
      lastReviewedAt: '2026-03-01T10:00:00Z',
    });
    const never = makeTopic({ topicId: 't3', lastReviewedAt: null });
    const result = sortTopics([never, older, recent], 'last-practiced');
    expect(result[0]!.topicId).toBe('t1');
    expect(result[1]!.topicId).toBe('t2');
    expect(result[2]!.topicId).toBe('t3');
  });

  it('sorts retention: forgotten -> weak -> fading -> strong', () => {
    const strong = makeTopic({ topicId: 't1', retention: 'strong' });
    const fading = makeTopic({ topicId: 't2', retention: 'fading' });
    const weak = makeTopic({ topicId: 't3', retention: 'weak' });
    const forgotten = makeTopic({ topicId: 't4', retention: 'forgotten' });
    const result = sortTopics([strong, fading, weak, forgotten], 'retention');
    expect(result.map((t) => t.retention)).toEqual([
      'forgotten',
      'weak',
      'fading',
      'strong',
    ]);
  });

  it('sorts repetitions desc', () => {
    const high = makeTopic({ topicId: 't1', repetitions: 20 });
    const mid = makeTopic({ topicId: 't2', repetitions: 5 });
    const low = makeTopic({ topicId: 't3', repetitions: 0 });
    const result = sortTopics([mid, low, high], 'repetitions');
    expect(result[0]!.repetitions).toBe(20);
    expect(result[1]!.repetitions).toBe(5);
    expect(result[2]!.repetitions).toBe(0);
  });

  it('does not mutate original array', () => {
    const items = [
      makeTopic({ topicId: 't2', name: 'Zeta' }),
      makeTopic({ topicId: 't1', name: 'Alpha' }),
    ];
    const firstId = items[0]!.topicId;
    sortTopics(items, 'name-asc');
    expect(items[0]!.topicId).toBe(firstId);
  });

  it('handles all nulls for last-practiced sort', () => {
    const items = [
      makeTopic({ topicId: 't1', lastReviewedAt: null }),
      makeTopic({ topicId: 't2', lastReviewedAt: null }),
    ];
    const result = sortTopics(items, 'last-practiced');
    expect(result).toHaveLength(2);
  });
});
