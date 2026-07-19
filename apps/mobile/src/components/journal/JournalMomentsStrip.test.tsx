import { render } from '@testing-library/react-native';
import { JournalMomentsStrip } from './JournalMomentsStrip';

const mockPush = jest.fn();
const mockUseNowFeed = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock(
  '../../hooks/use-now-feed' /* gc1-allow: component test controls the Now feed projection without mounting the API client */,
  () => ({
    useNowFeed: () => mockUseNowFeed(),
  }),
);

jest.mock(
  '../common/BookPageFlipAnimation' /* gc1-allow: native animation is outside this copy-and-navigation component test */,
  () => ({
    BookPageFlipAnimation: () => null,
  }),
);

describe('JournalMomentsStrip', () => {
  it('renders explicit locked-in mentor notice copy', () => {
    mockUseNowFeed.mockReturnValue({
      data: {
        scope: 'self',
        overflowCount: 0,
        generatedAt: '2026-07-19T12:00:00.000Z',
        cards: [
          {
            kind: 'ledger_moment',
            templateKey: 'now.ledger_moment.notice_locked_in',
            params: {
              ledgerKind: 'notice_locked_in',
              concept: 'changing signs',
              subjectName: 'Algebra',
            },
            deepLink: {
              route: 'subject.hub',
              params: { subjectId: 'subject-1' },
              chain: [],
            },
            scope: 'self',
          },
        ],
      },
      error: null,
      isError: false,
      isLoading: false,
      refetch: jest.fn(),
    });

    const rendered = render(<JournalMomentsStrip />);

    expect(
      rendered.getByText('Locked in changing signs in Algebra.'),
    ).toBeTruthy();
  });
});
