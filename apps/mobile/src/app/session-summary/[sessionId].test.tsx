import {
  act,
  render,
  screen,
  fireEvent,
  waitFor,
} from '@testing-library/react-native';
import React from 'react';
import { platformAlert } from '../../lib/platform-alert';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createRoutedMockFetch } from '../../test-utils/mock-api-routes';

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

jest.mock('expo-router', () => ({
  useRouter: () => ({
    replace: mockReplace,
    push: mockPush,
    back: mockBack,
    canGoBack: mockCanGoBack,
  }),
  useLocalSearchParams: () => mockParams,
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

jest.mock('../../lib/theme', () => ({
  useThemeColors: () => ({
    muted: '#a3a3a3',
    textInverse: '#0f0f0f',
  }),
}));

jest.mock('../../lib/sentry', () => ({
  Sentry: {
    addBreadcrumb: jest.fn(),
  },
}));

jest.mock('../../lib/platform-alert', () => ({
  platformAlert: jest.fn(),
}));

// [BUG-800] formatApiError stub: returns Error.message verbatim so tests can
// assert the typed server reason reaches platformAlert.
jest.mock('../../lib/format-api-error', () => ({
  formatApiError: (e: unknown) =>
    e instanceof Error ? e.message : 'Unknown error',
}));

jest.mock('../../lib/profile', () => ({
  useProfile: () => ({
    activeProfile: {
      id: 'test-profile-id',
      accountId: 'test-account-id',
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
        id: 'test-profile-id',
        accountId: 'test-account-id',
        displayName: 'Test Learner',
        isOwner: true,
        birthYear: 2012,
      },
    ],
    setActiveProfileId: jest.fn(),
    isRestoringId: false,
  }),
  personaFromBirthYear: () => 'learner',
  isGuardianProfile: () => false,
}));

// use-parent-proxy uses setProxyMode from api-client (not the RPC useApiClient hook)
// plus SecureStore reads — not an API hook. Keep as a direct mock.
const mockUseParentProxy = jest.fn(() => ({
  isParentProxy: false,
  childProfile: null,
  parentProfile: null,
}));
jest.mock('../../hooks/use-parent-proxy', () => ({
  useParentProxy: () => mockUseParentProxy(),
}));

// use-rating-prompt reads/writes SecureStore and calls expo-store-review —
// no useApiClient() calls — keep as a direct mock.
const mockOnSuccessfulRecall = jest.fn();
jest.mock('../../hooks/use-rating-prompt', () => ({
  useRatingPrompt: () => ({
    onSuccessfulRecall: mockOnSuccessfulRecall,
  }),
}));

// useDepthEvaluation fires a mutation from a useEffect on mount (fire-and-forget
// analytics). With TanStack Query's synchronous notifyManager in tests, calling
// mutate() from within a useEffect causes React 19 to throw an invariant error
// (sync state update from within effect commit). Keep as a no-op direct mock.
jest.mock('../../hooks/use-depth-evaluation', () => ({
  useDepthEvaluation: () => ({ mutate: jest.fn() }),
}));

const mockReadSummaryDraft = jest.fn();
const mockWriteSummaryDraft = jest.fn();
const mockClearSummaryDraft = jest.fn();

jest.mock('../../lib/summary-draft', () => ({
  readSummaryDraft: (...args: unknown[]) => mockReadSummaryDraft(...args),
  writeSummaryDraft: (...args: unknown[]) => mockWriteSummaryDraft(...args),
  clearSummaryDraft: (...args: unknown[]) => mockClearSummaryDraft(...args),
  DRAFT_TTL_MS: 7 * 24 * 60 * 60 * 1000,
}));

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
} | null = null;
let mockTotalSessions = 0;

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
  consecutiveSummarySkips: 1,
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
    profileId: 'test-profile-id',
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
    // Always include learnerRecap in the response so refetchInterval returns
    // false and stops polling. Without it, useSessionSummary polls every 2s
    // with the synchronous notifyManager, creating continuous re-renders that
    // overwhelm React 19 and trigger its infinite-update guard.
    // For null: return status-less object (isAlreadyPersisted stays false,
    // so the input form renders as expected).
    if (url.includes('/summary')) {
      if (mockSessionSummaryData === null) {
        return { summary: { learnerRecap: 'mock-recap' } };
      }
      return {
        summary: { ...mockSessionSummaryData, learnerRecap: 'mock-recap' },
      };
    }
    // GET /sessions/:id (session entity)
    return { session: null };
  },
  // PUT /settings/learning-mode
  'learning-mode': () => ({ mode: 'casual' }),
});

jest.mock('../../lib/api-client', () =>
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
    },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

// Alias for tests that were already using `Wrapper` directly.
let Wrapper: ReturnType<typeof createWrapper>;

const SessionSummaryScreen = require('./[sessionId]').default;

async function pressAsync(
  element: Parameters<typeof fireEvent.press>[0],
): Promise<void> {
  await act(async () => {
    fireEvent.press(element);
  });
}

