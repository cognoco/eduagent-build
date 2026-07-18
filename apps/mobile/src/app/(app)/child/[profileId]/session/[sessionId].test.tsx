import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import * as Clipboard from 'expo-clipboard';
import {
  createRoutedMockFetch,
  type RoutedMockFetch,
} from '../../../../../test-utils/mock-api-routes';
import {
  renderScreen,
  NAMED_PROFILES,
} from '../../../../../test-utils/screen-render';

// i18n boundary. This screen's assertions reference the rendered English
// strings AND raw keys via the key-passthrough `t`. We keep a key-passthrough
// mock; the real api-client/profile chain (no longer hook-mocked) pulls in
// i18n/index.ts -> i18next.use(initReactI18next), so the boundary exports it
// needs are supplied so init doesn't blow up.
jest.mock(
  'react-i18next' /* gc1-allow: i18n boundary — key-passthrough so key assertions stay exact */,
  () => ({
    initReactI18next: { type: '3rdParty', init: () => undefined },
    Trans: ({ children }: { children?: unknown }) => children ?? null,
    useTranslation: () => ({
      t: (key: string, opts?: Record<string, unknown>) => {
        if (opts && typeof opts === 'object') {
          return `${key}:${JSON.stringify(opts)}`;
        }
        return key;
      },
    }),
  }),
);

const mockPush = jest.fn();
jest.mock('expo-router' /* gc1-allow: native-boundary */, () => ({
  useRouter: () => ({
    back: jest.fn(),
    canGoBack: jest.fn(() => true),
    push: mockPush,
  }),
  useLocalSearchParams: () => ({
    profileId: 'child-profile-001',
    sessionId: 'session-001',
  }),
}));

jest.mock(
  'react-native-safe-area-context' /* gc1-allow: native-boundary */,
  () => ({
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  }),
);

jest.mock('@expo/vector-icons' /* gc1-allow: native-boundary */, () => {
  const { View } = require('react-native');
  return {
    Ionicons: (props: Record<string, unknown>) => (
      <View testID={`icon-${props.name}`} />
    ),
  };
});

jest.mock('expo-clipboard' /* gc1-allow: native-boundary */, () => ({
  setStringAsync: jest.fn().mockResolvedValue(undefined),
}));

jest.mock(
  '../../../../../components/family/AddToMyLearningButton' /* gc1-allow: screen-level test — component has external boundaries (AsyncStorage, API client) tested separately in AddToMyLearningButton.test.tsx */,
  () => ({
    AddToMyLearningButton: () => null,
  }),
);

// Route the Hono RPC client through our mock fetch so the real
// useChildSessionDetail / useChildDetail hooks run.
const mockFetch: RoutedMockFetch = createRoutedMockFetch();

jest.mock(
  '../../../../../lib/api-client' /* gc1-allow: transport-boundary — routed mock fetch drives real hooks */,
  () => {
    const actual = jest.requireActual('../../../../../lib/api-client');
    const { hc } = require('hono/client');
    return {
      ...actual,
      useApiClient: () => hc('http://localhost', { fetch: mockFetch }),
    };
  },
);

const SessionDetailScreen = require('./[sessionId]').default;

// Guardian owner + linked child (URL profileId child-profile-001) opens the
// family-data gate (legacyMode !== 'study' && activeProfile.isOwner).
const guardianProfile = {
  ...NAMED_PROFILES.guardian,
  id: 'parent-001',
  accountId: 'account-family',
  isOwner: true,
};
const linkedChildProfile = {
  ...NAMED_PROFILES.linkedChild,
  id: 'child-profile-001',
  accountId: 'account-family',
  isOwner: false,
};

/**
 * Route the session-detail GET (returns `{ session }`, 404 -> null) and the
 * child-detail GET (returns `{ child }`). Returning `session: null` produces a
 * 404 so the real hook resolves to null (session-not-found path).
 */
