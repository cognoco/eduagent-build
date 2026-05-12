import {
  render,
  screen,
  fireEvent,
  waitFor,
} from '@testing-library/react-native';

import ProgressSubjectScreen from '.';

jest.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: jest.fn() },
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      // Minimal translation table for progress.subject assertions in this suite.
      const map: Record<string, string> = {
        'progress.subject.noSubjectTitle': 'No subject selected',
        'progress.subject.noSubjectSubtitle':
          'Pick a subject from your progress page to see details.',
        'progress.subject.backToProgress': 'Back to progress',
        'progress.subject.loadingTooLong': 'Loading is taking too long',
        'progress.subject.checkConnection':
          'Check your connection and try again.',
        'progress.subject.errorTitle': "We couldn't load this subject",
        'progress.subject.errorMessageServer':
          'Something went wrong on our end. Tap below to retry.',
        'progress.subject.errorMessageNetwork':
          'Check your connection and try again.',
        'progress.subject.fallbackTitle': 'Subject progress',
        'progress.subject.topicsMastered': `${opts?.mastered ?? ''}/${
          opts?.total ?? ''
        } planned topics mastered`,
        'progress.subject.noTopicsPlanned': 'No topics planned yet',
        'progress.subject.topicsExplored': `${opts?.count ?? ''} ${
          (opts?.count ?? 0) === 1 ? 'topic' : 'topics'
        } explored`,
        'progress.subject.wordsTracked': `${
          opts?.count ?? ''
        } words tracked in this subject`,
        'progress.subject.sessionsCompleted': `${opts?.count ?? ''} ${
          (opts?.count ?? 0) === 1 ? 'session' : 'sessions'
        } completed`,
        'progress.subject.statStarted': 'Started',
        'progress.subject.statNotStarted': 'Not started',
        'progress.subject.statTimeSpent': 'Time spent',
        'progress.subject.statSessions': 'Sessions',
        'progress.subject.vocabularyTitle': 'Vocabulary',
        'progress.subject.vocabularyBreakdown': `${
          opts?.mastered ?? ''
        } mastered • ${opts?.learning ?? ''} learning • ${opts?.new ?? ''} new`,
        'progress.subject.wordCount': `${opts?.count ?? ''} words`,
        'progress.subject.viewAllVocab': 'View all vocabulary',
        'progress.subject.viewAllVocabLink': 'View all vocabulary →',
        'progress.subject.languageMilestone': 'Language milestone',
        'progress.subject.milestoneLoadError': 'Could not load milestone data.',
        'progress.subject.retryMilestone': 'Retry loading milestone',
        'progress.subject.wordsProgress': `${opts?.mastered ?? ''}/${
          opts?.target ?? ''
        } words`,
        'progress.subject.phrasesProgress': `${opts?.mastered ?? ''}/${
          opts?.target ?? ''
        } phrases`,
        'progress.subject.upNext': `Up next: ${opts?.level ?? ''} — ${
          opts?.title ?? ''
        }`,
        'progress.subject.milestoneNoData':
          'Complete a session to start tracking your milestone progress.',
        'progress.subject.retentionTitle': 'Current retention',
        'progress.subject.retentionLoadError':
          "We couldn't load retention data right now.",
        'progress.subject.retryRetention': 'Retry loading retention',
        'progress.subject.retentionStrong': 'Knowledge feels stable right now.',
        'progress.subject.retentionFading':
          'A light review would help keep this fresh.',
        'progress.subject.retentionWeak':
          'This subject would benefit from some extra attention.',
        'progress.register.adult.retentionStrong': 'Still remembered.',
        'progress.register.adult.retentionFading':
          'Getting fuzzy — a quick review will help.',
        'progress.register.adult.retentionWeak': 'Needs a quick refresh.',
        'progress.register.child.retentionStrong':
          'What came back to you this week.',
        'progress.register.child.retentionFading': 'Worth a quick refresh.',
        'progress.register.child.retentionWeak': 'Worth coming back to.',
        'progress.subject.openShelf': 'Open shelf',
        'progress.subject.pastConversations': 'Past conversations',
        'progress.subject.resume': 'Resume',
        'progress.subject.chooseNext': 'Choose next',
        'progress.subject.hideSubject': 'Hide subject',
        'progress.subject.hidingSubject': 'Hiding subject...',
        'progress.subject.hideSubjectHint':
          'Hides this subject from your main student views. You can restore it from Library later.',
        'progress.subject.hideConfirmTitle': `Hide ${opts?.subject ?? ''}?`,
        'progress.subject.hideConfirmMessage':
          'This will move the subject out of your main views. Your learning history stays saved, and you can restore it from Library.',
        'progress.subject.hideConfirmAction': 'Hide subject',
        'progress.subject.hideErrorTitle': 'Could not hide subject',
        'progress.subject.goneTitle': 'This subject is no longer available',
        'progress.subject.goneSubtitle':
          'It may have been removed or merged into another subject.',
        'progress.keepLearning': 'Keep learning',
        'common.cancel': 'Cancel',
        'common.retry': 'Retry',
        'common.tryAgain': 'Try Again',
        'common.goBack': 'Go back',
      };
      if (key in map) return map[key]!;
      return key;
    },
  }),
}));

