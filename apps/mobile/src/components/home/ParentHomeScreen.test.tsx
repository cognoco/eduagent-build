import { fireEvent, waitFor } from '@testing-library/react-native';
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

  it('renders greeting with profile first name', () => {
    const { result } = mount(
      [PARENT],
      {},
      makeProfile({ displayName: 'Alex Parent' }),
    );

    result.getByText('Hey Alex');
  });

  it('renders one command card per linked child with actions inside it', async () => {
    const { result } = mount([PARENT, CHILD_A, CHILD_B]);
    await waitForParentTransitionNotice(result);

    result.getByTestId('parent-home-check-child-child-a');
    result.getByTestId('parent-home-check-child-child-b');
    result.getByTestId('parent-home-child-progress-child-a');
    result.getByTestId('parent-home-weekly-report-child-a');
    result.getByTestId('parent-home-weekly-report-child-b');
    result.getByTestId('parent-home-send-nudge-child-a');
    result.getByTestId('parent-home-send-nudge-child-b');
    result.getByText('Children');
    result.getByText('Your family');
    result.getByTestId('parent-home-family-summary');
    result.getByText('Add profile');
    expect(result.queryByText('Continue your own learning')).toBeNull();
    expect(
      result.queryByText("Show them how it's done: start a quick session."),
    ).toBeNull();
    expect(result.queryByTestId('child-accommodation-row-child-a')).toBeNull();
    expect(result.queryByTestId('child-accommodation-row-child-b')).toBeNull();
  });

  it('routes the child card header to the child quick progress screen', async () => {
    const { result } = mount([PARENT, CHILD_A]);
    await waitForParentTransitionNotice(result);

    fireEvent.press(result.getByTestId('parent-home-check-child-child-a'));
    expect(mockPush).toHaveBeenLastCalledWith(
      '/(app)/child/child-a?mode=progress',
    );
  });

  it('routes the child initial to child profile settings', async () => {
    const { result } = mount([PARENT, CHILD_A]);
    await waitForParentTransitionNotice(result);

    fireEvent.press(result.getByTestId('parent-home-child-profile-child-a'));
    expect(mockPush).toHaveBeenLastCalledWith(
      '/(app)/child/child-a?mode=settings',
    );
  });

  it('routes the progress action to the child quick progress screen', async () => {
    const { result } = mount([PARENT, CHILD_A]);
    await waitForParentTransitionNotice(result);

    fireEvent.press(result.getByTestId('parent-home-child-progress-child-a'));
    expect(mockPush).toHaveBeenLastCalledWith(
      '/(app)/child/child-a?mode=progress',
    );
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

    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenLastCalledWith('/(app)/child/child-a/reports');
  });

  it('keeps parent learning out of the family summary when there is no parent activity', () => {
    const { result } = mount([PARENT]);

    expect(result.queryByTestId('parent-home-own-learning')).toBeNull();
    expect(result.queryByText('Continue your own learning')).toBeNull();
    expect(result.queryByText('You: Fractions in Math')).toBeNull();
  });

  it('shows an add-first-child state when no children are linked', () => {
    const { result } = mount([PARENT]);

    result.getByTestId('add-first-child-screen');
    expect(result.queryByTestId('parent-transition-notice')).toBeNull();
    result.getByText('Your family dashboard starts here');
    result.getByText(
      'Add your first child profile and this screen will turn into tonight prompts, weekly recaps, nudges, and progress cards.',
    );

    fireEvent.press(result.getByTestId('add-first-child-screen-primary'));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/create-profile',
      params: { for: 'child' },
    });
  });

  it('routes Free owners with linked children directly to add another child', async () => {
    const { result } = mount([PARENT, CHILD_A], {
      subscriptionTier: 'free',
      family: { profileCount: 2, maxProfiles: 2 },
    });
    await waitForParentTransitionNotice(result);

    fireEvent.press(result.getByTestId('parent-home-add-child'));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/create-profile',
      params: { for: 'child' },
    });
  });

  it('shows conversation prompts inside the child card with compact status from dashboard data', async () => {
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

    await waitFor(() => {
      result.getByTestId('parent-home-child-prompts-child-a');
    });

    expect(result.queryByTestId('parent-home-tonight-section')).toBeNull();
    result.getByText('Conversation starters');
    result.getByText('What felt clearer in Fractions this week?');
    result.getByText("What's the trickiest part of Fractions right now?");
    result.getByText('Want to pick one small Fractions goal for this week?');
    expect(
      result.queryByText('Emma: What felt clearer in Fractions this week?'),
    ).toBeNull();
    expect(result.queryByText('What made Fractions click today?')).toBeNull();
    expect(result.queryByText('What should we focus on tomorrow?')).toBeNull();
    const promptCardStyles = [
      resolvedStyle(result, 'parent-home-tonight-child-a-active-focus'),
      resolvedStyle(result, 'parent-home-tonight-child-a-trickiest'),
      resolvedStyle(result, 'parent-home-tonight-child-a-next-goal'),
    ];
    promptCardStyles.forEach((style) => {
      expect(style).toEqual(
        expect.objectContaining({
          backgroundColor: expect.any(String),
          borderColor: expect.any(String),
          borderRadius: 16,
          borderWidth: 1,
          minHeight: 48,
        }),
      );
      expect(style.borderColor).toMatch(/^#[0-9a-f]{8}$/i);
      expect(style.elevation).toBeUndefined();
    });
    expect(
      new Set(promptCardStyles.map((style) => style.backgroundColor)).size,
    ).toBe(1);
    expect(resolvedStyle(result, 'parent-home-check-child-child-a')).toEqual(
      expect.objectContaining({
        shadowColor: expect.any(String),
      }),
    );
    const childAccent = resolvedStyle(result, 'parent-home-check-child-child-a')
      .shadowColor as string;
    const promptBorder = resolvedStyle(
      result,
      'parent-home-tonight-child-a-active-focus',
    ).borderColor as string;
    expect(promptBorder.toLowerCase()).toMatch(
      new RegExp(`^${childAccent.toLowerCase()}`),
    );
    expect(
      result.getByTestId('parent-home-tonight-child-a-active-focus').props
        .accessibilityRole,
    ).toBeUndefined();
    expect(
      resolvedStyle(result, 'parent-home-tonight-icon-child-a-active-focus'),
    ).toEqual(
      expect.objectContaining({
        backgroundColor: expect.any(String),
        borderColor: expect.any(String),
        borderWidth: 1,
        height: 28,
        width: 28,
      }),
    );
    const promptTextStyle = resolvedStyle(
      result,
      'parent-home-tonight-text-child-a-active-focus',
    );
    expect(promptTextStyle).toEqual(
      expect.objectContaining({
        fontSize: 14,
        fontWeight: '400',
        lineHeight: 20,
      }),
    );
    expect(promptTextStyle.backgroundColor).toBeUndefined();
    expect(resolvedStyle('parent-home-child-card-child-a')).toEqual(
      expect.objectContaining({
        borderColor: expect.any(String),
        borderWidth: 1,
      }),
    );
    expect(resolvedStyle('parent-home-child-card-child-a').borderColor).toMatch(
      /^#[0-9a-f]{8}$/i,
    );
    expect(
      result.getAllByText('Fractions · 18 min this week').length,
    ).toBeGreaterThan(0);
    result.getByText('Emma · 18 min this week');
    result.getByText('2 of 5 profiles used');
  });

  it('uses restart prompts when a child has a focus but no activity this week', async () => {
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

    await waitFor(() => {
      result.getByText(
        'Want to pick one small Programming goal for this week?',
      );
    });
    result.getByText("What's the trickiest part of Programming right now?");
    result.getByText('Should we make Programming easier to restart?');
    expect(result.queryByText('What made Programming click today?')).toBeNull();
    expect(
      result.queryByText('What felt clearer in Programming this week?'),
    ).toBeNull();
  });

  it('keeps the family summary focused on child activity', async () => {
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

    await waitFor(() => {
      result.getByText('Emma · 18 min this week');
    });
    result.getByText('2 of 5 profiles used');
    expect(result.queryByText('You + Emma')).toBeNull();
    expect(result.queryByText('You: Fractions in Math')).toBeNull();
    expect(result.queryByText('You lead by example.')).toBeNull();
  });

  it('shows one activity-based prompt inside each child card when multiple children are linked', async () => {
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
      result.getByTestId('parent-home-tonight-child-a-active-focus');
    });
    const emmaPrompt = result.getByTestId(
      'parent-home-tonight-child-a-active-focus',
    );
    const liamPrompt = result.getByTestId(
      'parent-home-tonight-child-b-restart',
    );
    result.getByTestId('parent-home-child-prompts-child-a');
    result.getByTestId('parent-home-child-prompts-child-b');
    result.getByText('What felt clearer in Math this week?');
    result.getByText('What would make starting feel easy this week?');
    expect(
      result.queryByTestId('parent-home-tonight-child-a-trickiest'),
    ).toBeNull();
    expect(
      result.queryByTestId('parent-home-tonight-child-b-restart-easier'),
    ).toBeNull();
    expect(
      result.queryByText('Emma: What felt clearer in Math this week?'),
    ).toBeNull();
    expect(
      result.queryByText('Liam: What would make starting feel easy this week?'),
    ).toBeNull();
    expect(
      resolvedStyle(result, 'parent-home-tonight-child-a-active-focus')
        .borderColor,
    ).not.toBe(
      resolvedStyle(result, 'parent-home-tonight-child-b-restart').borderColor,
    );
    expect(
      resolvedStyle(result, 'parent-home-check-child-child-a').shadowColor,
    ).not.toBe(
      resolvedStyle(result, 'parent-home-check-child-child-b').shadowColor,
    );
    expect(emmaPrompt).toBeTruthy();
    expect(liamPrompt).toBeTruthy();
    result.getByText('Liam may need attention');
  });

  it('shows ParentTransitionNotice after at least one child is linked', async () => {
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
