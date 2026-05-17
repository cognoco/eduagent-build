import { fireEvent, render, screen } from '@testing-library/react-native';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      if (opts && typeof opts === 'object') {
        return `${key}:${JSON.stringify(opts)}`;
      }
      return key;
    },
  }),
  initReactI18next: { type: '3rdParty', init: jest.fn() },
}));

const mockPush = jest.fn();
const mockUseLocalSearchParams = jest.fn();
const mockUseChildSubjectTopics = jest.fn();
const mockUseChildInventory = jest.fn();
const mockUseProfileSessions = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
  useLocalSearchParams: () => mockUseLocalSearchParams(),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('../../../../../hooks/use-dashboard', () => ({
  useChildSubjectTopics: (...args: unknown[]) =>
    mockUseChildSubjectTopics(...args),
}));

jest.mock('../../../../../hooks/use-progress', () => ({
  useChildInventory: (...args: unknown[]) => mockUseChildInventory(...args),
  useProfileSessions: (...args: unknown[]) => mockUseProfileSessions(...args),
}));

const SubjectTopicsScreen = require('./[subjectId]').default;

describe('SubjectTopicsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseLocalSearchParams.mockReturnValue({
      profileId: 'child-1',
      subjectId: 'subject-1',
      subjectName: 'Mathematics',
    });
    mockUseChildInventory.mockReturnValue({
      data: { global: { totalSessions: 5 }, subjects: [] },
    });
    mockUseProfileSessions.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });
  });

  it('hides the review badge when a topic has no meaningful review data', () => {
    mockUseChildSubjectTopics.mockReturnValue({
      data: [
        {
          topicId: 'topic-1',
          title: 'Fractions',
          description: 'Desc',
          completionStatus: 'not_started',
          retentionStatus: 'strong',
          struggleStatus: 'normal',
          masteryScore: 0.4,
          summaryExcerpt: null,
          xpStatus: 'pending',
          totalSessions: 0,
        },
      ],
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });

    render(<SubjectTopicsScreen />);

    expect(screen.queryByTestId('retention-signal-strong')).toBeNull();
  });

  it('passes totalSessions to the topic detail route and shows review data when present', () => {
    mockUseChildSubjectTopics.mockReturnValue({
      data: [
        {
          topicId: 'topic-1',
          title: 'Fractions',
          description: 'Desc',
          completionStatus: 'in_progress',
          retentionStatus: 'fading',
          struggleStatus: 'normal',
          masteryScore: 0.4,
          summaryExcerpt: null,
          xpStatus: 'pending',
          totalSessions: 3,
        },
      ],
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });

    render(<SubjectTopicsScreen />);

    screen.getByTestId('retention-signal-fading');

    fireEvent.press(screen.getByTestId('topic-card-topic-1'));

    expect(mockPush).toHaveBeenCalledWith(
      expect.objectContaining({
        params: expect.objectContaining({
          totalSessions: '3',
        }),
      }),
    );
  });

  it('shows recent subject sessions when no topics are ready yet', () => {
    mockUseChildSubjectTopics.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });
    mockUseProfileSessions.mockReturnValue({
      data: [
        {
          sessionId: 'session-1',
          subjectId: 'subject-1',
          subjectName: 'Mathematics',
          topicId: null,
          topicTitle: null,
          sessionType: 'learning',
          startedAt: '2026-05-13T12:00:00.000Z',
          endedAt: null,
          exchangeCount: 4,
          escalationRung: 1,
          durationSeconds: 600,
          wallClockSeconds: 900,
          displayTitle: 'Learning',
          displaySummary: null,
          homeworkSummary: null,
          highlight: 'Practised number lines.',
          narrative: null,
          conversationPrompt: null,
          engagementSignal: null,
          drills: [],
        },
      ],
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });

    render(<SubjectTopicsScreen />);

    screen.getByTestId('subject-recent-sessions');
    fireEvent.press(screen.getByTestId('subject-session-card-session-1'));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/child/[profileId]/session/[sessionId]',
      params: {
        profileId: 'child-1',
        sessionId: 'session-1',
      },
    });
  });
});
