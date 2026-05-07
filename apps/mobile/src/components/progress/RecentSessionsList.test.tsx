import { fireEvent, render, screen } from '@testing-library/react-native';

import { RecentSessionsList } from './RecentSessionsList';

const mockPush = jest.fn();
const mockUseProfile = jest.fn();
const mockUseProfileSessions = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      if (opts) return `${key}:${JSON.stringify(opts)}`;
      return key;
    },
  }),
}));

jest.mock('../../lib/profile', () => ({
  useProfile: () => mockUseProfile(),
}));

jest.mock('../../hooks/use-progress', () => ({
  useProfileSessions: (...args: unknown[]) => mockUseProfileSessions(...args),
}));

describe('RecentSessionsList', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseProfile.mockReturnValue({
      activeProfile: { id: 'owner-1', isOwner: true, displayName: 'Parent' },
    });
    mockUseProfileSessions.mockReturnValue({
      data: [
        {
          sessionId: 'session-1',
          sessionType: 'learning',
          startedAt: '2026-05-07T10:00:00Z',
          durationSeconds: 120,
          wallClockSeconds: 120,
          homeworkSummary: null,
          displaySummary: null,
          highlight: null,
        },
      ],
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });
  });

  it('pushes the child parent route before cross-profile session details', () => {
    render(<RecentSessionsList profileId="child-1" />);

    fireEvent.press(screen.getByTestId('session-card-session-1'));

    expect(mockPush).toHaveBeenCalledTimes(2);
    expect(mockPush).toHaveBeenNthCalledWith(1, {
      pathname: '/(app)/child/[profileId]',
      params: { profileId: 'child-1' },
    });
    expect(mockPush).toHaveBeenNthCalledWith(2, {
      pathname: '/(app)/child/[profileId]/session/[sessionId]',
      params: {
        profileId: 'child-1',
        sessionId: 'session-1',
      },
    });
  });

  it('keeps active-profile session navigation on the learner stack', () => {
    mockUseProfile.mockReturnValue({
      activeProfile: { id: 'child-1', isOwner: false, displayName: 'Child' },
    });

    render(<RecentSessionsList profileId="child-1" />);

    fireEvent.press(screen.getByTestId('session-card-session-1'));

    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith('/session-summary/session-1');
  });
});
