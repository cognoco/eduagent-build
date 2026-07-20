import {
  render,
  screen,
  act,
  fireEvent,
  waitFor,
  type RenderAPI,
} from '@testing-library/react-native';
import React from 'react';
import {
  createRoutedMockFetch,
  createScreenWrapper,
  createTestProfile,
  cleanupScreen,
} from '../../../test-utils/screen-render-harness';

const mockFetch = createRoutedMockFetch({
  '/celebrations/pending': { pendingCelebrations: [] },
  '/learner-profile': { profile: { accommodationMode: 'none' } },
  '/settings/celebration-level': { celebrationLevel: 'all' },
  '/subscription/status': {
    status: {
      tier: 'family',
      effectiveAccessTier: 'family',
      billingAccess: 'current',
      status: 'active',
      monthlyLimit: 700,
      usedThisMonth: 0,
    },
  },
});

jest.mock(
  '../../lib/api-client' /* gc1-allow: test boundary - avoids real Hono fetch client and network calls */,
  () =>
    require('../../test-utils/mock-api-routes').mockApiClientFactory(mockFetch),
);

let mockOnAllComplete: ((profileId: string | null) => void) | null = null;

jest.mock(
  '../../hooks/use-celebration' /* gc1-allow: avoids native celebration animation timers and async side effects in render tests */,
  () => ({
    useCelebration: ({
      onAllComplete,
    }: {
      onAllComplete: (profileId: string | null) => void;
    }) => {
      mockOnAllComplete = onAllComplete;
      return { CelebrationOverlay: null };
    },
  }),
);

const mockRouterPush = jest.fn();
const mockRouterReplace = jest.fn();
let mockNavigationEffectiveAppContext: 'study' | 'family' = 'study';
let mockNavigationHomeScreen: 'LearnerHome' | 'FamilyHome' = 'LearnerHome';
let mockNavigationSessionIsOwner = true;
let mockNavigationIsParentProxy = false;
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockRouterPush, replace: mockRouterReplace }),
}));

jest.mock(
  '../../hooks/use-navigation-contract' /* gc1-allow: home.test.tsx pins navigation-contract outputs without mounting the full shell adapter */,
  () => ({
    useNavigationContract: () => ({
      home: {
        screen: mockNavigationHomeScreen,
        titleKey:
          mockNavigationHomeScreen === 'FamilyHome'
            ? 'tabs.children'
            : 'tabs.myLearning',
        iconName:
          mockNavigationHomeScreen === 'FamilyHome' ? 'Users' : 'School',
      },
      effectiveAppContext: mockNavigationEffectiveAppContext,
      gates: { sessionIsOwner: mockNavigationSessionIsOwner },
      isParentProxy: mockNavigationIsParentProxy,
      queryScope: {
        appContext: mockNavigationEffectiveAppContext,
        profileId: 'test-profile-id',
      },
    }),
    useNavigationDataScopeContract: () => ({
      queryScope: {
        appContext: mockNavigationEffectiveAppContext,
        profileId: 'test-profile-id',
      },
    }),
  }),
);

jest.mock(
  '../../components/home' /* gc1-allow: avoids full native component tree render; home.test.tsx tests routing logic not component internals */,
  () => {
    const { Text, View } = require('react-native');
    return {
      LearnerScreen: () => (
        <View testID="learner-screen">
          <Text>LearnerScreen</Text>
        </View>
      ),
      ParentHomeScreen: () => (
        <View testID="parent-home-screen">
          <Text>ParentHomeScreen</Text>
        </View>
      ),
    };
  },
);

const HomeScreen = require('./home').default;

const originalFetch = globalThis.fetch;
const HOME_TEST_DEBUG = process.env.HOME_TEST_DEBUG === '1';

function debugHomeTest(event: string, details?: unknown): void {
  if (!HOME_TEST_DEBUG) return;
  console.info(`[home.test] ${event}`, details === undefined ? '' : details);
}