const mockReplace = jest.fn();
const mockPush = jest.fn();
const mockGoBackOrReplace = jest.fn();
const mockPushLearningResumeTarget = jest.fn();
const mockLocalSearchParams = jest.fn(() => ({ subjectId: 's1' }));

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), replace: mockReplace, push: mockPush }),
  useLocalSearchParams: () => mockLocalSearchParams(),
}));

jest.mock(
  '../../../../hooks/use-active-profile-role' /* gc1-allow: unit test boundary */,
  () => ({
    // gc1-allow: subject progress screen varies retention copy by role; mocking the role hook pins the register for deterministic assertions.
    useActiveProfileRole: () => 'owner',
  }),
);

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0 }),
}));

jest.mock(
  '../../../../lib/navigation' /* gc1-allow: unit test boundary */,
  () => ({
    goBackOrReplace: (...args: unknown[]) => mockGoBackOrReplace(...args),
    pushLearningResumeTarget: (...args: unknown[]) =>
      mockPushLearningResumeTarget(...args),
  }),
);

jest.mock(
  '../../../../components/common' /* gc1-allow: unit test boundary */,
  () => {
    const { View, Text, Pressable } = require('react-native');
    return {
      ErrorFallback: (props: {
        testID?: string;
        title?: string;
        message?: string;
        primaryAction?: { testID?: string; onPress: () => void; label: string };
        secondaryAction?: {
          testID?: string;
          onPress: () => void;
          label: string;
        };
      }) => (
        <View testID={props.testID}>
          {props.title ? <Text>{props.title}</Text> : null}
          {props.message ? <Text>{props.message}</Text> : null}
          {props.primaryAction ? (
            <Pressable
              testID={props.primaryAction.testID}
              onPress={props.primaryAction.onPress}
            >
              <Text>{props.primaryAction.label}</Text>
            </Pressable>
          ) : null}
          {props.secondaryAction ? (
            <Pressable
              testID={props.secondaryAction.testID}
              onPress={props.secondaryAction.onPress}
            >
              <Text>{props.secondaryAction.label}</Text>
            </Pressable>
          ) : null}
        </View>
      ),
    };
  },
);

jest.mock(
  '../../../../components/progress' /* gc1-allow: unit test boundary */,
  () => ({
    ProgressBar: () => null,
  }),
);

const mockUseProgressInventory = jest.fn();
const mockUseSubjectProgress = jest.fn();
const mockUseLearningResumeTarget = jest.fn();
jest.mock(
  '../../../../hooks/use-progress' /* gc1-allow: unit test boundary */,
  () => ({
    useProgressInventory: (...args: unknown[]) =>
      mockUseProgressInventory(...args),
    useSubjectProgress: (...args: unknown[]) => mockUseSubjectProgress(...args),
    useLearningResumeTarget: (...args: unknown[]) =>
      mockUseLearningResumeTarget(...args),
  }),
);

const mockUseLanguageProgress = jest.fn();
jest.mock(
  '../../../../hooks/use-language-progress' /* gc1-allow: unit test boundary */,
  () => ({
    useLanguageProgress: (...args: unknown[]) =>
      mockUseLanguageProgress(...args),
  }),
);

