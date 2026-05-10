import { fireEvent, render, screen } from '@testing-library/react-native';

import type { DashboardData, Profile } from '@eduagent/schemas';

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  router: { push: (...args: unknown[]) => mockPush(...args) },
}));

jest.mock(
  'react-i18next',
  () => require('../../test-utils/mock-i18n').i18nMock,
);

jest.mock(
  '../../lib/theme' /* gc1-allow: theme provider stub at unit-test boundary; real theme needs native vars + persona context absent in jsdom */,
  () => ({
    useThemeColors: () => ({ textSecondary: '#94a3b8' }),
  }),
);

const { ChildCard } = require('./ChildCard');

const parentProfile = {
  id: 'parent-id',
  accountId: 'account-id',
  displayName: 'Parent',
  avatarUrl: null,
  birthYear: 1988,
  location: null,
  isOwner: true,
  hasPremiumLlm: false,
  conversationLanguage: 'en',
  pronouns: null,
  consentStatus: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
} satisfies Profile;

function child(id: string, displayName: string): Profile {
  return {
    ...parentProfile,
    id,
    displayName,
    isOwner: false,
  };
}

function dashboard(children: DashboardData['children']): DashboardData {
  return {
    children,
    pendingNotices: [],
    demoMode: false,
  };
}

function dashboardChild(
  profileId: string,
  displayName: string,
): DashboardData['children'][number] {
  return {
    profileId,
    displayName,
    consentStatus: null,
    respondedAt: null,
    summary: `${displayName}: steady progress.`,
    sessionsThisWeek: 2,
    sessionsLastWeek: 1,
    totalTimeThisWeek: 24,
    totalTimeLastWeek: 12,
    exchangesThisWeek: 8,
    exchangesLastWeek: 4,
    trend: 'up',
    subjects: [],
    guidedVsImmediateRatio: 0,
    retentionTrend: 'stable',
    totalSessions: 4,
    weeklyHeadline: {
      label: 'Words learned',
      value: 12,
      comparison: 'up from 5 last week',
    },
    currentlyWorkingOn: [],
    progress: null,
    currentStreak: 0,
    longestStreak: 0,
    totalXp: 0,
  };
}

describe('ChildCard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders null with no linked children', () => {
    render(<ChildCard linkedChildren={[]} dashboard={undefined} />);

    expect(screen.queryByTestId('home-child-card')).toBeNull();
  });

  it('renders a single child with the weekly headline', () => {
    const emma = child('child-1', 'Emma');

    render(
      <ChildCard
        linkedChildren={[emma]}
        dashboard={dashboard([dashboardChild('child-1', 'Emma')])}
      />,
    );

    screen.getByTestId('home-child-card');
    screen.getByTestId('home-child-card-row-child-1');
    screen.getByText('Emma');
    screen.getByText('12 words learned — up from 5 last week');
  });

  it('renders multiple children as stacked rows', () => {
    const emma = child('child-1', 'Emma');
    const anna = child('child-2', 'Anna');

    render(
      <ChildCard
        linkedChildren={[emma, anna]}
        dashboard={dashboard([
          dashboardChild('child-1', 'Emma'),
          dashboardChild('child-2', 'Anna'),
        ])}
      />,
    );

    screen.getByTestId('home-child-card-row-child-1');
    screen.getByTestId('home-child-card-row-child-2');
    screen.getByText('Emma');
    screen.getByText('Anna');
  });

  it('renders names with skeleton signals while dashboard data is missing', () => {
    const emma = child('child-1', 'Emma');

    render(<ChildCard linkedChildren={[emma]} dashboard={undefined} />);

    screen.getByText('Emma');
    screen.getByText('-');
  });

  it('falls back to skeleton signal when API omits weeklyHeadline (contract drift)', () => {
    // Stale API deployments can return a child entry without weeklyHeadline
    // even though the schema requires it. Crashing the whole home screen on
    // contract drift is unacceptable — fall through to the skeleton instead.
    const emma = child('child-1', 'Emma');
    const partial = dashboardChild('child-1', 'Emma');
    // Cast through unknown so the test can simulate the malformed shape that
    // the runtime actually receives (ts-only field, runtime is plain JSON).
    delete (partial as unknown as { weeklyHeadline?: unknown }).weeklyHeadline;

    render(
      <ChildCard linkedChildren={[emma]} dashboard={dashboard([partial])} />,
    );

    screen.getByText('Emma');
    screen.getByText('-');
  });

  it('navigates to Family when pressed', () => {
    const emma = child('child-1', 'Emma');

    render(<ChildCard linkedChildren={[emma]} dashboard={undefined} />);

    fireEvent.press(screen.getByTestId('home-child-card'));

    expect(mockPush).toHaveBeenCalledWith('/(app)/family');
  });
});
