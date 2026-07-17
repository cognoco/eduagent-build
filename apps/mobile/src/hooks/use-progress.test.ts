import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient } from '@tanstack/react-query';
import { act } from 'react';
import {
  createHookWrapper,
  createTestProfile,
} from '../test-utils/app-hook-test-utils';
import {
  ForbiddenError,
  setActiveProfileId,
  UpstreamError,
} from '../lib/api-client';
import {
  invalidateProgressSnapshotQueries,
  useSubjectProgress,
  useOverallProgress,
  useContinueSuggestion,
  useLearningResumeTarget,
  useReviewSummary,
  useOverdueTopics,
  useTopicProgress,
  useProfileWeeklyReports,
  useChildWeeklyReports,
  useRefreshProgressSnapshot,
} from './use-progress';
import { queryKeys } from '../lib/query-keys';

jest.mock(
  '../lib/app-context' /* gc1-allow: progress hooks need deterministic mode state without AppContextProvider */,
  () => ({
    useAppContext: () => ({
      mode: null,
      setMode: jest.fn(),
      familyCapable: false,
    }),
  }),
);

// [CR-2026-05-19-H27] Mock the external Sentry boundary so the break test
// below can assert captureException was called (not console.warn).
jest.mock('@sentry/react-native', () => ({
  captureMessage: jest.fn(),
  captureException: jest.fn(),
  init: jest.fn(),
  getCurrentScope: jest.fn(() => ({ clear: jest.fn() })),
  setUser: jest.fn(),
  getClient: jest.fn(),
}));

const mockFetch = jest.fn();

let queryClient: QueryClient;
const originalFetch = globalThis.fetch;
const SUBJECT_ID = '550e8400-e29b-41d4-a716-446655440000';
const TOPIC_ID = '770e8400-e29b-41d4-a716-446655440000';
const SESSION_ID = '880e8400-e29b-41d4-a716-446655440000';

function makeProgressMetrics() {
  return {
    totalSessions: 1,
    totalActiveMinutes: 10,
    totalWallClockMinutes: 12,
    totalExchanges: 4,
    topicsAttempted: 1,
    topicsMastered: 0,
    topicsInProgress: 1,
    booksCompleted: 0,
    vocabularyTotal: 0,
    vocabularyMastered: 0,
    vocabularyLearning: 0,
    vocabularyNew: 0,
    retentionCardsDue: 0,
    retentionCardsStrong: 0,
    retentionCardsFading: 0,
    currentStreak: 1,
    longestStreak: 1,
    subjects: [],
  };
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

function getMockFetchUrl(callIndex = 0): string {
  const input = mockFetch.mock.calls[callIndex]?.[0] as RequestInfo | URL;
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function getMockFetchHeaders(callIndex = 0): Headers {
  const init = mockFetch.mock.calls[callIndex]?.[1] as RequestInit | undefined;
  return new Headers(init?.headers);
}

function createWrapper() {
  const w = createHookWrapper({
    activeProfile: createTestProfile({ id: 'test-profile-id' }),
  });
  queryClient = w.queryClient;
  return w.wrapper;
}

function createFamilyOwnerWrapper() {
  const ownerProfile = createTestProfile({
    id: 'owner-profile-id',
    isOwner: true,
    birthYear: 1985,
    hasFamilyLinks: true,
    defaultAppContext: 'family',
  });
  const childProfile = createTestProfile({
    id: 'child-profile-id',
    isOwner: false,
    accountId: ownerProfile.accountId,
  });
  const w = createHookWrapper({
    activeProfile: ownerProfile,
    profiles: [ownerProfile, childProfile],
  });
  queryClient = w.queryClient;
  return w.wrapper;
}

describe('useSubjectProgress', () => {
  it('fetches subject progress from API', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          progress: {
            subjectId: SUBJECT_ID,
            name: 'Mathematics',
            topicsTotal: 10,
            topicsCompleted: 3,
            topicsVerified: 1,
            topicsMastered: 1,
            topicsLearning: 2,
            urgencyScore: 0,
            retentionStatus: 'strong',
            lastSessionAt: null,
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const { result } = renderHook(() => useSubjectProgress(SUBJECT_ID), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockFetch).toHaveBeenCalled();
    expect(getMockFetchHeaders().get('X-Profile-Id')).toBe('test-profile-id');
    expect(result.current.data?.name).toBe('Mathematics');
    expect(result.current.data?.topicsTotal).toBe(10);
  });

  it('classifies HTTP errors through the real API client', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          code: 'SUBJECT_INACTIVE',
          message: 'Subject is archived',
        }),
        { status: 403, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const { result } = renderHook(() => useSubjectProgress(SUBJECT_ID), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error).toBeInstanceOf(ForbiddenError);
    expect((result.current.error as ForbiddenError).apiCode).toBe(
      'SUBJECT_INACTIVE',
    );
  });

  it('classifies server errors through the real API client', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          code: 'INTERNAL_ERROR',
          message: 'Internal Server Error',
        }),
        { status: 500, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const { result } = renderHook(() => useSubjectProgress(SUBJECT_ID), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error).toBeInstanceOf(UpstreamError);
    expect(result.current.error).toMatchObject({
      code: 'INTERNAL_ERROR',
      message: 'Internal Server Error',
      status: 500,
    });
  });
});

