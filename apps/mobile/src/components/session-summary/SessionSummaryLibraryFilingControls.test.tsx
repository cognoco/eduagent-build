import { fireEvent, render, screen } from '@testing-library/react-native';

import { SessionSummaryLibraryFilingControls } from './SessionSummaryLibraryFilingControls';

const mockKeepOut = jest.fn();
const mockAdd = jest.fn();
const mockRestore = jest.fn();
const mockRetry = jest.fn();
const mockRefetch = jest.fn();

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const map: Record<string, string> = {
        'common.loading': 'Loading...',
        'sessionSummary.libraryFiling.addingTitle': 'Adding to your library',
        'sessionSummary.libraryFiling.addingHint': 'This may take a moment.',
        'sessionSummary.libraryFiling.dontAdd': "Don't add",
        'sessionSummary.libraryFiling.updateError':
          'Could not update library filing.',
      };
      return map[key] ?? key;
    },
  }),
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock(
  '../../hooks/use-filing' /* gc1-allow: component test isolates filing-control state branches from API hooks */,
  () => ({
    useSessionLibraryFiling: () => ({
      session: {
        id: 'session-1',
        subjectId: 'subject-1',
        topicId: 'topic-1',
        exchangeCount: 5,
      },
      filingStatus: 'filing_pending',
      isFiledInLibrary: false,
      isKeptOut: false,
      isTerminalFailure: false,
      timedOutStillPending: false,
      refetch: mockRefetch,
    }),
    useKeepSessionOutOfLibrary: () => ({
      mutateAsync: mockKeepOut,
      isPending: false,
    }),
    useAddSessionToLibrary: () => ({
      mutateAsync: mockAdd,
      isPending: false,
    }),
    useRestoreSessionLibraryFiling: () => ({
      mutateAsync: mockRestore,
      isPending: false,
    }),
    useRetrySessionLibraryFiling: () => ({
      mutateAsync: mockRetry,
      isPending: false,
    }),
  }),
);

describe('SessionSummaryLibraryFilingControls', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockKeepOut.mockRejectedValue(new Error('boom'));
  });

  it('announces mutation failures through a polite alert live region', async () => {
    render(<SessionSummaryLibraryFilingControls sessionId="session-1" />);

    fireEvent.press(screen.getByTestId('session-summary-library-keep-out'));

    const message = await screen.findByText('Could not update library filing.');
    expect(message.props.accessibilityRole).toBe('alert');
    expect(message.props.accessibilityLiveRegion).toBe('polite');
  });
});
