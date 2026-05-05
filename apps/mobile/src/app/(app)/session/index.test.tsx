import type { InputMode } from '@eduagent/schemas';
import React from 'react';
import { Alert } from 'react-native';
import {
  render,
  fireEvent,
  waitFor,
  act,
  screen,
  within,
} from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  fetchCallsMatching,
  extractJsonBody,
  type RoutedMockFetch,
} from '../../../test-utils/mock-api-routes';
import SessionScreen from './index';

// ---------------------------------------------------------------------------
// Fetch boundary mock — API-calling hooks run against this
// ---------------------------------------------------------------------------
//
// IMPORTANT: jest.mock() factories are hoisted above all module-level code by
// babel-jest. That means `const mockFetch = createRoutedMockFetch(...)` would
// run AFTER the factory, so `mockFetch` would be undefined inside the factory
// (Temporal Dead Zone). To avoid this we create the mockFetch instance INSIDE
// the factory and expose it via `global.__sessionTestMockFetch` so the rest of
// the test file can reference it through a typed alias below.

jest.mock('../../../lib/api-client', () => {
  const {
    createRoutedMockFetch: _create,
    mockApiClientFactory: _factory,
  } = require('../../../test-utils/mock-api-routes');
  // IMPORTANT: Routes are matched by url.includes(pattern) in insertion order.
  // More-specific patterns must come BEFORE general ones to avoid shadowing.
  const _mockFetch = _create({
    '/streaks': { streak: { longestStreak: 1 } },
    '/progress/overview': { totalTopicsCompleted: 0 },
    '/progress/inventory': {
      global: {
        topicsAttempted: 0,
        topicsMastered: 0,
        vocabularyTotal: 0,
        vocabularyMastered: 0,
        totalSessions: 0,
        totalActiveMinutes: 0,
        totalWallClockMinutes: 0,
        currentStreak: 0,
        longestStreak: 0,
      },
      subjects: [],
    },
    // Default: no active session for topic (null = route not matched → empty 200)
    // Per-test overrides use mockFetch.setRoute('/progress/topic', ...)

    // --- Subject sub-resources (most specific first) ---
    // Must precede '/subjects' so they are not shadowed by the general subjects route.
    '/subjects/classify': { candidates: [], needsConfirmation: false },
    '/subjects/resolve': {
      suggestions: [],
      displayMessage: 'Pick a subject that fits, or create your own.',
    },
    // curriculum: subjects/:id/curriculum — must precede '/subjects'
    '/curriculum': {
      curriculum: {
        topics: [
          {
            id: 'topic-1',
            title: 'Topic 1',
            description: 'Desc',
            skipped: false,
          },
        ],
      },
    },
    // sessions: subjects/:id/sessions — must precede '/subjects'
    '/sessions': { session: { id: 'session-1' } },
    // homework-state: sessions/:id/homework-state
    '/homework-state': {
      metadata: { problemCount: 2, currentProblemIndex: 0, problems: [] },
    },
    // General subjects list / create — must come after all /subjects/* specifics
    '/subjects': {
      subjects: [{ id: 'subject-1', name: 'Math', status: 'active' }],
    },

    '/celebration-level': { celebrationLevel: 'full' },
    // bookmarks/session must precede /bookmarks
    '/bookmarks/session': { bookmarks: [] },
    '/bookmarks': { bookmark: { id: 'bookmark-1' } },
    '/filing': { shelfId: 'shelf-1', bookId: 'book-1' },
    // direct apiClient calls (use-session-streaming)
    '/celebrations/pending': { pendingCelebrations: [] },
    '/celebrations/seen': { ok: true },
  });
  // Expose for test assertions — accessed via the `mockFetch` alias below
  (
    global as { __sessionTestMockFetch?: typeof _mockFetch }
  ).__sessionTestMockFetch = _mockFetch;
  return _factory(_mockFetch);
});

// Typed alias so tests can call mockFetch.setRoute / fetchCallsMatching etc.
// Safe to read here because jest.mock factories run synchronously before
// any test code (and before this assignment).
const mockFetch = (global as { __sessionTestMockFetch?: RoutedMockFetch })
  .__sessionTestMockFetch!;

// ---------------------------------------------------------------------------
// QueryClient wrapper
// ---------------------------------------------------------------------------

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

// ---------------------------------------------------------------------------
// Session hook mocks (use-sessions stays mocked because useStreamMessage uses
// XHR via streamSSEViaXHR, which bypasses useApiClient and cannot be
// intercepted through mockFetch).
// ---------------------------------------------------------------------------

const mockStartSession = jest.fn();
const mockCloseSession = jest.fn();
const mockStream = jest.fn();
const mockRecordSystemPrompt = jest.fn();
const mockRecordSessionEvent = jest.fn();
const mockSetSessionInputMode = jest.fn();
const mockFlagSessionContent = jest.fn();
const mockReplace = jest.fn();
const mockSetParams = jest.fn();

