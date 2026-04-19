import { fireEvent, render, screen } from '@testing-library/react-native';

const mockPush = jest.fn();
const mockUseLocalSearchParams = jest.fn();
const mockUseChildSubjectTopics = jest.fn();
const mockUseChildInventory = jest.fn();

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

    expect(screen.getByTestId('retention-signal-fading')).toBeTruthy();

    fireEvent.press(screen.getByTestId('topic-card-topic-1'));

    expect(mockPush).toHaveBeenCalledWith(
      expect.objectContaining({
        params: expect.objectContaining({
          totalSessions: '3',
        }),
      })
    );
  });
});
