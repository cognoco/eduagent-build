import { renderHook, act } from '@testing-library/react-native';

import { useRatingPrompt } from './use-rating-prompt';

const mockRequestReview = jest.fn().mockResolvedValue(undefined);
const mockIsAvailableAsync = jest.fn().mockResolvedValue(true);

jest.mock('expo-store-review', () => ({
  requestReview: () => mockRequestReview(),
  isAvailableAsync: () => mockIsAvailableAsync(),
}));

const secureStore: Record<string, string> = {};

jest.mock('../lib/secure-storage', () => ({
  getItemAsync: jest.fn((key: string) =>
    Promise.resolve(secureStore[key] ?? null)
  ),
  setItemAsync: jest.fn((key: string, value: string) => {
    secureStore[key] = value;
    return Promise.resolve();
  }),
  deleteItemAsync: jest.fn(),
  sanitizeSecureStoreKey: (s: string) => s.replace(/[^a-zA-Z0-9._-]/g, '_'),
}));

const mockProfile = {
  id: 'profile-1',
  birthYear: new Date().getFullYear() - 14,
  createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days ago
};

jest.mock('../lib/profile', () => ({
  useProfile: () => ({ activeProfile: mockProfile }),
}));

beforeEach(() => {
  jest.clearAllMocks();
  Object.keys(secureStore).forEach((k) => delete secureStore[k]);
});

describe('useRatingPrompt', () => {
  it('does not prompt when recall count is below threshold', async () => {
    // Only 1 recall
    const { result } = renderHook(() => useRatingPrompt());
    await act(async () => {
      await result.current.onSuccessfulRecall();
    });

    expect(mockRequestReview).not.toHaveBeenCalled();
  });

  it('prompts after 5 successful recalls', async () => {
    // Pre-set count to 4 (next call will be the 5th)
    secureStore['rating-recall-success-count-profile-1'] = '4';

    const { result } = renderHook(() => useRatingPrompt());
    await act(async () => {
      await result.current.onSuccessfulRecall();
    });

    expect(mockRequestReview).toHaveBeenCalledTimes(1);
  });

  it('does not prompt adult profiles', async () => {
    mockProfile.birthYear = new Date().getFullYear() - 25;
    secureStore['rating-recall-success-count-profile-1'] = '10';

    const { result } = renderHook(() => useRatingPrompt());
    await act(async () => {
      await result.current.onSuccessfulRecall();
    });

    expect(mockRequestReview).not.toHaveBeenCalled();
    mockProfile.birthYear = new Date().getFullYear() - 14; // restore
  });

  it('does not prompt when prompted recently (within 90 days)', async () => {
    secureStore['rating-recall-success-count-profile-1'] = '10';
    secureStore['rating-last-prompt-profile-1'] = new Date(
      Date.now() - 30 * 24 * 60 * 60 * 1000
    ).toISOString(); // 30 days ago

    const { result } = renderHook(() => useRatingPrompt());
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
    const originalBirthYear = mockProfile.birthYear;
    (mockProfile as { birthYear: number | null }).birthYear = null;
    secureStore['rating-recall-success-count-profile-1'] = '10';

    const { result } = renderHook(() => useRatingPrompt());
    await act(async () => {
      await result.current.onSuccessfulRecall();
    });

    expect(mockRequestReview).not.toHaveBeenCalled();
    // Recall count must NOT have been bumped -- guard fires before SecureStore.
    expect(secureStore['rating-recall-success-count-profile-1']).toBe('10');
    mockProfile.birthYear = originalBirthYear;
  });

  it('does not prompt for new profiles (< 7 days old)', async () => {
    mockProfile.createdAt = new Date(
      Date.now() - 3 * 24 * 60 * 60 * 1000
    ).toISOString(); // 3 days ago
    secureStore['rating-recall-success-count-profile-1'] = '10';

    const { result } = renderHook(() => useRatingPrompt());
    await act(async () => {
      await result.current.onSuccessfulRecall();
    });

    expect(mockRequestReview).not.toHaveBeenCalled();
    // restore
    mockProfile.createdAt = new Date(
      Date.now() - 30 * 24 * 60 * 60 * 1000
    ).toISOString();
  });
});