function debugOpenHandles(event: string): void {
  if (!HOME_TEST_DEBUG) return;
  const processWithHandles = process as typeof process & {
    _getActiveHandles?: () => unknown[];
    _getActiveRequests?: () => unknown[];
  };
  const describeHandle = (handle: unknown) => {
    const candidate = handle as {
      constructor?: { name?: string };
      hasRef?: () => boolean;
      _idleTimeout?: number;
      _destroyed?: boolean;
    };
    return {
      type: candidate.constructor?.name ?? typeof handle,
      hasRef:
        typeof candidate.hasRef === 'function' ? candidate.hasRef() : undefined,
      idleTimeout: candidate._idleTimeout,
      destroyed: candidate._destroyed,
    };
  };

  console.info(`[home.test] ${event}`, {
    handles: processWithHandles._getActiveHandles?.().map(describeHandle),
    requests: processWithHandles._getActiveRequests?.().map(describeHandle),
  });
}

afterAll(() => {
  debugOpenHandles('afterAll active handles');
});

beforeEach(() => {
  (globalThis as unknown as { fetch: typeof fetch }).fetch =
    mockFetch as unknown as typeof fetch;
});

afterEach(() => {
  (globalThis as unknown as { fetch: typeof fetch }).fetch = originalFetch;
});

describe('HomeScreen intent router', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockOnAllComplete = null;
    mockNavigationEffectiveAppContext = 'study';
    mockNavigationHomeScreen = 'LearnerHome';
    mockNavigationSessionIsOwner = true;
    mockNavigationIsParentProxy = false;
  });

  it('renders LearnerScreen for owner with no children [BUG-522]', () => {
    const owner = createTestProfile({
      id: 'p1',
      displayName: 'Alex',
      isOwner: true,
    });
    const { wrapper } = createScreenWrapper({
      activeProfile: owner,
      profiles: [owner],
    });

    render(<HomeScreen />, { wrapper });

    // BUG-522: owners without children always see LearnerScreen — no forced
    // add-child gate regardless of subscription tier
    screen.getByTestId('learner-screen');
  });

  it('renders LearnerScreen directly for owner with linked children', () => {
    const parent = createTestProfile({
      id: 'p1',
      displayName: 'Maria',
      isOwner: true,
    });
    const child = createTestProfile({
      id: 'c1',
      displayName: 'Emma',
      isOwner: false,
    });
    const { wrapper } = createScreenWrapper({
      activeProfile: parent,
      profiles: [parent, child],
    });

    render(<HomeScreen />, { wrapper });

    screen.getByTestId('learner-screen');
    expect(screen.queryByTestId('parent-home-screen')).toBeNull();
  });

  it('renders ParentHomeScreen when the navigation contract selects FamilyHome', () => {
    mockNavigationEffectiveAppContext = 'family';
    mockNavigationHomeScreen = 'FamilyHome';
    const parent = createTestProfile({
      id: 'p1',
      displayName: 'Maria',
      isOwner: true,
    });
    const child = createTestProfile({
      id: 'c1',
      displayName: 'Emma',
      isOwner: false,
    });
    const { wrapper } = createScreenWrapper({
      activeProfile: parent,
      profiles: [parent, child],
    });

    render(<HomeScreen />, { wrapper });

    screen.getByTestId('parent-home-screen');
    expect(screen.queryByTestId('learner-screen')).toBeNull();
  });

  it('renders LearnerScreen when active profile is a child (non-owner)', () => {
    const parent = createTestProfile({
      id: 'p1',
      displayName: 'Maria',
      isOwner: true,
    });
    const child = createTestProfile({
      id: 'c1',
      displayName: 'Emma',
      isOwner: false,
    });
    const { wrapper } = createScreenWrapper({
      activeProfile: child,
      profiles: [parent, child],
    });

    render(<HomeScreen />, { wrapper });

    screen.getByTestId('learner-screen');
  });

  it('renders loading placeholder when profiles are still loading', () => {
    const { wrapper } = createScreenWrapper({
      activeProfile: null,
      profiles: [],
      isLoading: true,
    });

    render(<HomeScreen />, { wrapper });

    expect(screen.queryByTestId('learner-screen')).toBeNull();
  });
});

