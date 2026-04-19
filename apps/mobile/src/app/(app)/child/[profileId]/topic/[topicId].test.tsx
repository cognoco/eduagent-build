import { render, screen } from '@testing-library/react-native';

const mockUseLocalSearchParams = jest.fn();
const mockUseChildSessions = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => mockUseLocalSearchParams(),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('../../../../../hooks/use-dashboard', () => ({
  useChildSessions: (...args: unknown[]) => mockUseChildSessions(...args),
}));

const TopicDetailScreen = require('./[topicId]').default;

describe('TopicDetailScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseChildSessions.mockReturnValue({
      data: [],
      isLoading: false,
    });
  });

  it('renders the understanding card and parent-facing review status', () => {
    mockUseLocalSearchParams.mockReturnValue({
      topicId: 'topic-1',
      profileId: 'child-1',
      title: 'Fractions',
      completionStatus: 'completed',
      masteryScore: '0.8',
      retentionStatus: 'fading',
      totalSessions: '3',
      subjectId: 'subject-1',
      subjectName: 'Mathematics',
    });

    render(<TopicDetailScreen />);

    expect(screen.getByTestId('topic-understanding-card')).toBeTruthy();
    expect(screen.getByText('Understanding')).toBeTruthy();
    expect(screen.getByText('Getting comfortable')).toBeTruthy();
    expect(screen.getByText('Review status')).toBeTruthy();
    expect(screen.getByText('A few things to refresh')).toBeTruthy();
  });

  it('hides the review card when review data is not meaningful yet', () => {
    mockUseLocalSearchParams.mockReturnValue({
      topicId: 'topic-1',
      profileId: 'child-1',
      title: 'Fractions',
      completionStatus: 'not_started',
      masteryScore: '0.2',
      retentionStatus: 'strong',
      totalSessions: '0',
      subjectId: 'subject-1',
      subjectName: 'Mathematics',
    });

    render(<TopicDetailScreen />);

    expect(screen.queryByTestId('topic-retention-card')).toBeNull();
  });
});
