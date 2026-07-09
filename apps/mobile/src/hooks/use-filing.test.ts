import { renderHook, waitFor, act } from '@testing-library/react-native';
import { QueryClient } from '@tanstack/react-query';
import type { LearningSession } from '@eduagent/schemas';

import {
  createHookWrapper,
  createTestProfile,
} from '../test-utils/app-hook-test-utils';
import { setActiveProfileId, setProxyMode } from '../lib/api-client';
import { queryKeys } from '../lib/query-keys';
import {
  useAddSessionToLibrary,
  useKeepSessionOutOfLibrary,
  useRenameFiledLibraryTopic,
  useRestoreSessionLibraryFiling,
  useRetrySessionLibraryFiling,
  useSessionLibraryFiling,
} from './use-filing';

const mockFetch = jest.fn();
const originalFetch = globalThis.fetch;

let queryClient: QueryClient;
let usingFakeTimers = false;

const TEST_SESSION_ID = '00000000-0000-7000-a000-000000000401';

function createWrapper() {
  const wrapper = createHookWrapper({
    activeProfile: createTestProfile({ id: 'test-profile-id' }),
  });
  queryClient = wrapper.queryClient;
  return wrapper.wrapper;
}

function makeSession(
  overrides: Partial<LearningSession> = {},
): LearningSession {
  return {
    id: TEST_SESSION_ID,
    subjectId: '00000000-0000-7000-8000-000000000001',
    topicId: null,
    sessionType: 'learning',
    inputMode: 'text',
    verificationType: 'standard',
    status: 'completed',
    escalationRung: 1,
    exchangeCount: 3,
    startedAt: '2026-01-01T00:00:00.000Z',
    lastActivityAt: '2026-01-01T00:05:00.000Z',
    endedAt: '2026-01-01T00:05:00.000Z',
    durationSeconds: 300,
    wallClockSeconds: null,
    filedAt: null,
    filingStatus: null,
    filingRetryCount: 0,
    metadata: {
      effectiveMode: 'freeform',
    },
    ...overrides,
    topicTitle: overrides.topicTitle ?? null,
    subjectName: overrides.subjectName ?? null,
    bookId: overrides.bookId ?? null,
    bookTitle: overrides.bookTitle ?? null,
  };
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function advancePollingTimer(): Promise<void> {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(3_000);
  });
}

function expectSessionInvalidationPredicate(
  invalidateSpy: jest.SpiedFunction<QueryClient['invalidateQueries']>,
  queryKey: readonly unknown[],
): void {
  expect(
    invalidateSpy.mock.calls.some(([filters]) => {
      const predicate = filters?.predicate;
      return typeof predicate === 'function'
        ? predicate({ queryKey } as Parameters<typeof predicate>[0])
        : false;
    }),
  ).toBe(true);
}

beforeEach(() => {
  mockFetch.mockReset();
  jest.clearAllMocks();
  globalThis.fetch = mockFetch as typeof fetch;
  setActiveProfileId('test-profile-id');
  setProxyMode(false);
});

afterEach(() => {
  queryClient?.clear();
  setActiveProfileId(undefined);
  setProxyMode(false);
  if (usingFakeTimers) {
    if (jest.getTimerCount() > 0) {
      jest.runOnlyPendingTimers();
    }
    jest.useRealTimers();
    usingFakeTimers = false;
  }
});

afterAll(() => {
  globalThis.fetch = originalFetch;
});

describe('useSessionLibraryFiling', () => {
  it('polls pending filing every 3 seconds and stops after 10 polls without exposing retry', async () => {
    jest.useFakeTimers();
    usingFakeTimers = true;
    mockFetch.mockImplementation(() =>
      Promise.resolve(
        jsonResponse({
          session: makeSession({
            filingStatus: 'filing_pending',
          }),
        }),
      ),
    );

    const { result } = renderHook(
      () => useSessionLibraryFiling(TEST_SESSION_ID),
      {
        wrapper: createWrapper(),
      },
    );

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    for (let i = 0; i < 10; i += 1) {
      await advancePollingTimer();
      expect(mockFetch).toHaveBeenCalledTimes(i + 2);
    }

    await waitFor(() => {
      expect(result.current.timedOutStillPending).toBe(true);
    });
    expect(result.current.canRetry).toBe(false);
    expect(result.current.isTerminalFailure).toBe(false);

    await advancePollingTimer();
    expect(mockFetch).toHaveBeenCalledTimes(11);
  });

  it.each([
    ['filing_recovered'],
    ['filing_failed'],
    ['filing_kept_out'],
  ] as const)('does not poll terminal state %s', async (filingStatus) => {
    jest.useFakeTimers();
    usingFakeTimers = true;
    mockFetch.mockResolvedValue(
      jsonResponse({ session: makeSession({ filingStatus }) }),
    );

    const { result } = renderHook(
      () => useSessionLibraryFiling(TEST_SESSION_ID),
      {
        wrapper: createWrapper(),
      },
    );

    await waitFor(() => {
      expect(result.current.filingStatus).toBe(filingStatus);
    });

    await advancePollingTimer();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});

describe('Library filing mutations', () => {
  it.each([
    [
      'keep-out',
      () => useKeepSessionOutOfLibrary(),
      `/sessions/${TEST_SESSION_ID}/library-filing/keep-out`,
    ],
    [
      'add-to-library',
      () => useAddSessionToLibrary(),
      `/sessions/${TEST_SESSION_ID}/library-filing/add`,
    ],
    [
      'restore',
      () => useRestoreSessionLibraryFiling(),
      `/sessions/${TEST_SESSION_ID}/library-filing/restore`,
    ],
    [
      'retry',
      () => useRetrySessionLibraryFiling(),
      `/sessions/${TEST_SESSION_ID}/retry-filing`,
    ],
  ] as const)(
    '%s calls the correct endpoint and invalidates session and Library caches',
    async (_name, useHook, expectedPath) => {
      mockFetch.mockResolvedValue(jsonResponse({ session: makeSession() }));
      const wrapper = createWrapper();
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useHook(), {
        wrapper,
      });

      await act(async () => {
        await result.current.mutateAsync({ sessionId: TEST_SESSION_ID });
      });

      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toContain(expectedPath);
      expect(init.method).toBe('POST');

      expectSessionInvalidationPredicate(
        invalidateSpy,
        queryKeys.sessions.detail('study', TEST_SESSION_ID, 'test-profile-id'),
      );
      expectSessionInvalidationPredicate(
        invalidateSpy,
        queryKeys.sessions.summary('study', TEST_SESSION_ID, 'test-profile-id'),
      );
      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          queryKey: queryKeys.library.retention('test-profile-id'),
        }),
      );
      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ queryKey: ['subjects'] }),
      );
      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ queryKey: ['books'] }),
      );
    },
  );

  it('exposes rename as unsupported until a backend route exists', async () => {
    const { result } = renderHook(() => useRenameFiledLibraryTopic(), {
      wrapper: createWrapper(),
    });

    expect(result.current.isSupported).toBe(false);
    expect(result.current.missingBackendRoute).toBe(
      'PATCH /topics/:topicId/rename',
    );

    await expect(
      result.current.mutateAsync({
        topicId: 'topic-1',
        title: 'Better title',
      }),
    ).rejects.toThrow('Topic rename is not supported by the API yet.');
  });
});
