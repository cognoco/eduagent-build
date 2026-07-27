import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { QueryClient } from '@tanstack/react-query';
import type { CurriculumBook, Subject } from '@eduagent/schemas';

import {
  createHookWrapper,
  createTestProfile,
} from '../test-utils/app-hook-test-utils';
import { setActiveProfileId } from '../lib/api-client';
import { useSubjectsIndex } from './use-subjects-index';

jest.mock('../lib/app-context', () => {
  const actual =
    jest.requireActual<typeof import('../lib/app-context')>(
      '../lib/app-context',
    );
  return {
    ...actual,
    useAppContext: () => ({
      mode: null,
      setMode: jest.fn(),
      familyCapable: false,
    }),
  };
});

jest.mock('@sentry/react-native', () => ({
  captureMessage: jest.fn(),
  captureException: jest.fn(),
  init: jest.fn(),
  getCurrentScope: jest.fn(() => ({ clear: jest.fn() })),
  setUser: jest.fn(),
  getClient: jest.fn(),
}));

const PROFILE_ID = '770e8400-e29b-41d4-a716-446655440002';
const SUBJECT_ID = '550e8400-e29b-41d4-a716-446655440000';
const PAUSED_SUBJECT_ID = '660e8400-e29b-41d4-a716-446655440001';
const ARCHIVED_SUBJECT_ID = '880e8400-e29b-41d4-a716-446655440004';
const originalFetch = globalThis.fetch;
let queryClient: QueryClient;

function subject(overrides: Partial<Subject> = {}): Subject {
  return {
    id: SUBJECT_ID,
    profileId: PROFILE_ID,
    name: 'Child Learning Data',
    status: 'active',
    curriculumStatus: 'ready',
    pedagogyMode: 'socratic',
    urgencyBoostUntil: null,
    createdAt: '2026-07-26T00:00:00.000Z',
    updatedAt: '2026-07-26T00:00:00.000Z',
    ...overrides,
  };
}

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function pendingResponse(
  signal: AbortSignal | null | undefined,
): Promise<Response> {
  return new Promise((_resolve, reject) => {
    signal?.addEventListener(
      'abort',
      () => reject(new DOMException('Aborted', 'AbortError')),
      { once: true },
    );
  });
}

function emptyBooksResponse(): Response {
  return response({ subjects: [], nextCursor: null });
}

function emptyProgressResponse(): Response {
  return response({
    subjects: [],
    totalTopicsCompleted: 0,
    totalTopicsVerified: 0,
    totalTopicsMastered: 0,
    totalTopicsLearning: 0,
  });
}

function book(overrides: Partial<CurriculumBook> = {}): CurriculumBook {
  return {
    id: '990e8400-e29b-41d4-a716-446655440005',
    subjectId: SUBJECT_ID,
    title: 'Fractions',
    description: null,
    emoji: null,
    sortOrder: 1,
    topicsGenerated: true,
    status: 'REVIEW_DUE',
    topicCount: 8,
    completedTopicCount: 5,
    masteredTopicCount: 3,
    createdAt: '2026-07-26T00:00:00.000Z',
    updatedAt: '2026-07-26T00:00:00.000Z',
    ...overrides,
  };
}

function createWrapper() {
  const wrapper = createHookWrapper({
    activeProfile: createTestProfile({ id: PROFILE_ID }),
  });
  queryClient = wrapper.queryClient;
  return wrapper.wrapper;
}

beforeEach(() => {
  setActiveProfileId(PROFILE_ID);
});

afterEach(() => {
  queryClient?.clear();
  setActiveProfileId(undefined);
  globalThis.fetch = originalFetch;
});