describe('useOverallProgress', () => {
  it('fetches overall progress from API', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          subjects: [
            {
              subjectId: SUBJECT_ID,
              name: 'Math',
              topicsTotal: 5,
              topicsCompleted: 2,
              topicsVerified: 1,
              topicsMastered: 1,
              topicsLearning: 1,
              urgencyScore: 0,
              retentionStatus: 'strong',
              lastSessionAt: null,
            },
          ],
          totalTopicsCompleted: 2,
          totalTopicsVerified: 1,
          totalTopicsMastered: 1,
          totalTopicsLearning: 1,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const { result } = renderHook(() => useOverallProgress(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockFetch).toHaveBeenCalled();
    expect(result.current.data?.totalTopicsCompleted).toBe(2);
  });
});

describe('useContinueSuggestion', () => {
  it('fetches continue suggestion from API', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          suggestion: {
            subjectId: SUBJECT_ID,
            subjectName: 'Math',
            topicId: TOPIC_ID,
            topicTitle: 'Algebra',
            lastSessionId: SESSION_ID,
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const { result } = renderHook(() => useContinueSuggestion(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockFetch).toHaveBeenCalled();
    expect(result.current.data?.topicTitle).toBe('Algebra');
  });

  it('returns null when no suggestion', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ suggestion: null }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const { result } = renderHook(() => useContinueSuggestion(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toBeNull();
  });
});

describe('useLearningResumeTarget', () => {
  it('fetches resume target with optional scope', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          target: {
            subjectId: '550e8400-e29b-41d4-a716-446655440000',
            subjectName: 'Biology',
            topicId: '770e8400-e29b-41d4-a716-446655440000',
            topicTitle: 'Photosynthesis',
            sessionId: null,
            resumeFromSessionId: '880e8400-e29b-41d4-a716-446655440000',
            resumeKind: 'recent_topic',
            lastActivityAt: '2026-02-15T09:00:00.000Z',
            reason: 'Pick up Photosynthesis',
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const { result } = renderHook(
      () =>
        useLearningResumeTarget({
          subjectId: '550e8400-e29b-41d4-a716-446655440000',
        }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    const url = getMockFetchUrl();
    expect(url).toContain('/progress/resume-target');
    expect(url).toContain('subjectId=550e8400-e29b-41d4-a716-446655440000');
    expect(result.current.data?.topicTitle).toBe('Photosynthesis');
  });
});

describe('useReviewSummary', () => {
  it('fetches review summary from API', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          totalOverdue: 6,
          nextReviewTopic: {
            topicId: TOPIC_ID,
            subjectId: SUBJECT_ID,
            subjectName: 'Math',
            topicTitle: 'Algebra',
          },
          nextUpcomingReviewAt: null,
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    );

    const { result } = renderHook(() => useReviewSummary(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockFetch).toHaveBeenCalled();
    expect(result.current.data?.totalOverdue).toBe(6);
  });
});

describe('useOverdueTopics', () => {
  it('fetches overdue topics grouped by subject from API', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          totalOverdue: 2,
          truncated: false,
          displayedCount: 1,
          subjects: [
            {
              subjectId: SUBJECT_ID,
              subjectName: 'Math',
              overdueCount: 2,
              topics: [
                {
                  topicId: TOPIC_ID,
                  topicTitle: 'Algebra',
                  overdueDays: 3,
                  failureCount: 1,
                  retentionStatus: 'forgotten',
                },
              ],
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const { result } = renderHook(() => useOverdueTopics(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data?.totalOverdue).toBe(2);
    expect(result.current.data?.subjects[0]?.subjectName).toBe('Math');
  });
});

describe('useTopicProgress', () => {
  it('fetches topic progress from API', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          topic: {
            topicId: TOPIC_ID,
            title: 'Algebra Basics',
            description: 'Intro',
            completionStatus: 'in_progress',
            retentionStatus: 'strong',
            daysSinceLastReview: 3,
            struggleStatus: 'normal',
            masteryScore: 0.85,
            summaryExcerpt: null,
            xpStatus: 'pending',
            masteredAt: null,
            strongReviews: 2,
            strongReviewsTarget: 5,
            totalSessions: 2,
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const { result } = renderHook(
      () => useTopicProgress(SUBJECT_ID, TOPIC_ID),
      {
        wrapper: createWrapper(),
      },
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockFetch).toHaveBeenCalled();
    expect(result.current.data?.title).toBe('Algebra Basics');
  });
});

describe('useProfileWeeklyReports', () => {
  it('parses weekly report responses through the shared schema', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          reports: [
            {
              id: '550e8400-e29b-41d4-a716-446655440020',
              reportWeek: '2026-W19',
              viewedAt: null,
              createdAt: '2026-05-12T09:00:00.000Z',
              headlineStat: {
                label: 'Study time',
                value: 42,
                comparison: '+10 min',
              },
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const { result } = renderHook(
      () => useProfileWeeklyReports('test-profile-id'),
      { wrapper: createWrapper() },
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data?.[0]?.id).toBe(
      '550e8400-e29b-41d4-a716-446655440020',
    );
  });

  it('fails when a response violates the shared weekly report schema', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ reports: [{ id: 'not-a-uuid' }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const { result } = renderHook(
      () => useProfileWeeklyReports('test-profile-id'),
      { wrapper: createWrapper() },
    );

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error).toBeInstanceOf(Error);
  });

  it('fetches child weekly reports when the active profile is an owner', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ reports: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const { result } = renderHook(
      () => useProfileWeeklyReports('child-profile-id'),
      {
        wrapper: createFamilyOwnerWrapper(),
      },
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(getMockFetchUrl()).toContain(
      '/dashboard/children/child-profile-id/weekly-reports',
    );
    expect(result.current.data).toEqual([]);
  });
});

// [CR-2026-05-19-H27] Break tests for the silent-403 escalation fix.
// Before the fix, useChildWeeklyReports caught a 403 from the weekly-reports
// endpoint, console.warn'd it, and returned []. A revoked or broken
// family-link ACL was therefore invisible in production. After the fix the
// hook surfaces the typed ForbiddenError via React Query AND captures it to
// Sentry with hook + childProfileId tags so the rate of fallback firings is
// queryable per the AGENTS.md "Silent recovery without escalation is banned"
// rule. The screen renders its existing error fallback (retry + back).
describe('useChildWeeklyReports — silent-403 escalation [CR-2026-05-19-H27]', () => {
  it('surfaces ForbiddenError AND captures to Sentry on 403 (does not return [])', async () => {
    const sentry = jest.requireMock('@sentry/react-native') as {
      captureException: jest.Mock;
    };
    sentry.captureException.mockClear();

    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          code: 'FORBIDDEN',
          message: 'Family link not found',
        }),
        { status: 403, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const { result } = renderHook(
      () => useChildWeeklyReports('child-profile-id'),
      {
        wrapper: createFamilyOwnerWrapper(),
      },
    );

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    // Typed error returned via React Query — screen can branch on instanceof
    expect(result.current.error).toBeInstanceOf(ForbiddenError);
    // Hook must not silently swallow to []
    expect(result.current.data).toBeUndefined();
    // Sentry capture with queryable tags — this is the "escalation" the
    // AGENTS.md silent-recovery rule requires (console.warn alone is banned).
    expect(sentry.captureException).toHaveBeenCalledWith(
      expect.any(ForbiddenError),
      expect.objectContaining({
        tags: expect.objectContaining({
          hook: 'useChildWeeklyReports',
          error_kind: 'forbidden',
        }),
        extra: expect.objectContaining({ childProfileId: 'child-profile-id' }),
      }),
    );
  });
});

describe('useRefreshProgressSnapshot', () => {
  it('posts to refresh and dispatches snapshot-cache invalidation', async () => {
    // This test asserts the mutation wires onSuccess to the helper.
    // The helper's actual cache-invalidation effect (mode-agnostic predicate
    // matching, profile scoping, dashboard breadth) is verified end-to-end
    // by the `invalidateProgressSnapshotQueries` tests below using primed
    // cache entries against the real registry shapes.
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          snapshotDate: '2026-05-12',
          metrics: makeProgressMetrics(),
          milestones: [],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const { result } = renderHook(() => useRefreshProgressSnapshot(), {
      wrapper: createWrapper(),
    });

    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

    await act(async () => {
      await result.current.mutateAsync();
    });

    expect(getMockFetchUrl()).toContain('/progress/refresh');
    // PR 10: snapshot kinds (inventory/history/milestones) now dispatch via
    // a predicate, not an inline key. Dashboard stays as a broad prefix
    // pending its own narrowing PR.
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ predicate: expect.any(Function) }),
    );
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['dashboard'],
    });
  });
});

