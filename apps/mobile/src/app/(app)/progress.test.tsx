import { createElement, type ReactElement, type ReactNode } from 'react';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useFocusEffect } from 'expo-router';
import type { Profile } from '@eduagent/schemas';
import {
  createRoutedMockFetch,
  fetchCallsMatching,
  type RoutedMockFetch,
} from '../../test-utils/mock-api-routes';
import { ProfileContext, type ProfileContextValue } from '../../lib/profile';
import { AppContextProvider } from '../../lib/app-context';
import { createTestProfile } from '../../test-utils/app-hook-test-utils';
import { getSubjectTintMap } from '../../lib/subject-tints';
import ProgressScreen from './progress/index';

// ─── Boundary mocks (external/native runtime only) ──────────────────────
//
// Everything else now runs for real against the routed mock fetch installed
// by the local `renderProgress` harness (QueryClientProvider + real
// ProfileContext + real AppContextProvider). The progress / subjects /
// active-profile-role / navigation-contract / app-context hooks all execute
// against the routed fetch, exactly as in production. Clerk, Sentry,
// @expo/vector-icons, expo-secure-store, reanimated, etc. are globally mocked
// in src/test-setup.ts and need no per-file mock here.

// react-i18next resolves real en.json strings (what users actually see).
jest.mock(
  'react-i18next' /* gc1-allow: i18n boundary — returns en.json strings */,
  () => require('../../test-utils/mock-i18n').i18nMock,
);

// expo-router needs a native navigation container that JSDOM can't provide.
// We expose a router push spy plus the search-param + focus-effect surface the
// screen reads. `mockSearchParams` is reassigned per-test before render.
let mockSearchParams: { profileId?: string | string[] } = {};
const mockPush = jest.fn();
jest.mock(
  'expo-router' /* gc1-allow: native-boundary — no navigation container in JSDOM */,
  () => {
    const ReactReq = jest.requireActual<typeof import('react')>('react');
    return {
      useFocusEffect: jest.fn((callback: () => void) => {
        ReactReq.useEffect(() => callback(), [callback]);
      }),
      useLocalSearchParams: () => mockSearchParams,
      useRouter: () => ({
        push: mockPush,
        back: jest.fn(),
        replace: jest.fn(),
      }),
    };
  },
);

jest.mock(
  'react-native-safe-area-context' /* gc1-allow: native module that requires device/simulator to resolve insets */,
  () => ({
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  }),
);

// ─── Local render harness ───────────────────────────────────────────────
//
// Mirrors test-utils/screen-render.renderScreen but additionally exposes
// `isExplicitProxyMode` so the parent-proxy (impersonated-child) paths can be
// exercised with the REAL useParentProxy + useActiveProfileRole hooks. No
// internal hook/service is mocked.

interface RenderProgressOptions {
  profile?: Profile;
  profiles?: Profile[];
  isExplicitProxyMode?: boolean;
  routes?: Parameters<typeof createRoutedMockFetch>[0];
}

interface RenderProgressResult {
  result: ReturnType<typeof render>;
  routedFetch: RoutedMockFetch;
  cleanup: () => void;
}

function renderProgress(
  ui: ReactElement,
  opts: RenderProgressOptions = {},
): RenderProgressResult {
  const activeProfile = opts.profile ?? createTestProfile({ isOwner: true });
  const profiles = opts.profiles ?? [activeProfile];
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false, gcTime: 0 },
    },
  });
  const routedFetch = createRoutedMockFetch(opts.routes);
  const prevFetch = globalThis.fetch;
  (globalThis as unknown as { fetch: typeof fetch }).fetch =
    routedFetch as unknown as typeof fetch;

  const profileContextValue: ProfileContextValue = {
    profiles,
    activeProfile,
    isExplicitProxyMode: opts.isExplicitProxyMode ?? false,
    switchProfile: async () => ({ success: true }),
    isLoading: false,
    profileLoadError: null,
    profileWasRemoved: false,
    acknowledgeProfileRemoval: () => undefined,
  };

  function Wrapper({ children }: { children: ReactNode }) {
    return createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(
        ProfileContext.Provider,
        { value: profileContextValue },
        createElement(AppContextProvider, null, children),
      ),
    );
  }

  const result = render(ui, { wrapper: Wrapper });

  function cleanup() {
    void queryClient.cancelQueries();
    queryClient.clear();
    (globalThis as unknown as { fetch: typeof fetch }).fetch = prevFetch;
  }

  return { result, routedFetch, cleanup };
}

// ─── Stable UUID fixtures (schemas require UUIDs on ids) ─────────────────

const OWNER_ID = '11111111-1111-4111-8111-111111111111';
const CHILD_ID = '22222222-2222-4222-8222-222222222222';
const SESSION_1 = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
const SESSION_2 = 'aaaaaaaa-2222-4222-8222-aaaaaaaaaaaa';
const SUBJECT_UUID_1 = 'bbbbbbbb-1111-4111-8111-bbbbbbbbbbbb';
const SUBJECT_UUID_2 = 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb';
const SUBJECT_UUID_3 = 'bbbbbbbb-3333-4333-8333-bbbbbbbbbbbb';
const SUBJECT_UUID_4 = 'bbbbbbbb-4444-4444-8444-bbbbbbbbbbbb';
const TOPIC_UUID_1 = 'cccccccc-1111-4111-8111-cccccccccccc';
const WEEKLY_REPORT_ID = 'dddddddd-1111-4111-8111-dddddddddddd';
const MONTHLY_REPORT_ID = 'eeeeeeee-1111-4111-8111-eeeeeeeeeeee';
const SNAPSHOT_DATE = '2026-02-15';

type InventoryGlobal = {
  topicsAttempted: number;
  topicsMastered: number;
  vocabularyTotal: number;
  vocabularyMastered: number;
  weeklyDeltaTopicsMastered: number | null;
  weeklyDeltaVocabularyTotal: number | null;
  weeklyDeltaTopicsExplored: number | null;
  totalSessions: number;
  totalActiveMinutes: number;
  totalWallClockMinutes: number;
  currentStreak: number;
  longestStreak: number;
};

const baseGlobal: InventoryGlobal = {
  topicsAttempted: 0,
  topicsMastered: 0,
  vocabularyTotal: 0,
  vocabularyMastered: 0,
  weeklyDeltaTopicsMastered: null,
  weeklyDeltaVocabularyTotal: null,
  weeklyDeltaTopicsExplored: null,
  totalSessions: 0,
  totalActiveMinutes: 0,
  totalWallClockMinutes: 0,
  currentStreak: 0,
  longestStreak: 0,
};

type InventoryFixture = {
  global: InventoryGlobal;
  subjects: unknown[];
  currentlyWorkingOn?: string[];
  thisWeekMini?: {
    sessions: number;
    wordsLearned: number;
    topicsTouched: number;
  };
};

