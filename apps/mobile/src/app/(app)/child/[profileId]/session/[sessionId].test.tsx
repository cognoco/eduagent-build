import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import * as Clipboard from 'expo-clipboard';

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

    expect(screen.getByText('Practiced light reactions')).toBeTruthy();
    expect(screen.getByTestId('session-metadata')).toBeTruthy();
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
        'They compared equivalent fractions and fixed one shaky step.'
      )
    ).toBeTruthy();
    expect(screen.getByText('Practiced equivalent fractions')).toBeTruthy();
    expect(screen.getByText('Focused')).toBeTruthy();
    expect(
      screen.getByText('Which fraction felt easiest to compare today?')
    ).toBeTruthy();
  });

  it('shows recap unavailable fallback when session has no recap fields', () => {
    mockUseChildSessionDetail.mockReturnValue({
      data: makeSession({ displaySummary: null }),
      isLoading: false,
    });

    render(<SessionDetailScreen />);

    expect(screen.getByTestId('narrative-unavailable')).toBeTruthy();
    expect(
      screen.getByText('No summary available for this session.')
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

  it('shows copy feedback when the conversation prompt is copied', async () => {
    mockUseChildSessionDetail.mockReturnValue({
      data: makeSession({
        narrative: 'They worked through a short recap.',
        conversationPrompt: 'Can you teach this back to me?',
      }),
      isLoading: false,
    });

    render(<SessionDetailScreen />);

    fireEvent.press(screen.getByTestId('copy-conversation-prompt'));

    await waitFor(() => expect(screen.getByText('Copied ✓')).toBeTruthy());
    expect(Clipboard.setStringAsync).toHaveBeenCalledWith(
      'Can you teach this back to me?'
    );
  });
});
