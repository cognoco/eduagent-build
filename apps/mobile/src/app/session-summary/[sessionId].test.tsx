import {
  act,
  cleanup,
  render,
  screen,
  fireEvent,
  waitFor,
} from '@testing-library/react-native';
import React from 'react';
import { useAuth } from '@clerk/expo';
import { platformAlert } from '../../lib/platform-alert';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createRoutedMockFetch,
  fetchCallsMatching,
} from '../../test-utils/mock-api-routes';

const mockReplace = jest.fn();
const mockPush = jest.fn();
const mockBack = jest.fn();
const mockCanGoBack = jest.fn(() => false);
const mockParams = {
  sessionId: '660e8400-e29b-41d4-a716-446655440000',
  subjectName: 'Mathematics',
  exchangeCount: '5',
  escalationRung: '2',
} as Record<string, string | undefined>;

const mockTestProfileId = '10000000-0000-4000-8000-000000000001';
const mockTestAccountId = '10000000-0000-4000-8000-000000000002';
const mockChildProfileId = '10000000-0000-4000-8000-000000000003';
const mockParentProfileId = '10000000-0000-4000-8000-000000000004';
const mockSubjectId = '550e8400-e29b-41d4-a716-446655440000';
const mockFiledBookId = '22222222-2222-4222-8222-222222222222';
const mockSuggestedTopicAId = '11111111-1111-4111-8111-111111111111';
const mockSuggestedTopicBId = '33333333-3333-4333-8333-333333333333';
const mockSuggestedTopicCId = '44444444-4444-4444-8444-444444444444';
const mockSuggestedTopicDId = '55555555-5555-4555-8555-555555555555';

// [BUG-134] Test-side: Redirect stub so we can observe the auth-gate output
// without pulling in a real navigation context.
jest.mock('expo-router', () => ({
  useRouter: () => ({
    replace: mockReplace,
    push: mockPush,
    back: mockBack,
    canGoBack: mockCanGoBack,
  }),
  useLocalSearchParams: () => mockParams,
  Redirect: ({ href }: { href: string }) => {
    const { Text } = require('react-native');
    return <Text testID={`mock-redirect-${href}`}>redirect:{href}</Text>;
  },
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock(
  'react-i18next',
  () => require('../../test-utils/mock-i18n').i18nMock,
);

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
}));

// prettier-ignore
jest.mock('../../lib/theme', /* gc1-allow: theme hook requires native ColorScheme unavailable in JSDOM */ () => ({
  useThemeColors: () => ({
    muted: '#a3a3a3',
    textInverse: '#0f0f0f',
  }),
}));

const mockSentryCaptureMessage = jest.fn();
const mockSentryCaptureException = jest.fn();
jest.mock(
  '../../lib/sentry',
  /* gc1-allow: external-boundary: @sentry/react-native native crash handlers */ () => ({
    Sentry: {
      addBreadcrumb: jest.fn(),
      captureMessage: (...args: unknown[]) => mockSentryCaptureMessage(...args),
      captureException: (...args: unknown[]) =>
        mockSentryCaptureException(...args),
    },
  }),
);

// platformAlert is a thin wrapper; spy on it so alert calls are observable.
jest.mock(
  '../../lib/platform-alert',
  /* gc1-allow: temporary-internal: platformAlert spy needed for alert assertion tests */ () => ({
    ...jest.requireActual('../../lib/platform-alert'),
    platformAlert: jest.fn(),
  }),
);

// [BUG-800] formatApiError stub: returns Error.message verbatim so tests can
// assert the typed server reason reaches platformAlert.
jest.mock(
  '../../lib/format-api-error',
  /* gc1-allow: temporary-internal: BUG-800 break test requires raw server message passthrough, not real i18n classification */ () => ({
    ...jest.requireActual('../../lib/format-api-error'),
    formatApiError: (e: unknown) =>
      e instanceof Error ? e.message : 'Unknown error',
  }),
);

// prettier-ignore
jest.mock('../../lib/profile', /* gc1-allow: native-boundary: ProfileProvider uses SecureStore (native) */ () => ({
    ...jest.requireActual('../../lib/profile'),
    useProfile: () => ({
      activeProfile: {
        id: mockTestProfileId,
        accountId: mockTestAccountId,
        displayName: 'Test Learner',
        isOwner: true,
        hasPremiumLlm: false,
        conversationLanguage: 'en',
        pronouns: null,
        consentStatus: null,
        birthYear: 2012,
      },
      profiles: [
        {
          id: mockTestProfileId,
          accountId: mockTestAccountId,
          displayName: 'Test Learner',
          isOwner: true,
          birthYear: 2012,
        },
      ],
      setActiveProfileId: jest.fn(),
      isRestoringId: false,
    }),
    isGuardianProfile: () => false,
  }),
);

// use-parent-proxy uses setProxyMode from api-client (not the RPC useApiClient hook)
// plus SecureStore reads — not an API hook. Keep as a direct mock.
const mockUseParentProxy = jest.fn(() => ({
  isParentProxy: false,
  childProfile: null,
  parentProfile: null,
}));
jest.mock(
  '../../hooks/use-parent-proxy' /* gc1-allow: native-boundary; hook reads/writes SecureStore in effects */,
  () => ({
    useParentProxy: () => mockUseParentProxy(),
  }),
);

// useNavigationContract is sourced from useParentProxy in production for the
// `gates.showLearningActions` flag, so route the mock through the existing
// proxy fixture rather than maintaining parallel state across tests. Other
// exports (useNavigationDataScopeContract etc.) pass through to the real
// module so use-sessions queryScope fallbacks resolve correctly.
jest.mock(
  '../../hooks/use-navigation-contract' /* gc1-allow: hook depends on full app provider tree; stub pins gates for deterministic tests */,
  () => ({
    ...jest.requireActual('../../hooks/use-navigation-contract'),
    useNavigationContract: () => ({
      gates: {
        showLearningActions: !mockUseParentProxy().isParentProxy,
      },
    }),
  }),
);

// use-rating-prompt reads/writes SecureStore and calls expo-store-review.
// It has no useApiClient() calls, so keep it as a direct mock.
const mockOnSuccessfulRecall = jest.fn();
jest.mock(
  '../../hooks/use-rating-prompt' /* gc1-allow: native-boundary; hook calls StoreReview and SecureStore APIs */,
  () => ({
    useRatingPrompt: () => ({
      onSuccessfulRecall: mockOnSuccessfulRecall,
    }),
  }),
);

let resolveDefaultSummaryDraftReads: Array<() => void> = [];

// summary-draft uses expo-secure-store which is shimmed globally in test-setup.ts
// (in-memory Map). Use the real implementation with spies so SecureStore interactions
// and TTL/sanitize logic are exercised rather than stubbed.
const summaryDraftModule = jest.requireActual<
  typeof import('../../lib/summary-draft')
>('../../lib/summary-draft');

const mockReadSummaryDraft = jest
  .spyOn(summaryDraftModule, 'readSummaryDraft')
  .mockImplementation(
    () =>
      new Promise<null>((resolve) => {
        resolveDefaultSummaryDraftReads.push(() => resolve(null));
      }),
  );
const mockWriteSummaryDraft = jest
  .spyOn(summaryDraftModule, 'writeSummaryDraft')
  .mockResolvedValue(undefined);
const mockClearSummaryDraft = jest
  .spyOn(summaryDraftModule, 'clearSummaryDraft')
  .mockResolvedValue(undefined);

jest.mock(
  '../../lib/summary-draft' /* gc1-allow: requireActual passthrough — needed for spyOn to intercept exports */,
  () => jest.requireActual('../../lib/summary-draft'),
);

// ---------------------------------------------------------------------------
// Fetch-boundary mock state — mutated per-test via setRoute()
// ---------------------------------------------------------------------------
// Mutable variables that route handlers close over so per-test updates to
// these variables are reflected without re-creating mockFetch.
let mockTranscriptData: Record<string, unknown> | null = null;
let mockSessionSummaryData: {
  id: string;
  sessionId: string;
  content: string;
  aiFeedback: string | null;
  status: 'pending' | 'submitted' | 'accepted' | 'skipped' | 'auto_closed';
  baseXp?: number | null;
  reflectionBonusXp?: number | null;
  purgedAt?: string | null;
  // [WI-1553] four_strands session-end learning summary — additive.
  languageLearningSummary?: {
    practicedScenario: string | null;
    newWords: Array<{ term: string; type: 'word' | 'chunk' }>;
    strengthenedWords: Array<{ term: string; type: 'word' | 'chunk' }>;
    grammarPatterns: string[];
    comprehension: { correct: number; total: number } | null;
    speakingAttempts: number;
    fluency: { correct: number; total: number } | null;
    nextRecommendationStrand:
      | 'meaning_input'
      | 'meaning_output'
      | 'language_focus'
      | 'fluency'
      | null;
  } | null;
} | null = null;

// Base summary fixture with all fields required by sessionSummaryGetResponseSchema.
// parseJson now validates responses against the full schema, so partial objects are
// rejected. Tests that supply learnerRecap stop polling; tests that override it with
// null exercise the "still loading" / timeout rail.
const BASE_MOCK_SUMMARY = {
  id: '880e8400-e29b-41d4-a716-446655440000',
  sessionId: '660e8400-e29b-41d4-a716-446655440000',
  content: '',
  aiFeedback: null as string | null,
  status: 'pending' as const,
  closingLine: null as string | null,
  learnerRecap: 'mock-recap',
  nextTopicId: null as string | null,
  nextTopicTitle: null as string | null,
  nextTopicReason: null as string | null,
};
let mockTotalSessions = 0;
let mockRecentlyResolvedTopics: string[] = [];
let mockTopicSuggestionsData: Array<{
  id: string;
  bookId: string;
  title: string;
  createdAt: string;
  usedAt: string | null;
}> = [];
let mockSessionData: Record<string, unknown> | null = null;

