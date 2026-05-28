import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import type { DashboardData, Profile } from '@eduagent/schemas';

import { ParentHomeScreen } from './ParentHomeScreen';

jest.mock(
  'react-i18next',
  () => require('../../test-utils/mock-i18n').i18nMock,
);

jest.mock(
  'react-native-safe-area-context' /* gc1-allow: native module that requires device/simulator to resolve insets */,
  () => ({
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  }),
);

let mockLinkedChildren: Profile[] = [];
let mockDashboardData: DashboardData | undefined;
let mockChildCapNotifications: Array<{
  id: string;
  ownerProfileId: string;
  childProfileId: string;
  childDisplayName: string;
  kind: 'daily_exceeded' | 'monthly_exceeded';
  occurredOn: string;
  resetsAt: string;
  createdAt: string;
}> = [];
const mockDismissChildCapNotification = jest.fn();
let mockSubscription: { tier: 'free' | 'plus' | 'family' | 'pro' } | null = {
  tier: 'family',
};
let mockFamilySubscription: {
  profileCount: number;
  maxProfiles: number;
} | null = {
  profileCount: 2,
  maxProfiles: 5,
};

jest.mock(
  '../../lib/profile' /* gc1-allow: profile context requires full ProfileProvider setup */,
  () => ({
    ...jest.requireActual('../../lib/profile'),
    useLinkedChildren: () => mockLinkedChildren,
  }),
);

jest.mock(
  '../../hooks/use-active-profile-role' /* gc1-allow: external hook boundary — wraps profile context + family-links query */,
  () => ({
    useActiveProfileRole: () => 'owner',
  }),
);

jest.mock(
  '../../hooks/use-dashboard' /* gc1-allow: external hook boundary — wraps TanStack query that requires QueryClient */,
  () => ({
    useDashboard: () => ({ data: mockDashboardData }),
  }),
);

jest.mock(
  '../../hooks/use-subscription' /* gc1-allow: external hook boundary — wraps TanStack query that requires QueryClient */,
  () => ({
    useSubscription: () => ({ data: mockSubscription }),
    useFamilySubscription: () => ({ data: mockFamilySubscription }),
  }),
);

