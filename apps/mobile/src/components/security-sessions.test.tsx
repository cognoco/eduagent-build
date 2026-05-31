import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { cleanupScreen, renderScreen } from '../test-utils/screen-render';
import { SecuritySessions } from './security-sessions';

const mockGetSessions = jest.fn();
const mockRevokeOther = jest.fn();

jest.mock('@clerk/clerk-expo', () => ({
  useAuth: () => ({ sessionId: 'session-current' }),
  useUser: () => ({
    user: {
      getSessions: mockGetSessions,
    },
  }),
}));

function sessionsFixture() {
  return [
    {
      id: 'session-current',
      lastActiveAt: new Date('2026-05-31T10:00:00.000Z'),
      latestActivity: {
        browserName: 'Mobile Safari',
        deviceType: 'Phone',
        city: 'Oslo',
        country: 'NO',
      },
      revoke: jest.fn(),
    },
    {
      id: 'session-other',
      lastActiveAt: new Date('2026-05-30T09:00:00.000Z'),
      latestActivity: {
        browserName: 'Chrome',
        deviceType: 'Desktop',
        city: 'Prague',
        country: 'CZ',
      },
      revoke: mockRevokeOther,
    },
  ];
}

describe('SecuritySessions', () => {
  let active: ReturnType<typeof renderScreen> | null = null;

  beforeEach(() => {
    jest.clearAllMocks();
    mockRevokeOther.mockResolvedValue({});
    mockGetSessions.mockResolvedValue(sessionsFixture());
  });

  afterEach(() => {
    if (active) active.cleanup();
    active = null;
    cleanupScreen();
  });

  it('[auth-4] loads all user sessions through user.getSessions', async () => {
    active = renderScreen(<SecuritySessions />);

    await waitFor(() => {
      expect(mockGetSessions).toHaveBeenCalled();
      screen.getByTestId('session-row-session-current');
      screen.getByTestId('session-row-session-other');
    });
  });

  it('protects the current session from revocation', async () => {
    active = renderScreen(<SecuritySessions />);

    await waitFor(() => {
      screen.getByTestId('session-current-badge-session-current');
    });

    expect(screen.queryByTestId('revoke-session-session-current')).toBeNull();
  });

  it('[auth-4] revokes another device session and refreshes the list', async () => {
    active = renderScreen(<SecuritySessions />);

    await waitFor(() => {
      screen.getByTestId('revoke-session-session-other');
    });

    fireEvent.press(screen.getByTestId('revoke-session-session-other'));

    await waitFor(() => {
      expect(mockRevokeOther).toHaveBeenCalled();
      expect(mockGetSessions).toHaveBeenCalledTimes(2);
    });
  });

  it('shows a retryable load failure state', async () => {
    mockGetSessions.mockRejectedValue(new Error('Clerk unavailable'));
    active = renderScreen(<SecuritySessions />);

    await waitFor(() => {
      screen.getByTestId('security-sessions-load-error');
      screen.getByText("We couldn't load your devices");
    });
  });
});
