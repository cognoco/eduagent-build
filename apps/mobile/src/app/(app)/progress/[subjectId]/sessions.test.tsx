import {
  render,
  screen,
  fireEvent,
  waitFor,
} from '@testing-library/react-native';

import {
  createScreenWrapper,
  createRoutedMockFetch,
  cleanupScreen,
} from '../../../../../test-utils/screen-render-harness';

import SubjectSessionsScreen from './sessions';

jest.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: jest.fn() },
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      const map: Record<string, string> = {
        'progress.subjectSessions.title': 'Past conversations',
        'progress.subjectSessions.empty': 'No conversations yet',
        'progress.subjectSessions.untitledTopic': 'Untitled topic',
        'progress.subjectSessions.openSessionFrom':
          'Open session from {{date}}',
        'common.tryAgain': 'Try Again',
        'common.goBack': 'Go back',
      };
      const template = map[key];
      if (!template) return key;
      if (!opts) return template;
      return Object.entries(opts).reduce(
        (acc, [k, v]) => acc.replace(`{{${k}}}`, String(v)),
        template,
      );
    },
  }),
}));

const mockRouterFns = {
  push: jest.fn(),
  replace: jest.fn(),
  back: jest.fn(),
  navigate: jest.fn(),
  dismiss: jest.fn(),
  canGoBack: jest.fn(() => false),
  setParams: jest.fn(),
};
const mockRouterParams: Record<string, string> = {};
jest.mock('expo-router', () => { // gc1-allow: native-boundary — expo-router requires native bindings unavailable in Jest
  const RN = require('react-native');
  return {
    useRouter: () => mockRouterFns,
    useLocalSearchParams: () => mockRouterParams,
    useGlobalSearchParams: () => mockRouterParams,
    useSegments: () => [],
    usePathname: () => '/',
    Link: RN.Text,
    useFocusEffect: jest.fn(),
  };
});

jest.mock('react-native-safe-area-context', () => // gc1-allow: native-boundary — react-native-safe-area-context requires native bindings unavailable in Jest
  require('../../../../test-utils/native-shims').safeAreaShim(),
);

jest.mock('../../../../components/common', () => { // gc1-allow: boundary shim — ErrorFallback renders native components; shim needed to access testID actions
    const RN = jest.requireActual('react-native');
    const ErrorFallback = ({
      message,
      primaryAction,
      secondaryAction,
      testID,
    }: {
      message?: string;
      primaryAction?: { label: string; onPress: () => void; testID?: string };
      secondaryAction?: { label: string; onPress: () => void; testID?: string };
      testID?: string;
    }) => (
      <RN.View testID={testID}>
        <RN.Text>{message}</RN.Text>
        {primaryAction ? (
          <RN.Pressable
            onPress={primaryAction.onPress}
            testID={primaryAction.testID}
          >
            <RN.Text>{primaryAction.label}</RN.Text>
          </RN.Pressable>
        ) : null}
        {secondaryAction ? (
          <RN.Pressable
            onPress={secondaryAction.onPress}
            testID={secondaryAction.testID}
          >
            <RN.Text>{secondaryAction.label}</RN.Text>
          </RN.Pressable>
        ) : null}
      </RN.View>
    );
    return { ErrorFallback };
  });

const mockFetch = createRoutedMockFetch({
  '/progress/inventory': {
    subjects: [{ subjectId: 'sub-1', subjectName: 'Math' }],
  },
  '/subjects/sub-1/sessions': {
    sessions: [],
  },
});

jest.mock('../../../../lib/api-client', () => require('../../../../test-utils/mock-api-routes').mockApiClientFactory(mockFetch)); // gc1-allow: transport-boundary — api-client is the fetch boundary; routedMockFetch replaces per-hook mocks