// Per-test mutation result containers — default to success shapes; override
// with setRoute() for tests that need rejections or custom shapes.
let mockSubmitResult: Record<string, unknown> | Response | null = null;
let mockSkipResult: Record<string, unknown> | Response = {
  summary: {
    id: 'summary-1',
    sessionId: '660e8400-e29b-41d4-a716-446655440000',
    content: '',
    aiFeedback: null,
    status: 'skipped',
  },
};
// The single mockFetch instance — its route map is updated per-test via setRoute().
const mockFetch = createRoutedMockFetch({
  // GET /bookmarks/session — useSessionBookmarks needs { bookmarks: [] } not {}
  // (React Query throws "query data cannot be undefined" when data.bookmarks === undefined)
  'bookmarks/session': () => ({ bookmarks: [] }),
  // GET /progress/inventory — useProgressInventory returns KnowledgeInventory directly.
  // Screen accesses progressInventory.data?.global.totalSessions — if the default
  // `{}` response is returned, `{}.global` is undefined and `.totalSessions` throws
  // a TypeError, crashing the component on every re-render after fetch resolves.
  'progress/inventory': () => ({
    profileId: mockTestProfileId,
    snapshotDate: '2026-05-02',
    global: {
      topicsAttempted: 0,
      topicsMastered: 0,
      vocabularyTotal: 0,
      vocabularyMastered: 0,
      totalSessions: mockTotalSessions,
      totalActiveMinutes: 0,
      totalWallClockMinutes: 0,
      currentStreak: 0,
      longestStreak: 0,
    },
    subjects: [],
  }),
  // GET /sessions/:id/summary — returns persisted summary (or null for fresh sessions).
  // Distinguishable from POST /summary by checking init.method.
  // POST /sessions/:id/summary/skip — distinct URL suffix.
  // POST /sessions/:id/summary — submit mutation.
  'summary/skip': (_url: string, _init?: RequestInit) => {
    if (mockSkipResult instanceof Response) return mockSkipResult;
    return mockSkipResult;
  },
  // POST /sessions/:id/recall-bridge
  'recall-bridge': () => new Response(JSON.stringify({}), { status: 404 }),
  // GET /sessions/:id/transcript
  transcript: () => {
    if (mockTranscriptData === null) return null;
    return mockTranscriptData;
  },
  // GET /sessions/:id (session entity) + POST /summary (submit)
  // Differentiated below by checking URL suffix and method.
  sessions: (url: string, init?: RequestInit) => {
    // POST /sessions/:id/summary → submit summary mutation
    if (url.includes('/summary') && init?.method === 'POST') {
      if (mockSubmitResult instanceof Response) return mockSubmitResult;
      if (mockSubmitResult !== null) return mockSubmitResult;
      // Default: no result configured — return error state
      return new Response(
        JSON.stringify({ message: 'Not configured', code: 'TEST_ERROR' }),
        { status: 500 },
      );
    }
    // GET /sessions/:id/summary → persisted summary lookup.
    // Always include learnerRecap so refetchInterval → false and polling stops.
    // Returns a full schema-valid SessionSummary (parseJson validates against
    // sessionSummaryGetResponseSchema since WI-1059; partial objects are rejected).
    // status:'pending' keeps isAlreadyPersisted=false so the input form renders.
    if (url.includes('/summary')) {
      if (mockSessionSummaryData === null) {
        return { summary: { ...BASE_MOCK_SUMMARY } };
      }
      return {
        summary: { ...BASE_MOCK_SUMMARY, ...mockSessionSummaryData },
      };
    }
    // GET /sessions/:id (session entity)
    return { session: mockSessionData };
  },
  // PUT /settings/learning-mode
  'learning-mode': () => ({ mode: 'casual' }),
  // GET /learner-profile — useLearnerProfile needs { profile: { recentlyResolvedTopics: [] } }
  // so the hook queryFn returns defined data. The default {} shape causes React Query
  // to throw "Query data cannot be undefined" because data.profile is undefined.
  // Closes over mockRecentlyResolvedTopics so per-test overrides are reflected.
  'learner-profile': () => ({
    profile: {
      id: mockTestProfileId,
      profileId: mockTestProfileId,
      learningStyle: null,
      interests: [],
      strengths: [],
      struggles: [],
      communicationNotes: [],
      suppressedInferences: [],
      interestTimestamps: {},
      effectivenessSessionCount: 0,
      memoryEnabled: false,
      memoryConsentStatus: 'pending',
      memoryCollectionEnabled: false,
      memoryInjectionEnabled: true,
      accommodationMode: 'none',
      recentlyResolvedTopics: mockRecentlyResolvedTopics,
      version: 1,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  }),
  // GET /subjects/:id/books/:id/topic-suggestions — useTopicSuggestions.
  // Closes over mockTopicSuggestionsData so per-test overrides are reflected.
  'topic-suggestions': () => mockTopicSuggestionsData,
});

// prettier-ignore
jest.mock('../../lib/api-client', /* gc1-allow: transport-boundary: Hono RPC client requires real HTTP transport */ () =>
  require('../../test-utils/mock-api-routes').mockApiClientFactory(mockFetch),
);

// Create a fresh QueryClient per test to prevent cross-test query cache
// contamination. With fetch-boundary mocks, queries are async and shared
// client state from previous tests can bleed into the next test.
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
        // refetchInterval: false here only sets the default; useSessionSummary
        // overrides it per-query to poll until learnerRecap is set. We supply
        // learnerRecap in every session-summary response so the polling stops
        // immediately on the first response.
        refetchOnWindowFocus: false,
      },
      mutations: {
        retry: false,
        // TanStack mutation observers schedule a default 5-minute GC timer
        // after unmount; keep the suite from needing --forceExit.
        gcTime: 0,
      },
    },
  });
  activeQueryClient = queryClient;
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

// Alias for tests that were already using `Wrapper` directly.
let Wrapper: ReturnType<typeof createWrapper>;
let activeQueryClient: QueryClient | null = null;

const SessionSummaryScreen = require('./[sessionId]').default;

async function settleAsyncWork(): Promise<void> {
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await Promise.resolve();
}

async function pressAsync(
  element: Parameters<typeof fireEvent.press>[0],
): Promise<void> {
  await act(async () => {
    fireEvent.press(element);
    await settleAsyncWork();
    await settleAsyncWork();
  });
}

async function flushAsyncEffects(): Promise<void> {
  await act(async () => {
    await settleAsyncWork();
  });
}

