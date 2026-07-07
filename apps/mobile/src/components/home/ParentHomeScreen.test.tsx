import { fireEvent, waitFor } from '@testing-library/react-native';
import { Share } from 'react-native';
import type { DashboardData, Profile } from '@eduagent/schemas';
import {
  cleanupScreen,
  createTestProfile,
  renderScreen,
  type RenderScreenResult,
} from '../../test-utils/screen-render';
import { fetchCallsMatching } from '../../test-utils/mock-api-routes';

import { ParentHomeScreen } from './ParentHomeScreen';

// ─── Boundary mocks (external/native runtime only) ──────────────────────
//
// These five are true native/external boundaries the harness cannot run in
// JSDOM. Everything else (profile context, dashboard / subscription /
// notification / nudge / learner-profile hooks) now runs for real against the
// routed mock fetch supplied by `renderScreen` — see CONVERT notes below.

jest.mock(
  'react-i18next' /* gc1-allow: i18n boundary — returns en.json strings */,
  () => require('../../test-utils/mock-i18n').i18nMock,
);

jest.mock(
  'react-native-safe-area-context' /* gc1-allow: native module that requires device/simulator to resolve insets */,
  () => ({
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  }),
);

const mockPush = jest.fn();
jest.mock(
  'expo-router' /* gc1-allow: expo-router requires a native navigation container not available in JSDOM */,
  () => ({
    router: { push: mockPush },
    useRouter: () => ({ push: mockPush }),
  }),
);

jest.mock(
  '../../lib/platform-alert' /* gc1-allow: wraps Alert.alert which is unavailable in JSDOM */,
  () => ({ platformAlert: jest.fn() }),
);

jest.mock(
  '../../lib/sentry' /* gc1-allow: Sentry SDK loads native module config at import — crashes Jest */,
  () => ({
    Sentry: { captureException: jest.fn() },
  }),
);

// NOTE — previously this file also mocked seven internal modules
// (lib/profile.useLinkedChildren, hooks/use-active-profile-role,
// use-dashboard, use-subscription, use-child-cap-notifications,
// use-learner-profile, use-nudges) plus the WithdrawalCountdownBanner. Those
// stubs are gone: the real hooks now run against the routed mock fetch and
// the real ProfileContext provided by `renderScreen`. The banner renders for
// real and is asserted on its visible output.

// ─── Fixtures ───────────────────────────────────────────────────────────

const makeProfile = (overrides: Partial<Profile> = {}): Profile =>
  createTestProfile({
    id: 'profile-1',
    accountId: 'account-1',
    displayName: 'Alex Parent',
    isOwner: true,
    birthYear: 1985,
    ...overrides,
  });

const PARENT = makeProfile();

const CHILD_A = makeProfile({
  id: 'child-a',
  accountId: 'account-1',
  displayName: 'Emma',
  isOwner: false,
});

const CHILD_B = makeProfile({
  id: 'child-b',
  accountId: 'account-1',
  displayName: 'Liam',
  isOwner: false,
});

type ChildCapNotificationFixture = {
  id: string;
  ownerProfileId: string;
  childProfileId: string;
  childDisplayName: string;
  kind: 'daily_exceeded' | 'monthly_exceeded';
  occurredOn: string;
  resetsAt: string;
  createdAt: string;
};

function subscriptionResponse(
  tier: 'free' | 'plus' | 'family' | 'pro' = 'family',
) {
  return {
    subscription: {
      tier,
      effectiveAccessTier: tier,
      billingAccess: 'current',
      status: 'active',
      trialEndsAt: null,
      currentPeriodEnd: '2030-01-01T00:00:00.000Z',
      cancelAtPeriodEnd: false,
      monthlyLimit: 700,
      usedThisMonth: 0,
      remainingQuestions: 700,
      dailyLimit: null,
      usedToday: 0,
      dailyRemainingQuestions: null,
    },
  };
}

interface RouteOptions {
  dashboard?: DashboardData;
  subscriptionTier?: 'free' | 'plus' | 'family' | 'pro';
  family?: { profileCount: number; maxProfiles: number } | null;
  childCapNotifications?: ChildCapNotificationFixture[];
  recaps?: unknown[];
  childMemory?: unknown;
  progressSummary?: unknown;
}

