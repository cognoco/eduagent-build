import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import {
  createRoutedMockFetch,
  renderScreen,
  NAMED_PROFILES,
  type RoutedMockFetch,
} from '../../test-utils/screen-render';

// i18n boundary — key->English map so the rendered alert copy can be asserted
// directly. The real i18next init is not what's under test; `initReactI18next`
// is supplied so transitive imports of i18n/index.ts don't blow up.
jest.mock('react-i18next' /* gc1-allow: i18n boundary */, () => ({
  initReactI18next: { type: '3rdParty', init: () => undefined },
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

jest.mock('expo-router' /* gc1-allow: native-boundary */, () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

// Route the Hono RPC client through our mock fetch so the real use-filing
// hooks (session query + keep-out mutation) run against canned responses.
const mockFetch: RoutedMockFetch = createRoutedMockFetch();

jest.mock(
  '../../lib/api-client' /* gc1-allow: transport-boundary — routed mock fetch drives real hooks */,
  () => {
    const actual = jest.requireActual('../../lib/api-client');
    const { hc } = require('hono/client');
    return {
      ...actual,
      useApiClient: () => hc('http://localhost', { fetch: mockFetch }),
    };
  },
);

const {
  SessionSummaryLibraryFilingControls,
} = require('./SessionSummaryLibraryFilingControls');

function setRoutes(): void {
  // The keep-out POST must be registered BEFORE the session GET: the routed
  // mock matches by url.includes(), and the keep-out URL
  // (/sessions/session-1/library-filing/keep-out) also contains
  // `/sessions/session-1`. A 500 makes assertOk throw so the component's catch
  // path renders the error alert.
  mockFetch.setRoute(
    '/sessions/session-1/library-filing/keep-out',
    () =>
      new Response(JSON.stringify({ message: 'boom' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }),
  );
  // Session detail GET: a freeform session over the auto-file threshold,
  // still pending filing (no topicId/filedAt) so the keep-out CTA renders.
  mockFetch.setRoute('/sessions/session-1', () => ({
    session: {
      sessionId: 'session-1',
      subjectId: 'subject-1',
      topicId: null,
      filedAt: null,
      filingStatus: 'filing_pending',
      exchangeCount: 5,
    },
  }));
}

describe('SessionSummaryLibraryFilingControls', () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  it('announces mutation failures through a polite alert live region', async () => {
    setRoutes();

    const { cleanup } = renderScreen(
      <SessionSummaryLibraryFilingControls sessionId="session-1" />,
      {
        profile: NAMED_PROFILES.soloLearner,
        installGlobalFetch: false,
        routedFetch: mockFetch,
      },
    );

    fireEvent.press(
      await screen.findByTestId('session-summary-library-keep-out'),
    );

    const message = await screen.findByText('Could not update library filing.');
    expect(message.props.accessibilityRole).toBe('alert');
    expect(message.props.accessibilityLiveRegion).toBe('polite');

    cleanup();
  });

  // W2 #11: homework auto-files at exit and is routinely 2–6 exchanges, below
  // the freeform exchangeCount>=5 auto-file floor. `alwaysFilingCandidate`
  // bypasses that floor so short homework still renders the controls (and its
  // restore/keep-out branches), rather than early-returning null.
  it('without alwaysFilingCandidate, a kept-out short session renders nothing', async () => {
    mockFetch.setRoute('/sessions/session-short', () => ({
      session: {
        sessionId: 'session-short',
        subjectId: 'subject-1',
        topicId: null,
        filedAt: null,
        filingStatus: 'filing_kept_out',
        exchangeCount: 2,
      },
    }));

    const { cleanup } = renderScreen(
      <SessionSummaryLibraryFilingControls sessionId="session-short" />,
      {
        profile: NAMED_PROFILES.soloLearner,
        installGlobalFetch: false,
        routedFetch: mockFetch,
      },
    );

    // Wait for the session GET to resolve, then assert the control stayed
    // unmounted (freeform threshold short-circuit).
    await waitFor(() =>
      expect(
        mockFetch.mock.calls.some((c) =>
          String(c[0]).includes('/sessions/session-short'),
        ),
      ).toBe(true),
    );
    expect(screen.queryByTestId('session-summary-library-filing')).toBeNull();

    cleanup();
  });

  it('with alwaysFilingCandidate, a kept-out short session renders the Add (restore) CTA', async () => {
    mockFetch.setRoute('/sessions/session-short', () => ({
      session: {
        sessionId: 'session-short',
        subjectId: 'subject-1',
        topicId: null,
        filedAt: null,
        filingStatus: 'filing_kept_out',
        exchangeCount: 2,
      },
    }));

    const { cleanup } = renderScreen(
      <SessionSummaryLibraryFilingControls
        sessionId="session-short"
        alwaysFilingCandidate
      />,
      {
        profile: NAMED_PROFILES.soloLearner,
        installGlobalFetch: false,
        routedFetch: mockFetch,
      },
    );

    expect(
      await screen.findByTestId('session-summary-library-add'),
    ).toBeTruthy();

    cleanup();
  });

  it('renders the Remove (keep-out) CTA for a filed short session', async () => {
    mockFetch.setRoute('/sessions/session-filed', () => ({
      session: {
        sessionId: 'session-filed',
        subjectId: 'subject-1',
        topicId: 'topic-1',
        filedAt: '2026-06-27T00:00:00.000Z',
        filingStatus: null,
        exchangeCount: 2,
        topicTitle: 'Fractions',
      },
    }));

    const { cleanup } = renderScreen(
      <SessionSummaryLibraryFilingControls
        sessionId="session-filed"
        alwaysFilingCandidate
      />,
      {
        profile: NAMED_PROFILES.soloLearner,
        installGlobalFetch: false,
        routedFetch: mockFetch,
      },
    );

    expect(
      await screen.findByTestId('session-summary-library-remove'),
    ).toBeTruthy();

    cleanup();
  });
});