const mockMutateSubjectAsync = jest.fn();
const mockUseUpdateSubject = jest.fn();
jest.mock(
  '../../../../hooks/use-subjects' /* gc1-allow: unit test boundary */,
  () => ({
    useUpdateSubject: (...args: unknown[]) => mockUseUpdateSubject(...args),
  }),
);

const mockPlatformAlert = jest.fn();
jest.mock(
  '../../../../lib/platform-alert' /* gc1-allow: unit test boundary */,
  () => ({
    platformAlert: (...args: unknown[]) => mockPlatformAlert(...args),
  }),
);

jest.mock(
  '../../../../lib/format-api-error' /* gc1-allow: unit test boundary */,
  () => ({
    ...jest.requireActual('../../../../lib/format-api-error'),
    formatApiError: (err: Error) => `formatted: ${err.message}`,
  }),
);

// ─── Fixtures ────────────────────────────────────────────────────────────────

const fullSubject = {
  subjectId: 's1',
  subjectName: 'Math',
  pedagogyMode: 'general',
  topics: { total: 10, explored: 5, mastered: 3, inProgress: 2, notStarted: 5 },
  vocabulary: { total: 0, mastered: 0, learning: 0, new: 0, byCefrLevel: {} },
  estimatedProficiency: null,
  estimatedProficiencyLabel: null,
  lastSessionAt: null,
  activeMinutes: 30,
  wallClockMinutes: 45,
  sessionsCount: 5,
};

// ─── Helper ──────────────────────────────────────────────────────────────────

