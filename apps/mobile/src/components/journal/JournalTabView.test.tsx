import { fireEvent, render, screen } from '@testing-library/react-native';
import type { NowResponse } from '@eduagent/schemas';

import { JournalTabView } from './JournalTabView';

const mockPush = jest.fn();
let mockNowFeed: {
  data: NowResponse | undefined;
  isLoading: boolean;
  isError: boolean;
  refetch: jest.Mock;
};

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock(
  '../../hooks/use-now-feed' /* gc1-allow: Journal moments consume the already-tested feed hook; component test pins feed states */,
  () => ({
    useNowFeed: () => mockNowFeed,
  }),
);

describe('JournalTabView', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockNowFeed = {
      data: {
        scope: 'self',
        generatedAt: '2026-06-14T00:00:00.000Z',
        overflowCount: 0,
        cards: [
          {
            kind: 'ledger_moment',
            templateKey: 'now.ledger_moment.session_filed',
            params: { ledgerKind: 'session_filed', topicTitle: 'Fractions' },
            deepLink: {
              route: 'session.resume',
              params: { sessionId: 'session-1' },
              chain: [],
            },
            scope: 'self',
          },
        ],
      },
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    };
  });

  it('renders the paper-trail sections and deterministic ledger moments', () => {
    render(<JournalTabView />);

    screen.getByTestId('journal-screen');
    screen.getByTestId('journal-moments-strip');
    screen.getByText('Saved Fractions to your learning record.');
    screen.getByTestId('journal-section-recaps');
    screen.getByTestId('journal-section-reports');
    screen.getByTestId('journal-section-notes');
    screen.getByTestId('journal-section-memory');
  });

  it('routes section cards to existing real surfaces', () => {
    render(<JournalTabView />);

    fireEvent.press(screen.getByTestId('journal-section-notes'));
    expect(mockPush).toHaveBeenCalledWith('/(app)/my-notes');

    fireEvent.press(screen.getByTestId('journal-section-memory'));
    expect(mockPush).toHaveBeenCalledWith('/(app)/mentor-memory');
  });

  it('keeps feed failures retryable without blanking the paper trail', () => {
    mockNowFeed = {
      data: undefined,
      isLoading: false,
      isError: true,
      refetch: jest.fn(),
    };

    render(<JournalTabView />);

    fireEvent.press(screen.getByTestId('journal-moments-retry'));
    expect(mockNowFeed.refetch).toHaveBeenCalledTimes(1);
    screen.getByTestId('journal-section-recaps');
  });
});
