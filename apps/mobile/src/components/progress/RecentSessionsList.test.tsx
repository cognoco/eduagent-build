import { fireEvent, render, screen } from '@testing-library/react-native';

import { RecentSessionsList } from './RecentSessionsList';

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockBack = jest.fn();
const mockCanGoBack = jest.fn();
const mockRouter = {
  push: mockPush,
  replace: mockReplace,
  back: mockBack,
  canGoBack: mockCanGoBack,
};

jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      if (key === 'parentView.index.recentSessions') return 'Recent sessions';
      if (key === 'parentView.index.refresh') return 'Refresh';
      if (key === 'parentView.index.refreshChildProfile')
        return 'Refresh child profile';
      if (key === 'parentView.index.couldNotLoadSessions')
        return "We couldn't load recent sessions right now.";
      if (key === 'parentView.index.noSessionsYet') {
        return `No sessions yet for ${String(opts?.name ?? 'your child')}`;
      }
      if (key === 'parentView.index.startSession') return 'Start a session';
      if (key === 'parentView.index.goToCurriculum') return 'Go to curriculum';
      if (key === 'parentView.index.viewSessionFrom')
        return `View session from ${String(opts?.date ?? '')}`;
      if (key === 'parentView.index.yourChild') return 'your child';
      if (key === 'common.goHome') return 'Go Home';
      if (key === 'time.duration.minutesOne') return '1m';
      if (key === 'time.duration.minutes')
        return `${String(opts?.count ?? 0)}m`;
      return key;
    },
  }),
}));

jest.mock(
  '../../lib/profile' /* gc1-allow: component-level test needs a controlled active profile without mounting the full profile provider tree */,
  () => ({
    useProfile: jest.fn(),
  }),
);

jest.mock(
  '../../hooks/use-active-profile-role' /* gc1-allow: component-level test needs deterministic child/self routing without app-shell context */,
  () => ({
    useActiveProfileRole: jest.fn(),
  }),
);

const { useProfile } = jest.requireMock('../../lib/profile') as {
  useProfile: jest.Mock;
};
const { useActiveProfileRole } = jest.requireMock(
  '../../hooks/use-active-profile-role',
) as {
  useActiveProfileRole: jest.Mock;
};

function makeQuery(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    data: [],
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
    ...overrides,
  };
}

describe('RecentSessionsList', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useActiveProfileRole.mockReturnValue('owner');
    mockCanGoBack.mockReturnValue(false);
  });

  it('shows a clear self-serve CTA when the active profile has no sessions', () => {
    useProfile.mockReturnValue({
      activeProfile: {
        id: 'self-profile',
        displayName: 'Alex',
      },
    });

    render(
      <RecentSessionsList
        profileId="self-profile"
        sessionsQuery={makeQuery() as never}
      />,
    );

    screen.getByText('No sessions yet for Alex');
    fireEvent.press(screen.getByTestId('recent-sessions-empty-action'));

    // Ancestor-chain guardrail: home must be pushed BEFORE session so
    // router.back() from session returns to home, not the tab's first route.
    // Assert count as well as order so a stray extra/missing push can't slip by.
    expect(mockPush).toHaveBeenCalledTimes(2);
    expect(mockPush).toHaveBeenNthCalledWith(1, '/(app)/home');
    expect(mockPush).toHaveBeenNthCalledWith(2, '/(app)/session');
  });

  it('routes parents to child curriculum from the empty state', () => {
    useProfile.mockReturnValue({
      activeProfile: {
        id: 'owner-profile',
        displayName: 'Parent',
      },
    });

    render(
      <RecentSessionsList
        profileId="child-profile"
        sessionsQuery={makeQuery() as never}
      />,
    );

    fireEvent.press(screen.getByTestId('recent-sessions-empty-action'));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/child/[profileId]/curriculum',
      params: { profileId: 'child-profile' },
    });
  });

  it('shows active time, not wall-clock, when both are present', () => {
    useProfile.mockReturnValue({
      activeProfile: {
        id: 'child-profile',
        displayName: 'Sam',
      },
    });

    render(
      <RecentSessionsList
        profileId="child-profile"
        sessionsQuery={
          makeQuery({
            data: [
              {
                sessionId: 'sess-1',
                subjectId: 'subj-1',
                subjectName: 'Math',
                topicId: 'topic-1',
                topicTitle: 'Fractions',
                sessionType: 'practice',
                startedAt: '2026-05-29T10:00:00Z',
                durationSeconds: 60,
                wallClockSeconds: 600,
                displaySummary: null,
                highlight: null,
              },
            ],
          }) as never
        }
      />,
    );

    // Active time = 60s → "1m". Wall-clock = 600s → "10m".
    // Asserting "1m" proves we prefer durationSeconds, not wallClockSeconds.
    screen.getByText('1m');
    expect(screen.queryByText('10m')).toBeNull();
  });

  it('offers an escape hatch alongside retry when loading recent sessions fails', () => {
    const refetch = jest.fn();
    useProfile.mockReturnValue({
      activeProfile: {
        id: 'self-profile',
        displayName: 'Alex',
      },
    });

    render(
      <RecentSessionsList
        profileId="self-profile"
        sessionsQuery={
          makeQuery({
            isError: true,
            error: new Error('offline'),
            refetch,
          }) as never
        }
      />,
    );

    fireEvent.press(screen.getByTestId('recent-sessions-retry'));
    fireEvent.press(screen.getByTestId('recent-sessions-go-home'));

    expect(refetch).toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith('/(app)/home');
  });

  it('routes parent-viewing-child load errors back toward family home instead of child curriculum', () => {
    const refetch = jest.fn();
    useProfile.mockReturnValue({
      activeProfile: {
        id: 'owner-profile',
        displayName: 'Parent',
      },
    });

    render(
      <RecentSessionsList
        profileId="child-profile"
        sessionsQuery={
          makeQuery({
            isError: true,
            error: new Error('offline'),
            refetch,
          }) as never
        }
      />,
    );

    fireEvent.press(screen.getByTestId('recent-sessions-go-home'));

    expect(mockReplace).toHaveBeenCalledWith('/(app)/home');
    expect(mockPush).not.toHaveBeenCalledWith({
      pathname: '/(app)/child/[profileId]/curriculum',
      params: { profileId: 'child-profile' },
    });
  });
});