describe('HomeScreen 3B.11: timeout error state secondary navigation', () => {
  let Wrapper: React.ComponentType<{ children: React.ReactNode }>;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    mockNavigationEffectiveAppContext = 'study';
    mockNavigationHomeScreen = 'LearnerHome';
    mockNavigationSessionIsOwner = true;
    mockNavigationIsParentProxy = false;
    ({ wrapper: Wrapper } = createScreenWrapper({
      activeProfile: null,
      profiles: [],
      isLoading: true,
    }));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('shows the timeout error UI after 10s of loading', () => {
    render(<HomeScreen />, { wrapper: Wrapper });

    act(() => {
      jest.advanceTimersByTime(10_000);
    });

    screen.getByTestId('home-loading-timeout');
    screen.getByTestId('home-loading-retry');
    screen.getByTestId('timeout-library-button');
    screen.getByTestId('timeout-more-button');
  });

  it('navigates to library when "Go to Library" is pressed [3B.11]', () => {
    render(<HomeScreen />, { wrapper: Wrapper });

    act(() => {
      jest.advanceTimersByTime(10_000);
    });

    fireEvent.press(screen.getByTestId('timeout-library-button'));

    expect(mockRouterReplace).toHaveBeenCalledWith('/(app)/library');
  });

  it('navigates to more when "More options" is pressed [3B.11]', () => {
    render(<HomeScreen />, { wrapper: Wrapper });

    act(() => {
      jest.advanceTimersByTime(10_000);
    });

    fireEvent.press(screen.getByTestId('timeout-more-button'));

    expect(mockRouterReplace).toHaveBeenCalledWith('/(app)/more');
  });

  it('resets the timeout flag when Retry is pressed', () => {
    render(<HomeScreen />, { wrapper: Wrapper });

    act(() => {
      jest.advanceTimersByTime(10_000);
    });

    screen.getByTestId('home-loading-timeout');

    fireEvent.press(screen.getByTestId('home-loading-retry'));

    expect(screen.queryByTestId('home-loading-timeout')).toBeNull();
  });
});

describe('HomeScreen B-600: family mode timeout state routes to Progress not Library', () => {
  let Wrapper: React.ComponentType<{ children: React.ReactNode }>;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    mockNavigationEffectiveAppContext = 'family';
    mockNavigationHomeScreen = 'LearnerHome';
    mockNavigationSessionIsOwner = true;
    ({ wrapper: Wrapper } = createScreenWrapper({
      activeProfile: null,
      profiles: [],
      isLoading: true,
    }));
  });

  afterEach(() => {
    jest.useRealTimers();
    mockNavigationEffectiveAppContext = 'study';
  });

  it('shows progress button instead of library button in family mode timeout [B-600]', () => {
    render(<HomeScreen />, { wrapper: Wrapper });

    act(() => {
      jest.advanceTimersByTime(10_000);
    });

    screen.getByTestId('home-loading-timeout');
    // [B-600] Family mode must show progress shortcut, not adult library
    screen.getByTestId('timeout-progress-button');
    expect(screen.queryByTestId('timeout-library-button')).toBeNull();
    // More options still present as secondary escape
    screen.getByTestId('timeout-more-button');
  });

  it('navigates to progress when progress button is pressed in family mode [B-600]', () => {
    render(<HomeScreen />, { wrapper: Wrapper });

    act(() => {
      jest.advanceTimersByTime(10_000);
    });

    fireEvent.press(screen.getByTestId('timeout-progress-button'));

    expect(mockRouterReplace).toHaveBeenCalledWith('/(app)/progress');
    // [B-600] Must never route family mode to adult library
    expect(mockRouterReplace).not.toHaveBeenCalledWith('/(app)/library');
  });

  it('non-family mode still shows library button, not progress button [B-600 guard]', () => {
    mockNavigationEffectiveAppContext = 'study';
    const { wrapper } = createScreenWrapper({
      activeProfile: null,
      profiles: [],
      isLoading: true,
    });

    render(<HomeScreen />, { wrapper });

    act(() => {
      jest.advanceTimersByTime(10_000);
    });

    screen.getByTestId('timeout-library-button');
    expect(screen.queryByTestId('timeout-progress-button')).toBeNull();
  });
});
describe('HomeScreen WI-270: proxy mode — markCelebrationsSeen is suppressed', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockOnAllComplete = null;
    mockNavigationHomeScreen = 'LearnerHome';
    mockNavigationIsParentProxy = true;
  });

  it('does NOT call markCelebrationsSeen.mutateAsync in proxy mode [WI-270]', async () => {
    const owner = createTestProfile({
      id: 'p1',
      displayName: 'Alex',
      isOwner: true,
    });
    const { wrapper } = createScreenWrapper({
      activeProfile: owner,
      profiles: [owner],
      isExplicitProxyMode: true,
    });

    render(<HomeScreen />, { wrapper });

    expect(mockOnAllComplete).not.toBeNull();
    await act(async () => {
      mockOnAllComplete?.('p1');
    });

    expect(mockFetch).not.toHaveBeenCalledWith(
      expect.stringContaining('/celebrations/seen'),
      expect.anything(),
    );
  });
});

