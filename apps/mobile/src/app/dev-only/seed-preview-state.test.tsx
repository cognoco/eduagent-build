/**
 * Tests for the dev-only `/dev-only/seed-preview-state` route.
 *
 * The route exists only for Maestro E2E builds. It seeds preview onboarding
 * state, triggers lazy TTL cleanup, then returns to the preview intent screen.
 */

import { render, screen, waitFor } from '@testing-library/react-native';
import { useAuth } from '@clerk/expo';

import {
  clearPreviewState,
  getPreviewState,
} from '../../lib/preview-onboarding-state';

const mockUseLocalSearchParams = jest.fn();
const mockReplace = jest.fn();

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockUseLocalSearchParams(),
  useRouter: () => ({ replace: mockReplace }),
  // Redirect stub — seed-preview-state renders <Redirect> when not IS_E2E_BUILD.
  // Tests set EXPO_PUBLIC_E2E=true so Redirect is never reached, but the mock
  // must be present so the module resolves without error.
  Redirect: () => null,
}));

const previousE2E = process.env.EXPO_PUBLIC_E2E;
process.env.EXPO_PUBLIC_E2E = 'true';

const SeedPreviewStateScreen = require('./seed-preview-state')
  .default as () => React.ReactElement | null;

describe('SeedPreviewStateScreen', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await clearPreviewState();
    mockUseLocalSearchParams.mockReturnValue({
      intent: 'self',
      path: 'learner_value_prop',
      topicText: 'algebra',
      staleMs: '0',
    });
    // Default to signed-in so the isLoaded/isSignedIn guard in the useEffect
    // doesn't block seeding in tests. Auth-gate behaviour is tested via the
    // security guard in seed-preview-state.tsx itself; not repeated here.
    (useAuth as jest.Mock).mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
    });
  });

  afterEach(async () => {
    await clearPreviewState();
  });

  afterAll(() => {
    if (previousE2E === undefined) {
      delete process.env.EXPO_PUBLIC_E2E;
      return;
    }
    process.env.EXPO_PUBLIC_E2E = previousE2E;
  });

  it('seeds fresh preview state and returns to the preview intent screen', async () => {
    render(<SeedPreviewStateScreen />);

    await waitFor(async () => {
      await expect(getPreviewState()).resolves.toEqual(
        expect.objectContaining({
          intent: 'self',
          path: 'learner_value_prop',
          topicText: 'algebra',
        }),
      );
    });
    expect(mockReplace).toHaveBeenCalledWith('/preview/intent');
  });

  it('deletes expired seeded state before returning to the preview intent screen', async () => {
    mockUseLocalSearchParams.mockReturnValue({
      intent: 'self',
      path: 'learner_value_prop',
      topicText: 'expired algebra',
      staleMs: '3660000',
    });

    render(<SeedPreviewStateScreen />);

    await waitFor(async () => {
      await expect(getPreviewState()).resolves.toBeNull();
    });
    expect(mockReplace).toHaveBeenCalledWith('/preview/intent');
  });

  it('[S4-H1] shows loading spinner (not blank) when Clerk has not yet hydrated', () => {
    (useAuth as jest.Mock).mockReturnValue({
      isLoaded: false,
      isSignedIn: false,
    });

    render(<SeedPreviewStateScreen />);

    // Spinner must be visible so the screen isn't blank while Clerk loads.
    screen.getByTestId('seed-preview-auth-loading');
    // Main content must not render.
    expect(screen.queryByTestId('preview-state-seeded')).toBeNull();
  });

  it('[S4-H1] renders redirect (no blank screen) when loaded but unauthenticated', () => {
    (useAuth as jest.Mock).mockReturnValue({
      isLoaded: true,
      isSignedIn: false,
    });

    render(<SeedPreviewStateScreen />);

    // The Redirect mock renders null — verify the seeded UI does NOT appear,
    // meaning the user is bounced out rather than seeing a dead-end blank screen.
    expect(screen.queryByTestId('preview-state-seeded')).toBeNull();
    expect(screen.queryByTestId('seed-preview-auth-loading')).toBeNull();
  });

  it('falls back to the intent default when the requested path is invalid', async () => {
    mockUseLocalSearchParams.mockReturnValue({
      intent: 'child',
      path: 'not_a_preview_path',
      topicText: 'geometry',
      staleMs: '0',
    });

    render(<SeedPreviewStateScreen />);

    await waitFor(async () => {
      await expect(getPreviewState()).resolves.toEqual(
        expect.objectContaining({
          intent: 'child',
          path: 'parent_value_prop',
          topicText: 'geometry',
        }),
      );
    });
    expect(mockReplace).toHaveBeenCalledWith('/preview/intent');
  });
});
