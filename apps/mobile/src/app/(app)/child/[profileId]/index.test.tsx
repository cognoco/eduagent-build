import { fireEvent, waitFor } from '@testing-library/react-native';
import type { ChildSession } from '@eduagent/schemas';
import {
  createRoutedMockFetch,
  fetchCallsMatching,
  type RoutedMockFetch,
} from '../../../../test-utils/mock-api-routes';
import {
  renderScreen,
  NAMED_PROFILES,
} from '../../../../test-utils/screen-render';

// ---------------------------------------------------------------------------
// Boundary mocks (allowed: native + i18n + transport + presentational shims)
// ---------------------------------------------------------------------------

// i18n boundary. This screen's assertions reference RAW translation keys
// (e.g. /parentView\.retention\.strong\.label/), so we keep a key-passthrough
// mock rather than the en.json-resolving shared mock — switching to resolved
// strings would silently change what every key-based assertion matches.
jest.mock(
  'react-i18next' /* gc1-allow: i18n boundary — key-passthrough so key assertions stay exact */,
  () => ({
    useTranslation: () => ({
      t: (key: string, opts?: Record<string, unknown>) => {
        if (opts && typeof opts === 'object') {
          return `${key}:${JSON.stringify(opts)}`;
        }
        return key;
      },
    }),
    // The real api-client/profile chain now loads (it isn't hook-mocked), which
    // pulls in i18n/index.ts -> i18next.use(initReactI18next). Provide the
    // boundary exports it needs so init doesn't blow up; the `t` passthrough
    // above is unchanged.
    initReactI18next: { type: '3rdParty', init: () => undefined },
    Trans: ({ children }: { children?: unknown }) => children ?? null,
  }),
);

// ---------------------------------------------------------------------------
// Router + navigation
// ---------------------------------------------------------------------------

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockBack = jest.fn();
const mockCanGoBack = jest.fn(() => false);
const mockGoBackOrReplace = jest.fn();
let mockLocalSearchParams: { profileId: string; mode?: string } = {
  profileId: 'child-001',
};

jest.mock('expo-router' /* gc1-allow: native-boundary */, () => ({
  useRouter: () => ({
    back: mockBack,
    canGoBack: mockCanGoBack,
    replace: mockReplace,
    push: mockPush,
  }),
  useLocalSearchParams: () => mockLocalSearchParams,
}));

jest.mock(
  'react-native-safe-area-context' /* gc1-allow: native-boundary */,
  () => ({
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  }),
);

jest.mock(
  '../../../../lib/navigation' /* gc1-allow: route fallback helper is asserted through focused route behavior here */,
  () => ({
    FAMILY_HOME_PATH: '/(app)/home',
    goBackOrReplace: (...args: unknown[]) => mockGoBackOrReplace(...args),
  }),
);

jest.mock(
  '../../../../lib/platform-alert' /* gc1-allow: confirmation callback is the behavior under test, not the native alert renderer */,
  () => ({
    platformAlert: (
      _title: string,
      _message?: string,
      buttons?: Array<{ style?: string; onPress?: () => void }>,
    ) => {
      const action = buttons?.find((button) => button.style !== 'cancel');
      action?.onPress?.();
    },
  }),
);

// Common components barrel (includes Reanimated animations — cannot render in
// JSDOM). We keep a thin ErrorFallback shim so the data-absent fallback testIDs
// stay assertable.
jest.mock(
  '../../../../components/common' /* gc1-allow: barrel exports RN components including Reanimated animations — cannot render in JSDOM */,
  () => ({
    ErrorFallback: ({
      title,
      message,
      primaryAction,
      secondaryAction,
      testID,
    }: {
      title?: string;
      message?: string;
      primaryAction?: {
        label: string;
        onPress: () => void;
        testID?: string;
      };
      secondaryAction?: {
        label: string;
        onPress: () => void;
        testID?: string;
      };
      testID?: string;
    }) => {
      const { View, Text, Pressable } = require('react-native');
      return (
        <View testID={testID ?? 'error-fallback'}>
          {title ? <Text testID="error-fallback-title">{title}</Text> : null}
          {message ? (
            <Text testID="error-fallback-message">{message}</Text>
          ) : null}
          {primaryAction ? (
            <Pressable
              testID={primaryAction.testID ?? 'error-fallback-primary'}
              onPress={primaryAction.onPress}
            >
              <Text>{primaryAction.label}</Text>
            </Pressable>
          ) : null}
          {secondaryAction ? (
            <Pressable
              testID={secondaryAction.testID ?? 'error-fallback-secondary'}
              onPress={secondaryAction.onPress}
            >
              <Text>{secondaryAction.label}</Text>
            </Pressable>
          ) : null}
        </View>
      );
    },
  }),
);

