// ---------------------------------------------------------------------------
// use-learner-profile hook tests
// ---------------------------------------------------------------------------

import { renderHook, waitFor, act } from '@testing-library/react-native';
import { QueryClient } from '@tanstack/react-query';
import type { LearningProfile } from '@eduagent/schemas';
import {
  createScreenWrapper,
  createTestProfile,
  createRoutedMockFetch,
  type RoutedMockFetch,
} from '../test-utils/screen-render';
import type { Profile } from '../lib/profile';
import {
  useLearnerProfile,
  useChildLearnerProfile,
  useDeleteMemoryItem,
  useDeleteAllMemory,
  useToggleMemoryCollection,
  useToggleMemoryInjection,
  useGrantMemoryConsent,
  useTellMentor,
  useUnsuppressInference,
  useUpdateAccommodationMode,
} from './use-learner-profile';

// Real ProfileContext + real api-client (Clerk's useAuth is globally mocked in
// test-setup), driven by a routed mock fetch installed as globalThis.fetch.
// Per-call overrides via mockResolvedValueOnce take priority over the routed
// default, preserving the original canned-response test flow.
let mockFetch: RoutedMockFetch;
let queryClient: QueryClient;
let prevFetch: typeof globalThis.fetch;

const ownerProfile = createTestProfile({
  id: 'test-profile-id',
  isOwner: true,
});

beforeEach(() => {
  prevFetch = globalThis.fetch;
  mockFetch = createRoutedMockFetch();
  (globalThis as unknown as { fetch: typeof fetch }).fetch =
    mockFetch as unknown as typeof fetch;
});

afterEach(() => {
  (globalThis as unknown as { fetch: typeof fetch }).fetch = prevFetch;
});

function createWrapper(activeProfile: Profile | null = ownerProfile) {
  const w = createScreenWrapper({
    activeProfile,
    profiles: activeProfile ? [activeProfile] : [],
  });
  queryClient = w.queryClient;
  return w.wrapper;
}

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const LEARNING_PROFILE_ID = '00000000-0000-4000-8000-000000000001';
const OWNER_PROFILE_ID = '00000000-0000-4000-8000-000000000002';
const CHILD_PROFILE_ID = '00000000-0000-4000-8000-000000000003';

