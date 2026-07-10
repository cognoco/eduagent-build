import { renderHook, waitFor, act } from '@testing-library/react-native';
import { QueryClient } from '@tanstack/react-query';
import type { Subject } from '@eduagent/schemas';
import {
  createHookWrapper,
  createTestProfile,
} from '../test-utils/app-hook-test-utils';
import { setActiveProfileId } from '../lib/api-client';
import {
  useSubjects,
  useCreateSubject,
  useUpdateSubject,
  useDeleteSubject,
} from './use-subjects';

const mockFetch = jest.fn();
const originalFetch = globalThis.fetch;

let queryClient: QueryClient;

const PROFILE_ID = 'c0000000-0000-4000-8000-000000000001';
const SUBJECT_1_ID = 'c0000000-0000-4000-8000-000000000002';
const SUBJECT_2_ID = 'c0000000-0000-4000-8000-000000000003';

function createSubjectFixture(overrides: Partial<Subject> = {}): Subject {
  return {
    id: SUBJECT_1_ID,
    profileId: PROFILE_ID,
    name: 'Math',
    status: 'active',
    pedagogyMode: 'socratic',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

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

describe('useSubjects', () => {
  it('returns subjects from API', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          subjects: [
            createSubjectFixture(),
            createSubjectFixture({ id: SUBJECT_2_ID, name: 'Science' }),
          ],
        }),
        { status: 200 },
      ),
    );

    const { result } = renderHook(() => useSubjects(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockFetch).toHaveBeenCalled();
    expect(result.current.data).toEqual([
      createSubjectFixture(),
      createSubjectFixture({ id: SUBJECT_2_ID, name: 'Science' }),
    ]);
  });

  it('returns empty array when API returns no subjects', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ subjects: [] }), { status: 200 }),
    );

    const { result } = renderHook(() => useSubjects(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual([]);
  });

  it('handles API errors', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response('Network error', { status: 500 }),
    );

    const { result } = renderHook(() => useSubjects(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error).toBeInstanceOf(Error);
  });

  it('rejects a non-array subjects payload without polling [BUG-634 / M-2]', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ subjects: 'not-an-array' }), {
        status: 200,
      }),
    );

    const { result } = renderHook(() => useSubjects(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    const query = queryClient.getQueryCache().findAll()[0];
    expect(query).toBeDefined();
    expect(query!.state.data).toBeUndefined();
  });
});

describe('useCreateSubject', () => {
  it('calls POST /subjects with subject name', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          subject: createSubjectFixture({ name: 'Calculus' }),
          structureType: 'broad',
        }),
        { status: 200 },
      ),
    );

    const { result } = renderHook(() => useCreateSubject(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate({ name: 'Calculus' });
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockFetch).toHaveBeenCalled();
    expect(result.current.data).toEqual({
      subject: createSubjectFixture({ name: 'Calculus' }),
      structureType: 'broad',
    });
  });

  it('handles creation errors', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response('Subject already exists', { status: 409 }),
    );

    const { result } = renderHook(() => useCreateSubject(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate({ name: 'Calculus' });
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error).toBeInstanceOf(Error);
  });
});

describe('useUpdateSubject', () => {
  it('sends archived status in the PATCH body', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          subject: createSubjectFixture({
            name: 'Calculus',
            status: 'archived',
          }),
        }),
        { status: 200 },
      ),
    );

    const { result } = renderHook(() => useUpdateSubject(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate({ subjectId: 's1', status: 'archived' });
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    const init = mockFetch.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(init.body))).toEqual({ status: 'archived' });
    expect(result.current.data).toEqual({
      subject: createSubjectFixture({ name: 'Calculus', status: 'archived' }),
    });
  });

  it('retries transient rate-limit failures when updating a subject', async () => {
    const rateLimited = Object.assign(
      new Error("You've hit the limit. Wait a moment and try again."),
      {
        name: 'RateLimitedError',
        retryAfter: 0,
      },
    );
    mockFetch.mockRejectedValueOnce(rateLimited).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          subject: createSubjectFixture({
            name: 'Calculus',
            status: 'archived',
          }),
        }),
        { status: 200 },
      ),
    );

    const { result } = renderHook(() => useUpdateSubject(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.mutateAsync({
        subjectId: 's1',
        status: 'archived',
      });
    });

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(result.current.data).toEqual({
      subject: createSubjectFixture({ name: 'Calculus', status: 'archived' }),
    });
  });
});

describe('useDeleteSubject', () => {
  it('sends DELETE /subjects/:id and invalidates subject, curriculum, library, and progress data', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ deleted: true, subjectId: SUBJECT_1_ID }), {
        status: 200,
      }),
    );

    const wrapper = createWrapper();
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useDeleteSubject(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ subjectId: 's1' });
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    const init = mockFetch.mock.calls[0]?.[1] as RequestInit;
    expect(init.method).toBe('DELETE');
    expect(result.current.data).toEqual({
      deleted: true,
      subjectId: SUBJECT_1_ID,
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['subjects'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['curriculum'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['library'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['progress'] });
  });
});