function setRoutes(session: unknown): void {
  mockFetch.setRoute(
    '/dashboard/children/child-profile-001/sessions/session-001',
    () => {
      if (session === null) {
        return new Response(JSON.stringify({ message: 'not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return { session };
    },
  );
  mockFetch.setRoute('/dashboard/children/child-profile-001', () => ({
    child: {
      profileId: '30000000-0000-4000-8000-000000000001',
      displayName: 'Emma',
      organizationTimezone: null,
      consentStatus: null,
      respondedAt: null,
      summary: '',
      sessionsThisWeek: 0,
      sessionsLastWeek: 0,
      totalTimeThisWeek: 0,
      totalTimeLastWeek: 0,
      exchangesThisWeek: 0,
      exchangesLastWeek: 0,
      trend: 'stable',
      subjects: [],
      guidedVsImmediateRatio: 0,
      retentionTrend: 'stable',
      totalSessions: 0,
    },
  }));
}

function renderSessionDetail() {
  return renderScreen(<SessionDetailScreen />, {
    profile: guardianProfile,
    profiles: [guardianProfile, linkedChildProfile],
    installGlobalFetch: false,
    routedFetch: mockFetch,
  });
}

function makeSession(overrides: Record<string, unknown> = {}) {
  return {
    sessionId: '30000000-0000-4000-8000-000000000002',
    subjectId: '30000000-0000-4000-8000-000000000003',
    subjectName: 'Science',
    topicId: '30000000-0000-4000-8000-000000000004',
    topicTitle: 'Photosynthesis',
    sessionType: 'learning',
    startedAt: '2026-03-20T10:00:00Z',
    endedAt: '2026-03-20T10:08:00Z',
    exchangeCount: 5,
    escalationRung: 1,
    durationSeconds: 480,
    wallClockSeconds: 500,
    displayTitle: 'Learning',
    displaySummary: null,
    homeworkSummary: null,
    highlight: null,
    narrative: null,
    conversationPrompt: null,
    engagementSignal: null,
    drills: [],
    ...overrides,
  };
}

describe('SessionDetailScreen (summary-only)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockClear();
  });

  it('shows session metadata when displaySummary is present', async () => {
    setRoutes(
      makeSession({
        displaySummary: 'Practiced light reactions',
        narrative: 'They linked sunlight to the way plants make food.',
      }),
    );

    const { cleanup } = renderSessionDetail();

    await waitFor(() => screen.getByText('Practiced light reactions'));
    screen.getByTestId('session-metadata');

    cleanup();
  });

  it('shows recap content when the new narrative fields are present', async () => {
    setRoutes(
      makeSession({
        narrative:
          'They compared equivalent fractions and fixed one shaky step.',
        highlight: 'Practiced equivalent fractions',
        conversationPrompt: 'Which fraction felt easiest to compare today?',
        engagementSignal: 'focused',
      }),
    );

    const { cleanup } = renderSessionDetail();

    await waitFor(() =>
      expect(
        screen.getByText(
          'They compared equivalent fractions and fixed one shaky step.',
        ),
      ).toBeTruthy(),
    );
    screen.getByText('Practiced equivalent fractions');
    screen.getByTestId('engagement-chip-focused');
    expect(
      screen.getByText('Which fraction felt easiest to compare today?'),
    ).toBeTruthy();

    cleanup();
  });

  it('shows recap unavailable fallback when session has no recap fields', async () => {
    setRoutes(makeSession({ displaySummary: null }));

    const { cleanup } = renderSessionDetail();

    await waitFor(() => screen.getByTestId('narrative-unavailable'));
    // BUG-901: friendlier "missing summary" microcopy + the empty-state
    // testID stays stable so other surfaces can detect the case.
    screen.getByTestId('session-summary-empty-note');
    // The bare "No summary available for this session." string is replaced
    // by an explanation + pointer to the always-on CTAs at the bottom.
    expect(
      screen.queryByText('No summary available for this session.'),
    ).toBeNull();

    cleanup();
  });

  // BUG-901 break test: every session detail must render at least one CTA.
  it('[BUG-901] always renders at least one CTA at the bottom', async () => {
    setRoutes(makeSession({ displaySummary: null }));

    const { cleanup } = renderSessionDetail();

    await waitFor(() => screen.getByTestId('session-detail-ctas'));
    screen.getByTestId('session-detail-back-to-child');

    cleanup();
  });

  // BUG-901 break test: when topic context is available, "Open this topic"
  // must be wired up so a parent can re-engage the same content.
  it('[BUG-901] renders an Open Topic CTA that deep-links to the topic', async () => {
    setRoutes(
      makeSession({
        topicId: '30000000-0000-4000-8000-000000000004',
        topicTitle: 'Light reactions',
        displaySummary: null,
      }),
    );

    const { cleanup } = renderSessionDetail();

    const cta = await waitFor(() =>
      screen.getByTestId('session-detail-continue-topic'),
    );
    expect(cta).toBeTruthy();

    fireEvent.press(cta);
    expect(mockPush).toHaveBeenCalledWith(
      '/(app)/child/child-profile-001/topic/30000000-0000-4000-8000-000000000004',
    );

    cleanup();
  });

  // BUG-902 break test: parent-facing duration must be active time, not
  // wall-clock. Otherwise a 39-min "browsed a topic" entry inflates
  // engagement.
  it('[BUG-902] renders ACTIVE-time duration in preference to wall-clock', async () => {
    // 5-min active session that the user "left open" for 30 minutes
    setRoutes(
      makeSession({
        durationSeconds: 5 * 60,
        wallClockSeconds: 30 * 60,
        displaySummary: null,
      }),
    );

    const { cleanup } = renderSessionDetail();

    // 5 min (active) — not 30 min (wall-clock) — must be shown. This file's
    // react-i18next mock echoes the key + opts, so the duration count (5 vs 30)
    // proves which source was used.
    await waitFor(() => screen.getByText('time.duration.minutes:{"count":5}'));
    expect(screen.queryByText('time.duration.minutes:{"count":30}')).toBeNull();

    cleanup();
  });

  // BUG-902 break test: when active time is missing, fall back to wall-clock
  // so legacy rows still render a duration instead of "—".
  it('[BUG-902] falls back to wall-clock duration when active time is null', async () => {
    setRoutes(
      makeSession({
        durationSeconds: null,
        wallClockSeconds: 12 * 60,
        displaySummary: null,
      }),
    );

    const { cleanup } = renderSessionDetail();

    await waitFor(() => screen.getByText('time.duration.minutes:{"count":12}'));

    cleanup();
  });

  it('shows homework summary when present', async () => {
    setRoutes(
      makeSession({
        displayTitle: 'Math Homework',
        homeworkSummary: {
          problemCount: 3,
          practicedSkills: ['fraction simplification'],
          independentProblemCount: 1,
          guidedProblemCount: 2,
          displayTitle: 'Math Homework',
          summary: 'Walked through fraction simplification step by step',
        },
        displaySummary: 'Helped with fractions',
      }),
    );

    const { cleanup } = renderSessionDetail();

    await waitFor(() => screen.getByText('Helped with fractions'));
    expect(
      screen.getByText('Walked through fraction simplification step by step'),
    ).toBeTruthy();

    cleanup();
  });

  it('shows session-not-found when session is missing', async () => {
    setRoutes(null);

    const { cleanup } = renderSessionDetail();

    await waitFor(() => screen.getByTestId('session-not-found'));

    cleanup();
  });

  it('does NOT render transcript exchanges', async () => {
    setRoutes(makeSession());

    const { cleanup } = renderSessionDetail();

    await waitFor(() => screen.getByTestId('session-metadata'));
    expect(screen.queryByTestId('transcript-exchange')).toBeNull();

    cleanup();
  });

  it('shows copy feedback when the conversation prompt is copied', async () => {
    setRoutes(
      makeSession({
        narrative: 'They worked through a short recap.',
        conversationPrompt: 'Can you teach this back to me?',
      }),
    );

    const { cleanup } = renderSessionDetail();

    fireEvent.press(
      await waitFor(() => screen.getByTestId('session-recap-copy-prompt')),
    );

    await waitFor(() => screen.getByTestId('session-recap-copy-prompt-toast'));
    expect(Clipboard.setStringAsync).toHaveBeenCalledWith(
      'Can you teach this back to me?',
    );

    cleanup();
  });
});
