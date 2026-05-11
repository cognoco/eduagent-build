// ---------------------------------------------------------------------------
// suggestions.ts unit tests
// getUnpickedBookSuggestionsEnvelope + getUnpickedBookSuggestionsWithTopup
// ---------------------------------------------------------------------------

import { jest } from '@jest/globals';

const generateMock = jest.fn();
jest.mock('./book-suggestion-generation', () => ({
  // gc1-allow: isolating LLM-calling dependency
  generateCategorizedBookSuggestions: (...args: unknown[]) =>
    generateMock(...args),
}));

import {
  getUnpickedBookSuggestionsWithTopup,
  getUnpickedBookSuggestionsEnvelope,
} from './suggestions';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const PROFILE_ID = 'profile-1';
const SUBJECT_ID = 'subject-1';

const subjectRow = { id: SUBJECT_ID, profileId: PROFILE_ID };

function makeSuggestion(id: string) {
  return {
    id,
    subjectId: SUBJECT_ID,
    title: `Book ${id}`,
    emoji: null,
    description: null,
    category: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    pickedAt: null,
  };
}

/**
 * Build a db mock with sequential `select()` responses.
 *
 * Call 1 → unpicked suggestions rows
 * Call 2 → curriculum book count row
 * (call 3 → unpicked suggestions rows after topup, if provided)
 */
const SUBJECT_NOT_FOUND = Symbol('SUBJECT_NOT_FOUND');

function makeDb(options: {
  subject?: object | symbol;
  unpickedRows: object[];
  bookCount: number;
  unpickedRowsAfterTopup?: object[];
}) {
  const {
    subject = subjectRow,
    unpickedRows,
    bookCount,
    unpickedRowsAfterTopup,
  } = options;
  const resolvedSubject = subject === SUBJECT_NOT_FOUND ? undefined : subject;

  const selectMock = jest.fn();

  const countRow = [{ count: bookCount }];

  if (unpickedRowsAfterTopup !== undefined) {
    // topup path: select() is called 3 times
    // 1: initial unpicked query
    // 2: re-read after generation
    // 3: book count query
    selectMock
      .mockReturnValueOnce({
        from: () => ({ where: () => Promise.resolve(unpickedRows) }),
      })
      .mockReturnValueOnce({
        from: () => ({ where: () => Promise.resolve(unpickedRowsAfterTopup) }),
      })
      .mockReturnValueOnce({
        from: () => ({ where: () => Promise.resolve(countRow) }),
      });
  } else {
    // no topup: select() is called 2 times
    // 1: unpicked query
    // 2: book count query
    selectMock
      .mockReturnValueOnce({
        from: () => ({ where: () => Promise.resolve(unpickedRows) }),
      })
      .mockReturnValueOnce({
        from: () => ({ where: () => Promise.resolve(countRow) }),
      });
  }

  return {
    query: {
      subjects: {
        findFirst: jest.fn().mockResolvedValue(resolvedSubject),
      },
    },
    select: selectMock,
  } as never;
}

// ---------------------------------------------------------------------------
// getUnpickedBookSuggestionsEnvelope
// ---------------------------------------------------------------------------

describe('getUnpickedBookSuggestionsEnvelope', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns envelope with suggestions and book count — does NOT call generation', async () => {
    const rows = [makeSuggestion('s1'), makeSuggestion('s2')];
    const db = makeDb({ unpickedRows: rows, bookCount: 5 });

    const result = await getUnpickedBookSuggestionsEnvelope(
      db,
      PROFILE_ID,
      SUBJECT_ID,
    );

    expect(result.suggestions).toHaveLength(2);
    expect(result.suggestions[0]).toMatchObject({ id: 's1' });
    expect(result.curriculumBookCount).toBe(5);
    expect(generateMock).not.toHaveBeenCalled();
  });

  it('returns empty envelope when subject does not belong to profile', async () => {
    const db = makeDb({
      subject: SUBJECT_NOT_FOUND,
      unpickedRows: [],
      bookCount: 0,
    });

    const result = await getUnpickedBookSuggestionsEnvelope(
      db,
      PROFILE_ID,
      SUBJECT_ID,
    );

    expect(result).toEqual({ suggestions: [], curriculumBookCount: 0 });
  });
});

// ---------------------------------------------------------------------------
// getUnpickedBookSuggestionsWithTopup
// ---------------------------------------------------------------------------

describe('getUnpickedBookSuggestionsWithTopup', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('skips generation when unpicked pool is already ≥ 4', async () => {
    const rows = [
      makeSuggestion('s1'),
      makeSuggestion('s2'),
      makeSuggestion('s3'),
      makeSuggestion('s4'),
    ];
    const db = makeDb({ unpickedRows: rows, bookCount: 2 });

    const result = await getUnpickedBookSuggestionsWithTopup(
      db,
      PROFILE_ID,
      SUBJECT_ID,
    );

    expect(generateMock).not.toHaveBeenCalled();
    expect(result.suggestions).toHaveLength(4);
    expect(result.curriculumBookCount).toBe(2);
  });

  it('calls generation and re-reads pool when unpicked pool is < 4', async () => {
    const initialRows = [makeSuggestion('s1'), makeSuggestion('s2')]; // 2 < 4
    const afterTopupRows = [
      makeSuggestion('s1'),
      makeSuggestion('s2'),
      makeSuggestion('s3'),
      makeSuggestion('s4'),
      makeSuggestion('s5'),
    ];
    generateMock.mockResolvedValue(undefined);

    const db = makeDb({
      unpickedRows: initialRows,
      bookCount: 1,
      unpickedRowsAfterTopup: afterTopupRows,
    });

    const result = await getUnpickedBookSuggestionsWithTopup(
      db,
      PROFILE_ID,
      SUBJECT_ID,
    );

    expect(generateMock).toHaveBeenCalledTimes(1);
    expect(generateMock).toHaveBeenCalledWith(db, PROFILE_ID, SUBJECT_ID);
    expect(result.suggestions).toHaveLength(5);
    expect(result.curriculumBookCount).toBe(1);
  });

  it('returns empty envelope when subject does not belong to profile', async () => {
    const db = makeDb({
      subject: SUBJECT_NOT_FOUND,
      unpickedRows: [],
      bookCount: 0,
    });

    const result = await getUnpickedBookSuggestionsWithTopup(
      db,
      PROFILE_ID,
      SUBJECT_ID,
    );

    expect(result).toEqual({ suggestions: [], curriculumBookCount: 0 });
    expect(generateMock).not.toHaveBeenCalled();
  });
});