type TranscriptMockReturn = {
  data: null | {
    archived: false;
    session: {
      sessionId: string;
      exchangeCount: number;
      inputMode: string;
      milestonesReached: unknown[];
      verificationType?: unknown;
    };
    exchanges: Array<{
      role: string;
      content: string;
      timestamp: string;
      eventId: string;
      isSystemPrompt: boolean;
      escalationRung: number;
    }>;
  };
};
const mockUseSessionTranscript = jest.fn<TranscriptMockReturn, [string?]>(
  () => ({ data: null })
);
jest.mock('../../../hooks/use-sessions', () => ({
  useStartSession: () => ({
    mutateAsync: mockStartSession,
  }),
  useCloseSession: () => ({
    mutateAsync: mockCloseSession,
  }),
  useStreamMessage: () => ({
    stream: mockStream,
  }),
  useSessionTranscript: (sessionId: string) =>
    mockUseSessionTranscript(sessionId),
  useRecordSystemPrompt: () => ({ mutateAsync: mockRecordSystemPrompt }),
  useRecordSessionEvent: () => ({ mutateAsync: mockRecordSessionEvent }),
  useSetSessionInputMode: () => ({ mutateAsync: mockSetSessionInputMode }),
  useFlagSessionContent: () => ({ mutateAsync: mockFlagSessionContent }),
  useParkingLot: () => ({ data: [], isLoading: false }),
  useAddParkingLotItem: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));

// ---------------------------------------------------------------------------
// Local-state / device hooks — no useApiClient(), keep as mocks
// ---------------------------------------------------------------------------

jest.mock('../../../hooks/use-network-status', () => ({
  useNetworkStatus: () => ({ isOffline: false }),
}));

jest.mock('../../../hooks/use-api-reachability', () => ({
  useApiReachability: () => ({ isApiReachable: true, isChecked: true }),
}));

const mockTrigger = jest.fn();
const mockCelebrationResult = {
  CelebrationOverlay: null,
  trigger: mockTrigger,
};
jest.mock('../../../hooks/use-celebration', () => ({
  useCelebration: () => mockCelebrationResult,
}));

const mockTrackExchangeResult = { triggered: [] as string[], trackerState: {} };
const mockTrackExchange = jest.fn().mockReturnValue(mockTrackExchangeResult);
const mockHydrate = jest.fn();
const mockResetMilestones = jest.fn();
const mockMilestoneTracker = {
  milestonesReached: [] as string[],
  trackerState: {},
  trackExchange: mockTrackExchange,
  hydrate: mockHydrate,
  reset: mockResetMilestones,
};
jest.mock('../../../hooks/use-milestone-tracker', () => ({
  celebrationForReason: jest.fn(),
  createMilestoneTrackerStateFromMilestones: jest.fn().mockReturnValue({}),
  normalizeMilestoneTrackerState: jest.fn().mockReturnValue({}),
  useMilestoneTracker: () => mockMilestoneTracker,
}));

// ---------------------------------------------------------------------------
// External / rendering mocks
// ---------------------------------------------------------------------------

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('expo-router', () => ({
  useRouter: jest.fn(),
  useLocalSearchParams: jest.fn(),
  useFocusEffect: (callback: () => void) => {
    const { useEffect } = require('react');
    useEffect(() => callback(), [callback]);
  },
}));

jest.mock('../../../components/session', () => ({
  ChatShell: ({
    subtitle,
    headerBelow,
    messages,
    inputAccessory,
    belowInput,
    inputMode,
    onInputModeChange,
    onSend,
    renderMessageActions,
    rightAction,
    footer,
    inputDisabled,
    disabledReason,
  }: {
    subtitle?: string;
    headerBelow?: React.ReactNode;
    messages?: Array<{ id: string; content: string }>;
    inputAccessory?: React.ReactNode;
    belowInput?: React.ReactNode;
    inputMode?: InputMode;
    onInputModeChange?: (mode: InputMode) => void;
    onSend: (text: string) => void;
    renderMessageActions?: (message: {
      id: string;
      role: string;
      content: string;
      eventId?: string;
      streaming?: boolean;
      isSystemPrompt?: boolean;
    }) => React.ReactNode;
    rightAction?: React.ReactNode;
    footer?: React.ReactNode;
    inputDisabled?: boolean;
    disabledReason?: string;
  }) => {
    const { View, Text, Pressable } = require('react-native');
    return (
      <View>
        <Text testID="session-subtitle">{subtitle}</Text>
        <Text testID="mock-input-mode">{inputMode ?? 'text'}</Text>
        {headerBelow}
        {inputDisabled && disabledReason ? (
          <View testID="input-disabled-banner">
            <Text>{disabledReason}</Text>
          </View>
        ) : null}
        {(messages ?? []).map((message) => (
          <View key={message.id} testID={`mock-message-${message.id}`}>
            <Text>{message.content}</Text>
            {renderMessageActions?.(message as never)}
          </View>
        ))}
        {inputAccessory}
        {belowInput}
        {rightAction}
        {footer}
        <Pressable
          testID="mock-set-voice-mode"
          onPress={() => onInputModeChange?.('voice')}
        >
          <Text>Voice mode</Text>
        </Pressable>
        <Pressable
          testID="mock-set-text-mode"
          onPress={() => onInputModeChange?.('text')}
        >
          <Text>Text mode</Text>
        </Pressable>
        <Pressable
          testID="manual-send-button"
          onPress={() => onSend('Solve 2x + 5 = 17')}
        >
          <Text>Send</Text>
        </Pressable>
      </View>
    );
  },
  animateResponse: jest.fn(),
  getModeConfig: jest.fn().mockReturnValue({
    title: 'Homework',
    subtitle: 'Homework help',
    placeholder: 'Ask for help',
    showTimer: false,
    showQuestionCount: false,
  }),
  getOpeningMessage: jest.fn().mockReturnValue('Let us tackle this worksheet.'),
  SessionTimer: () => null,
  MilestoneDots: () => null,
  QuestionCounter: () => null,
  LibraryPrompt: () => null,
  SessionInputModeToggle: () => null,
  QuotaExceededCard: ({
    details,
    isOwner,
  }: {
    details: { reason: string };
    isOwner: boolean;
  }) => {
    const { View, Text } = require('react-native');
    return (
      <View testID="quota-exceeded-card">
        <Text>{isOwner ? 'Upgrade plan' : 'Ask your parent'}</Text>
        <Text>
          {details.reason === 'daily' ? "today's limit" : "this month's limit"}
        </Text>
      </View>
    );
  },
}));

jest.mock('../../../lib/session-recovery', () => ({
  clearSessionRecoveryMarker: jest.fn().mockResolvedValue(undefined),
  readSessionRecoveryMarker: jest.fn().mockResolvedValue(null),
  writeSessionRecoveryMarker: jest.fn().mockResolvedValue(undefined),
}));

const secureStore: Record<string, string> = {};
jest.mock('../../../lib/secure-storage', () => ({
  getItemAsync: jest.fn((key: string) =>
    Promise.resolve(secureStore[key] ?? null)
  ),
  setItemAsync: jest.fn((key: string, value: string) => {
    secureStore[key] = value;
    return Promise.resolve();
  }),
  // [I-4] sanitizeSecureStoreKey is a pure string function — no mock needed,
  // but the module mock must export it or callers get "not a function".
  sanitizeSecureStoreKey: (raw: string) => raw.replace(/[^a-zA-Z0-9._-]/g, '_'),
}));

const { readSessionRecoveryMarker: mockReadSessionRecoveryMarker } =
  require('../../../lib/session-recovery') as {
    readSessionRecoveryMarker: jest.Mock;
  };

jest.mock('../../../lib/format-api-error', () => ({
  formatApiError: (error: unknown) =>
    error instanceof Error ? error.message : 'Unknown error',
}));

jest.mock('../../../lib/profile', () => ({
  useProfile: () => ({
    activeProfile: {
      id: 'profile-1',
      accountId: 'test-account-id',
      displayName: 'Test Learner',
      isOwner: true,
      hasPremiumLlm: false,
      conversationLanguage: 'en',
      pronouns: null,
      consentStatus: null,
    },
  }),
  ProfileContext: {
    Provider: ({ children }: { children: React.ReactNode }) => children,
  },
}));

describe('SessionScreen homework flow', () => {
  async function flushAsyncWork(): Promise<void> {
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
  }

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockFetch.mockClear();
    mockUseSessionTranscript.mockReturnValue({ data: null });
    // Default: no active session (null response body)
    mockFetch.setRoute('/progress/topic', null);
    // Clear SecureStore mock data
    Object.keys(secureStore).forEach((key) => delete secureStore[key]);
    let aiEventCount = 0;
    (useRouter as jest.Mock).mockReturnValue({
      replace: mockReplace,
      setParams: mockSetParams,
    });
    (useLocalSearchParams as jest.Mock).mockReturnValue({
      mode: 'homework',
      subjectId: 'subject-1',
      subjectName: 'Math',
      homeworkProblems: JSON.stringify([
        {
          id: 'problem-1',
          text: 'Solve 2x + 5 = 17',
          source: 'ocr',
        },
        {
          id: 'problem-2',
          text: 'Factor x^2 + 3x + 2',
          source: 'ocr',
        },
      ]),
    });
    mockStartSession.mockResolvedValue({
      session: { id: 'session-1' },
    });
    mockStream.mockImplementation(
      async (
        _message: string,
        onChunk: (value: string) => void,
        onDone: (result: {
          exchangeCount: number;
          escalationRung: number;
          aiEventId?: string;
        }) => void
      ) => {
        // Real SSE streams always emit at least one token before completion
        onChunk('Got it.');
        onDone({
          exchangeCount: 1,
          escalationRung: 1,
          aiEventId: `event-${++aiEventCount}`,
        });
      }
    );
    mockRecordSystemPrompt.mockResolvedValue({ ok: true });
    mockCloseSession.mockResolvedValue({ wallClockSeconds: 120 });
    mockSetSessionInputMode.mockResolvedValue({
      session: { id: 'session-1', inputMode: 'voice' },
    });
    mockFlagSessionContent.mockResolvedValue({
      message: 'Content flagged for review. Thank you!',
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('keeps homework progress in one session when moving to the next problem', async () => {
    const wrapper = createWrapper();
    const testScreen = render(<SessionScreen />, { wrapper });

    fireEvent.press(testScreen.getByTestId('manual-send-button'));
    await flushAsyncWork();

    await waitFor(() => {
      expect(mockStream).toHaveBeenCalledWith(
        'Solve 2x + 5 = 17',
        expect.any(Function),
        expect.any(Function),
        'session-1',
        expect.objectContaining({ idempotencyKey: expect.any(String) })
      );
    });
    expect(mockStartSession).toHaveBeenCalledTimes(1);

    expect(
      testScreen.getByTestId('homework-problem-progress')
    ).toHaveTextContent('Problem 1 of 2');

    fireEvent.press(testScreen.getByTestId('next-problem-chip'));

    await flushAsyncWork();
    await act(async () => {
      jest.runOnlyPendingTimers();
    });
    await flushAsyncWork();

    await waitFor(() => {
      expect(mockStream).toHaveBeenCalledWith(
        'Factor x^2 + 3x + 2',
        expect.any(Function),
        expect.any(Function),
        'session-1',
        expect.objectContaining({ idempotencyKey: expect.any(String) })
      );
    });
    expect(mockStartSession).toHaveBeenCalledTimes(1);

    expect(
      testScreen.getByTestId('homework-problem-progress')
    ).toHaveTextContent('Problem 2 of 2');
  }, 15000);

  it('includes the capture source in homework metadata when homework starts from the gallery', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({
      mode: 'homework',
      subjectId: 'subject-1',
      subjectName: 'Math',
      captureSource: 'gallery',
      ocrText: 'Solve 2x + 5 = 17',
      homeworkProblems: JSON.stringify([
        {
          id: 'problem-1',
          text: 'Solve 2x + 5 = 17',
          source: 'ocr',
        },
      ]),
    });

    const wrapper = createWrapper();
    const testScreen = render(<SessionScreen />, { wrapper });

    fireEvent.press(testScreen.getByTestId('manual-send-button'));
    await flushAsyncWork();

    await waitFor(() => {
      expect(mockStartSession).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            homework: expect.objectContaining({
              source: 'gallery',
              ocrText: 'Solve 2x + 5 = 17',
            }),
          }),
        })
      );
    });

    // homework-state is now called through the hc() client → mockFetch
    await waitFor(() => {
      const hwCalls = fetchCallsMatching(mockFetch, '/homework-state');
      expect(hwCalls.length).toBeGreaterThan(0);
      const body = extractJsonBody<{ metadata: { source?: string } }>(
        hwCalls[0]?.init
      );
      expect(body?.metadata).toMatchObject({ source: 'gallery' });
    });
  });

  it('hides contextual chips on greeting but shows session tools', () => {
    const wrapper = createWrapper();
    const testScreen = render(<SessionScreen />, { wrapper });

    // Contextual quick chips should NOT appear before any user message
    expect(testScreen.queryByText('I know this')).toBeNull();
    expect(testScreen.queryByText('Explain differently')).toBeNull();
    expect(testScreen.queryByText('Too easy')).toBeNull();
    expect(testScreen.queryByText('Example')).toBeNull();

    // Session tool chips should always be present
    testScreen.getByText('Switch topic');
    testScreen.getByText('Park it');
  });

  it('records quick chips and learner feedback with follow-up prompts', async () => {
    const wrapper = createWrapper();
    const testScreen = render(<SessionScreen />, { wrapper });

    fireEvent.press(testScreen.getByTestId('manual-send-button'));
    await flushAsyncWork();

    await waitFor(() => {
      expect(mockStartSession).toHaveBeenCalledTimes(1);
      expect(mockStream).toHaveBeenCalledWith(
        'Solve 2x + 5 = 17',
        expect.any(Function),
        expect.any(Function),
        'session-1',
        expect.objectContaining({ idempotencyKey: expect.any(String) })
      );
    });

    fireEvent.press(testScreen.getByTestId('quick-chip-too_easy'));
    await flushAsyncWork();

    await waitFor(() => {
      expect(mockRecordSessionEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'quick_action',
          content: 'too_easy',
          metadata: expect.objectContaining({
            chip: 'too_easy',
          }),
        })
      );
      expect(mockRecordSystemPrompt).toHaveBeenCalledWith({
        content:
          'The learner says this is too easy. Raise the challenge a little and ask for more independent thinking.',
        metadata: { type: 'quick_chip', chip: 'too_easy' },
      });
      expect(mockStream).toHaveBeenCalledWith(
        'That feels too easy. Can you make it more challenging?',
        expect.any(Function),
        expect.any(Function),
        'session-1',
        expect.objectContaining({ idempotencyKey: expect.any(String) })
      );
    });
    testScreen.getByTestId('session-confirmation-toast');

    fireEvent.press(
      testScreen.getByTestId('message-feedback-not-helpful-event-2')
    );
    await flushAsyncWork();

    await waitFor(() => {
      expect(mockRecordSessionEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'user_feedback',
          content: 'not_helpful',
          metadata: {
            value: 'not_helpful',
            eventId: 'event-2',
          },
        })
      );
      expect(mockRecordSystemPrompt).toHaveBeenCalledWith({
        content:
          'The learner marked the previous answer as not helpful. Re-explain more clearly with one new example.',
        metadata: {
          type: 'message_feedback',
          value: 'not_helpful',
          eventId: 'event-2',
        },
      });
      expect(mockStream).toHaveBeenCalledWith(
        'Can you explain that differently?',
        expect.any(Function),
        expect.any(Function),
        'session-1',
        expect.objectContaining({ idempotencyKey: expect.any(String) })
      );
    });

    fireEvent.press(
      testScreen.getByTestId('message-feedback-incorrect-event-3')
    );
    await flushAsyncWork();

    await waitFor(() => {
      expect(mockRecordSessionEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'user_feedback',
          content: 'incorrect',
          metadata: {
            value: 'incorrect',
            eventId: 'event-3',
          },
        })
      );
      expect(mockFlagSessionContent).toHaveBeenCalledWith({
        eventId: 'event-3',
        reason: 'Learner marked response as incorrect',
      });
      expect(mockRecordSystemPrompt).toHaveBeenCalledWith({
        content:
          'The learner believes the previous answer was incorrect. Correct it clearly, explain what changed, and continue from there.',
        metadata: {
          type: 'message_feedback',
          value: 'incorrect',
          eventId: 'event-3',
        },
      });
      expect(mockStream).toHaveBeenCalledWith(
        'I think that answer is incorrect. Can you correct it and explain what changed?',
        expect.any(Function),
        expect.any(Function),
        'session-1',
        expect.objectContaining({ idempotencyKey: expect.any(String) })
      );
    });
  });

  it('hydrates milestone tracker state from the recovery marker when resuming', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({
      mode: 'learning',
      sessionId: 'session-1',
      subjectId: 'subject-1',
      subjectName: 'Math',
    });
    mockReadSessionRecoveryMarker.mockResolvedValueOnce({
      sessionId: 'session-1',
      updatedAt: new Date().toISOString(),
      milestoneTracker: {
        milestonesReached: ['polar_star'],
        consecutiveLowRung: 1,
        longMessageCount: 0,
        awaitingPersistence: false,
        previousRung: 2,
      },
    });

    const wrapper = createWrapper();
    render(<SessionScreen />, { wrapper });

    await waitFor(() => {
      expect(mockReadSessionRecoveryMarker).toHaveBeenCalled();
      expect(mockHydrate).toHaveBeenCalled();
    });
  });

  it('renders prior chat history when resuming a session with cached transcript', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({
      mode: 'learning',
      sessionId: 'session-1',
      subjectId: 'subject-1',
      subjectName: 'Geography',
      topicId: 'topic-1',
      topicName: 'Continents',
    });
    mockUseSessionTranscript.mockReturnValue({
      data: {
        archived: false,
        session: {
          sessionId: 'session-1',
          exchangeCount: 2,
          inputMode: 'text',
          milestonesReached: [],
          verificationType: undefined,
        },
        exchanges: [
          {
            role: 'user',
            content: 'Tell me about Africa',
            timestamp: '2026-04-25T10:00:00Z',
            eventId: 'evt-1',
            isSystemPrompt: false,
            escalationRung: 1,
          },
          {
            role: 'assistant',
            content: 'Africa is the second-largest continent.',
            timestamp: '2026-04-25T10:00:05Z',
            eventId: 'evt-2',
            isSystemPrompt: false,
            escalationRung: 1,
          },
        ],
      },
    });

    const wrapper = createWrapper();
    const testScreen = render(<SessionScreen />, { wrapper });
    await flushAsyncWork();

    await waitFor(() => {
      expect(testScreen.queryByText('Tell me about Africa')).toBeTruthy();
      expect(
        testScreen.queryByText('Africa is the second-largest continent.')
      ).toBeTruthy();
    });
  });

  it('auto-resumes the active session for a learning topic when no sessionId is in the route', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({
      mode: 'learning',
      subjectId: 'subject-1',
      subjectName: 'Geography',
      topicId: 'topic-1',
      topicName: 'Continents',
    });
    // Return active session for this topic via fetch boundary
    mockFetch.setRoute('/progress/topic', { sessionId: 'session-resumed' });

    const wrapper = createWrapper();
    render(<SessionScreen />, { wrapper });
    await flushAsyncWork();

    await waitFor(() => {
      expect(mockSetParams).toHaveBeenCalledWith({
        sessionId: 'session-resumed',
      });
    });
  });

  it('does not auto-resume when entering a topic in practice/review mode', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({
      mode: 'practice',
      subjectId: 'subject-1',
      subjectName: 'Geography',
      topicId: 'topic-1',
      topicName: 'Continents',
    });
    // Even if the topic has an active session, practice mode should NOT resume it
    mockFetch.setRoute('/progress/topic', {
      sessionId: 'session-shouldnt-resume',
    });

    const wrapper = createWrapper();
    render(<SessionScreen />, { wrapper });
    await flushAsyncWork();

    expect(mockSetParams).not.toHaveBeenCalled();
  });

  it('does not call setParams when the topic has no active session', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({
      mode: 'learning',
      subjectId: 'subject-1',
      subjectName: 'Geography',
      topicId: 'topic-1',
      topicName: 'Continents',
    });
    // Default route already returns null for /progress/topic

    const wrapper = createWrapper();
    render(<SessionScreen />, { wrapper });
    await flushAsyncWork();

    expect(mockSetParams).not.toHaveBeenCalled();
  });

  it('shows the topic header and opens the topic switcher when "Change topic" is tapped', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({
      mode: 'learning',
      sessionId: 'session-1',
      subjectId: 'subject-1',
      subjectName: 'Geography',
      topicId: 'topic-1',
      topicName: 'Continents',
    });
    mockUseSessionTranscript.mockReturnValue({
      data: {
        archived: false,
        session: {
          sessionId: 'session-1',
          exchangeCount: 0,
          inputMode: 'text',
          milestonesReached: [],
        },
        exchanges: [],
      },
    });

    const wrapper = createWrapper();
    const testScreen = render(<SessionScreen />, { wrapper });
    await flushAsyncWork();

    const header = testScreen.getByTestId('session-topic-header');
    within(header).getByText(/Continents/);
    within(header).getByText(/Topic:/);

    fireEvent.press(testScreen.getByTestId('session-topic-header-change'));
    await flushAsyncWork();

    testScreen.getByTestId('switch-topic-topic-1');
  });

  it('persists input-mode changes once the session exists', async () => {
    const wrapper = createWrapper();
    const testScreen = render(<SessionScreen />, { wrapper });

    fireEvent.press(testScreen.getByTestId('manual-send-button'));
    await flushAsyncWork();

    await waitFor(() => {
      expect(mockStartSession).toHaveBeenCalledTimes(1);
    });

    fireEvent.press(testScreen.getByTestId('mock-set-voice-mode'));

    await waitFor(() => {
      expect(mockSetSessionInputMode).toHaveBeenCalledWith({
        inputMode: 'voice',
      });
    });
  });

  it('prompts for subject resolution before starting a session when classification is ambiguous', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({
      mode: 'learning',
    });
    // Override classify to return ambiguous candidates
    mockFetch.setRoute('/subjects/classify', {
      candidates: [
        { subjectId: 'subject-1', subjectName: 'Math', confidence: 0.62 },
        { subjectId: 'subject-2', subjectName: 'Physics', confidence: 0.58 },
      ],
      needsConfirmation: true,
    });

    const wrapper = createWrapper();
    const testScreen = render(<SessionScreen />, { wrapper });

    fireEvent.press(testScreen.getByTestId('manual-send-button'));
    await flushAsyncWork();

    await waitFor(() => {
      testScreen.getByTestId('session-subject-resolution');
      expect(
        testScreen.getAllByText(/math or physics/i).length
      ).toBeGreaterThan(0);
    });

    expect(mockStartSession).not.toHaveBeenCalled();

    fireEvent.press(testScreen.getByTestId('subject-resolution-subject-2'));
    await flushAsyncWork();

    // After picking subject-2, use-session-streaming calls
    // apiClient.subjects[':subjectId'].sessions.$post via the hc() client,
    // which routes through mockFetch to /subjects/subject-2/sessions.
    await waitFor(() => {
      const startCalls = fetchCallsMatching(
        mockFetch,
        '/subjects/subject-2/sessions'
      );
      expect(startCalls.length).toBeGreaterThan(0);
      const body = extractJsonBody<{ subjectId: string; inputMode: string }>(
        startCalls[0]?.init
      );
      expect(body).toMatchObject({ subjectId: 'subject-2', inputMode: 'text' });
    });

    await waitFor(() => {
      expect(mockStream).toHaveBeenCalledWith(
        'Solve 2x + 5 = 17',
        expect.any(Function),
        expect.any(Function),
        'session-1',
        expect.objectContaining({ idempotencyKey: expect.any(String) })
      );
    });
  });

  it('shows "+ New subject" escape hatch when classification fails [BUG-234]', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({
      mode: 'learning',
    });
    // Return a 500 error for classify
    mockFetch.setRoute(
      '/subjects/classify',
      new Response(JSON.stringify({ error: 'Network error' }), { status: 500 })
    );

    const wrapper = createWrapper();
    const testScreen = render(<SessionScreen />, { wrapper });

    fireEvent.press(testScreen.getByTestId('manual-send-button'));
    await flushAsyncWork();

    await waitFor(() => {
      // When classify fails and subjects haven't loaded yet, the screen falls
      // back to the resolve API flow which shows the "Create a new subject"
      // button (subject-resolution-create-new) as the zero-candidates escape hatch.
      testScreen.getByTestId('subject-resolution-create-new');
    });

    expect(mockStartSession).not.toHaveBeenCalled();
  });

  it('shows "+ New subject" chip alongside candidates when classification is ambiguous [BUG-234]', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({
      mode: 'learning',
    });
    mockFetch.setRoute('/subjects/classify', {
      candidates: [
        { subjectId: 'subject-1', subjectName: 'Math', confidence: 0.5 },
      ],
      needsConfirmation: true,
    });

    const wrapper = createWrapper();
    const testScreen = render(<SessionScreen />, { wrapper });

    fireEvent.press(testScreen.getByTestId('manual-send-button'));
    await flushAsyncWork();

    await waitFor(() => {
      testScreen.getByTestId('session-subject-resolution');
      testScreen.getByTestId('subject-resolution-new');
      testScreen.getByText('+ New subject');
    });
  });

  describe('post-session filing prompt', () => {
    /**
     * Helper: renders a freeform session, sends a message to start it,
     * then triggers end-session via the Alert "End Session" callback to
     * get `showFilingPrompt` set to true.
     */
    async function renderAndTriggerFilingPrompt() {
      // Use freeform mode (no subjectId) so filing prompt shows on close
      (useLocalSearchParams as jest.Mock).mockReturnValue({
        mode: 'freeform',
      });
      // Classify resolves without confirmation needed
      mockFetch.setRoute('/subjects/classify', {
        candidates: [
          { subjectId: 'subject-1', subjectName: 'Math', confidence: 0.95 },
        ],
        needsConfirmation: false,
        resolvedSubjectId: 'subject-1',
      });

      // Spy on Alert.alert so we can invoke the "End Session" button callback
      const alertSpy = jest.spyOn(Alert, 'alert');

      const wrapper = createWrapper();
      const testScreen = render(<SessionScreen />, { wrapper });

      // Send a message to start the session and get exchangeCount > 0
      fireEvent.press(testScreen.getByTestId('manual-send-button'));
      await flushAsyncWork();

      await waitFor(() => {
        expect(mockStream).toHaveBeenCalledTimes(1);
      });

      // The end-session button should now be visible (exchangeCount > 0)
      const endButton = testScreen.getByTestId('end-session-button');
      fireEvent.press(endButton);

      // Alert.alert was called with "End session?" — invoke the "End Session" callback
      // BUG-352 added a 4th options arg { cancelable, onDismiss }
      await waitFor(() => {
        expect(alertSpy).toHaveBeenCalledWith(
          'End session?',
          expect.any(String),
          expect.any(Array),
          expect.objectContaining({ cancelable: true })
        );
      });

      const buttons = alertSpy.mock.calls[0]![2] as Array<{
        text: string;
        onPress?: () => void;
      }>;
      const doneButton = buttons.find((b) => b.text === 'End Session');

      // Invoke the "End Session" callback
      await act(async () => {
        doneButton?.onPress?.();
      });
      await flushAsyncWork();

      // Advance timers to let fetchFastCelebrations polling resolve
      await act(async () => {
        jest.runAllTimers();
      });
      await flushAsyncWork();

      alertSpy.mockRestore();

      return testScreen;
    }

    it('renders filing prompt when a freeform session is closed', async () => {
      const testScreen = await renderAndTriggerFilingPrompt();

      await waitFor(() => {
        testScreen.getByTestId('filing-prompt');
        testScreen.getByTestId('filing-prompt-accept');
        testScreen.getByTestId('filing-prompt-dismiss');
      });
    }, 15000);

    it('accept button calls filing and navigates to session summary with filed subject/book params', async () => {
      const testScreen = await renderAndTriggerFilingPrompt();

      await waitFor(() => {
        testScreen.getByTestId('filing-prompt-accept');
      });

      fireEvent.press(testScreen.getByTestId('filing-prompt-accept'));
      await flushAsyncWork();

      await waitFor(() => {
        // Filing is now called through hc() → mockFetch to /filing
        const filingCalls = fetchCallsMatching(mockFetch, '/filing');
        expect(filingCalls.length).toBeGreaterThan(0);
        const body = extractJsonBody<{
          sessionId: string;
          sessionMode: string;
        }>(filingCalls[0]?.init);
        expect(body).toMatchObject({
          sessionId: 'session-1',
          sessionMode: 'freeform',
        });
        // After filing, the library redesign navigates to the session summary
        // with filedSubjectId + filedBookId params (not directly to the book screen).
        // The session-summary screen uses those params to show a "View in library" link.
        expect(mockReplace).toHaveBeenCalledWith(
          expect.objectContaining({
            pathname: '/session-summary/session-1',
            params: expect.objectContaining({
              filedSubjectId: 'shelf-1',
              filedBookId: 'book-1',
            }),
          })
        );
      });
    }, 15000);

    it('dismiss button navigates to session summary', async () => {
      const testScreen = await renderAndTriggerFilingPrompt();

      await waitFor(() => {
        testScreen.getByTestId('filing-prompt-dismiss');
      });

      fireEvent.press(testScreen.getByTestId('filing-prompt-dismiss'));
      await flushAsyncWork();

      await waitFor(() => {
        expect(mockReplace).toHaveBeenCalledWith(
          expect.objectContaining({
            pathname: '/session-summary/session-1',
          })
        );
      });
    }, 15000);
  });
});

