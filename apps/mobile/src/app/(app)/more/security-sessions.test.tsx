import React from 'react';

import { cleanupScreen, renderScreen } from '../../../test-utils/screen-render';

const mockReplace = jest.fn();
let mockShowAccountSecurity = true;

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace }),
}));

jest.mock(
  '../../../hooks/use-navigation-contract' /* gc1-allow: route gate test pins the navigation contract branch without rebuilding the full profile/proxy context */,
  () => ({
    useNavigationContract: () => ({
      gates: { showAccountSecurity: mockShowAccountSecurity },
    }),
  }),
);

jest.mock(
  '../../../components/security-sessions' /* gc1-allow: route test isolates deep-link gating; SecuritySessions behavior has its own Clerk-boundary tests */,
  () => ({
    SecuritySessions: () => {
      const { Text } = require('react-native');
      return <Text testID="security-sessions-content">Sessions</Text>;
    },
  }),
);

const SecuritySessionsScreen = require('./security-sessions')
  .default as React.ComponentType;

describe('SecuritySessionsScreen', () => {
  let active: ReturnType<typeof renderScreen> | null = null;

  beforeEach(() => {
    jest.clearAllMocks();
    mockShowAccountSecurity = true;
  });

  afterEach(() => {
    if (active) active.cleanup();
    active = null;
    cleanupScreen();
  });

  it('renders for account owners', () => {
    active = renderScreen(<SecuritySessionsScreen />);

    active.result.getByTestId('security-sessions-content');
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('blocks non-owner deep links', () => {
    mockShowAccountSecurity = false;

    active = renderScreen(<SecuritySessionsScreen />);

    expect(active.result.queryByTestId('security-sessions-content')).toBeNull();
    expect(mockReplace).toHaveBeenCalledWith('/(app)/more/account');
  });

  it('blocks parent-proxy deep links through the same account-security gate', () => {
    mockShowAccountSecurity = false;

    active = renderScreen(<SecuritySessionsScreen />);

    expect(active.result.queryByTestId('security-sessions-content')).toBeNull();
    expect(mockReplace).toHaveBeenCalledWith('/(app)/more/account');
  });
});