jest.mock(
  '../../hooks/use-child-cap-notifications' /* gc1-allow: external hook boundary — wraps TanStack query that requires QueryClient */,
  () => ({
    useChildCapNotifications: () => ({ data: mockChildCapNotifications }),
    useDismissChildCapNotification: () => ({
      mutate: mockDismissChildCapNotification,
      isPending: false,
    }),
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

type BannerProps = {
  childrenInGracePeriod: Array<{
    profileId: string;
    displayName: string;
    respondedAt: string;
  }>;
};
let capturedBannerProps: BannerProps | null = null;

jest.mock(
  '../family/WithdrawalCountdownBanner' /* gc1-allow: depends on its own hook tree — isolated here to keep test focused */,
  () => ({
    WithdrawalCountdownBanner: (props: BannerProps) => {
      capturedBannerProps = props;
      return null;
    },
  }),
);

jest.mock(
  '../../hooks/use-nudges' /* gc1-allow: external hook boundary — wraps TanStack mutation that requires QueryClient */,
  () => ({
    useSendNudge: () => ({
      mutateAsync: jest.fn().mockResolvedValue(undefined),
    }),
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

jest.mock(
  '../../hooks/use-learner-profile' /* gc1-allow: external hook boundary — wraps TanStack query that requires QueryClient */,
  () => ({
    useChildLearnerProfile: () => ({
      data: { accommodationMode: 'none' },
    }),
  }),
);

const makeProfile = (overrides: Partial<Profile> = {}): Profile => ({
  id: 'profile-1',
  accountId: 'account-1',
  displayName: 'Alex Parent',
  isOwner: true,
  hasPremiumLlm: false,
  defaultAppContext: null,
  hasFamilyLinks: false,
  consentStatus: null,
  linkCreatedAt: null,
  conversationLanguage: 'en',
  pronouns: null,
  birthYear: 1985,
  avatarUrl: null,
  location: null,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
  ...overrides,
});

const CHILD_A = makeProfile({
  id: 'child-a',
  displayName: 'Emma',
  isOwner: false,
});

const CHILD_B = makeProfile({
  id: 'child-b',
  displayName: 'Liam',
  isOwner: false,
});

async function waitForParentTransitionNotice(): Promise<void> {
  await waitFor(() => {
    screen.getByTestId('parent-transition-notice');
  });
}

function resolvedStyle(testID: string): Record<string, unknown> {
  const style = screen.getByTestId(testID).props.style as unknown;
  const resolved = (
    typeof style === 'function' ? style({ pressed: false }) : style
  ) as
    | Record<string, unknown>
    | Array<Record<string, unknown> | null | undefined>;

  return Array.isArray(resolved) ? Object.assign({}, ...resolved) : resolved;
}

describe('ParentHomeScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLinkedChildren = [];
    mockDashboardData = undefined;
    mockChildCapNotifications = [];
    mockSubscription = { tier: 'family' };
    mockFamilySubscription = { profileCount: 2, maxProfiles: 5 };
    capturedBannerProps = null;
  });

  it('renders greeting with profile first name', () => {
    render(
      <ParentHomeScreen
        activeProfile={makeProfile({ displayName: 'Alex Parent' })}
      />,
    );

    screen.getByText('Hey Alex');
  });

  it('renders one command card per linked child with actions inside it', async () => {
    mockLinkedChildren = [CHILD_A, CHILD_B];

    render(<ParentHomeScreen activeProfile={makeProfile()} />);
    await waitForParentTransitionNotice();

    screen.getByTestId('parent-home-check-child-child-a');
    screen.getByTestId('parent-home-check-child-child-b');
    screen.getByTestId('parent-home-child-progress-child-a');
    screen.getByTestId('parent-home-weekly-report-child-a');
    screen.getByTestId('parent-home-weekly-report-child-b');
    screen.getByTestId('parent-home-send-nudge-child-a');
    screen.getByTestId('parent-home-send-nudge-child-b');
    screen.getByText('Children');
    screen.getByText('Your family');
    screen.getByTestId('parent-home-family-summary');
    screen.getByText('Add profile');
    expect(screen.queryByText('Continue your own learning')).toBeNull();
    expect(
      screen.queryByText("Show them how it's done: start a quick session."),
    ).toBeNull();
    expect(screen.queryByTestId('child-accommodation-row-child-a')).toBeNull();
    expect(screen.queryByTestId('child-accommodation-row-child-b')).toBeNull();
  });

  it('routes the child card header to the child quick progress screen', async () => {
    mockLinkedChildren = [CHILD_A];

    render(<ParentHomeScreen activeProfile={makeProfile()} />);
    await waitForParentTransitionNotice();

    fireEvent.press(screen.getByTestId('parent-home-check-child-child-a'));
    expect(mockPush).toHaveBeenLastCalledWith(
      '/(app)/child/child-a?mode=progress',
    );
  });

  it('routes the child initial to child profile settings', async () => {
    mockLinkedChildren = [CHILD_A];

    render(<ParentHomeScreen activeProfile={makeProfile()} />);
    await waitForParentTransitionNotice();

    fireEvent.press(screen.getByTestId('parent-home-child-profile-child-a'));
    expect(mockPush).toHaveBeenLastCalledWith(
      '/(app)/child/child-a?mode=settings',
    );
  });

  it('routes the progress action to the child quick progress screen', async () => {
    mockLinkedChildren = [CHILD_A];

    render(<ParentHomeScreen activeProfile={makeProfile()} />);
    await waitForParentTransitionNotice();

    fireEvent.press(screen.getByTestId('parent-home-child-progress-child-a'));
    expect(mockPush).toHaveBeenLastCalledWith(
      '/(app)/child/child-a?mode=progress',
    );
  });

  it('does not render duplicate recent activity or own learning actions', async () => {
    mockLinkedChildren = [CHILD_A];

    render(<ParentHomeScreen activeProfile={makeProfile()} />);
    await waitForParentTransitionNotice();

    expect(
      screen.queryByTestId('parent-home-recent-child-activity'),
    ).toBeNull();
    expect(screen.queryByTestId('parent-home-study-activation')).toBeNull();
    expect(screen.queryByText('Recent child activity')).toBeNull();
    expect(screen.queryByText('Continue your own learning')).toBeNull();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('routes the reports action to the child reports list', async () => {
    mockLinkedChildren = [CHILD_A];

    render(<ParentHomeScreen activeProfile={makeProfile()} />);
    await waitForParentTransitionNotice();

    fireEvent.press(screen.getByTestId('parent-home-weekly-report-child-a'));

    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenLastCalledWith('/(app)/child/child-a/reports');
  });

  it('keeps parent learning out of the family summary when there is no parent activity', () => {
    render(<ParentHomeScreen activeProfile={makeProfile()} />);

    expect(screen.queryByTestId('parent-home-own-learning')).toBeNull();
    expect(screen.queryByText('Continue your own learning')).toBeNull();
    expect(screen.queryByText('You: Fractions in Math')).toBeNull();
  });

  it('shows an add-first-child state when no children are linked', () => {
    render(<ParentHomeScreen activeProfile={makeProfile()} />);

    screen.getByTestId('add-first-child-screen');
    expect(screen.queryByTestId('parent-transition-notice')).toBeNull();
    screen.getByText('Your family dashboard starts here');
    screen.getByText(
      'Add your first child profile and this screen will turn into tonight prompts, weekly recaps, nudges, and progress cards.',
    );

    fireEvent.press(screen.getByTestId('add-first-child-screen-primary'));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/create-profile',
      params: { for: 'child' },
    });
  });

  it('routes Free owners with linked children directly to add another child', async () => {
    mockSubscription = { tier: 'free' };
    mockFamilySubscription = { profileCount: 2, maxProfiles: 2 };
    mockLinkedChildren = [CHILD_A];

    render(<ParentHomeScreen activeProfile={makeProfile()} />);
    await waitForParentTransitionNotice();

    fireEvent.press(screen.getByTestId('parent-home-add-child'));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/create-profile',
      params: { for: 'child' },
    });
  });

  it('shows conversation prompts inside the child card with compact status from dashboard data', async () => {
    mockLinkedChildren = [CHILD_A];
    mockDashboardData = {
      children: [
        {
          profileId: 'child-a',
          displayName: 'Emma',
          consentStatus: null,
          respondedAt: null,
          summary: 'Emma is building confidence.',
          sessionsThisWeek: 2,
          sessionsLastWeek: 1,
          totalTimeThisWeek: 18,
          totalTimeLastWeek: 8,
          exchangesThisWeek: 10,
          exchangesLastWeek: 5,
          trend: 'up',
          subjects: [
            { subjectId: 'subject-a', name: 'Math', retentionStatus: 'strong' },
          ],
          guidedVsImmediateRatio: 0.5,
          retentionTrend: 'improving',
          totalSessions: 4,
          weeklyHeadline: undefined,
          currentlyWorkingOn: ['Fractions'],
          progress: null,
          currentStreak: 0,
          longestStreak: 0,
          totalXp: 0,
        },
      ],
      pendingNotices: [],
      demoMode: false,
    };

    render(<ParentHomeScreen activeProfile={makeProfile()} />);
    await waitForParentTransitionNotice();

    expect(screen.queryByTestId('parent-home-tonight-section')).toBeNull();
    screen.getByTestId('parent-home-child-prompts-child-a');
    screen.getByText('Conversation starters');
    screen.getByText('What felt clearer in Fractions this week?');
    screen.getByText("What's the trickiest part of Fractions right now?");
    screen.getByText('Want to pick one small Fractions goal for this week?');
    expect(
      screen.queryByText('Emma: What felt clearer in Fractions this week?'),
    ).toBeNull();
    expect(screen.queryByText('What made Fractions click today?')).toBeNull();
    expect(screen.queryByText('What should we focus on tomorrow?')).toBeNull();
    const promptCardStyles = [
      resolvedStyle('parent-home-tonight-child-a-active-focus'),
      resolvedStyle('parent-home-tonight-child-a-trickiest'),
      resolvedStyle('parent-home-tonight-child-a-next-goal'),
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
    expect(resolvedStyle('parent-home-check-child-child-a')).toEqual(
      expect.objectContaining({
        shadowColor: expect.any(String),
      }),
    );
    const childAccent = resolvedStyle('parent-home-check-child-child-a')
      .shadowColor as string;
    const promptBorder = resolvedStyle(
      'parent-home-tonight-child-a-active-focus',
    ).borderColor as string;
    expect(promptBorder.toLowerCase()).toMatch(
      new RegExp(`^${childAccent.toLowerCase()}`),
    );
    expect(
      screen.getByTestId('parent-home-tonight-child-a-active-focus').props
        .accessibilityRole,
    ).toBeUndefined();
    expect(
      resolvedStyle('parent-home-tonight-icon-child-a-active-focus'),
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
      screen.getAllByText('Fractions · 18 min this week').length,
    ).toBeGreaterThan(0);
    screen.getByText('Emma · 18 min this week');
    screen.getByText('2 of 5 profiles used');
  });

  it('uses restart prompts when a child has a focus but no activity this week', async () => {
    mockLinkedChildren = [CHILD_A];
    mockDashboardData = {
      children: [
        {
          profileId: 'child-a',
          displayName: 'Emma',
          consentStatus: null,
          respondedAt: null,
          summary: '',
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
    };

    render(<ParentHomeScreen activeProfile={makeProfile()} />);
    await waitForParentTransitionNotice();

    screen.getByText('Want to pick one small Programming goal for this week?');
    screen.getByText("What's the trickiest part of Programming right now?");
    screen.getByText('Should we make Programming easier to restart?');
    expect(screen.queryByText('What made Programming click today?')).toBeNull();
    expect(
      screen.queryByText('What felt clearer in Programming this week?'),
    ).toBeNull();
  });

  it('keeps the family summary focused on child activity', async () => {
    mockLinkedChildren = [CHILD_A];
    mockDashboardData = {
      children: [
        {
          profileId: 'child-a',
          displayName: 'Emma',
          consentStatus: null,
          respondedAt: null,
          summary: 'Emma is building confidence.',
          sessionsThisWeek: 2,
          sessionsLastWeek: 1,
          totalTimeThisWeek: 18,
          totalTimeLastWeek: 8,
          exchangesThisWeek: 10,
          exchangesLastWeek: 5,
          trend: 'up',
          subjects: [
            { subjectId: 'subject-a', name: 'Math', retentionStatus: 'strong' },
          ],
          guidedVsImmediateRatio: 0.5,
          retentionTrend: 'improving',
          totalSessions: 4,
          weeklyHeadline: undefined,
          currentlyWorkingOn: ['Fractions'],
          progress: null,
          currentStreak: 0,
          longestStreak: 0,
          totalXp: 0,
        },
      ],
      pendingNotices: [],
      demoMode: false,
    };

    render(<ParentHomeScreen activeProfile={makeProfile()} />);
    await waitForParentTransitionNotice();

    screen.getByText('Emma · 18 min this week');
    screen.getByText('2 of 5 profiles used');
    expect(screen.queryByText('You + Emma')).toBeNull();
    expect(screen.queryByText('You: Fractions in Math')).toBeNull();
    expect(screen.queryByText('You lead by example.')).toBeNull();
  });

  it('shows one activity-based prompt inside each child card when multiple children are linked', async () => {
    mockLinkedChildren = [CHILD_B, CHILD_A]; // intentionally reversed to verify sort
    mockDashboardData = {
      children: [
        {
          profileId: 'child-a',
          displayName: 'Emma',
          consentStatus: null,
          respondedAt: null,
          summary: '',
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
          weeklyHeadline: undefined,
          currentlyWorkingOn: ['Math'],
          progress: null,
          currentStreak: 0,
          longestStreak: 0,
          totalXp: 0,
        },
        {
          profileId: 'child-b',
          displayName: 'Liam',
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
          totalSessions: 3,
          weeklyHeadline: undefined,
          currentlyWorkingOn: [],
          progress: null,
          currentStreak: 0,
          longestStreak: 0,
          totalXp: 0,
        },
      ],
      pendingNotices: [],
      demoMode: false,
    };

    render(<ParentHomeScreen activeProfile={makeProfile()} />);
    await waitForParentTransitionNotice();

    const emmaPrompt = screen.getByTestId(
      'parent-home-tonight-child-a-active-focus',
    );
    const liamPrompt = screen.getByTestId(
      'parent-home-tonight-child-b-restart',
    );
    screen.getByTestId('parent-home-child-prompts-child-a');
    screen.getByTestId('parent-home-child-prompts-child-b');
    screen.getByText('What felt clearer in Math this week?');
    screen.getByText('What would make starting feel easy this week?');
    expect(
      screen.queryByTestId('parent-home-tonight-child-a-trickiest'),
    ).toBeNull();
    expect(
      screen.queryByTestId('parent-home-tonight-child-b-restart-easier'),
    ).toBeNull();
    expect(
      screen.queryByText('Emma: What felt clearer in Math this week?'),
    ).toBeNull();
    expect(
      screen.queryByText('Liam: What would make starting feel easy this week?'),
    ).toBeNull();
    expect(
      resolvedStyle('parent-home-tonight-child-a-active-focus').borderColor,
    ).not.toBe(
      resolvedStyle('parent-home-tonight-child-b-restart').borderColor,
    );
    expect(
      resolvedStyle('parent-home-check-child-child-a').shadowColor,
    ).not.toBe(resolvedStyle('parent-home-check-child-child-b').shadowColor);
    expect(emmaPrompt).toBeTruthy();
    expect(liamPrompt).toBeTruthy();
    screen.getByText('Liam may need attention');
  });

  it('shows ParentTransitionNotice after at least one child is linked', async () => {
    mockLinkedChildren = [CHILD_A];

    render(
      <ParentHomeScreen
        activeProfile={makeProfile({ id: 'profile-transition' })}
      />,
    );

    await waitForParentTransitionNotice();
  });

  it('pressing nudge card opens NudgeActionSheet for that child', async () => {
    mockLinkedChildren = [CHILD_A];

    render(<ParentHomeScreen activeProfile={makeProfile()} />);
    await waitForParentTransitionNotice();

    expect(screen.queryByTestId('nudge-action-sheet-close')).toBeNull();

    fireEvent.press(screen.getByTestId('parent-home-send-nudge-child-a'));

    screen.getByTestId('nudge-action-sheet-close');
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('derives childrenInGracePeriod from dashboard and passes it to WithdrawalCountdownBanner', () => {
    const respondedAt = new Date(
      Date.now() - 2 * 24 * 60 * 60 * 1000,
    ).toISOString();
    mockDashboardData = {
      children: [
        {
          profileId: 'child-a',
          displayName: 'Emma',
          consentStatus: 'WITHDRAWN',
          respondedAt,
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
          currentlyWorkingOn: [],
          progress: null,
          currentStreak: 0,
          longestStreak: 0,
          totalXp: 0,
        },
      ],
      pendingNotices: [],
      demoMode: false,
    };

    render(<ParentHomeScreen activeProfile={makeProfile()} />);

    expect(capturedBannerProps).not.toBeNull();
    expect(capturedBannerProps?.childrenInGracePeriod).toHaveLength(1);
    expect(capturedBannerProps?.childrenInGracePeriod[0]).toMatchObject({
      profileId: 'child-a',
      displayName: 'Emma',
      respondedAt,
    });
  });

  it('renders child-cap notifications with reset-time copy and dismiss action', async () => {
    mockLinkedChildren = [CHILD_A];
    mockChildCapNotifications = [
      {
        id: 'b0000000-0000-4000-8000-000000000001',
        ownerProfileId: 'profile-1',
        childProfileId: 'child-a',
        childDisplayName: 'Emma',
        kind: 'daily_exceeded',
        occurredOn: '2026-05-26',
        resetsAt: '2026-05-27T01:00:00.000Z',
        createdAt: '2026-05-26T12:00:00.000Z',
      },
    ];

    render(<ParentHomeScreen activeProfile={makeProfile()} />);
    await waitForParentTransitionNotice();

    screen.getByTestId(
      'parent-home-child-cap-notification-b0000000-0000-4000-8000-000000000001',
    );
    screen.getByText("Emma hit today's question limit");
    const message = screen.getByTestId(
      'parent-home-child-cap-notification-message-b0000000-0000-4000-8000-000000000001',
    ).props.children;
    expect(String(message)).toContain('They can try again after');
    expect(String(message)).not.toMatch(/midnight|1st/i);

    fireEvent.press(
      screen.getByTestId(
        'parent-home-child-cap-notification-dismiss-b0000000-0000-4000-8000-000000000001',
      ),
    );

    expect(mockDismissChildCapNotification).toHaveBeenCalledWith(
      'b0000000-0000-4000-8000-000000000001',
    );
  });
});
