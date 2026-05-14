import { render, screen } from '@testing-library/react-native';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      if (opts && typeof opts === 'object') {
        return `${key}:${JSON.stringify(opts)}`;
      }
      return key;
    },
  }),
}));

const mockUseLocalSearchParams = jest.fn();
const mockUseProfileSessions = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => mockUseLocalSearchParams(),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock(
  '../../../../../hooks/use-progress' /* gc1-allow: existing isolated screen test now mirrors the real useProfileSessions dependency */,
  () => ({
    useProfileSessions: (...args: unknown[]) => mockUseProfileSessions(...args),
  }),
);

const TopicDetailScreen = require('./[topicId]').default;

describe('TopicDetailScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseProfileSessions.mockReturnValue({
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

    screen.getByTestId('topic-understanding-card');
    screen.getByText('parentView.topic.understanding');
    screen.getByText('Getting comfortable');
    screen.getByText('parentView.topic.reviewStatus');
    screen.getByText('A few things to refresh');
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

  // [BUG-813] Repro: a malformed `totalSessions` URL param (e.g. "abc")
  // produced NaN when piped through Number(). The screen rendered
  // "NaN sessions" and downstream comparisons (totalSessions >= 1) treated
  // NaN as falsy, hiding the review card with no signal that the value was
  // bad. Fix uses Number.isFinite to fall back to 0.
  it('[BUG-813] falls back to 0 when totalSessions param is non-numeric', () => {
    mockUseLocalSearchParams.mockReturnValue({
      topicId: 'topic-1',
      profileId: 'child-1',
      title: 'Fractions',
      completionStatus: 'not_started',
      masteryScore: '0.2',
      retentionStatus: 'strong',
      totalSessions: 'abc',
      subjectId: 'subject-1',
      subjectName: 'Mathematics',
    });

    expect(() => render(<TopicDetailScreen />)).not.toThrow();
    // The screen should render normally; "NaN" must not appear anywhere.
    expect(screen.queryByText(/NaN/)).toBeNull();
  });
});
