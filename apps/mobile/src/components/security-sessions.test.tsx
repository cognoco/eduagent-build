import { Alert } from 'react-native';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { cleanupScreen, renderScreen } from '../test-utils/screen-render';
import { SecuritySessions } from './security-sessions';

const mockGetSessions = jest.fn();
const mockRevokeCurrent = jest.fn();
const mockRevokeOther = jest.fn();
const mockRevokeOther2 = jest.fn();

jest.mock('@clerk/clerk-expo', () => ({
  useAuth: () => ({ sessionId: 'session-current' }),
  useUser: () => ({
    user: {
      getSessions: mockGetSessions,
    },
  }),
  // [CRITICAL-2b] Passthrough: the wrapped revoke runs directly in tests.
  useReverification: (fn: (...args: unknown[]) => unknown) => fn,
}));

// Auto-confirm the destructive "sign out all" alert so the handler proceeds.
// The real platformAlert runs (Platform.OS is 'ios' under jest, so it routes
// to Alert.alert); only RN's Alert — the true native boundary — is spied.
jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
  const confirm =
    buttons?.find((b) => b.style === 'destructive') ??
    buttons?.[buttons.length - 1];
  confirm?.onPress?.();
});

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
        ipAddress: '192.0.2.10',
      },
      revoke: mockRevokeCurrent,
    },
    {
      id: 'session-other',
      lastActiveAt: new Date('2026-05-30T09:00:00.000Z'),
      latestActivity: {
        browserName: 'Chrome',
        deviceType: 'Desktop',
        city: 'Prague',
        country: 'CZ',
        ipAddress: '198.51.100.5',
      },
      revoke: mockRevokeOther,
    },
    {
      id: 'session-other-2',
      lastActiveAt: new Date('2026-05-29T08:00:00.000Z'),
      latestActivity: {
        browserName: 'Firefox',
        deviceType: 'Desktop',
        city: 'Berlin',
        country: 'DE',
        ipAddress: '203.0.113.7',
      },
      revoke: mockRevokeOther2,
    },
  ];
}

describe('SecuritySessions', () => {
  let active: ReturnType<typeof renderScreen> | null = null;

  beforeEach(() => {
    jest.clearAllMocks();
    mockRevokeOther.mockResolvedValue({});
    mockRevokeOther2.mockResolvedValue({});
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

    expect(
      screen.getByTestId('revoke-session-session-other').props
        .accessibilityLabel,
    ).toBe('Revoke Desktop - Chrome session');

    fireEvent.press(screen.getByTestId('revoke-session-session-other'));

    await waitFor(() => {
      expect(mockRevokeOther).toHaveBeenCalled();
      expect(mockGetSessions).toHaveBeenCalledTimes(2);
    });
  });

  it('[HIGH-1] signs out all other devices in one action, sparing the current session', async () => {
    active = renderScreen(<SecuritySessions />);

    await waitFor(() => {
      screen.getByTestId('security-sessions-revoke-all');
    });

    fireEvent.press(screen.getByTestId('security-sessions-revoke-all'));

    await waitFor(() => {
      expect(mockRevokeOther).toHaveBeenCalledTimes(1);
      expect(mockRevokeOther2).toHaveBeenCalledTimes(1);
      // The list refreshes after the bulk revoke.
      expect(mockGetSessions).toHaveBeenCalledTimes(2);
    });
    // The current session's own revoke is never invoked by the bulk action.
    expect(mockRevokeCurrent).not.toHaveBeenCalled();
  });

  it('[HIGH-2] surfaces the IP address so identical device labels can be told apart', async () => {
    active = renderScreen(<SecuritySessions />);

    await waitFor(() => {
      screen.getByText(/198\.51\.100\.5/);
      screen.getByText(/203\.0\.113\.7/);
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

  it('shows an escape action when no security sessions are listed', async () => {
    const onBackToAccount = jest.fn();
    mockGetSessions.mockResolvedValue([]);
    active = renderScreen(
      <SecuritySessions onBackToAccount={onBackToAccount} />,
    );

    await waitFor(() => {
      screen.getByTestId('security-sessions-empty');
    });

    fireEvent.press(screen.getByTestId('security-sessions-empty-back'));
    expect(onBackToAccount).toHaveBeenCalledTimes(1);
  });
});
