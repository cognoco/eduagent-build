/**
 * Tests for the dev-only `/dev-only/seed-pending-redirect` route.
 *
 * [CR-2026-05-19-H25] The route must refuse to seed a pending-auth-redirect
 * for unauthenticated callers. In an E2E APK reachable via `adb shell am
 * start`, an unauthenticated actor could otherwise plant an arbitrary path
 * that the next sign-in would replay.
 *
 * [CR-2026-05-21-113] Even for authenticated callers, the `path` param must
 * be validated against an explicit allowlist. A malicious deep link with an
 * out-of-allowlist path must be rejected; the safe default `/(app)/home` must
 * be seeded instead.
 *
 * `IS_E2E_BUILD` (EXPO_PUBLIC_E2E === 'true') is evaluated at module load
 * time, so we set the flag before requiring the screen.
 */

import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import { useAuth, useClerk } from '@clerk/expo';
import { useQueryClient } from '@tanstack/react-query';

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

jest.mock('@tanstack/react-query', () => ({
  ...jest.requireActual('@tanstack/react-query'),
  useQueryClient: jest.fn(),
}));

// Ensure IS_E2E_BUILD === true when the screen module is required below.
process.env.EXPO_PUBLIC_E2E = 'true';

// Require after env is set so the module-level IS_E2E_BUILD const is true.
const SeedPendingRedirectScreen = require('./seed-pending-redirect')
  .default as () => React.ReactElement | null;

describe('SeedPendingRedirectScreen — auth guard [CR-2026-05-19-H25]', () => {
  const mockClerkSignOut = jest.fn().mockResolvedValue(undefined);
  const mockQueryClient = { clear: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    clearPendingAuthRedirect();
    mockUseLocalSearchParams.mockReturnValue({
      path: '/(app)/library',
      staleMs: '0',
    });
    (useClerk as jest.Mock).mockReturnValue({ signOut: mockClerkSignOut });
    (useQueryClient as jest.Mock).mockReturnValue(mockQueryClient);
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

  it('seeds the pending redirect and exposes a deterministic receipt when authenticated', () => {
    (useAuth as jest.Mock).mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
    });

    render(<SeedPendingRedirectScreen />);

    // Authenticated E2E flow: the path is written and remains visible until
    // Maestro explicitly requests the signed-out replay state.
    expect(peekPendingAuthRedirect()).toBe('/(app)/library');
    expect(screen.getByTestId('pending-redirect-seeded')).toBeTruthy();
    expect(screen.getByTestId('pending-redirect-sign-out')).toBeTruthy();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('cleans up the active session, then re-seeds the redirect for the next sign-in', async () => {
    (useAuth as jest.Mock).mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
      userId: 'user-1',
    });
    render(<SeedPendingRedirectScreen />);
    fireEvent.press(screen.getByTestId('pending-redirect-sign-out'));

    await waitFor(() => {
      expect(mockQueryClient.clear).toHaveBeenCalledTimes(1);
      expect(mockClerkSignOut).toHaveBeenCalledTimes(1);
      expect(peekPendingAuthRedirect()).toBe('/(app)/library');
      expect(mockReplace).toHaveBeenCalledWith('/(auth)/sign-in');
    });
  });
});

describe('SeedPendingRedirectScreen — path allowlist [CR-2026-05-21-113]', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearPendingAuthRedirect();
    (useAuth as jest.Mock).mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
    });
    (useClerk as jest.Mock).mockReturnValue({ signOut: jest.fn() });
    (useQueryClient as jest.Mock).mockReturnValue({ clear: jest.fn() });
  });

  afterEach(() => {
    clearPendingAuthRedirect();
  });

  it('accepts an allowlisted path (/(app)/library) and seeds it as-is', () => {
    mockUseLocalSearchParams.mockReturnValue({
      path: '/(app)/library',
      staleMs: '0',
    });

    render(<SeedPendingRedirectScreen />);

    // The allowlisted path must be seeded exactly as provided.
    expect(peekPendingAuthRedirect()).toBe('/(app)/library');
  });

  it('accepts the safe default (/(app)/home) and seeds it as-is', () => {
    mockUseLocalSearchParams.mockReturnValue({
      path: '/(app)/home',
      staleMs: '0',
    });

    render(<SeedPendingRedirectScreen />);

    expect(peekPendingAuthRedirect()).toBe('/(app)/home');
  });

  it('rejects a non-allowlisted path and seeds the safe default instead — break test [CR-2026-05-21-113]', () => {
    // Simulate a malicious deep link targeting a sensitive route.
    mockUseLocalSearchParams.mockReturnValue({
      path: '/(app)/account/billing',
      staleMs: '0',
    });

    render(<SeedPendingRedirectScreen />);

    // The attacker-controlled path must NOT be seeded; the safe default must
    // be used instead.
    expect(peekPendingAuthRedirect()).toBe('/(app)/home');
    expect(peekPendingAuthRedirect()).not.toBe('/(app)/account/billing');
  });

  it('rejects an external-looking value and seeds the safe default instead — break test [CR-2026-05-21-113]', () => {
    mockUseLocalSearchParams.mockReturnValue({
      path: 'https://evil.example.com/steal',
      staleMs: '0',
    });

    render(<SeedPendingRedirectScreen />);

    expect(peekPendingAuthRedirect()).toBe('/(app)/home');
  });
});
