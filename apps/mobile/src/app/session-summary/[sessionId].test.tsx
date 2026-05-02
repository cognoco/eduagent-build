import {
  render,
  screen,
  fireEvent,
  waitFor,
} from '@testing-library/react-native';
import React from 'react';
import { platformAlert } from '../../lib/platform-alert';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

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

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
}));

const mockSubmitMutateAsync = jest.fn();
const mockSkipMutateAsync = jest.fn();
const mockRecallBridgeMutateAsync = jest.fn();
const mockUpdateLearningModeMutateAsync = jest.fn();
const mockOnSuccessfulRecall = jest.fn();
let mockTranscriptData: Record<string, unknown> | null = null;
let mockSubmitIsError = false;
let mockSubmitError: Error | null = null;
// BUG-449: persisted summary lookup for revisits from book page.
let mockSessionSummaryData: {
  id: string;
  sessionId: string;
  content: string;
  aiFeedback: string | null;
  status: 'pending' | 'submitted' | 'accepted' | 'skipped' | 'auto_closed';
} | null = null;
let mockSessionSummaryIsLoading = false;

jest.mock('../../hooks/use-sessions', () => ({
  useSubmitSummary: () => ({
    mutateAsync: mockSubmitMutateAsync,
    isPending: false,
    isError: mockSubmitIsError,
    error: mockSubmitError,
  }),
  useSkipSummary: () => ({
    mutateAsync: mockSkipMutateAsync,
    isPending: false,
    isError: false,
    error: null,
  }),
  useSession: () => ({
    data: undefined,
    isLoading: false,
  }),
  useSessionTranscript: () => ({
    data: mockTranscriptData,
    isLoading: false,
  }),
  useSessionSummary: () => ({
    data: mockSessionSummaryData,
    isLoading: mockSessionSummaryIsLoading,
  }),
  useRecallBridge: () => ({
    mutateAsync: mockRecallBridgeMutateAsync,
    isPending: false,
    isError: false,
    error: null,
  }),
}));

jest.mock('../../hooks/use-settings', () => ({
  useUpdateLearningMode: () => ({
    mutateAsync: mockUpdateLearningModeMutateAsync,
  }),
}));

jest.mock('../../hooks/use-rating-prompt', () => ({
  useRatingPrompt: () => ({
    onSuccessfulRecall: mockOnSuccessfulRecall,
  }),
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
    activeProfile: { id: 'p-1', birthYear: 2012 },
    profiles: [{ id: 'p-1', birthYear: 2012 }],
    setActiveProfileId: jest.fn(),
    isRestoringId: false,
  }),
  personaFromBirthYear: () => 'learner',
  isGuardianProfile: () => false,
}));

const mockUseParentProxy = jest.fn(() => ({
  isParentProxy: false,
  childProfile: null,
  parentProfile: null,
}));
jest.mock('../../hooks/use-parent-proxy', () => ({
  useParentProxy: () => mockUseParentProxy(),
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

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, gcTime: 0 } },
});

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

