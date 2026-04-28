import { render, screen, fireEvent } from '@testing-library/react-native';

import ProgressSubjectScreen from './[subjectId]';

const mockReplace = jest.fn();
const mockPush = jest.fn();
const mockGoBackOrReplace = jest.fn();
const mockPushLearningResumeTarget = jest.fn();
const mockLocalSearchParams = jest.fn(() => ({ subjectId: 's1' }));

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), replace: mockReplace, push: mockPush }),
  useLocalSearchParams: () => mockLocalSearchParams(),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0 }),
}));

jest.mock('../../../lib/navigation', () => ({
  goBackOrReplace: (...args: unknown[]) => mockGoBackOrReplace(...args),
  pushLearningResumeTarget: (...args: unknown[]) =>
    mockPushLearningResumeTarget(...args),
}));

jest.mock('../../../components/common', () => {
  const { View, Text, Pressable } = require('react-native');
  return {
    ErrorFallback: (props: {
      testID?: string;
      title?: string;
      message?: string;
      primaryAction?: { testID?: string; onPress: () => void; label: string };
      secondaryAction?: { testID?: string; onPress: () => void; label: string };
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
});

jest.mock('../../../components/progress', () => ({
  ProgressBar: () => null,
}));

const mockUseProgressInventory = jest.fn();
const mockUseSubjectProgress = jest.fn();
const mockUseLearningResumeTarget = jest.fn();
jest.mock('../../../hooks/use-progress', () => ({
  useProgressInventory: (...args: unknown[]) =>
    mockUseProgressInventory(...args),
  useSubjectProgress: (...args: unknown[]) => mockUseSubjectProgress(...args),
  useLearningResumeTarget: (...args: unknown[]) =>
    mockUseLearningResumeTarget(...args),
}));

const mockUseLanguageProgress = jest.fn();
jest.mock('../../../hooks/use-language-progress', () => ({
  useLanguageProgress: (...args: unknown[]) => mockUseLanguageProgress(...args),
}));

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

  return { inventoryRefetch, subjectProgressRefetch, languageProgressRefetch };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('ProgressSubjectScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLocalSearchParams.mockReturnValue({ subjectId: 's1' });
  });

  // ── Missing subjectId ────────────────────────────────────────────────────
  describe('missing subjectId', () => {
    beforeEach(() => {
      mockLocalSearchParams.mockReturnValue({} as { subjectId: string });
    });

    it('shows "No subject selected" view with correct testID', () => {
      mockHooks();
      render(<ProgressSubjectScreen />);
      expect(screen.getByTestId('progress-subject-missing')).toBeTruthy();
      expect(screen.getByText('No subject selected')).toBeTruthy();
    });

    it('shows a "Back to progress" action button', () => {
      mockHooks();
      render(<ProgressSubjectScreen />);
      expect(screen.getByTestId('progress-subject-missing-back')).toBeTruthy();
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
      expect(screen.getByTestId('progress-subject-loading')).toBeTruthy();
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
      expect(screen.getByTestId('progress-subject-error')).toBeTruthy();
    });

    it('shows error title', () => {
      mockHooks({ inventoryIsError: true });
      render(<ProgressSubjectScreen />);
      expect(screen.getByText("We couldn't load this subject")).toBeTruthy();
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
      expect(
        screen.getByText('Check your connection and try again.')
      ).toBeTruthy();
    });

    it('shows server error message when error message includes "API error"', () => {
      mockHooks({
        inventoryIsError: true,
        inventoryError: new Error('API error 500'),
      });
      render(<ProgressSubjectScreen />);
      expect(
        screen.getByText('Something went wrong on our end. Tap below to retry.')
      ).toBeTruthy();
    });
  });

  // ── Subject found (happy path) ───────────────────────────────────────────
  describe('subject found', () => {
    it('displays the subject name', () => {
      mockHooks();
      render(<ProgressSubjectScreen />);
      expect(screen.getByText('Math')).toBeTruthy();
    });

    it('shows topics mastered / total heading', () => {
      mockHooks();
      render(<ProgressSubjectScreen />);
      expect(screen.getByText('3/10 planned topics mastered')).toBeTruthy();
    });

    it('shows sessions count when vocabulary total is 0', () => {
      mockHooks();
      render(<ProgressSubjectScreen />);
      expect(screen.getByText('5 sessions completed')).toBeTruthy();
    });

    it('shows stat cards — Started, Not started, Time spent, Sessions', () => {
      mockHooks();
      render(<ProgressSubjectScreen />);
      expect(screen.getByText('Started')).toBeTruthy();
      expect(screen.getByText('Not started')).toBeTruthy();
      expect(screen.getByText('Time spent')).toBeTruthy();
      expect(screen.getByText('Sessions')).toBeTruthy();
    });

    it('shows formatted wallClockMinutes in Time spent stat card (priority over activeMinutes)', () => {
      mockHooks();
      render(<ProgressSubjectScreen />);
      // wallClockMinutes=45 takes priority over activeMinutes=30; formatMinutes(45) → "45 min"
      expect(screen.getByText('45 min')).toBeTruthy();
    });

    it('shows "Keep learning" and "Open shelf" buttons', () => {
      mockHooks();
      render(<ProgressSubjectScreen />);
      expect(screen.getByText('Keep learning')).toBeTruthy();
      expect(screen.getByText('Open shelf')).toBeTruthy();
    });

    it('navigates to session on "Keep learning" press', () => {
      mockHooks();
      render(<ProgressSubjectScreen />);
      fireEvent.press(screen.getByText('Keep learning'));
      expect(mockPush).toHaveBeenCalledWith(
        '/(app)/session?mode=learning&subjectId=s1'
      );
    });

    it('resumes the shared subject target on "Keep learning" press', () => {
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
      fireEvent.press(screen.getByText('Keep learning'));

      expect(mockPushLearningResumeTarget).toHaveBeenCalledWith(
        expect.anything(),
        target
      );
      expect(mockPush).not.toHaveBeenCalledWith(
        '/(app)/session?mode=learning&subjectId=s1'
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
        '/(app)/progress'
      );
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
      expect(screen.getByText('7 topics explored')).toBeTruthy();
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
      expect(screen.getByText('42 words tracked in this subject')).toBeTruthy();
    });

    it('shows mastered / learning / new breakdown', () => {
      mockHooks({ inventoryData: { subjects: [subjectWithVocab] } });
      render(<ProgressSubjectScreen />);
      expect(screen.getByText(/20 mastered/)).toBeTruthy();
      expect(screen.getByText(/15 learning/)).toBeTruthy();
      expect(screen.getByText(/7 new/)).toBeTruthy();
    });

    it('shows "View all vocabulary" button', () => {
      mockHooks({ inventoryData: { subjects: [subjectWithVocab] } });
      render(<ProgressSubjectScreen />);
      expect(screen.getByTestId('vocab-view-all')).toBeTruthy();
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
      expect(screen.getByTestId('progress-subject-gone')).toBeTruthy();
    });

    it('shows explanatory text', () => {
      mockHooks({ inventoryData: { subjects: [] } });
      render(<ProgressSubjectScreen />);
      expect(
        screen.getByText('This subject is no longer available')
      ).toBeTruthy();
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
      expect(screen.getByTestId('cefr-milestone-card')).toBeTruthy();
    });

    it('shows current level and milestone title', () => {
      mockHooks({
        inventoryData: { subjects: [languageSubject] },
        languageProgressData: milestoneData,
      });
      render(<ProgressSubjectScreen />);
      expect(screen.getByText(/A2/)).toBeTruthy();
      expect(screen.getByText(/Everyday conversations/)).toBeTruthy();
    });

    it('shows words and phrases progress counts', () => {
      mockHooks({
        inventoryData: { subjects: [languageSubject] },
        languageProgressData: milestoneData,
      });
      render(<ProgressSubjectScreen />);
      expect(screen.getByText('80/150 words')).toBeTruthy();
      expect(screen.getByText('20/40 phrases')).toBeTruthy();
    });

    it('shows next milestone label when present', () => {
      mockHooks({
        inventoryData: { subjects: [languageSubject] },
        languageProgressData: milestoneData,
      });
      render(<ProgressSubjectScreen />);
      expect(screen.getByText(/Up next: B1/)).toBeTruthy();
    });

    it('shows "Complete a session" prompt when no milestone data yet', () => {
      mockHooks({
        inventoryData: { subjects: [languageSubject] },
        languageProgressData: { currentLevel: 'A1', currentMilestone: null },
      });
      render(<ProgressSubjectScreen />);
      expect(
        screen.getByText(
          'Complete a session to start tracking your milestone progress.'
        )
      ).toBeTruthy();
    });

    it('shows CEFR card for general subject when languageProgress is present', () => {
      // isLanguageSubject = pedagogyMode four_strands OR !!languageProgress
      mockHooks({ languageProgressData: milestoneData });
      render(<ProgressSubjectScreen />);
      expect(screen.getByTestId('cefr-milestone-card')).toBeTruthy();
    });

    it('shows retry button when language progress query errors', () => {
      const { languageProgressRefetch } = mockHooks({
        inventoryData: { subjects: [languageSubject] },
        languageProgressIsError: true,
      });
      render(<ProgressSubjectScreen />);
      expect(screen.getByTestId('cefr-milestone-card')).toBeTruthy();
      const retryBtn = screen.getByTestId('cefr-milestone-retry');
      expect(retryBtn).toBeTruthy();
      fireEvent.press(retryBtn);
      expect(languageProgressRefetch).toHaveBeenCalled();
    });
  });

  // ── Retention error ──────────────────────────────────────────────────────
  describe('retention error state', () => {
    it('shows retention error card with correct testID', () => {
      mockHooks({ subjectProgressIsError: true });
      render(<ProgressSubjectScreen />);
      expect(
        screen.getByTestId('progress-subject-retention-error')
      ).toBeTruthy();
    });

    it('shows retention error heading', () => {
      mockHooks({ subjectProgressIsError: true });
      render(<ProgressSubjectScreen />);
      expect(screen.getByText('Current retention')).toBeTruthy();
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
    it('shows "Knowledge feels stable" for strong retention', () => {
      mockHooks({ subjectProgressData: { retentionStatus: 'strong' } });
      render(<ProgressSubjectScreen />);
      expect(
        screen.getByText('Knowledge feels stable right now.')
      ).toBeTruthy();
    });

    it('shows review suggestion for fading retention', () => {
      mockHooks({ subjectProgressData: { retentionStatus: 'fading' } });
      render(<ProgressSubjectScreen />);
      expect(
        screen.getByText('A light review would help keep this fresh.')
      ).toBeTruthy();
    });

    it('shows extra attention message for weak retention', () => {
      mockHooks({ subjectProgressData: { retentionStatus: 'weak' } });
      render(<ProgressSubjectScreen />);
      expect(
        screen.getByText(
          'This subject would benefit from some extra attention.'
        )
      ).toBeTruthy();
    });
  });
});