/**
 * Build the routes map the real hooks hit. Endpoints discovered from the hook
 * sources:
 *   - useDashboard          → GET /dashboard (+ GET /dashboard/demo fallback
 *                             when children is empty)
 *   - useSubscription       → GET /subscription
 *   - useFamilySubscription → GET /subscription/family
 *   - useChildCapNotifications     → GET /notifications/child-cap
 *   - useDismissChildCapNotification → POST /notifications/child-cap/:id/dismiss
 *   - useChildLearnerProfile (not called by ParentHomeScreen — no route needed)
 *   - useSendNudge          → POST /nudges (fires only on press; no route
 *                             needed because the nudge test never confirms send)
 */
function buildRoutes(opts: RouteOptions = {}) {
  const dashboard: DashboardData = opts.dashboard ?? {
    children: [],
    pendingNotices: [],
    demoMode: false,
  };
  const family =
    opts.family === undefined
      ? { profileCount: 2, maxProfiles: 5 }
      : opts.family;

  return {
    // Dismiss must precede the list route: both URLs contain
    // "/notifications/child-cap", and the routed mock returns the first
    // includes() match in insertion order.
    '/dismiss': { success: true },
    '/notifications/child-cap': {
      notifications: opts.childCapNotifications ?? [],
    },
    '/memory': {
      memory: opts.childMemory ?? {
        categories: [],
        parentContributions: [],
        settings: {
          memoryEnabled: true,
          collectionEnabled: true,
          injectionEnabled: true,
          accommodationMode: null,
        },
      },
    },
    '/progress-summary': opts.progressSummary ?? {
      summary: null,
      generatedAt: null,
      basedOnLastSessionAt: null,
      latestSessionId: null,
      activityState: 'no_recent_activity',
      nudgeRecommended: false,
    },
    // The real useDashboard falls through to /dashboard/demo when the primary
    // response has zero children — route both so the fallback never returns
    // the empty default-200 body (which lacks `.children`).
    '/dashboard/demo': dashboard,
    '/dashboard': dashboard,
    '/subscription/family':
      family === null
        ? new Response(JSON.stringify({ message: 'none' }), { status: 404 })
        : { family },
    '/subscription': subscriptionResponse(opts.subscriptionTier ?? 'family'),
    // useRecaps fires for the parent feed; default to an empty list.
    '/recaps': { recaps: opts.recaps ?? [] },
  };
}

function resolvedStyle(
  result: RenderScreenResult['result'],
  testID: string,
): Record<string, unknown> {
  const style = result.getByTestId(testID).props.style as unknown;
  const resolved = (
    typeof style === 'function' ? style({ pressed: false }) : style
  ) as
    | Record<string, unknown>
    | Array<Record<string, unknown> | null | undefined>;

  return Array.isArray(resolved) ? Object.assign({}, ...resolved) : resolved;
}

function dashboardChild(
  overrides: Partial<DashboardData['children'][number]> & { profileId: string },
): DashboardData['children'][number] {
  return {
    displayName: 'Emma',
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
    weeklyHeadline: undefined,
    currentlyWorkingOn: [],
    progress: null,
    currentStreak: 0,
    longestStreak: 0,
    totalXp: 0,
    ...overrides,
  };
}

