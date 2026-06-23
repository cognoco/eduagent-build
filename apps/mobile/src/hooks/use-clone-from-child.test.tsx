import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createTestProfile,
  getRequestJsonBody,
} from '../test-utils/app-hook-test-utils';
import { setActiveProfileId } from '../lib/api-client';
import { ProfileContext, type ProfileContextValue } from '../lib/profile';
import {
  triggerSurface,
  useCloneFromChild,
  type BridgeTriggerSurface,
  type CloneFromChildArgs,
} from './use-clone-from-child';

const mockFetch = jest.fn();
const mockPush = jest.fn();
const mockRandomUUID = jest.fn();
const mockTrack = jest.fn();
const mockHashProfileId = jest.fn((profileId: string) => `hash:${profileId}`);

jest.mock('@clerk/clerk-expo', () => ({
  useAuth: () => ({ getToken: jest.fn(async () => 'test-token') }),
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('expo-crypto', () => ({
  randomUUID: () => mockRandomUUID(),
}));

jest.mock(
  '../lib/analytics' /* gc1-allow: hook test isolates analytics side effects while exercising API/navigation behavior */,
  () => ({
    hashProfileId: (...args: [string]) => mockHashProfileId(...args),
    track: (...args: unknown[]) => mockTrack(...args),
  }),
);

const originalFetch = globalThis.fetch;

const ADULT_PROFILE_ID = '550e8400-e29b-41d4-a716-446655440010';
const CHILD_PROFILE_ID = '550e8400-e29b-41d4-a716-446655440011';
const TOPIC_ID = '550e8400-e29b-41d4-a716-446655440012';
const SUBJECT_ID = '550e8400-e29b-41d4-a716-446655440013';
const REQUEST_ID = '550e8400-e29b-41d4-a716-446655440014';
const FORCE_REQUEST_ID = '550e8400-e29b-41d4-a716-446655440015';

let queryClient: QueryClient;

function createWrapper() {
  queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { gcTime: 0 },
    },
  });

  const activeProfile = createTestProfile({
    id: ADULT_PROFILE_ID,
    birthYear: 1985,
    isOwner: true,
  });
  const profileContextValue: ProfileContextValue = {
    profiles: [activeProfile],
    activeProfile,
    isExplicitProxyMode: false,
    switchProfile: async () => ({ success: true }),
    isLoading: false,
    profileLoadError: null,
    profileWasRemoved: false,
    acknowledgeProfileRemoval: () => undefined,
  };

  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <ProfileContext.Provider value={profileContextValue}>
          {children}
        </ProfileContext.Provider>
      </QueryClientProvider>
    );
  };
}

function cloneArgs(
  overrides: Partial<CloneFromChildArgs> = {},
): CloneFromChildArgs {
  return {
    childProfileId: CHILD_PROFILE_ID,
    topicId: TOPIC_ID,
    topicTitle: 'Fractions',
    subjectName: 'Math',
    childDisplayName: 'Ada',
    triggerPath: `/child/${CHILD_PROFILE_ID}/curriculum`,
    ...overrides,
  };
}

function cloneResponse(
  overrides: Partial<{
    topicId: string;
    subjectId: string;
    alreadyExisted: boolean;
    descriptionDivergent: boolean;
    descriptionRefreshed: boolean;
    topicState: 'unstarted' | 'in_progress' | 'completed';
    createdIds: { topicId?: string; bookId?: string; subjectId?: string };
  }> = {},
) {
  return {
    topicId: TOPIC_ID,
    subjectId: SUBJECT_ID,
    alreadyExisted: false,
    descriptionDivergent: false,
    descriptionRefreshed: false,
    topicState: 'unstarted' as const,
    createdIds: { topicId: TOPIC_ID },
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockFetch.mockReset();
  mockRandomUUID.mockReset();
  globalThis.fetch = mockFetch as typeof fetch;
  setActiveProfileId(ADULT_PROFILE_ID);
});

afterEach(() => {
  queryClient?.clear();
  setActiveProfileId(undefined);
});

afterAll(() => {
  globalThis.fetch = originalFetch;
});

