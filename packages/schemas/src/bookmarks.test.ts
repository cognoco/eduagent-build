import {
  bookmarkSchema,
  createBookmarkSchema,
  bookmarkListQuerySchema,
  bookmarkListResponseSchema,
  sessionBookmarkSchema,
  sessionBookmarkListResponseSchema,
} from './bookmarks.js';

const UUID = '550e8400-e29b-41d4-a716-446655440000';
const UUID2 = '660e8400-e29b-41d4-a716-446655440001';
const ISO = '2025-01-01T00:00:00.000Z';

// ---------------------------------------------------------------------------
// bookmarkSchema
// ---------------------------------------------------------------------------

const validBookmark = {
  id: UUID,
  eventId: UUID,
  sessionId: UUID,
  subjectId: UUID,
  topicId: null,
  subjectName: 'Math',
  topicTitle: null,
  content: 'This is a bookmark',
  artifactSource: 'freeform_keep' as const,
  verificationState: 'unverified' as const,
  createdAt: ISO,
};

describe('bookmarkSchema', () => {
  it('accepts a valid bookmark with nullable topicId and topicTitle', () => {
    const parsed = bookmarkSchema.parse(validBookmark);
    expect(parsed.topicId).toBeNull();
    expect(parsed.topicTitle).toBeNull();
  });

  it('accepts topicId as UUID when present', () => {
    const parsed = bookmarkSchema.parse({
      ...validBookmark,
      topicId: UUID2,
      topicTitle: 'Topic',
    });
    expect(parsed.topicId).toBe(UUID2);
    expect(parsed.topicTitle).toBe('Topic');
  });

  it('rejects invalid UUID for eventId', () => {
    const result = bookmarkSchema.safeParse({
      ...validBookmark,
      eventId: 'not-uuid',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path[0]);
      expect(paths).toContain('eventId');
    }
  });

  it('rejects invalid datetime for createdAt', () => {
    const result = bookmarkSchema.safeParse({
      ...validBookmark,
      createdAt: 'bad-date',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]!.path).toContain('createdAt');
    }
  });

  it('rejects missing content', () => {
    const { content: _, ...rest } = validBookmark;
    const result = bookmarkSchema.safeParse(rest);
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path[0]);
      expect(paths).toContain('content');
    }
  });

  it('rejects missing sessionId', () => {
    const { sessionId: _, ...rest } = validBookmark;
    const result = bookmarkSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('defaults missing artifactSource for expand-phase API compatibility', () => {
    const { artifactSource: _, ...rest } = validBookmark;
    expect(bookmarkSchema.parse(rest).artifactSource).toBe('freeform_keep');
  });

  it('defaults missing verificationState for expand-phase API compatibility', () => {
    const { verificationState: _, ...rest } = validBookmark;
    expect(bookmarkSchema.parse(rest).verificationState).toBe('unverified');
  });
});

// ---------------------------------------------------------------------------
// createBookmarkSchema
// ---------------------------------------------------------------------------