// Route the Hono RPC client through our mock fetch so real hooks run.
const mockFetch: RoutedMockFetch = createRoutedMockFetch();

jest.mock(
  '../../../../lib/api-client' /* gc1-allow: transport-boundary — routed mock fetch drives real hooks */,
  () => {
    const actual = jest.requireActual('../../../../lib/api-client');
    const { hc } = require('hono/client');
    return {
      ...actual,
      useApiClient: () => hc('http://localhost', { fetch: mockFetch }),
    };
  },
);

// ---------------------------------------------------------------------------
// Module under test (required AFTER all mocks are set up)
// ---------------------------------------------------------------------------

const { default: ChildDetailScreen } = require('./index') as {
  default: React.ComponentType;
};

// ---------------------------------------------------------------------------
// Profile fixtures — guardian (active owner) + linked child. The URL profileId
// (child-001) must appear in profiles[] to clear the IDOR / no-access guard.
// ---------------------------------------------------------------------------

const guardianProfile = {
  ...NAMED_PROFILES.guardian,
  id: 'parent-001',
  accountId: 'account-family',
  displayName: 'Parent',
  isOwner: true,
  hasFamilyLinks: true,
};
const linkedChildProfile = {
  ...NAMED_PROFILES.linkedChild,
  id: 'child-001',
  accountId: 'account-family',
  displayName: 'Emma',
  isOwner: false,
  createdAt: '2026-01-01T00:00:00.000Z',
};

// ---------------------------------------------------------------------------
// Fixture factories — produce schema-valid responses so the REAL hooks'
// childSessionsResponseSchema.parse() and assertOk() succeed.
// ---------------------------------------------------------------------------

function makeSession(overrides: Partial<ChildSession> = {}): ChildSession {
  return {
    sessionId: '22222222-2222-7222-8222-222222222222',
    subjectId: '11111111-1111-7111-8111-111111111111',
    subjectName: 'Mathematics',
    topicId: null,
    topicTitle: null,
    sessionType: 'learning',
    startedAt: '2026-05-13T12:00:00.000Z',
    endedAt: null,
    exchangeCount: 0,
    escalationRung: 1,
    durationSeconds: 600,
    wallClockSeconds: 900,
    displayTitle: 'Session',
    displaySummary: null,
    homeworkSummary: null,
    highlight: 'Used a number line to compare fractions.',
    narrative: null,
    conversationPrompt: null,
    engagementSignal: null,
    drills: [],
    ...overrides,
  };
}

const defaultChildDetail = {
  displayName: 'Emma',
  summary: 'Year 6',
  currentStreak: 0,
  totalXp: 0,
  progress: null,
  subjects: [
    {
      subjectId: '11111111-1111-7111-8111-111111111111',
      name: 'Mathematics',
      retentionStatus: 'strong',
      rawInput: 'fractions homework',
    },
  ],
};

const defaultLearnerProfile = {
  accommodationMode: 'none',
  memoryConsentStatus: 'granted',
  updatedAt: null,
};

const consentedStatus = {
  consentStatus: 'CONSENTED',
  respondedAt: '2026-01-01T00:00:00.000Z',
  consentType: 'GDPR',
};

interface RouteConfig {
  childDetail?: unknown;
  childDetailError?: number;
  dashboard?: unknown;
  dashboardUndefined?: boolean;
  sessions?: ChildSession[];
  learnerProfile?: unknown;
  consent?: unknown;
  consentError?: number;
}

/**
 * Configure all endpoints the screen's real hooks call. Branches the shared
 * `/dashboard/children/child-001` route on sub-path (detail vs sessions).
 */