describe('useCloneFromChild', () => {
  it('posts the clone request and opens relearn with child provenance params', async () => {
    mockRandomUUID.mockReturnValueOnce(REQUEST_ID);
    mockFetch.mockResolvedValueOnce(jsonResponse(cloneResponse()));

    const { result } = renderHook(() => useCloneFromChild(), {
      wrapper: createWrapper(),
    });

    act(() => result.current.cloneFromChild(cloneArgs()));

    await waitFor(() => {
      expect(result.current.toast?.message).toBe(
        'Added "Fractions" to your Math.',
      );
    });

    expect(getRequestJsonBody(mockFetch, 0)).toMatchObject({
      childProfileId: CHILD_PROFILE_ID,
      topicId: TOPIC_ID,
      requestId: REQUEST_ID,
    });
    expect(mockTrack).toHaveBeenCalledWith(
      'add_to_my_learning.bridge',
      expect.objectContaining({
        adultProfileHash: `hash:${ADULT_PROFILE_ID}`,
        childProfileHash: `hash:${CHILD_PROFILE_ID}`,
        triggerSurface: 'child_curriculum_detail',
      }),
    );

    act(() => result.current.toast?.primaryAction?.onPress());

    expect(mockPush).toHaveBeenCalledTimes(2);
    expect(mockPush).toHaveBeenNthCalledWith(
      1,
      `/(app)/child/${CHILD_PROFILE_ID}/curriculum`,
    );
    expect(mockPush).toHaveBeenNthCalledWith(2, {
      pathname: '/(app)/topic/relearn',
      params: {
        childProfileId: CHILD_PROFILE_ID,
        topicId: TOPIC_ID,
        subjectId: SUBJECT_ID,
        topicName: 'Fractions',
        subjectName: 'Math',
        returnTo: 'family-children',
        returnId: CHILD_PROFILE_ID,
        source: 'parent_bridge',
      },
    });
  });

  it.each([
    {
      name: 'in-progress topic',
      response: cloneResponse({
        alreadyExisted: true,
        topicState: 'in_progress',
        createdIds: {},
      }),
      expectedMessage: '"Fractions" is in your Math - you\'re working on it.',
      expectedActionLabel: 'Resume',
    },
    {
      name: 'completed topic',
      response: cloneResponse({
        alreadyExisted: true,
        topicState: 'completed',
        createdIds: {},
      }),
      expectedMessage: 'You\'ve already learned "Fractions".',
      expectedActionLabel: 'Review',
    },
    {
      name: 'refreshed unstarted topic',
      response: cloneResponse({
        alreadyExisted: true,
        descriptionRefreshed: true,
        createdIds: {},
      }),
      expectedMessage:
        'Updated "Fractions" in your Math with their latest version.',
      expectedActionLabel: 'Open',
    },
    {
      name: 'same existing topic',
      response: cloneResponse({
        alreadyExisted: true,
        createdIds: {},
      }),
      expectedMessage: '"Fractions" is already in your Math.',
      expectedActionLabel: 'Open',
    },
  ])('surfaces the right toast for $name', async (scenario) => {
    mockRandomUUID.mockReturnValueOnce(REQUEST_ID);
    mockFetch.mockResolvedValueOnce(jsonResponse(scenario.response));

    const { result } = renderHook(() => useCloneFromChild(), {
      wrapper: createWrapper(),
    });

    act(() => result.current.cloneFromChild(cloneArgs()));

    await waitFor(() => {
      expect(result.current.toast?.message).toBe(scenario.expectedMessage);
    });
    expect(result.current.toast?.primaryAction?.label).toBe(
      scenario.expectedActionLabel,
    );
  });

  it('offers force-copy when the adult copy diverges from the child version', async () => {
    mockRandomUUID
      .mockReturnValueOnce(REQUEST_ID)
      .mockReturnValueOnce(FORCE_REQUEST_ID);
    mockFetch
      .mockResolvedValueOnce(
        jsonResponse(
          cloneResponse({
            alreadyExisted: true,
            descriptionDivergent: true,
            topicState: 'in_progress',
            createdIds: {},
          }),
        ),
      )
      .mockResolvedValueOnce(
        jsonResponse(
          cloneResponse({
            topicId: '550e8400-e29b-41d4-a716-446655440016',
            createdIds: { topicId: '550e8400-e29b-41d4-a716-446655440016' },
          }),
        ),
      );

    const { result } = renderHook(() => useCloneFromChild(), {
      wrapper: createWrapper(),
    });

    act(() => result.current.cloneFromChild(cloneArgs()));

    await waitFor(() => {
      expect(result.current.toast?.secondaryAction?.label).toBe(
        'Add separate copy',
      );
    });

    act(() => result.current.toast?.secondaryAction?.onPress());

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
    expect(getRequestJsonBody(mockFetch, 1)).toMatchObject({
      childProfileId: CHILD_PROFILE_ID,
      topicId: TOPIC_ID,
      forceCopy: true,
      requestId: FORCE_REQUEST_ID,
    });
  });

  it('shows not-found errors without exposing raw API details', async () => {
    mockRandomUUID.mockReturnValueOnce(REQUEST_ID);
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ code: 'NOT_FOUND', message: 'Topic not found' }, 404),
    );

    const { result } = renderHook(() => useCloneFromChild(), {
      wrapper: createWrapper(),
    });

    act(() => result.current.cloneFromChild(cloneArgs()));

    await waitFor(() => {
      expect(result.current.toast).toMatchObject({
        kind: 'error',
        message: 'This topic is no longer available.',
      });
      // Assertion inside waitFor: React Query commits state in multiple
      // renders and the primaryAction is appended in the same commit as the
      // message — but reading it outside waitFor races the commit.
      expect(result.current.toast?.primaryAction?.testID).toBe(
        'clone-toast-back-not-found',
      );
    });
  });

  it('surfaces an upgrade CTA when the adult hits their monthly quota', async () => {
    mockRandomUUID.mockReturnValueOnce(REQUEST_ID);
    mockFetch.mockResolvedValueOnce(
      jsonResponse(
        {
          code: 'QUOTA_EXCEEDED',
          message: 'Quota exceeded',
          details: {
            tier: 'free',
            effectiveAccessTier: 'free',
            quotaModel: 'per-profile',
            profileRole: 'owner',
            reason: 'monthly',
            resetsAt: '2026-05-27T01:00:00.000Z',
            monthlyLimit: 100,
            usedThisMonth: 100,
            dailyLimit: 10,
            usedToday: 5,
            topUpCreditsRemaining: 0,
            upgradeOptions: [],
          },
        },
        402,
      ),
    );

    const { result } = renderHook(() => useCloneFromChild(), {
      wrapper: createWrapper(),
    });

    act(() => result.current.cloneFromChild(cloneArgs()));

    await waitFor(() => {
      expect(result.current.toast?.kind).toBe('error');
    });
    expect(result.current.toast?.primaryAction?.testID).toBe(
      'clone-toast-upgrade',
    );

    act(() => result.current.toast?.primaryAction?.onPress());
    expect(mockPush).toHaveBeenCalledWith('/(app)/subscription');
  });

  it('surfaces a Family CTA when the link to the child is revoked (Forbidden)', async () => {
    mockRandomUUID.mockReturnValueOnce(REQUEST_ID);
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ code: 'FORBIDDEN', message: 'No access' }, 403),
    );

    const { result } = renderHook(() => useCloneFromChild(), {
      wrapper: createWrapper(),
    });

    act(() => result.current.cloneFromChild(cloneArgs()));

    await waitFor(() => {
      expect(result.current.toast?.kind).toBe('error');
    });
    expect(result.current.toast?.primaryAction?.testID).toBe(
      'clone-toast-open-family',
    );

    act(() => result.current.toast?.primaryAction?.onPress());
    expect(mockPush).toHaveBeenCalledWith('/(app)/progress');
  });

  it('passes returnTo=family-recaps when the bridge tap originates from a recap detail', async () => {
    const RECAP_ID = 'recap-abc-123';
    mockRandomUUID.mockReturnValueOnce(REQUEST_ID);
    mockFetch.mockResolvedValueOnce(jsonResponse(cloneResponse()));

    const { result } = renderHook(() => useCloneFromChild(), {
      wrapper: createWrapper(),
    });

    act(() =>
      result.current.cloneFromChild(
        cloneArgs({ triggerPath: `/recaps/${RECAP_ID}` }),
      ),
    );

    await waitFor(() => {
      expect(result.current.toast?.primaryAction?.testID).toBe(
        'clone-toast-open',
      );
    });

    act(() => result.current.toast?.primaryAction?.onPress());

    expect(mockPush).toHaveBeenCalledWith(
      expect.objectContaining({
        pathname: '/(app)/topic/relearn',
        params: expect.objectContaining({
          returnTo: 'family-recaps',
          returnId: RECAP_ID,
          source: 'parent_bridge',
        }),
      }),
    );
    expect(mockTrack).toHaveBeenCalledWith(
      'add_to_my_learning.bridge',
      expect.objectContaining({ triggerSurface: 'recaps_detail' }),
    );
  });

  it('keeps the open action when undo fails because a session already started', async () => {
    mockRandomUUID.mockReturnValueOnce(REQUEST_ID);
    mockFetch
      .mockResolvedValueOnce(jsonResponse(cloneResponse()))
      .mockResolvedValueOnce(
        jsonResponse({
          deleted: { topic: false },
          reason: 'session_started',
        }),
      );

    const { result } = renderHook(() => useCloneFromChild(), {
      wrapper: createWrapper(),
    });

    act(() => result.current.cloneFromChild(cloneArgs()));

    await waitFor(() => {
      expect(result.current.toast?.secondaryAction?.label).toBe('Undo');
    });

    act(() => result.current.toast?.secondaryAction?.onPress());

    await waitFor(() => {
      expect(result.current.toast).toMatchObject({
        kind: 'error',
        message: "Couldn't undo - you've already opened this topic.",
      });
    });

    act(() => result.current.toast?.primaryAction?.onPress());

    expect(mockPush).toHaveBeenCalledWith(
      expect.objectContaining({
        pathname: '/(app)/topic/relearn',
        params: expect.objectContaining({
          childProfileId: CHILD_PROFILE_ID,
          topicId: TOPIC_ID,
          subjectId: SUBJECT_ID,
          source: 'parent_bridge',
        }),
      }),
    );
  });

  // BUG-775: AddToMyLearningButton's press handler hangs forever on web when
  // the clone POST never resolves (Playwright observes a 45s timeout, the
  // spinner stays spinning, no toast appears). The fix attaches the default
  // 12s abort signal from query-timeout.ts to the mutation fetch so a stalled
  // request aborts and the mutation routes to onError with a retry toast.
  it('passes an AbortSignal to the clone fetch so a stalled request does not hang forever', async () => {
    mockRandomUUID.mockReturnValueOnce(REQUEST_ID);
    mockFetch.mockResolvedValueOnce(jsonResponse(cloneResponse()));

    const { result } = renderHook(() => useCloneFromChild(), {
      wrapper: createWrapper(),
    });

    act(() => result.current.cloneFromChild(cloneArgs()));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    const init = mockFetch.mock.calls[0]?.[1];
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });
});

