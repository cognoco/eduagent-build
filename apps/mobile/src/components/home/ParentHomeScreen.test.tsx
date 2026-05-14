import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import type { DashboardData, Profile } from '@eduagent/schemas';

import {
  createRoutedMockFetch,
  createScreenWrapper,
  cleanupScreen,
} from '../../../test-utils/screen-render-harness';

import { ParentHomeScreen } from './ParentHomeScreen';

// ─── Transport boundary ───────────────────────────────────────────────────────
// The routed fetch is module-level so individual tests can call setRoute()
// before rendering. Default routes cover every query ParentHomeScreen fires on
// mount (dashboard, subscription, family subscription, learner-profile per child).
const mockFetch = createRoutedMockFetch({
  '/dashboard': { children: [], pendingNotices: [], demoMode: false },
  '/dashboard/demo': { children: [], pendingNotices: [], demoMode: true },
  '/subscription': { subscription: { tier: 'family' } },
  '/subscription/family': { family: { profileCount: 2, maxProfiles: 5 } },
  '/learner-profile': { profile: { accommodationMode: 'none' } },
});

jest.mock( // gc1-allow: transport-boundary — replaces real fetch with routed mock
  '../../lib/api-client',
  () =>
    require('../../test-utils/mock-api-routes').mockApiClientFactory(mockFetch),
);

// ─── Native / external boundaries (kept — require native runtime) ─────────────

jest.mock(
  'react-i18next',
  () => require('../../test-utils/mock-i18n').i18nMock,
);

jest.mock(
  'react-native-safe-area-context', // gc1-allow: native module that requires device/simulator to resolve insets
  () => require('../../test-utils/native-shims').safeAreaShim(),
);

const mockPush = jest.fn();
jest.mock(
  'expo-router', // gc1-allow: expo-router requires a native navigation container not available in JSDOM
  () =>
    require('../../test-utils/native-shims').expoRouterShim({ push: mockPush }),
);

jest.mock(
  '../../lib/theme', // gc1-allow: native ColorScheme not available in JSDOM
  () => ({
    useThemeColors: () => ({
      primary: '#6366f1',
      textPrimary: '#111827',
      textSecondary: '#6b7280',
    }),
  }),
);

jest.mock(
  '../../lib/sentry', // gc1-allow: Sentry SDK loads native module config at import — crashes Jest
  () => ({
    Sentry: { captureException: jest.fn() },
  }),
);

jest.mock(
  '../../lib/platform-alert', // gc1-allow: wraps Alert.alert which is unavailable in JSDOM
  () => ({ platformAlert: jest.fn() }),
);

// ─── WithdrawalCountdownBanner — kept with gc1-allow ─────────────────────────
// The banner pulls in useRestoreConsent (PUT mutation + multi-query invalidation).
// The grace-period test asserts prop-passing only, not banner internals, so we
// keep the lightweight stub to isolate the test from that mutation subtree.

type BannerProps = {
  childrenInGracePeriod: Array<{
    profileId: string;
    displayName: string;
    respondedAt: string;
  }>;
};
let capturedBannerProps: BannerProps | null = null;

jest.mock(
  '../family/WithdrawalCountdownBanner', // gc1-allow: complex subtree (useRestoreConsent mutation), isolated to keep test focused on prop-passing
  () => ({
    WithdrawalCountdownBanner: (props: BannerProps) => {
      capturedBannerProps = props;
      return null;
    },
  }),
);