const fullSubject = {
  subjectId: SUBJECT_UUID_1,
  subjectName: 'Math',
  pedagogyMode: 'socratic',
  topics: {
    total: 10,
    explored: 5,
    mastered: 3,
    inProgress: 2,
    notStarted: 5,
  },
  vocabulary: {
    total: 0,
    mastered: 0,
    learning: 0,
    new: 0,
    byCefrLevel: {},
  },
  estimatedProficiency: null,
  estimatedProficiencyLabel: null,
  lastSessionAt: null,
  activeMinutes: 30,
  sessionsCount: 5,
};

function makeInventoryResponse(
  inventory: InventoryFixture | undefined,
  profileId: string,
) {
  return {
    profileId,
    snapshotDate: SNAPSHOT_DATE,
    ...(inventory ?? {
      global: baseGlobal,
      subjects: [],
      currentlyWorkingOn: [],
    }),
  };
}

function makeRefreshResponse(inventory: InventoryFixture | undefined) {
  const global = inventory?.global ?? baseGlobal;
  return {
    snapshotDate: SNAPSHOT_DATE,
    metrics: {
      totalSessions: global.totalSessions,
      totalActiveMinutes: global.totalActiveMinutes,
      totalWallClockMinutes: global.totalWallClockMinutes,
      totalExchanges: 0,
      topicsAttempted: global.topicsAttempted,
      topicsMastered: global.topicsMastered,
      topicsInProgress: 0,
      booksCompleted: 0,
      vocabularyTotal: global.vocabularyTotal,
      vocabularyMastered: global.vocabularyMastered,
      vocabularyLearning: 0,
      vocabularyNew: 0,
      retentionCardsDue: 0,
      retentionCardsStrong: 0,
      retentionCardsFading: 0,
      currentStreak: global.currentStreak,
      longestStreak: global.longestStreak,
      subjects: [],
    },
    milestones: [],
  };
}

function makeSubjectListItem(subject: {
  id: string;
  name: string;
  status: string;
}) {
  return {
    id: subject.id,
    profileId: OWNER_ID,
    name: subject.name,
    rawInput: null,
    status: subject.status,
    curriculumStatus: 'ready',
    pedagogyMode: 'socratic',
    languageCode: null,
    createdAt: `${SNAPSHOT_DATE}T09:00:00.000Z`,
    updatedAt: `${SNAPSHOT_DATE}T09:00:00.000Z`,
  };
}

function makeOwner(overrides?: Partial<Profile>): Profile {
  return createTestProfile({
    id: OWNER_ID,
    accountId: 'account-1',
    displayName: 'Test Learner',
    isOwner: true,
    birthYear: 1985,
    ...overrides,
  });
}

function makeLinkedChild(overrides?: Partial<Profile>): Profile {
  return createTestProfile({
    id: CHILD_ID,
    accountId: 'account-1',
    displayName: 'Emma',
    isOwner: false,
    birthYear: 2015,
    ...overrides,
  });
}