function setRoutes(config: RouteConfig = {}): void {
  const childDetail =
    'childDetail' in config ? config.childDetail : defaultChildDetail;
  const sessions = config.sessions ?? [makeSession()];

  mockFetch.setRoute(
    '/dashboard/children/child-001',
    (url: string, init?: RequestInit) => {
      if (url.includes('/sessions')) {
        return { sessions };
      }
      if (init?.method && init.method !== 'GET') return {};
      // Child detail GET.
      if (config.childDetailError) {
        return new Response(JSON.stringify({ message: 'detail failed' }), {
          status: config.childDetailError,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return { child: childDetail };
    },
  );

  // Top-level dashboard aggregate. Empty children triggers a /dashboard/demo
  // fallback inside useDashboard, so route both.
  if (config.dashboardUndefined) {
    // Return a shape with empty children so the hook falls back to demo.
    mockFetch.setRoute('/dashboard', () => ({
      children: [],
      pendingNotices: [],
      demoMode: false,
    }));
    mockFetch.setRoute('/dashboard/demo', () => ({
      children: [],
      pendingNotices: [],
      demoMode: true,
    }));
  } else {
    const dashboard = config.dashboard ?? {
      children: [],
      pendingNotices: [],
      demoMode: false,
    };
    mockFetch.setRoute('/dashboard', () => dashboard);
    mockFetch.setRoute('/dashboard/demo', () => ({
      children: [],
      pendingNotices: [],
      demoMode: true,
    }));
  }

  mockFetch.setRoute('/learner-profile/child-001', () => ({
    profile: config.learnerProfile ?? defaultLearnerProfile,
  }));

  mockFetch.setRoute(
    '/consent/child-001/status',
    (_url: string, init?: RequestInit) => {
      // revoke / restore PUTs share the /consent/child-001 prefix but carry a
      // different sub-path; only the status GET resolves here.
      if (init?.method && init.method !== 'GET') return {};
      if (config.consentError) {
        return new Response(JSON.stringify({ message: 'consent failed' }), {
          status: config.consentError,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return config.consent ?? consentedStatus;
    },
  );

  mockFetch.setRoute('/consent/child-001/revoke', () => ({
    message: 'revoked',
    consentStatus: 'WITHDRAWN',
  }));
  mockFetch.setRoute('/consent/child-001/restore', () => ({
    message: 'restored',
    consentStatus: 'CONSENTED',
  }));
}

function renderChildDetail() {
  return renderScreen(<ChildDetailScreen />, {
    profile: guardianProfile,
    profiles: [guardianProfile, linkedChildProfile],
    installGlobalFetch: false,
    routedFetch: mockFetch,
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockFetch.mockClear();
  mockLocalSearchParams = { profileId: 'child-001' };
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ChildDetailScreen — accommodation nav row', () => {
  beforeEach(() => {
    mockLocalSearchParams = { profileId: 'child-001', mode: 'settings' };
    setRoutes();
  });

  it('renders the accommodation nav row', async () => {
    const { result, cleanup } = renderChildDetail();

    await waitFor(() => {
      result.getByTestId('child-accommodation-row-child-001');
    });

    cleanup();
  });

  it('navigates to the accommodation screen when pressed', async () => {
    const { result, cleanup } = renderChildDetail();

    fireEvent.press(
      await waitFor(() =>
        result.getByTestId('child-accommodation-row-child-001'),
      ),
    );

    expect(mockPush).toHaveBeenCalledWith(
      '/(app)/more/accommodation?childProfileId=child-001',
    );

    cleanup();
  });

  it('shows the active accommodation mode name', async () => {
    setRoutes({
      learnerProfile: {
        accommodationMode: 'audio-first',
        memoryConsentStatus: 'granted',
        updatedAt: null,
      },
    });

    const { result, cleanup } = renderChildDetail();

    const row = await waitFor(() =>
      result.getByTestId('child-accommodation-row-child-001'),
    );
    await waitFor(() => {
      expect(row).toHaveTextContent(/Audio-First/);
    });

    cleanup();
  });
});

describe('ChildDetailScreen — profile overview', () => {
  beforeEach(() => {
    setRoutes();
  });

  it('shows a last-session signal in the header when sessions exist', async () => {
    setRoutes({
      sessions: [
        makeSession({
          sessionId: '33333333-3333-7333-8333-333333333333',
          startedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
          highlight: null,
        }),
      ],
    });

    const { result, cleanup } = renderChildDetail();

    await waitFor(() => {
      // Key-passthrough mock: formatLastSession renders
      // t('parentView.index.timeAgo.hours', { count: 2 }) nested inside the
      // lastSessionAgo wrapper as 'parentView.index.timeAgo.hours:{\"count\":2}'
      // — asserting the exact form verifies both the plural key and the
      // computed count (quotes are escaped by the outer JSON.stringify).
      result.getByText(/parentView\.index\.timeAgo\.hours:\{\\?"count\\?":2\}/);
    });

    cleanup();
  });

  it('shows a no-sessions-yet header signal when there is no session history', async () => {
    setRoutes({ sessions: [] });

    const { result, cleanup } = renderChildDetail();

    await waitFor(() => {
      expect(
        result.getAllByText(/No sessions yet|parentView\.index\.noSessionsYet/),
      ).not.toHaveLength(0);
    });

    cleanup();
  });

  it('links to the child mentor memory management screen', async () => {
    mockLocalSearchParams = { profileId: 'child-001', mode: 'settings' };

    const { result, cleanup } = renderChildDetail();

    fireEvent.press(
      await waitFor(() => result.getByTestId('mentor-memory-link')),
    );

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/child/[profileId]/mentor-memory',
      params: { profileId: 'child-001' },
    });

    cleanup();
  });

  it('shows profile details when the profile already has a created date', async () => {
    mockLocalSearchParams = { profileId: 'child-001', mode: 'settings' };

    const { result, cleanup } = renderChildDetail();

    await waitFor(() => {
      result.getByTestId('child-profile-details');
    });

    cleanup();
  });

  it('[PARENT-03] shows a lean overview with subjects, raw input, and recent sessions', async () => {
    setRoutes({
      childDetail: {
        displayName: 'Emma',
        summary: 'Year 6',
        currentStreak: 0,
        totalXp: 0,
        progress: {
          snapshotDate: '2026-05-13',
          topicsMastered: 3,
          vocabularyTotal: 10,
          minutesThisWeek: 20,
          weeklyDeltaTopicsMastered: 1,
          weeklyDeltaVocabularyTotal: 2,
          weeklyDeltaTopicsExplored: 3,
          engagementTrend: 'stable',
          guidance: 'Keep going',
        },
        subjects: [
          {
            subjectId: '11111111-1111-7111-8111-111111111111',
            name: 'Mathematics',
            retentionStatus: 'strong',
            rawInput: 'fractions homework',
          },
        ],
        weeklyHeadline: {
          label: 'Topics mastered',
          value: 5,
          comparison: 'up from 3 last week',
        },
        currentlyWorkingOn: ['Algebra'],
      },
    });

    const { result, cleanup } = renderChildDetail();

    await waitFor(() => {
      result.getByTestId('child-subjects-section');
    });
    result.getByTestId('child-subjects-section');
    result.getByTestId('subject-card-11111111-1111-7111-8111-111111111111');
    const subjectSummary = await waitFor(() =>
      result.getByTestId(
        'subject-mentor-summary-11111111-1111-7111-8111-111111111111',
      ),
    );
    expect(subjectSummary).toHaveTextContent(
      'Used a number line to compare fractions.',
    );
    await waitFor(() => {
      result.getByText(/parentView\.index\.subjectSessionNextStep/);
    });
    await waitFor(() => {
      result.getByTestId('session-card-22222222-2222-7222-8222-222222222222');
    });
    expect(result.queryByTestId('child-weekly-headline-card')).toBeNull();
    expect(result.queryByTestId('child-reports-button')).toBeNull();
    expect(result.queryByTestId('child-reports-link')).toBeNull();
    expect(result.queryByTestId('child-curriculum-link')).toBeNull();
    expect(result.queryByTestId('growth-teaser')).toBeNull();
    expect(
      result.queryByTestId('child-accommodation-row-child-001'),
    ).toBeNull();
    expect(result.queryByTestId('mentor-memory-link')).toBeNull();
    expect(result.queryByTestId('child-profile-details')).toBeNull();
    expect(result.queryByTestId('consent-section')).toBeNull();
    expect(
      result.queryByText(/parentView\.index\.childProfileScopeHint/),
    ).toBeNull();

    cleanup();
  });

  it('[PARENT-03] uses a raw-input mentor note when a subject has no session recap yet', async () => {
    setRoutes({
      childDetail: {
        displayName: 'Emma',
        summary: 'Year 6',
        currentStreak: 0,
        totalXp: 0,
        progress: null,
        subjects: [
          {
            subjectId: '11111111-1111-7111-8111-111111111111',
            name: 'Mathematics',
            retentionStatus: 'strong',
            rawInput: null,
          },
          {
            subjectId: '33333333-3333-7333-8333-333333333333',
            name: 'Biology',
            retentionStatus: 'unknown',
            rawInput: 'Science',
          },
        ],
      },
      sessions: [
        makeSession({
          subjectId: '11111111-1111-7111-8111-111111111111',
          subjectName: 'Mathematics',
        }),
      ],
    });

    const { result, cleanup } = renderChildDetail();

    await waitFor(() => {
      result.getByTestId('subject-card-33333333-3333-7333-8333-333333333333');
    });
    result.getByTestId(
      'subject-mentor-summary-33333333-3333-7333-8333-333333333333',
    );
    result.getByText(/parentView\.index\.subjectRawMentorSummary/);
    result.getByText(/parentView\.index\.subjectRawNextStep/);

    cleanup();
  });

  it('shows only child settings when opened from the child avatar card', async () => {
    mockLocalSearchParams = { profileId: 'child-001', mode: 'settings' };

    const { result, cleanup } = renderChildDetail();

    await waitFor(() => {
      result.getByTestId('child-accommodation-row-child-001');
    });
    expect(result.queryByTestId('child-reports-link')).toBeNull();
    expect(result.queryByTestId('child-subjects-section')).toBeNull();
    expect(
      result.queryByTestId('session-card-22222222-2222-7222-8222-222222222222'),
    ).toBeNull();
    result.getByTestId('mentor-memory-link');
    result.getByTestId('child-profile-details');
    result.getByTestId('consent-section');

    cleanup();
  });

  it('[PARENT-03] shows only child progress when opened from the Progress action (?mode=progress)', async () => {
    mockLocalSearchParams = { profileId: 'child-001', mode: 'progress' };

    const { result, cleanup } = renderChildDetail();

    await waitFor(() => {
      result.getByTestId('child-subjects-section');
    });
    expect(result.queryByTestId('child-reports-link')).toBeNull();
    result.getByTestId('child-progress-nudge-card');
    await waitFor(() => {
      result.getByTestId('session-card-22222222-2222-7222-8222-222222222222');
    });
    expect(
      result.queryByTestId('child-accommodation-row-child-001'),
    ).toBeNull();
    expect(result.queryByTestId('mentor-memory-link')).toBeNull();
    expect(result.queryByTestId('child-profile-details')).toBeNull();
    expect(result.queryByTestId('consent-section')).toBeNull();

    cleanup();
  });

  it('back arrow returns to family home instead of whatever screen is in history', async () => {
    mockLocalSearchParams = { profileId: 'child-001', mode: 'progress' };
    mockCanGoBack.mockReturnValue(true);

    const { result, cleanup } = renderChildDetail();

    fireEvent.press(await waitFor(() => result.getByTestId('back-button')));

    expect(mockBack).not.toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith('/(app)/home');

    cleanup();
  });

  it('hides subject memory status while the child is still a new learner', async () => {
    mockLocalSearchParams = { profileId: 'child-001', mode: 'progress' };
    setRoutes({
      childDetail: {
        displayName: 'Emma',
        summary: 'Getting started',
        currentStreak: 0,
        totalXp: 0,
        totalSessions: 2,
        progress: null,
        subjects: [
          {
            subjectId: '11111111-1111-7111-8111-111111111111',
            name: 'Mathematics',
            retentionStatus: 'strong',
            rawInput: null,
          },
        ],
      },
    });

    const { result, cleanup } = renderChildDetail();

    await waitFor(() => {
      result.getByTestId('subject-card-11111111-1111-7111-8111-111111111111');
    });
    expect(result.queryByText('parentView.retention.strong.label')).toBeNull();
    expect(result.queryByText('strong')).toBeNull();

    cleanup();
  });

  it('uses the friendly memory status label after there is enough activity', async () => {
    mockLocalSearchParams = { profileId: 'child-001', mode: 'progress' };
    setRoutes({
      childDetail: {
        displayName: 'Emma',
        summary: 'Settled rhythm',
        currentStreak: 0,
        totalXp: 0,
        totalSessions: 4,
        progress: null,
        subjects: [
          {
            subjectId: '11111111-1111-7111-8111-111111111111',
            name: 'Mathematics',
            retentionStatus: 'strong',
            rawInput: null,
          },
        ],
      },
    });

    const { result, cleanup } = renderChildDetail();

    await waitFor(() => {
      result.getByText(/parentView\.retention\.strong\.label/);
    });
    expect(result.queryByText('strong')).toBeNull();

    cleanup();
  });

  it('uses a fresh progress nudge when the child studied recently', async () => {
    mockLocalSearchParams = { profileId: 'child-001', mode: 'progress' };
    setRoutes({
      sessions: [
        makeSession({
          sessionId: '33333333-3333-7333-8333-333333333333',
          subjectId: '11111111-1111-7111-8111-111111111111',
          subjectName: 'Mathematics',
          topicId: '44444444-4444-7444-8444-444444444444',
          topicTitle: 'Fractions',
          startedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
          highlight: null,
        }),
      ],
    });

    const { result, cleanup } = renderChildDetail();

    await waitFor(() => {
      result.getByText(/parentView\.index\.progressNudgeFreshTitle/);
    });
    expect(result.queryByText(/ease back/)).toBeNull();

    cleanup();
  });

  it('opens the nudge subject from the progress action card', async () => {
    mockLocalSearchParams = { profileId: 'child-001', mode: 'progress' };

    const { result, cleanup } = renderChildDetail();

    fireEvent.press(
      await waitFor(() => result.getByTestId('child-progress-nudge-card')),
    );

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/child/[profileId]/subjects/[subjectId]',
      params: {
        profileId: 'child-001',
        subjectId: '11111111-1111-7111-8111-111111111111',
        subjectName: 'Mathematics',
        childName: 'Emma',
      },
    });

    cleanup();
  });

  it('opens the latest topic from the progress action card when the session has one', async () => {
    mockLocalSearchParams = { profileId: 'child-001', mode: 'progress' };
    setRoutes({
      sessions: [
        makeSession({
          sessionId: '33333333-3333-7333-8333-333333333333',
          subjectId: '11111111-1111-7111-8111-111111111111',
          subjectName: 'Mathematics',
          topicId: '44444444-4444-7444-8444-444444444444',
          topicTitle: 'Fractions',
          startedAt: '2026-05-13T12:00:00.000Z',
          highlight: null,
        }),
      ],
    });

    const { result, cleanup } = renderChildDetail();

    fireEvent.press(
      await waitFor(() => result.getByTestId('child-progress-nudge-card')),
    );

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/child/[profileId]/topic/[topicId]',
      params: {
        profileId: 'child-001',
        topicId: '44444444-4444-7444-8444-444444444444',
        title: 'Fractions',
        completionStatus: 'in_progress',
        masteryScore: '',
        retentionStatus: '',
        totalSessions: '1',
        subjectId: '11111111-1111-7111-8111-111111111111',
        subjectName: 'Mathematics',
        childName: 'Emma',
      },
    });

    cleanup();
  });

  it('keeps the child progress surface open when the detail query fails but dashboard data has the child', async () => {
    setRoutes({
      childDetailError: 500,
      dashboard: {
        children: [
          {
            profileId: 'child-001',
            displayName: 'Emma',
            consentStatus: null,
            respondedAt: null,
            summary: 'Emma is building confidence.',
            sessionsThisWeek: 0,
            sessionsLastWeek: 0,
            totalTimeThisWeek: 0,
            totalTimeLastWeek: 0,
            exchangesThisWeek: 0,
            exchangesLastWeek: 0,
            trend: 'stable',
            subjects: [
              {
                subjectId: '11111111-1111-7111-8111-111111111111',
                name: 'Programming',
                retentionStatus: 'strong',
                rawInput: null,
              },
            ],
            guidedVsImmediateRatio: 0,
            retentionTrend: 'stable',
            totalSessions: 0,
            weeklyHeadline: undefined,
            currentlyWorkingOn: ['Programming'],
            progress: null,
            currentStreak: 0,
            longestStreak: 0,
            totalXp: 0,
          },
        ],
        pendingNotices: [],
        demoMode: false,
      },
    });

    const { result, cleanup } = renderChildDetail();

    await waitFor(() => {
      result.getByText('Programming');
    });
    expect(result.queryByTestId('child-profile-unavailable')).toBeNull();
    result.getByTestId('child-detail-scroll');
    result.getByText('Emma');
    result.getByTestId('child-subjects-section');

    cleanup();
  });

  it('keeps child profile settings open when the linked profile exists but detail data is unavailable', async () => {
    mockLocalSearchParams = { profileId: 'child-001', mode: 'settings' };
    setRoutes({ childDetail: null, dashboardUndefined: true });

    const { result, cleanup } = renderChildDetail();

    await waitFor(() => {
      result.getByTestId('mentor-memory-link');
    });
    expect(result.queryByTestId('child-profile-unavailable')).toBeNull();
    result.getByTestId('child-detail-scroll');
    result.getByText('Emma');
    result.getByTestId('child-profile-details');

    cleanup();
  });

  it('routes subject surfaces from the child overview', async () => {
    const { result, cleanup } = renderChildDetail();

    await waitFor(() => {
      result.getByTestId('subject-card-11111111-1111-7111-8111-111111111111');
    });

    fireEvent.press(
      result.getByTestId('subject-card-11111111-1111-7111-8111-111111111111'),
    );
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/child/[profileId]/subjects/[subjectId]',
      params: {
        profileId: 'child-001',
        subjectId: '11111111-1111-7111-8111-111111111111',
        subjectName: 'Mathematics',
        childName: 'Emma',
      },
    });

    cleanup();
  });

  it('renders parent consent management for a consented child', async () => {
    mockLocalSearchParams = { profileId: 'child-001', mode: 'settings' };

    const { result, cleanup } = renderChildDetail();

    await waitFor(() => {
      result.getByTestId('withdraw-consent-button');
    });
    result.getByTestId('consent-section');
    expect(result.queryByTestId('grace-period-banner')).toBeNull();

    cleanup();
  });

  it('invokes consent revocation from the withdraw confirmation', async () => {
    mockLocalSearchParams = { profileId: 'child-001', mode: 'settings' };

    const { result, cleanup } = renderChildDetail();

    fireEvent.press(
      await waitFor(() => result.getByTestId('withdraw-consent-button')),
    );

    // platformAlert mock auto-fires the destructive button -> revoke mutation.
    await waitFor(() => {
      const calls = fetchCallsMatching(mockFetch, '/consent/child-001/revoke');
      expect(calls.length).toBeGreaterThanOrEqual(1);
      expect(calls[0]?.init?.method).toBe('PUT');
    });

    cleanup();
  });

  it('renders the consent-withdrawn empty state (not grace-period banner) for a withdrawn child', async () => {
    // WI-263: consent WITHDRAWN now shows the screen-level empty state instead
    // of the ConsentManagementSection grace-period banner. The empty state CTA
    // calls restoreConsent directly.
    setRoutes({
      consent: {
        consentStatus: 'WITHDRAWN',
        respondedAt: new Date().toISOString(),
        consentType: 'GDPR',
      },
    });

    const { result, cleanup } = renderChildDetail();

    await waitFor(() => {
      result.getByTestId('consent-withdrawn-empty-state');
    });
    expect(result.queryByTestId('grace-period-banner')).toBeNull();

    fireEvent.press(result.getByTestId('consent-withdrawn-request-cta'));
    await waitFor(() => {
      const calls = fetchCallsMatching(mockFetch, '/consent/child-001/restore');
      expect(calls.length).toBeGreaterThanOrEqual(1);
      expect(calls[0]?.init?.method).toBe('PUT');
    });

    cleanup();
  });

  it('keeps consent management visible and retryable when consent status fails to load', async () => {
    mockLocalSearchParams = { profileId: 'child-001', mode: 'settings' };
    setRoutes({ consentError: 500 });

    const { result, cleanup } = renderChildDetail();

    await waitFor(() => {
      result.getByTestId('consent-status-error');
    });
    result.getByTestId('consent-section');

    // Recover the endpoint, then retry should re-fetch and clear the error.
    mockFetch.setRoute('/consent/child-001/status', () => consentedStatus);
    fireEvent.press(result.getByTestId('consent-status-retry'));

    await waitFor(() => {
      result.getByTestId('withdraw-consent-button');
    });

    cleanup();
  });
});

