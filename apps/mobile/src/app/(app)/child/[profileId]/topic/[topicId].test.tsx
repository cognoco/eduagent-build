import { render, screen } from '@testing-library/react-native';

jest.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: jest.fn() },
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
const mockAddToMyLearningButton = jest.fn();

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

jest.mock(
  '../../../../../components/family/AddToMyLearningButton' /* gc1-allow: topic route test verifies bridge props without mounting mutation/query providers */,
  () => {
    const React = require('react');
    const { Text } = require('react-native');
    return {
      AddToMyLearningButton: (props: Record<string, unknown>) => {
        mockAddToMyLearningButton(props);
        return React.createElement(
          Text,
          { testID: 'mock-add-to-my-learning' },
          props.topicTitle,
        );
      },
    };
  },
);

const TopicDetailScreen = require('./[topicId]').default;

describe('TopicDetailScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseProfileSessions.mockReturnValue({
      data: [],
      isLoading: false,
    });
    mockAddToMyLearningButton.mockClear();
  });

  it('renders the understanding card, parent-facing review status, and bridge CTA', () => {
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
      childName: 'Ava',
    });

    render(<TopicDetailScreen />);

    screen.getByTestId('topic-understanding-card');
    screen.getByText('parentView.topic.understanding');
    screen.getByText('parentView.topic.understandingLevels.gettingComfortable');
    screen.getByText('parentView.topic.reviewStatus');
    screen.getByText('A few things to refresh');
    screen.getByTestId('mock-add-to-my-learning');
    expect(mockAddToMyLearningButton).toHaveBeenCalledWith(
      expect.objectContaining({
        childDisplayName: 'Ava',
        childProfileId: 'child-1',
        subjectName: 'Mathematics',
        topicId: 'topic-1',
        topicTitle: 'Fractions',
        triggerPath: '/child/child-1/topic/topic-1',
      }),
    );
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

  // [BUG-801] Repro: a malformed `masteryScore` URL param (e.g. from a stale
  // deep link or notification sending "abc") made Number("abc") = NaN. The
  // understanding card then rendered "NaN%" as the percentage label and
  // `width: "NaN%"` on the progress bar — both broken. Fix mirrors the
  // totalSessions guard: Number.isFinite + clamp 0..1; non-finite treated as
  // absent (null), which hides the card entirely rather than showing garbage.
  it('[BUG-801] hides understanding card and renders no NaN% when masteryScore param is non-numeric', () => {
    mockUseLocalSearchParams.mockReturnValue({
      topicId: 'topic-1',
      profileId: 'child-1',
      title: 'Fractions',
      completionStatus: 'in_progress',
      masteryScore: 'abc',
      retentionStatus: 'strong',
      totalSessions: '3',
      subjectId: 'subject-1',
      subjectName: 'Mathematics',
    });

    expect(() => render(<TopicDetailScreen />)).not.toThrow();
    // Understanding card must be hidden when masteryScore is non-numeric.
    expect(screen.queryByTestId('topic-understanding-card')).toBeNull();
    // "NaN%" must not appear anywhere in the rendered output.
    expect(screen.queryByText(/NaN/)).toBeNull();
  });

  it('[BUG-801] hides understanding card and renders no NaN% when masteryScore param is absent', () => {
    mockUseLocalSearchParams.mockReturnValue({
      topicId: 'topic-1',
      profileId: 'child-1',
      title: 'Fractions',
      completionStatus: 'in_progress',
      // masteryScore intentionally omitted
      retentionStatus: 'strong',
      totalSessions: '3',
      subjectId: 'subject-1',
      subjectName: 'Mathematics',
    });

    expect(() => render(<TopicDetailScreen />)).not.toThrow();
    expect(screen.queryByTestId('topic-understanding-card')).toBeNull();
    expect(screen.queryByText(/NaN/)).toBeNull();
  });
});