// A schema-valid ChildSession (the real useProfileSessions runs zod parse).
function makeSession(overrides?: Record<string, unknown>) {
  return {
    sessionId: SESSION_1,
    subjectId: SUBJECT_UUID_1,
    subjectName: 'Math',
    topicId: null,
    topicTitle: null,
    sessionType: 'learning',
    startedAt: new Date().toISOString(),
    endedAt: null,
    exchangeCount: 1,
    escalationRung: 1,
    durationSeconds: 60,
    wallClockSeconds: 60,
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

// Relative timestamps keep "recent" sessions inside the 14-day
// isProfileStale window regardless of when the suite runs. Absolute dates
// here previously aged out, flipping the self view to the stale/empty state
// and hiding the Recent sessions surface. SESSION_1 stays newer than SESSION_2.
const RECENT_SESSION_AT = new Date(Date.now() - 2 * 86_400_000).toISOString();
const OLDER_SESSION_AT = new Date(Date.now() - 3 * 86_400_000).toISOString();

interface BuildRoutesOptions {
  inventory?: InventoryFixture;
  childInventory?: InventoryFixture;
  childSummary?: unknown;
  childId?: string;
  sessions?: unknown[];
  monthlyReports?: unknown[];
  weeklyReports?: unknown[];
  practiceActivityCount?: number;
  subjects?: Array<{ id: string; name: string; status: string }>;
}

// Build the routes map the real progress hooks hit. Self endpoints live under
// /progress/*; child endpoints under /dashboard/children/<id>/*. Patterns are
// full enough that the routed mock's includes() match is unambiguous.
function buildRoutes(opts: BuildRoutesOptions = {}) {
  const childId = opts.childId ?? CHILD_ID;
  // Mirror the production fallback: when sessions aren't explicitly provided,
  // surface one session for an inventory that reports sessions (otherwise an
  // empty array drives sessionCount to 0, which isProfileStale treats as
  // empty). Matches the screen's own data shape, not a weakened stub.
  const selfSessions =
    opts.sessions ??
    (opts.inventory && opts.inventory.global.totalSessions > 0
      ? [makeSession()]
      : []);

  const routes: Record<string, unknown> = {
    // Self-view endpoints
    '/progress/inventory': makeInventoryResponse(opts.inventory, OWNER_ID),
    '/progress/overview': {
      subjects: [],
      totalTopicsCompleted: opts.inventory?.global.topicsMastered ?? 0,
      totalTopicsVerified: 0,
      totalTopicsMastered: opts.inventory?.global.topicsMastered ?? 0,
      totalTopicsLearning: 0,
      practiceActivityCount: opts.practiceActivityCount ?? 0,
    },
    '/progress/sessions': { sessions: selfSessions },
    '/progress/weekly-reports': { reports: opts.weeklyReports ?? [] },
    '/progress/reports': { reports: opts.monthlyReports ?? [] },
    '/progress/resume-target': { target: null },
    '/progress/refresh': makeRefreshResponse(opts.inventory),
    '/subjects': { subjects: opts.subjects?.map(makeSubjectListItem) ?? [] },
    // Child-view endpoints (parent viewing a linked child)
    [`/children/${childId}/inventory`]: {
      inventory: opts.childInventory
        ? makeInventoryResponse(opts.childInventory, childId)
        : null,
    },
    [`/children/${childId}/progress-summary`]: opts.childSummary ?? {
      summary: null,
      generatedAt: null,
      basedOnLastSessionAt: null,
      latestSessionId: null,
      activityState: 'no_recent_activity',
      nudgeRecommended: false,
    },
    [`/children/${childId}/sessions`]: { sessions: opts.sessions ?? [] },
    [`/children/${childId}/weekly-reports`]: {
      reports: opts.weeklyReports ?? [],
    },
    [`/children/${childId}/reports`]: { reports: opts.monthlyReports ?? [] },
  };

  return routes;
}

describe('ProgressScreen — progressive disclosure', () => {
  let active: RenderProgressResult | null = null;

  function mount(opts: RenderProgressOptions): RenderProgressResult {
    active = renderProgress(<ProgressScreen />, opts);
    return active;
  }

  beforeEach(() => {
    mockSearchParams = {};
  });

  afterEach(() => {
    if (active) active.cleanup();
    active = null;
    jest.clearAllMocks();
  });

  it('shows full progress view when totalSessions < 4', async () => {
    mount({
      profile: makeOwner(),
      routes: buildRoutes({
        inventory: {
          global: { ...baseGlobal, totalSessions: 2 },
          subjects: [fullSubject],
        },
      }),
    });

    await waitFor(() => {
      screen.getByText('2 sessions completed');
    });
    expect(screen.queryByTestId('progress-new-learner-teaser')).toBeNull();
  });

  it('refreshes progress data when the mounted progress tab is focused again', async () => {
    const { routedFetch } = mount({
      profile: makeOwner(),
      routes: buildRoutes({
        inventory: {
          global: { ...baseGlobal, totalSessions: 2 },
          subjects: [fullSubject],
        },
      }),
    });

    await waitFor(() => {
      screen.getByText('2 sessions completed');
    });

    const inventoryCallsBefore = fetchCallsMatching(
      routedFetch,
      '/progress/inventory',
    ).length;

    const focusCallback = (useFocusEffect as jest.Mock).mock.calls.at(
      -1,
    )?.[0] as () => void;
    act(() => {
      focusCallback();
    });

    await waitFor(() => {
      expect(
        fetchCallsMatching(routedFetch, '/progress/inventory').length,
      ).toBeGreaterThan(inventoryCallsBefore);
    });
    // Focus refresh re-hits the snapshot + sessions + reports endpoints.
    expect(
      fetchCallsMatching(routedFetch, '/progress/refresh').length,
    ).toBeGreaterThan(0);
    expect(
      fetchCallsMatching(routedFetch, '/progress/sessions').length,
    ).toBeGreaterThan(0);
    expect(
      fetchCallsMatching(routedFetch, '/progress/reports').length,
    ).toBeGreaterThan(0);
    expect(
      fetchCallsMatching(routedFetch, '/progress/weekly-reports').length,
    ).toBeGreaterThan(0);
  });

  it('keeps the focus refresh callback stable across render updates', async () => {
    const view = mount({
      profile: makeOwner(),
      routes: buildRoutes({
        inventory: {
          global: { ...baseGlobal, totalSessions: 2 },
          subjects: [fullSubject],
        },
      }),
    });

    await waitFor(() => {
      screen.getByText('2 sessions completed');
    });

    const initialCallback = (useFocusEffect as jest.Mock).mock.calls.at(
      -1,
    )?.[0];
    view.result.rerender(<ProgressScreen />);

    expect((useFocusEffect as jest.Mock).mock.calls.at(-1)?.[0]).toBe(
      initialCallback,
    );
  });

  it('shows full progress view when totalSessions >= 4', async () => {
    mount({
      profile: makeOwner(),
      routes: buildRoutes({
        inventory: {
          global: { ...baseGlobal, totalSessions: 5, topicsMastered: 3 },
          subjects: [fullSubject],
        },
      }),
    });

    // heroCopy: 5 sessions + low mastery (3 topics, 0 vocab) → leads with sessions
    await waitFor(() => {
      screen.getByText('5 sessions completed');
    });
    expect(screen.queryByTestId('progress-new-learner-teaser')).toBeNull();
  });

  it('renders latest report from the weekly report summary without detail fetches', async () => {
    mount({
      profile: makeOwner(),
      routes: buildRoutes({
        inventory: {
          global: { ...baseGlobal, totalSessions: 5, topicsMastered: 2 },
          subjects: [fullSubject],
        },
        weeklyReports: [
          {
            id: WEEKLY_REPORT_ID,
            reportWeek: '2026-05-11',
            viewedAt: null,
            createdAt: '2026-05-17T00:00:00Z',
            headlineStat: {
              label: 'topics mastered',
              value: 2,
              comparison: '+2 this week',
            },
            thisWeek: {
              totalSessions: 4,
              totalActiveMinutes: 95,
              topicsMastered: 2,
              topicsExplored: 6,
              vocabularyTotal: 12,
              streakBest: 3,
            },
            practiceSummary: {
              quizzesCompleted: 0,
              reviewsCompleted: 0,
              totals: {
                activitiesCompleted: 3,
                reviewsCompleted: 1,
                pointsEarned: 45,
                celebrations: 0,
                distinctActivityTypes: 2,
              },
              scores: {
                scoredActivities: 0,
                score: 0,
                total: 0,
                accuracy: null,
              },
              byType: [],
              bySubject: [],
            },
          },
        ],
      }),
    });

    await waitFor(() => {
      screen.getByTestId('progress-latest-report-card');
    });
    screen.getByText('Latest report');
    screen.getByText('2 topics mastered');
    expect(screen.getAllByText('+2 this week').length).toBeGreaterThan(0);
    screen.getByText('1h 35m');
    screen.getByText('3 practice lessons');
    screen.getByText('45 practice points');
  });

  it('opens the latest report card even when a legacy summary has no metrics', async () => {
    mount({
      profile: makeOwner(),
      routes: buildRoutes({
        inventory: {
          global: { ...baseGlobal, totalSessions: 5, topicsMastered: 2 },
          subjects: [fullSubject],
        },
        weeklyReports: [
          {
            id: WEEKLY_REPORT_ID,
            reportWeek: '2026-05-11',
            viewedAt: null,
            createdAt: '2026-05-17T00:00:00Z',
            headlineStat: {
              label: 'sessions this week',
              value: 4,
              comparison: 'steady rhythm',
            },
          },
        ],
      }),
    });

    await waitFor(() => {
      screen.getByTestId('progress-latest-report-card');
    });
    screen.getByText('4 sessions this week');
    expect(screen.getAllByText('steady rhythm').length).toBeGreaterThan(0);
    expect(screen.queryByTestId('progress-latest-report-empty')).toBeNull();
  });

  it('falls back to monthly report summary when no weekly report exists', async () => {
    mount({
      profile: makeOwner(),
      routes: buildRoutes({
        inventory: {
          global: { ...baseGlobal, totalSessions: 5, topicsMastered: 2 },
          subjects: [fullSubject],
        },
        monthlyReports: [
          {
            id: MONTHLY_REPORT_ID,
            reportMonth: '2026-05',
            viewedAt: null,
            createdAt: '2026-06-01T00:00:00Z',
            headlineStat: {
              label: 'sessions completed',
              value: 8,
              comparison: '+3 from last month',
            },
            highlights: [],
            nextSteps: [],
            thisMonth: {
              totalSessions: 8,
              totalActiveMinutes: 120,
              topicsMastered: 3,
              topicsExplored: 9,
              vocabularyTotal: 20,
              streakBest: 4,
            },
          },
        ],
      }),
    });

    await waitFor(() => {
      screen.getByTestId('progress-latest-report-card');
    });
    screen.getByText('8 sessions completed');
    expect(screen.getAllByText('+3 from last month').length).toBeGreaterThan(0);
  });

  it('shows recent sessions and expands to the reused session list', async () => {
    mount({
      profile: makeOwner(),
      routes: buildRoutes({
        inventory: {
          global: { ...baseGlobal, totalSessions: 5, topicsMastered: 2 },
          subjects: [fullSubject],
        },
        sessions: [
          makeSession({
            sessionId: SESSION_1,
            subjectId: SUBJECT_UUID_1,
            subjectName: 'Math',
            topicId: TOPIC_UUID_1,
            topicTitle: 'Fractions',
            startedAt: RECENT_SESSION_AT,
            exchangeCount: 3,
            durationSeconds: 600,
            wallClockSeconds: 600,
            displaySummary: 'Practiced comparing fractions.',
          }),
          makeSession({
            sessionId: SESSION_2,
            subjectId: SUBJECT_UUID_2,
            subjectName: 'Biology',
            startedAt: OLDER_SESSION_AT,
            exchangeCount: 2,
            durationSeconds: 300,
            wallClockSeconds: 300,
            highlight: 'Talked through cells.',
          }),
        ],
      }),
    });

    await waitFor(() => {
      screen.getByText('Recent sessions');
    });
    screen.getByText('Fractions');
    screen.getByText('Practiced comparing fractions.');
    screen.getByText('Biology');
    expect(screen.queryByTestId('recent-sessions-list')).toBeNull();

    fireEvent.press(screen.getByTestId('progress-show-all-sessions'));

    screen.getByTestId('recent-sessions-list');
    screen.getByTestId(`session-card-${SESSION_1}`);
  });

  it('opens proxy recent sessions in the child-safe detail screen', async () => {
    mount({
      profile: makeLinkedChild({ id: CHILD_ID, displayName: 'Lilly' }),
      profiles: [
        makeOwner(),
        makeLinkedChild({ id: CHILD_ID, displayName: 'Lilly' }),
      ],
      isExplicitProxyMode: true,
      routes: buildRoutes({
        inventory: {
          global: { ...baseGlobal, totalSessions: 3, totalActiveMinutes: 12 },
          subjects: [fullSubject],
          currentlyWorkingOn: [],
        },
        sessions: [
          makeSession({
            sessionId: SESSION_1,
            subjectId: SUBJECT_UUID_1,
            subjectName: 'Math',
            topicId: TOPIC_UUID_1,
            topicTitle: 'Fractions',
            startedAt: RECENT_SESSION_AT,
            exchangeCount: 3,
            durationSeconds: 600,
            wallClockSeconds: 600,
            displaySummary: 'Practiced comparing fractions.',
          }),
        ],
      }),
    });

    await waitFor(() => {
      screen.getByText('Recent sessions');
    });

    fireEvent.press(screen.getByTestId('progress-show-all-sessions'));
    fireEvent.press(screen.getByTestId(`session-card-${SESSION_1}`));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/child/[profileId]/session/[sessionId]',
      params: { profileId: CHILD_ID, sessionId: SESSION_1 },
    });
  });

  it('renders empty latest report and recent focus states without duplicate surfaces', async () => {
    mockSearchParams = { profileId: CHILD_ID };
    mount({
      profile: makeOwner(),
      profiles: [makeOwner(), makeLinkedChild()],
      routes: buildRoutes({
        inventory: {
          global: { ...baseGlobal, totalSessions: 5, topicsMastered: 3 },
          subjects: [fullSubject],
          currentlyWorkingOn: [],
        },
        childInventory: {
          global: { ...baseGlobal, totalSessions: 5, topicsMastered: 3 },
          subjects: [fullSubject],
          currentlyWorkingOn: [],
        },
        sessions: [],
      }),
    });

    await waitFor(() => {
      screen.getByTestId('progress-latest-report-empty');
    });
    screen.getByText(
      'Recent sessions will appear here once learning gets going.',
    );
    expect(
      screen.queryByTestId('progress-weekly-delta-topicsMastered'),
    ).toBeNull();
    expect(screen.queryByTestId('progress-currently-working-on')).toBeNull();
  });

  it('keeps the reports dashboard reachable when no reports exist', async () => {
    mount({
      profile: makeOwner(),
      routes: buildRoutes({
        inventory: {
          global: { ...baseGlobal, totalSessions: 5, topicsMastered: 2 },
          subjects: [fullSubject],
        },
      }),
    });

    await waitFor(() => {
      screen.getByTestId('progress-view-all-reports');
    });

    fireEvent.press(screen.getByTestId('progress-view-all-reports'));
    expect(mockPush).toHaveBeenCalledWith('/(app)/progress/reports');
  });

  it('shows full view when totalSessions is 3', async () => {
    mount({
      profile: makeOwner(),
      routes: buildRoutes({
        inventory: {
          global: { ...baseGlobal, totalSessions: 3 },
          subjects: [fullSubject],
        },
      }),
    });

    await waitFor(() => {
      screen.getByText('3 sessions completed');
    });
    expect(screen.queryByTestId('progress-new-learner-teaser')).toBeNull();
  });

  // [BUG-816] Stale returning user (1–2 sessions, last > 14 days ago) must NOT
  // see the new-user empty state — they should see 'awaiting' (no report yet),
  // not the first-timer "Progress appears after the first study session" copy.
  // Root cause: progressSurfaceState previously included `(isViewingSelf && isStale)`
  // in the 'empty' condition, mapping stale learners to the wrong copy.
  it('stale returning user with sessions does not see new-user empty copy [BUG-816]', async () => {
    const staleSessionAt = new Date(Date.now() - 20 * 86_400_000).toISOString(); // 20 days ago → isProfileStale
    mount({
      profile: makeOwner(),
      routes: buildRoutes({
        inventory: {
          global: { ...baseGlobal, totalSessions: 1, topicsMastered: 2 },
          subjects: [fullSubject],
        },
        sessions: [
          makeSession({ sessionId: 'old-session', startedAt: staleSessionAt }),
        ],
      }),
    });

    // Must NOT show the new-user empty copy
    await waitFor(() => {
      expect(
        screen.queryByText('Progress appears after the first study session'),
      ).toBeNull();
    });
    expect(screen.queryByTestId('progress-start-learning')).toBeNull();
  });

  it('shows empty state (not teaser) when totalSessions is 0 and no subjects', async () => {
    mount({
      profile: makeOwner(),
      routes: buildRoutes({
        inventory: {
          global: { ...baseGlobal, totalSessions: 0 },
          subjects: [],
        },
      }),
    });

    await waitFor(() => {
      screen.getByTestId('progress-start-learning');
    });
    expect(screen.queryByTestId('progress-new-learner-teaser')).toBeNull();
  });

  it('keeps overall empty progress global while opening the first active subject', async () => {
    mount({
      profile: makeOwner(),
      routes: buildRoutes({
        inventory: {
          global: { ...baseGlobal, totalSessions: 0 },
          subjects: [],
        },
        subjects: [{ id: SUBJECT_UUID_3, name: 'Italian', status: 'active' }],
      }),
    });

    await waitFor(() => {
      screen.getByText('Progress appears after the first study session');
    });
    screen.getByText(
      'Sessions, mastery, reviews, and reports will appear here once there is something to measure.',
    );
    expect(
      screen.queryByText('Progress unlocks after you study Italian'),
    ).toBeNull();
    fireEvent.press(screen.getByTestId('progress-start-learning'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/shelf/[subjectId]',
      params: { subjectId: SUBJECT_UUID_3 },
    });
  });

  it('uses child-facing title and routes to child curriculum in proxy progress mode [B-600]', async () => {
    mount({
      profile: makeLinkedChild({ id: CHILD_ID, displayName: 'Lilly' }),
      profiles: [
        makeOwner(),
        makeLinkedChild({ id: CHILD_ID, displayName: 'Lilly' }),
      ],
      isExplicitProxyMode: true,
      routes: buildRoutes({
        inventory: {
          global: { ...baseGlobal, totalSessions: 0 },
          subjects: [],
        },
        subjects: [
          { id: SUBJECT_UUID_4, name: 'Programming', status: 'active' },
        ],
      }),
    });

    await waitFor(() => {
      screen.getByText("Lilly's progress");
    });
    screen.getByText('Progress appears after the first study session');
    expect(screen.queryByText(/Programming/)).toBeNull();
    // [B-600] Parent-proxy must NOT see the adult Study Library CTA
    expect(screen.queryByText('Library')).toBeNull();
    // [B-600] Must show child-curriculum CTA label
    screen.getByText('Open child curriculum');

    fireEvent.press(screen.getByTestId('progress-start-learning'));
    // [B-600] Must route to child curriculum, never to adult library
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/child/[profileId]/curriculum',
      params: { profileId: CHILD_ID },
    });
    expect(mockPush).not.toHaveBeenCalledWith('/(app)/library');
  });

  it('keeps Lilly report visible in proxy mode even when inventory is empty', async () => {
    const { routedFetch } = mount({
      profile: makeLinkedChild({ id: CHILD_ID, displayName: 'Lilly' }),
      profiles: [
        makeOwner(),
        makeLinkedChild({ id: CHILD_ID, displayName: 'Lilly' }),
      ],
      isExplicitProxyMode: true,
      routes: buildRoutes({
        inventory: {
          global: { ...baseGlobal, totalSessions: 0 },
          subjects: [],
        },
        weeklyReports: [
          {
            id: WEEKLY_REPORT_ID,
            reportWeek: '2026-05-11',
            viewedAt: null,
            createdAt: '2026-05-17T00:00:00Z',
            headlineStat: {
              label: 'topics mastered',
              value: 2,
              comparison: '+2 this week',
            },
            thisWeek: {
              totalSessions: 4,
              totalActiveMinutes: 95,
              topicsMastered: 2,
              topicsExplored: 6,
              vocabularyTotal: 12,
              streakBest: 3,
            },
          },
        ],
      }),
    });

    await waitFor(() => {
      screen.getByTestId('progress-latest-report-card');
    });
    screen.getByText("Lilly's progress");
    screen.getByText('2 topics mastered');
    expect(
      screen.queryByText('Progress appears after the first study session'),
    ).toBeNull();
    // The active child's own weekly reports are fetched via the self endpoint
    // (selectedProfileId === activeProfile.id in proxy mode).
    expect(
      fetchCallsMatching(routedFetch, '/progress/weekly-reports').length,
    ).toBeGreaterThan(0);
  });

  it('opens the requested child progress profile from route params', async () => {
    mockSearchParams = { profileId: CHILD_ID };
    const { routedFetch } = mount({
      profile: makeOwner(),
      profiles: [makeOwner(), makeLinkedChild()],
      routes: buildRoutes({
        inventory: {
          global: { ...baseGlobal, totalSessions: 0 },
          subjects: [],
        },
        childInventory: {
          global: { ...baseGlobal, totalSessions: 6, topicsMastered: 2 },
          subjects: [fullSubject],
        },
      }),
    });

    await waitFor(() => {
      screen.getByTestId(`progress-pill-${CHILD_ID}`);
    });
    // Child inventory endpoint fetched only when enabled for the selected child.
    await waitFor(() => {
      expect(
        fetchCallsMatching(routedFetch, `/children/${CHILD_ID}/inventory`)
          .length,
      ).toBeGreaterThan(0);
    });
  });

  // [LEARN-21 / Notion #603] Regression: child-scoped vocab chip must NOT
  // route to the adult-scoped vocabulary browser.
  it('hides the tappable vocabulary chip when viewing a linked child [LEARN-21]', async () => {
    mockSearchParams = { profileId: CHILD_ID };
    const languageSubject = {
      ...fullSubject,
      subjectId: SUBJECT_UUID_3,
      subjectName: 'Spanish',
      pedagogyMode: 'four_strands',
      vocabulary: {
        total: 42,
        mastered: 20,
        learning: 15,
        new: 7,
        byCefrLevel: { A1: 30, A2: 12 },
      },
    };
    mount({
      profile: makeOwner(),
      profiles: [makeOwner(), makeLinkedChild()],
      routes: buildRoutes({
        inventory: {
          global: { ...baseGlobal, totalSessions: 10, vocabularyTotal: 8 },
          subjects: [languageSubject],
        },
        childInventory: {
          global: { ...baseGlobal, totalSessions: 6, vocabularyTotal: 42 },
          subjects: [languageSubject],
        },
      }),
    });

    await waitFor(() => {
      screen.getByTestId('progress-vocab-stat-readonly');
    });
    expect(screen.queryByTestId('progress-vocab-stat')).toBeNull();
  });

  it('shows the tappable vocabulary chip when viewing self [LEARN-21 pair]', async () => {
    const languageSubject = {
      ...fullSubject,
      subjectId: SUBJECT_UUID_3,
      subjectName: 'Spanish',
      pedagogyMode: 'four_strands',
      vocabulary: {
        total: 18,
        mastered: 10,
        learning: 5,
        new: 3,
        byCefrLevel: { A1: 12, A2: 6 },
      },
    };
    mount({
      profile: makeOwner(),
      routes: buildRoutes({
        inventory: {
          global: { ...baseGlobal, totalSessions: 10, vocabularyTotal: 18 },
          subjects: [languageSubject],
        },
      }),
    });

    await waitFor(() => {
      screen.getByTestId('progress-vocab-stat');
    });
    expect(screen.queryByTestId('progress-vocab-stat-readonly')).toBeNull();
  });

  it('defaults the bottom progress tab to the parent profile even when children exist', async () => {
    const { routedFetch } = mount({
      profile: makeOwner(),
      profiles: [makeOwner(), makeLinkedChild()],
      routes: buildRoutes({
        inventory: {
          global: { ...baseGlobal, totalSessions: 2 },
          subjects: [fullSubject],
        },
        childInventory: {
          global: { ...baseGlobal, totalSessions: 6, topicsMastered: 2 },
          subjects: [fullSubject],
        },
      }),
    });

    await waitFor(() => {
      screen.getByText('My progress');
    });
    // No child selected by default → child inventory endpoint is never hit.
    expect(
      fetchCallsMatching(routedFetch, `/children/${CHILD_ID}/inventory`).length,
    ).toBe(0);
  });

  it('keeps linked child pills selectable in the 5-tab legacy fallback', async () => {
    const { routedFetch } = mount({
      profile: makeOwner(),
      profiles: [makeOwner(), makeLinkedChild()],
      routes: buildRoutes({
        inventory: {
          global: { ...baseGlobal, totalSessions: 2 },
          subjects: [fullSubject],
        },
        childInventory: {
          global: { ...baseGlobal, totalSessions: 6, topicsMastered: 2 },
          subjects: [fullSubject],
        },
      }),
    });

    await waitFor(() => {
      screen.getByText('My progress');
    });
    fireEvent.press(screen.getByTestId(`progress-pill-${CHILD_ID}`));

    await waitFor(() => {
      screen.getByText("Emma's progress");
      screen.getByText('6 sessions');
    });
    expect(
      fetchCallsMatching(routedFetch, `/children/${CHILD_ID}/inventory`).length,
    ).toBeGreaterThan(0);
  });

  it('opens a valid requested child profile after child links load', async () => {
    mockSearchParams = { profileId: CHILD_ID };
    const view = mount({
      profile: makeOwner(),
      profiles: [makeOwner()],
      routes: buildRoutes({
        inventory: {
          global: { ...baseGlobal, totalSessions: 2 },
          subjects: [fullSubject],
        },
        childInventory: {
          global: { ...baseGlobal, totalSessions: 6, topicsMastered: 2 },
          subjects: [fullSubject],
        },
      }),
    });

    await waitFor(() => {
      screen.getByText('2 sessions completed');
    });

    // Re-render once the child link is known via ProfileContext.
    view.cleanup();
    active = null;
    const { routedFetch } = mount({
      profile: makeOwner(),
      profiles: [makeOwner(), makeLinkedChild()],
      routes: buildRoutes({
        inventory: {
          global: { ...baseGlobal, totalSessions: 2 },
          subjects: [fullSubject],
        },
        childInventory: {
          global: { ...baseGlobal, totalSessions: 6, topicsMastered: 2 },
          subjects: [fullSubject],
        },
      }),
    });

    await waitFor(() => {
      screen.getByTestId(`progress-pill-${CHILD_ID}`);
      screen.getByText('6 sessions');
    });
    expect(
      fetchCallsMatching(routedFetch, `/children/${CHILD_ID}/inventory`).length,
    ).toBeGreaterThan(0);
  });

  it('ignores an unknown requested child profile when no child link is known', async () => {
    mockSearchParams = { profileId: 'foreign-child' };
    const { routedFetch } = mount({
      profile: makeOwner(),
      profiles: [makeOwner()],
      routes: buildRoutes({
        inventory: {
          global: { ...baseGlobal, totalSessions: 2 },
          subjects: [fullSubject],
        },
      }),
    });

    await waitFor(() => {
      screen.getByText('2 sessions completed');
    });
    expect(
      fetchCallsMatching(routedFetch, '/children/foreign-child/inventory')
        .length,
    ).toBe(0);
  });

  it('ignores an unknown requested child profile after child links load', async () => {
    mockSearchParams = { profileId: 'foreign-child' };
    const { routedFetch } = mount({
      profile: makeOwner(),
      profiles: [makeOwner(), makeLinkedChild()],
      routes: buildRoutes({
        inventory: {
          global: { ...baseGlobal, totalSessions: 2 },
          subjects: [fullSubject],
        },
      }),
    });

    await waitFor(() => {
      screen.getByText('2 sessions completed');
    });
    // The foreign id is not a known linked child → its inventory is never hit,
    // and the linked child (CHILD_ID) is not auto-selected either.
    expect(
      fetchCallsMatching(routedFetch, '/children/foreign-child/inventory')
        .length,
    ).toBe(0);
    expect(
      fetchCallsMatching(routedFetch, `/children/${CHILD_ID}/inventory`).length,
    ).toBe(0);
  });

  it('shows full view when totalSessions is 1 with subjects', async () => {
    mount({
      profile: makeOwner(),
      routes: buildRoutes({
        inventory: {
          global: { ...baseGlobal, totalSessions: 1 },
          subjects: [fullSubject],
        },
      }),
    });

    await waitFor(() => {
      screen.getByText('1 session completed');
    });
    expect(screen.queryByTestId('progress-new-learner-teaser')).toBeNull();
  });

  it('shows full view when totalSessions is exactly 4', async () => {
    mount({
      profile: makeOwner(),
      routes: buildRoutes({
        inventory: {
          global: { ...baseGlobal, totalSessions: 4, topicsMastered: 1 },
          subjects: [fullSubject],
        },
      }),
    });

    await waitFor(() => {
      screen.getByText('My progress');
    });
    expect(screen.queryByTestId('progress-new-learner-teaser')).toBeNull();
  });

  it('uses child register copy for child profiles', async () => {
    // A non-owner profile signed in directly resolves to role 'child'.
    mount({
      profile: makeLinkedChild({ id: CHILD_ID, displayName: 'Sam' }),
      profiles: [makeLinkedChild({ id: CHILD_ID, displayName: 'Sam' })],
      routes: buildRoutes({
        inventory: {
          global: { ...baseGlobal, totalSessions: 5, topicsMastered: 3 },
          subjects: [fullSubject],
        },
      }),
    });

    await waitFor(() => {
      screen.getByText('You learned 3 topics. Steady wins.');
    });
    screen.getByText('My progress');
    screen.getByText('Latest report');
    screen.getByText('Recent sessions');
    expect(screen.queryByText('Your growth')).toBeNull();
    expect(screen.queryByText('Weekly report')).toBeNull();
  });

  it('uses adult register copy for owner profiles', async () => {
    mount({
      profile: makeOwner(),
      routes: buildRoutes({
        inventory: {
          global: { ...baseGlobal, totalSessions: 5, topicsMastered: 3 },
          subjects: [fullSubject],
        },
        practiceActivityCount: 4,
      }),
    });

    await waitFor(() => {
      screen.getByText('My progress');
    });
    await waitFor(() => {
      screen.getByText('4 practice lessons');
    });
    screen.getByText('Latest report');
    screen.getByText('Recent sessions');
    expect(screen.queryByText('Your week')).toBeNull();
  });

  it('uses the shared subject tint map for progress subject rows', async () => {
    const biologySubject = {
      ...fullSubject,
      subjectId: SUBJECT_UUID_2,
      subjectName: 'Biology',
      topics: { ...fullSubject.topics, mastered: 1, inProgress: 1 },
      activeMinutes: 12,
      sessionsCount: 2,
    };
    mockSearchParams = { profileId: CHILD_ID };
    mount({
      profile: makeOwner(),
      profiles: [makeOwner(), makeLinkedChild()],
      routes: buildRoutes({
        inventory: {
          global: { ...baseGlobal, totalSessions: 5, topicsMastered: 4 },
          subjects: [fullSubject],
        },
        childInventory: {
          global: { ...baseGlobal, totalSessions: 5, topicsMastered: 4 },
          subjects: [fullSubject, biologySubject],
        },
        sessions: [],
      }),
    });

    const tintMap = getSubjectTintMap(
      [SUBJECT_UUID_1, SUBJECT_UUID_2],
      'light',
    );

    await waitFor(() => {
      screen.getByTestId(`progress-subject-${SUBJECT_UUID_2}-bookshelf`);
    });
    expect(
      screen.getByTestId(`progress-subject-${SUBJECT_UUID_1}-bookshelf`).props
        .style.borderColor,
    ).toBe(`${tintMap.get(SUBJECT_UUID_1)!.solid}33`);
    expect(
      screen.getByTestId(`progress-subject-${SUBJECT_UUID_2}-bookshelf`).props
        .style.borderColor,
    ).toBe(`${tintMap.get(SUBJECT_UUID_2)!.solid}33`);
    expect(tintMap.get(SUBJECT_UUID_1)?.solid).not.toBe(
      tintMap.get(SUBJECT_UUID_2)?.solid,
    );
  });

  it('does not render the recent milestones block on the progress overview', async () => {
    mount({
      profile: makeOwner(),
      routes: buildRoutes({
        inventory: {
          global: { ...baseGlobal, totalSessions: 5, topicsMastered: 1 },
          subjects: [fullSubject],
        },
      }),
    });

    await waitFor(() => {
      screen.getByText('Recent sessions');
    });
    expect(screen.queryByTestId('progress-milestones-see-all')).toBeNull();
    expect(screen.queryByTestId('milestones-teaser')).toBeNull();
  });

  it('uses current focus areas as recent focus fallback when sessions are absent', async () => {
    mockSearchParams = { profileId: CHILD_ID };
    mount({
      profile: makeOwner(),
      profiles: [makeOwner(), makeLinkedChild()],
      routes: buildRoutes({
        inventory: {
          global: { ...baseGlobal, totalSessions: 5, topicsMastered: 1 },
          subjects: [fullSubject],
          currentlyWorkingOn: ['Fractions', 'Decimals'],
        },
        childInventory: {
          global: { ...baseGlobal, totalSessions: 5, topicsMastered: 1 },
          subjects: [fullSubject],
          currentlyWorkingOn: ['Fractions', 'Decimals'],
        },
        sessions: [],
      }),
    });

    await waitFor(() => {
      screen.getByTestId('progress-recent-focus-card');
    });
    screen.getByText('Fractions');
    screen.getByText('Decimals');
    expect(screen.queryByTestId('progress-currently-working-on')).toBeNull();
  });

  it('keeps currently working on hidden when inventory has no focus areas', async () => {
    mount({
      profile: makeOwner(),
      routes: buildRoutes({
        inventory: {
          global: { ...baseGlobal, totalSessions: 5, topicsMastered: 1 },
          subjects: [fullSubject],
          currentlyWorkingOn: [],
        },
      }),
    });

    await waitFor(() => {
      screen.getByText('Recent sessions');
    });
    expect(screen.queryByTestId('progress-currently-working-on')).toBeNull();
  });

  it('does not gate when inventory is undefined (loading resolved with no data)', async () => {
    mount({
      profile: makeOwner(),
      // No inventory route value → empty object body, no subjects/global.
      routes: buildRoutes({}),
    });

    await waitFor(() => {
      // Inventory resolves to {} (no global/subjects) → neither teaser nor a
      // crash; the screen falls through without gating.
      expect(screen.queryByTestId('progress-new-learner-teaser')).toBeNull();
    });
  });

  it('uses the shared progress hub for parent viewing child with subject breakdown', async () => {
    mockSearchParams = { profileId: CHILD_ID };
    mount({
      profile: makeOwner(),
      profiles: [makeOwner(), makeLinkedChild()],
      routes: buildRoutes({
        inventory: {
          global: { ...baseGlobal, totalSessions: 5, topicsMastered: 3 },
          subjects: [fullSubject],
        },
        childInventory: {
          global: { ...baseGlobal, totalSessions: 5, topicsMastered: 3 },
          subjects: [fullSubject],
          currentlyWorkingOn: [],
        },
        practiceActivityCount: 4,
      }),
    });

    await waitFor(() => {
      screen.getByText("Emma's progress");
    });
    expect(screen.queryByText('4 practice lessons')).toBeNull();
    screen.getByTestId('progress-latest-report-section');
    screen.getByTestId('progress-recent-focus-card');
    screen.getByTestId('progress-subject-breakdown');
    screen.getByTestId(`progress-subject-${SUBJECT_UUID_1}-bookshelf`);
    screen.getByText('Subjects');
  });

  it('reuses report preview for parent viewing child when summaries exist', async () => {
    mockSearchParams = { profileId: CHILD_ID };
    mount({
      profile: makeOwner(),
      profiles: [makeOwner(), makeLinkedChild()],
      routes: buildRoutes({
        inventory: {
          global: { ...baseGlobal, totalSessions: 5, topicsMastered: 3 },
          subjects: [fullSubject],
        },
        childInventory: {
          global: { ...baseGlobal, totalSessions: 5, topicsMastered: 3 },
          subjects: [fullSubject],
          currentlyWorkingOn: [],
        },
        weeklyReports: [
          {
            id: WEEKLY_REPORT_ID,
            reportWeek: '2026-05-11',
            viewedAt: null,
            createdAt: '2026-05-17T00:00:00Z',
            headlineStat: {
              label: 'topics mastered',
              value: 1,
              comparison: '+1 this week',
            },
            thisWeek: {
              totalSessions: 2,
              totalActiveMinutes: 30,
              topicsMastered: 1,
              topicsExplored: 2,
              vocabularyTotal: 0,
              streakBest: 1,
            },
          },
        ],
      }),
    });

    await waitFor(() => {
      screen.getByTestId('reports-list-card');
    });
    expect(screen.queryByTestId('progress-weekly-report-tracker')).toBeNull();
    expect(screen.queryByTestId('progress-monthly-report-tracker')).toBeNull();
    screen.getByTestId('progress-reports-link');
  });

  it('renders progress summary freshness states for parent viewing child', async () => {
    mockSearchParams = { profileId: CHILD_ID };
    mount({
      profile: makeOwner(),
      profiles: [makeOwner(), makeLinkedChild()],
      routes: buildRoutes({
        inventory: {
          global: { ...baseGlobal, totalSessions: 5, topicsMastered: 3 },
          subjects: [fullSubject],
        },
        childInventory: {
          global: { ...baseGlobal, totalSessions: 5, topicsMastered: 3 },
          subjects: [fullSubject],
          currentlyWorkingOn: [],
        },
        childSummary: {
          summary:
            'Emma explored fractions and mastered 3 new topics this week.',
          generatedAt: '2026-05-13T10:00:00Z',
          basedOnLastSessionAt: '2026-05-10T09:00:00Z',
          latestSessionId: SESSION_1,
          activityState: 'no_recent_activity',
          nudgeRecommended: true,
        },
      }),
    });

    await waitFor(() => {
      screen.getByTestId('progress-summary-header');
    });
    screen.getByText(/Emma explored fractions/);
    screen.getByTestId('progress-summary-no-recent');
    screen.getByTestId('progress-nudge-cta');
  });

  it('renders deterministic fallback when no progress summary exists', async () => {
    mockSearchParams = { profileId: CHILD_ID };
    mount({
      profile: makeOwner(),
      profiles: [makeOwner(), makeLinkedChild()],
      routes: buildRoutes({
        inventory: {
          global: { ...baseGlobal, totalSessions: 5, topicsMastered: 3 },
          subjects: [fullSubject],
        },
        childInventory: {
          global: { ...baseGlobal, totalSessions: 5, topicsMastered: 3 },
          subjects: [fullSubject],
          currentlyWorkingOn: [],
        },
        childSummary: {
          summary: null,
          generatedAt: null,
          basedOnLastSessionAt: null,
          latestSessionId: null,
          activityState: 'no_recent_activity',
          nudgeRecommended: false,
        },
      }),
    });

    await waitFor(() => {
      screen.getByTestId('progress-summary-fallback');
    });
    expect(screen.queryByTestId('progress-summary-header')).toBeNull();
  });

  it('hides profile picker for non-owner (child on parent account)', async () => {
    // Break test: a child profile on a parent account must never see the progress
    // profile picker — it lets them toggle into a parent's (or sibling's) progress
    // view, which would expose another user's learning data. A non-owner active
    // profile with no linked children resolves to role 'child'.
    mount({
      profile: makeLinkedChild({ id: CHILD_ID, displayName: 'Sam' }),
      profiles: [makeLinkedChild({ id: CHILD_ID, displayName: 'Sam' })],
      routes: buildRoutes({
        inventory: {
          global: { ...baseGlobal, totalSessions: 5, topicsMastered: 2 },
          subjects: [fullSubject],
        },
      }),
    });

    await waitFor(() => {
      screen.getByText('My progress');
    });
    // Profile picker must not appear — non-owner should only see their own progress
    expect(screen.queryByTestId('progress-parent-pill-row')).toBeNull();
  });

  // [B-600] Family progress empty state must not route to adult Study Library
  it('shows child-curriculum CTA label in family progress empty state [B-600]', async () => {
    mockSearchParams = { profileId: CHILD_ID };
    mount({
      profile: makeOwner(),
      profiles: [makeOwner(), makeLinkedChild()],
      routes: buildRoutes({
        inventory: {
          global: { ...baseGlobal, totalSessions: 0 },
          subjects: [],
        },
        childInventory: {
          global: { ...baseGlobal, totalSessions: 0 },
          subjects: [],
        },
      }),
    });

    await waitFor(() => {
      // [B-600] Must show child-curriculum label, never adult library label
      screen.getByText('Open child curriculum');
    });
    expect(screen.queryByText('Library')).toBeNull();
    expect(screen.queryByText('Start learning')).toBeNull();
  });

  it('routes family progress empty CTA to child curriculum [B-600]', async () => {
    mockSearchParams = { profileId: CHILD_ID };
    mount({
      profile: makeOwner(),
      profiles: [makeOwner(), makeLinkedChild()],
      routes: buildRoutes({
        inventory: {
          global: { ...baseGlobal, totalSessions: 0 },
          subjects: [],
        },
        childInventory: {
          global: { ...baseGlobal, totalSessions: 0 },
          subjects: [],
        },
      }),
    });

    await waitFor(() => {
      screen.getByTestId('progress-start-learning');
    });

    fireEvent.press(screen.getByTestId('progress-start-learning'));
    // [B-600] Must route to child curriculum, never to adult library or shelf
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/child/[profileId]/curriculum',
      params: { profileId: CHILD_ID },
    });
    expect(mockPush).not.toHaveBeenCalledWith('/(app)/library');
  });

  it('solo learner empty state still routes to library when not in family mode [B-600 guard]', async () => {
    // Break test: solo learner (non-family) must still route to library unchanged.
    mount({
      profile: makeOwner({ id: 'solo-owner', displayName: 'Alex' }),
      profiles: [makeOwner({ id: 'solo-owner', displayName: 'Alex' })],
      routes: buildRoutes({
        inventory: {
          global: { ...baseGlobal, totalSessions: 0 },
          subjects: [],
        },
      }),
    });

    await waitFor(() => {
      screen.getByTestId('progress-start-learning');
    });

    fireEvent.press(screen.getByTestId('progress-start-learning'));
    expect(mockPush).toHaveBeenCalledWith('/(app)/library');
    expect(mockPush).not.toHaveBeenCalledWith(
      expect.objectContaining({
        pathname: '/(app)/child/[profileId]/curriculum',
      }),
    );
  });
});