// ---------------------------------------------------------------------------
// deletionGraceDays plural wiring — count=1 (singular) vs count=5 (plural)
//
// WI-263: WITHDRAWN consent now renders the screen-level empty state instead
// of the ConsentManagementSection with the grace-period banner. The
// deletionGraceDays plural key routing is tested at the ConsentManagementSection
// level. These tests now verify the screen correctly shows the empty state for
// withdrawn consent (the banner is not reachable from the screen level).
// ---------------------------------------------------------------------------

describe('ChildDetailScreen — deletionGraceDays plural key routing', () => {
  function setupWithdrawnConsent(daysAgo: number): void {
    // respondedAt is daysAgo days in the past; grace period = 7 days
    // daysRemaining = ceil((7 - daysAgo) * MS_PER_DAY / MS_PER_DAY) = 7 - daysAgo
    const respondedAt = new Date(
      Date.now() - daysAgo * 24 * 60 * 60 * 1000,
    ).toISOString();
    setRoutes({
      consent: {
        consentStatus: 'WITHDRAWN',
        respondedAt,
        consentType: 'GDPR',
      },
    });
  }

  it('shows the consent-withdrawn empty state (not grace-period banner) when 1 day remains', async () => {
    // WI-263: withdrawn consent now shows screen-level empty state;
    // grace-period-banner is no longer reachable from this screen when WITHDRAWN.
    setupWithdrawnConsent(6);

    const { result, cleanup } = renderChildDetail();

    await waitFor(() => {
      result.getByTestId('consent-withdrawn-empty-state');
    });
    expect(result.queryByTestId('grace-period-banner')).toBeNull();

    cleanup();
  });

  it('shows the consent-withdrawn empty state (not grace-period banner) when 5 days remain', async () => {
    // WI-263: same — empty state replaces the full screen for withdrawn consent.
    setupWithdrawnConsent(2);

    const { result, cleanup } = renderChildDetail();

    await waitFor(() => {
      result.getByTestId('consent-withdrawn-empty-state');
    });
    expect(result.queryByTestId('grace-period-banner')).toBeNull();

    cleanup();
  });
});