const mockLearningProfile: LearningProfile = {
  id: LEARNING_PROFILE_ID,
  profileId: OWNER_PROFILE_ID,
  learningStyle: null,
  interests: [],
  strengths: [],
  struggles: [],
  communicationNotes: [],
  suppressedInferences: [],
  interestTimestamps: {},
  effectivenessSessionCount: 0,
  memoryEnabled: true,
  memoryConsentStatus: 'granted',
  memoryCollectionEnabled: true,
  memoryInjectionEnabled: true,
  accommodationMode: 'none',
  recentlyResolvedTopics: [],
  version: 1,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

// ---------------------------------------------------------------------------
// useLearnerProfile
// ---------------------------------------------------------------------------

describe('useLearnerProfile', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    jest.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('fetches and returns the learning profile', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ profile: mockLearningProfile }), {
        status: 200,
      }),
    );

    const { result } = renderHook(() => useLearnerProfile(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data?.profileId).toBe(OWNER_PROFILE_ID);
    expect(result.current.data?.memoryCollectionEnabled).toBe(true);
  });

  it('propagates API errors into error state', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response('Internal server error', { status: 500 }),
    );

    const { result } = renderHook(() => useLearnerProfile(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error).toBeInstanceOf(Error);
  });

  it('is disabled when there is no active profile — no fetch fires', async () => {
    const { result } = renderHook(() => useLearnerProfile(), {
      wrapper: createWrapper(null),
    });

    await new Promise((r) => setTimeout(r, 50));
    // The hook is disabled (enabled: !!activeProfile), so fetchStatus stays idle
    expect(result.current.fetchStatus).toBe('idle');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('refetches after manual invalidation (retry behavior)', async () => {
    const firstProfile = { ...mockLearningProfile };
    const updatedProfile = {
      ...mockLearningProfile,
      memoryCollectionEnabled: false,
    };

    mockFetch
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ profile: firstProfile }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ profile: updatedProfile }), {
          status: 200,
        }),
      );

    const { result } = renderHook(() => useLearnerProfile(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data?.memoryCollectionEnabled).toBe(true);

    // Invalidate to trigger refetch
    await act(async () => {
      await queryClient.invalidateQueries({
        queryKey: ['learner-profile', 'test-profile-id'],
      });
    });

    await waitFor(() => {
      expect(result.current.data?.memoryCollectionEnabled).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// useChildLearnerProfile
// ---------------------------------------------------------------------------

describe('useChildLearnerProfile', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    jest.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('fetches and returns a child profile when owner and childProfileId are present', async () => {
    const childProfile = {
      ...mockLearningProfile,
      profileId: CHILD_PROFILE_ID,
    };

    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ profile: childProfile }), { status: 200 }),
    );

    const { result } = renderHook(
      () => useChildLearnerProfile('child-profile-id'),
      { wrapper: createWrapper() },
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data?.profileId).toBe(CHILD_PROFILE_ID);
  });

  it('is disabled when childProfileId is undefined — no fetch fires', async () => {
    const { result } = renderHook(() => useChildLearnerProfile(undefined), {
      wrapper: createWrapper(),
    });

    await new Promise((r) => setTimeout(r, 50));
    expect(result.current.fetchStatus).toBe('idle');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('is disabled when activeProfile is not owner — no fetch fires', async () => {
    const nonOwner = createTestProfile({
      id: 'test-profile-id',
      isOwner: false,
    });
    const { result } = renderHook(
      () => useChildLearnerProfile('child-profile-id'),
      { wrapper: createWrapper(nonOwner) },
    );

    await new Promise((r) => setTimeout(r, 50));
    // enabled: !!activeProfile && activeProfile.isOwner === true && !!childProfileId
    expect(result.current.fetchStatus).toBe('idle');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('propagates API errors', async () => {
    mockFetch.mockResolvedValueOnce(new Response('Forbidden', { status: 403 }));

    const { result } = renderHook(
      () => useChildLearnerProfile('child-profile-id'),
      { wrapper: createWrapper() },
    );

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// useDeleteMemoryItem
// ---------------------------------------------------------------------------

describe('useDeleteMemoryItem', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    jest.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('DELETEs a memory item for the active profile', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true }), { status: 200 }),
    );

    const { result } = renderHook(() => useDeleteMemoryItem(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate({
        category: 'learningStyle',
        value: 'prefers visual explanations',
      });
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data?.success).toBe(true);
  });

  it('DELETEs a memory item for a child profile', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true }), { status: 200 }),
    );

    const { result } = renderHook(() => useDeleteMemoryItem(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate({
        category: 'learningStyle',
        value: 'prefers visual explanations',
        childProfileId: 'child-profile-id',
      });
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    // Verify the child profile endpoint was called
    const [url] = mockFetch.mock.calls[0] as [string];
    expect(url).toContain('child-profile-id');
  });

  it('invalidates learner-profile cache after successful deletion', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true }), { status: 200 }),
    );

    const { result } = renderHook(() => useDeleteMemoryItem(), {
      wrapper: createWrapper(),
    });

    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

    await act(async () => {
      await result.current.mutateAsync({
        category: 'learningStyle',
        value: 'prefers visual explanations',
      });
    });

    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ['learner-profile', 'test-profile-id'],
      }),
    );
  });

  it('propagates API errors', async () => {
    mockFetch.mockResolvedValueOnce(new Response('Not found', { status: 404 }));

    const { result } = renderHook(() => useDeleteMemoryItem(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate({ category: 'interests', value: 'gone' });
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// useDeleteAllMemory
// ---------------------------------------------------------------------------

describe('useDeleteAllMemory', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    jest.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('DELETEs all memory for the active profile', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true }), { status: 200 }),
    );

    const { result } = renderHook(() => useDeleteAllMemory(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate({});
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
  });

  it('DELETEs all memory for a child profile', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true }), { status: 200 }),
    );

    const { result } = renderHook(() => useDeleteAllMemory(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate({ childProfileId: 'child-profile-id' });
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    const [url] = mockFetch.mock.calls[0] as [string];
    expect(url).toContain('child-profile-id');
  });

  it('invalidates learner-profile cache after deletion', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true }), { status: 200 }),
    );

    const { result } = renderHook(() => useDeleteAllMemory(), {
      wrapper: createWrapper(),
    });

    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

    await act(async () => {
      await result.current.mutateAsync({});
    });

    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ['learner-profile', 'test-profile-id'],
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// useToggleMemoryCollection
// ---------------------------------------------------------------------------