// ─── Fixtures ─────────────────────────────────────────────────────────────────

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function waitForParentTransitionNotice(): Promise<void> {
  await waitFor(() => {
    screen.getByTestId('parent-transition-notice');
  });
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('ParentHomeScreen', () => {
  let queryClient: ReturnType<typeof createScreenWrapper>['queryClient'];

  beforeEach(() => {
    jest.clearAllMocks();
    capturedBannerProps = null;
    // Reset dashboard to empty (no children) so tests that don't need data
    // don't accidentally inherit data set by a previous test's setRoute() call.
    mockFetch.setRoute('/dashboard', {
      children: [],
      pendingNotices: [],
      demoMode: false,
    });
  });

  afterEach(() => {
    cleanupScreen(queryClient);
  });

  it('renders greeting with profile first name', () => {
    const parent = makeProfile({ displayName: 'Alex Parent' });
    let wrapper: ReturnType<typeof createScreenWrapper>['wrapper'];
    ({ queryClient, wrapper } = createScreenWrapper({
      activeProfile: parent,
      profiles: [parent],
    }));

    render(<ParentHomeScreen activeProfile={parent} />, { wrapper });

    screen.getByText('Hey Alex');
  });

  it('renders one command card per linked child with actions inside it', async () => {
    const parent = makeProfile();
    let wrapper: ReturnType<typeof createScreenWrapper>['wrapper'];
    ({ queryClient, wrapper } = createScreenWrapper({
      activeProfile: parent,
      profiles: [parent, CHILD_A, CHILD_B],
    }));

    render(<ParentHomeScreen activeProfile={parent} />, { wrapper });
    await waitForParentTransitionNotice();

    screen.getByTestId('parent-home-check-child-child-a');
    screen.getByTestId('parent-home-check-child-child-b');
    screen.getByTestId('parent-home-child-progress-child-a');
    screen.getByTestId('parent-home-weekly-report-child-a');
    screen.getByTestId('parent-home-weekly-report-child-b');
    screen.getByTestId('parent-home-send-nudge-child-a');
    screen.getByTestId('parent-home-send-nudge-child-b');
    screen.getByText('Children');
  });

  it('routes the child card header to the child profile detail screen', async () => {
    const parent = makeProfile();
    let wrapper: ReturnType<typeof createScreenWrapper>['wrapper'];
    ({ queryClient, wrapper } = createScreenWrapper({
      activeProfile: parent,
      profiles: [parent, CHILD_A],
    }));

    render(<ParentHomeScreen activeProfile={parent} />, { wrapper });
    await waitForParentTransitionNotice();

    fireEvent.press(screen.getByTestId('parent-home-check-child-child-a'));
    expect(mockPush).toHaveBeenLastCalledWith({
      pathname: '/(app)/child/[profileId]',
      params: { profileId: 'child-a' },
    });
  });

  it('routes the progress action to child progress', async () => {
    const parent = makeProfile();
    let wrapper: ReturnType<typeof createScreenWrapper>['wrapper'];
    ({ queryClient, wrapper } = createScreenWrapper({
      activeProfile: parent,
      profiles: [parent, CHILD_A],
    }));

    render(<ParentHomeScreen activeProfile={parent} />, { wrapper });
    await waitForParentTransitionNotice();

    fireEvent.press(screen.getByTestId('parent-home-child-progress-child-a'));
    expect(mockPush).toHaveBeenLastCalledWith({
      pathname: '/(app)/progress',
      params: { profileId: 'child-a' },
    });
  });

  it('routes the reports action to the child reports list', async () => {
    const parent = makeProfile();
    let wrapper: ReturnType<typeof createScreenWrapper>['wrapper'];
    ({ queryClient, wrapper } = createScreenWrapper({
      activeProfile: parent,
      profiles: [parent, CHILD_A],
    }));

    render(<ParentHomeScreen activeProfile={parent} />, { wrapper });
    await waitForParentTransitionNotice();

    fireEvent.press(screen.getByTestId('parent-home-weekly-report-child-a'));

    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenLastCalledWith('/(app)/child/child-a/reports');
  });

  it('keeps own learning out of parent Home because it has its own tab', () => {
    const parent = makeProfile();
    let wrapper: ReturnType<typeof createScreenWrapper>['wrapper'];
    ({ queryClient, wrapper } = createScreenWrapper({
      activeProfile: parent,
      profiles: [parent],
    }));

    render(<ParentHomeScreen activeProfile={parent} />, { wrapper });

    expect(screen.queryByTestId('parent-home-own-learning')).toBeNull();
    expect(screen.queryByText('Continue your own learning')).toBeNull();
  });

  it('shows an add-first-child state when no children are linked', () => {
    const parent = makeProfile();
    let wrapper: ReturnType<typeof createScreenWrapper>['wrapper'];
    ({ queryClient, wrapper } = createScreenWrapper({
      activeProfile: parent,
      profiles: [parent],
    }));

    render(<ParentHomeScreen activeProfile={parent} />, { wrapper });

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
    const dashboardData: DashboardData = {
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
    mockFetch.setRoute('/dashboard', dashboardData);

    const parent = makeProfile();
    let wrapper: ReturnType<typeof createScreenWrapper>['wrapper'];
    ({ queryClient, wrapper } = createScreenWrapper({
      activeProfile: parent,
      profiles: [parent, CHILD_A],
    }));

    render(<ParentHomeScreen activeProfile={parent} />, { wrapper });
    await waitForParentTransitionNotice();

    screen.getByTestId('parent-home-tonight-section');
    screen.getByText('Ask Emma: what made Fractions click today?');
    screen.getByText('Fractions · 18 min this week');

    fireEvent.press(screen.getByTestId('parent-home-tonight-child-a-primary'));
    expect(mockPush).toHaveBeenLastCalledWith({
      pathname: '/(app)/progress',
      params: { profileId: 'child-a' },
    });
  });

  it('ranks multi-child tonight prompts by sessions — most active child appears first', async () => {
    const dashboardData: DashboardData = {
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
          totalSessions: 0,
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
    mockFetch.setRoute('/dashboard', dashboardData);

    // profiles intentionally reversed (Liam before Emma) to verify sort
    const parent = makeProfile();
    let wrapper: ReturnType<typeof createScreenWrapper>['wrapper'];
    ({ queryClient, wrapper } = createScreenWrapper({
      activeProfile: parent,
      profiles: [parent, CHILD_B, CHILD_A],
    }));

    render(<ParentHomeScreen activeProfile={parent} />, { wrapper });
    await waitForParentTransitionNotice();

    const emmaPrompt = screen.getByTestId(
      'parent-home-tonight-child-a-primary',
    );
    const liamPrompt = screen.getByTestId(
      'parent-home-tonight-child-b-primary',
    );
    const allPrompts = screen.getAllByTestId(/^parent-home-tonight-/);
    // Emma (5 sessions) must appear before Liam (0 sessions) regardless of input order
    expect(allPrompts.indexOf(emmaPrompt)).toBeLessThan(
      allPrompts.indexOf(liamPrompt),
    );
  });

  it('shows ParentTransitionNotice after at least one child is linked', async () => {
    const parent = makeProfile({ id: 'profile-transition' });
    let wrapper: ReturnType<typeof createScreenWrapper>['wrapper'];
    ({ queryClient, wrapper } = createScreenWrapper({
      activeProfile: parent,
      profiles: [parent, CHILD_A],
    }));

    render(<ParentHomeScreen activeProfile={parent} />, { wrapper });

    await waitForParentTransitionNotice();
  });

  it('pressing nudge card opens NudgeActionSheet for that child', async () => {
    const parent = makeProfile();
    let wrapper: ReturnType<typeof createScreenWrapper>['wrapper'];
    ({ queryClient, wrapper } = createScreenWrapper({
      activeProfile: parent,
      profiles: [parent, CHILD_A],
    }));

    render(<ParentHomeScreen activeProfile={parent} />, { wrapper });
    await waitForParentTransitionNotice();

    expect(screen.queryByTestId('nudge-action-sheet-close')).toBeNull();

    fireEvent.press(screen.getByTestId('parent-home-send-nudge-child-a'));

    screen.getByTestId('nudge-action-sheet-close');
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('derives childrenInGracePeriod from dashboard and passes it to WithdrawalCountdownBanner', async () => {
    const respondedAt = new Date(
      Date.now() - 2 * 24 * 60 * 60 * 1000,
    ).toISOString();
    const dashboardData: DashboardData = {
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
    mockFetch.setRoute('/dashboard', dashboardData);

    const parent = makeProfile();
    let wrapper: ReturnType<typeof createScreenWrapper>['wrapper'];
    ({ queryClient, wrapper } = createScreenWrapper({
      activeProfile: parent,
      profiles: [parent],
    }));

    render(<ParentHomeScreen activeProfile={parent} />, { wrapper });

    // Wait for the dashboard query to resolve so childrenInGracePeriod propagates
    await waitFor(() => {
      expect(capturedBannerProps).not.toBeNull();
    });

    expect(capturedBannerProps?.childrenInGracePeriod).toHaveLength(1);
    expect(capturedBannerProps?.childrenInGracePeriod[0]).toMatchObject({
      profileId: 'child-a',
      displayName: 'Emma',
      respondedAt,
    });
  });
});