// ---------------------------------------------------------------------------
// BUG-681: data-absent state renders ErrorFallback (not blank)
// Trigger: isLoading=false + childDetail=null + no dashboard entry + profiles=[]
// Fix: detailUnavailable block now renders <ErrorFallback> with retry + back actions
// ---------------------------------------------------------------------------

describe('ChildDetailScreen — data-absent state (BUG-681)', () => {
  // Empty profiles bypasses the no-access guard (profiles.length > 0 is false)
  // and leaves ownedProfile=undefined, so detailUnavailable=true when
  // childDetail is also null/undefined.
  function renderWithoutProfiles() {
    return renderScreen(<ChildDetailScreen />, {
      profile: guardianProfile,
      profiles: [],
      installGlobalFetch: false,
      routedFetch: mockFetch,
    });
  }

  beforeEach(() => {
    setRoutes({
      childDetail: null,
      dashboard: { children: [], pendingNotices: [], demoMode: false },
    });
  });

  it('[BUG-681] renders ErrorFallback wrapper when childDetail is null and no known profile', async () => {
    const { result, cleanup } = renderWithoutProfiles();

    await waitFor(() => {
      result.getByTestId('child-profile-unavailable');
    });
    result.getByTestId('child-profile-unavailable-fallback');
    expect(result.queryByTestId('child-detail-scroll')).toBeNull();

    cleanup();
  });

  it('[BUG-681] ErrorFallback exposes both retry and back-to-dashboard actions', async () => {
    const { result, cleanup } = renderWithoutProfiles();

    await waitFor(() => {
      result.getByTestId('child-profile-retry');
    });
    result.getByTestId('child-profile-back');

    cleanup();
  });

  it('[BUG-681] retry action re-fetches the child detail query', async () => {
    const { result, cleanup } = renderWithoutProfiles();

    fireEvent.press(
      await waitFor(() => result.getByTestId('child-profile-retry')),
    );

    // Retry triggers a fresh GET to the child-detail endpoint.
    await waitFor(() => {
      const detailGets = fetchCallsMatching(
        mockFetch,
        '/dashboard/children/child-001',
      ).filter(
        ({ url, init }) =>
          !url.includes('/sessions') &&
          (!init?.method || init.method === 'GET'),
      );
      expect(detailGets.length).toBeGreaterThanOrEqual(2);
    });

    cleanup();
  });

  it('[BUG-681] back-to-dashboard action navigates to family home', async () => {
    const { result, cleanup } = renderWithoutProfiles();

    fireEvent.press(
      await waitFor(() => result.getByTestId('child-profile-back')),
    );

    expect(mockReplace).toHaveBeenCalledWith('/(app)/home');

    cleanup();
  });

  it('[BUG-681] renders ErrorFallback when the detail query errors with no fallback data', async () => {
    setRoutes({
      childDetailError: 500,
      dashboardUndefined: true,
    });

    const { result, cleanup } = renderWithoutProfiles();

    await waitFor(() => {
      result.getByTestId('child-profile-unavailable');
    });
    result.getByTestId('child-profile-unavailable-fallback');
    expect(result.queryByTestId('child-detail-scroll')).toBeNull();

    cleanup();
  });
});

