// ---------------------------------------------------------------------------
// use-notes hook tests
// ---------------------------------------------------------------------------

import { renderHook, waitFor, act } from '@testing-library/react-native';
import { QueryClient } from '@tanstack/react-query';
import {
  createHookWrapper,
  createTestProfile,
} from '../test-utils/app-hook-test-utils';
import { setActiveProfileId, NetworkError } from '../lib/api-client';
import {
  useBookNotes,
  useConceptMasterySignals,
  useCreateNote,
  useNoteTopicIds,
  useUpdateNote,
  useDeleteNoteById,
} from './use-notes';

const mockFetch = jest.fn();
const originalFetch = globalThis.fetch;

let queryClient: QueryClient;

function createWrapper() {
  const w = createHookWrapper({
    activeProfile: createTestProfile({ id: 'test-profile-id' }),
  });
  queryClient = w.queryClient;
  return w.wrapper;
}

beforeEach(() => {
  mockFetch.mockReset();
  jest.clearAllMocks();
  globalThis.fetch = mockFetch as typeof fetch;
  setActiveProfileId('test-profile-id');
});

afterEach(() => {
  queryClient?.clear();
  setActiveProfileId(undefined);
});

afterAll(() => {
  globalThis.fetch = originalFetch;
});

const mockNotes = [
  {
    topicId: 'topic-1',
    content: 'My first note about ancient Egypt',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    topicId: 'topic-2',
    content: 'Notes about hieroglyphics',
    updatedAt: '2026-01-02T00:00:00.000Z',
  },
];

const mockBookNotesResponse = { notes: mockNotes };

// ---------------------------------------------------------------------------
// useBookNotes
// ---------------------------------------------------------------------------

describe('useBookNotes', () => {
  it('fetches and returns notes for a book', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(mockBookNotesResponse), { status: 200 }),
    );

    const { result } = renderHook(() => useBookNotes('subject-1', 'book-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockFetch).toHaveBeenCalled();
    expect(result.current.data).toEqual(mockBookNotesResponse);
    expect(result.current.data?.notes).toHaveLength(2);
  });

  it('is disabled when subjectId is undefined', async () => {
    const { result } = renderHook(() => useBookNotes(undefined, 'book-1'), {
      wrapper: createWrapper(),
    });

    expect(result.current.fetchStatus).toBe('idle');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('is disabled when bookId is undefined', async () => {
    const { result } = renderHook(() => useBookNotes('subject-1', undefined), {
      wrapper: createWrapper(),
    });

    expect(result.current.fetchStatus).toBe('idle');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('handles API error (404)', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ code: 'NOT_FOUND', message: 'Book not found' }),
        {
          status: 404,
        },
      ),
    );

    const { result } = renderHook(
      () => useBookNotes('subject-1', 'nonexistent'),
      { wrapper: createWrapper() },
    );

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error).toBeInstanceOf(Error);
  });

  it('handles network error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network request failed'));

    const { result } = renderHook(() => useBookNotes('subject-1', 'book-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    // The real customFetch wraps raw fetch rejections in NetworkError with a
    // user-friendly message. Assert the typed error class rather than the
    // internal rejection message that never reaches production.
    expect(result.current.error).toBeInstanceOf(NetworkError);
  });
});

// ---------------------------------------------------------------------------
// useCreateNote
// ---------------------------------------------------------------------------

describe('useCreateNote', () => {
  it('creates a note and triggers cache invalidation on success', async () => {
    const mockNote = {
      id: 'note-1',
      topicId: 'topic-1',
      profileId: 'test-profile-id',
      content: 'My note content',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ note: mockNote }), { status: 200 }),
    );

    const wrapper = createWrapper();
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useCreateNote('subject-1', 'book-1'), {
      wrapper,
    });

    await act(async () => {
      await result.current.mutateAsync({
        topicId: 'topic-1',
        content: 'My note content',
      });
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockFetch).toHaveBeenCalled();
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ['book-notes', 'subject-1', 'book-1', 'test-profile-id'],
      }),
    );
  });

  it('creates a separate note for new content', async () => {
    const mockNote = {
      id: 'note-1',
      topicId: 'topic-1',
      profileId: 'test-profile-id',
      content: 'Appended content',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ note: mockNote }), { status: 200 }),
    );

    const { result } = renderHook(() => useCreateNote('subject-1', 'book-1'), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.mutateAsync({
        topicId: 'topic-1',
        content: 'Appended content',
      });
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockFetch).toHaveBeenCalled();
  });

  it('throws when subjectId is undefined', async () => {
    const { result } = renderHook(() => useCreateNote(undefined, 'book-1'), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await expect(
        result.current.mutateAsync({ topicId: 'topic-1', content: 'test' }),
      ).rejects.toThrow('subjectId and topicId are required');
    });
  });

  it('handles API error', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          code: 'VALIDATION_ERROR',
          message: 'Validation error',
        }),
        {
          status: 422,
        },
      ),
    );

    const { result } = renderHook(() => useCreateNote('subject-1', 'book-1'), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await expect(
        result.current.mutateAsync({ topicId: 'topic-1', content: 'test' }),
      ).rejects.toThrow();
    });
  });
});

