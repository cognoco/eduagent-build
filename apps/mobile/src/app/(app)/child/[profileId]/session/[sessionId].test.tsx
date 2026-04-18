import { render, screen } from '@testing-library/react-native';

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), canGoBack: jest.fn(() => true) }),
  useLocalSearchParams: () => ({
    profileId: 'child-profile-001',
    sessionId: 'session-001',
  }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('@expo/vector-icons', () => {
  const { View } = require('react-native');
  return {
    Ionicons: (props: Record<string, unknown>) => (
      <View testID={`icon-${props.name}`} />
    ),
  };
});

const mockUseChildSessionDetail = jest.fn();

jest.mock('../../../../../hooks/use-dashboard', () => ({
  useChildSessionDetail: (...args: unknown[]) =>
    mockUseChildSessionDetail(...args),
}));

const SessionDetailScreen = require('./[sessionId]').default;

function makeSession(overrides: Record<string, unknown> = {}) {
  return {
    sessionId: 'session-001',
    subjectId: 'subject-1',
    topicId: 'topic-1',
    sessionType: 'learning',
    startedAt: '2026-03-20T10:00:00Z',
    endedAt: '2026-03-20T10:08:00Z',
    exchangeCount: 5,
    escalationRung: 1,
    durationSeconds: 480,
    wallClockSeconds: 500,
    displayTitle: 'Learning',
    displaySummary: null,
    homeworkSummary: null,
    ...overrides,
  };
}

describe('SessionDetailScreen (summary-only)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('shows session metadata when displaySummary is present', () => {
    mockUseChildSessionDetail.mockReturnValue({
      data: makeSession({ displaySummary: 'Practiced light reactions' }),
      isLoading: false,
    });

    render(<SessionDetailScreen />);

    expect(screen.getByText('Practiced light reactions')).toBeTruthy();
    expect(screen.getByTestId('session-metadata')).toBeTruthy();
  });

  it('shows fallback text when displaySummary is null', () => {
    mockUseChildSessionDetail.mockReturnValue({
      data: makeSession({ displaySummary: null }),
      isLoading: false,
    });

    render(<SessionDetailScreen />);

    expect(
      screen.getByText('Session summary not available for older sessions')
    ).toBeTruthy();
  });

  it('shows homework summary when present', () => {
    mockUseChildSessionDetail.mockReturnValue({
      data: makeSession({
        displayTitle: 'Math Homework',
        homeworkSummary: {
          displayTitle: 'Math Homework',
          summary: 'Walked through fraction simplification step by step',
        },
        displaySummary: 'Helped with fractions',
      }),
      isLoading: false,
    });

    render(<SessionDetailScreen />);

    expect(screen.getByText('Helped with fractions')).toBeTruthy();
    expect(
      screen.getByText('Walked through fraction simplification step by step')
    ).toBeTruthy();
  });

  it('shows session-not-found when session is missing', () => {
    mockUseChildSessionDetail.mockReturnValue({
      data: null,
      isLoading: false,
    });

    render(<SessionDetailScreen />);

    expect(screen.getByTestId('session-not-found')).toBeTruthy();
  });

  it('does NOT render transcript exchanges', () => {
    mockUseChildSessionDetail.mockReturnValue({
      data: makeSession(),
      isLoading: false,
    });

    render(<SessionDetailScreen />);

    expect(screen.queryByTestId('transcript-exchange')).toBeNull();
  });
});