describe('invalidateProgressSnapshotQueries', () => {
  // Workflow tests (PR 10): the helper used to invalidate inline literals
  // like `['progress', 'inventory', profileId]` that did not match the real
  // registry shape `['progress', mode, 'inventory', profileId, ...]` — so
  // every snapshot-refresh invalidation was silently a no-op. The tests now
  // prime cache entries using the real `queryKeys` factories and assert the
  // post-call invalidation state, so a regression to the broken behaviour
  // fails loudly.
  it('invalidates inventory/history/milestones for the active profile across modes', () => {
    createWrapper();
    const studyInventory = queryKeys.progress.inventory('study', 'profile-A');
    const familyInventory = queryKeys.progress.inventory('family', 'profile-A');
    const studyHistory = queryKeys.progress.history(
      'study',
      'profile-A',
      undefined,
    );
    const studyMilestonesLimit5 = queryKeys.progress.milestones(
      'study',
      'profile-A',
      5,
    );
    const studyMilestonesLimit10 = queryKeys.progress.milestones(
      'study',
      'profile-A',
      10,
    );

    queryClient.setQueryData(studyInventory, { profileId: 'profile-A' });
    queryClient.setQueryData(familyInventory, { profileId: 'profile-A' });
    queryClient.setQueryData(studyHistory, { dataPoints: [] });
    queryClient.setQueryData(studyMilestonesLimit5, { milestones: [] });
    queryClient.setQueryData(studyMilestonesLimit10, { milestones: [] });

    invalidateProgressSnapshotQueries(queryClient, 'profile-A');

    expect(queryClient.getQueryState(studyInventory)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(familyInventory)?.isInvalidated).toBe(
      true,
    );
    expect(queryClient.getQueryState(studyHistory)?.isInvalidated).toBe(true);
    expect(
      queryClient.getQueryState(studyMilestonesLimit5)?.isInvalidated,
    ).toBe(true);
    expect(
      queryClient.getQueryState(studyMilestonesLimit10)?.isInvalidated,
    ).toBe(true);
  });

  it('does NOT invalidate snapshot queries for a different profile (shared-device safety)', () => {
    createWrapper();
    const profileAInventory = queryKeys.progress.inventory(
      'study',
      'profile-A',
    );
    const profileBInventory = queryKeys.progress.inventory(
      'study',
      'profile-B',
    );
    const profileBHistory = queryKeys.progress.history(
      'study',
      'profile-B',
      undefined,
    );
    const profileBMilestones = queryKeys.progress.milestones(
      'study',
      'profile-B',
      5,
    );

    queryClient.setQueryData(profileAInventory, { profileId: 'profile-A' });
    queryClient.setQueryData(profileBInventory, { profileId: 'profile-B' });
    queryClient.setQueryData(profileBHistory, { dataPoints: [] });
    queryClient.setQueryData(profileBMilestones, { milestones: [] });

    invalidateProgressSnapshotQueries(queryClient, 'profile-A');

    expect(queryClient.getQueryState(profileAInventory)?.isInvalidated).toBe(
      true,
    );
    expect(queryClient.getQueryState(profileBInventory)?.isInvalidated).toBe(
      false,
    );
    expect(queryClient.getQueryState(profileBHistory)?.isInvalidated).toBe(
      false,
    );
    expect(queryClient.getQueryState(profileBMilestones)?.isInvalidated).toBe(
      false,
    );
  });

  it('does NOT invalidate non-snapshot progress queries (overview/subject/etc.)', () => {
    // The helper's contract is snapshot queries only (inventory/history/
    // milestones). Overview, subject progress, continue suggestion, and
    // resume-target queries must be left untouched — they belong to mutation
    // paths in other hooks (assessment, quiz, subject) and refreshing the
    // snapshot does not invalidate live progress.
    createWrapper();
    const overviewKey = queryKeys.progress.overview('study', 'profile-A');
    const subjectKey = queryKeys.progress.subject(
      'study',
      'sub-1',
      'profile-A',
    );
    const continueKey = queryKeys.progress.continue('study', 'profile-A');

    queryClient.setQueryData(overviewKey, { subjects: [] });
    queryClient.setQueryData(subjectKey, { subjectId: 'sub-1' });
    queryClient.setQueryData(continueKey, { suggestion: null });

    invalidateProgressSnapshotQueries(queryClient, 'profile-A');

    expect(queryClient.getQueryState(overviewKey)?.isInvalidated).toBe(false);
    expect(queryClient.getQueryState(subjectKey)?.isInvalidated).toBe(false);
    expect(queryClient.getQueryState(continueKey)?.isInvalidated).toBe(false);
  });

  it('invalidates dashboard queries broadly (intentional — PR-10 deferred)', () => {
    // The dashboard prefix invalidation is intentionally broad — parent
    // refresh must make every child surface stale (detail, sessions,
    // inventory, history, reports, memory). PR-10 deferred narrowing this
    // pending a workflow test that enumerates the full dashboard surface
    // set; see the hint in invalidateProgressSnapshotQueries.
    createWrapper();
    const childDetail = queryKeys.dashboard.childDetail('family', 'child-1');
    const childSessions = queryKeys.dashboard.childSessions(
      'family',
      'child-1',
    );
    const childInventory = queryKeys.dashboard.childInventory(
      'family',
      'child-1',
    );

    queryClient.setQueryData(childDetail, { profileId: 'child-1' });
    queryClient.setQueryData(childSessions, { sessions: [] });
    queryClient.setQueryData(childInventory, { profileId: 'child-1' });

    invalidateProgressSnapshotQueries(queryClient, 'profile-A');

    expect(queryClient.getQueryState(childDetail)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(childSessions)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(childInventory)?.isInvalidated).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Profile-switch cache isolation
// ---------------------------------------------------------------------------

describe('profile-switch cache isolation', () => {
  it('useOverallProgress — profile A and B have different query keys', () => {
    const keyA = queryKeys.progress.overview('study', 'profile-A');
    const keyB = queryKeys.progress.overview('study', 'profile-B');
    expect(keyA).not.toEqual(keyB);
    // Confirm the values are what we expect
    expect(keyA).toEqual(['progress', 'study', 'overview', 'profile-A']);
    expect(keyB).toEqual(['progress', 'study', 'overview', 'profile-B']);
  });

  it('useSubjectProgress — same subject, different profiles produce different cache slots', () => {
    const keyA = queryKeys.progress.subject('study', 'sub-1', 'profile-A');
    const keyB = queryKeys.progress.subject('study', 'sub-1', 'profile-B');
    expect(keyA).not.toEqual(keyB);
  });

  it('useProgressInventory — different profiles never share cache', () => {
    const keyA = queryKeys.progress.inventory('study', 'profile-A');
    const keyB = queryKeys.progress.inventory('study', 'profile-B');
    expect(keyA).not.toEqual(keyB);
    // Undefined profile must also be isolated
    const keyUndef = queryKeys.progress.inventory('study', undefined);
    expect(keyA).not.toEqual(keyUndef);
  });
});

// ---------------------------------------------------------------------------
// Parent-proxy isolation
// ---------------------------------------------------------------------------

describe('parent-proxy isolation', () => {
  it('profileReports — same child, different parent viewers have different keys', () => {
    const childId = 'child-profile-1';
    const keyParentA = queryKeys.progress.profileReports(
      'family',
      childId,
      'parent-A',
    );
    const keyParentB = queryKeys.progress.profileReports(
      'family',
      childId,
      'parent-B',
    );
    expect(keyParentA).not.toEqual(keyParentB);
    // The key includes both the target child profileId and the active viewer
    expect(keyParentA).toEqual([
      'progress',
      'family',
      'profile',
      childId,
      'reports',
      'parent-A',
    ]);
    expect(keyParentB).toEqual([
      'progress',
      'family',
      'profile',
      childId,
      'reports',
      'parent-B',
    ]);
  });

  it('profileSessions — same child, different parent viewers have different keys', () => {
    const childId = 'child-profile-1';
    const keyParentA = queryKeys.progress.profileSessions(
      'family',
      childId,
      'parent-A',
    );
    const keyParentB = queryKeys.progress.profileSessions(
      'family',
      childId,
      'parent-B',
    );
    expect(keyParentA).not.toEqual(keyParentB);
    expect(keyParentA).toEqual([
      'progress',
      'family',
      'profile',
      childId,
      'sessions',
      'parent-A',
    ]);
  });
});