function mockHooks({
  inventoryData = { subjects: [fullSubject] } as
    | { subjects: (typeof fullSubject)[] }
    | undefined,
  inventoryIsLoading = false,
  inventoryIsError = false,
  inventoryError = null as Error | null,
  subjectProgressData = undefined as { retentionStatus: string } | undefined,
  subjectProgressIsError = false,
  languageProgressData = undefined as Record<string, unknown> | undefined,
  languageProgressIsLoading = false,
  languageProgressIsError = false,
} = {}) {
  const inventoryRefetch = jest.fn();
  const subjectProgressRefetch = jest.fn();
  const languageProgressRefetch = jest.fn();

  mockUseProgressInventory.mockReturnValue({
    data: inventoryIsLoading || inventoryIsError ? undefined : inventoryData,
    isLoading: inventoryIsLoading,
    isError: inventoryIsError,
    error: inventoryError,
    refetch: inventoryRefetch,
  });

  mockUseSubjectProgress.mockReturnValue({
    data: subjectProgressData,
    isLoading: false,
    isError: subjectProgressIsError,
    error: subjectProgressIsError ? new Error('retention fail') : null,
    refetch: subjectProgressRefetch,
  });

  mockUseLearningResumeTarget.mockReturnValue({
    data: null,
  });

  mockUseLanguageProgress.mockReturnValue({
    data: languageProgressData,
    isLoading: languageProgressIsLoading,
    isError: languageProgressIsError,
    error: languageProgressIsError ? new Error('lang fail') : null,
    refetch: languageProgressRefetch,
  });

  mockUseUpdateSubject.mockReturnValue({
    mutateAsync: mockMutateSubjectAsync,
    isPending: false,
  });

  return { inventoryRefetch, subjectProgressRefetch, languageProgressRefetch };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('ProgressSubjectScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLocalSearchParams.mockReturnValue({ subjectId: 's1' });
    mockMutateSubjectAsync.mockResolvedValue({ subject: {} });
  });

  // ── Missing subjectId ────────────────────────────────────────────────────
  describe('missing subjectId', () => {
    beforeEach(() => {
      mockLocalSearchParams.mockReturnValue({} as { subjectId: string });
    });

    it('shows "No subject selected" view with correct testID', () => {
      mockHooks();
      render(<ProgressSubjectScreen />);
      screen.getByTestId('progress-subject-missing');
      screen.getByText('No subject selected');
    });

    it('shows a "Back to progress" action button', () => {
      mockHooks();
      render(<ProgressSubjectScreen />);
      screen.getByTestId('progress-subject-missing-back');
    });

    it('navigates to progress list when back button pressed', () => {
      mockHooks();
      render(<ProgressSubjectScreen />);
      fireEvent.press(screen.getByTestId('progress-subject-missing-back'));
      expect(mockReplace).toHaveBeenCalledWith('/(app)/progress');
    });
  });

  // ── Loading ──────────────────────────────────────────────────────────────
  describe('loading state', () => {
    it('shows skeleton placeholder with correct testID', () => {
      mockHooks({ inventoryIsLoading: true });
      render(<ProgressSubjectScreen />);
      screen.getByTestId('progress-subject-loading');
    });

    it('does not show subject content while loading', () => {
      mockHooks({ inventoryIsLoading: true });
      render(<ProgressSubjectScreen />);
      expect(screen.queryByText('Math')).toBeNull();
    });
  });

  // ── Error (inventory query) ──────────────────────────────────────────────
  describe('inventory error state', () => {
    it('shows ErrorFallback with correct testID', () => {
      mockHooks({ inventoryIsError: true });
      render(<ProgressSubjectScreen />);
      screen.getByTestId('progress-subject-error');
    });

    it('shows error title', () => {
      mockHooks({ inventoryIsError: true });
      render(<ProgressSubjectScreen />);
      screen.getByText("We couldn't load this subject");
    });

    it('calls refetch when retry button pressed', () => {
      const { inventoryRefetch } = mockHooks({ inventoryIsError: true });
      render(<ProgressSubjectScreen />);
      fireEvent.press(screen.getByTestId('progress-subject-error-retry'));
      expect(inventoryRefetch).toHaveBeenCalled();
    });

    it('navigates to progress list when error back button pressed', () => {
      mockHooks({ inventoryIsError: true });
      render(<ProgressSubjectScreen />);
      fireEvent.press(screen.getByTestId('progress-subject-error-back'));
      expect(mockReplace).toHaveBeenCalledWith('/(app)/progress');
    });

    it('shows connection message for non-API errors', () => {
      mockHooks({
        inventoryIsError: true,
        inventoryError: new Error('network error'),
      });
      render(<ProgressSubjectScreen />);
      screen.getByText('Check your connection and try again.');
    });

    it('shows server error message when error message includes "API error"', () => {
      mockHooks({
        inventoryIsError: true,
        inventoryError: new Error('API error 500'),
      });
      render(<ProgressSubjectScreen />);
      screen.getByText('Something went wrong on our end. Tap below to retry.');
    });
  });

  // ── Subject found (happy path) ───────────────────────────────────────────
  describe('subject found', () => {
    it('displays the subject name', () => {
      mockHooks();
      render(<ProgressSubjectScreen />);
      screen.getByText('Math');
    });

    it('shows topics mastered / total heading', () => {
      mockHooks();
      render(<ProgressSubjectScreen />);
      screen.getByText('3/10 planned topics mastered');
    });

    it('shows sessions count when vocabulary total is 0', () => {
      mockHooks();
      render(<ProgressSubjectScreen />);
      screen.getByText('5 sessions completed');
    });

    it('shows stat cards — Started, Not started, Time spent, Sessions', () => {
      mockHooks();
      render(<ProgressSubjectScreen />);
      screen.getByText('Started');
      screen.getByText('Not started');
      screen.getByText('Time spent');
      screen.getByText('Sessions');
    });

    it('shows formatted wallClockMinutes in Time spent stat card (priority over activeMinutes)', () => {
      mockHooks();
      render(<ProgressSubjectScreen />);
      // wallClockMinutes=45 takes priority over activeMinutes=30; formatMinutes(45) → "45 min"
      screen.getByText('45 min');
    });

    it('shows "Choose next", "Past conversations", and "Open shelf" buttons when there is no resume target', () => {
      mockHooks();
      render(<ProgressSubjectScreen />);
      screen.getByText('Choose next');
      screen.getByText('Past conversations');
      screen.getByText('Open shelf');
      screen.getByText('Hide subject');
    });

    it('navigates to subject sessions on "Past conversations" press', () => {
      mockHooks();
      render(<ProgressSubjectScreen />);
      fireEvent.press(screen.getByText('Past conversations'));
      expect(mockPush).toHaveBeenCalledWith({
        pathname: '/(app)/progress/[subjectId]/sessions',
        params: { subjectId: 's1' },
      });
    });

    it('opens the shelf on primary action press when there is no resume target', () => {
      mockHooks();
      render(<ProgressSubjectScreen />);
      fireEvent.press(screen.getByText('Choose next'));
      expect(mockPush).toHaveBeenCalledWith({
        pathname: '/(app)/shelf/[subjectId]',
        params: { subjectId: 's1' },
      });
    });

    it('resumes the shared subject target on "Resume" press', () => {
      const target = {
        subjectId: 's1',
        subjectName: 'Math',
        topicId: 't1',
        topicTitle: 'Fractions',
        sessionId: null,
        resumeFromSessionId: 'prev-session',
        resumeKind: 'recent_topic',
        lastActivityAt: '2026-02-15T09:00:00.000Z',
        reason: 'Continue Fractions',
      };
      mockHooks();
      mockUseLearningResumeTarget.mockReturnValue({ data: target });

      render(<ProgressSubjectScreen />);
      fireEvent.press(screen.getByText('Resume'));

      expect(mockPushLearningResumeTarget).toHaveBeenCalledWith(
        expect.anything(),
        target,
      );
      expect(mockPush).not.toHaveBeenCalledWith(
        '/(app)/session?mode=learning&subjectId=s1',
      );
    });

    it('navigates to shelf on "Open shelf" press', () => {
      mockHooks();
      render(<ProgressSubjectScreen />);
      fireEvent.press(screen.getByText('Open shelf'));
      expect(mockPush).toHaveBeenCalledWith({
        pathname: '/(app)/shelf/[subjectId]',
        params: { subjectId: 's1' },
      });
    });

    it('back arrow calls goBackOrReplace with progress route', () => {
      mockHooks();
      render(<ProgressSubjectScreen />);
      fireEvent.press(screen.getByTestId('progress-subject-back'));
      expect(mockGoBackOrReplace).toHaveBeenCalledWith(
        expect.anything(),
        '/(app)/progress',
      );
    });

    it('asks for confirmation before hiding the subject', () => {
      mockHooks();
      render(<ProgressSubjectScreen />);

      fireEvent.press(screen.getByTestId('progress-subject-hide'));

      expect(mockPlatformAlert).toHaveBeenCalledWith(
        'Hide Math?',
        'This will move the subject out of your main views. Your learning history stays saved, and you can restore it from Library.',
        expect.arrayContaining([
          expect.objectContaining({ text: 'Cancel', style: 'cancel' }),
          expect.objectContaining({
            text: 'Hide subject',
            style: 'destructive',
          }),
        ]),
        { cancelable: true },
      );
      expect(mockMutateSubjectAsync).not.toHaveBeenCalled();
    });

    it('archives the subject and returns to progress after confirmation', async () => {
      mockHooks();
      render(<ProgressSubjectScreen />);

      fireEvent.press(screen.getByTestId('progress-subject-hide'));
      const buttons = mockPlatformAlert.mock.calls[0]?.[2] as Array<{
        text: string;
        onPress?: () => void;
      }>;
      buttons.find((button) => button.text === 'Hide subject')?.onPress?.();

      await waitFor(() => {
        expect(mockMutateSubjectAsync).toHaveBeenCalledWith({
          subjectId: 's1',
          status: 'archived',
        });
      });
      expect(mockReplace).toHaveBeenCalledWith('/(app)/progress');
    });

    it('shows a friendly error if hiding fails', async () => {
      mockMutateSubjectAsync.mockRejectedValueOnce(new Error('Nope'));
      mockHooks();
      render(<ProgressSubjectScreen />);

      fireEvent.press(screen.getByTestId('progress-subject-hide'));
      const buttons = mockPlatformAlert.mock.calls[0]?.[2] as Array<{
        text: string;
        onPress?: () => void;
      }>;
      buttons.find((button) => button.text === 'Hide subject')?.onPress?.();

      await waitFor(() => {
        expect(mockPlatformAlert).toHaveBeenLastCalledWith(
          'Could not hide subject',
          'formatted: Nope',
        );
      });
    });

    it('shows topics explored when total is null', () => {
      const subjectNoTotal = {
        ...fullSubject,
        topics: {
          ...fullSubject.topics,
          total: null as unknown as number,
          explored: 7,
          mastered: 2,
          inProgress: 3,
        },
      };
      mockHooks({ inventoryData: { subjects: [subjectNoTotal] } });
      render(<ProgressSubjectScreen />);
      // max(explored, mastered+inProgress) = max(7, 5) = 7 topics explored
      screen.getByText('7 topics explored');
    });
  });

  // ── Vocabulary section ───────────────────────────────────────────────────
  describe('vocabulary section', () => {
    const subjectWithVocab = {
      ...fullSubject,
      vocabulary: {
        total: 42,
        mastered: 20,
        learning: 15,
        new: 7,
        byCefrLevel: { A1: 10, A2: 32 } as Record<string, number>,
      },
    };

    it('shows vocabulary word count when total > 0', () => {
      mockHooks({ inventoryData: { subjects: [subjectWithVocab] } });
      render(<ProgressSubjectScreen />);
      screen.getByText('42 words tracked in this subject');
    });

    it('shows mastered / learning / new breakdown', () => {
      mockHooks({ inventoryData: { subjects: [subjectWithVocab] } });
      render(<ProgressSubjectScreen />);
      screen.getByText(/20 mastered/);
      screen.getByText(/15 learning/);
      screen.getByText(/7 new/);
    });

    it('shows "View all vocabulary" button', () => {
      mockHooks({ inventoryData: { subjects: [subjectWithVocab] } });
      render(<ProgressSubjectScreen />);
      screen.getByTestId('vocab-view-all');
    });

    it('does not show vocabulary section when total is 0', () => {
      mockHooks();
      render(<ProgressSubjectScreen />);
      expect(screen.queryByTestId('vocab-view-all')).toBeNull();
    });
  });

  // ── Subject gone ─────────────────────────────────────────────────────────
  describe('subject gone (inventory loaded, subject not found)', () => {
    it('shows "no longer available" card with correct testID', () => {
      mockHooks({ inventoryData: { subjects: [] } });
      render(<ProgressSubjectScreen />);
      screen.getByTestId('progress-subject-gone');
    });

    it('shows explanatory text', () => {
      mockHooks({ inventoryData: { subjects: [] } });
      render(<ProgressSubjectScreen />);
      screen.getByText('This subject is no longer available');
    });

    it('navigates to progress list when gone-back button pressed', () => {
      mockHooks({ inventoryData: { subjects: [] } });
      render(<ProgressSubjectScreen />);
      fireEvent.press(screen.getByTestId('progress-subject-gone-back'));
      expect(mockReplace).toHaveBeenCalledWith('/(app)/progress');
    });
  });

  // ── Language subject / CEFR milestone card ───────────────────────────────
  describe('language subject (pedagogyMode four_strands)', () => {
    const languageSubject = { ...fullSubject, pedagogyMode: 'four_strands' };

    const milestoneData = {
      currentLevel: 'A2',
      currentMilestone: {
        milestoneTitle: 'Everyday conversations',
        wordsMastered: 80,
        wordsTarget: 150,
        chunksMastered: 20,
        chunksTarget: 40,
        milestoneProgress: 0.5,
      },
      nextMilestone: {
        level: 'B1',
        milestoneTitle: 'Intermediate fluency',
      },
    };

    it('shows CEFR milestone card', () => {
      mockHooks({
        inventoryData: { subjects: [languageSubject] },
        languageProgressData: milestoneData,
      });
      render(<ProgressSubjectScreen />);
      screen.getByTestId('cefr-milestone-card');
    });

    it('shows current level and milestone title', () => {
      mockHooks({
        inventoryData: { subjects: [languageSubject] },
        languageProgressData: milestoneData,
      });
      render(<ProgressSubjectScreen />);
      screen.getByText(/A2/);
      screen.getByText(/Everyday conversations/);
    });

    it('shows words and phrases progress counts', () => {
      mockHooks({
        inventoryData: { subjects: [languageSubject] },
        languageProgressData: milestoneData,
      });
      render(<ProgressSubjectScreen />);
      screen.getByText('80/150 words');
      screen.getByText('20/40 phrases');
    });

    it('shows next milestone label when present', () => {
      mockHooks({
        inventoryData: { subjects: [languageSubject] },
        languageProgressData: milestoneData,
      });
      render(<ProgressSubjectScreen />);
      screen.getByText(/Up next: B1/);
    });

    it('shows "Complete a session" prompt when no milestone data yet', () => {
      mockHooks({
        inventoryData: { subjects: [languageSubject] },
        languageProgressData: { currentLevel: 'A1', currentMilestone: null },
      });
      render(<ProgressSubjectScreen />);
      screen.getByText(
        'Complete a session to start tracking your milestone progress.',
      );
    });

    it('shows CEFR card for general subject when languageProgress is present', () => {
      // isLanguageSubject = pedagogyMode four_strands OR !!languageProgress
      mockHooks({ languageProgressData: milestoneData });
      render(<ProgressSubjectScreen />);
      screen.getByTestId('cefr-milestone-card');
    });

    it('shows retry button when language progress query errors', () => {
      const { languageProgressRefetch } = mockHooks({
        inventoryData: { subjects: [languageSubject] },
        languageProgressIsError: true,
      });
      render(<ProgressSubjectScreen />);
      screen.getByTestId('cefr-milestone-card');
      const retryBtn = screen.getByTestId('cefr-milestone-retry');
      fireEvent.press(retryBtn);
      expect(languageProgressRefetch).toHaveBeenCalled();
    });
  });

  // ── Retention error ──────────────────────────────────────────────────────
  describe('retention error state', () => {
    it('shows retention error card with correct testID', () => {
      mockHooks({ subjectProgressIsError: true });
      render(<ProgressSubjectScreen />);
      screen.getByTestId('progress-subject-retention-error');
    });

    it('shows retention error heading', () => {
      mockHooks({ subjectProgressIsError: true });
      render(<ProgressSubjectScreen />);
      screen.getByText('Current retention');
    });

    it('calls subjectProgressQuery.refetch on retry press', () => {
      const { subjectProgressRefetch } = mockHooks({
        subjectProgressIsError: true,
      });
      render(<ProgressSubjectScreen />);
      fireEvent.press(screen.getByTestId('progress-subject-retention-retry'));
      expect(subjectProgressRefetch).toHaveBeenCalled();
    });
  });

  // ── Retention data (legacy progress) ────────────────────────────────────
  describe('retention data present', () => {
    it('shows adult copy for strong retention', () => {
      mockHooks({ subjectProgressData: { retentionStatus: 'strong' } });
      render(<ProgressSubjectScreen />);
      screen.getByText('Still remembered.');
    });

    it('shows review suggestion for fading retention', () => {
      mockHooks({ subjectProgressData: { retentionStatus: 'fading' } });
      render(<ProgressSubjectScreen />);
      screen.getByText('Getting fuzzy — a quick review will help.');
    });

    it('shows extra attention message for weak retention', () => {
      mockHooks({ subjectProgressData: { retentionStatus: 'weak' } });
      render(<ProgressSubjectScreen />);
      screen.getByText('Needs a quick refresh.');
    });

    it('opens the shelf when the retention card is pressed without a resume target', () => {
      mockHooks({ subjectProgressData: { retentionStatus: 'weak' } });
      render(<ProgressSubjectScreen />);

      fireEvent.press(screen.getByTestId('progress-subject-retention-card'));

      expect(mockPush).toHaveBeenCalledWith({
        pathname: '/(app)/shelf/[subjectId]',
        params: { subjectId: 's1' },
      });
    });

    it('resumes the subject target when the retention card is pressed and a resume target exists', () => {
      const target = {
        subjectId: 's1',
        subjectName: 'Math',
        topicId: 't1',
        topicTitle: 'Fractions',
        sessionId: null,
        resumeFromSessionId: 'prev-session',
        resumeKind: 'recent_topic',
        lastActivityAt: '2026-02-15T09:00:00.000Z',
        reason: 'Continue Fractions',
      };
      mockHooks({ subjectProgressData: { retentionStatus: 'weak' } });
      mockUseLearningResumeTarget.mockReturnValue({ data: target });

      render(<ProgressSubjectScreen />);
      fireEvent.press(screen.getByTestId('progress-subject-retention-card'));

      expect(mockPushLearningResumeTarget).toHaveBeenCalledWith(
        expect.anything(),
        target,
      );
    });
  });
});