const SAMPLE_SESSIONS = [
  {
    id: 'sess-1',
    topicId: 'topic-1',
    topicTitle: 'Fractions',
    bookId: 'book-1',
    bookTitle: 'Numbers',
    chapter: 'Chapter 1',
    sessionType: 'learning',
    durationSeconds: 600,
    createdAt: '2026-05-01T10:00:00.000Z',
  },
  {
    id: 'sess-2',
    topicId: null,
    topicTitle: null,
    bookId: null,
    bookTitle: null,
    chapter: null,
    sessionType: 'learning',
    durationSeconds: null,
    createdAt: '2026-04-30T08:00:00.000Z',
  },
];

describe('SubjectSessionsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.keys(mockRouterParams).forEach((k) => delete (mockRouterParams as Record<string, unknown>)[k]);
    mockRouterParams.subjectId = 'sub-1';
    mockRouterFns.push.mockClear();
    mockRouterFns.replace.mockClear();
    mockRouterFns.back.mockClear();
    mockRouterFns.navigate.mockClear();
    mockRouterFns.dismiss.mockClear();
    mockRouterFns.canGoBack.mockReset().mockImplementation(() => false);
    mockRouterFns.setParams.mockClear();
    mockFetch.setRoute('/progress/inventory', {
      subjects: [{ subjectId: 'sub-1', subjectName: 'Math' }],
    });
    mockFetch.setRoute('/subjects/sub-1/sessions', { sessions: [] });
  });

  it('renders the loading skeleton while sessions load', async () => {
    // Simulate a pending fetch by returning a never-resolving promise
    mockFetch.setRoute('/subjects/sub-1/sessions', () => new Promise(() => {}));

    const { wrapper, queryClient } = createScreenWrapper();
    render(<SubjectSessionsScreen />, { wrapper });

    screen.getByTestId('subject-sessions-loading');
    await cleanupScreen(queryClient);
  });

  it('renders empty state when there are no sessions', async () => {
    mockFetch.setRoute('/subjects/sub-1/sessions', { sessions: [] });

    const { wrapper, queryClient } = createScreenWrapper();
    render(<SubjectSessionsScreen />, { wrapper });

    await waitFor(() => screen.getByTestId('subject-sessions-empty'));
    screen.getByText('No conversations yet');
    cleanupScreen(queryClient);
  });

  it('renders error state with retry that calls refetch', async () => {
    mockFetch.setRoute(
      '/subjects/sub-1/sessions',
      new Response(JSON.stringify({ error: 'boom' }), { status: 500 }),
    );

    const { wrapper, queryClient } = createScreenWrapper();
    render(<SubjectSessionsScreen />, { wrapper });

    await waitFor(() =>
      screen.getByTestId('subject-sessions-error-retry'),
    );
    cleanupScreen(queryClient);
  });

  it('renders one row per session and links to session-summary', async () => {
    mockFetch.setRoute('/subjects/sub-1/sessions', {
      sessions: SAMPLE_SESSIONS,
    });

    const { wrapper, queryClient } = createScreenWrapper();
    render(<SubjectSessionsScreen />, { wrapper });

    await waitFor(() => screen.getByTestId('subject-session-sess-1'));
    screen.getByTestId('subject-session-sess-2');
    screen.getByText('Fractions');
    // Null topicTitle falls back to "Untitled topic"
    screen.getByText('Untitled topic');

    fireEvent.press(screen.getByTestId('subject-session-sess-1'));
    expect(mockRouterFns.push).toHaveBeenCalledWith({
      pathname: '/session-summary/[sessionId]',
      params: {
        sessionId: 'sess-1',
        subjectId: 'sub-1',
        topicId: 'topic-1',
      },
    });

    cleanupScreen(queryClient);
  });

  it('shows the subject name as subtitle', async () => {
    const { wrapper, queryClient } = createScreenWrapper();
    render(<SubjectSessionsScreen />, { wrapper });

    await waitFor(() => screen.getByText('Math'));
    screen.getByText('Past conversations');
    cleanupScreen(queryClient);
  });
});
