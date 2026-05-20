import { renderHook, act } from '@testing-library/react-native';
import {
  createHookWrapper,
  createTestProfile,
} from '../test-utils/app-hook-test-utils';

import { useRatingPrompt } from './use-rating-prompt';

const mockRequestReview = jest.fn().mockResolvedValue(undefined);
const mockIsAvailableAsync = jest.fn().mockResolvedValue(true);

jest.mock('expo-store-review', () => ({
  requestReview: () => mockRequestReview(),
  isAvailableAsync: () => mockIsAvailableAsync(),
}));

// Access the in-memory store seeded by the global expo-secure-store mock in
// test-setup.ts (cleared in that file's beforeEach, so each test starts empty).
function getSecureStore(): Map<string, string> {
  return (
    jest.requireMock('expo-secure-store') as { __store: Map<string, string> }
  ).__store;
}

// Base profile used across all tests (can be mutated per-test then restored).
const baseProfile = createTestProfile({
  id: 'profile-1',
  birthYear: new Date().getFullYear() - 14,
  createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days ago
});

function createWrapper(
  overrides: Parameters<typeof createTestProfile>[0] = {},
) {
  return createHookWrapper({
    activeProfile: createTestProfile({
      id: 'profile-1',
      birthYear: baseProfile.birthYear,
      createdAt: baseProfile.createdAt,
      ...overrides,
    }),
  }).wrapper;
}

beforeEach(() => {
  jest.clearAllMocks();
  // SecureStore map is cleared by test-setup.ts beforeEach; nothing extra needed.
});

describe('useRatingPrompt', () => {
  it('does not prompt when recall count is below threshold', async () => {
    // Only 1 recall
    const { result } = renderHook(() => useRatingPrompt(), {
      wrapper: createWrapper(),
    });
    await act(async () => {
      await result.current.onSuccessfulRecall();
    });

    expect(mockRequestReview).not.toHaveBeenCalled();
  });

  it('prompts after 5 successful recalls', async () => {
    // Pre-set count to 4 (next call will be the 5th)
    getSecureStore().set('rating-recall-success-count-profile-1', '4');

    const { result } = renderHook(() => useRatingPrompt(), {
      wrapper: createWrapper(),
    });
    await act(async () => {
      await result.current.onSuccessfulRecall();
    });

    expect(mockRequestReview).toHaveBeenCalledTimes(1);
  });

  it('does not prompt adult profiles', async () => {
    getSecureStore().set('rating-recall-success-count-profile-1', '10');

    const { result } = renderHook(() => useRatingPrompt(), {
      wrapper: createWrapper({ birthYear: new Date().getFullYear() - 25 }),
    });
    await act(async () => {
      await result.current.onSuccessfulRecall();
    });

    expect(mockRequestReview).not.toHaveBeenCalled();
  });

  it('does not prompt when prompted recently (within 90 days)', async () => {
    getSecureStore().set('rating-recall-success-count-profile-1', '10');
    getSecureStore().set(
      'rating-last-prompt-profile-1',
      new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days ago
    );

    const { result } = renderHook(() => useRatingPrompt(), {
      wrapper: createWrapper(),
    });
    await act(async () => {
      await result.current.onSuccessfulRecall();
    });

    expect(mockRequestReview).not.toHaveBeenCalled();
  });

  // [BREAK / BUG-680] computeAgeBracket(null) silently treats null birthYear
  // as adult (year - null = year -> 'adult'), so the previous code skipped
  // the prompt for the wrong reason. The fix returns early on null birthYear
  // explicitly. We assert the prompt is NOT shown AND the recall count is
  // NOT incremented (the early return must happen before SecureStore writes).
  it('[BREAK / BUG-680] does not prompt or increment count when birthYear is null', async () => {
    getSecureStore().set('rating-recall-success-count-profile-1', '10');

    const { result } = renderHook(() => useRatingPrompt(), {
      wrapper: createHookWrapper({
        activeProfile: {
          ...createTestProfile({ id: 'profile-1' }),
          birthYear: null as unknown as number,
        },
      }).wrapper,
    });
    await act(async () => {
      await result.current.onSuccessfulRecall();
    });

    expect(mockRequestReview).not.toHaveBeenCalled();
    // Recall count must NOT have been bumped -- guard fires before SecureStore.
    expect(getSecureStore().get('rating-recall-success-count-profile-1')).toBe(
      '10',
    );
  });

  it('does not prompt for new profiles (< 7 days old)', async () => {
    getSecureStore().set('rating-recall-success-count-profile-1', '10');

    const { result } = renderHook(() => useRatingPrompt(), {
      wrapper: createWrapper({
        createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(), // 3 days ago
      }),
    });
    await act(async () => {
      await result.current.onSuccessfulRecall();
    });

    expect(mockRequestReview).not.toHaveBeenCalled();
  });
});
