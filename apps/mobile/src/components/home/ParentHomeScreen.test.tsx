import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import type {
  DashboardData,
  LearningResumeTarget,
  Profile,
} from '@eduagent/schemas';

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
let mockParentResumeTarget: LearningResumeTarget | null | undefined;

jest.mock(
  '../../lib/profile' /* gc1-allow: profile context requires full ProfileProvider setup */,
  () => ({
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
  '../../hooks/use-progress' /* gc1-allow: external hook boundary — wraps TanStack query that requires QueryClient */,
  () => ({
    useLearningResumeTarget: () => ({ data: mockParentResumeTarget }),
  }),
);

jest.mock(
  '../../hooks/use-subscription' /* gc1-allow: external hook boundary — wraps TanStack query that requires QueryClient */,
  () => ({
    useSubscription: () => ({ data: { tier: 'family' } }),
    useFamilySubscription: () => ({
      data: { profileCount: 2, maxProfiles: 5 },
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

const makeResumeTarget = (
  overrides: Partial<LearningResumeTarget> = {},
): LearningResumeTarget => ({
  subjectId: '11111111-1111-4111-8111-111111111111',
  subjectName: 'Math',
  topicId: '22222222-2222-4222-8222-222222222222',
  topicTitle: 'Fractions',
  sessionId: null,
  resumeFromSessionId: null,
  resumeKind: 'recent_topic',
  lastActivityAt: '2026-05-15T08:00:00.000Z',
  reason: 'recent_topic',
  ...overrides,
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
    mockParentResumeTarget = undefined;
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
    screen.getByText("Show them how it's done: start a quick session.");
    expect(screen.queryByTestId('child-accommodation-row-child-a')).toBeNull();
    expect(screen.queryByTestId('child-accommodation-row-child-b')).toBeNull();
  });

  it('routes the child card header to the child profile detail screen', async () => {
    mockLinkedChildren = [CHILD_A];

    render(<ParentHomeScreen activeProfile={makeProfile()} />);
    await waitForParentTransitionNotice();

    fireEvent.press(screen.getByTestId('parent-home-check-child-child-a'));
    expect(mockPush).toHaveBeenLastCalledWith({
      pathname: '/(app)/child/[profileId]',
      params: { profileId: 'child-a', mode: 'settings' },
    });
  });

  it('routes the progress action to the child quick progress screen', async () => {
    mockLinkedChildren = [CHILD_A];

    render(<ParentHomeScreen activeProfile={makeProfile()} />);
    await waitForParentTransitionNotice();

    fireEvent.press(screen.getByTestId('parent-home-child-progress-child-a'));
    expect(mockPush).toHaveBeenLastCalledWith({
      pathname: '/(app)/child/[profileId]',
      params: { profileId: 'child-a', mode: 'progress' },
    });
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

    fireEvent.press(screen.getByTestId('add-first-child-cta'));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/create-profile',
      params: { for: 'child' },
    });
  });

  it('shows tonight prompts and compact status from dashboard data', async () => {
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

    screen.getByTestId('parent-home-tonight-section');
    screen.getByText('Conversation starters');
    screen.getByText('What made Fractions click today?');
    expect(
      screen.queryByText('Emma: What made Fractions click today?'),
    ).toBeNull();
    const promptStyles = [
      resolvedStyle('parent-home-tonight-child-a-primary'),
      resolvedStyle('parent-home-tonight-child-a-trickiest'),
      resolvedStyle('parent-home-tonight-child-a-tomorrow'),
    ];
    promptStyles.forEach((style) => {
      expect(style).toEqual(
        expect.objectContaining({
          borderWidth: 1,
          elevation: 1,
          shadowOpacity: 0.08,
        }),
      );
    });
    expect(new Set(promptStyles.map((style) => style.borderColor)).size).toBe(
      3,
    );
    screen.getByText('Fractions · 18 min this week');
    screen.getByText('Emma · 18 min this week');
    screen.getByText('2 of 5 profiles used');

    fireEvent.press(screen.getByTestId('parent-home-tonight-child-a-primary'));
    expect(mockPush).toHaveBeenLastCalledWith({
      pathname: '/(app)/child/[profileId]',
      params: { profileId: 'child-a', mode: 'progress' },
    });
  });

  it('includes the parent in the family summary when they have been learning', async () => {
    mockLinkedChildren = [CHILD_A];
    mockParentResumeTarget = makeResumeTarget();
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

    screen.getByText('You + Emma');
    screen.getByText('Emma: 18 min this week');
    screen.getByText('You: Fractions in Math');
    screen.getByText('You lead by example.');
  });

  it('ranks multi-child tonight prompts by sessions — most active child appears first', async () => {
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
      'parent-home-tonight-child-a-primary',
    );
    const liamPrompt = screen.getByTestId(
      'parent-home-tonight-child-b-primary',
    );
    screen.getByText('Emma: What made Math click today?');
    screen.getByText('Liam: What would make starting feel easy tonight?');
    const allPrompts = screen.getAllByTestId(/^parent-home-tonight-/);
    // Emma (5 sessions) must appear before Liam (0 sessions) regardless of input order
    expect(allPrompts.indexOf(emmaPrompt)).toBeLessThan(
      allPrompts.indexOf(liamPrompt),
    );
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
});
