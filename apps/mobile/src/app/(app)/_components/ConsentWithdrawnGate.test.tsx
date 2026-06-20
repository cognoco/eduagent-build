/**
 * [ACCOUNT-25 child-side / ACCOUNT-23] WI-871 — consent-withdrawn gate.
 *
 * When a parent withdraws consent, the child's access is fully replaced by this
 * gate during the 7-day deletion grace period. Deterministic coverage for the
 * pieces the flow-revision sweep could only source-check:
 *   - the gate renders the deletion-pending messaging (not the pending/waiting UI)
 *   - the "Refresh status" control re-checks consent (the restore-recheck path:
 *     a parent who restores consent from their dashboard is picked up here when
 *     the child taps refresh, which invalidates the consent-status + profiles
 *     queries that drive the gate)
 *   - sign-out is reachable from the gate
 *
 * No mailbox/SMTP involved — the gate reads consent state from the active
 * profile fixture and drives recovery purely through React Query invalidation.
 */
import { screen, fireEvent, waitFor } from '@testing-library/react-native';
import {
  renderScreen,
  cleanupScreen,
  createTestProfile,
} from '../../../test-utils/screen-render';
import type { Profile } from '../../../lib/profile';

jest.mock(
  'react-i18next',
  () => require('../../../test-utils/mock-i18n').i18nMock,
);

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

// prettier-ignore
jest.mock('../../../lib/theme', /* gc1-allow: nativewind vars() does not resolve 'react' in jest; stub theme hooks so screen tests don't crash on import */ () => ({
  useTheme: () => ({ colorScheme: 'light' }),
  useThemeColors: () => ({
    accent: '#0ea5e9',
    border: '#d4d4d8',
    muted: '#71717a',
    surface: '#ffffff',
    textInverse: '#ffffff',
    textPrimary: '#18181b',
    textSecondary: '#52525b',
    warning: '#a16207',
  }),
  useTokenVars: () => ({}),
}));

jest.mock('@clerk/clerk-expo', () => ({
  useAuth: () => ({ getToken: jest.fn().mockResolvedValue('test-token') }),
  useClerk: () => ({ signOut: jest.fn() }),
  useUser: () => ({ user: { id: 'clerk-user-1' } }),
}));

jest.mock(
  '../../../lib/platform-alert' /* gc1-allow: native-boundary — Alert.alert is a no-op in jsdom */,
  () => ({ platformAlert: jest.fn() }),
);

const mockSignOutWithCleanup = jest.fn().mockResolvedValue(undefined);
jest.mock(
  '../../../lib/sign-out' /* gc1-allow: native-boundary — signOutWithCleanup wraps Clerk + SecureStore which cannot run in jest */,
  () => ({
    signOutWithCleanup: (...args: unknown[]) => mockSignOutWithCleanup(...args),
  }),
);

const { ConsentWithdrawnGate } = require('./ConsentWithdrawnGate');

const withdrawnChild: Profile = createTestProfile({
  id: 'profile-child',
  accountId: 'account-family',
  displayName: 'Emma',
  isOwner: false,
  birthYear: 2014,
  consentStatus: 'WITHDRAWN',
});

let active: ReturnType<typeof renderScreen> | null = null;

afterEach(() => {
  if (active) active.cleanup();
  active = null;
  cleanupScreen();
  jest.clearAllMocks();
});

describe('ConsentWithdrawnGate [ACCOUNT-25 child-side]', () => {
  it('renders the deletion-pending gate with the 7-day grace messaging', async () => {
    active = renderScreen(<ConsentWithdrawnGate />, {
      profile: withdrawnChild,
    });

    await screen.findByTestId('consent-withdrawn-gate');
    // Learner-bracket copy (birthYear 2014 → not adult).
    screen.getByText('Your account is being closed');
    screen.getByText(/removed in 7 days/i);
    // It must NOT be the pending/waiting gate.
    expect(screen.queryByTestId('consent-pending-gate')).toBeNull();
  });

  it('"Refresh status" re-checks consent by invalidating consent-status + profiles (restore-recheck path)', async () => {
    active = renderScreen(<ConsentWithdrawnGate />, {
      profile: withdrawnChild,
    });

    const refreshBtn = await screen.findByTestId('withdrawn-refresh-status');
    const invalidateSpy = jest.spyOn(active.queryClient, 'invalidateQueries');

    fireEvent.press(refreshBtn);

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ['consent-status'],
      });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['profiles'] });
    });
  });

  it('exposes a sign-out control from the withdrawn gate', async () => {
    active = renderScreen(<ConsentWithdrawnGate />, {
      profile: withdrawnChild,
    });

    fireEvent.press(await screen.findByTestId('withdrawn-sign-out'));
    await waitFor(() => {
      expect(mockSignOutWithCleanup).toHaveBeenCalled();
    });
  });
});
