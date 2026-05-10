import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import * as Clipboard from 'expo-clipboard';

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

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({
    back: jest.fn(),
    canGoBack: jest.fn(() => true),
    push: mockPush,
  }),
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

jest.mock('expo-clipboard', () => ({
  setStringAsync: jest.fn().mockResolvedValue(undefined),
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
    highlight: null,
    narrative: null,
    conversationPrompt: null,
    engagementSignal: null,
    ...overrides,
  };
}

describe('SessionDetailScreen (summary-only)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('shows session metadata when displaySummary is present', () => {
    mockUseChildSessionDetail.mockReturnValue({
      data: makeSession({
        displaySummary: 'Practiced light reactions',
        narrative: 'They linked sunlight to the way plants make food.',
      }),
      isLoading: false,
    });

    render(<SessionDetailScreen />);

    screen.getByText('Practiced light reactions');
    screen.getByTestId('session-metadata');
  });

  it('shows recap content when the new narrative fields are present', () => {
    mockUseChildSessionDetail.mockReturnValue({
      data: makeSession({
        narrative:
          'They compared equivalent fractions and fixed one shaky step.',
        highlight: 'Practiced equivalent fractions',
        conversationPrompt: 'Which fraction felt easiest to compare today?',
        engagementSignal: 'focused',
      }),
      isLoading: false,
    });

    render(<SessionDetailScreen />);

    expect(
      screen.getByText(
        'They compared equivalent fractions and fixed one shaky step.',
      ),
    ).toBeTruthy();
    screen.getByText('Practiced equivalent fractions');
    screen.getByText('Focused');
    expect(
      screen.getByText('Which fraction felt easiest to compare today?'),
    ).toBeTruthy();
  });

  it('shows recap unavailable fallback when session has no recap fields', () => {
    mockUseChildSessionDetail.mockReturnValue({
      data: makeSession({ displaySummary: null }),
      isLoading: false,
    });

    render(<SessionDetailScreen />);

    screen.getByTestId('narrative-unavailable');
    // BUG-901: friendlier "missing summary" microcopy + the empty-state
    // testID stays stable so other surfaces can detect the case.
    screen.getByTestId('session-summary-empty-note');
    // The bare "No summary available for this session." string is replaced
    // by an explanation + pointer to the always-on CTAs at the bottom.
    expect(
      screen.queryByText('No summary available for this session.'),
    ).toBeNull();
  });

  // BUG-901 break test: every session detail must render at least one CTA.
  it('[BUG-901] always renders at least one CTA at the bottom', () => {
    mockUseChildSessionDetail.mockReturnValue({
      data: makeSession({ displaySummary: null }),
      isLoading: false,
    });

    render(<SessionDetailScreen />);

    screen.getByTestId('session-detail-ctas');
    screen.getByTestId('session-detail-back-to-child');
  });

  // BUG-901 break test: when topic context is available, "Open this topic"
  // must be wired up so a parent can re-engage the same content.
  it('[BUG-901] renders an Open Topic CTA that deep-links to the topic', () => {
    mockUseChildSessionDetail.mockReturnValue({
      data: makeSession({
        topicId: 'topic-1',
        topicTitle: 'Light reactions',
        displaySummary: null,
      }),
      isLoading: false,
    });

    render(<SessionDetailScreen />);

    const cta = screen.getByTestId('session-detail-continue-topic');
    expect(cta).toBeTruthy();

    fireEvent.press(cta);
    expect(mockPush).toHaveBeenCalledWith(
      '/(app)/child/child-profile-001/topic/topic-1',
    );
  });

  // BUG-902 break test: parent-facing duration must be active time, not
  // wall-clock. Otherwise a 39-min "browsed a topic" entry inflates
  // engagement.
  it('[BUG-902] renders ACTIVE-time duration in preference to wall-clock', () => {
    mockUseChildSessionDetail.mockReturnValue({
      // 5-min active session that the user "left open" for 30 minutes
      data: makeSession({
        durationSeconds: 5 * 60,
        wallClockSeconds: 30 * 60,
        displaySummary: null,
      }),
      isLoading: false,
    });

    render(<SessionDetailScreen />);

    // 5 min — not 30 min — must be shown.
    screen.getByText('5 min');
    expect(screen.queryByText('30 min')).toBeNull();
  });

  // BUG-902 break test: when active time is missing, fall back to wall-clock
  // so legacy rows still render a duration instead of "—".
  it('[BUG-902] falls back to wall-clock duration when active time is null', () => {
    mockUseChildSessionDetail.mockReturnValue({
      data: makeSession({
        durationSeconds: null,
        wallClockSeconds: 12 * 60,
        displaySummary: null,
      }),
      isLoading: false,
    });

    render(<SessionDetailScreen />);

    screen.getByText('12 min');
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

    screen.getByText('Helped with fractions');
    expect(
      screen.getByText('Walked through fraction simplification step by step'),
    ).toBeTruthy();
  });

  it('shows session-not-found when session is missing', () => {
    mockUseChildSessionDetail.mockReturnValue({
      data: null,
      isLoading: false,
    });

    render(<SessionDetailScreen />);

    screen.getByTestId('session-not-found');
  });

  it('does NOT render transcript exchanges', () => {
    mockUseChildSessionDetail.mockReturnValue({
      data: makeSession(),
      isLoading: false,
    });

    render(<SessionDetailScreen />);

    expect(screen.queryByTestId('transcript-exchange')).toBeNull();
  });

  it('shows copy feedback when the conversation prompt is copied', async () => {
    mockUseChildSessionDetail.mockReturnValue({
      data: makeSession({
        narrative: 'They worked through a short recap.',
        conversationPrompt: 'Can you teach this back to me?',
      }),
      isLoading: false,
    });

    render(<SessionDetailScreen />);

    fireEvent.press(screen.getByTestId('session-recap-copy-prompt'));

    await waitFor(() => screen.getByTestId('session-recap-copy-prompt-toast'));
    expect(Clipboard.setStringAsync).toHaveBeenCalledWith(
      'Can you teach this back to me?',
    );
  });
});