// ---------------------------------------------------------------------------
// useNoteTopicIds
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// useUpdateNote / useDeleteNoteById — cross-account invalidation safety
// [BUG-163]
// ---------------------------------------------------------------------------

// [BREAK] [BUG-163] Before the fix, useUpdateNote / useDeleteNoteById called
//   invalidateQueries({ queryKey: ['book-notes'] }) (no profileId)
// which prefix-matched ALL profiles. On a shared device, updating profile A's
// note would invalidate (and trigger background refetches of) profile B's
// cached note state — silently bridging cache lifecycles across identities.
// The fix scopes invalidation by predicate. We verify by capturing the
// predicate passed to invalidateQueries and running it against synthetic
// query keys for both the active profile and a different profile —
// sidesteps the test wrapper's `gcTime: 0` which evicts setQueryData
// entries before they can be inspected via getQueryState.
function runInvalidatePredicate(
  invalidateSpy: jest.SpyInstance,
  queryKey: readonly unknown[],
): boolean {
  const calls = invalidateSpy.mock.calls as Array<
    [{ predicate?: (query: { queryKey: readonly unknown[] }) => boolean }]
  >;
  return calls.some(([filter]) => {
    const predicate = filter?.predicate;
    if (!predicate) return false;
    return predicate({ queryKey });
  });
}

describe('useUpdateNote and useDeleteNoteById (profile-scoped invalidation)', () => {
  it('[BREAK] useUpdateNote invalidate-predicate matches active profile only', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          note: {
            id: 'note-1',
            topicId: 'topic-1',
            profileId: 'test-profile-id',
            content: 'updated',
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        }),
        { status: 200 },
      ),
    );

    const wrapper = createWrapper();
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useUpdateNote(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        noteId: 'note-1',
        content: 'updated',
      });
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(
      runInvalidatePredicate(invalidateSpy, [
        'book-notes',
        'subject-1',
        'book-1',
        'test-profile-id',
      ]),
    ).toBe(true);
    expect(
      runInvalidatePredicate(invalidateSpy, [
        'topic-notes',
        'subject-1',
        'topic-1',
        'test-profile-id',
      ]),
    ).toBe(true);
    expect(
      runInvalidatePredicate(invalidateSpy, ['all-notes', 'test-profile-id']),
    ).toBe(true);

    // A DIFFERENT profile's note keys MUST NOT match the predicate.
    expect(
      runInvalidatePredicate(invalidateSpy, [
        'book-notes',
        'subject-1',
        'book-1',
        'other-profile-id',
      ]),
    ).toBe(false);
    expect(
      runInvalidatePredicate(invalidateSpy, [
        'topic-notes',
        'subject-1',
        'topic-1',
        'other-profile-id',
      ]),
    ).toBe(false);
    expect(
      runInvalidatePredicate(invalidateSpy, ['all-notes', 'other-profile-id']),
    ).toBe(false);
  });

  it('[BREAK] useDeleteNoteById invalidate-predicate matches active profile only', async () => {
    mockFetch.mockResolvedValueOnce(new Response(null, { status: 204 }));

    const wrapper = createWrapper();
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useDeleteNoteById(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync('note-1');
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(
      runInvalidatePredicate(invalidateSpy, [
        'note-topic-ids',
        'test-profile-id',
      ]),
    ).toBe(true);
    expect(
      runInvalidatePredicate(invalidateSpy, [
        'note-topic-ids',
        'other-profile-id',
      ]),
    ).toBe(false);
  });
});

describe('useNoteTopicIds', () => {
  it('fetches and returns topic IDs that have notes', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ topicIds: ['topic-1', 'topic-2', 'topic-3'] }),
        { status: 200 },
      ),
    );

    const { result } = renderHook(() => useNoteTopicIds(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockFetch).toHaveBeenCalled();
    expect(result.current.data?.topicIds).toEqual([
      'topic-1',
      'topic-2',
      'topic-3',
    ]);
  });

  it('handles API error', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response('Internal Server Error', { status: 500 }),
    );

    const { result } = renderHook(() => useNoteTopicIds(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error).toBeInstanceOf(Error);
  });
});

describe('useConceptMasterySignals', () => {
  it('fetches and returns concept-mastery signals for topic IDs', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          signals: {
            'topic-1': {
              verified: true,
              hasMentorAddition: false,
              mentorAdditions: [],
            },
          },
        }),
        { status: 200 },
      ),
    );

    const { result } = renderHook(() => useConceptMasterySignals(['topic-1']), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockFetch).toHaveBeenCalled();
    expect(result.current.data?.signals['topic-1']).toEqual({
      verified: true,
      hasMentorAddition: false,
      mentorAdditions: [],
    });
  });

  it('stays idle when no topic IDs are provided', () => {
    const { result } = renderHook(() => useConceptMasterySignals([]), {
      wrapper: createWrapper(),
    });

    expect(result.current.fetchStatus).toBe('idle');
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