describe('HomeScreen WI-270: proxy mode — notice ack write is suppressed', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    mockOnAllComplete = null;
    mockNavigationHomeScreen = 'LearnerHome';
    mockNavigationIsParentProxy = true;
    mockNavigationSessionIsOwner = true;
    // Wire a real dashboard response (empty children + a pending notice) so the
    // 5s ack timer path is reached. Shape must match DashboardData exactly —
    // the API returns the object unwrapped, and pendingNotices uses
    // { id, type, payload: { childName }, createdAt } (see schemas/progress.ts).
    // The handler is URL-aware: /dashboard/demo returns notice-free demo data,
    // so if the empty-children demo-fallback bug regressed the notice would be
    // dropped (single route matcher uses url.includes — /dashboard/demo also
    // matches '/dashboard', so demo MUST be handled here explicitly [WI-854]).
    mockFetch.setRoute('/dashboard', (url: string) =>
      url.includes('/dashboard/demo')
        ? { children: [], pendingNotices: [], demoMode: true }
        : {
            children: [],
            pendingNotices: [
              {
                id: 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e',
                type: 'consent_archived',
                payload: { childName: 'Emma' },
                createdAt: '2026-01-01T00:00:00.000Z',
              },
            ],
            demoMode: false,
          },
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('does NOT call notices seen endpoint after 5s in proxy mode [WI-270]', async () => {
    const owner = createTestProfile({
      id: 'p1',
      displayName: 'Alex',
      isOwner: true,
    });
    const { wrapper } = createScreenWrapper({
      activeProfile: owner,
      profiles: [owner],
      isExplicitProxyMode: true,
    });

    render(<HomeScreen />, { wrapper });

    await act(async () => {
      jest.advanceTimersByTime(5000);
    });

    // The ackNotice.mutate path must not have fired when isParentProxy=true.
    expect(mockFetch).not.toHaveBeenCalledWith(
      expect.stringContaining('/notices/'),
      expect.objectContaining({ method: 'POST' }),
    );
  });
});

describe('HomeScreen WI-854 [HOME-15]: empty-child dashboard with a pending consent notice', () => {
  const NOTICE_ID = '11111111-1111-4111-8111-111111111111';

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    mockOnAllComplete = null;
    mockNavigationHomeScreen = 'LearnerHome';
    mockNavigationIsParentProxy = false;
    mockNavigationSessionIsOwner = true;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it.each([['consent_archived' as const], ['consent_deleted' as const]])(
    'non-proxy owner sees the post-grace toast and acks via POST /notices/:id/seen after 5s — %s',
    async (noticeType) => {
      // Real dashboard: last child archived/deleted → empty children but a
      // pending consent notice. The hook must preserve it (no demo fallback) so
      // the owner toast renders. URL-aware: /dashboard/demo returns notice-free
      // demo data — if the empty-children demo-fallback bug regressed, the hook
      // would fetch demo and the notice (hence the toast and the ack POST) would
      // disappear, failing this test. The single route matcher uses
      // url.includes, so /dashboard/demo must be handled here explicitly.
      mockFetch.setRoute('/dashboard', (url: string) =>
        url.includes('/dashboard/demo')
          ? { children: [], pendingNotices: [], demoMode: true }
          : {
              children: [],
              pendingNotices: [
                {
                  id: NOTICE_ID,
                  type: noticeType,
                  payload: { childName: 'Emma' },
                  createdAt: '2026-01-01T00:00:00.000Z',
                },
              ],
              demoMode: false,
            },
      );

      const owner = createTestProfile({
        id: 'p1',
        displayName: 'Alex',
        isOwner: true,
      });
      const { wrapper } = createScreenWrapper({
        activeProfile: owner,
        profiles: [owner],
      });

      render(<HomeScreen />, { wrapper });

      // The owner sees the post-grace consent notice toast.
      await waitFor(() => {
        expect(screen.getByTestId('post-grace-notice-toast')).toBeTruthy();
      });

      // After the 5s dwell, the non-proxy owner acknowledgement fires.
      await act(async () => {
        jest.advanceTimersByTime(5000);
      });

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining(`/notices/${NOTICE_ID}/seen`),
          expect.objectContaining({ method: 'POST' }),
        );
      });
    },
  );
});