// ---------------------------------------------------------------------------
// WI-263: consent-withdrawn gates the learning-profile fetch
// ---------------------------------------------------------------------------

describe('ChildDetailScreen — consent-withdrawn empty state (WI-263)', () => {
  beforeEach(() => {
    setRoutes({
      consent: {
        consentStatus: 'WITHDRAWN',
        respondedAt: new Date().toISOString(),
        consentType: 'GDPR',
      },
    });
  });

  it('[WI-263] renders the consent-withdrawn empty state when consent is WITHDRAWN', async () => {
    const { result, cleanup } = renderChildDetail();

    await waitFor(() => {
      result.getByTestId('consent-withdrawn-empty-state');
    });
    result.getByTestId('consent-withdrawn-request-cta');
    expect(result.queryByTestId('child-detail-scroll')).toBeNull();

    cleanup();
  });

  it('[WI-263] does NOT fetch the learner-profile with the real childProfileId when consent is WITHDRAWN', async () => {
    // The learner-profile read is gated as
    // `consentResolved && !consentWithdrawn ? profileId : undefined`, so when
    // consent resolves WITHDRAWN the hook stays disabled and NO request to the
    // real child learner-profile endpoint must ever appear.
    const { result, cleanup } = renderChildDetail();

    await waitFor(() => {
      result.getByTestId('consent-withdrawn-empty-state');
    });

    const learnerProfileCalls = fetchCallsMatching(
      mockFetch,
      '/learner-profile/child-001',
    );
    expect(learnerProfileCalls).toHaveLength(0);

    cleanup();
  });

  it('[WI-263] positive control — fetches the learner-profile with the real childProfileId when consent is CONSENTED', async () => {
    // When consented the gate opens and the screen must fetch the real
    // child learner-profile endpoint for the settings-only rows that use it.
    mockLocalSearchParams = { profileId: 'child-001', mode: 'settings' };
    setRoutes({ consent: consentedStatus });

    const { result, cleanup } = renderChildDetail();

    await waitFor(() => {
      result.getByTestId('child-accommodation-row-child-001');
    });

    await waitFor(() => {
      const learnerProfileCalls = fetchCallsMatching(
        mockFetch,
        '/learner-profile/child-001',
      );
      expect(learnerProfileCalls.length).toBeGreaterThanOrEqual(1);
    });

    cleanup();
  });

  it('[WI-263] request-cta triggers the restore-consent mutation', async () => {
    const { result, cleanup } = renderChildDetail();

    fireEvent.press(
      await waitFor(() => result.getByTestId('consent-withdrawn-request-cta')),
    );

    await waitFor(() => {
      const calls = fetchCallsMatching(mockFetch, '/consent/child-001/restore');
      expect(calls.length).toBeGreaterThanOrEqual(1);
      expect(calls[0]?.init?.method).toBe('PUT');
    });

    cleanup();
  });
});
