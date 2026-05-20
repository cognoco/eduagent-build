/**
 * Tests for the dev-only `/dev-only/seed-preview-state` route.
 *
 * The route exists only for Maestro E2E builds. It seeds preview onboarding
 * state, triggers lazy TTL cleanup, then returns to the preview intent screen.
 */

import { render, waitFor } from '@testing-library/react-native';

import {
  clearPreviewState,
  getPreviewState,
} from '../../lib/preview-onboarding-state';

const mockUseLocalSearchParams = jest.fn();
const mockReplace = jest.fn();

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockUseLocalSearchParams(),
  useRouter: () => ({ replace: mockReplace }),
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