describe('HomeScreen SF-1: markCelebrationsSeen error handling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockOnAllComplete = null;
    mockNavigationHomeScreen = 'LearnerHome';
    mockNavigationIsParentProxy = false;
  });

  it('does not acknowledge a completed generation owned by another profile', async () => {
    const owner = createTestProfile({
      id: 'p1',
      displayName: 'Alex',
      isOwner: true,
    });
    const { wrapper } = createScreenWrapper({
      activeProfile: owner,
      profiles: [owner],
    });

    render(<HomeScreen />, { wrapper });
    expect(mockOnAllComplete).not.toBeNull();
    await act(async () => {
      mockOnAllComplete?.('p2');
    });

    expect(mockFetch).not.toHaveBeenCalledWith(
      expect.stringContaining('/celebrations/seen'),
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('logs error when markCelebrationsSeen.mutateAsync rejects — no unhandled rejection [SF-1]', async () => {
    let queryClient:
      | ReturnType<typeof createScreenWrapper>['queryClient']
      | null = null;
    let renderResult: RenderAPI | null = null;
    const consoleSpy = jest
      .spyOn(console, 'warn')
      .mockImplementation((...args: unknown[]) => {
        debugHomeTest('console.warn', args);
      });
    mockFetch.setRoute(
      '/celebrations/seen',
      (url: string, init?: RequestInit) => {
        debugHomeTest('mock route /celebrations/seen', {
          url,
          method: init?.method,
          body: init?.body,
        });
        return new Response('{}', { status: 500 });
      },
    );
    const owner = createTestProfile({
      id: 'p1',
      displayName: 'Alex',
      isOwner: true,
    });

    try {
      const screenHarness = createScreenWrapper({
        activeProfile: owner,
        profiles: [owner],
      });
      queryClient = screenHarness.queryClient;

      debugHomeTest('render start');
      renderResult = render(<HomeScreen />, { wrapper: screenHarness.wrapper });
      debugHomeTest('render complete', {
        hasOnAllComplete: mockOnAllComplete !== null,
        mockFetchCalls: mockFetch.mock.calls.length,
      });

      expect(mockOnAllComplete).not.toBeNull();
      await act(async () => {
        debugHomeTest('onAllComplete start');
        mockOnAllComplete?.('p1');
        debugHomeTest('onAllComplete returned');
      });

      await waitFor(() => {
        debugHomeTest('waitFor console.warn', {
          warnCalls: consoleSpy.mock.calls.length,
          mockFetchCalls: mockFetch.mock.calls.length,
        });
        expect(consoleSpy).toHaveBeenCalledWith(
          '[Celebrations] Failed to mark as seen, will retry on next visit:',
          expect.objectContaining({ message: expect.any(String) }),
        );
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/celebrations/seen'),
        expect.objectContaining({ method: 'POST' }),
      );
    } finally {
      renderResult?.unmount();
      if (queryClient) {
        const qc = queryClient;
        await act(async () => {
          cleanupScreen(qc);
        });
      }
      consoleSpy.mockRestore();
    }
  });
});