describe('useSubjectsIndex readiness', () => {
  it('exposes primary subject rows while books enrichment is pending', async () => {
    globalThis.fetch = jest.fn(
      (input: RequestInfo | URL, init?: RequestInit) => {
        const url = requestUrl(input);
        const pathname = new URL(url).pathname;
        if (pathname.endsWith('/subjects')) {
          return Promise.resolve(response({ subjects: [subject()] }));
        }
        if (pathname.endsWith('/library/books')) {
          return pendingResponse(init?.signal);
        }
        if (pathname.endsWith('/progress/overview')) {
          return Promise.resolve(emptyProgressResponse());
        }
        throw new Error(`Unexpected request: ${url}`);
      },
    ) as typeof fetch;

    const { result } = renderHook(() => useSubjectsIndex(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.subjects).toEqual([
        expect.objectContaining({
          subjectId: SUBJECT_ID,
          subjectName: 'Child Learning Data',
          books: [],
          mastered: 0,
          learning: 0,
          total: 0,
        }),
      ]);
    });
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isError).toBe(false);
  });

  it('exposes primary subject rows while progress enrichment is pending', async () => {
    globalThis.fetch = jest.fn(
      (input: RequestInfo | URL, init?: RequestInit) => {
        const url = requestUrl(input);
        const pathname = new URL(url).pathname;
        if (pathname.endsWith('/subjects')) {
          return Promise.resolve(response({ subjects: [subject()] }));
        }
        if (pathname.endsWith('/library/books')) {
          return Promise.resolve(emptyBooksResponse());
        }
        if (pathname.endsWith('/progress/overview')) {
          return pendingResponse(init?.signal);
        }
        throw new Error(`Unexpected request: ${url}`);
      },
    ) as typeof fetch;

    const { result } = renderHook(() => useSubjectsIndex(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.subjects).toEqual([
        expect.objectContaining({
          subjectId: SUBJECT_ID,
          books: [],
          mastered: 0,
          learning: 0,
          total: 0,
        }),
      ]);
    });
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isError).toBe(false);
  });

  it('keeps primary subject rows available when books enrichment fails', async () => {
    globalThis.fetch = jest.fn((input: RequestInfo | URL) => {
      const url = requestUrl(input);
      const pathname = new URL(url).pathname;
      if (pathname.endsWith('/subjects')) {
        return Promise.resolve(response({ subjects: [subject()] }));
      }
      if (pathname.endsWith('/library/books')) {
        return Promise.resolve(response({ message: 'Unavailable' }, 500));
      }
      if (pathname.endsWith('/progress/overview')) {
        return Promise.resolve(emptyProgressResponse());
      }
      throw new Error(`Unexpected request: ${url}`);
    }) as typeof fetch;

    const { result } = renderHook(() => useSubjectsIndex(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.subjects).toHaveLength(1);
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(result.current.subjects).toEqual([
      expect.objectContaining({ subjectId: SUBJECT_ID, books: [] }),
    ]);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isError).toBe(false);
  });

  it('keeps primary subject rows available when progress enrichment fails', async () => {
    globalThis.fetch = jest.fn((input: RequestInfo | URL) => {
      const url = requestUrl(input);
      const pathname = new URL(url).pathname;
      if (pathname.endsWith('/subjects')) {
        return Promise.resolve(response({ subjects: [subject()] }));
      }
      if (pathname.endsWith('/library/books')) {
        return Promise.resolve(emptyBooksResponse());
      }
      if (pathname.endsWith('/progress/overview')) {
        return Promise.resolve(response({ message: 'Unavailable' }, 500));
      }
      throw new Error(`Unexpected request: ${url}`);
    }) as typeof fetch;

    const { result } = renderHook(() => useSubjectsIndex(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.subjects).toHaveLength(1);
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(result.current.subjects).toEqual([
      expect.objectContaining({
        subjectId: SUBJECT_ID,
        mastered: 0,
        learning: 0,
        total: 0,
      }),
    ]);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isError).toBe(false);
  });

  it('reports loading while the empty primary subject list is still pending', () => {
    globalThis.fetch = jest.fn(
      (input: RequestInfo | URL, init?: RequestInit) => {
        const url = requestUrl(input);
        const pathname = new URL(url).pathname;
        if (pathname.endsWith('/subjects')) {
          return pendingResponse(init?.signal);
        }
        if (pathname.endsWith('/library/books')) {
          return Promise.resolve(emptyBooksResponse());
        }
        if (pathname.endsWith('/progress/overview')) {
          return Promise.resolve(emptyProgressResponse());
        }
        throw new Error(`Unexpected request: ${url}`);
      },
    ) as typeof fetch;

    const { result } = renderHook(() => useSubjectsIndex(), {
      wrapper: createWrapper(),
    });

    expect(result.current.subjects).toEqual([]);
    expect(result.current.isLoading).toBe(true);
    expect(result.current.isError).toBe(false);
  });

  it('still reports a primary subject query failure as fatal', async () => {
    globalThis.fetch = jest.fn((input: RequestInfo | URL) => {
      const url = requestUrl(input);
      const pathname = new URL(url).pathname;
      if (pathname.endsWith('/subjects')) {
        return Promise.resolve(response({ message: 'Unavailable' }, 500));
      }
      if (pathname.endsWith('/library/books')) {
        return Promise.resolve(emptyBooksResponse());
      }
      if (pathname.endsWith('/progress/overview')) {
        return Promise.resolve(emptyProgressResponse());
      }
      throw new Error(`Unexpected request: ${url}`);
    }) as typeof fetch;

    const { result } = renderHook(() => useSubjectsIndex(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
    expect(result.current.subjects).toEqual([]);
    expect(result.current.isLoading).toBe(false);
  });

  it('preserves primary order and status variants after enrichment settles', async () => {
    const active = subject({ name: 'Active' });
    const paused = subject({
      id: PAUSED_SUBJECT_ID,
      name: 'Paused',
      status: 'paused',
    });
    const archived = subject({
      id: ARCHIVED_SUBJECT_ID,
      name: 'Archived',
      status: 'archived',
    });

    globalThis.fetch = jest.fn((input: RequestInfo | URL) => {
      const url = requestUrl(input);
      const pathname = new URL(url).pathname;
      if (pathname.endsWith('/subjects')) {
        return Promise.resolve(
          response({ subjects: [active, paused, archived] }),
        );
      }
      if (pathname.endsWith('/library/books')) {
        return Promise.resolve(
          response({
            subjects: [
              {
                subjectId: SUBJECT_ID,
                subjectName: active.name,
                books: [book()],
              },
            ],
            nextCursor: null,
          }),
        );
      }
      if (pathname.endsWith('/progress/overview')) {
        return Promise.resolve(
          response({
            subjects: [
              {
                subjectId: SUBJECT_ID,
                name: active.name,
                topicsTotal: 9,
                topicsCompleted: 6,
                topicsVerified: 4,
                topicsMastered: 4,
                topicsLearning: 2,
                urgencyScore: 0,
                retentionStatus: 'strong',
                lastSessionAt: null,
              },
            ],
            totalTopicsCompleted: 6,
            totalTopicsVerified: 4,
            totalTopicsMastered: 4,
            totalTopicsLearning: 2,
          }),
        );
      }
      throw new Error(`Unexpected request: ${url}`);
    }) as typeof fetch;

    const { result } = renderHook(() => useSubjectsIndex(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.subjects[0]?.books).toHaveLength(1);
      expect(result.current.subjects[0]?.total).toBe(9);
    });
    expect(
      result.current.subjects.map(({ subjectName, status }) => ({
        subjectName,
        status,
      })),
    ).toEqual([
      { subjectName: 'Active', status: 'active' },
      { subjectName: 'Paused', status: 'paused' },
      { subjectName: 'Archived', status: 'archived' },
    ]);
    expect(result.current.subjects[0]).toEqual(
      expect.objectContaining({
        mastered: 4,
        learning: 2,
        total: 9,
        dueReviews: 1,
      }),
    );
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isError).toBe(false);
  });
});
