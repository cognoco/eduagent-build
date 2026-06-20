import { fireEvent, screen } from '@testing-library/react-native';

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
});