// ---------------------------------------------------------------------------
// Trigger-surface path-to-surface mapping
//
// The analytics consumer slices bridge taps by `triggerSurface`. The union
// is exported so callers (entry-surface screens) can construct typed
// triggerPaths, and so adding a new entry surface forces an exhaustive
// update here — silent drift to a new string would break every dashboard
// downstream.
// ---------------------------------------------------------------------------

describe('triggerSurface', () => {
  const cases: Array<{
    label: string;
    triggerPath: string;
    expected: BridgeTriggerSurface;
  }> = [
    {
      label: 'recaps detail screen',
      triggerPath: '/recaps/abc-123',
      expected: 'recaps_detail',
    },
    {
      label: 'child curriculum detail',
      triggerPath: `/child/${CHILD_PROFILE_ID}/curriculum/subj-1`,
      expected: 'child_curriculum_detail',
    },
    {
      label: 'child curriculum landing (trailing /curriculum)',
      triggerPath: `/child/${CHILD_PROFILE_ID}/curriculum`,
      expected: 'child_curriculum_detail',
    },
    {
      label: 'child topic detail',
      triggerPath: `/child/${CHILD_PROFILE_ID}/topic/topic-9`,
      expected: 'child_curriculum_detail',
    },
    {
      label: 'child session detail',
      triggerPath: `/child/${CHILD_PROFILE_ID}/session/sess-9`,
      expected: 'child_session_detail',
    },
    {
      label: 'family progress (top level)',
      triggerPath: '/progress',
      expected: 'family_progress',
    },
    {
      label: 'family progress (deep)',
      triggerPath: '/progress/children',
      expected: 'family_progress',
    },
    {
      label: 'child detail fallback',
      triggerPath: `/child/${CHILD_PROFILE_ID}`,
      expected: 'family_child',
    },
    {
      label: 'unknown surface defaults to family_child',
      triggerPath: '/some/other/path',
      expected: 'family_child',
    },
  ];

  it.each(cases)('maps $label to $expected', ({ triggerPath, expected }) => {
    expect(triggerSurface(triggerPath)).toBe(expected);
  });

  it('return type is the BridgeTriggerSurface union (compile-time check)', () => {
    // Type-level guard: if the union widens to `string`, the assignment
    // below becomes lossless and we lose the exhaustiveness signal. The
    // runtime check is incidental — the real value is the typed assignment.
    const surface: BridgeTriggerSurface = triggerSurface('/recaps/x');
    expect(surface).toBe('recaps_detail');
  });
});