describe('SessionSummaryScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (platformAlert as jest.Mock).mockClear();
    resolveDefaultSummaryDraftReads = [];
    mockReadSummaryDraft.mockImplementation(
      () =>
        new Promise<null>((resolve) => {
          resolveDefaultSummaryDraftReads.push(() => resolve(null));
        }),
    );
    mockWriteSummaryDraft.mockResolvedValue(undefined);
    mockClearSummaryDraft.mockResolvedValue(undefined);
    mockUseParentProxy.mockReturnValue({
      isParentProxy: false,
      childProfile: null,
      parentProfile: null,
    });
    mockSubmitResult = null;
    mockSkipResult = {
      summary: {
        id: '880e8400-e29b-41d4-a716-446655440001',
        sessionId: '660e8400-e29b-41d4-a716-446655440000',
        content: '',
        aiFeedback: null,
        status: 'skipped',
      },
    };
    mockParams.subjectName = 'Mathematics';
    mockParams.exchangeCount = '5';
    mockParams.escalationRung = '2';
    mockParams.wallClockSeconds = undefined;
    mockParams.milestones = undefined;
    mockParams.fastCelebrations = undefined;
    mockParams.sessionType = undefined;
    mockParams.subjectId = undefined;
    mockParams.topicId = undefined;
    mockParams.filedSubjectId = undefined;
    mockParams.filedBookId = undefined;
    mockTranscriptData = null;
    mockSessionSummaryData = null;
    mockTotalSessions = 0;
    mockRecentlyResolvedTopics = [];
    mockTopicSuggestionsData = [];
    mockSessionData = null;
    mockBack.mockClear();
    mockCanGoBack.mockReset();
    mockCanGoBack.mockReturnValue(false);
    mockOnSuccessfulRecall.mockResolvedValue(undefined);
    // Reset recall-bridge to the default rejection
    mockFetch.setRoute(
      'recall-bridge',
      () =>
        new Response(JSON.stringify({ message: 'not homework' }), {
          status: 404,
        }),
    );
    // Reset transcript route — the [BUG-139] expired-session test overrides this to 404.
    // Without resetting here, the 404 override bleeds into subsequent tests that set
    // mockTranscriptData = validTranscriptData but still see "session expired" UI.
    mockFetch.setRoute('transcript', () => {
      if (mockTranscriptData === null) return null;
      return mockTranscriptData;
    });
    // Reset sessions route to default — tests like [BUG-800] call setRoute('sessions', ...)
    // to inject error responses. Without resetting, the override bleeds into subsequent
    // tests and the submit/summary routes return wrong shapes, causing waitFor timeouts.
    mockFetch.setRoute('sessions', (url: string, init?: RequestInit) => {
      if (url.includes('/summary') && init?.method === 'POST') {
        if (mockSubmitResult instanceof Response) return mockSubmitResult;
        if (mockSubmitResult !== null) return mockSubmitResult;
        return new Response(
          JSON.stringify({ message: 'Not configured', code: 'TEST_ERROR' }),
          { status: 500 },
        );
      }
      if (url.includes('/summary')) {
        if (mockSessionSummaryData === null) {
          return { summary: { ...BASE_MOCK_SUMMARY } };
        }
        return {
          summary: { ...BASE_MOCK_SUMMARY, ...mockSessionSummaryData },
        };
      }
      if (url.includes('/library-filing/keep-out')) {
        return {
          session: {
            ...mockSessionData,
            filingStatus: 'filing_kept_out',
            topicId: null,
            filedAt: null,
          },
        };
      }
      if (url.includes('/library-filing/add')) {
        return {
          session: {
            ...mockSessionData,
            filingStatus: 'filing_pending',
            topicId: null,
            filedAt: null,
          },
        };
      }
      if (url.includes('/library-filing/restore')) {
        return {
          session: {
            ...mockSessionData,
            filingStatus: 'filing_pending',
            topicId: null,
            filedAt: null,
          },
        };
      }
      if (url.includes('/retry-filing')) {
        return {
          session: {
            ...mockSessionData,
            filingStatus: 'filing_pending',
            topicId: null,
            filedAt: null,
          },
        };
      }
      return { session: mockSessionData };
    });
    // Create a fresh wrapper (and QueryClient) per test to prevent cross-test
    // query cache contamination from async fetch-boundary responses.
    Wrapper = createWrapper();
    // [BUG-134] Default to signed-in for SessionSummary tests; auth-gate
    // break tests override below.
    (useAuth as jest.Mock).mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
    });
  });

  afterEach(async () => {
    const draftResolvers = resolveDefaultSummaryDraftReads;
    resolveDefaultSummaryDraftReads = [];

    await act(async () => {
      for (const resolveDraftRead of draftResolvers) {
        resolveDraftRead();
      }
      await settleAsyncWork();
      await settleAsyncWork();
    });
    cleanup();
    activeQueryClient?.clear();
    activeQueryClient = null;
  });

  it('renders session takeaways', () => {
    render(<SessionSummaryScreen />, { wrapper: Wrapper });

    screen.getByTestId('summary-title');
    screen.getByText('Session Complete');
    screen.getByText('Mathematics');
    screen.getByTestId('session-takeaways');
    screen.getByText('What happened');
    // 5 exchanges, rung 2 → "strong independent thinking"
    screen.getByText(/worked through 5 exchanges/);
    screen.getByText(/strong independent thinking/);
  });

  it('does not fire hidden depth evaluation on mount', async () => {
    render(<SessionSummaryScreen />, { wrapper: Wrapper });

    await flushAsyncEffects();

    expect(fetchCallsMatching(mockFetch, 'evaluate-depth')).toHaveLength(0);
  });

  // [BUG-801] When the URL passes exchangeCount='0' (legitimate value for
  // a session that ended before any exchanges), the screen must honor it
  // rather than silently fall back to the server's transcript count.
  // Repro: parseInt('0') = 0, which `||` treated as falsy and replaced
  // with the server count, hiding the actual session state from the user.
  it('[BUG-801] honors explicit exchangeCount=0 over server fallback', () => {
    mockParams.exchangeCount = '0';
    mockTranscriptData = {
      session: {
        id: '660e8400-e29b-41d4-a716-446655440000',
        sessionType: 'general',
        exchangeCount: 10,
        wallClockSeconds: 600,
      },
      messages: [],
    } as unknown as never;

    render(<SessionSummaryScreen />, { wrapper: Wrapper });

    // The takeaways block is only rendered when exchanges > 0, so with an
    // explicit 0 the "worked through ... exchanges" copy must NOT appear.
    expect(screen.queryByText(/worked through \d+ exchange/)).toBeNull();
    // And the server-side 10 must NOT leak through as a takeaway.
    expect(screen.queryByText(/worked through 10 exchanges/)).toBeNull();
  });

  // [BREAK / BUG-805] When the URL param wallClockSeconds is missing AND the
  // transcript hasn't loaded yet, Math.max(1, ...) used to mask the unknown
  // duration as "1 minute - great session!". Then once the transcript arrived
  // it would snap to the real duration — readable as a flicker. The fix
  // suppresses the duration takeaway until verified non-zero data is available.
  it('[BREAK / BUG-805] does not flash a duration takeaway while data is missing', () => {
    mockParams.wallClockSeconds = undefined;
    mockTranscriptData = null;

    render(<SessionSummaryScreen />, { wrapper: Wrapper });

    // No "minute - great session!" copy must appear when duration is unknown.
    expect(screen.queryByText(/minute.*great session/i)).toBeNull();
    // Other takeaways still render so the user isn't stuck on a blank section.
    screen.getByTestId('session-takeaways');
  });

  it('[BUG-805] renders the duration takeaway once wallClockSeconds is known', () => {
    mockParams.wallClockSeconds = '900';

    render(<SessionSummaryScreen />, { wrapper: Wrapper });

    screen.getByText(/15 minutes - great session!/);
  });

  it('renders summary input', () => {
    render(<SessionSummaryScreen />, { wrapper: Wrapper });

    screen.getByText('Your Words');
    screen.getByTestId('summary-input');
    screen.getByTestId('submit-summary-button');
  });

  describe('mentor-memory cue', () => {
    it('renders after two sessions and routes owners to mentor memory', async () => {
      mockTotalSessions = 2;

      render(<SessionSummaryScreen />, { wrapper: Wrapper });

      const cue = await screen.findByTestId(
        'session-summary-mentor-memory-cue',
      );
      screen.getByText('What your mentor knows about you.');
      screen.getByText('Tap to review or change.');

      fireEvent.press(cue);

      expect(mockPush).toHaveBeenCalledWith('/(app)/mentor-memory');
    });

    it('routes parent-proxy users to the child mentor-memory screen when consented', async () => {
      mockTotalSessions = 2;
      mockUseParentProxy.mockReturnValue({
        isParentProxy: true,
        childProfile: {
          id: mockChildProfileId,
          birthYear: 2012,
          consentStatus: 'CONSENTED',
        } as never,
        parentProfile: { id: mockParentProfileId, isOwner: true } as never,
      });

      render(<SessionSummaryScreen />, { wrapper: Wrapper });

      fireEvent.press(
        await screen.findByTestId('session-summary-mentor-memory-cue'),
      );

      expect(mockPush).toHaveBeenCalledWith({
        pathname: '/(app)/child/[profileId]/mentor-memory',
        params: { profileId: mockChildProfileId },
      });
    });

    it.each([0, 1])(
      'hides the cue while the profile has only %i completed sessions',
      async (totalSessions) => {
        mockTotalSessions = totalSessions;

        render(<SessionSummaryScreen />, { wrapper: Wrapper });

        await waitFor(() => {
          expect(screen.queryByTestId('session-takeaways')).not.toBeNull();
        });
        expect(
          screen.queryByTestId('session-summary-mentor-memory-cue'),
        ).toBeNull();
      },
    );

    it('hides the cue in parent-proxy mode without consent', async () => {
      mockTotalSessions = 2;
      mockUseParentProxy.mockReturnValue({
        isParentProxy: true,
        childProfile: {
          id: mockChildProfileId,
          birthYear: 2012,
          consentStatus: 'PENDING',
        } as never,
        parentProfile: { id: mockParentProfileId, isOwner: true } as never,
      });

      render(<SessionSummaryScreen />, { wrapper: Wrapper });

      await waitFor(() => {
        expect(screen.queryByTestId('session-takeaways')).not.toBeNull();
      });
      expect(
        screen.queryByTestId('session-summary-mentor-memory-cue'),
      ).toBeNull();
    });
  });

  it('disables submit when summary is too short', () => {
    render(<SessionSummaryScreen />, { wrapper: Wrapper });

    fireEvent.changeText(screen.getByTestId('summary-input'), 'Short');

    const button = screen.getByTestId('submit-summary-button');
    expect(
      button.props.accessibilityState?.disabled ?? button.props.disabled,
    ).toBeTruthy();
  });

  it('submits summary and shows AI feedback', async () => {
    mockSubmitResult = {
      summary: {
        id: '880e8400-e29b-41d4-a716-446655440001',
        sessionId: '660e8400-e29b-41d4-a716-446655440000',
        content: 'I learned about quadratic equations and how to solve them',
        aiFeedback: 'Good summary. You captured the key concepts well.',
        status: 'accepted',
      },
    };

    render(<SessionSummaryScreen />, { wrapper: Wrapper });

    fireEvent.changeText(
      screen.getByTestId('summary-input'),
      'I learned about quadratic equations and how to solve them',
    );
    await pressAsync(screen.getByTestId('submit-summary-button'));

    await waitFor(() => {
      screen.getByTestId('summary-submitted');
      screen.getByTestId('ai-feedback');
      screen.getByText('Good summary. You captured the key concepts well.');
    });
  });

  it('shows submitted reflection bonus XP when the summary mutation returns it', async () => {
    mockSubmitResult = {
      summary: {
        id: '880e8400-e29b-41d4-a716-446655440001',
        sessionId: '660e8400-e29b-41d4-a716-446655440000',
        content: 'I learned about quadratic equations and how to solve them',
        aiFeedback: 'Good summary.',
        status: 'accepted',
        baseXp: 12,
        reflectionBonusXp: 6,
      },
    };

    render(<SessionSummaryScreen />, { wrapper: Wrapper });

    fireEvent.changeText(
      screen.getByTestId('summary-input'),
      'I learned about quadratic equations and how to solve them',
    );
    await pressAsync(screen.getByTestId('submit-summary-button'));

    await waitFor(() => {
      screen.getByTestId('summary-submitted');
      screen.getByTestId('xp-bonus-earned');
      screen.getByText('+6 bonus XP earned!');
    });
  });

  it('shows Continue button after submission', async () => {
    mockSubmitResult = {
      summary: {
        id: '880e8400-e29b-41d4-a716-446655440001',
        sessionId: '660e8400-e29b-41d4-a716-446655440000',
        content: 'I learned about quadratic equations and factoring methods',
        aiFeedback: 'Well done.',
        status: 'accepted',
      },
    };

    render(<SessionSummaryScreen />, { wrapper: Wrapper });

    fireEvent.changeText(
      screen.getByTestId('summary-input'),
      'I learned about quadratic equations and factoring methods',
    );
    await pressAsync(screen.getByTestId('submit-summary-button'));

    await waitFor(() => {
      screen.getByTestId('continue-button');
    });

    await pressAsync(screen.getByTestId('continue-button'));
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/(app)/home');
    });
  });

  it('replaces home after a freshly submitted summary even when history can go back', async () => {
    mockCanGoBack.mockReturnValue(true);
    mockSubmitResult = {
      summary: {
        id: '880e8400-e29b-41d4-a716-446655440001',
        sessionId: '660e8400-e29b-41d4-a716-446655440000',
        content: 'I learned about quadratic equations and factoring methods',
        aiFeedback: 'Well done.',
        status: 'accepted',
      },
    };

    render(<SessionSummaryScreen />, { wrapper: Wrapper });

    fireEvent.changeText(
      screen.getByTestId('summary-input'),
      'I learned about quadratic equations and factoring methods',
    );
    await pressAsync(screen.getByTestId('submit-summary-button'));

    await waitFor(() => {
      screen.getByTestId('continue-button');
    });

    await pressAsync(screen.getByTestId('continue-button'));

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/(app)/home');
    });
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('triggers the rating prompt hook before leaving a recall summary', async () => {
    mockSubmitResult = {
      summary: {
        id: '880e8400-e29b-41d4-a716-446655440001',
        sessionId: '660e8400-e29b-41d4-a716-446655440000',
        content: 'I explained how factoring helps solve quadratic equations',
        aiFeedback: 'Well done.',
        status: 'accepted',
      },
    };
    mockTranscriptData = {
      archived: false,
      session: {
        sessionId: '660e8400-e29b-41d4-a716-446655440000',
        subjectId: '550e8400-e29b-41d4-a716-446655440000',
        topicId: '770e8400-e29b-41d4-a716-446655440000',
        sessionType: 'learning',
        verificationType: 'evaluate',
        startedAt: '2026-04-01T00:00:00.000Z',
        exchangeCount: 5,
        milestonesReached: [],
        wallClockSeconds: 600,
      },
      exchanges: [],
    };

    render(<SessionSummaryScreen />, { wrapper: Wrapper });

    fireEvent.changeText(
      screen.getByTestId('summary-input'),
      'I explained how factoring helps solve quadratic equations',
    );
    await pressAsync(screen.getByTestId('submit-summary-button'));

    await waitFor(() => {
      screen.getByTestId('continue-button');
    });

    await pressAsync(screen.getByTestId('continue-button'));

    await waitFor(() => {
      expect(mockOnSuccessfulRecall).toHaveBeenCalled();
      expect(mockReplace).toHaveBeenCalledWith('/(app)/home');
    });
  });

  it('persists skip before leaving the screen', async () => {
    render(<SessionSummaryScreen />, { wrapper: Wrapper });

    const skipButton = screen.getByTestId('skip-summary-button');
    await pressAsync(skipButton);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/(app)/home');
    });
  });

  it('shows recall bridge questions after homework skip', async () => {
    mockParams.sessionType = 'homework';
    mockFetch.setRoute('recall-bridge', () => ({
      questions: ['What method did you use?', 'Why does it work?'],
      topicId: '990e8400-e29b-41d4-a716-446655440001',
      topicTitle: 'Algebra',
    }));

    render(<SessionSummaryScreen />, { wrapper: Wrapper });

    await pressAsync(screen.getByTestId('skip-summary-button'));

    await waitFor(() => {
      screen.getByTestId('recall-bridge-questions');
      screen.getByText('Quick recall check');
      screen.getByText(/What method did you use/);
      screen.getByText(/Why does it work/);
    });

    // Should NOT have navigated home yet
    expect(mockReplace).not.toHaveBeenCalled();

    // Press "Done — head home" to navigate
    await pressAsync(screen.getByTestId('recall-bridge-done-button'));

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/(app)/home');
    });
  });

  it('skips recall bridge for non-homework sessions', async () => {
    mockParams.sessionType = 'learning';
    mockFetch.setRoute('recall-bridge', () => ({
      questions: ['Should not appear'],
      topicId: '990e8400-e29b-41d4-a716-446655440001',
      topicTitle: 'Algebra',
    }));

    render(<SessionSummaryScreen />, { wrapper: Wrapper });

    await pressAsync(screen.getByTestId('skip-summary-button'));

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/(app)/home');
    });
  });

  // W2 #11: the recall bridge was starved on the submit path — the fetch lived
  // inside the skip-only block, so a learner who SUBMITTED a reflection never
  // reached it. It now fires inside handleSubmit on success.
  it('fires the recall bridge on the homework submit path (not just skip)', async () => {
    mockParams.sessionType = 'homework';
    mockSubmitResult = {
      summary: {
        id: '880e8400-e29b-41d4-a716-446655440001',
        sessionId: '660e8400-e29b-41d4-a716-446655440000',
        content: 'I used long division to check the remainder',
        aiFeedback: 'Nice work.',
        status: 'submitted',
      },
    };
    mockFetch.setRoute('recall-bridge', () => ({
      questions: ['What method did you use?', 'Why does it work?'],
      topicId: '990e8400-e29b-41d4-a716-446655440001',
      topicTitle: 'Algebra',
    }));

    render(<SessionSummaryScreen />, { wrapper: Wrapper });

    fireEvent.changeText(
      screen.getByTestId('summary-input'),
      'I used long division to check the remainder',
    );
    await pressAsync(screen.getByTestId('submit-summary-button'));

    await waitFor(() => {
      screen.getByTestId('recall-bridge-questions');
    });
    expect(fetchCallsMatching(mockFetch, 'recall-bridge')).toHaveLength(1);
  });

  it('shows inline error text when submitSummary fails [SC-1]', async () => {
    // Set up the fetch to return an error for the submit endpoint
    mockFetch.setRoute('sessions', (url: string, init?: RequestInit) => {
      if (url.includes('/summary') && init?.method === 'POST') {
        return new Response(
          JSON.stringify({ message: 'Network error', code: 'NETWORK_ERROR' }),
          { status: 500 },
        );
      }
      if (url.includes('/summary')) {
        return { summary: { ...BASE_MOCK_SUMMARY } };
      }
      return { session: null };
    });

    render(<SessionSummaryScreen />, { wrapper: Wrapper });

    fireEvent.changeText(
      screen.getByTestId('summary-input'),
      'I learned about photosynthesis and how plants make food',
    );
    await pressAsync(screen.getByTestId('submit-summary-button'));

    // The inline error should appear after the mutation fails
    await waitFor(() => {
      screen.getByTestId('summary-error');
    });

    // Error text tells user what happened
    screen.getByText(/Couldn't save your summary/);
  });

  // [BUG-800] When submitSummary rejects, the alert must surface the server's
  // typed reason (word-limit exceeded, too short, etc.) — not the generic
  // "Please try again." which hides actionable info from the user.
  it('[BREAK / BUG-800] alert uses formatApiError so typed server reason reaches user', async () => {
    mockFetch.setRoute('sessions', (url: string, init?: RequestInit) => {
      if (url.includes('/summary') && init?.method === 'POST') {
        return new Response(
          JSON.stringify({
            message: 'Reflection too short — needs at least 30 characters',
            code: 'VALIDATION_ERROR',
          }),
          { status: 400 },
        );
      }
      if (url.includes('/summary')) {
        return { summary: { ...BASE_MOCK_SUMMARY } };
      }
      return { session: null };
    });

    render(<SessionSummaryScreen />, { wrapper: Wrapper });

    fireEvent.changeText(
      screen.getByTestId('summary-input'),
      'I learned about photosynthesis and chlorophyll absorption',
    );
    await pressAsync(screen.getByTestId('submit-summary-button'));

    await waitFor(() => {
      expect(platformAlert).toHaveBeenCalledWith(
        'Could not save',
        'Reflection too short — needs at least 30 characters',
      );
    });
  });

  it('[BUG-800] non-Error rejection does not crash the alert', async () => {
    mockFetch.setRoute('sessions', (url: string, init?: RequestInit) => {
      if (url.includes('/summary') && init?.method === 'POST') {
        return new Response(
          JSON.stringify({ code: 'WORD_LIMIT', maxWords: 200 }),
          { status: 400 },
        );
      }
      if (url.includes('/summary')) {
        return { summary: { ...BASE_MOCK_SUMMARY } };
      }
      return { session: null };
    });

    render(<SessionSummaryScreen />, { wrapper: Wrapper });

    fireEvent.changeText(
      screen.getByTestId('summary-input'),
      'I explored gravity and Newtons three laws of motion today',
    );
    await pressAsync(screen.getByTestId('submit-summary-button'));

    await waitFor(() => {
      // formatApiError stub returns the message; 400 with no "message" field
      // → assertOk throws Error('Request failed (400)') → stub returns that.
      expect(platformAlert).toHaveBeenCalledWith(
        'Could not save',
        expect.any(String),
      );
    });
  });

  // BUG-33 Phase 1: Structured sentence starter prompt chips
  describe('summary prompt chips (BUG-33 Phase 1)', () => {
    it('renders all five sentence starter chips', () => {
      render(<SessionSummaryScreen />, { wrapper: Wrapper });

      screen.getByTestId('summary-prompt-chips');
      screen.getByText('Today I learned that...');
      screen.getByText('The most interesting thing was...');
      screen.getByText('I want to learn more about...');
      screen.getByText('Something that surprised me was...');
      screen.getByText('I found it easy/hard to...');
    });

    it('tapping a prompt chip pre-fills the text input', () => {
      render(<SessionSummaryScreen />, { wrapper: Wrapper });

      fireEvent.press(screen.getByText('Today I learned that...'));

      expect(screen.getByTestId('summary-input').props.value).toBe(
        'Today I learned that...',
      );
    });

    it('tapping a different prompt chip replaces the input text', () => {
      render(<SessionSummaryScreen />, { wrapper: Wrapper });

      fireEvent.press(screen.getByText('Today I learned that...'));
      fireEvent.press(screen.getByText('The most interesting thing was...'));

      expect(screen.getByTestId('summary-input').props.value).toBe(
        'The most interesting thing was...',
      );
    });

    it('each prompt chip has an accessible label matching its text', () => {
      render(<SessionSummaryScreen />, { wrapper: Wrapper });

      screen.getByLabelText('Today I learned that...');
    });

    it('prompt chips are not shown after submission', async () => {
      mockSubmitResult = {
        summary: {
          id: '880e8400-e29b-41d4-a716-446655440001',
          sessionId: '660e8400-e29b-41d4-a716-446655440000',
          content: 'I learned about equations and how to solve them today',
          aiFeedback: 'Great job!',
          status: 'accepted',
        },
      };

      render(<SessionSummaryScreen />, { wrapper: Wrapper });

      fireEvent.changeText(
        screen.getByTestId('summary-input'),
        'I learned about equations and how to solve them today',
      );
      await pressAsync(screen.getByTestId('submit-summary-button'));

      await waitFor(() => {
        screen.getByTestId('summary-submitted');
      });

      expect(screen.queryByTestId('summary-prompt-chips')).toBeNull();
    });
  });

  it('renders milestone recap and fast celebrations when provided', () => {
    mockParams.wallClockSeconds = '900';
    mockParams.milestones = encodeURIComponent(
      JSON.stringify(['polar_star', 'persistent']),
    );
    mockParams.fastCelebrations = encodeURIComponent(
      JSON.stringify([
        { reason: 'topic_mastered', detail: 'Quadratic Equations' },
      ]),
    );

    render(<SessionSummaryScreen />, { wrapper: Wrapper });

    screen.getByTestId('milestone-recap');
    screen.getByText(/Polar Star/);
    screen.getByText(/Persistent/);
    screen.getByTestId('fast-celebrations');
    screen.getByText('Quadratic Equations');
    screen.getByText(/15 minutes - great session!/);
  });

  // [BREAK / BUG-825] Malformed milestones param (non-string array values) must
  // be filtered out by the type-guard. Without it, milestoneLabels would render
  // numbers/objects and the switch fallthrough would produce garbage.
  it('[BREAK / BUG-825] filters out non-string milestone values', () => {
    mockParams.wallClockSeconds = '900';
    mockParams.milestones = encodeURIComponent(
      JSON.stringify([1, 2, 'polar_star', null, { foo: 'bar' }, 'persistent']),
    );

    render(<SessionSummaryScreen />, { wrapper: Wrapper });

    screen.getByTestId('milestone-recap');
    screen.getByText(/Polar Star/);
    screen.getByText(/Persistent/);
    expect(screen.queryByText(/\[object Object\]/)).toBeNull();
  });

  describe('resume-this-session CTA', () => {
    it('renders the Resume CTA for learners and navigates back into the session with the sessionId', () => {
      mockParams.subjectId = 'subject-1';
      mockParams.topicId = 'topic-1';

      render(<SessionSummaryScreen />, { wrapper: Wrapper });

      const cta = screen.getByTestId('resume-session-cta');
      fireEvent.press(cta);

      expect(mockPush).toHaveBeenCalledWith({
        pathname: '/(app)/session',
        params: {
          mode: 'learning',
          sessionId: '660e8400-e29b-41d4-a716-446655440000',
          subjectId: 'subject-1',
          topicId: 'topic-1',
        },
      });
    });

    it('hides the Resume CTA in parent-proxy mode so parents cannot open the learner chat', () => {
      mockUseParentProxy.mockReturnValue({
        isParentProxy: true,
        childProfile: { id: mockTestProfileId, birthYear: 2012 } as never,
        parentProfile: { id: mockParentProfileId, isOwner: true } as never,
      });

      render(<SessionSummaryScreen />, { wrapper: Wrapper });

      expect(screen.queryByTestId('resume-session-cta')).toBeNull();
    });
  });

  // [CR-PR129-M5] Transcript privacy boundary: parents viewing a child's
  // session in proxy mode must not see the full chat transcript.
  describe('transcript link visibility [CR-PR129-M5]', () => {
    it('shows the transcript link when the viewer is the session owner (proxy OFF)', () => {
      // Default mockUseParentProxy returns isParentProxy: false (set in beforeEach).
      render(<SessionSummaryScreen />, { wrapper: Wrapper });

      screen.getByTestId('view-transcript-cta');
    });

    it('hides the transcript link in parent-proxy mode so parents cannot read the full chat', () => {
      mockUseParentProxy.mockReturnValue({
        isParentProxy: true,
        childProfile: { id: mockTestProfileId, birthYear: 2012 } as never,
        parentProfile: { id: mockParentProfileId, isOwner: true } as never,
      });

      render(<SessionSummaryScreen />, { wrapper: Wrapper });

      expect(screen.queryByTestId('view-transcript-cta')).toBeNull();
    });
  });

  // [WI-1553] four_strands session-end language learning summary.
  describe('language practice card', () => {
    it('renders the card with rich-data fields when languageLearningSummary is present', async () => {
      mockSessionSummaryData = {
        id: '880e8400-e29b-41d4-a716-446655440010',
        sessionId: '660e8400-e29b-41d4-a716-446655440000',
        content: 'ordered food in French',
        aiFeedback: null,
        status: 'submitted',
        languageLearningSummary: {
          practicedScenario: 'order food at a cafe',
          newWords: [{ term: 'croissant', type: 'word' }],
          strengthenedWords: [{ term: 'bonjour', type: 'word' }],
          grammarPatterns: ['polite requests: je voudrais'],
          comprehension: { correct: 1, total: 1 },
          speakingAttempts: 2,
          fluency: { correct: 4, total: 5 },
          nextRecommendationStrand: 'fluency',
        },
      };

      render(<SessionSummaryScreen />, { wrapper: Wrapper });

      await waitFor(() => {
        screen.getByTestId('language-practice-card');
      });
      screen.getByText(/order food at a cafe/);
      screen.getByText(/croissant/);
      screen.getByText(/bonjour/);
      screen.getByText(/polite requests: je voudrais/);
      screen.getByText(/1\/1/);
      screen.getByText(/4\/5/);
    });

    it('omits the card entirely for a sparse/non-language summary (no negative placeholders)', async () => {
      mockSessionSummaryData = {
        id: '880e8400-e29b-41d4-a716-446655440011',
        sessionId: '660e8400-e29b-41d4-a716-446655440000',
        content: 'a regular non-language session',
        aiFeedback: null,
        status: 'submitted',
        languageLearningSummary: null,
      };

      render(<SessionSummaryScreen />, { wrapper: Wrapper });

      await waitFor(() => {
        screen.getByTestId('summary-submitted');
      });
      expect(screen.queryByTestId('language-practice-card')).toBeNull();
    });

    // [F3 — Phase-4 review] AC2 regression shape: a single summary object
    // with SOME fields present and SOME null/empty. Every present field must
    // render and every absent field must be positively omitted — no "0 new
    // words" / empty-parens / "0/0" placeholder copy alongside the present
    // fields.
    it('renders only the present fields and omits the rest for a partial summary', async () => {
      mockSessionSummaryData = {
        id: '880e8400-e29b-41d4-a716-446655440012',
        sessionId: '660e8400-e29b-41d4-a716-446655440000',
        content: 'practiced listening only',
        aiFeedback: null,
        status: 'submitted',
        languageLearningSummary: {
          practicedScenario: null,
          newWords: [],
          strengthenedWords: [],
          grammarPatterns: ['articles: le/la'],
          comprehension: null,
          speakingAttempts: 0,
          fluency: null,
          nextRecommendationStrand: 'meaning_input',
        },
      };

      render(<SessionSummaryScreen />, { wrapper: Wrapper });

      await waitFor(() => {
        screen.getByTestId('language-practice-card');
      });
      // Present fields render.
      screen.getByText(/articles: le\/la/);
      screen.getByText(/more reading and listening practice/);
      // Absent fields are positively omitted, not rendered as placeholders.
      expect(screen.queryByText(/Today you practiced/)).toBeNull();
      expect(screen.queryByText(/New words:/)).toBeNull();
      expect(screen.queryByText(/You strengthened:/)).toBeNull();
      expect(screen.queryByText(/comprehension questions/)).toBeNull();
      expect(screen.queryByText(/You spoke/)).toBeNull();
      expect(screen.queryByText(/Fluency check:/)).toBeNull();
    });
  });

  // BUG-449: revisiting a past session (Library → Shelf → Book → tap session)
  // must render the already-saved summary, not the empty "Your Words" prompt.
  describe('revisiting a session with an already-persisted summary [BUG-449]', () => {
    it('renders saved content + AI feedback (not the empty input) when status is submitted', async () => {
      mockSessionSummaryData = {
        id: '880e8400-e29b-41d4-a716-446655440001',
        sessionId: '660e8400-e29b-41d4-a716-446655440000',
        content:
          'African landscapes vary hugely — from the Sahara to savannah to rainforest.',
        aiFeedback: 'Nice connection between geography and climate zones.',
        status: 'submitted',
      };

      render(<SessionSummaryScreen />, { wrapper: Wrapper });

      await waitFor(() => {
        screen.getByTestId('summary-submitted');
      });
      screen.getByText(
        'African landscapes vary hugely — from the Sahara to savannah to rainforest.',
      );
      screen.getByText('Nice connection between geography and climate zones.');
      // Input form and chips must not be rendered for a persisted summary.
      expect(screen.queryByTestId('summary-input')).toBeNull();
      expect(screen.queryByTestId('summary-prompt-chips')).toBeNull();
      expect(screen.queryByTestId('submit-summary-button')).toBeNull();
      expect(screen.queryByTestId('skip-summary-button')).toBeNull();
    });

    it('renders persisted reflection bonus XP when a submitted summary already has it', async () => {
      mockSessionSummaryData = {
        id: '880e8400-e29b-41d4-a716-446655440006',
        sessionId: '660e8400-e29b-41d4-a716-446655440000',
        content:
          'I learned that quadratic equations can have two possible answers.',
        aiFeedback: 'Good reflection.',
        status: 'submitted',
        baseXp: 12,
        reflectionBonusXp: 6,
      };

      render(<SessionSummaryScreen />, { wrapper: Wrapper });

      await waitFor(() => {
        screen.getByTestId('summary-submitted');
        screen.getByTestId('xp-bonus-earned');
        screen.getByText('+6 bonus XP earned!');
      });
      expect(screen.queryByTestId('summary-input')).toBeNull();
    });

    it('renders saved content when status is accepted (post-pipeline)', async () => {
      mockSessionSummaryData = {
        id: '880e8400-e29b-41d4-a716-446655440002',
        sessionId: '660e8400-e29b-41d4-a716-446655440000',
        content:
          'I learned about the Atlas Mountains and the Great Rift Valley.',
        aiFeedback: 'Great detail — you remembered specific landmarks.',
        status: 'accepted',
      };

      render(<SessionSummaryScreen />, { wrapper: Wrapper });

      await waitFor(() => {
        screen.getByTestId('summary-submitted');
      });
      screen.getByText(
        'I learned about the Atlas Mountains and the Great Rift Valley.',
      );
      expect(screen.queryByTestId('summary-input')).toBeNull();
    });

    it('renders read-only skipped-state (no input, no skip) when status is skipped', async () => {
      mockSessionSummaryData = {
        id: '880e8400-e29b-41d4-a716-446655440003',
        sessionId: '660e8400-e29b-41d4-a716-446655440000',
        content: '',
        aiFeedback: null,
        status: 'skipped',
      };

      render(<SessionSummaryScreen />, { wrapper: Wrapper });

      await waitFor(() => {
        screen.getByTestId('summary-skipped-state');
      });
      expect(screen.queryByTestId('summary-input')).toBeNull();
      expect(screen.queryByTestId('summary-prompt-chips')).toBeNull();
      expect(screen.queryByTestId('skip-summary-button')).toBeNull();
    });

    it('Continue does NOT call skipSummary when summary is already submitted', async () => {
      mockSessionSummaryData = {
        id: '880e8400-e29b-41d4-a716-446655440004',
        sessionId: '660e8400-e29b-41d4-a716-446655440000',
        content: 'Previously saved reflection text that must not be skipped.',
        aiFeedback: 'Good reflection.',
        status: 'submitted',
      };

      render(<SessionSummaryScreen />, { wrapper: Wrapper });

      await waitFor(() => {
        screen.getByTestId('continue-button');
      });

      await pressAsync(screen.getByTestId('continue-button'));

      await waitFor(() => {
        expect(mockReplace).toHaveBeenCalledWith('/(app)/home');
      });
    });

    it('Close (X) does NOT call skipSummary when summary is already submitted', async () => {
      mockSessionSummaryData = {
        id: '880e8400-e29b-41d4-a716-446655440005',
        sessionId: '660e8400-e29b-41d4-a716-446655440000',
        content: 'Existing summary content — close must be a no-op for skip.',
        aiFeedback: 'Helpful reflection.',
        status: 'submitted',
      };

      render(<SessionSummaryScreen />, { wrapper: Wrapper });

      await waitFor(() => {
        screen.getByTestId('summary-close-button');
      });

      fireEvent.press(screen.getByTestId('summary-close-button'));

      await waitFor(() => {
        expect(mockReplace).toHaveBeenCalledWith('/(app)/home');
      });
    });

    it('prefers router.back() over replace when canGoBack() is true on revisit continue', async () => {
      mockSessionSummaryData = {
        id: '880e8400-e29b-41d4-a716-446655440006',
        sessionId: '660e8400-e29b-41d4-a716-446655440000',
        content: 'Previously written summary content, revisited from the book.',
        aiFeedback: 'Nice work.',
        status: 'submitted',
      };
      mockCanGoBack.mockReturnValue(true);

      render(<SessionSummaryScreen />, { wrapper: Wrapper });

      await waitFor(() => {
        screen.getByTestId('continue-button');
      });

      await pressAsync(screen.getByTestId('continue-button'));

      await waitFor(() => {
        expect(mockBack).toHaveBeenCalled();
      });
      expect(mockReplace).not.toHaveBeenCalledWith('/(app)/home');
    });
  });

  // Bulletproof drafting — the user must never lose typed text. These tests
  // cover: autosave to SecureStore, rehydrate on mount, confirm-before-skip
  // on every exit path, and draft recovery on a previously-skipped session.
  describe('bulletproof drafting [DRAFT-BULLETPROOF-01]', () => {
    it('autosaves the draft after the user types (debounced)', async () => {
      mockReadSummaryDraft.mockResolvedValue(null);
      render(<SessionSummaryScreen />, { wrapper: Wrapper });
      await flushAsyncEffects();

      fireEvent.changeText(
        screen.getByTestId('summary-input'),
        'I learned about plants making their own food',
      );

      await waitFor(
        () => {
          expect(mockWriteSummaryDraft).toHaveBeenCalledWith(
            expect.any(String),
            '660e8400-e29b-41d4-a716-446655440000',
            'I learned about plants making their own food',
          );
        },
        { timeout: 1500 },
      );
    });

    it('rehydrates a stored draft into the input on mount', async () => {
      mockReadSummaryDraft.mockResolvedValue({
        profileId: mockTestProfileId,
        sessionId: '660e8400-e29b-41d4-a716-446655440000',
        content: 'unfinished thought about autotrophs',
        updatedAt: new Date().toISOString(),
      });

      render(<SessionSummaryScreen />, { wrapper: Wrapper });
      await flushAsyncEffects();

      await waitFor(() => {
        expect(screen.getByTestId('summary-input').props.value).toBe(
          'unfinished thought about autotrophs',
        );
      });
    });

    it('a typed-but-unsubmitted draft opens a confirm dialog on close, not a silent skip', async () => {
      render(<SessionSummaryScreen />, { wrapper: Wrapper });

      fireEvent.changeText(
        screen.getByTestId('summary-input'),
        'Some partial reflection text that is long enough',
      );

      fireEvent.press(screen.getByTestId('summary-close-button'));

      await waitFor(() => {
        expect(platformAlert).toHaveBeenCalled();
      });
      // Critical: we do NOT call skipSummary until the user chooses Discard.
    });

    it('"Discard" in the confirm dialog clears the draft and then skips the server record', async () => {
      render(<SessionSummaryScreen />, { wrapper: Wrapper });

      fireEvent.changeText(
        screen.getByTestId('summary-input'),
        'Some partial reflection text that is long enough',
      );
      await pressAsync(screen.getByTestId('summary-close-button'));

      await waitFor(() => {
        expect(platformAlert).toHaveBeenCalled();
      });

      const [, , buttons] = (platformAlert as jest.Mock).mock.calls[0];
      const discard = buttons.find(
        (b: { text: string }) => b.text === 'Discard',
      );
      await act(async () => {
        discard.onPress();
        await settleAsyncWork();
        await settleAsyncWork();
      });

      await waitFor(() => {
        expect(mockClearSummaryDraft).toHaveBeenCalled();
      });
      await waitFor(() => {
        expect(mockReplace).toHaveBeenCalledWith('/(app)/home');
      });
    });

    it('"Keep writing" in the confirm dialog does NOT call skip or clear', async () => {
      render(<SessionSummaryScreen />, { wrapper: Wrapper });

      fireEvent.changeText(
        screen.getByTestId('summary-input'),
        'Some partial reflection text that is long enough',
      );
      fireEvent.press(screen.getByTestId('summary-close-button'));

      await waitFor(() => {
        expect(platformAlert).toHaveBeenCalled();
      });

      const [, , buttons] = (platformAlert as jest.Mock).mock.calls[0];
      const keep = buttons.find(
        (b: { text: string }) => b.text === 'Keep writing',
      );
      await keep.onPress();

      // Yield one microtask to let any erroneous downstream calls land.
      await Promise.resolve();
      expect(mockReplace).not.toHaveBeenCalled();
    });

    it('"Submit now" in the confirm dialog submits the summary instead of skipping', async () => {
      mockSubmitResult = {
        summary: {
          id: '880e8400-e29b-41d4-a716-446655440001',
          sessionId: '660e8400-e29b-41d4-a716-446655440000',
          content: 'Some partial reflection text that is long enough',
          aiFeedback: 'Great reflection.',
          status: 'accepted',
        },
      };

      render(<SessionSummaryScreen />, { wrapper: Wrapper });

      fireEvent.changeText(
        screen.getByTestId('summary-input'),
        'Some partial reflection text that is long enough',
      );
      fireEvent.press(screen.getByTestId('summary-close-button'));

      await waitFor(() => {
        expect(platformAlert).toHaveBeenCalled();
      });

      const [, , buttons] = (platformAlert as jest.Mock).mock.calls[0];
      const submit = buttons.find(
        (b: { text: string }) => b.text === 'Submit now',
      );
      await act(async () => {
        submit.onPress();
        await settleAsyncWork();
        await settleAsyncWork();
      });

      await waitFor(() => {
        screen.getByTestId('summary-submitted');
      });
    });

    it('empty input + close still performs the silent skip (no dialog)', async () => {
      render(<SessionSummaryScreen />, { wrapper: Wrapper });

      // User types nothing, just taps X.
      await pressAsync(screen.getByTestId('summary-close-button'));

      await waitFor(() => {
        expect(mockReplace).toHaveBeenCalledWith('/(app)/home');
      });
      expect(platformAlert).not.toHaveBeenCalled();
    });

    it('rehydrated draft on a previously-skipped session shows the resubmit banner, not the read-only message', async () => {
      mockSessionSummaryData = {
        id: '880e8400-e29b-41d4-a716-446655440001',
        sessionId: '660e8400-e29b-41d4-a716-446655440000',
        content: '',
        aiFeedback: null,
        status: 'skipped',
      };
      mockReadSummaryDraft.mockResolvedValue({
        profileId: mockTestProfileId,
        sessionId: '660e8400-e29b-41d4-a716-446655440000',
        content: 'text I started last time but never submitted',
        updatedAt: new Date().toISOString(),
      });

      render(<SessionSummaryScreen />, { wrapper: Wrapper });
      await flushAsyncEffects();

      await waitFor(() => {
        screen.getByTestId('summary-resubmit-banner');
      });
      expect(screen.queryByTestId('summary-skipped-state')).toBeNull();
      expect(screen.getByTestId('summary-input').props.value).toBe(
        'text I started last time but never submitted',
      );
    });

    it('clears the stale draft when the session is already submitted server-side', async () => {
      mockSessionSummaryData = {
        id: '880e8400-e29b-41d4-a716-446655440001',
        sessionId: '660e8400-e29b-41d4-a716-446655440000',
        content: 'Already submitted on the server.',
        aiFeedback: 'Nice.',
        status: 'submitted',
      };

      render(<SessionSummaryScreen />, { wrapper: Wrapper });

      await waitFor(() => {
        expect(mockClearSummaryDraft).toHaveBeenCalled();
      });
    });
  });

  // ---------------------------------------------------------------------------
  // [BUG-134] Auth gate — deep-link entry to root-level screen
  // ---------------------------------------------------------------------------
  describe('auth gate [BUG-134]', () => {
    it('redirects to /sign-in when an unauthenticated user opens a session-summary deep-link', () => {
      // Break test: session-summary lives at the project root (not under
      // (app)/), so the (app)/_layout auth guard never fires. Without the
      // in-screen guard, an unauthenticated user gets a permanent loader.
      (useAuth as jest.Mock).mockReturnValue({
        isLoaded: true,
        isSignedIn: false,
      });

      render(<SessionSummaryScreen />, { wrapper: Wrapper });

      screen.getByTestId('mock-redirect-/sign-in');
      // The actual summary UI must not render — the redirect must come
      // before any data UI is reached.
      expect(screen.queryByTestId('summary-title')).toBeNull();
      expect(screen.queryByTestId('session-takeaways')).toBeNull();
    });

    it('shows a spinner (not redirect) while Clerk is still hydrating', () => {
      (useAuth as jest.Mock).mockReturnValue({
        isLoaded: false,
        isSignedIn: false,
      });

      render(<SessionSummaryScreen />, { wrapper: Wrapper });
      screen.getByTestId('session-summary-auth-loading');
      expect(screen.queryByTestId('mock-redirect-/sign-in')).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // [BUG-139] 404 must be classified by the shared classifier, not by raw
  // HTTP status duck-typing inline in the screen.
  // ---------------------------------------------------------------------------
  describe('expired-session classification [BUG-139]', () => {
    it('shows the expired UI when transcript fetch returns 404', async () => {
      // Server returns 404 — `assertOk()` throws an Error with .status = 404,
      // and the shared `classifyApiError()` categorises it as 'not-found'.
      // The screen MUST surface the expired UI rather than the generic
      // catch-all — proving the classifier (not inline status duck-typing)
      // drives the branch.
      mockFetch.setRoute(
        'transcript',
        () =>
          new Response(JSON.stringify({ message: 'Gone' }), { status: 404 }),
      );

      render(<SessionSummaryScreen />, { wrapper: Wrapper });

      await waitFor(() => {
        screen.getByTestId('expired-session-go-home');
      });
      // It must NOT fall through to the generic "Session not found"
      // catch-all — that branch is for non-404 errors.
      expect(screen.queryByTestId('session-not-found-go-home')).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // Feature 1: "You mastered these" row
  // ---------------------------------------------------------------------------

  // Minimal valid transcript — needed in tests that use waitFor so the
  // ZodError from parsing a null transcript response doesn't race and replace
  // the main content before our assertion fires.
  const validTranscriptData = {
    archived: false,
    session: {
      sessionId: '660e8400-e29b-41d4-a716-446655440000',
      subjectId: '550e8400-e29b-41d4-a716-446655440000',
      topicId: null,
      sessionType: 'learning',
      verificationType: null,
      status: 'completed',
      escalationRung: 1,
      exchangeCount: 5,
      startedAt: '2026-05-01T10:00:00.000Z',
      lastActivityAt: '2026-05-01T10:15:00.000Z',
      endedAt: '2026-05-01T10:15:00.000Z',
      durationSeconds: 900,
      wallClockSeconds: 900,
      rawInput: null,
      filedAt: null,
      filingStatus: null,
      filingRetryCount: 0,
      inputMode: 'text',
      milestonesReached: [],
    },
    exchanges: [],
  };

  function makeFreeformSession(
    overrides: Record<string, unknown> = {},
  ): Record<string, unknown> {
    return {
      id: '660e8400-e29b-41d4-a716-446655440000',
      subjectId: '550e8400-e29b-41d4-a716-446655440000',
      topicId: null,
      sessionType: 'learning',
      inputMode: 'text',
      verificationType: null,
      status: 'completed',
      escalationRung: 1,
      exchangeCount: 5,
      startedAt: '2026-05-01T10:00:00.000Z',
      lastActivityAt: '2026-05-01T10:15:00.000Z',
      endedAt: '2026-05-01T10:15:00.000Z',
      durationSeconds: 900,
      wallClockSeconds: 900,
      metadata: { effectiveMode: 'freeform' },
      rawInput: null,
      filedAt: null,
      filingStatus: null,
      filingRetryCount: 0,
      topicTitle: null,
      subjectName: null,
      bookId: null,
      bookTitle: null,
      ...overrides,
    };
  }

  describe('freeform Library filing controls', () => {
    beforeEach(() => {
      mockParams.sessionType = 'freeform';
      mockTranscriptData = validTranscriptData as never;
    });

    it("renders adding-to-Library copy and a Don't add action while pending", async () => {
      mockSessionData = makeFreeformSession({
        filingStatus: 'filing_pending',
      });

      render(<SessionSummaryScreen />, { wrapper: Wrapper });

      await waitFor(() => {
        screen.getByTestId('session-summary-library-filing');
      });
      screen.getByText('Adding this to your Library...');
      const action = screen.getByText("Don't add to Library");

      await pressAsync(action);

      expect(
        fetchCallsMatching(mockFetch, '/library-filing/keep-out'),
      ).toHaveLength(1);
    });

    it('renders Still adding copy after local polling times out and does not expose Retry', async () => {
      jest.useFakeTimers();
      mockSessionData = makeFreeformSession({
        filingStatus: 'filing_pending',
      });

      try {
        render(<SessionSummaryScreen />, { wrapper: Wrapper });

        await waitFor(() => {
          screen.getByText('Adding this to your Library...');
        });

        for (let i = 0; i < 10; i += 1) {
          await act(async () => {
            jest.advanceTimersByTime(3_000);
            await Promise.resolve();
            await Promise.resolve();
          });
        }

        await waitFor(() => {
          screen.getByText('Still adding this to your Library...');
        });
        expect(screen.queryByText('Retry')).toBeNull();
      } finally {
        jest.useRealTimers();
      }
    });

    it('does not offer Library filing for a 4-exchange freeform session', async () => {
      mockSessionData = makeFreeformSession({
        exchangeCount: 4,
        filingStatus: null,
      });

      render(<SessionSummaryScreen />, { wrapper: Wrapper });

      await expect(screen.findByText('Add to Library')).rejects.toThrow();
      expect(screen.queryByTestId('session-summary-library-filing')).toBeNull();
      expect(screen.queryByText('Add to Library')).toBeNull();
      expect(fetchCallsMatching(mockFetch, '/library-filing/add')).toHaveLength(
        0,
      );
    });

    it('renders Add to Library for a kept-out session', async () => {
      mockSessionData = makeFreeformSession({
        filingStatus: 'filing_kept_out',
      });

      render(<SessionSummaryScreen />, { wrapper: Wrapper });

      const action = await screen.findByText('Add to Library');
      await pressAsync(action);

      expect(
        fetchCallsMatching(mockFetch, '/library-filing/restore'),
      ).toHaveLength(1);
    });

    it('renders Retry for failed Library filing without raw error text', async () => {
      mockSessionData = makeFreeformSession({
        filingStatus: 'filing_failed',
        filingRetryCount: 3,
      });

      render(<SessionSummaryScreen />, { wrapper: Wrapper });

      const action = await screen.findByText('Retry');
      expect(screen.queryByText(/filing_failed/)).toBeNull();

      await pressAsync(action);

      expect(fetchCallsMatching(mockFetch, '/retry-filing')).toHaveLength(1);
    });

    it('renders filed destination, tap-through, and Remove from Library when topic info is available', async () => {
      mockSessionData = makeFreeformSession({
        topicId: mockSuggestedTopicAId,
        filedAt: '2026-05-01T10:16:00.000Z',
        filingStatus: 'filing_recovered',
        topicTitle: 'Photosynthesis basics',
        bookId: mockFiledBookId,
        bookTitle: 'Plant Biology',
        subjectName: 'Biology',
      });

      render(<SessionSummaryScreen />, { wrapper: Wrapper });

      await waitFor(() => {
        screen.getByText('Added to Library');
      });
      screen.getByText('Photosynthesis basics');
      screen.getByText('Plant Biology - Biology');

      fireEvent.press(screen.getByText('Open in Library'));
      expect(mockPush).toHaveBeenCalledWith({
        pathname: '/(app)/topic/[topicId]',
        params: {
          topicId: mockSuggestedTopicAId,
          subjectId: mockSubjectId,
          bookId: mockFiledBookId,
        },
      });

      const remove = screen.getByText('Remove from Library');
      await pressAsync(remove);
      expect(
        fetchCallsMatching(mockFetch, '/library-filing/keep-out'),
      ).toHaveLength(1);
    });
  });

  // W2 #11: homework now auto-files at exit and reuses the same filing
  // controls (gated on the mode-stable isHomeworkSession, with
  // alwaysFilingCandidate to bypass the freeform exchange floor).
  describe('homework Library filing controls (auto-file at exit)', () => {
    beforeEach(() => {
      mockParams.sessionType = 'homework';
      mockTranscriptData = validTranscriptData as never;
    });

    it('renders Remove for an auto-filed short homework session (bypasses the freeform floor)', async () => {
      // markSessionFiled sets topicId/filedAt but leaves filingStatus null;
      // 2 exchanges is below the freeform exchangeCount>=5 auto-file floor.
      mockSessionData = makeFreeformSession({
        sessionType: 'homework',
        topicId: mockSuggestedTopicAId,
        filedAt: '2026-05-01T10:16:00.000Z',
        filingStatus: null,
        topicTitle: 'Long division',
        exchangeCount: 2,
      });

      render(<SessionSummaryScreen />, { wrapper: Wrapper });

      await waitFor(() => {
        screen.getByTestId('session-summary-library-remove');
      });
    });

    it('keeps the control mounted (Add to restore) for a kept-out homework session [Blocker 1 gate]', async () => {
      // A filed-state parent gate would unmount here (topicId/filedAt null after
      // keep-out); the mode-stable isHomeworkSession gate keeps it rendered so
      // the learner can restore.
      mockSessionData = makeFreeformSession({
        sessionType: 'homework',
        topicId: null,
        filedAt: null,
        filingStatus: 'filing_kept_out',
        exchangeCount: 2,
      });

      render(<SessionSummaryScreen />, { wrapper: Wrapper });

      await waitFor(() => {
        screen.getByTestId('session-summary-library-filing');
      });
      screen.getByTestId('session-summary-library-add');
    });
  });

  describe('"You mastered" row', () => {
    it('shows mastered row when recentlyResolvedTopics is non-empty', async () => {
      mockRecentlyResolvedTopics = ['Quadratic equations', 'Factoring'];
      mockTranscriptData = validTranscriptData as never;

      render(<SessionSummaryScreen />, { wrapper: Wrapper });

      await waitFor(() => {
        screen.getByTestId('session-summary-mastered-row');
      });
      screen.getByText(/You mastered:/);
      screen.getByText(/Quadratic equations/);
      screen.getByText(/Factoring/);
    });

    it('hides mastered row when recentlyResolvedTopics is empty', async () => {
      mockRecentlyResolvedTopics = [];
      mockTranscriptData = validTranscriptData as never;

      render(<SessionSummaryScreen />, { wrapper: Wrapper });

      await flushAsyncEffects();

      expect(screen.queryByTestId('session-summary-mastered-row')).toBeNull();
    });

    it('hides mastered row in parent-proxy mode', async () => {
      mockRecentlyResolvedTopics = ['Algebra'];
      mockTranscriptData = validTranscriptData as never;
      mockUseParentProxy.mockReturnValue({
        isParentProxy: true,
        childProfile: { id: mockChildProfileId, birthYear: 2012 } as never,
        parentProfile: { id: mockParentProfileId, isOwner: true } as never,
      });

      render(<SessionSummaryScreen />, { wrapper: Wrapper });

      await flushAsyncEffects();

      expect(screen.queryByTestId('session-summary-mastered-row')).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // Feature 2: "Try this next" topic suggestions rail
  // ---------------------------------------------------------------------------
  describe('"Try this next" suggestions rail', () => {
    it('shows up to 3 suggestion cards when suggestions are available', async () => {
      mockTopicSuggestionsData = [
        {
          id: mockSuggestedTopicAId,
          bookId: mockFiledBookId,
          title: 'Quadratic Functions',
          createdAt: '2026-05-01T10:00:00.000Z',
          usedAt: null,
        },
        {
          id: mockSuggestedTopicBId,
          bookId: mockFiledBookId,
          title: 'Polynomial Division',
          createdAt: '2026-05-01T10:00:00.000Z',
          usedAt: null,
        },
        {
          id: mockSuggestedTopicCId,
          bookId: mockFiledBookId,
          title: 'Complex Numbers',
          createdAt: '2026-05-01T10:00:00.000Z',
          usedAt: null,
        },
        {
          id: mockSuggestedTopicDId,
          bookId: mockFiledBookId,
          title: 'Should not appear — 4th item',
          createdAt: '2026-05-01T10:00:00.000Z',
          usedAt: null,
        },
      ];
      mockParams.filedSubjectId = mockSubjectId;
      mockParams.filedBookId = mockFiledBookId;
      mockTranscriptData = validTranscriptData as never;

      render(<SessionSummaryScreen />, { wrapper: Wrapper });

      await waitFor(() => {
        screen.getByTestId('topic-suggestions-rail');
      });
      screen.getByText('Try this next');
      screen.getByText('Quadratic Functions');
      screen.getByText('Polynomial Division');
      screen.getByText('Complex Numbers');
      expect(screen.queryByText('Should not appear — 4th item')).toBeNull();
    });

    it('hides the suggestions rail when no suggestions are available', async () => {
      mockTopicSuggestionsData = [];
      mockTranscriptData = validTranscriptData as never;

      render(<SessionSummaryScreen />, { wrapper: Wrapper });

      await flushAsyncEffects();

      expect(screen.queryByTestId('topic-suggestions-rail')).toBeNull();
    });

    it('tapping a suggestion card navigates to the topic detail', async () => {
      mockTopicSuggestionsData = [
        {
          id: mockSuggestedTopicAId,
          bookId: mockFiledBookId,
          title: 'Quadratic Functions',
          createdAt: '2026-05-01T10:00:00.000Z',
          usedAt: null,
        },
      ];
      mockParams.filedSubjectId = mockSubjectId;
      mockParams.filedBookId = mockFiledBookId;
      mockTranscriptData = validTranscriptData as never;

      render(<SessionSummaryScreen />, { wrapper: Wrapper });

      const card = await screen.findByTestId('topic-suggestion-card');
      fireEvent.press(card);

      // [S5-H1] Suggestion push must include bookId and subjectId so the topic
      // screen receives the correct book/subject context.
      expect(mockPush).toHaveBeenCalledWith({
        pathname: '/(app)/topic/[topicId]',
        params: {
          topicId: mockSuggestedTopicAId,
          bookId: mockFiledBookId,
          subjectId: mockSubjectId,
        },
      });
    });
  });

  // ---------------------------------------------------------------------------
  // [LEARN-07] "See your Library" CTA must always navigate to Library
  // ---------------------------------------------------------------------------
  describe('"See your Library" CTA [LEARN-07]', () => {
    it('navigates to /(app)/library when topicId and subjectId are present in params', () => {
      // Previously the handler routed to topic detail when both params were set.
      // The CTA copy says "Library" — it must always go to Library.
      mockParams.topicId = 'topic-uuid-123';
      mockParams.subjectId = 'subject-uuid-456';

      render(<SessionSummaryScreen />, { wrapper: Wrapper });

      fireEvent.press(screen.getByTestId('go-to-library'));

      expect(mockReplace).toHaveBeenCalledWith('/(app)/library');
    });

    it('navigates to /(app)/library when no topicId/subjectId in params', () => {
      mockParams.topicId = undefined;
      mockParams.subjectId = undefined;

      render(<SessionSummaryScreen />, { wrapper: Wrapper });

      fireEvent.press(screen.getByTestId('go-to-library'));

      expect(mockReplace).toHaveBeenCalledWith('/(app)/library');
    });

    it('does not navigate to topic detail regardless of params', () => {
      mockParams.topicId = 'topic-uuid-789';
      mockParams.subjectId = 'subject-uuid-012';

      render(<SessionSummaryScreen />, { wrapper: Wrapper });

      fireEvent.press(screen.getByTestId('go-to-library'));

      // Must never route to topic detail — that is the bug this test guards against.
      expect(mockReplace).not.toHaveBeenCalledWith(
        expect.objectContaining({ pathname: '/(app)/topic/[topicId]' }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Feature 3: Purged-transcript badge
  // ---------------------------------------------------------------------------
  describe('purged-transcript badge', () => {
    it('shows the archived notice when purgedAt is set on the session summary', async () => {
      mockSessionSummaryData = {
        id: '880e8400-e29b-41d4-a716-446655440001',
        sessionId: '660e8400-e29b-41d4-a716-446655440000',
        content: 'Previously submitted summary.',
        aiFeedback: 'Good work.',
        status: 'submitted',
        purgedAt: '2026-05-01T10:00:00.000Z',
      };
      // Provide a valid transcript so the screen renders the main content,
      // not the "Session not found" error fallback.
      mockTranscriptData = validTranscriptData as never;

      render(<SessionSummaryScreen />, { wrapper: Wrapper });

      await waitFor(() => {
        screen.getByTestId('transcript-purged-badge');
      });
      screen.getByTestId('transcript-purged-badge-label');
      screen.getByText('Transcript archived');
      screen.getByText(
        'This session was summarised; the original transcript was archived.',
      );
      // The "View full transcript" button must NOT appear when purged.
      expect(screen.queryByTestId('view-transcript-cta')).toBeNull();
    });

    it('shows the "View full transcript" button when purgedAt is null', async () => {
      mockSessionSummaryData = {
        id: '880e8400-e29b-41d4-a716-446655440001',
        sessionId: '660e8400-e29b-41d4-a716-446655440000',
        content: 'Previously submitted summary.',
        aiFeedback: 'Good work.',
        status: 'submitted',
        purgedAt: null,
      };
      mockTranscriptData = validTranscriptData as never;

      render(<SessionSummaryScreen />, { wrapper: Wrapper });

      await waitFor(() => {
        screen.getByTestId('view-transcript-cta');
      });
      expect(screen.queryByTestId('transcript-purged-badge')).toBeNull();
    });

    it('shows the "View full transcript" button when purgedAt is absent', async () => {
      // purgedAt is optional — existing sessions without the field must show
      // the link, not the archived notice.
      mockSessionSummaryData = null;
      mockTranscriptData = validTranscriptData as never;

      render(<SessionSummaryScreen />, { wrapper: Wrapper });

      await waitFor(() => {
        screen.getByTestId('view-transcript-cta');
      });
      expect(screen.queryByTestId('transcript-purged-badge')).toBeNull();
    });

    it('hides both badge and transcript button in parent-proxy mode', async () => {
      mockSessionSummaryData = {
        id: '880e8400-e29b-41d4-a716-446655440001',
        sessionId: '660e8400-e29b-41d4-a716-446655440000',
        content: 'Previously submitted summary.',
        aiFeedback: null,
        status: 'submitted',
        purgedAt: '2026-05-01T10:00:00.000Z',
      };
      mockUseParentProxy.mockReturnValue({
        isParentProxy: true,
        childProfile: { id: mockChildProfileId, birthYear: 2012 } as never,
        parentProfile: { id: mockParentProfileId, isOwner: true } as never,
      });

      render(<SessionSummaryScreen />, { wrapper: Wrapper });

      await flushAsyncEffects();

      expect(screen.queryByTestId('transcript-purged-badge')).toBeNull();
      expect(screen.queryByTestId('view-transcript-cta')).toBeNull();
    });
  });

  describe('[BUG-890] learner recap loading failure', () => {
    beforeEach(() => {
      mockSentryCaptureMessage.mockClear();
      mockSentryCaptureException.mockClear();
      // Sessions ≥3 exchanges trigger the recap rail; default exchangeCount=5.
      mockTranscriptData = validTranscriptData as never;
    });

    it('escalates the recap-load timeout to Sentry and auto-refetches before showing manual retry', async () => {
      jest.useFakeTimers();
      try {
        // Override the sessions route so /summary returns NO learnerRecap —
        // this is the failure mode the bug describes (initial fetch silently
        // produces an empty recap). The screen's polling interval should run,
        // the 15s recap-timeout fires, Sentry is notified, an auto-refetch
        // is triggered, and only then does the manual "Tap to retry" surface.
        let summaryCallCount = 0;
        mockFetch.setRoute('sessions', (url: string, init?: RequestInit) => {
          if (url.includes('/summary') && init?.method === 'POST') {
            return new Response(JSON.stringify({}), { status: 500 });
          }
          if (url.includes('/summary')) {
            summaryCallCount += 1;
            return { summary: { ...BASE_MOCK_SUMMARY, learnerRecap: null } };
          }
          return { session: mockSessionData };
        });

        render(<SessionSummaryScreen />, { wrapper: Wrapper });

        // Initial fetch settles with no recap; skeleton renders.
        await act(async () => {
          await Promise.resolve();
          await Promise.resolve();
        });
        await waitFor(() => {
          screen.getByTestId('session-recap-skeleton');
        });
        const callsBeforeTimeout = summaryCallCount;

        // Advance past the 15s timeout deadline.
        await act(async () => {
          jest.advanceTimersByTime(16_000);
          await Promise.resolve();
          await Promise.resolve();
        });

        // Sentry MUST be notified — silent recovery is banned.
        await waitFor(() => {
          expect(mockSentryCaptureMessage).toHaveBeenCalledWith(
            'session-summary recap load timed out',
            expect.objectContaining({
              level: 'warning',
              tags: expect.objectContaining({
                surface: 'session-summary',
                failure: 'recap-timeout',
              }),
              extra: expect.objectContaining({
                sessionId: expect.any(String),
                exchangeCount: 5,
              }),
            }),
          );
        });

        // Auto-refetch MUST have fired (at least one summary call after the
        // timeout) — the user shouldn't have to discover the manual retry.
        await waitFor(() => {
          expect(summaryCallCount).toBeGreaterThan(callsBeforeTimeout);
        });

        // Manual fallback still surfaces after timeout for last-resort retry.
        await waitFor(() => {
          screen.getByTestId('session-recap-timeout');
        });
      } finally {
        jest.useRealTimers();
      }
    });

    it('manual "Tap to retry" triggers a refetch when pressed', async () => {
      jest.useFakeTimers();
      try {
        let summaryCallCount = 0;
        mockFetch.setRoute('sessions', (url: string, init?: RequestInit) => {
          if (url.includes('/summary') && init?.method === 'POST') {
            return new Response(JSON.stringify({}), { status: 500 });
          }
          if (url.includes('/summary')) {
            summaryCallCount += 1;
            return { summary: { ...BASE_MOCK_SUMMARY, learnerRecap: null } };
          }
          return { session: mockSessionData };
        });

        render(<SessionSummaryScreen />, { wrapper: Wrapper });

        await act(async () => {
          await Promise.resolve();
          await Promise.resolve();
        });

        // Force the timeout fallback to render.
        await act(async () => {
          jest.advanceTimersByTime(16_000);
          await Promise.resolve();
          await Promise.resolve();
        });

        const retryButton = await screen.findByTestId('session-recap-retry');
        const callsBeforePress = summaryCallCount;

        await act(async () => {
          fireEvent.press(retryButton);
          await Promise.resolve();
          await Promise.resolve();
        });

        await waitFor(() => {
          expect(summaryCallCount).toBeGreaterThan(callsBeforePress);
        });
      } finally {
        jest.useRealTimers();
      }
    });
  });
});