describe('ParentHomeScreen', () => {
  let active: RenderScreenResult | null = null;

  function mount(
    profiles: Profile[],
    opts: RouteOptions = {},
    activeProfile: Profile = PARENT,
  ): RenderScreenResult {
    active = renderScreen(<ParentHomeScreen activeProfile={activeProfile} />, {
      profile: activeProfile,
      profiles,
      routes: buildRoutes(opts),
    });
    return active;
  }

  afterEach(() => {
    if (active) active.cleanup();
    active = null;
    cleanupScreen();
    jest.clearAllMocks();
  });

  async function waitForParentTransitionNotice(
    result: RenderScreenResult['result'],
  ): Promise<void> {
    await waitFor(() => {
      result.getByTestId('parent-transition-notice');
    });
  }

  it('[PARENT-01] renders greeting with profile first name', () => {
    const { result } = mount(
      [PARENT],
      {},
      makeProfile({ displayName: 'Alex Parent' }),
    );

    result.getByText('Hey Alex');
  });

  it('[PARENT-01] uses companion greeting key when displayName is empty string', () => {
    const { result } = mount([PARENT], {}, makeProfile({ displayName: '' }));
    const element = result.getByText('Hey there!');
    expect(element).toBeTruthy();
    // Must NOT render a dangling "Hey " with no name
    expect(result.queryByText(/^Hey $/)).toBeNull();
  });

  it('[PARENT-01] uses companion greeting key when displayName is whitespace only', () => {
    const { result } = mount([PARENT], {}, makeProfile({ displayName: '   ' }));
    const element = result.getByText('Hey there!');
    expect(element).toBeTruthy();
    expect(result.queryByText(/^Hey $/)).toBeNull();
  });

  it('[PARENT-01][PARENT-02] renders one command card per linked child with actions inside it', async () => {
    const { result } = mount([PARENT, CHILD_A, CHILD_B]);
    await waitForParentTransitionNotice(result);

    result.getByTestId('parent-home-check-child-child-a');
    result.getByTestId('parent-home-check-child-child-b');
    result.getByTestId('parent-home-learn-together-child-a');
    result.getByTestId('parent-home-learn-together-child-b');
    result.getByTestId('parent-home-weekly-report-child-a');
    result.getByTestId('parent-home-weekly-report-child-b');
    result.getByTestId('parent-home-send-nudge-child-a');
    result.getByTestId('parent-home-send-nudge-child-b');
    // The Progress button is gone — Progress lives on the overview + tab now.
    expect(
      result.queryByTestId('parent-home-child-progress-child-a'),
    ).toBeNull();
    result.getByText('Children');
    result.getByText('Your family');
    result.getByTestId('parent-home-family-summary');
    result.getByTestId('home-connect-section');
    result.getByTestId('home-connect-section-compact');
    result.getByText('Connect');
    result.getByText('Add a child profile');
    result.getByText('Link an existing learner');
    result.getByText('Invite someone to try MentoMate');
    expect(result.queryByText('Continue your own learning')).toBeNull();
    expect(
      result.queryByText("Show them how it's done: start a quick session."),
    ).toBeNull();
    expect(result.queryByTestId('child-accommodation-row-child-a')).toBeNull();
    expect(result.queryByTestId('child-accommodation-row-child-b')).toBeNull();
  });

  it('routes the child card header to the child overview (no mode)', async () => {
    const { result } = mount([PARENT, CHILD_A]);
    await waitForParentTransitionNotice(result);

    fireEvent.press(result.getByTestId('parent-home-check-child-child-a'));
    expect(mockPush).toHaveBeenLastCalledWith('/(app)/child/child-a');
  });

  it('routes the child initial to child profile settings', async () => {
    const { result } = mount([PARENT, CHILD_A]);
    await waitForParentTransitionNotice(result);

    fireEvent.press(result.getByTestId('parent-home-child-profile-child-a'));
    expect(mockPush).toHaveBeenLastCalledWith(
      '/(app)/child/child-a?mode=settings',
    );
  });

  it('opens the Learn-together sheet from the card action (no Progress button)', async () => {
    const { result } = mount([PARENT, CHILD_A], {
      dashboard: {
        children: [
          dashboardChild({
            profileId: 'child-a',
            displayName: 'Emma',
            sessionsThisWeek: 2,
            currentlyWorkingOn: ['Fractions'],
            totalSessions: 4,
          }),
        ],
        pendingNotices: [],
        demoMode: false,
      },
    });
    await waitForParentTransitionNotice(result);

    expect(
      result.queryByTestId('parent-home-child-progress-child-a'),
    ).toBeNull();
    result.getByTestId('parent-home-learn-together-child-a');
    expect(result.queryByTestId('learn-together-sheet')).toBeNull();

    fireEvent.press(result.getByTestId('parent-home-learn-together-child-a'));

    await waitFor(() => {
      result.getByTestId('learn-together-sheet');
    });
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('does not repeat the card starter inside the Learn-together sheet', async () => {
    const { result } = mount([PARENT, CHILD_A], {
      dashboard: {
        children: [
          dashboardChild({
            profileId: 'child-a',
            displayName: 'Emma',
            sessionsThisWeek: 2,
            currentlyWorkingOn: ['Fractions'],
            totalSessions: 4,
          }),
        ],
        pendingNotices: [],
        demoMode: false,
      },
    });
    await waitForParentTransitionNotice(result);

    await waitFor(() => {
      expect(
        result.getAllByText('What felt clearer in Fractions this week?'),
      ).toHaveLength(1);
    });

    fireEvent.press(result.getByTestId('parent-home-learn-together-child-a'));

    await waitFor(() => {
      result.getByTestId('learn-together-sheet');
    });
    expect(
      result.getAllByText('What felt clearer in Fractions this week?'),
    ).toHaveLength(1);
    result.getByText("What's the trickiest part of Fractions right now?");
  });

  it('does not render duplicate recent activity or own learning actions', async () => {
    const { result } = mount([PARENT, CHILD_A]);
    await waitForParentTransitionNotice(result);

    expect(
      result.queryByTestId('parent-home-recent-child-activity'),
    ).toBeNull();
    expect(result.queryByTestId('parent-home-study-activation')).toBeNull();
    expect(result.queryByText('Recent child activity')).toBeNull();
    expect(result.queryByText('Continue your own learning')).toBeNull();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('routes the reports action to the child reports list', async () => {
    const { result } = mount([PARENT, CHILD_A]);
    await waitForParentTransitionNotice(result);

    fireEvent.press(result.getByTestId('parent-home-weekly-report-child-a'));

    // [WI-1067] pushChildReports pushes the ancestor chain: child profile index
    // first, then the reports leaf — so router.back() from reports returns to
    // the child profile screen rather than falling through to the Home tab.
    expect(mockPush).toHaveBeenCalledTimes(2);
    expect(mockPush).toHaveBeenNthCalledWith(1, '/(app)/child/child-a');
    expect(mockPush).toHaveBeenLastCalledWith({
      pathname: '/(app)/child/[profileId]/reports',
      params: { profileId: 'child-a' },
    });
  });

  it('keeps parent learning out of the family summary when there is no parent activity', () => {
    const { result } = mount([PARENT]);

    expect(result.queryByTestId('parent-home-own-learning')).toBeNull();
    expect(result.queryByText('Continue your own learning')).toBeNull();
    expect(result.queryByText('You: Fractions in Math')).toBeNull();
  });

  it('shows prominent Connect actions when no children are linked', () => {
    const { result } = mount([PARENT]);

    result.getByTestId('home-connect-section');
    expect(result.queryByTestId('home-connect-section-compact')).toBeNull();
    expect(result.queryByTestId('parent-transition-notice')).toBeNull();
    result.getByText('Connect');
    result.getByText('Add a child profile');
    result.getByText('Link an existing learner');
    result.getByText('Invite someone to try MentoMate');
    result.getByText('Coming soon');

    fireEvent.press(result.getByTestId('connect-create-child-action'));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/create-profile',
      params: { for: 'child' },
    });
  });

  it('shows demoted Connect actions for linked children and routes add child directly', async () => {
    const { result } = mount([PARENT, CHILD_A], {
      subscriptionTier: 'free',
      family: { profileCount: 2, maxProfiles: 2 },
    });
    await waitForParentTransitionNotice(result);

    result.getByTestId('home-connect-section-compact');
    fireEvent.press(result.getByTestId('connect-create-child-action'));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/create-profile',
      params: { for: 'child' },
    });
  });

  it('keeps Link existing coming soon and Invite separate from support-link creation', async () => {
    const shareSpy = jest
      .spyOn(Share, 'share')
      .mockResolvedValue({ action: Share.sharedAction } as never);
    const { result } = mount([PARENT, CHILD_A]);
    await waitForParentTransitionNotice(result);

    const linkExisting = result.getByTestId('connect-link-existing-action');
    expect(linkExisting.props.accessibilityState).toEqual(
      expect.objectContaining({ disabled: true }),
    );

    fireEvent.press(linkExisting);
    expect(mockPush).not.toHaveBeenCalled();

    fireEvent.press(result.getByTestId('connect-invite-action'));
    expect(shareSpy).toHaveBeenCalledWith({
      message: 'Try MentoMate with me: learning help for the whole family.',
    });
    expect(mockPush).not.toHaveBeenCalled();
    shareSpy.mockRestore();
  });

  it('renders the mentor-briefing card body (headline, solid line, one starter) from dashboard data', async () => {
    const { result } = mount([PARENT, CHILD_A], {
      dashboard: {
        children: [
          dashboardChild({
            profileId: 'child-a',
            displayName: 'Emma',
            summary: 'Emma is building confidence.',
            sessionsThisWeek: 2,
            sessionsLastWeek: 1,
            totalTimeThisWeek: 18,
            totalTimeLastWeek: 8,
            exchangesThisWeek: 10,
            exchangesLastWeek: 5,
            trend: 'up',
            subjects: [
              {
                subjectId: 'subject-a',
                name: 'Math',
                retentionStatus: 'strong',
              },
            ],
            guidedVsImmediateRatio: 0.5,
            retentionTrend: 'improving',
            totalSessions: 4,
            currentlyWorkingOn: ['Fractions'],
          }),
        ],
        pendingNotices: [],
        demoMode: false,
      },
    });
    await waitForParentTransitionNotice(result);

    // Mentor-voice headline replaces the old "focus · activity" snapshot.
    await waitFor(() => {
      result.getByTestId('parent-home-child-headline-child-a');
    });
    expect(
      result.getByTestId('parent-home-child-headline-child-a').props.children,
    ).toBe('Emma kept things moving in Fractions.');
    // Right-aligned status word.
    expect(
      result.getByTestId('parent-home-child-status-child-a').props.children,
    ).toBe('Active this week');
    // Positive-only "Solid" line — Math is strong.
    expect(
      result.getByTestId('parent-home-child-solid-child-a').props.children,
    ).toBe('Solid: Math');

    // Exactly ONE starter — the old three-prompt block is gone.
    expect(
      result.queryByTestId('parent-home-child-prompts-child-a'),
    ).toBeNull();
    result.getByTestId('parent-home-tonight-child-a-starter');
    expect(
      result.queryByTestId('parent-home-tonight-child-a-trickiest'),
    ).toBeNull();
    expect(
      result.queryByTestId('parent-home-tonight-child-a-next-goal'),
    ).toBeNull();
    result.getByText('What felt clearer in Fractions this week?');

    // The old compact "focus · activity" snapshot is no longer rendered.
    expect(result.queryByText('Fractions · 18 min this week')).toBeNull();

    // Card border style preserved (per-child accent).
    expect(resolvedStyle(result, 'parent-home-child-card-child-a')).toEqual(
      expect.objectContaining({
        borderColor: expect.any(String),
        borderWidth: 1,
      }),
    );
    expect(
      resolvedStyle(result, 'parent-home-child-card-child-a').borderColor,
    ).toMatch(/^#[0-9a-f]{8}$/i);
  });

  it('[PARENT-24] shows the household pulse subtitle when children are active', async () => {
    const { result } = mount([PARENT, CHILD_A, CHILD_B], {
      dashboard: {
        children: [
          dashboardChild({ profileId: 'child-a', sessionsThisWeek: 3 }),
          dashboardChild({ profileId: 'child-b', sessionsThisWeek: 1 }),
        ],
        pendingNotices: [],
        demoMode: false,
      },
    });
    await waitForParentTransitionNotice(result);

    await waitFor(() => {
      result.getByText('2 learners, all active this week.');
    });
  });

  it('[PARENT-24] falls back to the greeting subtitle when there are no children', () => {
    const { result } = mount([PARENT]);
    const pulse = result.getByTestId('parent-home-pulse').props.children;
    expect(String(pulse)).not.toMatch(/active this week|learners/i);
  });

  it('shows a quiet-state card with one restart starter when a child has a focus but no activity', async () => {
    const { result } = mount([PARENT, CHILD_A], {
      dashboard: {
        children: [
          dashboardChild({
            profileId: 'child-a',
            displayName: 'Emma',
            sessionsThisWeek: 0,
            sessionsLastWeek: 1,
            totalTimeThisWeek: 0,
            totalTimeLastWeek: 12,
            exchangesThisWeek: 0,
            exchangesLastWeek: 6,
            trend: 'stable',
            subjects: [
              {
                subjectId: 'subject-programming',
                name: 'Programming',
                retentionStatus: 'strong',
              },
            ],
            guidedVsImmediateRatio: 0,
            retentionTrend: 'stable',
            totalSessions: 3,
            currentlyWorkingOn: ['Programming'],
          }),
        ],
        pendingNotices: [],
        demoMode: false,
      },
    });
    await waitForParentTransitionNotice(result);

    // Quiet headline + status word.
    await waitFor(() => {
      result.getByTestId('parent-home-child-headline-child-a');
    });
    expect(
      result.getByTestId('parent-home-child-headline-child-a').props.children,
    ).toBe('Emma had a quieter week — last time the focus was Programming.');
    expect(
      result.getByTestId('parent-home-child-status-child-a').props.children,
    ).toBe('Quiet week');

    // Exactly one restart starter — not the three-prompt fan-out.
    result.getByText('Ask Emma what would make Programming easy to restart.');
    expect(
      result.queryByText("What's the trickiest part of Programming right now?"),
    ).toBeNull();
    expect(
      result.queryByText('Should we make Programming easier to restart?'),
    ).toBeNull();
    // Quiet state hides the Solid / Coming-up block.
    expect(result.queryByTestId('parent-home-child-solid-child-a')).toBeNull();
    expect(
      result.queryByTestId('parent-home-child-comingup-child-a'),
    ).toBeNull();
  });

  it('[PARENT-02] replaces the family panel with durable mentor insight + add-learner row for a single child', async () => {
    const { result } = mount([PARENT, CHILD_A], {
      dashboard: {
        children: [
          dashboardChild({
            profileId: 'child-a',
            displayName: 'Emma',
            sessionsThisWeek: 2,
            totalSessions: 4,
            progress: {
              snapshotDate: '2026-05-29',
              topicsMastered: 4,
              vocabularyTotal: 20,
              minutesThisWeek: 30,
              weeklyDeltaTopicsMastered: 1,
              weeklyDeltaVocabularyTotal: 2,
              weeklyDeltaTopicsExplored: 1,
              engagementTrend: 'increasing',
              guidance: 'Quiet week — maybe suggest a quick session on Math?',
            },
          }),
        ],
        pendingNotices: [],
        demoMode: false,
      },
      childMemory: {
        categories: [
          {
            label: 'Learning pace & notes',
            items: [
              {
                category: 'communicationNotes',
                value: 'short-visual-start',
                statement: 'Short visual examples help Emma get started.',
              },
            ],
          },
        ],
        parentContributions: [],
        settings: {
          memoryEnabled: true,
          collectionEnabled: true,
          injectionEnabled: true,
          accommodationMode: null,
        },
      },
    });
    await waitForParentTransitionNotice(result);

    // One child: no family summary panel.
    expect(result.queryByTestId('parent-home-family-summary')).toBeNull();
    // Mentor slot surfaces durable mentor memory, not shallow dashboard guidance.
    await waitFor(() => {
      result.getByTestId('parent-home-mentor-slot-guidance');
    });
    result.getByText('What works for Emma');
    result.getByText('Short visual examples help Emma get started.');
    expect(
      result.queryByText('Quiet week — maybe suggest a quick session on Math?'),
    ).toBeNull();
    // Connect stays available, but demoted below the child-specific mentor slot.
    result.getByTestId('home-connect-section-compact');
    // No parent-learning leak.
    expect(result.queryByText('You: Fractions in Math')).toBeNull();
  });

  it('[PARENT-02] shows one activity-based prompt inside each child card when multiple children are linked', async () => {
    const { result } = mount([CHILD_B, CHILD_A], {
      // intentionally reversed profiles to verify sort
      dashboard: {
        children: [
          dashboardChild({
            profileId: 'child-a',
            displayName: 'Emma',
            sessionsThisWeek: 5,
            sessionsLastWeek: 3,
            totalTimeThisWeek: 30,
            totalTimeLastWeek: 20,
            exchangesThisWeek: 15,
            exchangesLastWeek: 10,
            trend: 'up',
            subjects: [
              { subjectId: 'sub-a', name: 'Math', retentionStatus: 'strong' },
            ],
            guidedVsImmediateRatio: 0.5,
            retentionTrend: 'improving',
            totalSessions: 10,
            currentlyWorkingOn: ['Math'],
          }),
          dashboardChild({
            profileId: 'child-b',
            displayName: 'Liam',
            totalSessions: 3,
          }),
        ],
        pendingNotices: [],
        demoMode: false,
      },
    });
    await waitForParentTransitionNotice(result);

    await waitFor(() => {
      result.getByTestId('parent-home-tonight-child-a-starter');
    });
    // Each card carries exactly one starter (testID `${childId}-starter`).
    const emmaPrompt = result.getByTestId(
      'parent-home-tonight-child-a-starter',
    );
    const liamPrompt = result.getByTestId(
      'parent-home-tonight-child-b-starter',
    );
    result.getByText('What felt clearer in Math this week?');
    result.getByText('What would make starting feel easy this week?');
    // The old 3-prompt block testIDs no longer exist.
    expect(
      result.queryByTestId('parent-home-child-prompts-child-a'),
    ).toBeNull();
    expect(
      result.queryByText('Emma: What felt clearer in Math this week?'),
    ).toBeNull();
    expect(
      resolvedStyle(result, 'parent-home-tonight-child-a-starter').borderColor,
    ).not.toBe(
      resolvedStyle(result, 'parent-home-tonight-child-b-starter').borderColor,
    );
    expect(
      resolvedStyle(result, 'parent-home-check-child-child-a').shadowColor,
    ).not.toBe(
      resolvedStyle(result, 'parent-home-check-child-child-b').shadowColor,
    );
    expect(emmaPrompt).toBeTruthy();
    expect(liamPrompt).toBeTruthy();
    // Attention row is reworded to positive framing under a "who needs you" header.
    result.getByText('Who needs you today');
    result.getByText('Liam could use a nudge today');
    expect(result.queryByText('Liam may need attention')).toBeNull();
  });

  it('[PARENT-24] shows ParentTransitionNotice after at least one child is linked', async () => {
    const transitionParent = makeProfile({ id: 'profile-transition' });
    const { result } = mount(
      [transitionParent, { ...CHILD_A, accountId: transitionParent.accountId }],
      {},
      transitionParent,
    );

    await waitForParentTransitionNotice(result);
  });

  it('pressing nudge card opens NudgeActionSheet for that child', async () => {
    const { result } = mount([PARENT, CHILD_A]);
    await waitForParentTransitionNotice(result);

    expect(result.queryByTestId('nudge-action-sheet-close')).toBeNull();

    fireEvent.press(result.getByTestId('parent-home-send-nudge-child-a'));

    result.getByTestId('nudge-action-sheet-close');
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('derives childrenInGracePeriod from dashboard and renders the withdrawal countdown banner', async () => {
    const respondedAt = new Date(
      Date.now() - 2 * 24 * 60 * 60 * 1000,
    ).toISOString();
    const { result } = mount([PARENT, CHILD_A], {
      dashboard: {
        children: [
          dashboardChild({
            profileId: 'child-a',
            displayName: 'Emma',
            consentStatus: 'WITHDRAWN',
            respondedAt,
          }),
        ],
        pendingNotices: [],
        demoMode: false,
      },
    });

    // Real WithdrawalCountdownBanner renders only when the parent derives a
    // non-empty childrenInGracePeriod from dashboard data — asserting its
    // visible output (the banner + the per-child row) is a stronger check than
    // the old prop-capture spy.
    await waitFor(() => {
      result.getByTestId('withdrawal-countdown-banner');
      result.getByTestId('withdrawal-countdown-row-child-a');
    });
    // The row copy interpolates the child's display name.
    result.getAllByText(/Emma/);
  });

  it('renders child-cap notifications with reset-time copy and dismiss action', async () => {
    const notificationId = 'b0000000-0000-4000-8000-000000000001';
    const { result, routedFetch } = mount([PARENT, CHILD_A], {
      childCapNotifications: [
        {
          id: notificationId,
          // Schema validates these as UUIDs (the real hook runs zod parse now,
          // unlike the old hook-mock). Use valid UUIDs; the rendered banner is
          // keyed by `id`, so the profile UUIDs don't affect assertions.
          ownerProfileId: 'a0000000-0000-4000-8000-0000000000a1',
          childProfileId: 'a0000000-0000-4000-8000-0000000000c1',
          childDisplayName: 'Emma',
          kind: 'daily_exceeded',
          occurredOn: '2026-05-26',
          resetsAt: '2026-05-27T01:00:00.000Z',
          createdAt: '2026-05-26T12:00:00.000Z',
        },
      ],
    });
    await waitForParentTransitionNotice(result);

    await waitFor(() => {
      result.getByTestId(
        `parent-home-child-cap-notification-${notificationId}`,
      );
    });
    result.getByText("Emma hit today's question limit");
    const message = result.getByTestId(
      `parent-home-child-cap-notification-message-${notificationId}`,
    ).props.children;
    expect(String(message)).toContain('They can try again after');
    expect(String(message)).not.toMatch(/midnight|1st/i);

    fireEvent.press(
      result.getByTestId(
        `parent-home-child-cap-notification-dismiss-${notificationId}`,
      ),
    );

    // The real useDismissChildCapNotification mutation fires the dismiss POST
    // with the notification id in the URL path.
    await waitFor(() => {
      const dismissCalls = fetchCallsMatching(
        routedFetch,
        `/notifications/child-cap/${notificationId}/dismiss`,
      );
      expect(dismissCalls.length).toBeGreaterThan(0);
      expect(dismissCalls[0]!.init?.method).toBe('POST');
    });
  });
});