describe('SessionSummaryScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (platformAlert as jest.Mock).mockClear();
    mockReadSummaryDraft.mockResolvedValue(null);
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
        id: 'summary-1',
        sessionId: '660e8400-e29b-41d4-a716-446655440000',
        content: '',
        aiFeedback: null,
        status: 'skipped',
      },
      consecutiveSummarySkips: 1,
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
    mockTranscriptData = null;
    mockSessionSummaryData = null;
    mockTotalSessions = 0;
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
          return { summary: { learnerRecap: 'mock-recap' } };
        }
        return {
          summary: { ...mockSessionSummaryData, learnerRecap: 'mock-recap' },
        };
      }
      return { session: null };
    });
    // Create a fresh wrapper (and QueryClient) per test to prevent cross-test
    // query cache contamination from async fetch-boundary responses.
    Wrapper = createWrapper();
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
      screen.getByText('What your tutor knows about you.');
      screen.getByText('Tap to review or change.');

      fireEvent.press(cue);

      expect(mockPush).toHaveBeenCalledWith('/(app)/mentor-memory');
    });

    it('routes parent-proxy users to the child mentor-memory screen when consented', async () => {
      mockTotalSessions = 2;
      mockUseParentProxy.mockReturnValue({
        isParentProxy: true,
        childProfile: {
          id: 'child-profile-id',
          birthYear: 2012,
          consentStatus: 'CONSENTED',
        } as never,
        parentProfile: { id: 'parent-1', isOwner: true } as never,
      });

      render(<SessionSummaryScreen />, { wrapper: Wrapper });

      fireEvent.press(
        await screen.findByTestId('session-summary-mentor-memory-cue'),
      );

      expect(mockPush).toHaveBeenCalledWith({
        pathname: '/(app)/child/[profileId]/mentor-memory',
        params: { profileId: 'child-profile-id' },
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
          id: 'child-profile-id',
          birthYear: 2012,
          consentStatus: 'PENDING',
        } as never,
        parentProfile: { id: 'parent-1', isOwner: true } as never,
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
        id: 'summary-1',
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

  it('shows Continue button after submission', async () => {
    mockSubmitResult = {
      summary: {
        id: 'summary-1',
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

  it('triggers the rating prompt hook before leaving a recall summary', async () => {
    mockSubmitResult = {
      summary: {
        id: 'summary-1',
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

  it('shows a summary warning when the skip threshold is reached', async () => {
    mockSkipResult = {
      summary: {
        id: 'summary-1',
        sessionId: '660e8400-e29b-41d4-a716-446655440000',
        content: '',
        aiFeedback: null,
        status: 'skipped',
      },
      consecutiveSummarySkips: 5,
    };

    render(<SessionSummaryScreen />, { wrapper: Wrapper });

    await pressAsync(screen.getByTestId('skip-summary-button'));

    await waitFor(() => {
      expect(platformAlert).toHaveBeenCalledWith(
        'Summaries help you learn',
        'Students who reflect remember 2x more. Try it next time!',
        expect.arrayContaining([expect.objectContaining({ text: 'Got it' })]),
      );
    });
    expect(mockReplace).not.toHaveBeenCalled();

    const promptButtons = (platformAlert as jest.Mock).mock.calls[0]?.[2] as
      | Array<{ text?: string; onPress?: () => void }>
      | undefined;
    const okButton = promptButtons?.find((button) => button.text === 'Got it');
    expect(okButton?.onPress).toBeInstanceOf(Function);

    okButton?.onPress?.();

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/(app)/home');
    });
  });

  it('shows recall bridge questions after homework skip', async () => {
    mockParams.sessionType = 'homework';
    mockFetch.setRoute('recall-bridge', () => ({
      questions: ['What method did you use?', 'Why does it work?'],
      topicId: 'topic-1',
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
      topicId: 'topic-1',
      topicTitle: 'Algebra',
    }));

    render(<SessionSummaryScreen />, { wrapper: Wrapper });

    await pressAsync(screen.getByTestId('skip-summary-button'));

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/(app)/home');
    });
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
        return { summary: null };
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
        return { summary: null };
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
        return { summary: null };
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
          id: 'summary-1',
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
        childProfile: { id: 'test-profile-id', birthYear: 2012 } as never,
        parentProfile: { id: 'parent-1', isOwner: true } as never,
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
        childProfile: { id: 'test-profile-id', birthYear: 2012 } as never,
        parentProfile: { id: 'parent-1', isOwner: true } as never,
      });

      render(<SessionSummaryScreen />, { wrapper: Wrapper });

      expect(screen.queryByTestId('view-transcript-cta')).toBeNull();
    });
  });

  // BUG-449: revisiting a past session (Library → Shelf → Book → tap session)
  // must render the already-saved summary, not the empty "Your Words" prompt.
  describe('revisiting a session with an already-persisted summary [BUG-449]', () => {
    it('renders saved content + AI feedback (not the empty input) when status is submitted', async () => {
      mockSessionSummaryData = {
        id: 'summary-1',
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

    it('renders saved content when status is accepted (post-pipeline)', async () => {
      mockSessionSummaryData = {
        id: 'summary-2',
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
        id: 'summary-3',
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
        id: 'summary-4',
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
        id: 'summary-5',
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
        id: 'summary-6',
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
      render(<SessionSummaryScreen />, { wrapper: Wrapper });

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
        profileId: 'test-profile-id',
        sessionId: '660e8400-e29b-41d4-a716-446655440000',
        content: 'unfinished thought about autotrophs',
        updatedAt: new Date().toISOString(),
      });

      render(<SessionSummaryScreen />, { wrapper: Wrapper });

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
          id: 'summary-1',
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
        id: 'summary-1',
        sessionId: '660e8400-e29b-41d4-a716-446655440000',
        content: '',
        aiFeedback: null,
        status: 'skipped',
      };
      mockReadSummaryDraft.mockResolvedValue({
        profileId: 'test-profile-id',
        sessionId: '660e8400-e29b-41d4-a716-446655440000',
        content: 'text I started last time but never submitted',
        updatedAt: new Date().toISOString(),
      });

      render(<SessionSummaryScreen />, { wrapper: Wrapper });

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
        id: 'summary-1',
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
});
