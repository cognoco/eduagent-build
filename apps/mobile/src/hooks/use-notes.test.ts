// ---------------------------------------------------------------------------
// use-notes hook tests
// ---------------------------------------------------------------------------

import { renderHook, waitFor, act } from '@testing-library/react-native';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  useBookNotes,
  useUpsertNote,
  useNoteTopicIds,
  useDeleteNote,
} from './use-notes';

const mockFetch = jest.fn();
jest.mock('../lib/api-client', () => ({
  useApiClient: () => {
    const { hc } = require('hono/client');
    return hc('http://localhost', {
      fetch: async (...args: unknown[]) => {
        const res = await mockFetch(...(args as Parameters<typeof fetch>));
        if (!res.ok) {
          const text = await res
            .clone()
            .text()
            .catch(() => res.statusText);
          throw new Error(`API error ${res.status}: ${text}`);
        }
        return res;
      },
    });
  },
}));

jest.mock('../lib/profile', () => ({
  useProfile: () => ({
    activeProfile: { id: 'test-profile-id' },
  }),
}));

let queryClient: QueryClient;

function createWrapper() {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(
      QueryClientProvider,
      { client: queryClient },
      children
    );
  };
}

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
  beforeEach(() => {
    mockFetch.mockReset();
    jest.clearAllMocks();
  });

  afterEach(() => {
    queryClient?.clear();
  });

  it('fetches and returns notes for a book', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(mockBookNotesResponse), { status: 200 })
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
      new Response(JSON.stringify({ error: { message: 'Book not found' } }), {
        status: 404,
      })
    );

    const { result } = renderHook(
      () => useBookNotes('subject-1', 'nonexistent'),
      { wrapper: createWrapper() }
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

    expect(result.current.error?.message).toContain('Network request failed');
  });
});

// ---------------------------------------------------------------------------
// useUpsertNote
// ---------------------------------------------------------------------------

describe('useUpsertNote', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    jest.clearAllMocks();
  });

  afterEach(() => {
    queryClient?.clear();
  });

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
      new Response(JSON.stringify({ note: mockNote }), { status: 200 })
    );

    const wrapper = createWrapper();
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useUpsertNote('subject-1', 'book-1'), {
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
      })
    );
  });

  it('sends append flag when provided', async () => {
    const mockNote = {
      id: 'note-1',
      topicId: 'topic-1',
      profileId: 'test-profile-id',
      content: 'Appended content',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ note: mockNote }), { status: 200 })
    );

    const { result } = renderHook(() => useUpsertNote('subject-1', 'book-1'), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.mutateAsync({
        topicId: 'topic-1',
        content: 'Appended content',
        append: true,
      });
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockFetch).toHaveBeenCalled();
  });

  it('throws when subjectId is undefined', async () => {
    const { result } = renderHook(() => useUpsertNote(undefined, 'book-1'), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await expect(
        result.current.mutateAsync({ topicId: 'topic-1', content: 'test' })
      ).rejects.toThrow('subjectId and topicId are required');
    });
  });

  it('handles API error', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { message: 'Validation error' } }), {
        status: 422,
      })
    );

    const { result } = renderHook(() => useUpsertNote('subject-1', 'book-1'), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await expect(
        result.current.mutateAsync({ topicId: 'topic-1', content: 'test' })
      ).rejects.toThrow();
    });
  });
});

// ---------------------------------------------------------------------------
// useNoteTopicIds
// ---------------------------------------------------------------------------

describe('useNoteTopicIds', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    jest.clearAllMocks();
  });

  afterEach(() => {
    queryClient?.clear();
  });

  it('fetches and returns topic IDs that have notes', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ topicIds: ['topic-1', 'topic-2', 'topic-3'] }),
        { status: 200 }
      )
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
      new Response('Internal Server Error', { status: 500 })
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

// ---------------------------------------------------------------------------
// useDeleteNote
// ---------------------------------------------------------------------------

describe('useDeleteNote', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    jest.clearAllMocks();
  });

  afterEach(() => {
    queryClient?.clear();
  });

  it('deletes a note and invalidates book-notes cache', async () => {
    mockFetch.mockResolvedValueOnce(new Response(null, { status: 204 }));

    const wrapper = createWrapper();
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useDeleteNote('subject-1', 'book-1'), {
      wrapper,
    });

    await act(async () => {
      await result.current.mutateAsync('topic-1');
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockFetch).toHaveBeenCalled();
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ['book-notes', 'subject-1', 'book-1', 'test-profile-id'],
      })
    );
  });

  it('throws when subjectId is undefined', async () => {
    const { result } = renderHook(() => useDeleteNote(undefined, 'book-1'), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await expect(result.current.mutateAsync('topic-1')).rejects.toThrow(
        'subjectId and topicId are required'
      );
    });
  });

  it('handles API error (404)', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'Note not found' }), { status: 404 })
    );

    const { result } = renderHook(() => useDeleteNote('subject-1', 'book-1'), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await expect(
        result.current.mutateAsync('nonexistent-topic')
      ).rejects.toThrow();
    });
  });
});