const SessionSummaryScreen = require('./[sessionId]').default;

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
    mockSubmitIsError = false;
    mockSubmitError = null;
    mockSkipMutateAsync.mockResolvedValue({
      summary: {
        id: 'summary-1',
        sessionId: '660e8400-e29b-41d4-a716-446655440000',
        content: '',
        aiFeedback: null,
        status: 'skipped',
      },
      shouldPromptCasualSwitch: false,
    });
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
    mockSessionSummaryIsLoading = false;
    mockBack.mockClear();
    mockCanGoBack.mockReset();
    mockCanGoBack.mockReturnValue(false);
    mockOnSuccessfulRecall.mockResolvedValue(undefined);
    mockRecallBridgeMutateAsync.mockRejectedValue(new Error('not homework'));
  });

  afterEach(() => {
    queryClient.clear();
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

  it('disables submit when summary is too short', () => {
    render(<SessionSummaryScreen />, { wrapper: Wrapper });

    fireEvent.changeText(screen.getByTestId('summary-input'), 'Short');

    const button = screen.getByTestId('submit-summary-button');
    expect(
      button.props.accessibilityState?.disabled ?? button.props.disabled
    ).toBeTruthy();
  });

  it('submits summary and shows AI feedback', async () => {
    mockSubmitMutateAsync.mockResolvedValue({
      summary: {
        id: 'summary-1',
        sessionId: '660e8400-e29b-41d4-a716-446655440000',
        content: 'I learned about quadratic equations and how to solve them',
        aiFeedback: 'Good summary. You captured the key concepts well.',
        status: 'accepted',
      },
    });

    render(<SessionSummaryScreen />, { wrapper: Wrapper });

    fireEvent.changeText(
      screen.getByTestId('summary-input'),
      'I learned about quadratic equations and how to solve them'
    );
    fireEvent.press(screen.getByTestId('submit-summary-button'));

    await waitFor(() => {
      expect(mockSubmitMutateAsync).toHaveBeenCalledWith({
        content: 'I learned about quadratic equations and how to solve them',
      });
    });

    await waitFor(() => {
      screen.getByTestId('summary-submitted');
      screen.getByTestId('ai-feedback');
      screen.getByText('Good summary. You captured the key concepts well.');
    });
  });

  it('shows Continue button after submission', async () => {
    mockSubmitMutateAsync.mockResolvedValue({
      summary: {
        id: 'summary-1',
        sessionId: '660e8400-e29b-41d4-a716-446655440000',
        content: 'I learned about quadratic equations and factoring methods',
        aiFeedback: 'Well done.',
        status: 'accepted',
      },
    });

    render(<SessionSummaryScreen />, { wrapper: Wrapper });

    fireEvent.changeText(
      screen.getByTestId('summary-input'),
      'I learned about quadratic equations and factoring methods'
    );
    fireEvent.press(screen.getByTestId('submit-summary-button'));

    await waitFor(() => {
      screen.getByTestId('continue-button');
    });

    fireEvent.press(screen.getByTestId('continue-button'));
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/(app)/home');
    });
  });

  it('triggers the rating prompt hook before leaving a recall summary', async () => {
    mockSubmitMutateAsync.mockResolvedValue({
      summary: {
        id: 'summary-1',
        sessionId: '660e8400-e29b-41d4-a716-446655440000',
        content: 'I explained how factoring helps solve quadratic equations',
        aiFeedback: 'Well done.',
        status: 'accepted',
      },
    });
    mockTranscriptData = {
      session: {
        sessionId: '660e8400-e29b-41d4-a716-446655440000',
        subjectId: 'sub-1',
        topicId: 'topic-1',
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
      'I explained how factoring helps solve quadratic equations'
    );
    fireEvent.press(screen.getByTestId('submit-summary-button'));

    await waitFor(() => {
      screen.getByTestId('continue-button');
    });

    fireEvent.press(screen.getByTestId('continue-button'));

    await waitFor(() => {
      expect(mockOnSuccessfulRecall).toHaveBeenCalled();
      expect(mockReplace).toHaveBeenCalledWith('/(app)/home');
    });
  });

  it('persists skip before leaving the screen', async () => {
    render(<SessionSummaryScreen />, { wrapper: Wrapper });

    const skipButton = screen.getByTestId('skip-summary-button');
    fireEvent.press(skipButton);

    await waitFor(() => {
      expect(mockSkipMutateAsync).toHaveBeenCalled();
      expect(mockReplace).toHaveBeenCalledWith('/(app)/home');
    });
  });

  it('prompts to switch to Casual Explorer when skip threshold is reached', async () => {
    mockSkipMutateAsync.mockResolvedValueOnce({
      summary: {
        id: 'summary-1',
        sessionId: '660e8400-e29b-41d4-a716-446655440000',
        content: '',
        aiFeedback: null,
        status: 'skipped',
      },
      shouldPromptCasualSwitch: true,
    });
    mockUpdateLearningModeMutateAsync.mockResolvedValueOnce('casual');

    render(<SessionSummaryScreen />, { wrapper: Wrapper });

    fireEvent.press(screen.getByTestId('skip-summary-button'));

    await waitFor(() => {
      expect(platformAlert).toHaveBeenCalledWith(
        'Try Casual Explorer?',
        'You can keep learning without writing a summary each time. Switch now?',
        expect.arrayContaining([
          expect.objectContaining({ text: 'Not now' }),
          expect.objectContaining({ text: 'Switch' }),
        ])
      );
    });
    expect(mockReplace).not.toHaveBeenCalled();

    const promptButtons = (platformAlert as jest.Mock).mock.calls[0]?.[2] as
      | Array<{ text?: string; onPress?: () => void }>
      | undefined;
    const switchButton = promptButtons?.find(
      (button) => button.text === 'Switch'
    );
    expect(switchButton?.onPress).toBeDefined();

    switchButton?.onPress?.();

    await waitFor(() => {
      expect(mockUpdateLearningModeMutateAsync).toHaveBeenCalledWith('casual');
      expect(mockReplace).toHaveBeenCalledWith('/(app)/home');
    });
  });

  it('shows recall bridge questions after homework skip', async () => {
    mockParams.sessionType = 'homework';
    mockRecallBridgeMutateAsync.mockResolvedValueOnce({
      questions: ['What method did you use?', 'Why does it work?'],
      topicId: 'topic-1',
      topicTitle: 'Algebra',
    });

    render(<SessionSummaryScreen />, { wrapper: Wrapper });

    fireEvent.press(screen.getByTestId('skip-summary-button'));

    await waitFor(() => {
      expect(mockSkipMutateAsync).toHaveBeenCalled();
      expect(mockRecallBridgeMutateAsync).toHaveBeenCalled();
    });

    await waitFor(() => {
      screen.getByTestId('recall-bridge-questions');
      screen.getByText('Quick recall check');
      screen.getByText(/What method did you use/);
      screen.getByText(/Why does it work/);
    });

    // Should NOT have navigated home yet
    expect(mockReplace).not.toHaveBeenCalled();

    // Press "Done — head home" to navigate
    fireEvent.press(screen.getByTestId('recall-bridge-done-button'));

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/(app)/home');
    });
  });

  it('skips recall bridge for non-homework sessions', async () => {
    mockParams.sessionType = 'learning';
    mockRecallBridgeMutateAsync.mockResolvedValueOnce({
      questions: ['Should not appear'],
      topicId: 'topic-1',
      topicTitle: 'Algebra',
    });

    render(<SessionSummaryScreen />, { wrapper: Wrapper });

    fireEvent.press(screen.getByTestId('skip-summary-button'));

    await waitFor(() => {
      expect(mockSkipMutateAsync).toHaveBeenCalled();
      expect(mockReplace).toHaveBeenCalledWith('/(app)/home');
    });

    expect(mockRecallBridgeMutateAsync).not.toHaveBeenCalled();
  });

  it('shows inline error text when submitSummary fails [SC-1]', async () => {
    // Set up the mock to show the error state (simulates mutation in error state)
    mockSubmitIsError = true;
    mockSubmitError = new Error('Network error');
    mockSubmitMutateAsync.mockRejectedValue(new Error('Network error'));

    render(<SessionSummaryScreen />, { wrapper: Wrapper });

    // The inline error should be visible immediately (driven by isError state)
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
    mockSubmitMutateAsync.mockRejectedValue(
      new Error('Reflection too short — needs at least 30 characters')
    );

    render(<SessionSummaryScreen />, { wrapper: Wrapper });

    fireEvent.changeText(
      screen.getByTestId('summary-input'),
      'I learned about photosynthesis and chlorophyll absorption'
    );
    fireEvent.press(screen.getByTestId('submit-summary-button'));

    await waitFor(() => {
      expect(platformAlert).toHaveBeenCalledWith(
        'Could not save',
        'Reflection too short — needs at least 30 characters'
      );
    });
  });

  it('[BUG-800] non-Error rejection does not crash the alert', async () => {
    mockSubmitMutateAsync.mockRejectedValue({
      code: 'WORD_LIMIT',
      maxWords: 200,
    });

    render(<SessionSummaryScreen />, { wrapper: Wrapper });

    fireEvent.changeText(
      screen.getByTestId('summary-input'),
      'I explored gravity and Newtons three laws of motion today'
    );
    fireEvent.press(screen.getByTestId('submit-summary-button'));

    await waitFor(() => {
      // Stub returns 'Unknown error' for non-Error inputs.
      expect(platformAlert).toHaveBeenCalledWith(
        'Could not save',
        'Unknown error'
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
        'Today I learned that...'
      );
    });

    it('tapping a different prompt chip replaces the input text', () => {
      render(<SessionSummaryScreen />, { wrapper: Wrapper });

      fireEvent.press(screen.getByText('Today I learned that...'));
      fireEvent.press(screen.getByText('The most interesting thing was...'));

      expect(screen.getByTestId('summary-input').props.value).toBe(
        'The most interesting thing was...'
      );
    });

    it('each prompt chip has an accessible label matching its text', () => {
      render(<SessionSummaryScreen />, { wrapper: Wrapper });

      screen.getByLabelText('Today I learned that...');
    });

    it('prompt chips are not shown after submission', async () => {
      mockSubmitMutateAsync.mockResolvedValue({
        summary: {
          id: 'summary-1',
          sessionId: '660e8400-e29b-41d4-a716-446655440000',
          content: 'I learned about equations and how to solve them today',
          aiFeedback: 'Great job!',
          status: 'accepted',
        },
      });

      render(<SessionSummaryScreen />, { wrapper: Wrapper });

      fireEvent.changeText(
        screen.getByTestId('summary-input'),
        'I learned about equations and how to solve them today'
      );
      fireEvent.press(screen.getByTestId('submit-summary-button'));

      await waitFor(() => {
        screen.getByTestId('summary-submitted');
      });

      expect(screen.queryByTestId('summary-prompt-chips')).toBeNull();
    });
  });

  it('renders milestone recap and fast celebrations when provided', () => {
    mockParams.wallClockSeconds = '900';
    mockParams.milestones = encodeURIComponent(
      JSON.stringify(['polar_star', 'persistent'])
    );
    mockParams.fastCelebrations = encodeURIComponent(
      JSON.stringify([
        { reason: 'topic_mastered', detail: 'Quadratic Equations' },
      ])
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
      JSON.stringify([1, 2, 'polar_star', null, { foo: 'bar' }, 'persistent'])
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
        childProfile: { id: 'p-1', birthYear: 2012 } as never,
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
        childProfile: { id: 'p-1', birthYear: 2012 } as never,
        parentProfile: { id: 'parent-1', isOwner: true } as never,
      });

      render(<SessionSummaryScreen />, { wrapper: Wrapper });

      expect(screen.queryByTestId('view-transcript-cta')).toBeNull();
    });
  });

  // BUG-449: revisiting a past session (Library → Shelf → Book → tap session)
  // must render the already-saved summary, not the empty "Your Words" prompt.
  describe('revisiting a session with an already-persisted summary [BUG-449]', () => {
    it('renders saved content + AI feedback (not the empty input) when status is submitted', () => {
      mockSessionSummaryData = {
        id: 'summary-1',
        sessionId: '660e8400-e29b-41d4-a716-446655440000',
        content:
          'African landscapes vary hugely — from the Sahara to savannah to rainforest.',
        aiFeedback: 'Nice connection between geography and climate zones.',
        status: 'submitted',
      };

      render(<SessionSummaryScreen />, { wrapper: Wrapper });

      screen.getByTestId('summary-submitted');
      screen.getByText(
        'African landscapes vary hugely — from the Sahara to savannah to rainforest.'
      );
      screen.getByText('Nice connection between geography and climate zones.');
      // Input form and chips must not be rendered for a persisted summary.
      expect(screen.queryByTestId('summary-input')).toBeNull();
      expect(screen.queryByTestId('summary-prompt-chips')).toBeNull();
      expect(screen.queryByTestId('submit-summary-button')).toBeNull();
      expect(screen.queryByTestId('skip-summary-button')).toBeNull();
    });

    it('renders saved content when status is accepted (post-pipeline)', () => {
      mockSessionSummaryData = {
        id: 'summary-2',
        sessionId: '660e8400-e29b-41d4-a716-446655440000',
        content:
          'I learned about the Atlas Mountains and the Great Rift Valley.',
        aiFeedback: 'Great detail — you remembered specific landmarks.',
        status: 'accepted',
      };

      render(<SessionSummaryScreen />, { wrapper: Wrapper });

      screen.getByTestId('summary-submitted');
      screen.getByText(
        'I learned about the Atlas Mountains and the Great Rift Valley.'
      );
      expect(screen.queryByTestId('summary-input')).toBeNull();
    });

    it('renders read-only skipped-state (no input, no skip) when status is skipped', () => {
      mockSessionSummaryData = {
        id: 'summary-3',
        sessionId: '660e8400-e29b-41d4-a716-446655440000',
        content: '',
        aiFeedback: null,
        status: 'skipped',
      };

      render(<SessionSummaryScreen />, { wrapper: Wrapper });

      screen.getByTestId('summary-skipped-state');
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

      fireEvent.press(screen.getByTestId('continue-button'));

      await waitFor(() => {
        expect(mockReplace).toHaveBeenCalledWith('/(app)/home');
      });
      expect(mockSkipMutateAsync).not.toHaveBeenCalled();
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

      fireEvent.press(screen.getByTestId('summary-close-button'));

      await waitFor(() => {
        expect(mockReplace).toHaveBeenCalledWith('/(app)/home');
      });
      expect(mockSkipMutateAsync).not.toHaveBeenCalled();
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

      fireEvent.press(screen.getByTestId('continue-button'));

      await waitFor(() => {
        expect(mockBack).toHaveBeenCalled();
      });
      expect(mockReplace).not.toHaveBeenCalledWith('/(app)/home');
      expect(mockSkipMutateAsync).not.toHaveBeenCalled();
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
        'I learned about plants making their own food'
      );

      await waitFor(
        () => {
          expect(mockWriteSummaryDraft).toHaveBeenCalledWith(
            expect.any(String),
            '660e8400-e29b-41d4-a716-446655440000',
            'I learned about plants making their own food'
          );
        },
        { timeout: 1500 }
      );
    });

    it('rehydrates a stored draft into the input on mount', async () => {
      mockReadSummaryDraft.mockResolvedValue({
        profileId: 'p-1',
        sessionId: '660e8400-e29b-41d4-a716-446655440000',
        content: 'unfinished thought about autotrophs',
        updatedAt: new Date().toISOString(),
      });

      render(<SessionSummaryScreen />, { wrapper: Wrapper });

      await waitFor(() => {
        screen.getByDisplayValue('unfinished thought about autotrophs');
      });
    });

    it('a typed-but-unsubmitted draft opens a confirm dialog on close, not a silent skip', async () => {
      render(<SessionSummaryScreen />, { wrapper: Wrapper });

      fireEvent.changeText(
        screen.getByTestId('summary-input'),
        'Some partial reflection text that is long enough'
      );

      fireEvent.press(screen.getByTestId('summary-close-button'));

      await waitFor(() => {
        expect(platformAlert).toHaveBeenCalled();
      });
      // Critical: we do NOT call skipSummary until the user chooses Discard.
      expect(mockSkipMutateAsync).not.toHaveBeenCalled();
    });

    it('"Discard" in the confirm dialog clears the draft and then skips the server record', async () => {
      render(<SessionSummaryScreen />, { wrapper: Wrapper });

      fireEvent.changeText(
        screen.getByTestId('summary-input'),
        'Some partial reflection text that is long enough'
      );
      fireEvent.press(screen.getByTestId('summary-close-button'));

      await waitFor(() => {
        expect(platformAlert).toHaveBeenCalled();
      });

      const [, , buttons] = (platformAlert as jest.Mock).mock.calls[0];
      const discard = buttons.find(
        (b: { text: string }) => b.text === 'Discard'
      );
      await discard.onPress();

      await waitFor(() => {
        expect(mockClearSummaryDraft).toHaveBeenCalled();
      });
      await waitFor(() => {
        expect(mockSkipMutateAsync).toHaveBeenCalled();
      });
    });

    it('"Keep writing" in the confirm dialog does NOT call skip or clear', async () => {
      render(<SessionSummaryScreen />, { wrapper: Wrapper });

      fireEvent.changeText(
        screen.getByTestId('summary-input'),
        'Some partial reflection text that is long enough'
      );
      fireEvent.press(screen.getByTestId('summary-close-button'));

      await waitFor(() => {
        expect(platformAlert).toHaveBeenCalled();
      });

      const [, , buttons] = (platformAlert as jest.Mock).mock.calls[0];
      const keep = buttons.find(
        (b: { text: string }) => b.text === 'Keep writing'
      );
      await keep.onPress();

      // Yield one microtask to let any erroneous downstream calls land.
      await Promise.resolve();
      expect(mockSkipMutateAsync).not.toHaveBeenCalled();
    });

    it('"Submit now" in the confirm dialog submits the summary instead of skipping', async () => {
      mockSubmitMutateAsync.mockResolvedValue({
        summary: {
          id: 'summary-1',
          sessionId: '660e8400-e29b-41d4-a716-446655440000',
          content: 'Some partial reflection text that is long enough',
          aiFeedback: 'Great reflection.',
          status: 'accepted',
        },
      });

      render(<SessionSummaryScreen />, { wrapper: Wrapper });

      fireEvent.changeText(
        screen.getByTestId('summary-input'),
        'Some partial reflection text that is long enough'
      );
      fireEvent.press(screen.getByTestId('summary-close-button'));

      await waitFor(() => {
        expect(platformAlert).toHaveBeenCalled();
      });

      const [, , buttons] = (platformAlert as jest.Mock).mock.calls[0];
      const submit = buttons.find(
        (b: { text: string }) => b.text === 'Submit now'
      );
      await submit.onPress();

      await waitFor(() => {
        expect(mockSubmitMutateAsync).toHaveBeenCalled();
      });
      expect(mockSkipMutateAsync).not.toHaveBeenCalled();
    });

    it('empty input + close still performs the silent skip (no dialog)', async () => {
      render(<SessionSummaryScreen />, { wrapper: Wrapper });

      // User types nothing, just taps X.
      fireEvent.press(screen.getByTestId('summary-close-button'));

      await waitFor(() => {
        expect(mockSkipMutateAsync).toHaveBeenCalled();
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
        profileId: 'p-1',
        sessionId: '660e8400-e29b-41d4-a716-446655440000',
        content: 'text I started last time but never submitted',
        updatedAt: new Date().toISOString(),
      });

      render(<SessionSummaryScreen />, { wrapper: Wrapper });

      await waitFor(() => {
        screen.getByTestId('summary-resubmit-banner');
      });
      expect(screen.queryByTestId('summary-skipped-state')).toBeNull();
      screen.getByDisplayValue('text I started last time but never submitted');
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