describe('voice mode persistence', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockFetch.mockClear();
    mockUseSessionTranscript.mockReturnValue({ data: null });
    mockFetch.setRoute('/progress/topic', null);
    Object.keys(secureStore).forEach((key) => delete secureStore[key]);
    (useRouter as jest.Mock).mockReturnValue({
      replace: mockReplace,
      setParams: mockSetParams,
    });
    (useLocalSearchParams as jest.Mock).mockReturnValue({
      mode: 'homework',
      subjectId: 'subject-1',
      subjectName: 'Math',
      homeworkProblems: JSON.stringify([
        { id: 'problem-1', text: 'Solve 2x + 5 = 17', source: 'ocr' },
      ]),
    });
    mockStartSession.mockResolvedValue({ session: { id: 'session-1' } });
    mockStream.mockImplementation(
      async (
        _msg: string,
        onChunk: (value: string) => void,
        onDone: (r: { exchangeCount: number; escalationRung: number }) => void
      ) => {
        onChunk('Got it.');
        onDone({ exchangeCount: 1, escalationRung: 1 });
      }
    );
    mockRecordSystemPrompt.mockResolvedValue({ ok: true });
    mockSetSessionInputMode.mockResolvedValue({
      session: { id: 'session-1', inputMode: 'voice' },
    });
    mockFlagSessionContent.mockResolvedValue({
      message: 'Content flagged for review. Thank you!',
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('defaults to voice when SecureStore has voice preference', async () => {
    secureStore['voice-input-mode-profile-1'] = 'voice';
    const wrapper = createWrapper();
    const { getByTestId } = render(<SessionScreen />, { wrapper });
    await waitFor(() => {
      expect(getByTestId('mock-input-mode').props.children).toBe('voice');
    });
  });

  it('defaults to text when SecureStore has no preference', async () => {
    const wrapper = createWrapper();
    const { getByTestId } = render(<SessionScreen />, { wrapper });
    await waitFor(() => {
      expect(getByTestId('mock-input-mode').props.children).toBe('text');
    });
  });

  it('persists voice preference when mode changes to voice', async () => {
    const wrapper = createWrapper();
    const { getByTestId } = render(<SessionScreen />, { wrapper });
    await act(async () => {
      fireEvent.press(getByTestId('mock-set-voice-mode'));
    });
    await waitFor(() => {
      expect(secureStore['voice-input-mode-profile-1']).toBe('voice');
    });
  });

  it('persists text preference when mode changes to text', async () => {
    secureStore['voice-input-mode-profile-1'] = 'voice';
    const wrapper = createWrapper();
    const { getByTestId } = render(<SessionScreen />, { wrapper });
    // Wait for initial voice mode to load
    await waitFor(() => {
      expect(getByTestId('mock-input-mode').props.children).toBe('voice');
    });
    await act(async () => {
      fireEvent.press(getByTestId('mock-set-text-mode'));
    });
    await waitFor(() => {
      expect(secureStore['voice-input-mode-profile-1']).toBe('text');
    });
  });

  it('shows QuotaExceededCard and disables input when stream returns 402', async () => {
    const { QuotaExceededError } = require('../../../lib/api-client');
    const details = {
      tier: 'free' as const,
      reason: 'monthly' as const,
      monthlyLimit: 100,
      usedThisMonth: 100,
      dailyLimit: null,
      usedToday: 0,
      topUpCreditsRemaining: 0,
      upgradeOptions: [],
    };
    mockStream.mockRejectedValueOnce(
      new QuotaExceededError('Quota exceeded', details)
    );

    const wrapper = createWrapper();
    const { unmount } = render(<SessionScreen />, { wrapper });

    // Flush startup async work
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    // Trigger a message send using the mock send button
    fireEvent.press(screen.getByTestId('manual-send-button'));

    await waitFor(() => {
      screen.getByTestId('quota-exceeded-card');
      screen.getByTestId('input-disabled-banner');
    });

    unmount();
  });
});
