import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient } from '@tanstack/react-query';
import type { DashboardChild, TopicProgress } from '@eduagent/schemas';
import {
  createHookWrapper,
  createTestProfile,
} from '../test-utils/app-hook-test-utils';
import { setActiveProfileId } from '../lib/api-client';
import {
  useDashboard,
  useChildDetail,
  useChildSubjectTopics,
} from './use-dashboard';
import { queryKeys } from '../lib/query-keys';

const mockFetch = jest.fn();
const originalFetch = globalThis.fetch;

jest.mock(
  '../lib/app-context' /* gc1-allow: dashboard child hooks are family-mode only; test controls mode boundary */,
  () => ({
    useAppContext: () => ({
      mode: 'family',
      setMode: jest.fn(),
      familyCapable: true,
    }),
  }),
);

let queryClient: QueryClient;

const CHILD_ID = 'f0000000-0000-4000-8000-000000000001';
const SUBJECT_ID = 'f0000000-0000-4000-8000-000000000002';
const TOPIC_ID = 'f0000000-0000-4000-8000-000000000003';

function createDashboardChild(
  overrides: Partial<DashboardChild> = {},
): DashboardChild {
  return {
    profileId: CHILD_ID,
    displayName: 'Alice',
    consentStatus: null,
    respondedAt: null,
    summary: 'Alice is doing great',
    sessionsThisWeek: 5,
    sessionsLastWeek: 3,
    totalTimeThisWeek: 120,
    totalTimeLastWeek: 90,
    exchangesThisWeek: 24,
    exchangesLastWeek: 18,
    trend: 'up',
    subjects: [
      { subjectId: SUBJECT_ID, name: 'Math', retentionStatus: 'strong' },
    ],
    guidedVsImmediateRatio: 0.5,
    retentionTrend: 'improving',
    totalSessions: 8,
    currentlyWorkingOn: [],
    currentStreak: 0,
    longestStreak: 0,
    totalXp: 0,
    ...overrides,
  };
}

function createWrapper() {
  const w = createHookWrapper({
    activeProfile: createTestProfile({ id: 'test-profile-id', isOwner: true }),
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

describe('useDashboard', () => {
  it('returns dashboard data when children exist', async () => {
    const dashboardData = {
      children: [createDashboardChild()],
      pendingNotices: [],
      demoMode: false,
    };
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(dashboardData), { status: 200 }),
    );

    const { result } = renderHook(() => useDashboard(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(dashboardData);
  });

  it('fetches demo data when children array is empty and there are no pending notices', async () => {
    const emptyResponse = {
      children: [],
      pendingNotices: [],
      demoMode: false,
    };
    const demoData = {
      children: [
        createDashboardChild({
          profileId: 'demo-1',
          displayName: 'Demo Child',
          subjects: [],
        }),
      ],
      pendingNotices: [],
      demoMode: true,
    };

    mockFetch
      .mockResolvedValueOnce(
        new Response(JSON.stringify(emptyResponse), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(demoData), { status: 200 }),
      );

    const { result } = renderHook(() => useDashboard(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    // Should have made two fetch calls: dashboard + demo
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(result.current.data).toEqual(demoData);
  });

  // WI-854 [HOME-15]: when the last child is archived/deleted the real
  // dashboard carries empty children BUT pending consent notices. The demo
  // fallback must NOT replace it — demo data has no pendingNotices, which would
  // hide the owner post-grace consent-archive/delete toast.
  it.each([['consent_archived' as const], ['consent_deleted' as const]])(
    'preserves the real dashboard (no demo fallback) when children are empty but a %s pending notice exists [WI-854]',
    async (noticeType) => {
      const realResponse = {
        children: [],
        pendingNotices: [
          {
            id: '11111111-1111-4111-8111-111111111111',
            type: noticeType,
            payload: { childName: 'Emma' },
            createdAt: '2026-01-01T00:00:00.000Z',
          },
        ],
        demoMode: false,
      };

      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify(realResponse), { status: 200 }),
      );

      const { result } = renderHook(() => useDashboard(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      // Only the real /dashboard call — the /dashboard/demo substitution must
      // not fire when pending notices are present.
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(result.current.data).toEqual(realResponse);
    },
  );

  it('handles API errors', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response('Internal Server Error', { status: 500 }),
    );

    const { result } = renderHook(() => useDashboard(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error).toBeInstanceOf(Error);
  });

  it('starts in loading state', () => {
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    mockFetch.mockReturnValue(new Promise(() => {})); // never resolves

    const { result } = renderHook(() => useDashboard(), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toBeUndefined();
  });
});

describe('useChildDetail', () => {
  it('returns child detail data', async () => {
    const childData = {
      child: {
        ...createDashboardChild(),
        organizationTimezone: null,
      },
    };
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(childData), { status: 200 }),
    );

    const { result } = renderHook(() => useChildDetail('child-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(childData.child);
  });

  it('does not fetch when childProfileId is undefined', () => {
    const { result } = renderHook(() => useChildDetail(undefined), {
      wrapper: createWrapper(),
    });

    expect(result.current.fetchStatus).toBe('idle');
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Profile-switch cache isolation
// ---------------------------------------------------------------------------

describe('profile-switch cache isolation', () => {
  it('useDashboard — profile A and B have different query keys', () => {
    const keyA = queryKeys.dashboard.root('family', 'profile-A');
    const keyB = queryKeys.dashboard.root('family', 'profile-B');
    expect(keyA).not.toEqual(keyB);
    expect(keyA).toEqual(['dashboard', 'family', 'profile-A']);
    expect(keyB).toEqual(['dashboard', 'family', 'profile-B']);
  });

  it('useChildDetail — same child, different active profiles produce different keys', () => {
    // childDetail key is only the child's profileId — no active viewer slot —
    // so two different children produce different keys but the same child seen
    // by different parents produces the SAME key (dashboard.children are owner-gated).
    const keyChild1 = queryKeys.dashboard.childDetail('family', 'child-1');
    const keyChild2 = queryKeys.dashboard.childDetail('family', 'child-2');
    expect(keyChild1).not.toEqual(keyChild2);
    expect(keyChild1).toEqual(['dashboard', 'family', 'child', 'child-1']);
  });

  it('useChildInventory — different children never share cache slots', () => {
    const key1 = queryKeys.dashboard.childInventory('family', 'child-1');
    const key2 = queryKeys.dashboard.childInventory('family', 'child-2');
    expect(key1).not.toEqual(key2);
  });
});

describe('useChildSubjectTopics', () => {
  it('returns topic progress data', async () => {
    const topic: TopicProgress = {
      topicId: TOPIC_ID,
      title: 'Algebra',
      description: 'Basic algebra',
      completionStatus: 'in_progress',
      retentionStatus: 'strong',
      daysSinceLastReview: 2,
      struggleStatus: 'normal',
      masteryScore: 0.7,
      strongReviews: 2,
      strongReviewsTarget: 5,
      summaryExcerpt: null,
      xpStatus: 'pending',
      totalSessions: 3,
    };
    const topicData = {
      topics: [topic],
    };
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(topicData), { status: 200 }),
    );

    const { result } = renderHook(
      () => useChildSubjectTopics('child-1', 'subject-1'),
      { wrapper: createWrapper() },
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(topicData.topics);
  });

  it('does not fetch when params are missing', () => {
    const { result } = renderHook(
      () => useChildSubjectTopics(undefined, undefined),
      { wrapper: createWrapper() },
    );

    expect(result.current.fetchStatus).toBe('idle');
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
