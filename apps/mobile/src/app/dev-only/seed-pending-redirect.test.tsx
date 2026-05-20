/**
 * Tests for the dev-only `/dev-only/seed-pending-redirect` route.
 *
 * [CR-2026-05-19-H25] The route must refuse to seed a pending-auth-redirect
 * for unauthenticated callers. In an E2E APK reachable via `adb shell am
 * start`, an unauthenticated actor could otherwise plant an arbitrary path
 * that the next sign-in would replay.
 *
 * `IS_E2E_BUILD` (NODE_ENV !== 'production' && EXPO_PUBLIC_E2E === 'true')
 * is evaluated at module load time, so we set `EXPO_PUBLIC_E2E=true` before
 * requiring the screen. Jest already pins NODE_ENV to 'test'.
 */

import { render } from '@testing-library/react-native';
import { useAuth } from '@clerk/clerk-expo';

import {
  clearPendingAuthRedirect,
  peekPendingAuthRedirect,
} from '../../lib/pending-auth-redirect';

const mockUseLocalSearchParams = jest.fn();
const mockReplace = jest.fn();

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockUseLocalSearchParams(),
  useRouter: () => ({ replace: mockReplace }),
}));

// Ensure IS_E2E_BUILD === true when the screen module is required below.
process.env.EXPO_PUBLIC_E2E = 'true';

// Require after env is set so the module-level IS_E2E_BUILD const is true.
const SeedPendingRedirectScreen = require('./seed-pending-redirect')
  .default as () => React.ReactElement | null;

describe('SeedPendingRedirectScreen — auth guard [CR-2026-05-19-H25]', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearPendingAuthRedirect();
    mockUseLocalSearchParams.mockReturnValue({
      path: '/(app)/library',
      staleMs: '0',
    });
  });

  afterEach(() => {
    clearPendingAuthRedirect();
  });

  it('does NOT seed and redirects to sign-in when caller is unauthenticated', () => {
    (useAuth as jest.Mock).mockReturnValue({
      isLoaded: true,
      isSignedIn: false,
    });

    render(<SeedPendingRedirectScreen />);

    // The seed must not have written anything to the pending-redirect store.
    expect(peekPendingAuthRedirect()).toBeNull();
    // The user is bounced to sign-in (no dead-end / silent no-op).
    expect(mockReplace).toHaveBeenCalledWith('/(auth)/sign-in');
  });

  it('does NOT seed while Clerk auth is still loading', () => {
    (useAuth as jest.Mock).mockReturnValue({
      isLoaded: false,
      isSignedIn: false,
    });

    render(<SeedPendingRedirectScreen />);

    expect(peekPendingAuthRedirect()).toBeNull();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('seeds the pending redirect and replaces to sign-in when authenticated', () => {
    (useAuth as jest.Mock).mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
    });

    render(<SeedPendingRedirectScreen />);

    // Authenticated E2E flow: the path is written and the screen redirects
    // to sign-in so the next sign-in replays the seeded path.
    expect(peekPendingAuthRedirect()).toBe('/(app)/library');
    expect(mockReplace).toHaveBeenCalledWith('/(auth)/sign-in');
  });
});