describe('createBookmarkSchema', () => {
  it('accepts valid eventId', () => {
    const parsed = createBookmarkSchema.parse({ eventId: UUID });
    expect(parsed.eventId).toBe(UUID);
  });

  it('rejects non-UUID eventId', () => {
    const result = createBookmarkSchema.safeParse({ eventId: 'not-a-uuid' });
    expect(result.success).toBe(false);
  });

  it('rejects missing eventId', () => {
    const result = createBookmarkSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// bookmarkListQuerySchema
// ---------------------------------------------------------------------------

describe('bookmarkListQuerySchema', () => {
  it('accepts empty query (all optional)', () => {
    const result = bookmarkListQuerySchema.parse({});
    expect(result.cursor).toBeUndefined();
    expect(result.limit).toBeUndefined();
    expect(result.subjectId).toBeUndefined();
    expect(result.topicId).toBeUndefined();
  });

  it('accepts limit=1 (boundary)', () => {
    expect(bookmarkListQuerySchema.parse({ limit: 1 }).limit).toBe(1);
  });

  it('accepts limit=50 (max boundary)', () => {
    expect(bookmarkListQuerySchema.parse({ limit: 50 }).limit).toBe(50);
  });

  it('rejects limit=0', () => {
    expect(bookmarkListQuerySchema.safeParse({ limit: 0 }).success).toBe(false);
  });

  it('rejects limit=51 (above max)', () => {
    expect(bookmarkListQuerySchema.safeParse({ limit: 51 }).success).toBe(
      false,
    );
  });

  it('coerces string limit to number', () => {
    expect(bookmarkListQuerySchema.parse({ limit: '25' }).limit).toBe(25);
  });

  it('accepts UUID cursor', () => {
    expect(bookmarkListQuerySchema.parse({ cursor: UUID }).cursor).toBe(UUID);
  });

  it('rejects non-UUID cursor', () => {
    expect(bookmarkListQuerySchema.safeParse({ cursor: 'abc' }).success).toBe(
      false,
    );
  });

  it('accepts subjectId and topicId filters', () => {
    const parsed = bookmarkListQuerySchema.parse({
      subjectId: UUID,
      topicId: UUID2,
    });
    expect(parsed.subjectId).toBe(UUID);
    expect(parsed.topicId).toBe(UUID2);
  });
});

// ---------------------------------------------------------------------------
// bookmarkListResponseSchema — canonical archive-style endpoint
// ---------------------------------------------------------------------------

describe('bookmarkListResponseSchema', () => {
  it('accepts a valid page with one bookmark and nextCursor', () => {
    const parsed = bookmarkListResponseSchema.parse({
      bookmarks: [validBookmark],
      nextCursor: UUID,
    });
    expect(parsed.bookmarks).toHaveLength(1);
    expect(parsed.nextCursor).toBe(UUID);
  });

  it('accepts empty page with null nextCursor', () => {
    const parsed = bookmarkListResponseSchema.parse({
      bookmarks: [],
      nextCursor: null,
    });
    expect(parsed.bookmarks).toEqual([]);
    expect(parsed.nextCursor).toBeNull();
  });

  it('rejects nextCursor that is not a UUID', () => {
    const result = bookmarkListResponseSchema.safeParse({
      bookmarks: [],
      nextCursor: 'not-valid',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path[0]);
      expect(paths).toContain('nextCursor');
    }
  });

  it('rejects missing nextCursor field', () => {
    const result = bookmarkListResponseSchema.safeParse({ bookmarks: [] });
    expect(result.success).toBe(false);
  });

  it('accepts multiple bookmarks in response', () => {
    const bk2 = { ...validBookmark, id: UUID2, eventId: UUID2 };
    const parsed = bookmarkListResponseSchema.parse({
      bookmarks: [validBookmark, bk2],
      nextCursor: null,
    });
    expect(parsed.bookmarks).toHaveLength(2);
  });

  it('rejects bookmark with invalid topicId (not UUID)', () => {
    const result = bookmarkListResponseSchema.safeParse({
      bookmarks: [{ ...validBookmark, topicId: 'not-uuid' }],
      nextCursor: null,
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// sessionBookmarkSchema
// ---------------------------------------------------------------------------

describe('sessionBookmarkSchema', () => {
  it('accepts valid session bookmark', () => {
    const parsed = sessionBookmarkSchema.parse({
      eventId: UUID,
      bookmarkId: UUID2,
    });
    expect(parsed.eventId).toBe(UUID);
    expect(parsed.bookmarkId).toBe(UUID2);
  });

  it('rejects non-UUID eventId', () => {
    const result = sessionBookmarkSchema.safeParse({
      eventId: 'bad',
      bookmarkId: UUID,
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// sessionBookmarkListResponseSchema
// ---------------------------------------------------------------------------

describe('sessionBookmarkListResponseSchema', () => {
  it('accepts empty bookmarks array', () => {
    const parsed = sessionBookmarkListResponseSchema.parse({ bookmarks: [] });
    expect(parsed.bookmarks).toEqual([]);
  });

  it('accepts bookmarks with eventId and bookmarkId', () => {
    const parsed = sessionBookmarkListResponseSchema.parse({
      bookmarks: [{ eventId: UUID, bookmarkId: UUID2 }],
    });
    expect(parsed.bookmarks[0]!.eventId).toBe(UUID);
  });
});