describe('useToggleMemoryCollection', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    jest.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('PATCHes collection toggle for a child profile', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true }), { status: 200 }),
    );

    const { result } = renderHook(() => useToggleMemoryCollection(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate({
        memoryCollectionEnabled: true,
        childProfileId: 'child-profile-id',
      });
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    const [url] = mockFetch.mock.calls[0] as [string];
    expect(url).toContain('child-profile-id');
  });

  it('propagates API errors', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response('Internal error', { status: 500 }),
    );

    const { result } = renderHook(() => useToggleMemoryCollection(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate({
        memoryCollectionEnabled: false,
        childProfileId: 'child-profile-id',
      });
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// useToggleMemoryInjection
// ---------------------------------------------------------------------------

describe('useToggleMemoryInjection', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    jest.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('PATCHes injection toggle for the active profile', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true }), { status: 200 }),
    );

    const { result } = renderHook(() => useToggleMemoryInjection(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate({ memoryInjectionEnabled: false });
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    const [, fetchInit] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(fetchInit.body as string) as Record<
      string,
      unknown
    >;
    expect(body.memoryInjectionEnabled).toBe(false);
  });

  it('propagates API errors', async () => {
    mockFetch.mockResolvedValueOnce(new Response('Forbidden', { status: 403 }));

    const { result } = renderHook(() => useToggleMemoryInjection(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate({ memoryInjectionEnabled: true });
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// useGrantMemoryConsent
// ---------------------------------------------------------------------------

describe('useGrantMemoryConsent', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    jest.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('POSTs consent granted for the active profile', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true }), { status: 200 }),
    );

    const { result } = renderHook(() => useGrantMemoryConsent(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate({ consent: 'granted' });
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    const [, fetchInit] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(fetchInit.body as string) as Record<
      string,
      unknown
    >;
    expect(body.consent).toBe('granted');
  });

  it('POSTs consent declined for a child profile', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true }), { status: 200 }),
    );

    const { result } = renderHook(() => useGrantMemoryConsent(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate({
        consent: 'declined',
        childProfileId: 'child-profile-id',
      });
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    const [url] = mockFetch.mock.calls[0] as [string];
    expect(url).toContain('child-profile-id');
  });
});

// ---------------------------------------------------------------------------
// useTellMentor
// ---------------------------------------------------------------------------

describe('useTellMentor', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    jest.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('POSTs text to the mentor tell endpoint and returns updated fields', async () => {
    const responsePayload = {
      success: true,
      message: 'Profile updated.',
      fieldsUpdated: ['prefers_visual_explanations'],
    };

    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(responsePayload), { status: 200 }),
    );

    const { result } = renderHook(() => useTellMentor(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate({ text: 'I prefer visual explanations' });
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data?.fieldsUpdated).toContain(
      'prefers_visual_explanations',
    );
  });

  it('POSTs to the child profile endpoint when childProfileId is provided', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ success: true, message: 'OK', fieldsUpdated: [] }),
        { status: 200 },
      ),
    );

    const { result } = renderHook(() => useTellMentor(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate({
        text: 'She prefers audio',
        childProfileId: 'child-profile-id',
      });
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    const [url] = mockFetch.mock.calls[0] as [string];
    expect(url).toContain('child-profile-id');
  });

  it('propagates API errors', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response('Unprocessable', { status: 422 }),
    );

    const { result } = renderHook(() => useTellMentor(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate({ text: '' });
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// useUnsuppressInference
// ---------------------------------------------------------------------------

describe('useUnsuppressInference', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    jest.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('POSTs to unsuppress endpoint for the active profile', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true }), { status: 200 }),
    );

    const { result } = renderHook(() => useUnsuppressInference(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate({ value: 'prefers_visual_explanations' });
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    const [, fetchInit] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(fetchInit.body as string) as Record<
      string,
      unknown
    >;
    expect(body.value).toBe('prefers_visual_explanations');
  });

  it('propagates API errors', async () => {
    mockFetch.mockResolvedValueOnce(new Response('Not found', { status: 404 }));

    const { result } = renderHook(() => useUnsuppressInference(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate({ value: 'gone' });
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// useUpdateAccommodationMode
// ---------------------------------------------------------------------------

describe('useUpdateAccommodationMode', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    jest.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('PATCHes accommodation-mode for the active profile', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true }), { status: 200 }),
    );

    const { result } = renderHook(() => useUpdateAccommodationMode(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate({ accommodationMode: 'short-burst' });
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    const [, fetchInit] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(fetchInit.body as string) as Record<
      string,
      unknown
    >;
    expect(body.accommodationMode).toBe('short-burst');
  });

  it('PATCHes accommodation-mode for a child profile', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true }), { status: 200 }),
    );

    const { result } = renderHook(() => useUpdateAccommodationMode(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate({
        accommodationMode: 'short-burst',
        childProfileId: 'child-profile-id',
      });
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    const [url] = mockFetch.mock.calls[0] as [string];
    expect(url).toContain('child-profile-id');
  });

  it('invalidates learner-profile after successful update', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true }), { status: 200 }),
    );

    const { result } = renderHook(() => useUpdateAccommodationMode(), {
      wrapper: createWrapper(),
    });

    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

    await act(async () => {
      await result.current.mutateAsync({ accommodationMode: 'none' });
    });

    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ['learner-profile', 'test-profile-id'],
      }),
    );
  });

  it('propagates API errors', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response('Bad request', { status: 400 }),
    );

    const { result } = renderHook(() => useUpdateAccommodationMode(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate({ accommodationMode: 'none' });
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
  });
});
