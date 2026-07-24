import { fireEvent, render } from '@testing-library/react-native';
import { JournalMomentsStrip } from './JournalMomentsStrip';
import { ScopeContextProvider } from '../../lib/scope-context';

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
  beforeEach(() => {
    mockPush.mockReset();
  });

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

    const rendered = render(
      <ScopeContextProvider initialScopeList={{ shape: 'learner' }}>
        <JournalMomentsStrip />
      </ScopeContextProvider>,
    );

    expect(
      rendered.getByText('Locked in changing signs in Algebra.'),
    ).toBeTruthy();
  });

  it('[WI-2110 AC-1] opens a quiz personal best in Journal Practice', () => {
    mockUseNowFeed.mockReturnValue({
      data: {
        scope: 'self',
        overflowCount: 0,
        generatedAt: '2026-07-20T17:00:00.000Z',
        cards: [
          {
            kind: 'ledger_moment',
            templateKey: 'now.ledger_moment.quiz_personal_best',
            params: { ledgerKind: 'quiz_personal_best', score: 9 },
            deepLink: { route: 'journal', params: {}, chain: [] },
            scope: 'self',
          },
        ],
      },
      error: null,
      isError: false,
      isLoading: false,
      refetch: jest.fn(),
    });

    const rendered = render(
      <ScopeContextProvider initialScopeList={{ shape: 'learner' }}>
        <JournalMomentsStrip />
      </ScopeContextProvider>,
    );

    fireEvent.press(rendered.getByTestId('journal-moment-quiz_personal_best'));

    expect(mockPush).toHaveBeenCalledWith('/(app)/journal?section=practice');
  });
});
