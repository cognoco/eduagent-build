import { fireEvent, render, screen } from '@testing-library/react-native';
import type { NowCard, NowResponse } from '@eduagent/schemas';

const mockPush = jest.fn();
const mockNowRefetch = jest.fn();
let mockNowFeed: {
  data: NowResponse | undefined;
  fallbackFeed: NowResponse | null;
  isLoading: boolean;
  isError: boolean;
  isFetching: boolean;
  isSlowFallback: boolean;
  refetch: jest.Mock;
};
let mockSubjectsCount = 1;

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock(
  '../../hooks/use-now-feed' /* gc1-allow: route orchestration test pins external feed states; hook fetch/schema behavior is covered separately */,
  () => ({
    useNowFeed: () => mockNowFeed,
    useNowOverflow: () => ({ data: undefined, isLoading: false }),
  }),
);

jest.mock(
  '../../hooks/use-subjects-index' /* gc1-allow: route orchestration only needs active-subject count for cold-start gating */,
  () => ({
    useSubjectsIndex: () => ({
      subjects: Array.from({ length: mockSubjectsCount }, (_, index) => ({
        subjectId: `subject-${index}`,
      })),
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    }),
  }),
);

const MentorScreen = require('./mentor').default;

function card(overrides: Partial<NowCard> = {}): NowCard {
  return {
    kind: 'unfinished_session',
    templateKey: 'now.unfinished_session.default',
    params: { topicTitle: 'Fractions' },
    deepLink: {
      route: 'session.resume',
      params: { sessionId: 'session-1' },
      chain: [],
    },
    scope: 'self',
    ...overrides,
  };
}

function feed(cards: NowCard[], overflowCount = 0): NowResponse {
  return {
    scope: 'self',
    cards,
    overflowCount,
    generatedAt: '2026-06-14T00:00:00.000Z',
  };
}

describe('MentorScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSubjectsCount = 1;
    mockNowFeed = {
      data: feed([card()]),
      fallbackFeed: null,
      isLoading: false,
      isError: false,
      isFetching: false,
      isSlowFallback: false,
      refetch: mockNowRefetch,
    };
  });

  it('renders the feed stack, on-track badge, and pinned input affordances', () => {
    render(<MentorScreen />);

    screen.getByTestId('mentor-screen');
    screen.getByTestId('now-card-stack');
    screen.getByTestId('mentor-on-track-badge');
    screen.getByTestId('mentor-input-bar');
    screen.getByTestId('mentor-bar-camera');
    screen.getByTestId('mentor-bar-homework-chip');
    screen.getByTestId('mentor-bar-mic');
  });

  it('renders ColdStartCard in the anchor slot for a profile with no first real state', () => {
    mockSubjectsCount = 0;
    mockNowFeed = {
      ...mockNowFeed,
      data: feed([]),
    };

    render(<MentorScreen />);

    screen.getByTestId('mentor-cold-start-card');
    expect(screen.queryByTestId('now-card-stack')).toBeNull();
  });

  it('pushes deterministic route phrases through the closed now deep-link mapper', () => {
    render(<MentorScreen />);

    fireEvent.changeText(
      screen.getByTestId('mentor-bar-input'),
      'open subject spanish',
    );
    fireEvent(screen.getByTestId('mentor-bar-input'), 'submitEditing');

    expect(mockPush).toHaveBeenCalledWith('/(app)/subject-hub/spanish');
  });

  it('carries a mentor-intent question into the session as rawInput (does not drop the typed text) [T25]', () => {
    render(<MentorScreen />);

    fireEvent.changeText(
      screen.getByTestId('mentor-bar-input'),
      'what is photosynthesis?',
    );
    fireEvent(screen.getByTestId('mentor-bar-input'), 'submitEditing');

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/session',
      params: {
        entrySource: 'mentor',
        returnTo: 'mentor',
        mode: 'freeform',
        rawInput: 'what is photosynthesis?',
      },
    });
  });

  it('uses cached feed on feed failure and keeps the screen usable', () => {
    mockNowFeed = {
      ...mockNowFeed,
      data: undefined,
      fallbackFeed: feed([card({ kind: 'retention_due' })]),
      isError: true,
      isSlowFallback: true,
    };

    render(<MentorScreen />);

    screen.getByTestId('mentor-feed-fallback');
    screen.getByTestId('now-card-stack');
  });

  it('renders retryable error state when there is no feed or cache', () => {
    mockNowFeed = {
      ...mockNowFeed,
      data: undefined,
      fallbackFeed: null,
      isError: true,
    };

    render(<MentorScreen />);

    fireEvent.press(screen.getByTestId('mentor-feed-retry'));
    expect(mockNowRefetch).toHaveBeenCalledTimes(1);
  });

  it('keeps light practice discoverable on a thin feed', () => {
    render(<MentorScreen />);

    fireEvent.press(screen.getByTestId('light-practice-capitals'));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/quiz',
      params: { activityType: 'capitals', returnTo: 'mentor' },
    });
  });

  it('advances the anchor arc and shows the mentor celebration when a card is completed', () => {
    render(<MentorScreen />);

    screen.getByText('Ready to pick back up');
    fireEvent.press(screen.getByTestId('now-card-complete'));

    screen.getByText('Session wrapped');
    screen.getByText('You chose the next step.');
  });
});
